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

// ─── Environment / flag gate (local vs staging separation) ───────

export const KNOWN_ENVIRONMENTS = ["local", "staging"]
export const KNOWN_VERBS = ["plan", "apply", "verify"]

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
 * Returns `{ ok: true, plan }` where `plan.remote` states whether the invocation
 * is a remote operation (true only for authorized staging apply/verify), or
 * `{ ok: false, error }` with a stable, disclosure-free category.
 *
 * `expected` may carry `{ account, project }` — the deploy-config's Cloudflare
 * context — so a mismatch with the caller-asserted `--account`/`--project` fails
 * closed as `unexpected_cloudflare_context`.
 */
export function validateInvocation(verb, flags, unknown = [], expected = {}) {
  if (!KNOWN_VERBS.includes(verb)) return { ok: false, error: "unknown_verb" }
  if (unknown.length > 0) return { ok: false, error: "unknown_flag" }

  const env = flags.environment
  if (env === "production" || env === "prod") return { ok: false, error: "production_environment_forbidden" }
  if (!KNOWN_ENVIRONMENTS.includes(env)) return { ok: false, error: "unknown_environment" }

  if (env === "local") {
    // A local command may never carry remote intent or staging confirmation.
    if (flags.remote) return { ok: false, error: "remote_flag_forbidden_for_local" }
    if (flags.confirmStaging) return { ok: false, error: "staging_confirmation_forbidden_for_local" }
    return { ok: true, plan: { verb, environment: "local", remote: false } }
  }

  // env === "staging"
  // Cloudflare context assertion: when the deploy config declares an account /
  // project, a caller-supplied value that disagrees fails closed.
  if (expected.account && flags.account && flags.account !== expected.account) {
    return { ok: false, error: "unexpected_cloudflare_context" }
  }
  if (expected.project && flags.project && flags.project !== expected.project) {
    return { ok: false, error: "unexpected_cloudflare_context" }
  }

  if (verb === "plan") {
    // Planning is offline for any environment (prints the safe plan, no network).
    return { ok: true, plan: { verb, environment: "staging", remote: false } }
  }

  // apply / verify against staging are remote operations and require --remote.
  if (!flags.remote) return { ok: false, error: "remote_flag_required_for_staging" }
  if (verb === "apply" && !flags.confirmStaging) {
    return { ok: false, error: "staging_confirmation_required" }
  }
  return { ok: true, plan: { verb, environment: "staging", remote: true } }
}
