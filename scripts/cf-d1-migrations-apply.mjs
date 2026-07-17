#!/usr/bin/env node
/**
 * cf:d1:migrations:apply (P0-PERSIST-015) — OPERATOR-GATED remote migration apply.
 *
 * Impossible to run accidentally. Applies the manifest lanes to REMOTE D1 ONLY
 * when EVERY gate passes:
 *   - explicit remote mode (`--remote`);
 *   - a validated generated deploy config (`--config wrangler.deploy*.json`) with
 *     REAL, non-placeholder D1 IDs and EXACTLY the approved bindings;
 *   - `CF_D1_MIGRATE_EXECUTE=1`;
 *   - `CF_D1_MIGRATE_CONFIRM=APPLY_PRODUCTION_D1_MIGRATIONS`;
 *   - a fully valid migration manifest.
 * Without ALL of them, it STOPS before invoking Wrangler.
 *
 * Applies EVERY active lane migration, `once` migrations (0006) included, through
 * the `__atra_d1_migrations` ledger:
 *   - `replay_safe` steps are re-executed harmlessly and recorded;
 *   - a `once` step is applied EXACTLY ONCE — its DDL and its ledger row go in a
 *     SINGLE `d1 execute --file` invocation, which D1 applies as one implicit
 *     atomic batch (verified against pinned Wrangler 4.99.0; D1 rejects explicit
 *     BEGIN/COMMIT). Replaying this command therefore does NOT attempt 0006 again.
 *   - any unreconcilable state (digest/path mismatch, recorded-but-absent schema,
 *     mixed control/tenant history) STOPS the lane before anything is applied.
 *
 * NEVER part of Worker deploy. This patch never sets the execution variables and
 * never performs a remote apply.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs"
import { createPrivateKey, sign as edSign } from "node:crypto"
import { tmpdir } from "node:os"
import { loadManifest, validateManifest, buildPlan, computeDigest, resolveMigrationPath, KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
// ONE shared config-authority implementation, used by every remote D1 command.
import {
  loadValidatedDeployConfigAuthority, withPrivateExecutionConfig,
} from "./lib/cfDeployConfigAuthority.mjs"
import {
  CREATE_HISTORY_SQL, MIGRATION_HISTORY_TABLE, reconcileFromState, buildAtomicMigrationBatchSql,
} from "./lib/d1MigrationLedger.mjs"
import { sha256Hex, canonicalSerialize } from "./lib/d1OperationalEvidence.mjs"
import {
  openCommandReceiptContext, assembleUnsignedReceipt, persistSignedReceipt,
  deriveMigrationPlanDigest, SESSION_PRIVATE_KEY_BASENAME,
} from "./lib/d1EvidenceReceipts.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const MIGRATE_CONFIRM_PHRASE = "APPLY_PRODUCTION_D1_MIGRATIONS"
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/**
 * Evaluate every gate and RETAIN the deploy-config authority.
 *
 * Returns `{ ok, blocked, configAuthority }` — safe reason codes only. The
 * authority is returned ONLY when every gate passed, so a caller that forgets to
 * check `ok` cannot execute against a refused config.
 *
 * Performs no SQL, no network, and no Wrangler invocation.
 */
export function evaluateApplyGates({ env = process.env, argv = [], repoRoot = REPO_ROOT, configPath } = {}) {
  const blocked = []
  if (!argv.includes("--remote")) blocked.push("missing_remote_flag")
  if (env.CF_D1_MIGRATE_EXECUTE !== "1") blocked.push("missing_execute_flag")
  if (env.CF_D1_MIGRATE_CONFIRM !== MIGRATE_CONFIRM_PHRASE) blocked.push("missing_confirmation")

  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) blocked.push("manifest_unreadable")
  else if (!validateManifest(loaded.manifest, repoRoot).ok) blocked.push("manifest_invalid")

  // The deploy config selects the physical databases, so it is authority-bearing:
  // loaded and validated ONCE through the SHARED library (the same one bootstrap,
  // remote verification, and Worker deploy use) and never re-read afterwards. This
  // also inherits the physical-separation rule, so a same-id config stops here —
  // before the first Wrangler call and before any ledger table is created.
  const config = loadValidatedDeployConfigAuthority({ configPath, repoRoot, allowPlaceholderIds: false })
  if (!config.ok) blocked.push(...config.blocked)

  const ok = blocked.length === 0
  return { ok, blocked: [...new Set(blocked)], configAuthority: ok ? config.authority : null }
}

// ─── Execution authorization latch ───────────────────────────────

