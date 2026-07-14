/**
 * P6-FIX-009: pure constructors for Phase 6 Review Attestations and Four-Eyes
 * Review Evidence artifacts (Issue #142).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. Constructors accept unknown untrusted
 * input, take a single-read snapshot, copy only allowlisted fields, derive
 * every identity and binding value from server-owned sources, validate the
 * output, and return a fresh frozen artifact. Construction success is not
 * approval, not ApprovalStore approval, not runtime authorization, not
 * execution permission, not persistence, and not Formal WorkUnit promotion.
 *
 * SERVER-OWNED IDENTITY BOUNDARY (fail-closed policy: REJECT). `tenant_id` and
 * `reviewer_id` are never mass-assignable from the untrusted input: they are
 * derived only from a constructor-produced canonical reviewer identity
 * (P6-FIX-010, Issue #143 — `actor_kind: "reviewer"`, `identity_source:
 * "authenticated_session"`, supported human subject type, tenant matching the
 * Human Decision), and `source_human_decision_id` comes only from the
 * validated Human Decision artifact. Untrusted input that carries any
 * server-owned field is rejected with `client_owned_identity_field` so
 * attempted mass assignment stays observable. The former structural
 * `ReviewAttestationServerContext` (`{ tenant_id, reviewer_id }`) is removed:
 * arbitrary caller-supplied reviewer strings can no longer enter. A
 * TypeScript cast is still not cryptographic proof of identity — the
 * canonical identity is defensively re-validated at runtime, and future
 * runtime gates (Issue #145) must re-check identity server-side.
 *
 * The trusted Human Decision surface is imported ONLY through the artifacts
 * module public index, and the canonical identity surface ONLY through the
 * canonicalIdentity module public index. Because a TypeScript cast can lie,
 * the Human Decision and reviewer identity arguments are defensively
 * re-validated at runtime even though their static types are trusted.
 *
 * No I/O, no clock (ids and timestamps are caller-supplied and validated), no
 * randomness, no mutation of any input.
 */

import {
  validateHumanDecisionRecord,
  type ValidatedHumanDecisionRecord,
} from "../artifacts/index.ts"
import {
  validateCanonicalIdentity,
  type CanonicalIdentity,
} from "../canonicalIdentity/index.ts"
import {
  type ReviewEvidenceValidationIssue,
  reviewEvidenceIssue,
  isRecordObject,
  isNonEmptyString,
} from "./validation.ts"
import {
  validateReviewAttestation,
  validateFourEyesReviewEvidence,
} from "./validators.ts"
import type {
  ReviewAttestation,
  FourEyesReviewEvidence,
} from "./types.ts"

// ─── Construction result (frozen, non-authorizing) ──────────────

export type ReviewEvidenceConstructionSuccess<T> = {
  readonly ok: true
  readonly artifact: T
  readonly issues: readonly []
}

export type ReviewEvidenceConstructionFailure = {
  readonly ok: false
  readonly issues: readonly ReviewEvidenceValidationIssue[]
}

export type ReviewEvidenceConstructionResult<T> =
  | ReviewEvidenceConstructionSuccess<T>
  | ReviewEvidenceConstructionFailure

function failConstruction(
  issues: readonly ReviewEvidenceValidationIssue[],
): ReviewEvidenceConstructionFailure {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) })
}

function passConstruction<T>(artifact: T): ReviewEvidenceConstructionSuccess<T> {
  return Object.freeze({ ok: true, artifact, issues: Object.freeze([]) as readonly [] })
}

// ─── Allowlists and server-owned field sets ─────────────────────

const ATTESTATION_INPUT_FIELDS: readonly string[] = [
  "review_attestation_id",
  "source_workunit_id",
  "reviewed_payload_hash",
  "reviewed_at",
]

/** Server-owned attestation fields: rejected when present on untrusted input. */
const ATTESTATION_SERVER_OWNED_FIELDS: readonly string[] = [
  "tenant_id",
  "reviewer_id",
  "source_human_decision_id",
]

const EVIDENCE_INPUT_FIELDS: readonly string[] = [
  "review_evidence_id",
  "review_completed_at",
  "review_expires_at",
]

