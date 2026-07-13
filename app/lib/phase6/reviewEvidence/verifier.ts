/**
 * P6-FIX-009: pure verification of a constructed Four-Eyes Review Evidence
 * artifact against the current server-side context (Issue #142).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. Verification success means only that the
 * evidence is structurally valid, exactly bound to the current tenant / Human
 * Decision / WorkUnit / payload hash, not expired, not revoked, and not
 * replayed. It is not approval, not ApprovalStore approval, not runtime
 * authorization, and not execution permission.
 *
 * FAIL-CLOSED. Missing, malformed, duplicate, stale, expired, revoked,
 * replayed, cross-tenant, source-mismatched, or hash-mismatched input fails.
 * Malformed context (including missing revocation/replay state) fails closed
 * with `review_evidence_state_missing` — absent state is never treated as
 * "not revoked" or "not consumed".
 *
 * A changed payload hash invalidates prior Review Evidence here, without
 * mutating or deleting the historical evidence artifact: the evidence stays
 * frozen; only the comparison fails. Canonical approval-payload construction
 * belongs to Issue #144 — this module validates the 64-character hash format,
 * binds evidence to that hash, and compares it exactly.
 *
 * Pure and deterministic: no I/O, no clock (`evaluated_at` is supplied in the
 * context), no randomness, no mutation. Results are frozen with a defensively
 * copied issue array (P6-FIX-007b precedent). Expiry is inclusive-fail:
 * `evaluated_at >= review_expires_at` is expired.
 */

import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  type ReviewEvidenceValidationIssue,
  type ReviewEvidenceValidationResult,
  reviewEvidenceIssue,
  reviewEvidenceResultOf,
  isRecordObject,
  isNonEmptyString,
  isReviewPayloadHash,
  compareIsoUtc,
} from "./validation.ts"
import { validateFourEyesReviewEvidence } from "./validators.ts"

/** Alias kept for readability: verification returns the same frozen shape. */
export type ReviewEvidenceVerificationResult = ReviewEvidenceValidationResult

// ─── Context snapshot ───────────────────────────────────────────

type VerificationContextSnapshot = {
  readonly tenantId: string
  readonly humanDecisionId: string
  readonly workunitId: string
  readonly currentPayloadHash: string
  readonly evaluatedAt: string
  readonly revokedIds: readonly string[]
  readonly consumedIds: readonly string[]
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}

/**
 * Validate and snapshot the server-side verification context. Every field is
 * required; malformed or missing state fails closed with
 * `review_evidence_state_missing` on the precise context field.
 */
function snapshotVerificationContext(
  context: unknown,
): { readonly issues: readonly ReviewEvidenceValidationIssue[]; readonly snapshot: VerificationContextSnapshot | null } {
  if (!isRecordObject(context)) {
    return {
      issues: [reviewEvidenceIssue("review_evidence_state_missing", "(context)")],
      snapshot: null,
    }
  }
  const issues: ReviewEvidenceValidationIssue[] = []
  const tenantId = context.tenant_id
  const humanDecisionId = context.human_decision_id
  const workunitId = context.workunit_id
  const currentPayloadHash = context.current_payload_hash
  const evaluatedAt = context.evaluated_at
  const revokedIds = context.revoked_review_evidence_ids
  const consumedIds = context.consumed_review_evidence_ids

  if (!isNonEmptyString(tenantId)) {
    issues.push(reviewEvidenceIssue("review_evidence_state_missing", "(context).tenant_id"))
  }
  if (!isNonEmptyString(humanDecisionId)) {
    issues.push(reviewEvidenceIssue("review_evidence_state_missing", "(context).human_decision_id"))
  }
  if (!isNonEmptyString(workunitId)) {
    issues.push(reviewEvidenceIssue("review_evidence_state_missing", "(context).workunit_id"))
  }
  if (!isReviewPayloadHash(currentPayloadHash)) {
    issues.push(
      reviewEvidenceIssue("review_evidence_state_missing", "(context).current_payload_hash"),
    )
  }
  if (!isIsoUtcTimestamp(evaluatedAt)) {
    issues.push(reviewEvidenceIssue("review_evidence_state_missing", "(context).evaluated_at"))
  }
  if (!isStringArray(revokedIds)) {
    issues.push(
      reviewEvidenceIssue("review_evidence_state_missing", "(context).revoked_review_evidence_ids"),
    )
  }
  if (!isStringArray(consumedIds)) {
    issues.push(
      reviewEvidenceIssue("review_evidence_state_missing", "(context).consumed_review_evidence_ids"),
    )
  }
  if (issues.length > 0) return { issues, snapshot: null }
  return {
    issues: [],
    snapshot: {
      tenantId: tenantId as string,
      humanDecisionId: humanDecisionId as string,
      workunitId: workunitId as string,
      currentPayloadHash: currentPayloadHash as string,
      evaluatedAt: evaluatedAt as string,
      // Defensive copies: later mutation of the caller's arrays cannot change
      // the snapshot this verification already evaluated.
      revokedIds: Object.freeze([...(revokedIds as readonly string[])]),
      consumedIds: Object.freeze([...(consumedIds as readonly string[])]),
    },
  }
}