/**
 * Wrangler is unreachable until EVERY gate has passed. This is a runtime latch,
 * not a convention: every Wrangler-invoking helper calls
 * `requireAuthorizedExecution()` first, and only `main()` opens the latch, only
 * after `evaluateApplyGates` returned ok. A future refactor that moves a call site
 * therefore cannot silently reach production.
 */
let executionAuthorized = false
function requireAuthorizedExecution() {
  if (!executionAuthorized) throw new Error("gate_bypass_attempt")
}

// ─── Remote read surface (read-only, metadata only) ──────────────
//
// Every helper takes the retained `authority` — never a reusable config PATH. Each
// Wrangler invocation opens its OWN scoped execution config from that authority,
// uses it for exactly one call, and drops it. A config from a previous call cannot
// be mutated to redirect the next, because there is no config from a previous call.

/** Run a remote D1 query through Wrangler and parse its JSON results. */
function remoteQuery(binding, authority, sql) {
  requireAuthorizedExecution()
  return withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "migrate-exec" }, (executionConfig) => {
    const result = spawnSync(WRANGLER_BIN, ["d1", "execute", binding, "--command", sql, "--remote", "--json", "--config", executionConfig], {
      cwd: REPO_ROOT, encoding: "utf8",
    })
    if (result.status !== 0) throw new Error(`remote_query_failed:${binding}`)
    let parsed
    try { parsed = JSON.parse(result.stdout) } catch { throw new Error(`remote_query_unparseable:${binding}`) }
    const first = Array.isArray(parsed) ? parsed[0] : parsed
    return (first && Array.isArray(first.results)) ? first.results : []
  })
}

/**
 * Read the remote ledger for a binding. Metadata only: no application rows, no
 * database IDs. The ledger table is created first (replay-safe infrastructure).
 */
function readRemoteHistory(binding, authority) {
  execRemoteSqlText(binding, authority, CREATE_HISTORY_SQL, "ledger-init")
  const rows = remoteQuery(binding, authority, `SELECT binding, sequence, path, sha256, applied_at FROM ${MIGRATION_HISTORY_TABLE} ORDER BY binding, sequence;`)
  const own = []
  const foreign = []
  for (const r of rows) {
    const row = { binding: String(r.binding), sequence: Number(r.sequence), path: String(r.path), sha256: String(r.sha256), appliedAt: String(r.applied_at) }
    if (row.binding === binding) own.push(row)
    else foreign.push(row)
  }
  return { own, foreign }
}

/** Does a remote column exist? Metadata-only PRAGMA, never row data. */
function remoteProbe(binding, authority, effect) {
  if (!effect || effect.type !== "column_exists") return false
  const rows = remoteQuery(binding, authority, `PRAGMA table_info("${effect.table}");`)
  return rows.some((c) => String(c.name) === effect.column)
}

/** Execute SQL text remotely via a temporary file — ONE atomic D1 batch. */
function execRemoteSqlText(binding, authority, sql, label) {
  requireAuthorizedExecution()
  const dir = mkdtempSync(resolve(tmpdir(), "d1-apply-"))
  const file = resolve(dir, `${label}.sql`)
  try {
    writeFileSync(file, sql, { mode: 0o600 })
    // A fresh scoped config from the retained authority for THIS single invocation.
    withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "migrate-exec" }, (executionConfig) => {
      const result = spawnSync(WRANGLER_BIN, ["d1", "execute", binding, "--file", file, "--remote", "--config", executionConfig], {
        cwd: REPO_ROOT, stdio: "inherit",
      })
      if (result.status !== 0) throw new Error(`remote_exec_failed:${binding}:${label}`)
    })
  } finally {
    // The generated SQL never outlives the invocation, on success or failure.
    rmSync(dir, { recursive: true, force: true })
  }
}

// ─── Plan ────────────────────────────────────────────────────────

/**
 * The ordered, operator-visible plan of what an apply WOULD do (safe — no IDs).
 *
 * This is a DISPLAY artifact and is never executed: `main` applies through
 * `applyAllLanes`, which receives the private execution config. `displayConfigPath`
 * only labels the plan for a human reading it — it is never passed to Wrangler.
 */
export function buildApplyCommands(repoRoot, displayConfigPath) {
  const manifest = loadManifest(repoRoot).manifest
  const commands = []
  for (const binding of KNOWN_BINDINGS) {
    for (const step of buildPlan(manifest, binding)) {
      commands.push({
        binding, name: step.name, apply: step.apply,
        args: ["d1", "execute", binding, "--file", step.path, "--remote", "--config", displayConfigPath],
      })
    }
  }
  return commands
}