/** Attestation-derived evidence fields: rejected when present on untrusted input. */
const EVIDENCE_SERVER_OWNED_FIELDS: readonly string[] = [
  "tenant_id",
  "source_human_decision_id",
  "source_workunit_id",
  "reviewed_payload_hash",
  "first_review_attestation_id",
  "second_review_attestation_id",
  "first_reviewer_id",
  "second_reviewer_id",
  "first_reviewed_at",
  "second_reviewed_at",
]

// ─── Shared construction helpers ────────────────────────────────

type SnapshotResult =
  | { readonly ok: true; readonly snapshot: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issues: readonly ReviewEvidenceValidationIssue[] }

function snapshotUntrustedInput(input: unknown, label: string): SnapshotResult {
  if (!isRecordObject(input)) {
    return { ok: false, issues: [reviewEvidenceIssue("invalid_input", label)] }
  }
  // Single-read snapshot (getter-TOCTOU hardening): every own enumerable
  // top-level property is read exactly once; construction reads only this.
  const snapshot: Record<string, unknown> = {}
  for (const key of Object.keys(input)) {
    snapshot[key] = input[key]
  }
  return { ok: true, snapshot }
}

/**
 * Fail-closed mass-assignment guard: any server-owned field present on the
 * untrusted input is rejected — the input must not even mention them. Other
 * unknown fields are dropped by the allowlisted copy (never copied).
 */
function collectClientOwnedIdentityIssues(
  snapshot: Readonly<Record<string, unknown>>,
  serverOwnedFields: readonly string[],
): ReviewEvidenceValidationIssue[] {
  const issues: ReviewEvidenceValidationIssue[] = []
  for (const field of serverOwnedFields) {
    if (Object.prototype.hasOwnProperty.call(snapshot, field)) {
      issues.push(reviewEvidenceIssue("client_owned_identity_field", field))
    }
  }
  return issues
}

function copyAllowlisted(
  snapshot: Readonly<Record<string, unknown>>,
  allowedFields: readonly string[],
): Record<string, unknown> {
  const artifact: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field)) continue
    const value = snapshot[field]
    if (value === undefined) continue
    artifact[field] = value
  }
  return artifact
}

/**
 * Canonical reviewer identity boundary (P6-FIX-010, Issue #143). The reviewer
 * argument must be a constructor-produced CanonicalIdentity; because a cast
 * can lie, it is defensively re-validated through the canonical identity
 * module's own validator, then constrained to exactly the reviewer position:
 * `actor_kind === "reviewer"`, `identity_source === "authenticated_session"`,
 * and the supported human subject type. A plain structural
 * `{ tenant_id, reviewer_id }` object fails here — arbitrary caller-supplied
 * reviewer strings can no longer become attestation identity. Underlying
 * canonical-identity issue details are not echoed; the stable code
 * `invalid_reviewer_identity` reports the failing aspect by field only.
 */
function collectReviewerIdentityIssues(
  reviewerIdentity: unknown,
): { readonly issues: readonly ReviewEvidenceValidationIssue[]; readonly tenantId: string; readonly reviewerId: string } {
  const validation = validateCanonicalIdentity(reviewerIdentity)
  if (!validation.ok || !isRecordObject(reviewerIdentity)) {
    return {
      issues: [reviewEvidenceIssue("invalid_reviewer_identity", "(reviewer_identity)")],
      tenantId: "",
      reviewerId: "",
    }
  }
  const issues: ReviewEvidenceValidationIssue[] = []
  if (reviewerIdentity.actor_kind !== "reviewer") {
    issues.push(reviewEvidenceIssue("invalid_reviewer_identity", "(reviewer_identity).actor_kind"))
  }
  if (reviewerIdentity.identity_source !== "authenticated_session") {
    issues.push(
      reviewEvidenceIssue("invalid_reviewer_identity", "(reviewer_identity).identity_source"),
    )
  }
  if (reviewerIdentity.subject_type !== "human_user") {
    issues.push(
      reviewEvidenceIssue("invalid_reviewer_identity", "(reviewer_identity).subject_type"),
    )
  }
  const tenantId = reviewerIdentity.tenant_id
  const reviewerId = reviewerIdentity.user_id
  return {
    issues,
    tenantId: issues.length === 0 && isNonEmptyString(tenantId) ? tenantId : "",
    reviewerId: issues.length === 0 && isNonEmptyString(reviewerId) ? reviewerId : "",
  }
}

