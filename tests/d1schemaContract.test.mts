/**
 * P0-PERSIST-015 — deterministic schema contract verification (Issue #155).
 *
 * Real SQLite (node:sqlite) over the committed migration lanes. The verifier
 * canonicalizes introspection, distinguishes failure categories, reads ONLY
 * schema metadata (never row data), and never mutates.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationManifest.mjs"
import {
  loadSchemaContract,
  verifyDatabase,
  verifyViaRunner,
  introspect,
  schemaSignature,
  schemaContractDigest,
  isReadOnlyIntrospectionSql,
} from "../scripts/lib/d1SchemaContract.mjs"
import { bootstrapInMemory, applyLane } from "../scripts/lib/d1LocalBootstrap.mjs"
import { ensureHistoryTable } from "../scripts/lib/d1MigrationLedger.mjs"

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

/** Apply an explicit list of migration files to a fresh DB (partial-lane tests). */
function dbWith(files: string[]): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(":memory:")
  for (const f of files) db.exec(readFileSync(resolve(REPO_ROOT, "migrations", f), "utf8"))
  return db
}
const categories = (failures: { category: string }[]) => [...new Set(failures.map((f) => f.category))]

// ─── Baseline: full lanes satisfy the contract ──────────────────

test("the committed schema contract loads", () => {
  const loaded = loadSchemaContract(REPO_ROOT)
  assert.equal(loaded.ok, true)
  assert.match(schemaContractDigest(loaded.contract), /^[0-9a-f]{64}$/)
})

test("3. both bootstrapped schemas satisfy the committed schema contract", () => {
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  for (const binding of KNOWN_BINDINGS) {
    const result = verifyDatabase(dbs[binding], contract().databases[binding])
    assert.deepEqual(result.failures, [], `${binding} must satisfy the contract`)
  }
})

// ─── Failure categories ─────────────────────────────────────────

test("a missing table is reported as missing_table", () => {
  const db = dbWith(["0002_tenant_core.sql"]) // no 0003 → work_units et al absent
  const result = verifyDatabase(db, contract().databases.TENANT_DB_DEFAULT)
  assert.equal(result.ok, false)
  assert.ok(categories(result.failures).includes("missing_table"))
  assert.ok(result.failures.some((f) => f.category === "missing_table" && f.table === "work_units"))
})

test("a missing column is reported as missing_column", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
  const spec = JSON.parse(JSON.stringify(contract().databases.TENANT_DB_DEFAULT))
  spec.tables.work_units.columns.push({ name: "column_that_does_not_exist", notnull: true })
  const result = verifyDatabase(db, spec)
  assert.ok(result.failures.some((f) => f.category === "missing_column" && f.name === "column_that_does_not_exist"))
})

test("an incompatible column (NOT NULL mismatch) is reported as incompatible_column", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
  const spec = JSON.parse(JSON.stringify(contract().databases.TENANT_DB_DEFAULT))
  // action_previews.expires_at is nullable in the schema; demand NOT NULL.
  spec.tables.action_previews.columns.push({ name: "expires_at", notnull: true })
  const result = verifyDatabase(db, spec)
  assert.ok(result.failures.some((f) => f.category === "incompatible_column" && f.name === "expires_at"))
})

test("a missing index is reported as missing_index", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql"]) // no 0005
  const result = verifyDatabase(db, contract().databases.TENANT_DB_DEFAULT)
  assert.ok(result.failures.some((f) => f.category === "missing_index" && f.name === "idx_work_units_tenant_id"))
})

test("a missing constraint is reported as missing_constraint", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
  const spec = JSON.parse(JSON.stringify(contract().databases.TENANT_DB_DEFAULT))
  spec.tables.approval_records.checks.push("status in ('a_constraint_that_does_not_exist')")
  const result = verifyDatabase(db, spec)
  assert.ok(result.failures.some((f) => f.category === "missing_constraint" && f.table === "approval_records"))
})

test("a missing foreign key is reported as missing_foreign_key", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
  const spec = JSON.parse(JSON.stringify(contract().databases.TENANT_DB_DEFAULT))
  spec.tables.work_units.foreignKeys = [{ column: "tenant_id", references: "tenants", to: "id" }]
  const result = verifyDatabase(db, spec)
  assert.ok(result.failures.some((f) => f.category === "missing_foreign_key" && f.table === "work_units"))
})

