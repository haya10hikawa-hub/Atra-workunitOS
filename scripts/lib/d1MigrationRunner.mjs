/**
 * D1 Migration Runner (P0-FIX-D1-OPERATIONAL-CONTRACT)
 *
 * A thin, reproducible orchestrator over the existing canonical manifest
 * (d1MigrationManifest.mjs) and the applied-once ledger (d1MigrationLedger.mjs).
 * It exposes the three operational verbs the Alpha persistence contract requires
 * — plan, apply, verify — for BOTH bindings (CONTROL_DB, TENANT_DB_DEFAULT), and
 * an explicit local/staging environment gate.
 *
 * REPRODUCIBILITY GUARANTEES (proven by tests/d1MigrationRunner.test.mts and
 * tests/d1OperationalProof.test.mts against a real node:sqlite database):
 *   - fresh apply: an empty database applies every lane migration in order;
 *   - replay:      a second apply is a no-op (ledger-skipped, no destructive work);
 *   - partial:     an already-applied prefix is skipped, the remainder applies;
 *   - drift:       a previously applied migration whose checksum changed fails
 *                  closed (never silently re-applied, never ignored);
 *   - verify:      read-only reconciliation + schema-contract check; unknown state
 *                  fails without attempting destructive repair.
 *
 * SAFETY: never prints database IDs, secrets, identities, or stored rows. All SQL
 * execution goes through the ledger, which records only migration metadata. This
 * module performs NO network access and NO remote D1 mutation.
 */

import {
  loadManifest,
  validateManifest,
  buildAllPlans,
  tenantRegistrySchemaVersion,
  KNOWN_BINDINGS,
} from "./d1MigrationManifest.mjs"

// Re-export so the CLI has a single import surface for the runner + bindings.
export { KNOWN_BINDINGS }
import {
  reconcileLane,
  applyLaneWithLedger,
} from "./d1MigrationLedger.mjs"
import {
  loadSchemaContract,
  verifyDatabase,
  schemaSignature,
} from "./d1SchemaContract.mjs"

// ─── Manifest resolution ─────────────────────────────────────────

/**
 * Load and fully validate the canonical manifest. Fails closed on any manifest
 * defect (duplicate order, missing file, path escape, checksum, wrong lane).
 */
export function resolveValidatedManifest(repoRoot) {
  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const validation = validateManifest(loaded.manifest, repoRoot)
  if (!validation.ok) return { ok: false, error: "manifest_invalid", failures: validation.failures }
  return { ok: true, manifest: loaded.manifest }
}

// ─── plan ────────────────────────────────────────────────────────

/**
 * Deterministic per-binding plan. SAFE fields only (binding, sequence, name,
 * kind, apply mode) — never IDs or SQL. No database access.
 */
export function planAll(repoRoot) {
  const resolved = resolveValidatedManifest(repoRoot)
  if (!resolved.ok) return { ok: false, error: resolved.error, failures: resolved.failures, plans: {}, lines: [] }
  const plans = buildAllPlans(resolved.manifest)
  const lines = []
  for (const binding of KNOWN_BINDINGS) {
    lines.push(`${binding}:`)
    for (const step of plans[binding]) {
      lines.push(`  [${step.sequence}] ${step.name}  (kind=${step.kind}, apply=${step.apply})`)
    }
  }
  return { ok: true, plans, lines }
}

// ─── apply ───────────────────────────────────────────────────────

/**
 * Apply every lane through the ledger. `dbFor(binding)` returns a node:sqlite
 * `DatabaseSync` handle for that binding's physical database. Applying is
 * deterministic and reproducible: re-running against an already-migrated database
 * is a no-op (the ledger skips satisfied migrations). Returns per-binding applied
 * and skipped step names — metadata only.
 *
 * `now` is injectable for deterministic ledger timestamps in tests.
 */
export function applyAll(dbFor, repoRoot, options = {}) {
  const resolved = resolveValidatedManifest(repoRoot)
  if (!resolved.ok) return { ok: false, error: resolved.error, failures: resolved.failures, perBinding: {} }
  const result = {}
  for (const binding of KNOWN_BINDINGS) {
    const db = dbFor(binding)
    result[binding] = applyLaneWithLedger(db, resolved.manifest, binding, repoRoot, options)
  }
  return { ok: true, perBinding: result }
}

// ─── verify ──────────────────────────────────────────────────────

