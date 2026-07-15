/**
 * P0-PERSIST-015 — clean bootstrap + idempotence proof (Issue #155).
 *
 * Real SQLite (node:sqlite) over the committed migration lanes, in ISOLATED
 * temporary state. Proves an empty database can apply its complete lane, that a
 * second application succeeds, and that the schema signature is unchanged.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, buildPlan, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationManifest.mjs"
import { loadSchemaContract, verifyDatabase, schemaSignature } from "../scripts/lib/d1SchemaContract.mjs"
import { applyLane, bootstrapInMemory, withTemporaryBootstrap } from "../scripts/lib/d1LocalBootstrap.mjs"
import { LOCAL_FIXTURE, assertLocalFixtureOnly, seedLocalControlFixture } from "../scripts/lib/d1BootstrapFixture.mjs"
import { runBootstrapLocal } from "../scripts/cf-d1-bootstrap-local.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
function manifest() {
  const r = loadManifest(REPO_ROOT)
  if (!r.ok) throw new Error(`manifest unreadable: ${r.error}`)
  return r.manifest
}
function contract() {
  const r = loadSchemaContract(REPO_ROOT)
  if (!r.ok) throw new Error(`schema contract unreadable: ${r.error}`)
  return r.contract
}
/** Typed single-row read (node:sqlite returns `unknown`). */
const one = <T,>(db: InstanceType<typeof DatabaseSync>, sql: string, ...p: unknown[]): T => db.prepare(sql).get(...p) as T
/** Typed multi-row read. */
const many = <T,>(db: InstanceType<typeof DatabaseSync>, sql: string, ...p: unknown[]): T[] => db.prepare(sql).all(...p) as T[]

// ─── 1 + 2. an empty database applies its complete lane ─────────

for (const binding of ["CONTROL_DB", "TENANT_DB_DEFAULT"] as const) {
  test(`1/2. an EMPTY ${binding} applies its complete lane from scratch`, () => {
    const db = new DatabaseSync(":memory:")
    // Empty to start.
    assert.equal(one<{ c: number }>(db, "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'").c, 0)
    const applied = applyLane(db, manifest(), binding, REPO_ROOT)
    assert.deepEqual(applied, buildPlan(manifest(), binding).map((s) => s.name))
    assert.deepEqual(verifyDatabase(db, contract().databases[binding]).failures, [])
  })
}

// ─── 4 + 5. idempotence ─────────────────────────────────────────

test("4. applying the same complete lane a SECOND time succeeds", () => {
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  for (const binding of KNOWN_BINDINGS) {
    assert.doesNotThrow(() => applyLane(dbs[binding], manifest(), binding, REPO_ROOT))
  }
})

test("5. schema signatures are EQUIVALENT before and after the second application", () => {
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  for (const binding of KNOWN_BINDINGS) {
    const before = schemaSignature(dbs[binding])
    applyLane(dbs[binding], manifest(), binding, REPO_ROOT)
    const after = schemaSignature(dbs[binding])
    assert.equal(after, before, `${binding} schema signature must not change on re-application`)
    // Still contract-valid after the second application.
    assert.deepEqual(verifyDatabase(dbs[binding], contract().databases[binding]).failures, [])
  }
})

test("every lane migration is declared idempotent (only CREATE ... IF NOT EXISTS)", () => {
  for (const binding of KNOWN_BINDINGS) {
    for (const step of buildPlan(manifest(), binding)) {
      assert.equal(step.idempotent, true, `${step.name} must be idempotent to live in a re-runnable lane`)
    }
  }
})

test("the DEFERRED 0006 is correctly flagged non-idempotent (applying it twice fails)", () => {
  // This is exactly why 0006 is NOT in an idempotent bootstrap lane: SQLite has no
  // `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
  const deferred = (manifest().deferred ?? []).find((e) => e.path.includes("0006"))
  if (!deferred) throw new Error("the manifest must pin the deferred 0006 migration")
  assert.equal(deferred.idempotent, false)
  const db = new DatabaseSync(":memory:")
  applyLane(db, manifest(), "TENANT_DB_DEFAULT", REPO_ROOT)
  const sql = readFileSync(resolve(REPO_ROOT, deferred.path), "utf8")
  db.exec(sql) // first application succeeds
  assert.throws(() => db.exec(sql), /duplicate column/i)
})

// ─── 14. migrations never seed rows ─────────────────────────────

