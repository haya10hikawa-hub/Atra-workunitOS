/**
 * HTPE H1A: closed types for the shadow two-axis temporal relation contract
 * (docs/HTPE_H1A_TEMPORAL_CONTRACT.md; H0 docs/PROVENANCE_CLAIM_CONTRACT.md).
 *
 * SHADOW ONLY. CANDIDATE ONLY. NO AUTHORITY. A temporal relation result is
 * evidence about how two bounded temporal observations relate in valid time,
 * observation time, recording time and arrival order — never proof either
 * represented proposition is true, never a transition, supersession, conflict
 * or latest/authority/timestamp-wins verdict; those stay `not_established`.
 *
 * DEPENDENCY LEAF. This module imports nothing. No Claim or ClaimBinding
 * types, no provider adapters, no persistence, no LLM path, no consumer.
 */

/** One side of a pairwise temporal comparison. Exact own keys, no extras. */
export type TemporalObservationInput = {
  /** Start of represented validity as a canonical UTC instant, or null = unknown (never "beginning of time"). */
  readonly validFrom: string | null
  /** End of represented validity as a canonical UTC instant, or null = unknown (never "now"/"infinity"). */
  readonly validTo: string | null
  /** When Atra observed the source stating this, canonical UTC instant. Required. */
  readonly observedAt: string
  /** When Atra recorded the observation, canonical UTC instant. Required; never earlier than observedAt. */
  readonly recordedAt: string
}

/** Exact public input: two observations, no ids, actors, providers or payloads. */
export type TemporalRelationInput = {
  readonly left: TemporalObservationInput
  readonly right: TemporalObservationInput
}

/** Valid-time relation. Strict orders require all four boundaries; anything less is `unresolved`. */
export type ValidTimeRelation =
  | "left_before_right"
  | "right_before_left"
  | "same_interval"
  | "overlaps"
  | "unresolved"

/** System-time relation for one required-instant axis (observedAt or recordedAt). Always computable. */
export type SystemTimeRelation =
  | "left_before_right"
  | "right_before_left"
  | "same_instant"

/** Arrival order of observation relative to proven valid-time order. */
export type ArrivalClassification =
  | "in_order"
  | "left_late_arriving"
  | "right_late_arriving"
  | "unresolved"

/** Closed reason-code vocabulary. Emission order is fixed: valid, observed, recorded, arrival, transition, supersession. */
export type TemporalReasonCode =
  | "valid_time_left_before_right"
  | "valid_time_right_before_left"
  | "valid_time_same_interval"
  | "valid_time_overlaps"
  | "valid_time_unresolved"
  | "observed_time_left_before_right"
  | "observed_time_right_before_left"
  | "observed_time_same_instant"
  | "recorded_time_left_before_right"
  | "recorded_time_right_before_left"
  | "recorded_time_same_instant"
  | "arrival_in_order"
  | "left_late_arriving"
  | "right_late_arriving"
  | "arrival_unresolved"
  | "transition_not_established"
  | "supersession_not_established"

/** Closed, value-free failure vocabulary. No caller-supplied key or value is ever echoed. */
export type TemporalRelationFailureCode =
  | "invalid_input"
  | "input_unreadable"
  | "unknown_field"
  | "missing_field"
  | "invalid_instant"
  | "invalid_valid_interval"
  | "recorded_before_observed"

export type TemporalRelationFailure = {
  readonly ok: false
  readonly failureCode: TemporalRelationFailureCode
}

/** Successful shadow evaluation. No raw input value, timestamp, number, score, rank or recommendation. */
export type TemporalRelationSuccess = {
  readonly ok: true
  readonly candidateOnly: true
  readonly shadowOnly: true
  readonly humanReviewRequired: true
  readonly validTimeRelation: ValidTimeRelation
  readonly observedTimeRelation: SystemTimeRelation
  readonly recordedTimeRelation: SystemTimeRelation
  readonly arrivalClassification: ArrivalClassification
  /** Never any other literal: H1A cannot prove a transition. */
  readonly transitionEvidence: "not_established"
  /** Never any other literal: H1A cannot prove supersession. */
  readonly supersessionOrder: "not_established"
  readonly reasonCodes: readonly TemporalReasonCode[]
  readonly narrative: readonly string[]
}

export type TemporalRelationResult = TemporalRelationSuccess | TemporalRelationFailure

/** Detached inert snapshot of one attested success. Same closed fields, freshly cloned per call. */
export type TemporalRelationSnapshot = Omit<TemporalRelationSuccess, "ok">

export type TemporalRelationSnapshotFailure = {
  readonly ok: false
  readonly failureCode: "attestation_rejected"
}

export type TemporalRelationSnapshotSuccess = {
  readonly ok: true
  readonly snapshot: TemporalRelationSnapshot
}

export type TemporalRelationSnapshotResult =
  | TemporalRelationSnapshotSuccess
  | TemporalRelationSnapshotFailure
