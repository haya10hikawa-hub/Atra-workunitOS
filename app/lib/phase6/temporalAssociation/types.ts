/**
 * HTPE H1B2A: closed types for the shadow declared-reference temporal
 * association contract
 * (docs/HTPE_H1B2A_DECLARED_TEMPORAL_ASSOCIATION_CONTRACT.md; predecessors
 * docs/HTPE_H1B1_REVISION_REFERENCE_CONTRACT.md and
 * docs/HTPE_H1A_TEMPORAL_CONTRACT.md).
 *
 * SHADOW ONLY. CANDIDATE ONLY. NO AUTHORITY. DECLARED ASSOCIATION ONLY.
 *
 * A result states one thing and nothing else: one caller supplied one
 * declared-reference descriptor and one temporal observation together through
 * two exact named fields, both predecessor contracts accepted detached copies
 * of those values for this call, and this module composed their results in the
 * current process. A declared association is NOT a ClaimBinding and NOT a
 * Temporal ClaimBinding: it establishes no subject identity, no logical-claim
 * identity or continuity, no immutable revision identity, no transition, no
 * correction, no supersession, no truth, no authority, no conflict, no latest
 * or preferred source and no persistence eligibility.
 *
 * TYPE DEPENDENCIES: exactly the two predecessor type modules, type-only, so
 * the public input shape is the predecessors' own shapes rather than a
 * re-declared copy that could drift. No predecessor symbol is re-exported.
 */

import type { DeclaredRevisionReferenceDescriptor } from "../revisionReference/types.ts"
import type { TemporalObservationInput } from "../temporalContract/types.ts"

/** Exact public input: two own keys. Co-submission is a caller DECLARATION, never
 *  evidence that the observation is *about* the referenced subject. Values are
 *  validated by the owning predecessor, never here. */
export type DeclaredReferenceTemporalAssociationInput = {
  readonly declaredReference: DeclaredRevisionReferenceDescriptor
  readonly temporalObservation: TemporalObservationInput
}

/** The only input-varying output, derived from H1A's own verdict. `boundary_unknown`
 *  means a boundary is UNKNOWN — never open, current, ongoing, still valid,
 *  unbounded or infinite. */
export type TemporalBoundaryStatus = "fully_bounded" | "boundary_unknown"

/** Closed reason-code vocabulary, emitted in the fixed order below: declaration,
 *  the two predecessor acceptances, the boundary status, then eleven constant
 *  non-authority codes. Only the boundary code varies with input. */
export type DeclaredTemporalAssociationReasonCode =
  | "caller_declared_named_field_co_submission"
  | "reference_contract_accepted_for_this_call"
  | "temporal_contract_accepted_for_this_call"
  | "valid_interval_fully_bounded"
  | "valid_interval_boundary_unknown"
  | "declaration_only_no_association_authority"
  | "process_local_composition_only"
  | "identity_authority_none"
  | "declared_basis_not_verified_here"
  | "immutable_revision_identity_not_established"
  | "logical_claim_continuity_not_established"
  | "claim_binding_not_established"
  | "temporal_claim_binding_not_established"
  | "transition_evidence_not_established"
  | "correction_relation_not_established"
  | "supersession_order_not_established"

/** Closed, value-free failure vocabulary. No caller key or value is echoed, and no
 *  predecessor failure code is forwarded: each predecessor rejection collapses to
 *  one opaque code. */
export type DeclaredTemporalAssociationFailureCode =
  | "invalid_input" | "input_unreadable" | "unknown_field" | "missing_field"
  | "reference_contract_rejected" | "temporal_contract_rejected"
  | "predecessor_attestation_rejected" | "predecessor_signature_mismatch"
  | "attestation_rejected"

/** The subset reachable from evaluation; `attestation_rejected` is emitted only by the snapshot surface. */
export type DeclaredTemporalAssociationEvaluationFailureCode =
  Exclude<DeclaredTemporalAssociationFailureCode, "attestation_rejected">

export type DeclaredTemporalAssociationFailure = {
  readonly ok: false
  readonly failureCode: DeclaredTemporalAssociationEvaluationFailureCode
}

/**
 * Successful shadow evaluation. Classification literals only: no raw reference,
 * declared basis, timestamp or boundary, provider or actor datum, claim content,
 * URL, numeric value, digest, count, index, score, confidence, rank, truth or
 * conflict verdict, latest or preferred source, authority grant, execution or
 * approval datum, or predecessor result or snapshot. EVERY field is a
 * single-literal constant except `temporalBoundaryStatus`; the two
 * `…ContractCheck` fields say acceptance is scoped to THIS CALL, not to the
 * reference or the observation.
 */
export type DeclaredReferenceTemporalAssociationSuccess = {
  readonly ok: true
  readonly candidateOnly: true
  readonly shadowOnly: true
  readonly humanReviewRequired: true
  readonly declaredAssociation: "caller_declared_named_field_co_submission"
  readonly associationAuthority: "declaration_only"
  readonly processLocalComposition: "established"
  readonly referenceContractCheck: "accepted_for_this_call"
  readonly temporalContractCheck: "accepted_for_this_call"
  readonly temporalBoundaryStatus: TemporalBoundaryStatus
  readonly identityAuthority: "none"
  readonly basisVerifiedHere: false
  readonly immutableRevisionIdentity: "not_established"
  readonly logicalClaimContinuity: "not_established"
  readonly claimBinding: "not_established"
  readonly temporalClaimBinding: "not_established"
  readonly transitionEvidence: "not_established"
  readonly correctionRelation: "not_established"
  readonly supersessionOrder: "not_established"
  readonly reasonCodes: readonly DeclaredTemporalAssociationReasonCode[]
  readonly narrative: readonly string[]
}

export type DeclaredReferenceTemporalAssociationResult =
  | DeclaredReferenceTemporalAssociationSuccess
  | DeclaredTemporalAssociationFailure

/** Detached inert snapshot of one attested success. Same closed fields, freshly cloned per call. */
export type DeclaredReferenceTemporalAssociationSnapshot =
  Omit<DeclaredReferenceTemporalAssociationSuccess, "ok">

export type DeclaredReferenceTemporalAssociationSnapshotFailure = {
  readonly ok: false
  readonly failureCode: "attestation_rejected"
}

export type DeclaredReferenceTemporalAssociationSnapshotSuccess = {
  readonly ok: true
  readonly snapshot: DeclaredReferenceTemporalAssociationSnapshot
}

export type DeclaredReferenceTemporalAssociationSnapshotResult =
  | DeclaredReferenceTemporalAssociationSnapshotSuccess
  | DeclaredReferenceTemporalAssociationSnapshotFailure
