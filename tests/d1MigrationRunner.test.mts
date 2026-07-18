/**
 * D1 Migration Runner + environment-gate tests (P0-FIX-D1-OPERATIONAL-CONTRACT).
 *
 * Exercises the reproducible runner (plan / apply / verify) against a REAL
 * node:sqlite database and the local-vs-staging invocation gate. No network, no
 * remote D1, no secrets.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, cpSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  planAll,
  applyAll,
  verifyAll,
  parseMigrateArgs,
  validateInvocation,
  KNOWN_BINDINGS,
} from "../scripts/lib/d1MigrationRunner.mjs"
import { loadManifest } from "../scripts/lib/d1MigrationManifest.mjs"
import type { Manifest } from "../scripts/lib/d1MigrationManifest.mjs"
import { reconcileLane, applyLaneWithLedger } from "../scripts/lib/d1MigrationLedger.mjs"
import { loadSchemaContract, verifyDatabase } from "../scripts/lib/d1SchemaContract.mjs"

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
// Run against an isolated COPY of migrations/ so a concurrent test writing scratch
// files into the real migrations/ directory cannot make manifest validation flaky.
const REPO_ROOT = (() => {
  // realpathSync canonicalizes the macOS /var → /private/var symlink so the
  // migration path-containment check (realpath-based) accepts the copied files.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "atra-mig-root-")))
  cpSync(join(SRC_ROOT, "migrations"), join(dir, "migrations"), { recursive: true })
  return dir
})()
const FIXED_NOW = () => "2026-01-01T00:00:00.000Z"

function freshHandles() {
  const handles: Record<string, DatabaseSync> = {}
  for (const b of KNOWN_BINDINGS) handles[b] = new DatabaseSync(":memory:")
  return handles
}

function loadedManifest(): Manifest {
  const m = loadManifest(REPO_ROOT)
  assert.ok(m.ok)
  return m.manifest
}

// ─── plan ────────────────────────────────────────────────────────

test("planAll returns an ordered plan for both bindings, no IDs or SQL", () => {
  const report = planAll(REPO_ROOT)
  assert.equal(report.ok, true)
  assert.deepEqual(Object.keys(report.plans).sort(), [...KNOWN_BINDINGS].sort())
  const text = report.lines.join("\n")
  assert.match(text, /CONTROL_DB:/)
  assert.match(text, /TENANT_DB_DEFAULT:/)
  // No 32-hex+ database-id-like tokens leak into the plan output.
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i)
})

// ─── fresh apply + replay ────────────────────────────────────────

test("fresh apply migrates every lane; verify passes; replay is a schema no-op", () => {
  const handles = freshHandles()
  const dbFor = (b: string) => handles[b]

  const fresh = applyAll(dbFor, REPO_ROOT, { now: FIXED_NOW })
  assert.equal(fresh.ok, true)
  for (const b of KNOWN_BINDINGS) assert.ok(fresh.perBinding[b].applied.length > 0, `${b} applied`)

  const verified = verifyAll(dbFor, REPO_ROOT)
  assert.equal(verified.ok, true, JSON.stringify(verified.perBinding))

  // Capture schema signatures, replay, and require byte-identical schemas.
  const sigBefore = KNOWN_BINDINGS.map((b) => introspectSql(handles[b]))
  const replay = applyAll(dbFor, REPO_ROOT, { now: FIXED_NOW })
  assert.equal(replay.ok, true)
  const sigAfter = KNOWN_BINDINGS.map((b) => introspectSql(handles[b]))
  assert.deepEqual(sigAfter, sigBefore, "replay changed the schema")

  // A `once` migration is never re-applied on replay (ledger-skipped).
  const tenantReplay = replay.perBinding["TENANT_DB_DEFAULT"]
  assert.ok(tenantReplay.skipped.includes("0006_action_preview_creator.sql"))
  for (const b of KNOWN_BINDINGS) handles[b].close()
})

function introspectSql(db: DatabaseSync): string {
  const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string; sql: string }[]
  return rows.map((r) => `${r.name}::${String(r.sql).replace(/\s+/g, " ")}`).join("\n")
}

// ─── partial upgrade ─────────────────────────────────────────────

test("partial upgrade: a pre-0006 tenant DB gets ONLY the missing migration applied", () => {
  const handles = freshHandles()
  const dbFor = (b: string) => handles[b]
  applyAll(dbFor, REPO_ROOT, { now: FIXED_NOW })

  const tenant = handles["TENANT_DB_DEFAULT"]
  // Roll the tenant DB back to the pre-0006 state: drop the `once` column and its
  // ledger row. reconciliation must then see 0006 as pending, not satisfied.
  tenant.exec("ALTER TABLE action_previews DROP COLUMN created_by_user_id")
  tenant.prepare("DELETE FROM __atra_d1_migrations WHERE binding = ? AND sequence = ?").run("TENANT_DB_DEFAULT", 4)

  const beforeCols = tableColumns(tenant, "action_previews")
  assert.ok(!beforeCols.includes("created_by_user_id"), "precondition: column absent")

  const manifest = loadedManifest()
  const reconciled = reconcileLane(tenant, manifest, "TENANT_DB_DEFAULT")
  const step0006 = reconciled.steps.find((s: { name: string }) => s.name === "0006_action_preview_creator.sql")
  assert.ok(step0006)
  assert.equal(step0006.state, "pending")

  // Applying the lane again applies ONLY the missing migration.
  const re = applyLaneWithLedger(tenant, manifest, "TENANT_DB_DEFAULT", REPO_ROOT, { now: FIXED_NOW })
  assert.ok(re.applied.includes("0006_action_preview_creator.sql"))
  const afterCols = tableColumns(tenant, "action_previews")
  assert.ok(afterCols.includes("created_by_user_id"), "column applied by partial upgrade")
  for (const b of KNOWN_BINDINGS) handles[b].close()
})

function tableColumns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name)
}

// ─── checksum drift ──────────────────────────────────────────────

test("checksum drift fails closed: a changed manifest sha256 is rejected, not re-applied", () => {
  const handles = freshHandles()
  applyAll((b: string) => handles[b], REPO_ROOT, { now: FIXED_NOW })
  const tenant = handles["TENANT_DB_DEFAULT"]

  // Clone the manifest and mutate one already-applied migration's checksum.
  const manifest = structuredClone(loadedManifest())
  manifest.lanes["TENANT_DB_DEFAULT"][0].sha256 = "0".repeat(64)

  const reconciled = reconcileLane(tenant, manifest, "TENANT_DB_DEFAULT")
  assert.equal(reconciled.ok, false)
  assert.ok(reconciled.failures.some((f: string) => f.startsWith("digest_mismatch:")))

  assert.throws(
    () => applyLaneWithLedger(tenant, manifest, "TENANT_DB_DEFAULT", REPO_ROOT, { now: FIXED_NOW }),
    /migration_ledger_unreconciled/,
  )
  for (const b of KNOWN_BINDINGS) handles[b].close()
})

// ─── wrong-lane schema detection ─────────────────────────────────

test("verify detects wrong-lane schema: tenant DB does not satisfy the CONTROL contract", () => {
  const handles = freshHandles()
  applyAll((b: string) => handles[b], REPO_ROOT, { now: FIXED_NOW })
  const contract = loadSchemaContract(REPO_ROOT)
  assert.equal(contract.ok, true)

  const okSame = verifyDatabase(handles["TENANT_DB_DEFAULT"], contract.contract.databases["TENANT_DB_DEFAULT"])
  assert.equal(okSame.ok, true)

  const wrongLane = verifyDatabase(handles["TENANT_DB_DEFAULT"], contract.contract.databases["CONTROL_DB"])
  assert.equal(wrongLane.ok, false, "tenant DB must NOT satisfy the control contract")
  for (const b of KNOWN_BINDINGS) handles[b].close()
})

// ─── environment / flag gate ─────────────────────────────────────

function parse(argv: string[]) {
  const { flags, unknown } = parseMigrateArgs(argv)
  return { flags, unknown }
}

test("gate: valid local plan/apply/verify", () => {
  for (const verb of ["plan", "apply", "verify"]) {
    const { flags, unknown } = parse(["--environment", "local"])
    const d = validateInvocation(verb, flags, unknown)
    assert.equal(d.ok, true, verb)
    assert.ok(d.plan)
    assert.equal(d.plan.remote, false)
  }
})

test("gate: local rejects --remote and --confirm-staging", () => {
  let d = validateInvocation("apply", parse(["--environment", "local", "--remote"]).flags, [])
  assert.equal(d.ok, false); assert.equal(d.error, "remote_flag_forbidden_for_local")
  d = validateInvocation("apply", parse(["--environment", "local", "--confirm-staging"]).flags, [])
  assert.equal(d.ok, false); assert.equal(d.error, "staging_confirmation_forbidden_for_local")
})

test("gate: production and unknown environments fail closed", () => {
  for (const env of ["production", "prod"]) {
    const d = validateInvocation("apply", parse(["--environment", env]).flags, [])
    assert.equal(d.ok, false); assert.equal(d.error, "production_environment_forbidden")
  }
  const d = validateInvocation("apply", parse(["--environment", "qa"]).flags, [])
  assert.equal(d.ok, false); assert.equal(d.error, "unknown_environment")
})

test("gate: staging apply requires --remote AND --confirm-staging", () => {
  let d = validateInvocation("apply", parse(["--environment", "staging"]).flags, [])
  assert.equal(d.error, "remote_flag_required_for_staging")
  d = validateInvocation("apply", parse(["--environment", "staging", "--remote"]).flags, [])
  assert.equal(d.error, "staging_confirmation_required")
  d = validateInvocation("apply", parse(["--environment", "staging", "--remote", "--confirm-staging"]).flags, [])
  assert.equal(d.ok, true); assert.ok(d.plan); assert.equal(d.plan.remote, true)
})

test("gate: staging verify requires --remote; staging plan is offline", () => {
  let d = validateInvocation("verify", parse(["--environment", "staging"]).flags, [])
  assert.equal(d.error, "remote_flag_required_for_staging")
  d = validateInvocation("verify", parse(["--environment", "staging", "--remote"]).flags, [])
  assert.equal(d.ok, true); assert.ok(d.plan); assert.equal(d.plan.remote, true)
  d = validateInvocation("plan", parse(["--environment", "staging"]).flags, [])
  assert.equal(d.ok, true); assert.ok(d.plan); assert.equal(d.plan.remote, false)
})

test("gate: unknown verb and unknown flag fail closed", () => {
  let d = validateInvocation("destroy", parse(["--environment", "local"]).flags, [])
  assert.equal(d.error, "unknown_verb")
  d = validateInvocation("apply", parse(["--environment", "local", "--force"]).flags, ["--force"])
  assert.equal(d.error, "unknown_flag")
})

test("gate: mismatched Cloudflare account/project fails closed", () => {
  const flags = parse(["--environment", "staging", "--remote", "--confirm-staging", "--account", "acct-x", "--project", "proj-y"]).flags
  let d = validateInvocation("apply", flags, [], { account: "acct-real", project: "proj-y" })
  assert.equal(d.error, "unexpected_cloudflare_context")
  d = validateInvocation("apply", flags, [], { account: "acct-x", project: "proj-real" })
  assert.equal(d.error, "unexpected_cloudflare_context")
  d = validateInvocation("apply", flags, [], { account: "acct-x", project: "proj-y" })
  assert.equal(d.ok, true)
})