/**
 * Defensive Human Decision re-validation: the static type promises a
 * constructor-produced artifact, but a cast can lie, so the runtime shape is
 * always re-checked through the artifacts module's own validator.
 */
function collectHumanDecisionIssues(
  decision: unknown,
): { readonly issues: readonly ReviewEvidenceValidationIssue[]; readonly decisionId: string; readonly tenantId: string } {
  const validation = validateHumanDecisionRecord(decision)
  if (!validation.ok || !isRecordObject(decision)) {
    return {
      issues: [reviewEvidenceIssue("invalid_source_human_decision", "(source_human_decision)")],
      decisionId: "",
      tenantId: "",
    }
  }
  const decisionId = decision.human_decision_id
  const tenantId = decision.tenant_id
  if (!isNonEmptyString(decisionId) || !isNonEmptyString(tenantId)) {
    return {
      issues: [reviewEvidenceIssue("invalid_source_human_decision", "(source_human_decision)")],
      decisionId: "",
      tenantId: "",
    }
  }
  return { issues: [], decisionId, tenantId }
}

// ─── createReviewAttestation ────────────────────────────────────

/**
 * The only production function that returns a ReviewAttestation. `tenant_id`
 * and `reviewer_id` come exclusively from the constructor-produced canonical
 * reviewer identity (`user_id` becomes the stored reviewer ID);
 * `source_human_decision_id` comes exclusively from the validated Human
 * Decision artifact. No session token, email, role, or raw session data is
 * stored. The raw reviewed payload is never accepted or stored — only its
 * 64-character lowercase hex hash. Success grants nothing.
 */
export function createReviewAttestation(
  input: unknown,
  reviewerIdentity: CanonicalIdentity,
  sourceHumanDecision: ValidatedHumanDecisionRecord,
): ReviewEvidenceConstructionResult<ReviewAttestation> {
  try {
    const snap = snapshotUntrustedInput(input, "(attestation_input)")
    if (!snap.ok) return failConstruction(snap.issues)

    const issues: ReviewEvidenceValidationIssue[] = []
    issues.push(...collectClientOwnedIdentityIssues(snap.snapshot, ATTESTATION_SERVER_OWNED_FIELDS))

    const reviewer = collectReviewerIdentityIssues(reviewerIdentity)
    issues.push(...reviewer.issues)

    const decision = collectHumanDecisionIssues(sourceHumanDecision)
    issues.push(...decision.issues)

    // Cross-tenant construction is a fail-closed mismatch, not a fallback.
    if (
      reviewer.issues.length === 0 &&
      decision.issues.length === 0 &&
      reviewer.tenantId !== decision.tenantId
    ) {
      issues.push(reviewEvidenceIssue("review_tenant_mismatch", "(reviewer_identity).tenant_id"))
    }

    if (issues.length > 0) return failConstruction(issues)

    const artifact = copyAllowlisted(snap.snapshot, ATTESTATION_INPUT_FIELDS)
    artifact.tenant_id = reviewer.tenantId
    artifact.reviewer_id = reviewer.reviewerId
    artifact.source_human_decision_id = decision.decisionId

    const validation = validateReviewAttestation(artifact)
    if (!validation.ok) return failConstruction(validation.issues)

    // The opaque brand is compile-time only; no runtime field is added. This
    // cast is the module's single trusted production point for the type.
    return passConstruction(Object.freeze(artifact) as unknown as ReviewAttestation)
  } catch {
    return failConstruction([
      reviewEvidenceIssue("review_evidence_validation_exception", "(attestation_constructor)"),
    ])
  }
}

// ─── createFourEyesReviewEvidence ───────────────────────────────

/**
 * The only production function that returns a FourEyesReviewEvidence artifact.
 * Every binding value (tenant, source ids, hash, reviewer ids, attestation
 * ids, review timestamps) is derived from the two attestation artifacts —
 * never from the untrusted input. Both attestations are defensively
 * re-validated, must bind to the same tenant/decision/workunit/hash, must come
 * from two different reviewers, and must match the (re-validated) source Human
 * Decision. The artifact is immutable: revoke/consume live in external
 * verification state. Success grants nothing.
 */