// ─── Public verifier ────────────────────────────────────────────

export function verifyFourEyesReviewEvidence(
  evidence: unknown,
  context: unknown,
): ReviewEvidenceVerificationResult {
  try {
    // 1. Server-side context first: without valid state nothing can be
    //    evaluated, so context problems fail closed alone.
    const contextResult = snapshotVerificationContext(context)
    if (contextResult.snapshot === null) {
      return reviewEvidenceResultOf(contextResult.issues)
    }
    const ctx = contextResult.snapshot

    // 2. Structural evidence validation (includes duplicate-reviewer,
    //    duplicate-attestation, and timeline invariants). Structural issues
    //    pass through unchanged and stop evaluation.
    const structural = validateFourEyesReviewEvidence(evidence)
    if (!structural.ok) {
      return reviewEvidenceResultOf(structural.issues)
    }
    const record = evidence as Record<string, unknown>

    // 3. Exact current-context binding, in deterministic order.
    const issues: ReviewEvidenceValidationIssue[] = []
    if (record.tenant_id !== ctx.tenantId) {
      issues.push(reviewEvidenceIssue("review_tenant_mismatch", "tenant_id"))
    }
    if (record.source_human_decision_id !== ctx.humanDecisionId) {
      issues.push(
        reviewEvidenceIssue("review_source_human_decision_mismatch", "source_human_decision_id"),
      )
    }
    if (record.source_workunit_id !== ctx.workunitId) {
      issues.push(reviewEvidenceIssue("review_source_workunit_mismatch", "source_workunit_id"))
    }
    if (record.reviewed_payload_hash !== ctx.currentPayloadHash) {
      issues.push(reviewEvidenceIssue("review_payload_hash_mismatch", "reviewed_payload_hash"))
    }
    // Inclusive-fail expiry: exactly-at-expiry is already expired.
    if (compareIsoUtc(ctx.evaluatedAt, record.review_expires_at as string) >= 0) {
      issues.push(reviewEvidenceIssue("review_evidence_expired", "review_expires_at"))
    }
    const evidenceId = record.review_evidence_id as string
    if (ctx.revokedIds.includes(evidenceId)) {
      issues.push(reviewEvidenceIssue("review_evidence_revoked", "review_evidence_id"))
    }
    if (ctx.consumedIds.includes(evidenceId)) {
      issues.push(reviewEvidenceIssue("review_evidence_replayed", "review_evidence_id"))
    }

    return reviewEvidenceResultOf(issues)
  } catch {
    return reviewEvidenceResultOf([
      reviewEvidenceIssue("review_evidence_validation_exception", "(verifier)"),
    ])
  }
}
