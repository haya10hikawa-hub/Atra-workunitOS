#!/usr/bin/env node
/**
 * cf:d1:migrate — unified reproducible migration CLI (plan / apply / verify)
 * with an explicit local vs staging separation. (P0-FIX-D1-OPERATIONAL-CONTRACT)
 *
 * Verbs:
 *   plan     Deterministic per-binding plan (safe fields only; no network).
 *   apply    LOCAL: hermetic, invocation-owned temp SQLite databases — fresh
 *            apply, replay no-op, and read-only verify, then cleanup. Leaves NO
 *            local D1 state. STAGING: a remote operation (see the gate below).
 *   verify   LOCAL: hermetic fresh apply + read-only schema/ledger verify.
 *            STAGING: a remote read (see the gate below).
 *
 * Environment gate (scripts/lib/d1MigrationRunner.mjs#validateInvocation):
 *   --environment local        local only; --remote / --confirm-staging rejected.
 *   --environment staging       apply requires --remote AND --confirm-staging;
 *                               verify requires --remote; production/unknown env
 *                               rejected; a caller-asserted --account/--project
 *                               that disagrees with deploy config is rejected.
 *
 * REMOTE SAFETY: this command NEVER performs a remote D1 operation unless the
 * operator sets the execution latch CF_D1_STAGING_EXECUTE=1 (a deliberate,
 * separate authorization). Without it, a fully-validated staging invocation
 * prints that the gate passed and exits WITHOUT touching the network. This PR
 * never sets the latch.
 *
 * Output is disclosure-free: no database IDs, secrets, identities, or stored rows.
 */

import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, rmSync, realpathSync } from "node:fs"
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
  KNOWN_BINDINGS,
} from "./lib/d1MigrationRunner.mjs"
import { schemaSignature } from "./lib/d1SchemaContract.mjs"

// The repository root that supplies the canonical migration files. Defaults to
// this script's committed location. `CF_D1_MIGRATE_REPO_ROOT` is a test/diagnostic
// override that ONLY relocates where committed migration files are read from for
// the OFFLINE local operations (plan / hermetic apply / verify); it never enables
// or affects a remote operation (which this build never performs).
const REPO_ROOT = process.env.CF_D1_MIGRATE_REPO_ROOT
  ? realpathSync(process.env.CF_D1_MIGRATE_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const STAGING_EXECUTE_LATCH = "CF_D1_STAGING_EXECUTE"

function fail(error, extra) {
  console.error(`cf:d1:migrate: FAIL — ${error}${extra ? ` (${extra})` : ""}`)
  process.exit(1)
}

// ─── plan ────────────────────────────────────────────────────────

function runPlan() {
  const report = planAll(REPO_ROOT)
  if (!report.ok) fail(report.error, report.failures?.join(", "))
  console.log("cf:d1:migrate plan (safe — no database IDs, no SQL):")
  for (const line of report.lines) console.log(line)
  process.exit(0)
}

// ─── local hermetic apply/verify ─────────────────────────────────

/** Open one invocation-owned temp SQLite database per binding. */
function openHermeticDatabases(dir) {
  const handles = {}
  for (const binding of KNOWN_BINDINGS) {
    handles[binding] = new DatabaseSync(join(dir, `${binding}.sqlite`))
  }
  return handles
}

function runLocal(verb) {
  const dir = mkdtempSync(join(tmpdir(), "atra-d1-migrate-"))
  const handles = openHermeticDatabases(dir)
  const dbFor = (binding) => handles[binding]
  const flags = { fresh_apply: false, replay_noop: false, verify_ok: false, cleanup: false }
  try {
    // Fresh apply (both lanes, in order).
    const fresh = applyAll(dbFor, REPO_ROOT, { now: () => "2026-01-01T00:00:00.000Z" })
    if (!fresh.ok) throw new Error(`apply_failed:${fresh.error}`)
    flags.fresh_apply = KNOWN_BINDINGS.every((b) => fresh.perBinding[b].applied.length > 0)

    if (verb === "apply") {
      // Replay must perform NO destructive work. Replay-safe DDL is `IF NOT
      // EXISTS`-guarded (re-executed harmlessly), and `once` migrations are
      // ledger-skipped — so the honest proof is that the resulting schema is
      // byte-identical after a second apply.
      const before = KNOWN_BINDINGS.map((b) => schemaSignature(handles[b]))
      const replay = applyAll(dbFor, REPO_ROOT, { now: () => "2026-01-01T00:00:00.000Z" })
      if (!replay.ok) throw new Error(`replay_failed:${replay.error}`)
      const after = KNOWN_BINDINGS.map((b) => schemaSignature(handles[b]))
      flags.replay_noop = before.every((sig, i) => sig === after[i])
    }

    const verify = verifyAll(dbFor, REPO_ROOT)
    flags.verify_ok = verify.ok === true
  } finally {
    for (const binding of KNOWN_BINDINGS) {
      try { handles[binding].close() } catch { /* already closed */ }
    }
    rmSync(dir, { recursive: true, force: true })
    flags.cleanup = true
  }

  // Only the flags relevant to this verb are reported (replay is an apply concern).
  const reported = verb === "apply"
    ? { fresh_apply: flags.fresh_apply, replay_noop: flags.replay_noop, verify_ok: flags.verify_ok, cleanup: flags.cleanup }
    : { fresh_apply: flags.fresh_apply, verify_ok: flags.verify_ok, cleanup: flags.cleanup }
  const pass = Object.values(reported).every(Boolean)

  console.log(`cf:d1:migrate ${verb} --environment local (hermetic, no retained state):`)
  for (const [k, v] of Object.entries(reported)) console.log(`  ${k}=${v}`)
  process.exit(pass ? 0 : 1)
}

// ─── staging remote gate (never executes remote in this build) ───

function runStagingGate(plan) {
  const executeLatch = process.env[STAGING_EXECUTE_LATCH] === "1"
  console.log(`cf:d1:migrate ${plan.verb} --environment staging: authorization gate PASSED.`)
  if (!executeLatch) {
    console.error(
      `cf:d1:migrate: remote execution latch ${STAGING_EXECUTE_LATCH}=1 is not set — ` +
      "no remote D1 operation performed. Remote staging execution is a separate, " +
      "explicitly authorized step (see docs/operations/CLOUDFLARE_D1_SETUP.md).",
    )
    process.exit(3)
  }
  // Deliberately not implemented in this command build: remote execution requires
  // the authorized remote path and is out of scope for this change. Fail closed.
  fail("remote_execution_not_available_in_this_build")
}

// ─── main ────────────────────────────────────────────────────────

function main() {
  const verb = process.argv[2]
  const { flags, unknown } = parseMigrateArgs(process.argv.slice(3))
  // The TRUSTED staging context comes from operator-provided, staging-only env
  // (CF_STAGING_ACCOUNT_ID / CF_STAGING_PROJECT) — never from --account/--project.
  // Local and plan invocations ignore it; a staging remote op requires it.
  const expectedContext = loadTrustedStagingContext()
  const decision = validateInvocation(verb, flags, unknown, expectedContext)
  if (!decision.ok) fail(decision.error)

  if (verb === "plan") return runPlan()
  if (decision.plan.environment === "local") return runLocal(verb)
  // Validated staging apply/verify — remote. Gated; never executes here.
  return runStagingGate(decision.plan)
}

main()
