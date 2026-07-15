/**
 * P0-PERSIST-015 — canonical migration manifest validation (Issue #155).
 *
 * The manifest is the SINGLE source of truth for which migration runs, in which
 * lane, in which order, with which pinned digest. Existing SQL is immutable;
 * changes are append-only. Validation failures are safe categories only.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { writeFileSync, rmSync, symlinkSync, existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  loadManifest,
  validateManifest,
  buildPlan,
  buildAllPlans,
  scanMigrationSqlSafety,
  manifestDigest,
  resolveMigrationPath,
  KNOWN_BINDINGS,
} from "../scripts/lib/d1MigrationManifest.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
/** The committed manifest, failing loudly (never `undefined`) if unreadable. */
function loadedManifest() {
  const result = loadManifest(REPO_ROOT)
  if (!result.ok) throw new Error(`manifest unreadable: ${result.error}`)
  return result.manifest
}
// A deep clone so a variant never mutates the committed manifest.
const base = () => JSON.parse(JSON.stringify(loadedManifest()))
const failuresOf = (m: unknown) => validateManifest(m, REPO_ROOT).failures as string[]

// ─── Baseline ───────────────────────────────────────────────────

test("the committed manifest loads and fully validates", () => {
  assert.equal(loadManifest(REPO_ROOT).ok, true)
  const result = validateManifest(loadedManifest(), REPO_ROOT)
  assert.deepEqual(result.failures, [])
  assert.equal(result.ok, true)
})

test("both lanes are declared in the documented order", () => {
  const plans = buildAllPlans(base())
  assert.deepEqual(plans.CONTROL_DB.map((s: { name: string }) => s.name), ["0001_control_db.sql", "0004_control_auth_workspace.sql"])
  assert.deepEqual(plans.TENANT_DB_DEFAULT.map((s: { name: string }) => s.name), [
    "0002_tenant_core.sql",
    "0003_tenant_persistence_foundation.sql",
    "0005_tenant_scoped_indexes.sql",
  ])
})

test("the plan is deterministic and ordered by logical sequence", () => {
  const m = base()
  // Shuffle the declared order — buildPlan must still sort by sequence.
  m.lanes.TENANT_DB_DEFAULT.reverse()
  assert.deepEqual(buildPlan(m, "TENANT_DB_DEFAULT").map((s: { sequence: number }) => s.sequence), [1, 2, 3])
})

// ─── Digest immutability ────────────────────────────────────────

test("a changed pinned digest fails validation", () => {
  const m = base()
  m.lanes.TENANT_DB_DEFAULT[1].sha256 = "0".repeat(64)
  assert.ok(failuresOf(m).some((f) => f.startsWith("digest_mismatch:TENANT_DB_DEFAULT:0003_tenant_persistence_foundation.sql")))
})

test("a malformed digest fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB[0].sha256 = "not-a-digest"
  assert.ok(failuresOf(m).some((f) => f.startsWith("digest_format_invalid:CONTROL_DB")))
})

test("a deferred migration digest is pinned too (manifest is canonical over ALL migrations)", () => {
  const m = base()
  m.deferred[0].sha256 = "0".repeat(64)
  assert.ok(failuresOf(m).some((f) => f.startsWith("digest_mismatch:deferred:0006_action_preview_creator.sql")))
})

// ─── Structural rules ───────────────────────────────────────────

test("a missing migration file fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB[0].path = "migrations/9999_does_not_exist.sql"
  assert.ok(failuresOf(m).some((f) => f.startsWith("migration_file_missing:CONTROL_DB")))
})

test("duplicate paths fail validation", () => {
  const m = base()
  m.lanes.TENANT_DB_DEFAULT.push({ ...m.lanes.TENANT_DB_DEFAULT[0], sequence: 9 })
  assert.ok(failuresOf(m).some((f) => f.startsWith("duplicate_path:0002_tenant_core.sql")))
})

test("duplicate lane sequences fail validation", () => {
  const m = base()
  m.lanes.CONTROL_DB[1].sequence = 1
  assert.ok(failuresOf(m).some((f) => f === "duplicate_sequence:CONTROL_DB:1"))
})

test("an unknown binding fails validation", () => {
  const m = base()
  m.lanes.SOME_OTHER_DB = [{ sequence: 1, binding: "SOME_OTHER_DB", path: "migrations/0001_control_db.sql", sha256: "0".repeat(64), kind: "schema", idempotent: true }]
  assert.ok(failuresOf(m).some((f) => f === "unknown_binding:SOME_OTHER_DB"))
})

test("a Control DB migration cannot appear in the tenant lane", () => {
  const m = base()
  m.lanes.TENANT_DB_DEFAULT.push({ sequence: 4, binding: "CONTROL_DB", path: "migrations/0001_control_db.sql", sha256: m.lanes.CONTROL_DB[0].sha256, kind: "schema", idempotent: true })
  assert.ok(failuresOf(m).some((f) => f.startsWith("binding_lane_mismatch:TENANT_DB_DEFAULT:0001_control_db.sql")))
})

test("a tenant migration cannot appear in the Control DB lane", () => {
  const m = base()
  m.lanes.CONTROL_DB.push({ sequence: 3, binding: "TENANT_DB_DEFAULT", path: "migrations/0002_tenant_core.sql", sha256: m.lanes.TENANT_DB_DEFAULT[0].sha256, kind: "schema", idempotent: true })
  assert.ok(failuresOf(m).some((f) => f.startsWith("binding_lane_mismatch:CONTROL_DB:0002_tenant_core.sql")))
})