export function createFourEyesReviewEvidence(
  input: unknown,
  firstAttestation: ReviewAttestation,
  secondAttestation: ReviewAttestation,
  sourceHumanDecision: ValidatedHumanDecisionRecord,
): ReviewEvidenceConstructionResult<FourEyesReviewEvidence> {
  try {
    const snap = snapshotUntrustedInput(input, "(evidence_input)")
    if (!snap.ok) return failConstruction(snap.issues)

    const issues: ReviewEvidenceValidationIssue[] = []
    issues.push(...collectClientOwnedIdentityIssues(snap.snapshot, EVIDENCE_SERVER_OWNED_FIELDS))

    // Defensive re-validation of both attestation artifacts (a cast can lie).
    const firstValidation = validateReviewAttestation(firstAttestation)
    if (!firstValidation.ok) {
      issues.push(reviewEvidenceIssue("invalid_review_attestation", "(first_review_attestation)"))
    }
    const secondValidation = validateReviewAttestation(secondAttestation)
    if (!secondValidation.ok) {
      issues.push(reviewEvidenceIssue("invalid_review_attestation", "(second_review_attestation)"))
    }

    const decision = collectHumanDecisionIssues(sourceHumanDecision)
    issues.push(...decision.issues)

    if (issues.length > 0) return failConstruction(issues)

    const first = firstAttestation as unknown as Record<string, unknown>
    const second = secondAttestation as unknown as Record<string, unknown>

    // Cross-attestation binding invariants (deterministic order).
    if (first.review_attestation_id === second.review_attestation_id) {
      issues.push(reviewEvidenceIssue("duplicate_review_attestation", "second_review_attestation_id"))
    }
    if (first.reviewer_id === second.reviewer_id) {
      issues.push(reviewEvidenceIssue("duplicate_reviewer_identity", "second_reviewer_id"))
    }
    if (first.tenant_id !== second.tenant_id) {
      issues.push(reviewEvidenceIssue("review_tenant_mismatch", "tenant_id"))
    }
    if (first.source_human_decision_id !== second.source_human_decision_id) {
      issues.push(
        reviewEvidenceIssue("review_source_human_decision_mismatch", "source_human_decision_id"),
      )
    }
    if (first.source_workunit_id !== second.source_workunit_id) {
      issues.push(reviewEvidenceIssue("review_source_workunit_mismatch", "source_workunit_id"))
    }
    if (first.reviewed_payload_hash !== second.reviewed_payload_hash) {
      issues.push(reviewEvidenceIssue("review_payload_hash_mismatch", "reviewed_payload_hash"))
    }
    // The Human Decision itself must match both attestations (defense-in-depth
    // beyond the attestation constructor's own binding).
    if (decision.tenantId !== first.tenant_id || decision.tenantId !== second.tenant_id) {
      issues.push(reviewEvidenceIssue("review_tenant_mismatch", "(source_human_decision).tenant_id"))
    }
    if (
      decision.decisionId !== first.source_human_decision_id ||
      decision.decisionId !== second.source_human_decision_id
    ) {
      issues.push(
        reviewEvidenceIssue(
          "review_source_human_decision_mismatch",
          "(source_human_decision).human_decision_id",
        ),
      )
    }

    if (issues.length > 0) return failConstruction(issues)

    const artifact = copyAllowlisted(snap.snapshot, EVIDENCE_INPUT_FIELDS)
    artifact.tenant_id = first.tenant_id
    artifact.source_human_decision_id = first.source_human_decision_id
    artifact.source_workunit_id = first.source_workunit_id
    artifact.reviewed_payload_hash = first.reviewed_payload_hash
    artifact.first_review_attestation_id = first.review_attestation_id
    artifact.second_review_attestation_id = second.review_attestation_id
    artifact.first_reviewer_id = first.reviewer_id
    artifact.second_reviewer_id = second.reviewer_id
    artifact.first_reviewed_at = first.reviewed_at
    artifact.second_reviewed_at = second.reviewed_at

    // Output validation enforces field shapes and the deterministic review
    // timeline (ordering, completion, strict expiry).
    const validation = validateFourEyesReviewEvidence(artifact)
    if (!validation.ok) return failConstruction(validation.issues)

    return passConstruction(Object.freeze(artifact) as unknown as FourEyesReviewEvidence)
  } catch {
    return failConstruction([
      reviewEvidenceIssue("review_evidence_validation_exception", "(evidence_constructor)"),
    ])
  }
}