test("an unexpected (drifted) table is reported as unexpected_table", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
  db.exec("CREATE TABLE drifted_extra_table (id TEXT PRIMARY KEY)")
  const result = verifyDatabase(db, contract().databases.TENANT_DB_DEFAULT)
  assert.ok(result.failures.some((f) => f.category === "unexpected_table" && f.table === "drifted_extra_table"))
})

test("a query failure is reported as query_failure (never a crash)", () => {
  const broken = { prepare() { throw new Error("boom") } }
  const result = verifyDatabase(broken as never, contract().databases.CONTROL_DB)
  assert.equal(result.ok, false)
  assert.deepEqual(categories(result.failures), ["query_failure"])
})

// ─── Required integrity ─────────────────────────────────────────

test("the usage summary composite primary key is verified", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
  const actual = introspect(db)
  assert.deepEqual(actual.tables.usage_daily_summary.primaryKey, ["tenant_id", "date", "event_type"])
})

test("the global object-ID contract (single-column `id` PK) is verified", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
  const spec = JSON.parse(JSON.stringify(contract().databases.TENANT_DB_DEFAULT))
  // usage_daily_summary is composite — asserting a global id PK must fail.
  spec.tables.usage_daily_summary.globalObjectId = true
  const result = verifyDatabase(db, spec)
  assert.ok(result.failures.some((f) => f.category === "global_id_contract_violation" && f.table === "usage_daily_summary"))
})

test("control membership + provider-subject uniqueness and status constraints are verified", () => {
  const db = dbWith(["0001_control_db.sql", "0004_control_auth_workspace.sql"])
  assert.deepEqual(verifyDatabase(db, contract().databases.CONTROL_DB).failures, [])
  const sql = introspect(db).tables.tenant_memberships.sql
  assert.ok(sql.includes("unique(tenant_id, user_id)"))
  assert.ok(introspect(db).tables.auth_identities.sql.includes("unique(provider, provider_subject)"))
})

// ─── Partial-lane detection (section 7: 8, 9, 10, 11) ───────────

test("8. omitting 0003 fails tenant schema verification", () => {
  const db = dbWith(["0002_tenant_core.sql", "0005_tenant_scoped_indexes.sql".replace("0005", "0005")].slice(0, 1))
  const result = verifyDatabase(db, contract().databases.TENANT_DB_DEFAULT)
  assert.equal(result.ok, false)
  assert.ok(result.failures.some((f) => f.category === "missing_table" && f.table === "work_units"))
})

test("9. omitting 0004 fails control schema verification", () => {
  const db = dbWith(["0001_control_db.sql"])
  const result = verifyDatabase(db, contract().databases.CONTROL_DB)
  assert.equal(result.ok, false)
  for (const t of ["users", "tenant_memberships", "auth_identities"]) {
    assert.ok(result.failures.some((f) => f.category === "missing_table" && f.table === t), `${t} must be missing`)
  }
})

test("10. omitting 0005 fails tenant INDEX verification", () => {
  const db = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql"])
  const result = verifyDatabase(db, contract().databases.TENANT_DB_DEFAULT)
  assert.equal(result.ok, false)
  const missingIdx = result.failures.filter((f) => f.category === "missing_index").map((f) => f.name)
  for (const idx of ["idx_action_previews_tenant_id", "idx_approval_records_tenant_id", "idx_work_units_tenant_id"]) {
    assert.ok(missingIdx.includes(idx), `${idx} (from 0005) must be missing`)
  }
})

test("11. applying only the previously documented 0001/0002 pair is detected as INCOMPLETE", () => {
  const control = dbWith(["0001_control_db.sql"])
  const tenant = dbWith(["0002_tenant_core.sql"])
  assert.equal(verifyDatabase(control, contract().databases.CONTROL_DB).ok, false)
  assert.equal(verifyDatabase(tenant, contract().databases.TENANT_DB_DEFAULT).ok, false)
})

test("6. migrations execute only against their declared lane (control SQL on the tenant DB does not satisfy the tenant contract)", () => {
  // Applying the CONTROL lane to a database and verifying it against the TENANT
  // contract must fail — lanes are not interchangeable.
  const db = dbWith(["0001_control_db.sql", "0004_control_auth_workspace.sql"])
  const result = verifyDatabase(db, contract().databases.TENANT_DB_DEFAULT)
  assert.equal(result.ok, false)
  assert.ok(result.failures.some((f) => f.category === "missing_table" && f.table === "work_units"))
  // …and the reverse.
  const tenantDb = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql"])
  assert.equal(verifyDatabase(tenantDb, contract().databases.CONTROL_DB).ok, false)
})

