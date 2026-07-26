/**
 * F5 — Deterministic State Prediction — closed types.
 *
 * SUBJECT-SCOPED ONLY. F5 explains exactly one already-validated formation
 * subject and consumes no pair artifact of any kind, so it can never associate a
 * subject with a pair it was never proven to belong to. F4 remains the sole
 * authority for pair verdicts, merge/split proposals and membership. F5 decides
 * no Goal Identity, changes no membership, resolves no conflict, formalizes
 * nothing, approves nothing, executes nothing, and emits no F6 conflict finding
 * and no F7 ranking. There is deliberately no numeric field.
 */

import type { WorkUnitFormationResult } from "./workUnitFormationAggregate.ts"

/** The ONLY admissible input: a successful F1C aggregate result. */
export type ValidatedFormationSubjectResult = Extract<WorkUnitFormationResult, { readonly ok: true }>

// Closed factor vocabulary. `actor: known`, `update: unchanged` and `unresolved:
// unknown` are RESERVED and unreachable — F1A binds no actor identity to an
// authority signal, no trusted previous-state baseline exists, and no unresolved
// item can be marked uncertain. An inferred limit is never a fact; event time is
// the SOURCE event, never our record time; an edit alone is not a meaningful
// update; provider is never authority; unresolved is never "unread".
export const STATE_PREDICTION_ACTOR_FACTORS = ["known", "asserted", "unknown"] as const
export const STATE_PREDICTION_LIMIT_FACTORS = ["explicit", "inferred", "absent"] as const
export const STATE_PREDICTION_EVENT_TIME_FACTORS = ["known", "uncertain", "absent"] as const
export const STATE_PREDICTION_UPDATE_FACTORS = ["meaningful", "unchanged", "unknown"] as const
export const STATE_PREDICTION_AUTHORITY_FACTORS = ["structured", "asserted", "absent"] as const
export const STATE_PREDICTION_UNRESOLVED_FACTORS = ["present", "absent", "unknown"] as const
export const STATE_PREDICTION_MISSING_FACTORS = ["present", "absent"] as const

export type StatePredictionActorFactor = (typeof STATE_PREDICTION_ACTOR_FACTORS)[number]
export type StatePredictionLimitFactor = (typeof STATE_PREDICTION_LIMIT_FACTORS)[number]
export type StatePredictionEventTimeFactor = (typeof STATE_PREDICTION_EVENT_TIME_FACTORS)[number]
export type StatePredictionUpdateFactor = (typeof STATE_PREDICTION_UPDATE_FACTORS)[number]
export type StatePredictionAuthorityFactor = (typeof STATE_PREDICTION_AUTHORITY_FACTORS)[number]
export type StatePredictionUnresolvedFactor = (typeof STATE_PREDICTION_UNRESOLVED_FACTORS)[number]
export type StatePredictionMissingFactor = (typeof STATE_PREDICTION_MISSING_FACTORS)[number]

// RESERVED and unreachable from every current input, in the same shape F4 uses
// for its reserved `conflict`. Proving nothing changed needs a trusted previous-
// state baseline; F5 gets one attested subject and no prior snapshot, so absence
// of change evidence is NEVER evidence that nothing changed.
export const RESERVED_STATE_PREDICTION_UPDATE_FACTORS = ["unchanged"] as const satisfies readonly StatePredictionUpdateFactor[]

// RESERVED likewise: F1A models unresolvedMarkers separately and offers no way to
// mark an unresolved item inferred, so `update` uncertainty may never leak in here.
export const RESERVED_STATE_PREDICTION_UNRESOLVED_FACTORS = ["unknown"] as const satisfies readonly StatePredictionUnresolvedFactor[]

/** The complete closed factor set. There is no combined or universal value. */
export type FormationStatePredictionFactors = {
  readonly actor: StatePredictionActorFactor
  readonly limit: StatePredictionLimitFactor
  readonly eventTime: StatePredictionEventTimeFactor
  readonly update: StatePredictionUpdateFactor
  readonly authority: StatePredictionAuthorityFactor
  readonly unresolved: StatePredictionUnresolvedFactor
  readonly missing: StatePredictionMissingFactor
}

// One closed code per factor value plus one per mapped subject state. No raw
// text, identifier, timestamp, deadline value, count, or pair concept appears.
export const STATE_PREDICTION_REASON_CODES = [
  "actor_known_structured_owner", "actor_asserted_only", "actor_unknown_no_assertion",
  "limit_explicit_declared", "limit_inferred_not_authoritative", "limit_absent",
  "event_time_known", "event_time_uncertain", "event_time_absent",
  "update_meaningful_recorded", "update_unchanged", "update_unknown_no_trusted_baseline",
  "authority_structured_signal", "authority_asserted_only", "authority_absent",
  "unresolved_present", "unresolved_unknown", "unresolved_absent",
  "missing_present", "missing_absent", "subject_state_formal_candidate",
  "subject_state_clarification_needed", "subject_state_context_only",
] as const

export type StatePredictionReasonCode = (typeof STATE_PREDICTION_REASON_CODES)[number]

/** Fail-closed rejections. Every one is value-free. */
export const STATE_PREDICTION_REJECTIONS = [
  "subject_not_validated", "subject_state_unavailable", "grouping_context_not_supported",
  "unbound_reference_supplied", "input_unreadable",
] as const

export type FormationStatePredictionRejection = (typeof STATE_PREDICTION_REJECTIONS)[number]

/**
 * The closed prediction input: exactly one attested F1C success and nothing
 * else. A pair, comparison input, F4 grouping outcome, candidate id, side,
 * token, ranking value, or safety-literal override fails closed on presence.
 */
export type FormationStatePredictionInput = { readonly formationResult: ValidatedFormationSubjectResult }

export type FormationStatePredictionResult =
  | { readonly ok: false; readonly candidateOnly: true; readonly reason: FormationStatePredictionRejection }
  | {
    readonly ok: true
    readonly candidateOnly: true
    readonly humanReviewRequired: true
    readonly factors: FormationStatePredictionFactors
    /** The F4 subject state, mapped from the same attested subject — unchanged. */
    readonly subjectState: "formal_candidate" | "clarification_needed" | "context_only"
    readonly reasonCodes: readonly StatePredictionReasonCode[]
    /** One bounded constant sentence per reason code, in the same order. */
    readonly narrative: readonly string[]
  }