/**
 * Read-only verification. For each binding: reconcile the manifest lane against
 * the ledger and the real schema (fails closed on drift / missing history /
 * unknown state — NO destructive repair), then check the schema against the
 * committed schema-contract. Returns per-binding results and an overall `ok`.
 */
export function verifyAll(dbFor, repoRoot) {
  const resolved = resolveValidatedManifest(repoRoot)
  if (!resolved.ok) return { ok: false, error: resolved.error, failures: resolved.failures, perBinding: {} }
  const contract = loadSchemaContract(repoRoot)
  if (!contract.ok) return { ok: false, error: "schema_contract_invalid", perBinding: {} }

  const perBinding = {}
  let ok = true
  for (const binding of KNOWN_BINDINGS) {
    const db = dbFor(binding)
    const reconciled = reconcileLane(db, resolved.manifest, binding)
    const section = contract.contract.databases?.[binding]
    let schema = { ok: true, failures: [] }
    if (section) {
      try {
        schema = verifyDatabase(db, section)
      } catch (err) {
        schema = { ok: false, failures: [`schema_verify_threw:${String(err?.message ?? err)}`] }
      }
    }
    const bindingOk = reconciled.ok && schema.ok
    if (!bindingOk) ok = false
    perBinding[binding] = {
      ledger: { ok: reconciled.ok, failures: reconciled.failures, states: reconciled.steps.map((s) => ({ name: s.name, state: s.state })) },
      schema: { ok: schema.ok, failures: schema.failures },
    }
  }
  return { ok, perBinding }
}

// ─── Registry ↔ migration-evidence coupling ──────────────────────

/**
 * The canonical tenant schema version from the manifest registry, or null if the
 * manifest does not validate or declares no valid version. Never reads or exposes
 * a stored registry value.
 */
export function canonicalTenantSchemaVersion(repoRoot) {
  const resolved = resolveValidatedManifest(repoRoot)
  if (!resolved.ok) return null
  return tenantRegistrySchemaVersion(resolved.manifest)
}

const TENANT_DATA_BINDING = "TENANT_DB_DEFAULT"
const CONTROL_BINDING = "CONTROL_DB"
const REGISTRY_ROW_SQL = "SELECT schema_version, status FROM tenant_databases WHERE tenant_id = ?"

/**
 * Couple the ACTUAL stored registry row to migration evidence for one connected
 * database pair. The function ITSELF reads `tenant_databases.schema_version` from
 * `controlDb` by tenant id and derives the canonical version from the validated
 * manifest — so a caller cannot satisfy it with a supplied constant. It then
 * reconciles the ROUTED `tenantDb` ledger and verifies that same tenant DB's
 * physical schema against the contract.
 *
 * `controlDb` / `tenantDb` are node:sqlite handles (the same handles the routing
 * proof uses). Returns SAFE booleans only — never the registry version, tenant id,
 * database id, SQL, or any row value.
 */
export function verifyTenantDatabaseCoupling({ controlDb, tenantDb, tenantId, repoRoot }) {
  const result = {
    ok: false,
    registry_row_present: false,
    registry_mapping_active: false,
    registry_version_matches_manifest: false,
    ledger_matches_manifest: false,
    physical_schema_matches_contract: false,
    binding_matches_contract: false,
  }

  // 1. Read the ACTUAL registry row by tenant id (never echoed).
  let row = null
  try {
    row = controlDb.prepare(REGISTRY_ROW_SQL).get(tenantId) ?? null
  } catch {
    return result
  }
  result.registry_row_present = row !== null
  if (!row) return result
  result.registry_mapping_active = String(row.status) === "active"

  // 2. Canonical version from the validated manifest (not a caller constant).
  const canonical = canonicalTenantSchemaVersion(repoRoot)
  result.registry_version_matches_manifest =
    typeof canonical === "string" && String(row.schema_version) === canonical

  // 3. Reconcile the ROUTED tenant DB's ledger against the manifest.
  const manifestResolved = resolveValidatedManifest(repoRoot)
  if (manifestResolved.ok) {
    try {
      result.ledger_matches_manifest = reconcileLane(tenantDb, manifestResolved.manifest, TENANT_DATA_BINDING).ok === true
    } catch { /* leaves false */ }
  }

  // 4. Verify the ROUTED tenant DB's physical schema against the contract, and
  //    prove it is the TENANT binding (satisfies TENANT section, NOT the CONTROL
  //    section — wrong-lane detection).
  const contract = loadSchemaContract(repoRoot)
  if (contract.ok) {
    const tenantSection = contract.contract.databases?.[TENANT_DATA_BINDING]
    const controlSection = contract.contract.databases?.[CONTROL_BINDING]
    try {
      const asTenant = tenantSection ? verifyDatabase(tenantDb, tenantSection).ok === true : false
      result.physical_schema_matches_contract = asTenant
      const asControl = controlSection ? verifyDatabase(tenantDb, controlSection).ok === true : false
      result.binding_matches_contract = asTenant && !asControl
    } catch { /* leaves false */ }
  }

  result.ok =
    result.registry_row_present &&
    result.registry_mapping_active &&
    result.registry_version_matches_manifest &&
    result.ledger_matches_manifest &&
    result.physical_schema_matches_contract &&
    result.binding_matches_contract
  return result
}