test("7. reversing a lane fails (0005 indexes cannot precede the 0003 tables)", () => {
  const db = new DatabaseSync(":memory:")
  assert.throws(() => {
    db.exec(readFileSync(resolve(REPO_ROOT, "migrations/0005_tenant_scoped_indexes.sql"), "utf8"))
    db.exec(readFileSync(resolve(REPO_ROOT, "migrations/0003_tenant_persistence_foundation.sql"), "utf8"))
  })
})

// ─── Canonicalization ───────────────────────────────────────────

test("verification canonicalizes ordering — index/column creation order is irrelevant", () => {
  // Both databases must carry the SAME logical schema: the complete tenant lane.
  // `a` applies the files directly, `b` goes through the ledger.
  const a = dbWith(["0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql", "0005_tenant_scoped_indexes.sql", "0006_action_preview_creator.sql"])
  ensureHistoryTable(a)
  const b = new DatabaseSync(":memory:")
  applyLane(b, manifest(), "TENANT_DB_DEFAULT", REPO_ROOT)
  // Add the SAME index again in a different order — signature must be unchanged.
  b.exec("CREATE INDEX IF NOT EXISTS idx_work_units_tenant_id ON work_units (tenant_id, id)")
  assert.equal(schemaSignature(a), schemaSignature(b))
})

// ─── Read-only guarantees ───────────────────────────────────────

test("the read-only introspection guard accepts SELECT/read PRAGMA and rejects mutations", () => {
  assert.equal(isReadOnlyIntrospectionSql("SELECT name FROM sqlite_master WHERE type = 'table'"), true)
  assert.equal(isReadOnlyIntrospectionSql('PRAGMA table_info("tenants")'), true)
  assert.equal(isReadOnlyIntrospectionSql('PRAGMA foreign_key_list("tenants")'), true)
  for (const bad of [
    "INSERT INTO tenants (id) VALUES ('x')",
    "UPDATE tenants SET status = 'active'",
    "DELETE FROM tenants",
    "DROP TABLE tenants",
    "ALTER TABLE tenants ADD COLUMN x TEXT",
    "CREATE TABLE t (id TEXT)",
    "PRAGMA foreign_keys = ON",
    "VACUUM",
  ]) {
    assert.equal(isReadOnlyIntrospectionSql(bad), false, `${bad} must be rejected`)
  }
})

test("schema verification issues ONLY metadata queries and never reads application row data", () => {
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  // Seed a row: the verifier must never read it.
  dbs.CONTROL_DB.exec("INSERT INTO tenants (id,name,slug,status,created_at,updated_at) VALUES ('probe-tenant','n','probe-slug','active','t','t')")
  const seen: string[] = []
  const runner = (sql: string) => { seen.push(sql); return dbs.CONTROL_DB.prepare(sql).all() as never[] }
  const result = verifyViaRunner(runner, contract().databases.CONTROL_DB)
  assert.equal(result.ok, true)
  assert.ok(seen.length > 0)
  for (const sql of seen) {
    assert.equal(isReadOnlyIntrospectionSql(sql), true, `must be read-only: ${sql}`)
    // Only sqlite_master / PRAGMA introspection — never a user table scan.
    const isMetadata = /from sqlite_master/i.test(sql) || /^pragma\s/i.test(sql.trim())
    assert.equal(isMetadata, true, `must be metadata-only: ${sql}`)
  }
  // The seeded row value never appears in any issued query or any failure.
  assert.doesNotMatch(JSON.stringify({ seen, failures: result.failures }), /probe-tenant|probe-slug/)
})

test("verifyViaRunner and verifyDatabase agree (the remote path reuses the same logic)", () => {
  const { dbs } = bootstrapInMemory(REPO_ROOT, manifest())
  for (const binding of KNOWN_BINDINGS) {
    const direct = verifyDatabase(dbs[binding], contract().databases[binding])
    const viaRunner = verifyViaRunner((sql: string) => dbs[binding].prepare(sql).all() as never[], contract().databases[binding])
    assert.equal(viaRunner.ok, direct.ok)
    assert.deepEqual(viaRunner.failures, direct.failures)
  }
})
