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
  loadTrustedStagingContext,
  evaluateTrustedStagingContext,
  evaluateCallerAssertions,
  runHermeticLocal,
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

// Valid synthetic staging context (32-hex account id; allowlisted project name).
const ACCT = "0123456789abcdef0123456789abcdef"
const PROJ = "workunit-os-staging"
const CTX = { account: ACCT, project: PROJ }

test("gate: valid local plan/apply/verify (offline, remote=false)", () => {
  for (const verb of ["plan", "apply", "verify"]) {
    const d = validateInvocation(verb, parse(["--environment", "local"]).flags, [])
    assert.equal(d.ok, true, verb)
    assert.ok(d.plan)
    assert.equal(d.plan.remote, false)
  }
})

test("gate: local rejects --remote, --confirm-staging, and context assertions", () => {
  let d = validateInvocation("apply", parse(["--environment", "local", "--remote"]).flags, [])
  assert.equal(d.error, "remote_flag_forbidden_for_local")
  d = validateInvocation("apply", parse(["--environment", "local", "--confirm-staging"]).flags, [])
  assert.equal(d.error, "staging_confirmation_forbidden_for_local")
  d = validateInvocation("apply", parse(["--environment", "local", "--account", ACCT, "--project", PROJ]).flags, [])
  assert.equal(d.error, "context_assertion_not_allowed_for_local")
})

test("gate: production and unknown environments fail closed", () => {
  for (const env of ["production", "prod"]) {
    const d = validateInvocation("apply", parse(["--environment", env]).flags, [])
    assert.equal(d.error, "production_environment_forbidden")
  }
  assert.equal(validateInvocation("apply", parse(["--environment", "qa"]).flags, []).error, "unknown_environment")
})

test("gate: plan rejects --remote and account/project assertions", () => {
  assert.equal(validateInvocation("plan", parse(["--environment", "staging", "--remote"]).flags, []).error, "remote_flag_forbidden_for_plan")
  assert.equal(validateInvocation("plan", parse(["--environment", "staging", "--account", ACCT]).flags, [], CTX).error, "context_assertion_not_allowed_for_plan")
  const d = validateInvocation("plan", parse(["--environment", "staging"]).flags, [], {})
  assert.equal(d.ok, true); assert.ok(d.plan); assert.equal(d.plan.remote, false)
})

test("gate: deprecated staging apply/verify fail closed (no remote executor)", () => {
  assert.equal(validateInvocation("apply", parse(["--environment", "staging", "--remote", "--confirm-staging"]).flags, [], CTX).error, "staging_remote_execution_not_available")
  assert.equal(validateInvocation("verify", parse(["--environment", "staging", "--remote"]).flags, [], CTX).error, "staging_remote_execution_not_available")
})

test("gate: preflight requires staging environment and rejects remote/confirm flags", () => {
  assert.equal(validateInvocation("preflight", parse(["--environment", "local"]).flags, [], CTX).error, "preflight_requires_staging_environment")
  assert.equal(validateInvocation("preflight", parse(["--environment", "staging", "--remote"]).flags, [], CTX).error, "remote_flag_forbidden_for_preflight")
  assert.equal(validateInvocation("preflight", parse(["--environment", "staging", "--confirm-staging"]).flags, [], CTX).error, "confirm_staging_not_allowed_for_preflight")
})

test("gate: preflight trusted-context categories (unconfigured/incomplete/invalid/valid)", () => {
  const pf = (expected: Record<string, string>) => validateInvocation("preflight", parse(["--environment", "staging"]).flags, [], expected)
  assert.equal(pf({}).error, "staging_context_unconfigured")
  assert.equal(pf({ account: ACCT }).error, "staging_context_incomplete")
  assert.equal(pf({ project: PROJ }).error, "staging_context_incomplete")
  assert.equal(pf({ account: "NOTHEX", project: PROJ }).error, "staging_context_invalid")
  assert.equal(pf({ account: ACCT, project: "Bad Project!" }).error, "staging_context_invalid")
  const ok = pf(CTX)
  assert.equal(ok.ok, true); assert.ok(ok.plan); assert.equal(ok.plan.remote, false)
})

test("gate: preflight caller assertions (both/neither; matching required)", () => {
  const pf = (args: string[]) => validateInvocation("preflight", parse(["--environment", "staging", ...args]).flags, [], CTX)
  assert.equal(pf([]).ok, true) // neither → trusted governs
  assert.equal(pf(["--account", ACCT]).error, "staging_context_assertion_incomplete")
  assert.equal(pf(["--account", "deadbeefdeadbeefdeadbeefdeadbeef", "--project", PROJ]).error, "unexpected_cloudflare_context")
  assert.equal(pf(["--account", ACCT, "--project", PROJ]).ok, true)
})

test("gate: unknown verb and unknown flag fail closed", () => {
  assert.equal(validateInvocation("destroy", parse(["--environment", "local"]).flags, []).error, "unknown_verb")
  assert.equal(validateInvocation("apply", parse(["--environment", "local", "--force"]).flags, ["--force"]).error, "unknown_flag")
})

// ─── trusted-context / caller-assertion unit contracts ───────────

