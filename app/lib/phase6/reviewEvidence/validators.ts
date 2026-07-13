/**
 * P6-FIX-009: pure, fail-closed structural validators for Phase 6 Review
 * Attestations and Four-Eyes Review Evidence artifacts (Issue #142).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. Each validator accepts unknown input, never
 * throws for normal invalid input (a defensive catch maps unexpected failures
 * to `review_evidence_validation_exception`), never mutates its input,
 * performs no I/O of any kind, reads no clock and no randomness, and returns
 * only a frozen { ok, issues }. Validation pass is not approval, not
 * ApprovalStore approval, not runtime authorization, and not execution
 * permission. These validators are NON-NARROWING: they never assert
 * `input is ReviewAttestation` or `input is FourEyesReviewEvidence` — only the
 * constructors produce the opaque validated types.
 *
 * Getter-TOCTOU hardening: every own enumerable top-level property is read
 * exactly once into a plain snapshot; every check reads the snapshot only.
 *
 * This module imports only the sibling ./validation.ts and the pure shared
 * Phase 6 leaf modules (../shared/*.ts). It imports nothing from app runtime,
 * no persistence, no database access, no approval-store, no external clients,
 * and no model providers.
 */

import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import { isPhase6ForbiddenGrantField } from "../shared/forbiddenGrantFields.ts"
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

// ─── Field kinds and allowlists ─────────────────────────────────

type ReviewFieldKind = "identifier" | "hash" | "timestamp"

const REVIEW_ATTESTATION_FIELD_SPECS: Readonly<Record<string, ReviewFieldKind>> = {
  review_attestation_id: "identifier",
  tenant_id: "identifier",
  reviewer_id: "identifier",
  source_human_decision_id: "identifier",
  source_workunit_id: "identifier",
  reviewed_payload_hash: "hash",
  reviewed_at: "timestamp",
}

const FOUR_EYES_REVIEW_EVIDENCE_FIELD_SPECS: Readonly<Record<string, ReviewFieldKind>> = {
  review_evidence_id: "identifier",
  tenant_id: "identifier",
  source_human_decision_id: "identifier",
  source_workunit_id: "identifier",
  reviewed_payload_hash: "hash",
  first_review_attestation_id: "identifier",
  second_review_attestation_id: "identifier",
  first_reviewer_id: "identifier",
  second_reviewer_id: "identifier",
  first_reviewed_at: "timestamp",
  second_reviewed_at: "timestamp",
  review_completed_at: "timestamp",
  review_expires_at: "timestamp",
}

// ─── Shared helpers ─────────────────────────────────────────────

function snapshotOf(input: Record<string, unknown>): Record<string, unknown> {
  // Single-read snapshot (getter-TOCTOU hardening): read every own enumerable
  // top-level property exactly once. All checks below read the snapshot only.
  const snapshot: Record<string, unknown> = {}
  for (const key of Object.keys(input)) {
    snapshot[key] = input[key]
  }
  return snapshot
}

function collectFieldIssues(
  snapshot: Record<string, unknown>,
  specs: Readonly<Record<string, ReviewFieldKind>>,
): ReviewEvidenceValidationIssue[] {
  const issues: ReviewEvidenceValidationIssue[] = []
  // Unknown / forbidden top-level fields (allowlist, fail closed).
  for (const key of Object.keys(snapshot)) {
    if (Object.prototype.hasOwnProperty.call(specs, key)) continue
    if (isPhase6ForbiddenGrantField(key)) {
      issues.push(reviewEvidenceIssue("forbidden_grant_field_present", key))
    } else {
      issues.push(reviewEvidenceIssue("unknown_field", key))
    }
  }
  // Required typed fields.
  for (const [field, kind] of Object.entries(specs)) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field)) {
      issues.push(reviewEvidenceIssue("missing_required_field", field))
      continue
    }
    const value = snapshot[field]
    if (value === null) {
      issues.push(reviewEvidenceIssue("null_required_field", field))
      continue
    }
    switch (kind) {
      case "identifier":
        if (!isNonEmptyString(value)) issues.push(reviewEvidenceIssue("invalid_identifier", field))
        break
      case "hash":
        if (!isReviewPayloadHash(value)) issues.push(reviewEvidenceIssue("invalid_payload_hash", field))
        break
      case "timestamp":
        if (!isIsoUtcTimestamp(value)) issues.push(reviewEvidenceIssue("invalid_timestamp", field))
        break
    }
  }
  return issues
}