// ─── Environment / flag gate (local vs staging separation) ───────

export const KNOWN_ENVIRONMENTS = ["local", "staging"]
export const KNOWN_VERBS = ["plan", "apply", "verify", "preflight"]

// ─── Trusted staging context validation ──────────────────────────
//
// Cloudflare account IDs are 32 lowercase hex characters; project (Worker) names
// follow the repository's conservative naming allowlist (lowercase alphanumerics
// and dashes, bounded — mirrors scripts/lib/cfDeployConfig.mjs `D1_NAME_RE`).
const CF_ACCOUNT_ID_RE = /^[0-9a-f]{32}$/
const CF_PROJECT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/
const CONTROL_CHAR_RE = /[ -]/
const MAX_CONTEXT_LENGTH = 128

/** A context field is "configured" only when set to a non-empty (trimmed) string. */
function isConfigured(value) {
  return typeof value === "string" && value.trim().length > 0
}

function isValidAccountId(value) {
  return typeof value === "string" && value.length <= MAX_CONTEXT_LENGTH && !CONTROL_CHAR_RE.test(value) && CF_ACCOUNT_ID_RE.test(value)
}

function isValidProjectName(value) {
  return typeof value === "string" && value.length <= MAX_CONTEXT_LENGTH && !CONTROL_CHAR_RE.test(value) && CF_PROJECT_NAME_RE.test(value)
}

/**
 * Classify the trusted staging context. BOTH `CF_STAGING_ACCOUNT_ID` and
 * `CF_STAGING_PROJECT` are authoritative and required. Returns a safe category —
 * never the values.
 *   neither configured        → staging_context_unconfigured
 *   exactly one configured     → staging_context_incomplete
 *   both configured, malformed → staging_context_invalid
 *   both configured, valid     → { ok, value: { account, project } }
 */
export function evaluateTrustedStagingContext(expected = {}) {
  const acct = isConfigured(expected.account)
  const proj = isConfigured(expected.project)
  if (!acct && !proj) return { ok: false, error: "staging_context_unconfigured" }
  if (acct !== proj) return { ok: false, error: "staging_context_incomplete" }
  const account = expected.account.trim()
  const project = expected.project.trim()
  if (!isValidAccountId(account) || !isValidProjectName(project)) {
    return { ok: false, error: "staging_context_invalid" }
  }
  return { ok: true, value: { account, project } }
}

/**
 * Caller `--account`/`--project` are ASSERTIONS, not authority. Contract: supply
 * BOTH or NEITHER. A partial assertion fails closed
 * (`staging_context_assertion_incomplete`); when both are present they must equal
 * the trusted context (`unexpected_cloudflare_context`); when neither is present
 * the trusted context governs the (future) executor. Values are never returned.
 */
export function evaluateCallerAssertions(flags, trusted) {
  const acctAsserted = flags.account !== null && flags.account !== undefined
  const projAsserted = flags.project !== null && flags.project !== undefined
  if (acctAsserted !== projAsserted) return { ok: false, error: "staging_context_assertion_incomplete" }
  if (!acctAsserted) return { ok: true }
  if (flags.account !== trusted.account || flags.project !== trusted.project) {
    return { ok: false, error: "unexpected_cloudflare_context" }
  }
  return { ok: true }
}

/**
 * Parse `argv` (the slice after the verb) into a normalized invocation. Unknown
 * flags fail closed. `--account`/`--project` are OPTIONAL context assertions used
 * to detect an unexpected Cloudflare account/project; they are compared, never
 * printed.
 */