/** Read the pinned migration SQL, re-verifying its digest at apply time. */
function readPinnedMigration(repoRoot, step) {
  const resolved = resolveMigrationPath(repoRoot, step.path)
  if (!resolved.ok) throw new Error(`migration_path_unsafe:${resolved.failure}:${step.name}`)
  if (computeDigest(resolved.absPath) !== step.sha256) throw new Error(`migration_digest_mismatch:${step.name}`)
  return readFileSync(resolved.absPath, "utf8")
}

function parseConfigArg(argv) {
  const i = argv.indexOf("--config")
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : undefined
}

/**
 * Apply every lane, deriving a FRESH scoped execution config from `authority` for
 * each individual Wrangler call (ledger init, history read, effect probe, and every
 * migration). Returns an exit code and NEVER calls `process.exit`: a nested exit
 * would terminate the process mid-call, before a scoped config's own `finally` could
 * remove it, leaving a file with real database IDs at the repository root.
 *
 * Threading the AUTHORITY — not a reusable config path — is the invariant: modifying
 * a config file from one lane's call cannot redirect the next lane's call, because
 * the next call opens its own file from the retained bytes.
 */
function applyAllLanes(authority) {
  const manifest = loadManifest(REPO_ROOT).manifest
  for (const binding of KNOWN_BINDINGS) {
    // Reconcile the REMOTE ledger + schema before applying anything in this lane.
    let reconciled
    try {
      const history = readRemoteHistory(binding, authority)
      reconciled = reconcileFromState(manifest, binding, history, (effect) => remoteProbe(binding, authority, effect))
    } catch (err) {
      console.error(`cf:d1:migrations:apply: FAILED reading migration history for ${binding} — ${err.message}`)
      return 1
    }
    if (!reconciled.ok) {
      console.error(`cf:d1:migrations:apply: STOPPED — ${binding} history does not reconcile: ${reconciled.failures.join(", ")}`)
      console.error("Operator action required. Nothing was applied for this lane.")
      return 1
    }

    const stateBySeq = new Map(reconciled.steps.map((s) => [s.sequence, s.state]))
    for (const step of buildPlan(manifest, binding)) {
      const state = stateBySeq.get(step.sequence)
      if (step.apply === "once" && state === "satisfied") {
        console.log(`cf:d1:migrations:apply → ${binding} :: ${step.name} SKIPPED (once, already applied)`)
        continue
      }
      console.log(`cf:d1:migrations:apply → ${binding} :: ${step.name} (${step.apply})`)
      try {
        const sql = readPinnedMigration(REPO_ROOT, step)
        const label = step.name.replace(/\.sql$/, "")
        if (state === "satisfied") {
          // Already recorded and replay-safe: re-execute the pinned SQL (a no-op by
          // construction) WITHOUT recording it a second time.
          execRemoteSqlText(binding, authority, sql, label)
        } else {
          // Pending: SQL + ledger row in ONE file = ONE atomic D1 batch. The
          // migration is never recorded unless its own SQL committed with it.
          execRemoteSqlText(binding, authority, buildAtomicMigrationBatchSql(sql, step, new Date().toISOString()), label)
        }
      } catch (err) {
        console.error(`cf:d1:migrations:apply: FAILED applying ${step.name} — ${err.message}. Aborting.`)
        return 1
      }
    }
  }
  console.log("cf:d1:migrations:apply: complete.")
  return 0
}

// ─── Command-local evidence emission (private; not exported) ──────
//
// Receipt creation and signing live HERE, after the gate latch and the real apply
// result. Status is derived from the applied plan RECOMPUTED from the repository;
// the session key is read and signed inline. No shared function turns a caller
// result into a signed receipt.

/** Derive status + proof from the REAL apply result (applied plan must be canonical). */
function deriveMigrationApplyOutcome(repoRoot, applyResult) {
  if (!applyResult || typeof applyResult.completed !== "boolean" || !Array.isArray(applyResult.appliedPlan)) {
    return { ok: false, blocked: ["result_shape_invalid"] }
  }
  const planDigest = deriveMigrationPlanDigest(repoRoot)
  if (!planDigest) return { ok: false, blocked: ["proof_underivable"] }
  const applied = applyResult.appliedPlan.map((step) => ({
    apply: step.apply, binding: step.binding, kind: step.kind, path: step.path, sequence: step.sequence, sha256: step.sha256,
  }))
  const appliedDigest = sha256Hex(canonicalSerialize(applied))
  // A SUCCESSFUL apply must have executed exactly the committed plan.
  if (applyResult.completed && appliedDigest !== planDigest) return { ok: false, blocked: ["applied_plan_mismatch"] }
  return {
    ok: true, status: applyResult.completed ? "success" : "failed",
    proof: {
      plan_digest: planDigest, applied_steps_sha256: appliedDigest,
      reconciliation: applyResult.completed ? "ledger_reconciled" : "not_applicable",
    },
    safeCategories: applyResult.completed
      ? ["control_lane_applied", "ledger_reconciled", "tenant_lane_applied"]
      : ["migration_apply_failed"],
  }
}

