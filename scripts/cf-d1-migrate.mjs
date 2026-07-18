#!/usr/bin/env node
/**
 * cf:d1:migrate — reproducible migration CLI (plan / apply / verify / preflight)
 * with an explicit local vs staging separation. (P0-FIX-D1-*)
 *
 * Verbs:
 *   plan       Deterministic per-binding plan (safe fields only; no network).
 *   apply      LOCAL only: hermetic, invocation-owned temp SQLite databases —
 *              fresh apply, replay no-op, read-only verify, then verified cleanup.
 *   verify     LOCAL only: hermetic fresh apply + read-only schema/ledger verify.
 *   preflight  STAGING only: OFFLINE validation of the staging authority contract
 *              (complete trusted context, complete-or-absent caller assertions,
 *              production prohibition, execution-latch absence, local manifest
 *              validity). It does NOT use --remote and performs NO network access.
 *
 * REMOTE EXECUTOR: NOT implemented in this PR. `apply`/`verify` against staging
 * fail closed with `staging_remote_execution_not_available`. A later,
 * independently audited PR will add the authorized remote executor. This command
 * NEVER performs a remote D1 operation and NEVER contacts a provider.
 *
 * Output is disclosure-free: no account/project values, database IDs, secrets,
 * identities, tenant IDs, or stored rows.
 */

import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, rmSync, realpathSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  planAll,
  parseMigrateArgs,
  validateInvocation,
  loadTrustedStagingContext,
  runHermeticLocal,
} from "./lib/d1MigrationRunner.mjs"

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

// ─── local hermetic apply/verify (single cleanup authority) ──────

function runLocal(verb) {
  const result = runHermeticLocal({
    verb,
    repoRoot: REPO_ROOT,
    makeTempRoot: () => mkdtempSync(join(tmpdir(), "atra-d1-migrate-")),
    openDatabase: (root, binding) => new DatabaseSync(join(root, `${binding}.sqlite`)),
    closeHandle: (handle) => handle.close(),
    removeRoot: (root) => rmSync(root, { recursive: true, force: true }),
    rootExists: (root) => existsSync(root),
  })

  console.log(`cf:d1:migrate ${verb} --environment local (hermetic, no retained state):`)
  for (const [k, v] of Object.entries(result.reported)) console.log(`  ${k}=${v}`)
  if (result.runError) console.error(`cf:d1:migrate: ${result.runError}`)
  if (result.cleanupError) console.error(`cf:d1:migrate: ${result.cleanupError}`)
  process.exit(result.ok ? 0 : 1)
}

// ─── staging preflight (offline; NO network, NO remote executor) ─

function runPreflight() {
  // The gate (validateInvocation) already validated the complete trusted context
  // and complete-or-absent caller assertions. Preflight additionally confirms the
  // local manifest is valid and that the remote execution latch is NOT set (there
  // is no executor in this PR). It performs NO network access.
  const manifest = planAll(REPO_ROOT)
  if (!manifest.ok) fail(manifest.error, manifest.failures?.join(", "))
  const executionLatchAbsent = process.env[STAGING_EXECUTE_LATCH] !== "1"
  if (!executionLatchAbsent) {
    // The latch implies intent to execute remotely, but no remote executor exists.
    fail("staging_remote_executor_not_implemented")
  }
  console.log("cf:d1:migrate preflight --environment staging (offline; NO network, NO remote executor):")
  const report = {
    environment: "staging",
    trusted_context_complete: true,
    caller_assertions_valid: true,
    production_prohibited: true,
    execution_latch_absent: executionLatchAbsent,
    local_manifest_valid: true,
    remote: false,
  }
  for (const [k, v] of Object.entries(report)) console.log(`  ${k}=${v}`)
  process.exit(0)
}

// ─── main ────────────────────────────────────────────────────────

function main() {
  const verb = process.argv[2]
  const { flags, unknown } = parseMigrateArgs(process.argv.slice(3))
  // The TRUSTED staging context comes from operator-provided, staging-only env
  // (CF_STAGING_ACCOUNT_ID / CF_STAGING_PROJECT) — never from --account/--project.
  // Local and plan invocations ignore it; preflight validates it.
  const expectedContext = loadTrustedStagingContext()
  const decision = validateInvocation(verb, flags, unknown, expectedContext)
  if (!decision.ok) fail(decision.error)

  if (verb === "plan") return runPlan()
  if (verb === "preflight") return runPreflight()
  if (decision.plan.environment === "local") return runLocal(verb)
  // No other invocation can succeed: staging apply/verify is rejected by the gate
  // (staging_remote_execution_not_available). Defensive fail-closed.
  fail("unsupported_invocation")
}

main()