export function parseMigrateArgs(argv) {
  const flags = { environment: null, remote: false, confirmStaging: false, account: null, project: null }
  const unknown = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--remote") flags.remote = true
    else if (arg === "--confirm-staging") flags.confirmStaging = true
    else if (arg === "--environment") flags.environment = argv[++i] ?? ""
    else if (arg.startsWith("--environment=")) flags.environment = arg.slice("--environment=".length)
    else if (arg === "--account") flags.account = argv[++i] ?? ""
    else if (arg.startsWith("--account=")) flags.account = arg.slice("--account=".length)
    else if (arg === "--project") flags.project = argv[++i] ?? ""
    else if (arg.startsWith("--project=")) flags.project = arg.slice("--project=".length)
    else unknown.push(arg)
  }
  return { flags, unknown }
}

/**
 * Validate a verb + flags combination against the environment separation rules.
 * Returns `{ ok: true, plan }` (with `plan.remote` always `false` in this build)
 * or `{ ok: false, error }` with a stable, disclosure-free category.
 *
 * `expected` is the RAW trusted staging context `{ account?, project? }` from the
 * operator env — validated here via `evaluateTrustedStagingContext`. `--account` /
 * `--project` are caller ASSERTIONS, validated via `evaluateCallerAssertions`.
 * Neither trusted nor asserted values are ever returned or logged.
 *
 * Command capability in this PR:
 *   plan       — offline, any env, context-free (rejects account/project/remote).
 *   apply/verify local — hermetic, offline.
 *   preflight  — STAGING ONLY, offline; validates complete trusted context and
 *                complete-or-absent caller assertions. No network, no `--remote`.
 *   apply/verify staging — a remote executor is NOT implemented in this PR and is
 *                fails closed with `staging_remote_execution_not_available`.
 */
export function validateInvocation(verb, flags, unknown = [], expected = {}) {
  if (!KNOWN_VERBS.includes(verb)) return { ok: false, error: "unknown_verb" }
  if (unknown.length > 0) return { ok: false, error: "unknown_flag" }

  const env = flags.environment
  if (env === "production" || env === "prod") return { ok: false, error: "production_environment_forbidden" }
  if (!KNOWN_ENVIRONMENTS.includes(env)) return { ok: false, error: "unknown_environment" }

  // Planning is offline and context-free for ANY environment.
  if (verb === "plan") {
    if (flags.remote) return { ok: false, error: "remote_flag_forbidden_for_plan" }
    if (flags.account !== null || flags.project !== null) return { ok: false, error: "context_assertion_not_allowed_for_plan" }
    return { ok: true, plan: { verb, environment: env, remote: false } }
  }

  // Staging PREFLIGHT: offline validation of the staging authority contract.
  if (verb === "preflight") {
    if (env !== "staging") return { ok: false, error: "preflight_requires_staging_environment" }
    if (flags.remote) return { ok: false, error: "remote_flag_forbidden_for_preflight" }
    if (flags.confirmStaging) return { ok: false, error: "confirm_staging_not_allowed_for_preflight" }
    const trusted = evaluateTrustedStagingContext(expected)
    if (!trusted.ok) return { ok: false, error: trusted.error }
    const assertions = evaluateCallerAssertions(flags, trusted.value)
    if (!assertions.ok) return { ok: false, error: assertions.error }
    return { ok: true, plan: { verb: "preflight", environment: "staging", remote: false } }
  }

  // apply / verify.
  if (env === "local") {
    if (flags.remote) return { ok: false, error: "remote_flag_forbidden_for_local" }
    if (flags.confirmStaging) return { ok: false, error: "staging_confirmation_forbidden_for_local" }
    if (flags.account !== null || flags.project !== null) return { ok: false, error: "context_assertion_not_allowed_for_local" }
    return { ok: true, plan: { verb, environment: "local", remote: false } }
  }

  // apply / verify against staging would be a remote operation. No remote executor
  // exists in this PR — fail closed and direct the operator to `preflight`.
  return { ok: false, error: "staging_remote_execution_not_available" }
}

/**
 * Load the RAW trusted staging Cloudflare context from operator-provided,
 * staging-only environment variables. These are NEVER committed and NEVER printed.
 * Returns `{ account?, project? }` carrying the raw (untrimmed) env value when the
 * variable is set — classification/validation is done by
 * `evaluateTrustedStagingContext`, so an empty or malformed value is distinguished
 * from an absent one. `env` is injectable for tests; defaults to `process.env`.
 */
