#!/usr/bin/env node
/**
 * cf:d1:bootstrap:apply (P0-PERSIST-015) — OPERATOR-GATED production Control DB bootstrap.
 *
 * The repository-controlled apply path for the SQL produced by
 * `cf:d1:bootstrap:prepare`. Before this command existed, `CF_D1_BOOTSTRAP_EXECUTE=1`
 * was documented as a gate but controlled no write path at all, and the documented
 * workflow ended in a raw `wrangler d1 execute --remote` that bypassed every check.
 *
 * Applies the bootstrap to REMOTE D1 ONLY when EVERY gate passes:
 *   - explicit `--remote`;
 *   - a validated generated deploy config with REAL, non-placeholder D1 IDs;
 *   - the target binding is EXACTLY `CONTROL_DB`;
 *   - the generated `bootstrap.control.sql` exists;
 *   - it is a PLAIN FILE (never a symlink);
 *   - it is at the approved repository-root location;
 *   - its permissions are no broader than 0600;
 *   - `CF_D1_BOOTSTRAP_EXECUTE=1`;
 *   - `CF_D1_BOOTSTRAP_CONFIRM=APPLY_PRODUCTION_CONTROL_BOOTSTRAP`;
 *   - the migration manifest and Control DB schema contract are valid.
 * Without ALL of them it STOPS before invoking Wrangler.
 *
 * ATOMICITY: the file is applied by exactly ONE `wrangler d1 execute --file`
 * invocation, which D1 runs as a single implicit atomic batch (verified against
 * pinned Wrangler 4.99.0 — D1 rejects explicit BEGIN/COMMIT). All five records
 * commit, or none do.
 *
 * AFTER a successful write it runs READ-ONLY, CATEGORY-LEVEL verification of the
 * Control DB state (counts only — never row values).
 *
 * CLEANUP: the generated SQL is removed on EVERY exit path — success, Wrangler
 * failure, verification failure, or an unexpected throw.
 *
 * SAFETY: no operator value (tenant/user/email/subject/database id) is ever logged.
 * This patch never sets the execution variables and never performs a bootstrap.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, realpathSync } from "node:fs"
import { loadManifest, validateManifest } from "./lib/d1MigrationManifest.mjs"
import { loadSchemaContract } from "./lib/d1SchemaContract.mjs"
import { loadConfigFile, validateDeployConfig } from "./lib/cfDeployConfig.mjs"
import { BOOTSTRAP_SQL_BASENAME, BOOTSTRAP_SQL_PATH, removeBootstrapSql, readOperatorInput } from "./cf-d1-bootstrap-prepare.mjs"
import { verifyBootstrapVia } from "./lib/d1BootstrapVerify.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const BOOTSTRAP_CONFIRM_PHRASE = "APPLY_PRODUCTION_CONTROL_BOOTSTRAP"
/** The bootstrap may target this binding and NO other. */
export const BOOTSTRAP_BINDING = "CONTROL_DB"
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

// ─── Execution authorization latch ───────────────────────────────

/**
 * Wrangler is unreachable until EVERY gate has passed. A runtime latch, not a
 * convention: each Wrangler-invoking helper calls `requireAuthorizedExecution()`
 * first, and only `main()` opens the latch, only after all gates returned ok.
 */
let executionAuthorized = false
function requireAuthorizedExecution() {
  if (!executionAuthorized) throw new Error("gate_bypass_attempt")
}

// ─── Gates ───────────────────────────────────────────────────────

/**
 * Inspect the generated SQL file. Returns safe category codes only — never the
 * file contents and never an operator value.
 */
export function inspectBootstrapArtifact(path = BOOTSTRAP_SQL_PATH, repoRoot = REPO_ROOT) {
  const blocked = []
  if (!existsSync(path)) return { ok: false, blocked: ["bootstrap_sql_missing"] }

  let stats
  try { stats = lstatSync(path) } catch { return { ok: false, blocked: ["bootstrap_sql_missing"] } }

  // A symlink could point anywhere — refuse before reading or handing it to Wrangler.
  if (stats.isSymbolicLink()) blocked.push("bootstrap_sql_symlink")
  else if (!stats.isFile()) blocked.push("bootstrap_sql_not_plain_file")

  // Exactly the approved repository-root location, resolved for real.
  const approved = resolve(repoRoot, BOOTSTRAP_SQL_BASENAME)
  if (resolve(path) !== approved) blocked.push("bootstrap_sql_unapproved_location")
  else if (!stats.isSymbolicLink()) {
    const real = (() => { try { return realpathSync(path) } catch { return null } })()
    const realApproved = (() => { try { return realpathSync(repoRoot) } catch { return resolve(repoRoot) } })()
    if (!real || !real.startsWith(realApproved)) blocked.push("bootstrap_sql_unapproved_location")
  }

  // Permissions must be no broader than 0600 — never group/world readable.
  const mode = stats.mode & 0o777
  if ((mode & ~0o600) !== 0) blocked.push("bootstrap_sql_permissions_too_broad")

  return { ok: blocked.length === 0, blocked }
}

/** The requested target binding (defaults to CONTROL_DB). */
export function parseBindingArg(argv) {
  const i = argv.indexOf("--binding")
  return i >= 0 && argv[i + 1] ? argv[i + 1] : BOOTSTRAP_BINDING
}

function parseConfigArg(argv) {
  const i = argv.indexOf("--config")
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : undefined
}

/**
 * Evaluate EVERY gate. Returns `{ ok, blocked }` — safe reason codes only.
 * Pure: performs no SQL, no network, no Wrangler invocation, and logs nothing.
 */
