/**
 * P6-FIX-009: inert types for the Phase 6 Four-Eyes Review Evidence module
 * (Issue #142, docs/FOUR_EYES_REVIEW_EVIDENCE_CONTRACT.md).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. A Review Attestation records that one human
 * reviewed one exact Human Decision payload; a Four-Eyes Review Evidence
 * artifact combines exactly two attestations by two different reviewers over
 * the same binding. Neither is approval, authorization, execution permission,
 * persistence, Formal WorkUnit promotion, or an external action. Review
 * Evidence is not an ApprovalStore approval, and verifying Review Evidence is
 * not runtime authorization. `four_eyes_required: true` on a Human Decision
 * Record is a policy declaration; only a verified Four-Eyes Review Evidence
 * artifact is evidence that two reviews of the exact payload occurred — and
 * even then it grants nothing.
 *
 * These types are inert descriptions only: no runtime behavior, no consumer,
 * no capability, no I/O, no clock, no randomness.
 */

// ─── Untrusted input shapes ─────────────────────────────────────

/**
 * The untrusted structural input for one review attestation. Identity and
 * binding fields (`tenant_id`, `reviewer_id`, `source_human_decision_id`) are
 * deliberately ABSENT: they are server-owned and must come from the canonical
 * reviewer identity (P6-FIX-010, Issue #143) and the validated Human Decision
 * artifact. Input that carries them anyway is rejected fail-closed
 * (`client_owned_identity_field`) so attempted mass assignment stays
 * observable.
 */
export type UnvalidatedReviewAttestationInput = {
  readonly review_attestation_id: string
  readonly source_workunit_id: string
  readonly reviewed_payload_hash: string
  readonly reviewed_at: string
}

/**
 * The untrusted structural input for a Four-Eyes Review Evidence artifact.
 * Every binding field (tenant, reviewers, attestation ids, hash, source ids,
 * review timestamps) is deliberately ABSENT: those values are derived from the
 * two attestation artifacts. Input carrying them anyway is rejected
 * fail-closed (`client_owned_identity_field`).
 */
export type UnvalidatedFourEyesReviewEvidenceInput = {
  readonly review_evidence_id: string
  readonly review_completed_at: string
  readonly review_expires_at: string
}

// ─── Opaque validated artifact types ────────────────────────────

/**
 * Module-private opaque brand for constructor-produced attestations. It is a
 * compile-time-only phantom property: never assigned on the runtime object,
 * never serialized, and deliberately NOT exported. A TypeScript cast can
 * always lie, so this is a compile-time provenance boundary — not
 * cryptographic proof and not authorization.
 */
declare const reviewAttestationBrand: unique symbol

/**
 * One human review of one exact Human Decision payload, produced ONLY by
 * `createReviewAttestation`. The raw reviewed payload is never stored — only
 * its 64-character lowercase hex hash. An attestation is not approval.
 */
export type ReviewAttestation = {
  readonly review_attestation_id: string
  readonly tenant_id: string
  readonly reviewer_id: string
  readonly source_human_decision_id: string
  readonly source_workunit_id: string
  readonly reviewed_payload_hash: string
  readonly reviewed_at: string
  readonly [reviewAttestationBrand]: true
}

/** Module-private opaque brand for constructor-produced evidence artifacts. */
declare const fourEyesReviewEvidenceBrand: unique symbol

/**
 * Exactly two attestations by two different reviewers over the same tenant,
 * Human Decision, WorkUnit, and payload hash, produced ONLY by
 * `createFourEyesReviewEvidence`. The artifact is immutable: revocation and
 * consumption are represented in external verification state, never by
 * mutating or deleting the historical evidence. Evidence is not approval, not
 * authorization, and not execution permission.
 */
export type FourEyesReviewEvidence = {
  readonly review_evidence_id: string
  readonly tenant_id: string
  readonly source_human_decision_id: string
  readonly source_workunit_id: string
  readonly reviewed_payload_hash: string
  readonly first_review_attestation_id: string
  readonly second_review_attestation_id: string
  readonly first_reviewer_id: string
  readonly second_reviewer_id: string
  readonly first_reviewed_at: string
  readonly second_reviewed_at: string
  readonly review_completed_at: string
  readonly review_expires_at: string
  readonly [fourEyesReviewEvidenceBrand]: true
}

// ─── Verification context ───────────────────────────────────────

/**
 * The current server-side context a constructed evidence artifact is evaluated
 * against. All values are server-owned. The revocation and replay collections
 * are immutable snapshots supplied by the caller; the verifier never mutates
 * them and never performs I/O or reads a clock (`evaluated_at` is provided).
 */
export type ReviewEvidenceVerificationContext = {
  readonly tenant_id: string
  readonly human_decision_id: string
  readonly workunit_id: string
  readonly current_payload_hash: string
  readonly evaluated_at: string
  readonly revoked_review_evidence_ids: readonly string[]
  readonly consumed_review_evidence_ids: readonly string[]
}

// ─── Redacted audit projection ──────────────────────────────────

export const REVIEW_EVIDENCE_AUDIT_EVENT_KINDS = [
  "four_eyes_review_evidence_verified",
  "four_eyes_review_evidence_rejected",
] as const

export type ReviewEvidenceAuditEventKind =
  (typeof REVIEW_EVIDENCE_AUDIT_EVENT_KINDS)[number]

/**
 * A pure, redacted audit projection of one verification decision. It carries
 * identifiers and stable issue codes only: no raw reviewed payload, no payload
 * body, no payload hash, no reviewer identities, no secrets, no tokens, no
 * approval records. Producing an audit event authorizes nothing.
 */
export type ReviewEvidenceAuditEvent = {
  readonly event_kind: ReviewEvidenceAuditEventKind
  readonly review_evidence_id: string
  readonly source_human_decision_id: string
  readonly source_workunit_id: string
  readonly ok: boolean
  readonly issue_codes: readonly string[]
  readonly evaluated_at: string
}