export function loadTrustedStagingContext(env = process.env) {
  const context = {}
  if (typeof env.CF_STAGING_ACCOUNT_ID === "string") context.account = env.CF_STAGING_ACCOUNT_ID
  if (typeof env.CF_STAGING_PROJECT === "string") context.project = env.CF_STAGING_PROJECT
  return context
}

// ─── Hermetic local run with a single cleanup authority ──────────

const FIXED_NOW = () => "2026-01-01T00:00:00.000Z"

/** Map a thrown error to a bounded, disclosure-free category. */
function safeHermeticCategory(err) {
  const m = err && typeof err.message === "string" ? err.message : ""
  if (/^[a-z0-9_]{1,40}$/.test(m)) return m
  return "hermetic_run_failed"
}

/**
 * Run a hermetic local `apply`/`verify` under ONE cleanup authority so that NO
 * temporary state can leak — including when a database fails to open partway
 * through, or apply/verify/removal throw.
 *
 * All effectful operations are injected so tests can force failures:
 *   makeTempRoot()          → temp root path (registered immediately)
 *   openDatabase(root, b)   → a handle (each tracked as created)
 *   closeHandle(h)          → close one handle (best-effort)
 *   removeRoot(root)        → remove the temp root (throws on failure)
 *   rootExists(root)        → verify removal
 *
 * Returns safe booleans/categories only. `cleanup` is reported true ONLY after the
 * root's removal is verified. On any failure, every opened handle is closed and the
 * root is removed before returning.
 */
export function runHermeticLocal(options) {
  const {
    verb,
    repoRoot,
    makeTempRoot,
    openDatabase,
    closeHandle,
    removeRoot,
    rootExists,
    applyAllFn = applyAll,
    verifyAllFn = verifyAll,
    schemaSignatureFn = schemaSignature,
    now = FIXED_NOW,
  } = options

  const flags = { fresh_apply: false, replay_noop: false, verify_ok: false, cleanup: false }
  let root = null
  const opened = []
  let runError = null

  try {
    // Register the temp root IMMEDIATELY so it is always subject to cleanup.
    root = makeTempRoot()
    const handles = {}
    for (const binding of KNOWN_BINDINGS) {
      const handle = openDatabase(root, binding) // may throw mid-way
      handles[binding] = handle
      opened.push(handle) // track as created
    }
    const dbFor = (binding) => handles[binding]

    const fresh = applyAllFn(dbFor, repoRoot, { now })
    if (!fresh.ok) throw new Error("fresh_apply_failed")
    flags.fresh_apply = KNOWN_BINDINGS.every((b) => fresh.perBinding[b].applied.length > 0)

    if (verb === "apply") {
      const before = KNOWN_BINDINGS.map((b) => schemaSignatureFn(handles[b]))
      const replay = applyAllFn(dbFor, repoRoot, { now })
      if (!replay.ok) throw new Error("replay_failed")
      const after = KNOWN_BINDINGS.map((b) => schemaSignatureFn(handles[b]))
      flags.replay_noop = before.every((sig, i) => sig === after[i])
    }

    const verified = verifyAllFn(dbFor, repoRoot)
    flags.verify_ok = verified.ok === true
  } catch (err) {
    runError = safeHermeticCategory(err)
  }

  // ── Single cleanup authority: close every opened handle, remove the root, and
  //    verify removal — regardless of how (or whether) the run above failed.
  let cleanupError = null
  for (const handle of opened) {
    try { closeHandle(handle) } catch { /* best-effort close */ }
  }
  if (root !== null) {
    try {
      removeRoot(root)
      if (rootExists(root)) cleanupError = "cleanup_root_not_removed"
      else flags.cleanup = true
    } catch {
      cleanupError = "cleanup_root_removal_failed"
    }
  } else {
    // The temp root was never created (makeTempRoot threw) — nothing to remove.
    flags.cleanup = true
  }

  const relevant = verb === "apply"
    ? ["fresh_apply", "replay_noop", "verify_ok", "cleanup"]
    : ["fresh_apply", "verify_ok", "cleanup"]
  const ok = !runError && !cleanupError && relevant.every((k) => flags[k] === true)
  return { ok, flags, runError, cleanupError, reported: Object.fromEntries(relevant.map((k) => [k, flags[k]])) }
}
