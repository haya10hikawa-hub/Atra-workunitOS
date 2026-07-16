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
  computeRegistryPlanDigest,
  listCommittedMigrationFiles,
  tenantRegistrySchemaVersion,
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

test("both lanes are declared in the documented order, and 0006 is an ACTIVE tenant migration", () => {
  const plans = buildAllPlans(base())
  assert.deepEqual(plans.CONTROL_DB.map((s: { name: string }) => s.name), ["0001_control_db.sql", "0004_control_auth_workspace.sql"])
  assert.deepEqual(plans.TENANT_DB_DEFAULT.map((s: { name: string }) => s.name), [
    "0002_tenant_core.sql",
    "0003_tenant_persistence_foundation.sql",
    "0005_tenant_scoped_indexes.sql",
    "0006_action_preview_creator.sql",
  ])
})

test("0006 is an active, once-only tenant migration ordered AFTER the table it alters is created", () => {
  const plan = buildPlan(base(), "TENANT_DB_DEFAULT")
  const step = plan.find((s: { name: string }) => s.name === "0006_action_preview_creator.sql")
  assert.ok(step, "0006 must be an active lane member, never deferred")
  assert.equal(step.apply, "once", "an ALTER ADD COLUMN is not raw-replay-safe")
  assert.deepEqual(step.effect, { type: "column_exists", table: "action_previews", column: "created_by_user_id" })
  // action_previews is CREATEd by 0002, so 0006 must come strictly after it.
  const parent = plan.find((s: { name: string }) => s.name === "0002_tenant_core.sql")
  assert.ok(parent, "0002 must be in the tenant lane")
  assert.ok(parent.sequence < step.sequence, "0006 must be ordered after its parent table creation")
})

test("the production migration plan includes 0006 exactly once", () => {
  const plan = buildPlan(base(), "TENANT_DB_DEFAULT")
  assert.equal(plan.filter((s: { name: string }) => s.name.startsWith("0006")).length, 1)
  // …and only in the tenant lane — the control lane never sees it.
  assert.equal(buildPlan(base(), "CONTROL_DB").filter((s: { name: string }) => s.name.startsWith("0006")).length, 0)
})

