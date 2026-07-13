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
 * `reviewer_id` are never mass-assignable from the untrusted input: they come
 * only from the server-owned construction context, and
 * `source_human_decision_id` comes only from the validated Human Decision
 * artifact. Untrusted input that carries any server-owned field is rejected
 * with `client_owned_identity_field` so attempted mass assignment stays
 * observable. Issue #143 connects this boundary to canonical server/session
 * identities; a structural TypeScript object is not cryptographic proof of
 * identity, and future runtime gates must re-check identity server-side.
 *
 * The trusted Human Decision surface is imported ONLY through the artifacts
 * module public index. Because a TypeScript cast can lie, the Human Decision
 * argument is defensively re-validated at runtime even though its static type
 * is ValidatedHumanDecisionRecord.
 *
 * No I/O, no clock (ids and timestamps are caller-supplied and validated), no
 * randomness, no mutation of any input.
 */

import {
  validateHumanDecisionRecord,
  type ValidatedHumanDecisionRecord,
} from "../artifacts/index.ts"
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
  ReviewAttestationServerContext,
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

/** Server context validation: missing/malformed server state fails closed. */
function collectServerContextIssues(
  context: unknown,
): { readonly issues: readonly ReviewEvidenceValidationIssue[]; readonly tenantId: string; readonly reviewerId: string } {
  if (!isRecordObject(context)) {
    return {
      issues: [reviewEvidenceIssue("review_evidence_state_missing", "(server_context)")],
      tenantId: "",
      reviewerId: "",
    }
  }
  const issues: ReviewEvidenceValidationIssue[] = []
  const tenantId = context.tenant_id
  const reviewerId = context.reviewer_id
  if (!isNonEmptyString(tenantId)) {
    issues.push(reviewEvidenceIssue("review_evidence_state_missing", "(server_context).tenant_id"))
  }
  if (!isNonEmptyString(reviewerId)) {
    issues.push(reviewEvidenceIssue("review_evidence_state_missing", "(server_context).reviewer_id"))
  }
  return {
    issues,
    tenantId: isNonEmptyString(tenantId) ? tenantId : "",
    reviewerId: isNonEmptyString(reviewerId) ? reviewerId : "",
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
 * and `reviewer_id` come exclusively from the server-owned context;
 * `source_human_decision_id` comes exclusively from the validated Human
 * Decision artifact. The raw reviewed payload is never accepted or stored —
 * only its 64-character lowercase hex hash. Success grants nothing.
 */
export function createReviewAttestation(
  input: unknown,
  serverContext: ReviewAttestationServerContext,
  sourceHumanDecision: ValidatedHumanDecisionRecord,
): ReviewEvidenceConstructionResult<ReviewAttestation> {
  try {
    const snap = snapshotUntrustedInput(input, "(attestation_input)")
    if (!snap.ok) return failConstruction(snap.issues)

    const issues: ReviewEvidenceValidationIssue[] = []
    issues.push(...collectClientOwnedIdentityIssues(snap.snapshot, ATTESTATION_SERVER_OWNED_FIELDS))

    const context = collectServerContextIssues(serverContext)
    issues.push(...context.issues)

    const decision = collectHumanDecisionIssues(sourceHumanDecision)
    issues.push(...decision.issues)

    // Cross-tenant construction is a fail-closed mismatch, not a fallback.
    if (
      context.issues.length === 0 &&
      decision.issues.length === 0 &&
      context.tenantId !== decision.tenantId
    ) {
      issues.push(reviewEvidenceIssue("review_tenant_mismatch", "(server_context).tenant_id"))
    }

    if (issues.length > 0) return failConstruction(issues)

    const artifact = copyAllowlisted(snap.snapshot, ATTESTATION_INPUT_FIELDS)
    artifact.tenant_id = context.tenantId
    artifact.reviewer_id = context.reviewerId
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
