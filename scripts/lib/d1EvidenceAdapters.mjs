/**
 * D1 Evidence Adapters — observational mapping from existing operator-command
 * results to safe evidence operations (P0-OPS-016, Issue #155)
 *
 * Each adapter takes the SAFE outputs the existing gated commands already produce
 * (exit codes, `{ ok, failures, authorityDigest }` results, safe category lists)
 * and returns exactly one shape:
 *
 *   { operation, status, authorityDigest, resultDigest, safeCategories }
 *
 * NOTHING ELSE is ever included: no config path, no SQL path, no database ID or
 * name, no raw output, no operator input. Raw inputs are scanned BEFORE
 * normalization, so a sensitive value cannot be laundered into a safe-looking
 * category.
 *
 * ADAPTERS DO NOT AUTHORIZE. They never read or set an execute flag or a
 * confirmation phrase, never spawn a process, and never touch the network or a
 * database. Every existing operator gate (CF_DEPLOY_EXECUTE, the migration
 * execute flag + confirmation phrase, the bootstrap execute flag + confirmation
 * phrase) remains exactly as it is — the operator supplies each one directly.
 */

import { loadEvidenceContract, scanSensitiveEvidence, canonicalSerialize, sha256Hex } from "./d1OperationalEvidence.mjs"

const SHA256_RE = /^[0-9a-f]{64}$/
const SAFE_CATEGORY_RE = /^[a-z][a-z0-9_]{0,47}$/
/** The exact allowlisted keys of a safe operation-evidence object. */
export const SAFE_EVIDENCE_KEYS = Object.freeze(["operation", "status", "authorityDigest", "resultDigest", "safeCategories"])

/**
 * Normalize an already-scanned category string into the evidence category form:
 * lowercase, `[a-z0-9_]` only, bounded length. Existing command failures such as
 * `CONTROL_DB:missing_table:x` become `control_db_missing_table_x`.
 */
export function normalizeSafeCategory(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)
}

/**
 * Build ONE safe operation-evidence object. `rawCategories` are scanned BEFORE
 * normalization (rejecting UUIDs, emails, tokens, SQL, raw output, …), then
 * normalized. The result digest is the SHA-256 of the canonical serialization of
 * the safe result itself — never of any raw command output.
 */
export function buildOperationEvidence(operation, { status, authorityDigest, safeCategories = [] } = {}, { repoRoot } = {}) {
  const loaded = loadEvidenceContract(repoRoot)
  if (!loaded.ok) return { ok: false, blocked: loaded.blocked }
  const contract = loaded.contract
  const blocked = []
  if (!contract.operations.includes(operation)) blocked.push("operation_unknown")
  if (!contract.statuses.includes(status)) blocked.push("status_invalid")
  if (typeof authorityDigest !== "string" || !SHA256_RE.test(authorityDigest)) blocked.push("authority_digest_invalid")
  if (!Array.isArray(safeCategories) || safeCategories.length > contract.limits.max_safe_categories_per_operation) {
    blocked.push("safe_categories_invalid")
    return { ok: false, blocked: [...new Set(blocked)] }
  }

  // Scan the RAW inputs first — normalization must never launder a sensitive
  // value (an email or UUID with its separators replaced is still sensitive).
  for (const raw of safeCategories) {
    if (typeof raw !== "string") { blocked.push("safe_categories_invalid"); continue }
    for (const category of scanSensitiveEvidence(raw, contract)) blocked.push(category)
  }

  const normalized = []
  for (const raw of safeCategories.filter((value) => typeof value === "string")) {
    const category = normalizeSafeCategory(raw)
    if (category.length === 0) continue
    if (!SAFE_CATEGORY_RE.test(category)) { blocked.push("safe_categories_invalid"); continue }
    for (const found of scanSensitiveEvidence(category, contract)) blocked.push(found)
    normalized.push(category)
  }

  if (blocked.length > 0) return { ok: false, blocked: [...new Set(blocked)] }
  const resultDigest = sha256Hex(canonicalSerialize({ operation, safe_categories: normalized, status }))
  return {
    ok: true,
    evidence: Object.freeze({
      operation, status, authorityDigest, resultDigest,
      safeCategories: Object.freeze(normalized),
    }),
  }
}

// ─── Per-command adapters ─────────────────────────────────────────
// One thin, named adapter per existing operator command. Each consumes ONLY the
// safe fields that command already exposes.

/** cf:d1:migrations:check / :plan — offline plan verification. */
export function evidenceFromMigrationPlanCheck({ ok, authorityDigest, safeCategories = [] } = {}, options = {}) {
  return buildOperationEvidence("migration_plan_verified", { status: ok === true ? "success" : "failed", authorityDigest, safeCategories }, options)
}

/** cf:d1:migrations:apply — operator-gated remote migration apply (exit code only). */
export function evidenceFromMigrationApply({ exitCode, authorityDigest, safeCategories = [] } = {}, options = {}) {
  return buildOperationEvidence("migration_apply_completed", { status: exitCode === 0 ? "success" : "failed", authorityDigest, safeCategories }, options)
}

/** cf:d1:schema:verify:remote — consumes its `{ ok, failures, authorityDigest }`. */
export function evidenceFromRemoteSchemaVerification(result = {}, options = {}) {
  return buildOperationEvidence("remote_schema_verified", {
    status: result.ok === true ? "success" : "failed",
    authorityDigest: result.authorityDigest,
    safeCategories: Array.isArray(result.failures) ? result.failures : [],
  }, options)
}

/** cf:d1:bootstrap:apply — operator-gated bootstrap apply (exit code only). */
export function evidenceFromBootstrapApply({ exitCode, authorityDigest, safeCategories = [] } = {}, options = {}) {
  return buildOperationEvidence("bootstrap_apply_completed", { status: exitCode === 0 ? "success" : "failed", authorityDigest, safeCategories }, options)
}

/** Post-bootstrap COUNT verification — consumes `{ ok, failures }` categories. */
export function evidenceFromBootstrapCountsVerification({ ok, failures = [], authorityDigest } = {}, options = {}) {
  return buildOperationEvidence("bootstrap_counts_verified", {
    status: ok === true ? "success" : "failed",
    authorityDigest,
    safeCategories: Array.isArray(failures) ? failures : [],
  }, options)
}

/** cf:deploy:preflight — offline Worker schema preflight (exit code only). */
export function evidenceFromWorkerPreflight({ exitCode, authorityDigest, safeCategories = [] } = {}, options = {}) {
  return buildOperationEvidence("worker_preflight_completed", { status: exitCode === 0 ? "success" : "failed", authorityDigest, safeCategories }, options)
}

/** cf:deploy — the gated Worker deploy (exit code only). */
export function evidenceFromWorkerDeploy({ exitCode, authorityDigest, safeCategories = [] } = {}, options = {}) {
  return buildOperationEvidence("worker_deploy_completed", { status: exitCode === 0 ? "success" : "failed", authorityDigest, safeCategories }, options)
}