test("evaluateTrustedStagingContext validates both fields and bounds", () => {
  assert.equal(evaluateTrustedStagingContext({}).error, "staging_context_unconfigured")
  assert.equal(evaluateTrustedStagingContext({ account: "  ", project: "  " }).error, "staging_context_unconfigured")
  assert.equal(evaluateTrustedStagingContext({ account: ACCT }).error, "staging_context_incomplete")
  assert.equal(evaluateTrustedStagingContext({ account: ACCT, project: "x".repeat(200) }).error, "staging_context_invalid")
  assert.equal(evaluateTrustedStagingContext({ account: ACCT, project: "bad name" }).error, "staging_context_invalid")
  assert.equal(evaluateTrustedStagingContext({ account: "ABCDEF0123456789ABCDEF0123456789", project: PROJ }).error, "staging_context_invalid") // uppercase hex rejected
  const ok = evaluateTrustedStagingContext({ account: `  ${ACCT}  `, project: `  ${PROJ}  ` }) // trimmed
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepEqual(ok.value, { account: ACCT, project: PROJ })
})

test("evaluateCallerAssertions requires both-or-neither and exact match", () => {
  const t = { account: ACCT, project: PROJ }
  assert.equal(evaluateCallerAssertions({ account: null, project: null } as never, t).ok, true)
  assert.equal(evaluateCallerAssertions({ account: ACCT, project: null } as never, t).error, "staging_context_assertion_incomplete")
  assert.equal(evaluateCallerAssertions({ account: "deadbeefdeadbeefdeadbeefdeadbeef", project: PROJ } as never, t).error, "unexpected_cloudflare_context")
  assert.equal(evaluateCallerAssertions({ account: ACCT, project: PROJ } as never, t).ok, true)
})

test("loadTrustedStagingContext returns RAW staging-only env values", () => {
  assert.deepEqual(loadTrustedStagingContext({}), {})
  assert.deepEqual(loadTrustedStagingContext({ CF_STAGING_ACCOUNT_ID: ACCT, CF_STAGING_PROJECT: PROJ }), { account: ACCT, project: PROJ })
  // Raw (untrimmed / empty) values are preserved so the evaluator can classify them.
  assert.deepEqual(loadTrustedStagingContext({ CF_STAGING_ACCOUNT_ID: "  " }), { account: "  " })
})

// ─── runHermeticLocal: single cleanup authority + failure injection ─

function hermeticDeps(overrides: Record<string, unknown> = {}) {
  const state = { root: null as string | null, removed: false, opened: 0, closed: 0 }
  const base = {
    verb: "apply", repoRoot: REPO_ROOT,
    makeTempRoot: () => { state.root = "/fake/root"; return state.root },
    openDatabase: () => { state.opened++; return new DatabaseSync(":memory:") },
    closeHandle: (h: DatabaseSync) => { state.closed++; h.close() },
    removeRoot: () => { state.removed = true },
    rootExists: () => !state.removed,
  }
  return { deps: { ...base, ...overrides }, state }
}

test("runHermeticLocal: success reports fresh_apply/replay_noop/verify_ok/cleanup and removes root", () => {
  const { deps, state } = hermeticDeps()
  const r = runHermeticLocal(deps as never)
  assert.equal(r.ok, true)
  assert.deepEqual(r.reported, { fresh_apply: true, replay_noop: true, verify_ok: true, cleanup: true })
  assert.equal(state.removed, true)
})

test("runHermeticLocal: first open failure → cleanup still removes the root", () => {
  const { deps, state } = hermeticDeps({ openDatabase: () => { throw new Error("open_failed") } })
  const r = runHermeticLocal(deps as never)
  assert.equal(r.ok, false)
  assert.equal(r.runError, "open_failed")
  assert.equal(r.flags.cleanup, true)
  assert.equal(state.removed, true)
})

test("runHermeticLocal: second open failure → the first handle is closed and root removed", () => {
  let calls = 0
  const closed: DatabaseSync[] = []
  const { deps, state } = hermeticDeps({
    openDatabase: () => { calls++; if (calls === 2) throw new Error("open_failed"); return new DatabaseSync(":memory:") },
    closeHandle: (h: DatabaseSync) => { closed.push(h); h.close() },
  })
  const r = runHermeticLocal(deps as never)
  assert.equal(r.ok, false)
  assert.equal(closed.length, 1) // the one successfully-opened handle was closed
  assert.equal(state.removed, true)
  assert.equal(r.flags.cleanup, true)
})

test("runHermeticLocal: fresh apply / replay / verify failures still clean up", () => {
  for (const fn of ["applyAllFn", "verifyAllFn"]) {
    const { deps, state } = hermeticDeps({ [fn]: () => { throw new Error("injected_failure") } })
    const r = runHermeticLocal(deps as never)
    assert.equal(r.ok, false)
    assert.equal(r.flags.cleanup, true)
    assert.equal(state.removed, true)
  }
  // Replay failure specifically (second applyAll call throws).
  let applyCalls = 0
  const { deps, state } = hermeticDeps({
    applyAllFn: (dbFor: (b: string) => DatabaseSync, repoRoot: string, opts: { now?: () => string }) => {
      applyCalls++
      if (applyCalls === 2) throw new Error("replay_failed")
      return applyAll(dbFor, repoRoot, opts)
    },
  })
  const r = runHermeticLocal(deps as never)
  assert.equal(r.runError, "replay_failed")
  assert.equal(state.removed, true)
})

test("runHermeticLocal: root removal failure is reported, cleanup=false", () => {
  const { deps } = hermeticDeps({ removeRoot: () => { throw new Error("boom") }, rootExists: () => true })
  const r = runHermeticLocal(deps as never)
  assert.equal(r.ok, false)
  assert.equal(r.cleanupError, "cleanup_root_removal_failed")
  assert.equal(r.flags.cleanup, false)
})