/** Emit the apply receipt from THIS command's real result path. Private. */
function emitMigrationApplyReceipt(sessionDir, { repoRoot, authority, startedAt, applyResult }) {
  const producer = "cf_d1_migration_apply"
  const operation = "migration_apply_completed"
  const ctx = openCommandReceiptContext(sessionDir, { repoRoot, authority, producer })
  if (!ctx.ok) return ctx
  const outcome = deriveMigrationApplyOutcome(repoRoot, applyResult)
  if (!outcome.ok) return outcome
  const built = assembleUnsignedReceipt(ctx.session, ctx.existingReceipts, {
    operation, producer, authoritySha256: ctx.authoritySha256, producerSourceSha256: ctx.producerSourceSha256,
    startedAt, completedAt: new Date().toISOString(),
    status: outcome.status, proof: outcome.proof, safeCategories: outcome.safeCategories,
  })
  if (!built.ok) return built
  const pem = readFileSync(resolve(sessionDir, SESSION_PRIVATE_KEY_BASENAME), "utf8")
  built.receipt.receipt_signature = edSign(null, Buffer.from(built.receipt.receipt_sha256, "utf8"), createPrivateKey(pem)).toString("hex")
  return persistSignedReceipt(ctx.session, built.receipt)
}

function main() {
  const argv = process.argv.slice(2)
  const configPath = parseConfigArg(argv)
  const gates = evaluateApplyGates({ env: process.env, argv, repoRoot: REPO_ROOT, configPath })
  if (!gates.ok) {
    console.error(`cf:d1:migrations:apply: STOPPED before Wrangler — gate(s) not satisfied: ${gates.blocked.join(", ")}`)
    console.error(`Required: --remote --config wrangler.deploy.json, CF_D1_MIGRATE_EXECUTE=1, CF_D1_MIGRATE_CONFIRM=${MIGRATE_CONFIRM_PHRASE}, valid manifest + deploy config.`)
    process.exit(1)
  }
  // EVERY gate passed — only now may Wrangler be reached.
  executionAuthorized = true

  // Evidence session (optional, operator-supplied): the execution boundary starts
  // HERE — after every gate — so no receipt can exist for a run the gates refused.
  const evidenceSessionDir = process.env.CF_D1_EVIDENCE_SESSION_DIR
  const evidenceStartedAt = evidenceSessionDir ? new Date().toISOString() : null

  // The retained authority — NOT a reusable config path — is threaded to every lane.
  // Each Wrangler call derives its own short-lived config from these exact bytes and
  // removes it immediately, so the operator's mutable configPath is never handed to
  // Wrangler and no private file survives between two calls to be redirected.
  let exitCode = 1
  try {
    exitCode = applyAllLanes(gates.configAuthority)
  } catch (err) {
    console.error(`cf:d1:migrations:apply: FAILED — ${err instanceof Error ? err.message : "apply_failed"}`)
    exitCode = 1
  }

  // Command-local receipt, emitted ONLY from this real result path once the outcome
  // is known. Status is derived from the applied plan (recomputed from the
  // repository) — there is no exit-code parameter to fabricate.
  if (evidenceSessionDir) {
    const manifest = loadManifest(REPO_ROOT)
    const appliedPlan = exitCode === 0 && manifest.ok
      ? KNOWN_BINDINGS.flatMap((binding) => buildPlan(manifest.manifest, binding))
      : []
    const receipt = emitMigrationApplyReceipt(evidenceSessionDir, {
      repoRoot: REPO_ROOT, authority: gates.configAuthority, startedAt: evidenceStartedAt,
      applyResult: { completed: exitCode === 0, appliedPlan },
    })
    if (receipt.ok) console.log("evidence: receipt recorded (migration_apply_completed)")
    else console.error(`evidence: receipt FAILED — ${receipt.blocked.join(", ")}`)
  }
  process.exit(exitCode)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