export function evaluateBootstrapGates({ env = process.env, argv = [], repoRoot = REPO_ROOT, configPath, sqlPath = BOOTSTRAP_SQL_PATH } = {}) {
  const blocked = []
  if (!argv.includes("--remote")) blocked.push("missing_remote_flag")
  if (env.CF_D1_BOOTSTRAP_EXECUTE !== "1") blocked.push("missing_execute_flag")
  if (env.CF_D1_BOOTSTRAP_CONFIRM !== BOOTSTRAP_CONFIRM_PHRASE) blocked.push("missing_confirmation")

  // The bootstrap writes the control registry and may target NOTHING else.
  if (parseBindingArg(argv) !== BOOTSTRAP_BINDING) blocked.push("unsupported_binding")

  if (!configPath) blocked.push("missing_config")
  else {
    const cfg = loadConfigFile(configPath)
    if (!cfg.ok) blocked.push("deploy_config_unreadable")
    else {
      // allowPlaceholderIds:false ⇒ a placeholder/synthetic D1 id fails closed.
      const v = validateDeployConfig(cfg.config, { configPath, repoRoot, allowPlaceholderIds: false })
      if (!v.ok) blocked.push("deploy_config_invalid")
    }
  }

  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) blocked.push("manifest_unreadable")
  else if (!validateManifest(loaded.manifest, repoRoot).ok) blocked.push("manifest_invalid")

  const contract = loadSchemaContract(repoRoot)
  if (!contract.ok) blocked.push("schema_contract_unreadable")
  else if (!contract.contract.databases || !contract.contract.databases[BOOTSTRAP_BINDING]) blocked.push("schema_contract_invalid")

  // The generated artifact itself.
  const artifact = inspectBootstrapArtifact(sqlPath, repoRoot)
  if (!artifact.ok) blocked.push(...artifact.blocked)

  // The operator input must still validate — the same strict rules `prepare` used.
  const input = readOperatorInput(env)
  if (!input.ok) blocked.push("operator_input_invalid")

  return { ok: blocked.length === 0, blocked }
}

// ─── Wrangler surfaces ───────────────────────────────────────────

/** Apply the generated file as ONE atomic D1 batch. */
function applyBootstrapFile(configPath, sqlPath) {
  requireAuthorizedExecution()
  const result = spawnSync(WRANGLER_BIN, ["d1", "execute", BOOTSTRAP_BINDING, "--file", sqlPath, "--remote", "--config", configPath], {
    cwd: REPO_ROOT, stdio: "inherit",
  })
  if (result.status !== 0) throw new Error("wrangler_apply_failed")
}

/** Read-only COUNT query. Output is captured (never inherited) so no value is printed. */
function remoteCount(configPath, sql) {
  requireAuthorizedExecution()
  const result = spawnSync(WRANGLER_BIN, ["d1", "execute", BOOTSTRAP_BINDING, "--command", sql, "--remote", "--json", "--config", configPath], {
    cwd: REPO_ROOT, encoding: "utf8",
  })
  if (result.status !== 0) throw new Error("remote_verify_query_failed")
  let parsed
  try { parsed = JSON.parse(result.stdout) } catch { throw new Error("remote_verify_query_unparseable") }
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  return (first && Array.isArray(first.results)) ? first.results : []
}

// ─── Main ────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2)
  const configPath = parseConfigArg(argv)
  const gates = evaluateBootstrapGates({ env: process.env, argv, repoRoot: REPO_ROOT, configPath })
  if (!gates.ok) {
    // Field/category names only — never an operator value.
    console.error(`cf:d1:bootstrap:apply: STOPPED before Wrangler — gate(s) not satisfied: ${gates.blocked.join(", ")}`)
    console.error(`Required: --remote --config wrangler.deploy.json, CF_D1_BOOTSTRAP_EXECUTE=1, CF_D1_BOOTSTRAP_CONFIRM=${BOOTSTRAP_CONFIRM_PHRASE}, a 0600 plain-file ${BOOTSTRAP_SQL_BASENAME} at the repository root, valid manifest + schema contract + deploy config.`)
    // A stale artifact must not survive a refused apply.
    removeBootstrapSql()
    process.exit(1)
  }
  // EVERY gate passed — only now may Wrangler be reached.
  executionAuthorized = true

  const values = readOperatorInput(process.env).values
  let exitCode = 0
  try {
    // ONE invocation = ONE atomic batch: all five records, or none.
    applyBootstrapFile(configPath, BOOTSTRAP_SQL_PATH)

    // Read-only, category-level verification. Counts only; no row values.
    const verified = verifyBootstrapVia((sql) => remoteCount(configPath, sql), values)
    if (!verified.ok) {
      console.error(`cf:d1:bootstrap:apply: FAILED post-bootstrap verification — ${verified.failures.join(", ")}`)
      exitCode = 1
    } else {
      console.log("cf:d1:bootstrap:apply: OK (atomic bootstrap applied; control registry verified: tenant, registry, user, membership, identity).")
    }
  } catch (err) {
    console.error(`cf:d1:bootstrap:apply: FAILED — ${err instanceof Error ? err.message : "apply_failed"}`)
    exitCode = 1
  } finally {
    // Guaranteed cleanup on EVERY path: success, Wrangler failure, verification
    // failure, or an unexpected throw. Only ever runs AFTER Wrangler has read the
    // file, never before.
    removeBootstrapSql()
  }
  process.exit(exitCode)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
