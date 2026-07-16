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
import { tmpdir } from "node:os"
import { loadManifest, validateManifest, buildPlan, computeDigest, resolveMigrationPath, KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
import { loadConfigFile, validateDeployConfig } from "./lib/cfDeployConfig.mjs"
import {
  CREATE_HISTORY_SQL, MIGRATION_HISTORY_TABLE, reconcileFromState, buildAtomicMigrationBatchSql,
} from "./lib/d1MigrationLedger.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const MIGRATE_CONFIRM_PHRASE = "APPLY_PRODUCTION_D1_MIGRATIONS"
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/**
 * Evaluate every gate. Returns `{ ok, blocked }` — a list of safe reason codes.
 * Pure: performs no SQL, no network, no Wrangler invocation.
 */
export function evaluateApplyGates({ env = process.env, argv = [], repoRoot = REPO_ROOT, configPath } = {}) {
  const blocked = []
  if (!argv.includes("--remote")) blocked.push("missing_remote_flag")
  if (env.CF_D1_MIGRATE_EXECUTE !== "1") blocked.push("missing_execute_flag")
  if (env.CF_D1_MIGRATE_CONFIRM !== MIGRATE_CONFIRM_PHRASE) blocked.push("missing_confirmation")
  if (!configPath) blocked.push("missing_config")

  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) blocked.push("manifest_unreadable")
  else if (!validateManifest(loaded.manifest, repoRoot).ok) blocked.push("manifest_invalid")

  if (configPath) {
    const cfg = loadConfigFile(configPath)
    if (!cfg.ok) blocked.push("deploy_config_unreadable")
    else {
      const v = validateDeployConfig(cfg.config, { configPath, repoRoot, allowPlaceholderIds: false })
      if (!v.ok) blocked.push("deploy_config_invalid")
    }
  }
  return { ok: blocked.length === 0, blocked }
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

/** Run a remote D1 query through Wrangler and parse its JSON results. */
function remoteQuery(binding, configPath, sql) {
  requireAuthorizedExecution()
  const result = spawnSync(WRANGLER_BIN, ["d1", "execute", binding, "--command", sql, "--remote", "--json", "--config", configPath], {
    cwd: REPO_ROOT, encoding: "utf8",
  })
  if (result.status !== 0) throw new Error(`remote_query_failed:${binding}`)
  let parsed
  try { parsed = JSON.parse(result.stdout) } catch { throw new Error(`remote_query_unparseable:${binding}`) }
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  return (first && Array.isArray(first.results)) ? first.results : []
}

/**
 * Read the remote ledger for a binding. Metadata only: no application rows, no
 * database IDs. The ledger table is created first (replay-safe infrastructure).
 */
function readRemoteHistory(binding, configPath) {
  execRemoteSqlText(binding, configPath, CREATE_HISTORY_SQL, "ledger-init")
  const rows = remoteQuery(binding, configPath, `SELECT binding, sequence, path, sha256, applied_at FROM ${MIGRATION_HISTORY_TABLE} ORDER BY binding, sequence;`)
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
function remoteProbe(binding, configPath, effect) {
  if (!effect || effect.type !== "column_exists") return false
  const rows = remoteQuery(binding, configPath, `PRAGMA table_info("${effect.table}");`)
  return rows.some((c) => String(c.name) === effect.column)
}

/** Execute SQL text remotely via a temporary file — ONE atomic D1 batch. */
function execRemoteSqlText(binding, configPath, sql, label) {
  requireAuthorizedExecution()
  const dir = mkdtempSync(resolve(tmpdir(), "d1-apply-"))
  const file = resolve(dir, `${label}.sql`)
  try {
    writeFileSync(file, sql, { mode: 0o600 })
    const result = spawnSync(WRANGLER_BIN, ["d1", "execute", binding, "--file", file, "--remote", "--config", configPath], {
      cwd: REPO_ROOT, stdio: "inherit",
    })
    if (result.status !== 0) throw new Error(`remote_exec_failed:${binding}:${label}`)
  } finally {
    // The generated SQL never outlives the invocation, on success or failure.
    rmSync(dir, { recursive: true, force: true })
  }
}

// ─── Plan ────────────────────────────────────────────────────────

/**
 * The ordered wrangler apply commands (safe — no IDs). Never executed unless gated.
 * `replay_safe` steps apply the pinned file directly; a `once` step is represented
 * as a single generated atomic batch (DDL + ledger row).
 */
export function buildApplyCommands(repoRoot, configPath) {
  const manifest = loadManifest(repoRoot).manifest
  const commands = []
  for (const binding of KNOWN_BINDINGS) {
    for (const step of buildPlan(manifest, binding)) {
      commands.push({
        binding, name: step.name, apply: step.apply,
        args: ["d1", "execute", binding, "--file", step.path, "--remote", "--config", configPath],
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

  const manifest = loadManifest(REPO_ROOT).manifest
  for (const binding of KNOWN_BINDINGS) {
    // Reconcile the REMOTE ledger + schema before applying anything in this lane.
    let reconciled
    try {
      const history = readRemoteHistory(binding, configPath)
      reconciled = reconcileFromState(manifest, binding, history, (effect) => remoteProbe(binding, configPath, effect))
    } catch (err) {
      console.error(`cf:d1:migrations:apply: FAILED reading migration history for ${binding} — ${err.message}`)
      process.exit(1)
    }
    if (!reconciled.ok) {
      console.error(`cf:d1:migrations:apply: STOPPED — ${binding} history does not reconcile: ${reconciled.failures.join(", ")}`)
      console.error("Operator action required. Nothing was applied for this lane.")
      process.exit(1)
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
          execRemoteSqlText(binding, configPath, sql, label)
        } else {
          // Pending: SQL + ledger row in ONE file = ONE atomic D1 batch. The
          // migration is never recorded unless its own SQL committed with it.
          execRemoteSqlText(binding, configPath, buildAtomicMigrationBatchSql(sql, step, new Date().toISOString()), label)
        }
      } catch (err) {
        console.error(`cf:d1:migrations:apply: FAILED applying ${step.name} — ${err.message}. Aborting.`)
        process.exit(1)
      }
    }
  }
  console.log("cf:d1:migrations:apply: complete.")
  process.exit(0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
