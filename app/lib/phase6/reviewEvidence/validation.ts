/**
 * P6-FIX-009: shared validation result types and primitive predicates for the
 * Phase 6 Four-Eyes Review Evidence module (Issue #142).
 *
 * FAIL-CLOSED, NON-AUTHORIZING. A ReviewEvidenceValidationResult carries only
 * { ok, issues }: validation or verification success is not approval, not
 * ApprovalStore approval, not runtime authorization, and not execution
 * permission. Issue messages are `${code}:${field}` only — they never echo
 * input values, so payloads and secret-like values cannot leak through
 * validation output.
 *
 * Results follow the P6-FIX-007b frozen-snapshot precedent: the result object
 * is frozen and the issues array is a cloned + frozen snapshot, never an
 * aliased mutable accumulator.
 *
 * No I/O, no network, no database, no environment reads, no clock reads, no
 * randomness. Timestamp comparison is pure string normalization over the
 * pinned ISO-8601 UTC profile — never Date parsing.
 */

// ─── Stable issue codes ─────────────────────────────────────────

export const REVIEW_EVIDENCE_ISSUE_CODES = [
  "invalid_input",
  "missing_required_field",
  "null_required_field",
  "invalid_identifier",
  "invalid_payload_hash",
  "invalid_timestamp",
  "unknown_field",
  "forbidden_grant_field_present",
  "client_owned_identity_field",
  "invalid_reviewer_identity",
  "invalid_source_human_decision",
  "invalid_review_attestation",
  "duplicate_review_attestation",
  "duplicate_reviewer_identity",
  "review_tenant_mismatch",
  "review_source_human_decision_mismatch",
  "review_source_workunit_mismatch",
  "review_payload_hash_mismatch",
  "invalid_review_timeline",
  "review_evidence_expired",
  "review_evidence_revoked",
  "review_evidence_replayed",
  "review_evidence_state_missing",
  "review_evidence_validation_exception",
] as const

export type ReviewEvidenceIssueCode = (typeof REVIEW_EVIDENCE_ISSUE_CODES)[number]

export type ReviewEvidenceValidationIssue = {
  readonly code: ReviewEvidenceIssueCode
  readonly field: string
  /** Always `${code}:${field}` — never contains input values. */
  readonly message: string
}

export type ReviewEvidenceValidationResult = {
  readonly ok: boolean
  readonly issues: readonly ReviewEvidenceValidationIssue[]
}

export function reviewEvidenceIssue(
  code: ReviewEvidenceIssueCode,
  field: string,
): ReviewEvidenceValidationIssue {
  return { code, field, message: `${code}:${field}` }
}

export function reviewEvidenceResultOf(
  issues: readonly ReviewEvidenceValidationIssue[],
): ReviewEvidenceValidationResult {
  // Completed, immutable runtime snapshot (P6-FIX-007b precedent): clone and
  // freeze the issues array, then freeze the result object. Freezing grants
  // nothing.
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze([...issues]) })
}

// ─── Primitive predicates ───────────────────────────────────────

const SHA256_HEX = /^[0-9a-f]{64}$/

export function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/** Exactly 64 lowercase hexadecimal characters (format validation only). */
export function isReviewPayloadHash(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value)
}

// ─── Pure ISO-8601 UTC comparison ───────────────────────────────

/**
 * Compare two already-validated pinned-profile ISO-8601 UTC timestamps
 * (`YYYY-MM-DDTHH:mm:ss(.fff)?Z`) without Date parsing. The fixed-width base
 * compares lexicographically; the optional 1–3 digit fraction is right-padded
 * to 3 digits so mixed precision compares correctly. Returns -1, 0, or 1.
 * Callers must validate both inputs with the shared ISO guard first.
 */
export function compareIsoUtc(a: string, b: string): -1 | 0 | 1 {
  // Strip the mandatory trailing Z first so a fraction-less timestamp's base
  // never carries the Z into the base comparison.
  const [aBase, aFraction = ""] = a.replace("Z", "").split(".")
  const [bBase, bFraction = ""] = b.replace("Z", "").split(".")
  if (aBase !== bBase) return aBase < bBase ? -1 : 1
  const aPadded = aFraction.padEnd(3, "0")
  const bPadded = bFraction.padEnd(3, "0")
  if (aPadded === bPadded) return 0
  return aPadded < bPadded ? -1 : 1
}