test("an empty lane fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB = []
  assert.ok(failuresOf(m).some((f) => f === "lane_empty:CONTROL_DB"))
})

test("an invalid kind or idempotent flag fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB[0].kind = "wat"
  m.lanes.CONTROL_DB[1].idempotent = "yes"
  const f = failuresOf(m)
  assert.ok(f.some((x) => x.startsWith("kind_invalid:CONTROL_DB")))
  assert.ok(f.some((x) => x.startsWith("idempotent_flag_invalid:CONTROL_DB")))
})

// ─── Path safety ────────────────────────────────────────────────

test("an absolute migration path fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB[0].path = "/etc/passwd"
  assert.ok(failuresOf(m).some((f) => f.startsWith("path_absolute:CONTROL_DB")))
})

test("a traversal migration path fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB[0].path = "migrations/../../etc/passwd"
  assert.ok(failuresOf(m).some((f) => f.startsWith("path_traversal:CONTROL_DB")))
})

test("a path outside migrations/ fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB[0].path = "scripts/lib/cfDeployConfig.mjs"
  assert.ok(failuresOf(m).some((f) => f.startsWith("path_outside_migrations_dir:CONTROL_DB")))
})

test("a symlink that escapes the repository fails validation", () => {
  const link = resolve(REPO_ROOT, "migrations/_escape_test.sql")
  try {
    if (existsSync(link)) rmSync(link, { force: true })
    symlinkSync("/etc/hosts", link)
    const res = resolveMigrationPath(REPO_ROOT, "migrations/_escape_test.sql")
    assert.equal(res.ok, false)
    assert.equal(res.failure, "path_symlink_escape")
    const m = base()
    m.lanes.CONTROL_DB[0].path = "migrations/_escape_test.sql"
    assert.ok(failuresOf(m).some((f) => f.startsWith("path_symlink_escape:CONTROL_DB")))
  } finally {
    rmSync(link, { force: true })
  }
})

// ─── Disclosure safety ──────────────────────────────────────────

test("validation failures contain only safe path/category info — never database IDs", () => {
  const m = base()
  m.lanes.CONTROL_DB[0].sha256 = "0".repeat(64)
  m.lanes.TENANT_DB_DEFAULT[0].path = "/etc/passwd"
  const serialized = JSON.stringify(failuresOf(m))
  // No UUID-shaped database id, no SQL, no absolute host paths.
  assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  assert.doesNotMatch(serialized, /CREATE TABLE/i)
  assert.doesNotMatch(serialized, /\/etc\/passwd/)
  // Only safe basenames + categories.
  assert.match(serialized, /digest_mismatch:CONTROL_DB:0001_control_db\.sql/)
})

// ─── SQL safety: migrations never seed data ─────────────────────

test("no migration inserts a default tenant, user, identity, membership, API key, or credential", () => {
  const result = scanMigrationSqlSafety(REPO_ROOT, base())
  assert.deepEqual(result.failures, [])
  assert.equal(result.ok, true)
})

test("a migration containing an INSERT is rejected by the SQL-safety scan", () => {
  const seeded = resolve(REPO_ROOT, "migrations/_seed_test.sql")
  try {
    writeFileSync(seeded, "CREATE TABLE IF NOT EXISTS t (id TEXT PRIMARY KEY);\nINSERT INTO t (id) VALUES ('default-tenant');\n")
    const m = base()
    m.lanes.CONTROL_DB.push({ sequence: 3, binding: "CONTROL_DB", path: "migrations/_seed_test.sql", sha256: "0".repeat(64), kind: "schema", idempotent: true })
    const result = scanMigrationSqlSafety(REPO_ROOT, m)
    assert.ok(result.failures.some((f: string) => f === "forbidden_sql_insert:_seed_test.sql"))
  } finally {
    rmSync(seeded, { force: true })
  }
})

// ─── Append-only ────────────────────────────────────────────────

test("a newly appended valid migration is representable without rewriting old entries", () => {
  const appended = resolve(REPO_ROOT, "migrations/_appended_test.sql")
  try {
    writeFileSync(appended, "CREATE INDEX IF NOT EXISTS idx_appended_probe ON work_units (tenant_id, status);\n")
    const digest = createHash("sha256").update(readFileSync(appended)).digest("hex")
    const m = base()
    const before = JSON.parse(JSON.stringify(m.lanes.TENANT_DB_DEFAULT))
    m.lanes.TENANT_DB_DEFAULT.push({ sequence: 4, binding: "TENANT_DB_DEFAULT", path: "migrations/_appended_test.sql", sha256: digest, kind: "index", idempotent: true })
    const result = validateManifest(m, REPO_ROOT)
    assert.deepEqual(result.failures, [])
    // Existing entries are untouched (append-only).
    assert.deepEqual(m.lanes.TENANT_DB_DEFAULT.slice(0, 3), before)
  } finally {
    rmSync(appended, { force: true })
  }
})

// ─── Digest of the manifest itself ──────────────────────────────

test("the manifest digest is stable and changes when a pinned digest changes", () => {
  const a = manifestDigest(base())
  assert.match(a, /^[0-9a-f]{64}$/)
  const m = base()
  m.lanes.CONTROL_DB[0].sha256 = "1".repeat(64)
  assert.notEqual(manifestDigest(m), a)
})

test("KNOWN_BINDINGS is exactly the approved pair", () => {
  assert.deepEqual([...KNOWN_BINDINGS].sort(), ["CONTROL_DB", "TENANT_DB_DEFAULT"])
})
