/**
 * F5 — Deterministic State Prediction — closed types.
 *
 * This file carries ONLY the closed vocabulary of the State Prediction slice:
 * the seven bounded factors, the closed reason codes, the fail-closed rejection
 * reasons, the pair-scoped grouping context, and the candidate-only result.
 *
 * What F5 is NOT (enforced by the absence of any such field here):
 *  - it decides no Goal Identity and no membership — it never says whether two
 *    sources belong together, and never merges, splits, or regroups;
 *  - it produces no F6 conflict finding and no F7 ranking, score, weight,
 *    urgency, or ordering — there is deliberately no numeric field at all;
 *  - it formalizes nothing, approves nothing, and executes nothing.
 *
 * State Prediction answers only "what is happening now, and why does it matter
 * now?" for ONE already-validated formation subject, using closed factors and
 * bounded deterministic reason codes.
 */

import type { GroupingComparisonInput, SuccessfulWorkUnitFormationResult } from "./groupingTypes.ts"
import type { SubjectFormationState, SuccessfulFormationGroupingOutcomeResult } from "./states.ts"

// ─── Closed factor vocabulary (Section 6) ───────────────────────

/** Who is acting. A source-asserted actor is NEVER promoted to `known`. */
export const STATE_PREDICTION_ACTOR_FACTORS = ["known", "asserted", "unknown"] as const
/** A declared time limit. An inferred limit is NEVER a deterministic fact. */
export const STATE_PREDICTION_LIMIT_FACTORS = ["explicit", "inferred", "absent"] as const
/** When the source event happened — never when our record changed. */
export const STATE_PREDICTION_EVENT_TIME_FACTORS = ["known", "uncertain", "absent"] as const
/** Whether a MEANINGFUL change occurred — an edit alone is not an update. */
export const STATE_PREDICTION_UPDATE_FACTORS = ["meaningful", "unchanged", "unknown"] as const
/** Recorded authority. Provider identity is never authority. */
export const STATE_PREDICTION_AUTHORITY_FACTORS = ["structured", "asserted", "absent"] as const
/** Open items carried by the sources. Unresolved is never "unread". */
export const STATE_PREDICTION_UNRESOLVED_FACTORS = ["present", "absent", "unknown"] as const
/** Gaps in the Goal / Done Condition evidence. Missing stays missing. */
export const STATE_PREDICTION_MISSING_FACTORS = ["present", "absent"] as const

export type StatePredictionActorFactor = (typeof STATE_PREDICTION_ACTOR_FACTORS)[number]
export type StatePredictionLimitFactor = (typeof STATE_PREDICTION_LIMIT_FACTORS)[number]
export type StatePredictionEventTimeFactor = (typeof STATE_PREDICTION_EVENT_TIME_FACTORS)[number]
export type StatePredictionUpdateFactor = (typeof STATE_PREDICTION_UPDATE_FACTORS)[number]
export type StatePredictionAuthorityFactor = (typeof STATE_PREDICTION_AUTHORITY_FACTORS)[number]
export type StatePredictionUnresolvedFactor = (typeof STATE_PREDICTION_UNRESOLVED_FACTORS)[number]
export type StatePredictionMissingFactor = (typeof STATE_PREDICTION_MISSING_FACTORS)[number]

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

// ─── Closed reason codes (Section 7) ────────────────────────────
//
// Exactly one code per factor, one for the mapped subject state, and one for the
// pair-scoped grouping context. No raw Goal text, source text, actor name,
// timestamp value, deadline value, identifier, or count is ever encoded here.

export const STATE_PREDICTION_REASON_CODES = [
  "actor_known_structured_owner",
  "actor_asserted_only",
  "actor_unknown_no_assertion",
  "limit_explicit_declared",
  "limit_inferred_not_authoritative",
  "limit_absent",
  "event_time_known",
  "event_time_uncertain",
  "event_time_absent",
  "update_meaningful_recorded",
  "update_unchanged",
  "update_unknown_inferred_only",
  "authority_structured_signal",
  "authority_asserted_only",
  "authority_absent",
  "unresolved_present",
  "unresolved_unknown_inferred_only",
  "unresolved_absent",
  "missing_present",
  "missing_absent",
  "subject_state_formal_candidate",
  "subject_state_clarification_needed",
  "subject_state_context_only",
  "grouping_context_absent",
  "grouping_fixed_strong_match",
  "grouping_fixed_possible_match_not_grouped",
  "grouping_fixed_split_candidate",
  "grouping_fixed_insufficient",
] as const

export type StatePredictionReasonCode = (typeof STATE_PREDICTION_REASON_CODES)[number]

// ─── Fail-closed rejections (value-free) ────────────────────────

export const STATE_PREDICTION_REJECTIONS = [
  "subject_not_validated",
  "subject_state_unavailable",
  "grouping_context_incomplete",
  "grouping_outcome_not_validated",
  "unbound_reference_supplied",
  "input_unreadable",
] as const

export type FormationStatePredictionRejection = (typeof STATE_PREDICTION_REJECTIONS)[number]

// ─── Pair-scoped grouping context (Section 5) ───────────────────

/**
 * A fixed F4 grouping outcome, reported as UNCHANGED context.
 *
 * It is PAIR-scoped, never subject-scoped: F5 resolves no side, so
 * `subjectSideResolved` is the literal `false` and no `targetSide` /
 * `sourceSide` / `pairSides` / pair token / subject ever appears. Every field is
 * copied from F4's detached attested snapshot; nothing here is recomputed, and
 * `groupingUnchanged` / `membershipUnchanged` are literals F5 writes itself.
 */
export type FormationStatePredictionGroupingContext =
  | { readonly present: false }
  | {
    readonly present: true
    readonly groupingOutcome: "merge_candidate" | "split_candidate" | "none"
    readonly basisVerdict: "strong_match" | "possible_match" | "must_split" | "insufficient"
    readonly formationState: "merge_candidate" | "split_candidate" | null
    readonly proposalStrength: "strong" | "possible" | null
    readonly defaultGrouped: false
    readonly groupingUnchanged: true
    readonly membershipUnchanged: true
    readonly subjectSideResolved: false
  }

// ─── Input / result ─────────────────────────────────────────────

/**
 * The closed prediction input. `formationResult` must be the EXACT attested F1C
 * success. The grouping context is optional and all-or-nothing: supplying it
 * requires BOTH the EXACT F4 outcome object and the EXACT comparison input it is
 * bound to. No candidate id, side, pair token, ranking value, conflict finding,
 * or safety-literal override may be supplied — their presence fails closed.
 */
export type FormationStatePredictionInput = {
  readonly formationResult: SuccessfulWorkUnitFormationResult
  readonly comparisonInput?: GroupingComparisonInput
  readonly groupingOutcomeResult?: SuccessfulFormationGroupingOutcomeResult
}

export type FormationStatePredictionResult =
  | {
    readonly ok: false
    readonly candidateOnly: true
    readonly reason: FormationStatePredictionRejection
  }
  | {
    readonly ok: true
    readonly candidateOnly: true
    readonly humanReviewRequired: true
    readonly factors: FormationStatePredictionFactors
    /** The F4 subject state, mapped from the same attested subject — unchanged. */
    readonly subjectState: SubjectFormationState
    readonly pairGroupingContext: FormationStatePredictionGroupingContext
    readonly reasonCodes: readonly StatePredictionReasonCode[]
    /** One bounded constant sentence per reason code, in the same order. */
    readonly narrative: readonly string[]
  }
