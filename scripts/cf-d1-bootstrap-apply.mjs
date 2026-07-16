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
import { existsSync, lstatSync, realpathSync, statSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { loadManifest, validateManifest, REGISTRY_BINDING } from "./lib/d1MigrationManifest.mjs"
import { loadSchemaContract } from "./lib/d1SchemaContract.mjs"
import { validateD1Id } from "./lib/cfDeployConfig.mjs"
// ONE shared config-authority implementation — no bootstrap-only variant.
import {
  loadValidatedDeployConfigAuthority, createPrivateExecutionConfig, removePrivateExecutionConfig,
} from "./lib/cfDeployConfigAuthority.mjs"
import {
  BOOTSTRAP_SQL_BASENAME, BOOTSTRAP_SQL_PATH, BOOTSTRAP_ARTIFACT_MAX_BYTES,
  removeBootstrapSql, readOperatorInput, buildBootstrapSql, parseArtifactHeader,
} from "./cf-d1-bootstrap-prepare.mjs"
import { verifyBootstrapVia } from "./lib/d1BootstrapVerify.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const BOOTSTRAP_CONFIRM_PHRASE = "APPLY_PRODUCTION_CONTROL_BOOTSTRAP"
/** The bootstrap may target this binding and NO other. */
export const BOOTSTRAP_BINDING = "CONTROL_DB"
/**
 * The five INSERTs are COMMITTED by the atomic batch before the separate read-only
 * verification runs. A verification failure is therefore NOT a rollback — the rows
 * exist. This is an operator-action state, reported as such.
 */
export const VERIFICATION_FAILED_AFTER_COMMIT = "bootstrap_verification_failed_after_commit"
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

// ─── Canonical artifact binding ──────────────────────────────────

/**
 * Prove the artifact is EXACTLY the canonical SQL that the CURRENTLY validated
 * operator input generates — and return those canonical bytes.
 *
 * WHY: every other gate describes the file (path, type, mode) but says nothing
 * about the bytes Wrangler would execute. At the audited head a 0600 file at the
 * approved path containing `DROP TABLE tenants;` passed every gate. A prepared
 * artifact is a reviewable PLAN; authority comes from the operator environment.
 *
 * This is a reconstruct-and-compare, NOT a keyword scan: `buildBootstrapSql` is
 * re-run against the current values plus the artifact's own parsed `generated_at`
 * (the one thing that cannot be derived from the environment), and the ENTIRE byte
 * sequence is compared. That covers changed values, replaced table names, appended
 * or removed statements, and reordering, with no allow/deny list to outgrow.
 *
 * The header is not trusted as a digest: it supplies only the timestamp, and the
 * executable bytes are independently reconstructed from the environment.
 *
 * Returns `{ ok, sql }` (the canonical bytes) or `{ ok:false, blocked }` — safe
 * categories only, NEVER the differing value, SQL, or file contents.
 */
export function validateCanonicalArtifact({ values, path = BOOTSTRAP_SQL_PATH } = {}) {
  // Size is bounded BEFORE the file is read or parsed.
  let size
  try { size = statSync(path).size } catch { return { ok: false, blocked: ["bootstrap_sql_unreadable"] } }
  if (size > BOOTSTRAP_ARTIFACT_MAX_BYTES) return { ok: false, blocked: ["bootstrap_sql_too_large"] }

  let actual
  try { actual = readFileSync(path, "utf8") } catch { return { ok: false, blocked: ["bootstrap_sql_unreadable"] } }
  // Re-check after reading: `statSync` and `readFileSync` are two syscalls, and the
  // file could have grown between them. Still before anything is parsed.
  if (Buffer.byteLength(actual) > BOOTSTRAP_ARTIFACT_MAX_BYTES) return { ok: false, blocked: ["bootstrap_sql_too_large"] }

  // The bounded, non-sensitive header: format version + one generated_at instant.
  const header = parseArtifactHeader(actual)
  if (!header.ok) return { ok: false, blocked: [header.failure] }

  // Reconstruct from CURRENT authority. A stale artifact — generated from values
  // the operator has since changed — cannot survive this.
  let expected
  try { expected = buildBootstrapSql(values, header.generatedAt) } catch { return { ok: false, blocked: ["bootstrap_sql_format_invalid"] } }

  if (actual === expected) return { ok: true, sql: expected }

  // Classify WITHOUT leaking: content added or removed at the edges reads as
  // non-canonical; a difference inside otherwise-identical structure reads as a
  // value mismatch. Both fail closed identically — the distinction is only an
  // operator hint, and neither category carries any value.
  const noncanonical = actual.startsWith(expected) || expected.startsWith(actual)
  return { ok: false, blocked: [noncanonical ? "bootstrap_sql_noncanonical" : "bootstrap_sql_values_mismatch"] }
}

/**
 * The operator's registry metadata must describe the ACTUAL tenant binding.
 *
 * The registry row tells the runtime resolver which D1 database a tenant's data
 * lives in. If it names a database that is not the deployment's real
 * `TENANT_DB_DEFAULT`, every later tenant resolution is pointed at the wrong (or a
 * non-existent) database — and supplying the CONTROL_DB id here would point tenant
 * data at the control registry itself. Compared in memory; neither value is printed.
 */
export function evaluateRegistryBinding(values, config) {
  const blocked = []
  const bindings = config && Array.isArray(config.d1_databases) ? config.d1_databases : []
  const of = (binding) => bindings.filter((d) => d && d.binding === binding)
  const tenants = of(REGISTRY_BINDING)
  const controls = of(BOOTSTRAP_BINDING)

  // A missing OR duplicated approved binding is unresolvable — never guess which
  // entry was meant.
  if (tenants.length !== 1) return { ok: false, blocked: ["tenant_binding_missing"] }
  if (controls.length !== 1) return { ok: false, blocked: ["control_binding_missing"] }
  const tenant = tenants[0]
  const control = controls[0]

  // Defence in depth: the shared validator already rejects an id collision, but a
  // future caller could hand us a config that never went through it. Writing a
  // registry row that names the CONTROL database as tenant storage would put tenant
  // data in the control registry — refuse independently.
  if (validateD1Id(tenant.database_id).ok && validateD1Id(control.database_id).ok
    && tenant.database_id === control.database_id) {
    blocked.push("control_tenant_database_collision")
  }
  // The operator's tenant id must BE the tenant binding…
  if (values.databaseId !== tenant.database_id) blocked.push("tenant_database_id_mismatch")
  // …and must never be the control binding, even if the two bindings differ.
  if (values.databaseId === control.database_id) blocked.push("control_tenant_database_collision")
  if (values.databaseName !== tenant.database_name) blocked.push("tenant_database_name_mismatch")

  return { ok: blocked.length === 0, blocked: [...new Set(blocked)] }
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
 * Evaluate EVERY gate. Returns `{ ok, blocked, canonicalSql }` — safe reason codes
 * only. `canonicalSql` is the validated canonical byte sequence, returned so the
 * caller executes THOSE bytes rather than re-reading a mutable path.
 *
 * Pure apart from reading the artifact: no SQL, no network, no Wrangler
 * invocation, and it logs nothing.
 */
export function evaluateBootstrapGates({ env = process.env, argv = [], repoRoot = REPO_ROOT, configPath, sqlPath = BOOTSTRAP_SQL_PATH } = {}) {
  const blocked = []
  let canonicalSql = null
  if (!argv.includes("--remote")) blocked.push("missing_remote_flag")
  if (env.CF_D1_BOOTSTRAP_EXECUTE !== "1") blocked.push("missing_execute_flag")
  if (env.CF_D1_BOOTSTRAP_CONFIRM !== BOOTSTRAP_CONFIRM_PHRASE) blocked.push("missing_confirmation")

  // The bootstrap writes the control registry and may target NOTHING else.
  if (parseBindingArg(argv) !== BOOTSTRAP_BINDING) blocked.push("unsupported_binding")

  // The operator input must still validate — the same strict rules `prepare` used,
  // including the CANONICAL schema version. Resolved first: the registry binding
  // and the canonical artifact both need the validated values.
  const input = readOperatorInput(env, repoRoot)
  if (!input.ok) blocked.push("operator_input_invalid")

  // The deploy config is authority-bearing: it decides WHICH database the bytes
  // hit. Loaded + validated ONCE through the SHARED authority library (the same one
  // migration apply, remote verification, and Worker deploy use); never re-read.
  const config = loadValidatedDeployConfigAuthority({ configPath, repoRoot, allowPlaceholderIds: false })
  if (!config.ok) blocked.push(...config.blocked)

  // The registry row must describe the deployment's REAL TENANT_DB_DEFAULT —
  // compared against the SAME snapshot whose bytes will be executed.
  if (input.ok && config.ok) blocked.push(...evaluateRegistryBinding(input.values, config.authority.snapshot).blocked)

  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) blocked.push("manifest_unreadable")
  else if (!validateManifest(loaded.manifest, repoRoot).ok) blocked.push("manifest_invalid")

  const contract = loadSchemaContract(repoRoot)
  if (!contract.ok) blocked.push("schema_contract_unreadable")
  else if (!contract.contract.databases || !contract.contract.databases[BOOTSTRAP_BINDING]) blocked.push("schema_contract_invalid")

  // The generated artifact's path/type/mode. Its BYTES are only read after these
  // pass — never read something we have not first established is a plain private
  // file at the approved location.
  const artifact = inspectBootstrapArtifact(sqlPath, repoRoot)
  if (!artifact.ok) blocked.push(...artifact.blocked)
  else if (input.ok) {
    // The executable bytes must BE the canonical SQL for the current authority.
    const canonical = validateCanonicalArtifact({ values: input.values, path: sqlPath })
    if (!canonical.ok) blocked.push(...canonical.blocked)
    else canonicalSql = canonical.sql
  }

  // Executable bytes AND the config snapshot are handed back ONLY when EVERY gate
  // passed. Returning either alongside a blocked result would let a caller that
  // forgets to check `ok` execute SQL whose registry binding, confirmation, or
  // config was refused.
  const ok = blocked.length === 0
  return {
    ok,
    blocked: [...new Set(blocked)],
    canonicalSql: ok ? canonicalSql : null,
    configAuthority: ok ? config.authority : null,
    // The immutable parsed view, for callers/tests that compare bindings.
    configSnapshot: ok ? config.authority.snapshot : null,
  }
}

// ─── Wrangler surfaces ───────────────────────────────────────────

/**
 * Apply the VALIDATED CANONICAL BYTES as ONE atomic D1 batch.
 *
 * TOCTOU: Wrangler never receives `BOOTSTRAP_SQL_PATH`. Validating the repository-
 * root artifact and then handing that same mutable path to Wrangler would leave a
 * window in which the reviewed bytes and the executed bytes differ. Instead the
 * canonical bytes retained from validation are written to a FRESH random private
 * (0600) temporary file, and only that file is executed. The bytes are never
 * re-read from the original path after validation.
 *
 * `executionConfig` is the PRIVATE config written from the validated snapshot —
 * never the operator's mutable `configPath`, which could have changed since it was
 * validated. The temporary SQL directory is removed unconditionally.
 */
function applyBootstrapFile(executionConfig, canonicalSql) {
  requireAuthorizedExecution()
  const dir = mkdtempSync(resolve(tmpdir(), "d1-bootstrap-exec-"))
  const executionFile = resolve(dir, "bootstrap.exec.sql")
  try {
    writeFileSync(executionFile, canonicalSql, { mode: 0o600 })
    const result = spawnSync(WRANGLER_BIN, ["d1", "execute", BOOTSTRAP_BINDING, "--file", executionFile, "--remote", "--config", executionConfig], {
      cwd: REPO_ROOT, stdio: "inherit",
    })
    if (result.status !== 0) throw new Error("wrangler_apply_failed")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Read-only COUNT query. Output is captured (never inherited) so no value is
 * printed. Uses the SAME private execution config as the apply, so verification
 * can never read a different database than the one that was written.
 */
function remoteCount(executionConfig, sql) {
  requireAuthorizedExecution()
  const result = spawnSync(WRANGLER_BIN, ["d1", "execute", BOOTSTRAP_BINDING, "--command", sql, "--remote", "--json", "--config", executionConfig], {
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
  // Defence in depth: `ok` implies the canonical bytes were produced, but never
  // execute on an assumption — an empty artifact must fail closed, not apply "".
  if (typeof gates.canonicalSql !== "string" || gates.canonicalSql.length === 0) {
    console.error("cf:d1:bootstrap:apply: STOPPED before Wrangler — bootstrap_sql_noncanonical")
    removeBootstrapSql()
    process.exit(1)
  }
  // EVERY gate passed — only now may Wrangler be reached.
  executionAuthorized = true

  const values = readOperatorInput(process.env, REPO_ROOT).values
  let exitCode = 0
  // ONE private execution config, written from the validated snapshot and shared by
  // the apply and every verification query — so the database that is written and the
  // database that is verified can never diverge, and the operator's mutable
  // configPath is never handed to Wrangler.
  let executionConfig = null
  try {
    executionConfig = createPrivateExecutionConfig(gates.configAuthority, { repoRoot: REPO_ROOT, purpose: "bootstrap-exec" })

    // ONE invocation = ONE atomic batch: all five records, or none. The bytes are
    // the ones validation retained — never re-read from the mutable artifact path.
    applyBootstrapFile(executionConfig, gates.canonicalSql)

    // Read-only, category-level verification. Counts only; no row values.
    const verified = verifyBootstrapVia((sql) => remoteCount(executionConfig, sql), values)
    if (!verified.ok) {
      // HONEST STATE: the five INSERTs were COMMITTED by the batch above; this
      // read-only check runs afterwards. A failure here is NOT an atomic rollback —
      // the records exist and require operator investigation. No compensating
      // DELETE is issued: destructive automatic repair of a state we do not
      // understand is how a bad bootstrap becomes data loss.
      console.error(`cf:d1:bootstrap:apply: FAILED — ${VERIFICATION_FAILED_AFTER_COMMIT} (${verified.failures.join(", ")})`)
      console.error("The bootstrap batch was COMMITTED before this read-only verification ran, so the records were NOT rolled back.")
      console.error("Operator investigation is required. This command issues no compensating DELETE.")
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
    // (temporary) execution file, never before. Both the private execution config
    // and the repository-root preparation artifact go, unconditionally.
    removePrivateExecutionConfig(executionConfig)
    removeBootstrapSql()
  }
  process.exit(exitCode)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