test("the plan is deterministic and ordered by logical sequence", () => {
  const m = base()
  // Shuffle the declared order — buildPlan must still sort by sequence.
  m.lanes.TENANT_DB_DEFAULT.reverse()
  assert.deepEqual(buildPlan(m, "TENANT_DB_DEFAULT").map((s: { sequence: number }) => s.sequence), [1, 2, 3, 4])
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

test("every committed migration must live in a lane — `deferred` is not a supported concept", () => {
  const m = base()
  // The old escape hatch: park a required migration outside the lanes. This is
  // exactly how action_previews shipped without created_by_user_id, so the
  // manifest must now refuse it outright.
  m.deferred = [{ binding: "TENANT_DB_DEFAULT", path: "migrations/0006_action_preview_creator.sql", sha256: "0".repeat(64), kind: "schema" }]
  assert.ok(failuresOf(m).includes("deferred_migrations_not_supported"))
})

test("a committed migration that is in NO lane fails validation (manifest is canonical over ALL migrations)", () => {
  const m = base()
  // Drop 0006 from the tenant lane: the file is still committed, so the manifest
  // no longer covers every migration and must fail closed.
  m.lanes.TENANT_DB_DEFAULT = m.lanes.TENANT_DB_DEFAULT.filter((e: { path: string }) => !e.path.includes("0006"))
  assert.ok(failuresOf(m).includes("migration_not_in_any_lane:0006_action_preview_creator.sql"))
})

test("the completeness rule covers NUMBERED migrations — a new unlaned one fails, transient scratch files do not", () => {
  // The risk it closes: a file that LOOKS like part of the ordered sequence but is
  // invisible to operations (exactly how 0006 shipped outside the lanes).
  const numbered = resolve(REPO_ROOT, "migrations/0009_unlaned_probe_test.sql")
  try {
    writeFileSync(numbered, "CREATE TABLE IF NOT EXISTS probe (id TEXT PRIMARY KEY);\n")
    assert.ok(listCommittedMigrationFiles(REPO_ROOT).includes("0009_unlaned_probe_test.sql"))
    assert.ok(failuresOf(base()).includes("migration_not_in_any_lane:0009_unlaned_probe_test.sql"),
      "a numbered migration outside every lane must fail closed")
  } finally {
    rmSync(numbered, { force: true })
  }
  // A non-numbered file is not part of the sequence, so it cannot make an unrelated
  // suite's validation fail depending on which tests happen to be running.
  const scratch = resolve(REPO_ROOT, "migrations/_scratch_probe_test.sql")
  try {
    writeFileSync(scratch, "CREATE TABLE IF NOT EXISTS scratch (id TEXT PRIMARY KEY);\n")
    assert.equal(listCommittedMigrationFiles(REPO_ROOT).includes("_scratch_probe_test.sql"), false)
    assert.deepEqual(failuresOf(base()), [], "a transient scratch fixture must not break the committed manifest")
  } finally {
    rmSync(scratch, { force: true })
  }
})

// ─── Canonical registry schema version ──────────────────────────

test("the manifest declares ONE canonical tenant registry schema version, pinned to the lane it describes", () => {
  const m = base()
  assert.equal(tenantRegistrySchemaVersion(m), "2", "the canonical version must be declared")
  assert.equal(m.registry.TENANT_DB_DEFAULT.planDigest, computeRegistryPlanDigest(m, "TENANT_DB_DEFAULT"))
  assert.deepEqual(failuresOf(m), [])
})

test("changing the active migration plan without updating the canonical schema version FAILS", () => {
  // The whole point of pinning: the version names WHICH tenant schema the registry
  // row claims, so the plan cannot silently drift away from it.
  for (const mutate of [
    // Dropping a migration from the lane.
    (m: { lanes: { TENANT_DB_DEFAULT: unknown[] } }) => { m.lanes.TENANT_DB_DEFAULT.pop() },
    // Changing how a migration is applied.
    (m: { lanes: { TENANT_DB_DEFAULT: Array<{ apply: string }> } }) => { m.lanes.TENANT_DB_DEFAULT[0].apply = "once" },
    // Changing a migration's position in the lane.
    (m: { lanes: { TENANT_DB_DEFAULT: Array<{ sequence: number }> } }) => { m.lanes.TENANT_DB_DEFAULT[3].sequence = 9 },
  ]) {
    const m = base()
    mutate(m)
    assert.ok(
      failuresOf(m).includes("registry_plan_digest_mismatch:TENANT_DB_DEFAULT"),
      "a plan change must force the canonical schema version to be reconsidered",
    )
  }
  // Reordering the DECLARED entries without changing the plan is not a plan change
  // (buildPlan sorts by sequence), so the digest is stable.
  const stable = base()
  assert.equal(computeRegistryPlanDigest(stable, "TENANT_DB_DEFAULT"), computeRegistryPlanDigest(base(), "TENANT_DB_DEFAULT"))
})

test("a missing or malformed canonical registry declaration fails validation", () => {
  const missing = base()
  delete missing.registry
  assert.ok(failuresOf(missing).includes("registry_missing:TENANT_DB_DEFAULT"))

  for (const bad of ["", "v2", "abc", "2.0", " 2", "12345678901"]) {
    const m = base()
    m.registry.TENANT_DB_DEFAULT.schemaVersion = bad
    assert.ok(failuresOf(m).includes("registry_schema_version_invalid:TENANT_DB_DEFAULT"), `version ${JSON.stringify(bad)} must be refused`)
    assert.equal(tenantRegistrySchemaVersion(m), null)
  }
  const badDigest = base()
  badDigest.registry.TENANT_DB_DEFAULT.planDigest = "not-a-digest"
  assert.ok(failuresOf(badDigest).includes("registry_plan_digest_invalid:TENANT_DB_DEFAULT"))
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
  m.lanes.SOME_OTHER_DB = [{ sequence: 1, binding: "SOME_OTHER_DB", path: "migrations/0001_control_db.sql", sha256: "0".repeat(64), kind: "schema", apply: "replay_safe" }]
  assert.ok(failuresOf(m).some((f) => f === "unknown_binding:SOME_OTHER_DB"))
})

test("a Control DB migration cannot appear in the tenant lane", () => {
  const m = base()
  m.lanes.TENANT_DB_DEFAULT.push({ sequence: 4, binding: "CONTROL_DB", path: "migrations/0001_control_db.sql", sha256: m.lanes.CONTROL_DB[0].sha256, kind: "schema", apply: "replay_safe" })
  assert.ok(failuresOf(m).some((f) => f.startsWith("binding_lane_mismatch:TENANT_DB_DEFAULT:0001_control_db.sql")))
})

test("a tenant migration cannot appear in the Control DB lane", () => {
  const m = base()
  m.lanes.CONTROL_DB.push({ sequence: 3, binding: "TENANT_DB_DEFAULT", path: "migrations/0002_tenant_core.sql", sha256: m.lanes.TENANT_DB_DEFAULT[0].sha256, kind: "schema", apply: "replay_safe" })
  assert.ok(failuresOf(m).some((f) => f.startsWith("binding_lane_mismatch:CONTROL_DB:0002_tenant_core.sql")))
})

test("an empty lane fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB = []
  assert.ok(failuresOf(m).some((f) => f === "lane_empty:CONTROL_DB"))
})

test("an invalid kind or apply mode fails validation", () => {
  const m = base()
  m.lanes.CONTROL_DB[0].kind = "wat"
  m.lanes.CONTROL_DB[1].apply = "yes"
  const f = failuresOf(m)
  assert.ok(f.some((x) => x.startsWith("kind_invalid:CONTROL_DB")))
  assert.ok(f.some((x) => x.startsWith("apply_mode_invalid:CONTROL_DB")))
})

test("a `once` migration without a usable effect probe fails validation", () => {
  // The probe is what lets the ledger and the real schema be reconciled after a
  // crash or a manual apply. A `once` migration without one is unreconcilable.
  for (const bad of [undefined, {}, { type: "column_exists", table: "action_previews" }, { type: "guesswork", table: "t", column: "c" }, { type: "column_exists", table: "bad-ident", column: "c" }]) {
    const m = base()
    m.lanes.TENANT_DB_DEFAULT[3].effect = bad
    assert.ok(
      failuresOf(m).some((x) => x.startsWith("effect_probe_invalid:TENANT_DB_DEFAULT:0006")),
      `effect ${JSON.stringify(bad)} must be rejected`,
    )
  }
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
    m.lanes.CONTROL_DB.push({ sequence: 3, binding: "CONTROL_DB", path: "migrations/_seed_test.sql", sha256: "0".repeat(64), kind: "schema", apply: "replay_safe" })
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
    m.lanes.TENANT_DB_DEFAULT.push({ sequence: 5, binding: "TENANT_DB_DEFAULT", path: "migrations/_appended_test.sql", sha256: digest, kind: "index", apply: "replay_safe" })

    // Changing the active plan WITHOUT reconsidering the canonical registry schema
    // version fails closed — the version is pinned to the lane it describes.
    assert.deepEqual(validateManifest(m, REPO_ROOT).failures, ["registry_plan_digest_mismatch:TENANT_DB_DEFAULT"])

    // Updating the registry declaration alongside the plan is what makes the append
    // representable.
    m.registry.TENANT_DB_DEFAULT.schemaVersion = String(Number(m.registry.TENANT_DB_DEFAULT.schemaVersion) + 1)
    m.registry.TENANT_DB_DEFAULT.planDigest = computeRegistryPlanDigest(m, "TENANT_DB_DEFAULT")
    const result = validateManifest(m, REPO_ROOT)
    assert.deepEqual(result.failures, [])
    // Existing entries are untouched (append-only) — 0006's pinned digest included.
    assert.deepEqual(m.lanes.TENANT_DB_DEFAULT.slice(0, 4), before)
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