// ─── Review Attestation structural validator ────────────────────

export function validateReviewAttestation(input: unknown): ReviewEvidenceValidationResult {
  try {
    if (!isRecordObject(input)) {
      return reviewEvidenceResultOf([reviewEvidenceIssue("invalid_input", "(attestation)")])
    }
    const snapshot = snapshotOf(input)
    const issues = collectFieldIssues(snapshot, REVIEW_ATTESTATION_FIELD_SPECS)
    return reviewEvidenceResultOf(issues)
  } catch {
    return reviewEvidenceResultOf([
      reviewEvidenceIssue("review_evidence_validation_exception", "(attestation)"),
    ])
  }
}

// ─── Four-Eyes Review Evidence structural validator ─────────────

export function validateFourEyesReviewEvidence(input: unknown): ReviewEvidenceValidationResult {
  try {
    if (!isRecordObject(input)) {
      return reviewEvidenceResultOf([reviewEvidenceIssue("invalid_input", "(evidence)")])
    }
    const snapshot = snapshotOf(input)
    const issues = collectFieldIssues(snapshot, FOUR_EYES_REVIEW_EVIDENCE_FIELD_SPECS)

    // Cross-field invariants run only when their prerequisite fields already
    // hold valid primitive values (cascade prevention, P6-FIX-008 precedent).
    const firstAttestation = snapshot.first_review_attestation_id
    const secondAttestation = snapshot.second_review_attestation_id
    if (
      isNonEmptyString(firstAttestation) &&
      isNonEmptyString(secondAttestation) &&
      firstAttestation === secondAttestation
    ) {
      issues.push(reviewEvidenceIssue("duplicate_review_attestation", "second_review_attestation_id"))
    }

    const firstReviewer = snapshot.first_reviewer_id
    const secondReviewer = snapshot.second_reviewer_id
    if (
      isNonEmptyString(firstReviewer) &&
      isNonEmptyString(secondReviewer) &&
      firstReviewer === secondReviewer
    ) {
      issues.push(reviewEvidenceIssue("duplicate_reviewer_identity", "second_reviewer_id"))
    }

    // Deterministic review timeline. All four timestamps must already be valid
    // before any ordering rule speaks.
    const firstReviewedAt = snapshot.first_reviewed_at
    const secondReviewedAt = snapshot.second_reviewed_at
    const completedAt = snapshot.review_completed_at
    const expiresAt = snapshot.review_expires_at
    if (
      isIsoUtcTimestamp(firstReviewedAt) &&
      isIsoUtcTimestamp(secondReviewedAt) &&
      isIsoUtcTimestamp(completedAt) &&
      isIsoUtcTimestamp(expiresAt)
    ) {
      const reviewOrder = compareIsoUtc(firstReviewedAt, secondReviewedAt)
      if (reviewOrder > 0) {
        // The first review must not come after the second.
        issues.push(reviewEvidenceIssue("invalid_review_timeline", "second_reviewed_at"))
      } else if (
        reviewOrder === 0 &&
        isNonEmptyString(firstAttestation) &&
        isNonEmptyString(secondAttestation) &&
        firstAttestation > secondAttestation
      ) {
        // Equal timestamps: attestation-id order breaks the tie so the
        // first/second assignment stays deterministic.
        issues.push(reviewEvidenceIssue("invalid_review_timeline", "second_review_attestation_id"))
      }
      if (compareIsoUtc(completedAt, secondReviewedAt) < 0 || compareIsoUtc(completedAt, firstReviewedAt) < 0) {
        // Completion must not precede either review.
        issues.push(reviewEvidenceIssue("invalid_review_timeline", "review_completed_at"))
      }
      if (compareIsoUtc(expiresAt, completedAt) <= 0) {
        // Expiry must be strictly later than completion.
        issues.push(reviewEvidenceIssue("invalid_review_timeline", "review_expires_at"))
      }
    }

    return reviewEvidenceResultOf(issues)
  } catch {
    return reviewEvidenceResultOf([
      reviewEvidenceIssue("review_evidence_validation_exception", "(evidence)"),
    ])
  }
}