test("14. a freshly migrated database contains NO rows (no default tenant/user/identity/credential)", () => {
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  for (const binding of KNOWN_BINDINGS) {
    const tables = many<{ name: string }>(dbs[binding], "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    assert.ok(tables.length > 0)
    for (const t of tables) {
      const count = one<{ c: number }>(dbs[binding], `SELECT COUNT(*) AS c FROM "${t.name}"`).c
      assert.equal(count, 0, `${binding}.${t.name} must be empty after migration`)
    }
  }
})

// ─── Isolated temporary state ───────────────────────────────────

test("withTemporaryBootstrap isolates state in a temp dir and DELETES it afterwards", () => {
  let captured = ""
  const out = withTemporaryBootstrap(REPO_ROOT, manifest(), ({ dbs, dir }) => {
    captured = dir
    assert.ok(existsSync(dir))
    // Real, isolated sqlite files — not the developer's .wrangler state.
    assert.doesNotMatch(dir, /\.wrangler/)
    for (const binding of KNOWN_BINDINGS) assert.deepEqual(verifyDatabase(dbs[binding], contract().databases[binding]).failures, [])
    return "done"
  })
  assert.equal(out, "done")
  assert.equal(existsSync(captured), false, "temporary bootstrap state must be deleted")
})

// ─── The bootstrap command result ───────────────────────────────

test("cf:d1:bootstrap:local reports a clean bootstrap, idempotence, and a seeded fixture", () => {
  const result = runBootstrapLocal(REPO_ROOT, { seed: true })
  assert.equal(result.ok, true)
  assert.equal(result.idempotent, true)
  assert.equal(result.seedRowCount, 1)
  for (const binding of KNOWN_BINDINGS) assert.equal(result.verify[binding].ok, true)
  assert.deepEqual(result.applied.CONTROL_DB, ["0001_control_db.sql", "0004_control_auth_workspace.sql"])
  assert.deepEqual(result.applied.TENANT_DB_DEFAULT, ["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
})

// ─── Local fixture ──────────────────────────────────────────────

test("the local fixture values are unmistakably local/test-only", () => {
  const guard = assertLocalFixtureOnly()
  assert.deepEqual(guard.problems, [])
  assert.match(LOCAL_FIXTURE.user.email, /\.invalid$/)
  assert.match(LOCAL_FIXTURE.tenant.id, /^local-/)
  // The synthetic fixture database id is reserved/all-zero-prefixed, never a real id.
  assert.match(LOCAL_FIXTURE.tenantDatabase.database_id, /^00000000-0000-4000-8000-/)
})

test("a non-local fixture is REFUSED (production identity data can never be seeded)", () => {
  const hostile = JSON.parse(JSON.stringify(LOCAL_FIXTURE))
  hostile.tenant.id = "acme-production"
  hostile.user.email = "real.user@example.com"
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  assert.throws(() => seedLocalControlFixture(dbs.CONTROL_DB, hostile), /refusing to seed non-local fixture/)
})

test("repeated local seeding is idempotent and never partially corrupts", () => {
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  seedLocalControlFixture(dbs.CONTROL_DB)
  seedLocalControlFixture(dbs.CONTROL_DB)
  seedLocalControlFixture(dbs.CONTROL_DB)
  for (const [table, expected] of [["tenants", 1], ["tenant_databases", 1], ["users", 1], ["tenant_memberships", 1], ["auth_identities", 1]] as const) {
    assert.equal(one<{ c: number }>(dbs.CONTROL_DB, `SELECT COUNT(*) AS c FROM "${table}"`).c, expected, `${table} must have exactly ${expected} row`)
  }
})

test("the fixture seeds a COMPLETE active registry record (resolver-ready)", () => {
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  seedLocalControlFixture(dbs.CONTROL_DB)
  const row = one<{ database_name: string; database_id: string; schema_version: string; status: string }>(
    dbs.CONTROL_DB, "SELECT tenant_id, database_name, database_id, schema_version, status FROM tenant_databases WHERE tenant_id = ?", LOCAL_FIXTURE.tenant.id)
  assert.equal(row.status, "active")
  assert.ok(String(row.database_name).length > 0)
  assert.match(String(row.database_id), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  assert.match(String(row.schema_version), /^[0-9]+$/)
  assert.equal(one<{ status: string }>(dbs.CONTROL_DB, "SELECT status FROM tenants WHERE id = ?", LOCAL_FIXTURE.tenant.id).status, "active")
  assert.equal(one<{ status: string }>(dbs.CONTROL_DB, "SELECT status FROM tenant_memberships WHERE id = ?", LOCAL_FIXTURE.membership.id).status, "active")
})
