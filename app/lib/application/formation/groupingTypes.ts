/**
 * F3 — Deterministic Goal Identity / grouping evidence — closed types.
 *
 * This module carries ONLY the closed, data-level vocabulary of the F3
 * comparison slice: the comparison input, the three evidence classes, the
 * verdict, the fail-closed rejection reasons, and the bounded retrieval result.
 *
 * What F3 is NOT (enforced by the absence of any such field here):
 *  - it emits no grouping OUTCOME — no merge_candidate, split_candidate,
 *    formal_candidate, context_only, or SourceRole;
 *  - it performs no membership change, State Prediction, ranking, projection,
 *    approval, execution, persistence, provider call, or LLM call;
 *  - the F1B Done Condition verdict is consumed read-only and never recomputed.
 *
 * The central rule is `same Goal + compatible Done Condition`. A hard split is
 * final; a hard positive can reach `strong_match` only with no hard split; weak
 * evidence can reach only `possible_match`, and only with the configured number
 * of DISTINCT weak kinds. `possible_match` is a suggestion, default NOT grouped.
 */

import type { FormationSourceProvider } from "./sourceContract.ts"
import type { WorkUnitFormationResult } from "./workUnitFormationAggregate.ts"

/** A successful F1C aggregate result — the ONLY admissible comparison subject. */
export type SuccessfulWorkUnitFormationResult = Extract<
  WorkUnitFormationResult,
  { readonly ok: true }
>

/**
 * An UNTRUSTED canonical-object selector. It never introduces an object: it is
 * admitted only when it exactly matches an object already present in the
 * subject's attested evidence universe, and its identity is then replaced by a
 * fresh canonical key drawn from that universe. Its own fields are never echoed.
 */
export type FormationObjectRefSelector = {
  readonly provider: FormationSourceProvider
  readonly sourceObjectId: string
}

/** One comparison subject: an attested F1C result plus an optional selector. */
export type GroupingSubjectInput = {
  readonly formationResult: SuccessfulWorkUnitFormationResult
  readonly canonicalWorkObjectRef?: FormationObjectRefSelector
}

/** The closed pairwise comparison input. */
export type GroupingComparisonInput = {
  readonly left: GroupingSubjectInput
  readonly right: GroupingSubjectInput
}

// ─── Verdict ────────────────────────────────────────────────────

export const GROUPING_VERDICTS = [
  "must_split",
  "strong_match",
  "possible_match",
  "insufficient",
] as const

export type GroupingVerdict = (typeof GROUPING_VERDICTS)[number]

// ─── Evidence kinds (closed) ────────────────────────────────────

/** Hard split — final; overrides every positive or weak signal. */
export const HARD_SPLIT_KINDS = [
  "different_work_object",
  "different_verifier",
  "separate_decision_boundary",
  "independently_closable_outcomes",
  "incompatible_acceptance_boundary",
] as const

export type HardSplitKind = (typeof HARD_SPLIT_KINDS)[number]

/** Hard positive — reaches `strong_match` only in the absence of a hard split. */
export const HARD_POSITIVE_KINDS = [
  "exact_provider_object",
  "explicit_cross_link",
  "same_canonical_work_object",
  "same_outcome",
  "same_verifier",
  "compatible_acceptance_criteria",
  "same_decision_boundary",
] as const

export type HardPositiveKind = (typeof HARD_POSITIVE_KINDS)[number]

/** Weak — never sufficient for `strong_match`; only supports `possible_match`. */
export const WEAK_KINDS = [
  "actor_overlap",
  "container_overlap",
  "provider_overlap",
  "timestamp_proximity",
  "related_deadline",
  "bounded_lexical_similarity",
] as const

export type WeakKind = (typeof WEAK_KINDS)[number]

/**
 * Safe support counts for an evidence record. They carry NO raw source content:
 * only how many candidate signals each side and the intersection hold. `left`
 * and `right` are per-side signal counts; `shared` is the intersecting count.
 */
export type GroupingEvidenceSupport = {
  readonly left: number
  readonly right: number
  readonly shared: number
}

/**
 * One evidence record: its closed `kind`, safe support counts, and exactly one
 * deterministic bounded human-readable reason. It never carries a raw title,
 * summary, URL, provider payload, chain of thought, opaque numeric score, or
 * tenant/user identity.
 */
export type GroupingEvidence<K extends string> = {
  readonly kind: K
  readonly support: GroupingEvidenceSupport
  readonly reason: string
}

// ─── Fail-closed rejection reasons (value-free) ─────────────────

export const GROUPING_REJECTION_REASONS = [
  "subject_not_validated",
  "subject_members_exceeded",
  "subject_object_keys_exceeded",
  "canonical_work_object_ref_not_a_member",
  "retrieval_candidates_exceeded",
] as const

export type GroupingRejectionReason = (typeof GROUPING_REJECTION_REASONS)[number]

/**
 * The comparison result. On success it is a pure evidence ledger plus a verdict
 * and bounded reasons; it is always `candidateOnly` and `humanReviewRequired`,
 * and carries no grouping outcome, membership, or finalization field.
 */
export type GroupingComparisonResult =
  | {
    readonly ok: false
    readonly candidateOnly: true
    readonly reason: GroupingRejectionReason
  }
  | {
    readonly ok: true
    readonly candidateOnly: true
    readonly humanReviewRequired: true
    readonly hardSplit: readonly GroupingEvidence<HardSplitKind>[]
    readonly hardPositive: readonly GroupingEvidence<HardPositiveKind>[]
    readonly weakSupport: readonly GroupingEvidence<WeakKind>[]
    readonly verdict: GroupingVerdict
    readonly reasons: readonly string[]
  }

// ─── Bounded candidate retrieval ────────────────────────────────

/**
 * Retrieval keys. Strong keys are exact object/link/work-object identity;
 * recall keys only widen the comparison set and never decide a verdict. Provider
 * identity ALONE is deliberately absent — provider overlap never retrieves.
 */
export const RETRIEVAL_KEY_KINDS = [
  "exact_provider_object",
  "explicit_cross_link",
  "same_canonical_work_object",
  "exact_work_object_text",
  "bounded_lexical_similarity",
] as const

export type RetrievalKeyKind = (typeof RETRIEVAL_KEY_KINDS)[number]

/** One retrieved candidate: its original stable index and the first key hit. */
export type GroupingRetrievalMatch = {
  readonly index: number
  readonly via: RetrievalKeyKind
}

export type GroupingRetrievalResult =
  | {
    readonly ok: false
    readonly candidateOnly: true
    readonly reason: GroupingRejectionReason
  }
  | {
    readonly ok: true
    readonly candidateOnly: true
    readonly comparable: readonly GroupingRetrievalMatch[]
  }
