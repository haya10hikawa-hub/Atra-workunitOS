/**
 * HTPE H1B1: closed types for the shadow declared-revision-reference relation
 * contract (docs/HTPE_H1B1_REVISION_REFERENCE_CONTRACT.md; H0
 * docs/PROVENANCE_CLAIM_CONTRACT.md).
 *
 * SHADOW ONLY. CANDIDATE ONLY. NO AUTHORITY. REFERENCE EQUALITY ONLY.
 *
 * A result of this module states one thing and nothing else: whether two
 * validated opaque caller-declared references are byte-for-byte identical.
 * It never establishes real-world subject identity, logical-claim identity or
 * continuity, immutable revision identity, ClaimBinding, transition,
 * correction, supersession, truth, authority, conflict, or a latest/preferred
 * source. Every one of those stays a constant `not_established` literal, and
 * the declared basis is never verified here.
 *
 * DEPENDENCY LEAF. This module imports nothing. No temporal contract, no
 * canonical identity, no formation, no provider adapter, no persistence, no
 * LLM path, no clock, no consumer.
 */

/**
 * One side of a pairwise comparison. Exact own keys, no extras.
 *
 * Every reference is an OPAQUE caller-declared token. This module never mints
 * one, never derives one from another field, and never interprets one as a
 * timestamp, URL, provider id, digest or content.
 */
export type DeclaredRevisionReferenceDescriptor = {
  /** Opaque declared reference for the subject. Never proven to denote a real object. */
  readonly subjectRef: string
  /** Opaque declared reference for the logical claim. Never proven to denote a real claim. */
  readonly logicalClaimRef: string
  /** Opaque declared reference for the claim revision. Never proven to be an immutable revision. */
  readonly revisionRef: string
  /** The only accepted basis. Declared by the caller and NEVER verified here. */
  readonly identityBasis: "declared_opaque_ref"
}

/** Exact public input: two descriptors, no temporal field, no provider, no actor, no payload. */
export type DeclaredRevisionReferenceRelationInput = {
  readonly left: DeclaredRevisionReferenceDescriptor
  readonly right: DeclaredRevisionReferenceDescriptor
}

/**
 * The complete positive relation vocabulary.
 *
 * `same_declared_ref` means only that the two validated opaque strings are
 * byte-for-byte identical. It does not establish that they identify the same
 * real-world entity, claim or immutable revision.
 */
export type DeclaredReferenceRelation = "same_declared_ref" | "different_declared_ref"

/**
 * Closed reason-code vocabulary. Emission order is fixed and documented:
 * subject, logical claim, revision, then the seven constant non-authority
 * codes in the order they appear below.
 */
export type DeclaredRevisionReferenceReasonCode =
  | "declared_subject_ref_same"
  | "declared_subject_ref_different"
  | "declared_logical_claim_ref_same"
  | "declared_logical_claim_ref_different"
  | "declared_revision_ref_same"
  | "declared_revision_ref_different"
  | "reference_equality_only"
  | "declared_basis_not_verified_here"
  | "immutable_revision_identity_not_established"
  | "logical_claim_continuity_not_established"
  | "claim_binding_not_established"
  | "transition_evidence_not_established"
  | "supersession_order_not_established"
  | "correction_relation_not_established"

/** Closed, value-free failure vocabulary. No caller-supplied key or value is ever echoed. */
export type DeclaredRevisionReferenceFailureCode =
  | "invalid_input"
  | "input_unreadable"
  | "unknown_field"
  | "missing_field"
  | "invalid_reference"
  | "forbidden_identity_basis"
  | "unsupported_identity_basis"
  | "attestation_rejected"

/** The subset reachable from evaluation; `attestation_rejected` is emitted only by the snapshot surface. */
export type DeclaredRevisionReferenceEvaluationFailureCode =
  Exclude<DeclaredRevisionReferenceFailureCode, "attestation_rejected">

export type DeclaredRevisionReferenceFailure = {
  readonly ok: false
  readonly failureCode: DeclaredRevisionReferenceEvaluationFailureCode
}

/**
 * Successful shadow evaluation. Carries relations only: no raw reference, no
 * declared basis, no timestamp, no provider or actor datum, no claim content,
 * no URL, no numeric value, no digest, no confidence, no ranking, no authority
 * grant, no execution or approval datum.
 */
export type DeclaredRevisionReferenceRelationSuccess = {
  readonly ok: true
  readonly candidateOnly: true
  readonly shadowOnly: true
  readonly humanReviewRequired: true
  /** Never any other literal: this module compares bytes, nothing more. */
  readonly referenceEqualityOnly: true
  /** Never any other literal: the caller's declared basis is not verified here. */
  readonly basisVerifiedHere: false
  /** Never any other literal: this module holds no identity authority. */
  readonly identityAuthority: "none"
  readonly declaredSubjectRefRelation: DeclaredReferenceRelation
  readonly declaredLogicalClaimRefRelation: DeclaredReferenceRelation
  readonly declaredRevisionRefRelation: DeclaredReferenceRelation
  /** Never any other literal: byte equality is not immutable revision identity. */
  readonly immutableRevisionIdentity: "not_established"
  /** Never any other literal: byte equality is not logical-claim continuity. */
  readonly logicalClaimContinuity: "not_established"
  /** Never any other literal: this module cannot bind a claim. */
  readonly claimBinding: "not_established"
  /** Never any other literal: this module cannot prove a transition. */
  readonly transitionEvidence: "not_established"
  /** Never any other literal: this module cannot prove supersession order. */
  readonly supersessionOrder: "not_established"
  /** Never any other literal: this module cannot prove a correction relation. */
  readonly correctionRelation: "not_established"
  readonly reasonCodes: readonly DeclaredRevisionReferenceReasonCode[]
  readonly narrative: readonly string[]
}

export type DeclaredRevisionReferenceRelationResult =
  | DeclaredRevisionReferenceRelationSuccess
  | DeclaredRevisionReferenceFailure

/** Detached inert snapshot of one attested success. Same closed fields, freshly cloned per call. */
export type DeclaredRevisionReferenceSnapshot = Omit<DeclaredRevisionReferenceRelationSuccess, "ok">

export type DeclaredRevisionReferenceSnapshotFailure = {
  readonly ok: false
  readonly failureCode: "attestation_rejected"
}

export type DeclaredRevisionReferenceSnapshotSuccess = {
  readonly ok: true
  readonly snapshot: DeclaredRevisionReferenceSnapshot
}

export type DeclaredRevisionReferenceSnapshotResult =
  | DeclaredRevisionReferenceSnapshotSuccess
  | DeclaredRevisionReferenceSnapshotFailure
