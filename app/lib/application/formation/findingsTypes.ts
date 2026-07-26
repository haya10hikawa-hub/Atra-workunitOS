/**
 * F6A — Deterministic Formation Findings — closed types.
 *
 * F6A is the FOUNDATION of F6, not the full semantic-conflict layer. It reports what the canonical authorities ALREADY
 * recorded (F1B missing Goal fields, canonical Done Condition missing fields and invalid reasons, formation adapter issues)
 * plus the EXPLICIT supersession relationships F1A recorded, and nothing else. It recomputes no verdict and invents no
 * relationship.
 *
 * `conflict` — the state F4 and F5 reserve for F6 — is reachable from EXACTLY one input: a cycle in the RECORDED (non-
 * inferred), uniquely-bound supersession graph. Missing evidence, invalid evidence, an inferred supersession claim, a
 * `contradicting_claim` role, coexisting statuses, provider identity, actor overlap, timestamp proximity and differing
 * deadlines NEVER produce conflict: none of them is a typed contract binding two claims to one decision subject, so
 * treating any of them as a contradiction would be an invented relationship. The full semantic cases stay DEFERRED until
 * such a contract is reviewed.
 */

import type { GoalHypothesisField } from "./goalDoneConditionAdapter.ts"
import { GOAL_HYPOTHESIS_FIELDS } from "./goalDoneConditionAdapter.ts"
import type { FormationStatePredictionResult, ValidatedFormationSubjectResult } from "./statePredictionTypes.ts"

/** The internally produced F5 success. It is NEVER accepted from a caller. */
export type SuccessfulFormationStatePredictionResult = Extract<FormationStatePredictionResult, { readonly ok: true }>

// ─── Canonical upstream vocabularies (mirrored, never re-derived) ───
//
// The canonical Done Condition authority (`evaluateDoneConditionDraft`) emits exactly these field names and reason codes as
// bare strings, and F1B exactly these issue categories. F6A recognizes ONLY them; any other string is upstream drift and
// fails closed rather than being defaulted, guessed or dropped.
export const DONE_CONDITION_MISSING_FIELDS = ["outcome", "verifier", "acceptanceCriteria", "sourceRefOrHumanInputRef"] as const
export type DoneConditionMissingField = (typeof DONE_CONDITION_MISSING_FIELDS)[number]

export const DONE_CONDITION_INVALID_REASONS = ["ai_verifier_forbidden", "forbidden_context_field_present", "external_execution_payload_present"] as const
export type DoneConditionInvalidReason = (typeof DONE_CONDITION_INVALID_REASONS)[number]

export const FORMATION_ADAPTER_ISSUE_CATEGORIES = ["missing_goal_field", "evidence_membership_mismatch", "independent_closure_unknown"] as const
export type FormationAdapterIssueCategory = (typeof FORMATION_ADAPTER_ISSUE_CATEGORIES)[number]

// Pure closed classifiers, each returning `null` for ANY unrecognized value. They are exported so the drift boundary is
// directly probeable without adding a public surface that could admit a caller-supplied finding.
function closedClassifier<T extends string>(values: readonly T[]): (value: unknown) => T | null {
  const set: ReadonlySet<string> = new Set(values)
  return (value: unknown) => (typeof value === "string" && set.has(value) ? (value as T) : null)
}

export const classifyGoalHypothesisField = closedClassifier<GoalHypothesisField>(GOAL_HYPOTHESIS_FIELDS)
export const classifyDoneConditionMissingField = closedClassifier<DoneConditionMissingField>(DONE_CONDITION_MISSING_FIELDS)
export const classifyDoneConditionInvalidReason = closedClassifier<DoneConditionInvalidReason>(DONE_CONDITION_INVALID_REASONS)
export const classifyFormationAdapterIssueCategory = closedClassifier<FormationAdapterIssueCategory>(FORMATION_ADAPTER_ISSUE_CATEGORIES)

// ─── Findings ───────────────────────────────────────────────────

export const FORMATION_FINDING_KINDS = [
  "missing_goal_field", "missing_done_condition_field", "invalid_done_condition",
  "evidence_reference_rejected", "independent_closure_unknown",
  "supersession_recorded", "supersession_asserted_requires_review",
  "external_supersession_reference", "supersession_cycle",
] as const
export type FormationFindingKind = (typeof FORMATION_FINDING_KINDS)[number]

/**
 * A closed discriminated finding. There is deliberately no free-form kind, no severity, no numeric field, and no member
 * identity, adapter path, id, URL, title, actor, timestamp or deadline value: an adapter issue path such as
 * `evidenceRefs[3]` is caller-influenced and is never echoed.
 */
export type FormationFinding =
  | { readonly kind: "missing_goal_field"; readonly field: GoalHypothesisField }
  | { readonly kind: "missing_done_condition_field"; readonly field: DoneConditionMissingField }
  | { readonly kind: "invalid_done_condition"; readonly reason: DoneConditionInvalidReason }
  | { readonly kind: "evidence_reference_rejected" }
  | { readonly kind: "independent_closure_unknown" }
  | { readonly kind: "supersession_recorded" }
  | { readonly kind: "supersession_asserted_requires_review" }
  | { readonly kind: "external_supersession_reference" }
  | { readonly kind: "supersession_cycle" }

/** One closed code per finding kind, plus the two effective-state outcomes. */
export const FORMATION_FINDING_REASON_CODES = [
  "no_findings_recorded",
  "finding_missing_goal_field", "finding_missing_done_condition_field", "finding_invalid_done_condition",
  "finding_evidence_reference_rejected", "finding_independent_closure_unknown",
  "finding_supersession_recorded", "finding_supersession_asserted_requires_review",
  "finding_external_supersession_reference", "finding_supersession_cycle",
  "effective_state_from_state_prediction", "effective_state_conflict_recorded_supersession_cycle",
] as const
export type FormationFindingReasonCode = (typeof FORMATION_FINDING_REASON_CODES)[number]

/** Fail-closed rejections. Every one is value-free. */
export const FORMATION_FINDINGS_REJECTIONS = [
  "subject_not_validated", "state_prediction_unavailable", "unbound_reference_supplied",
  "upstream_contract_drift", "member_object_identity_ambiguous", "input_unreadable",
] as const
export type FormationFindingsRejection = (typeof FORMATION_FINDINGS_REJECTIONS)[number]

/**
 * The closed input: exactly one attested F1C success and nothing else. A caller-supplied F5 result, findings array, pair
 * artifact, ranking value or safety-literal override fails closed on OWN-PROPERTY PRESENCE, value unread.
 */
export type FormationFindingsInput = { readonly formationResult: ValidatedFormationSubjectResult }

export type SuccessfulFormationFindingsResult = {
  readonly ok: true
  readonly candidateOnly: true
  readonly humanReviewRequired: true
  /** The F5 success produced INTERNALLY from the same attested subject. */
  readonly statePrediction: SuccessfulFormationStatePredictionResult
  /** The F5 subject state, copied exactly. F6A never re-maps it. */
  readonly baseSubjectState: SuccessfulFormationStatePredictionResult["subjectState"]
  /** `baseSubjectState`, or `conflict` from a recorded supersession cycle ONLY. */
  readonly effectiveState: SuccessfulFormationStatePredictionResult["subjectState"] | "conflict"
  readonly findings: readonly FormationFinding[]
  readonly reasonCodes: readonly FormationFindingReasonCode[]
  /** One bounded constant sentence per reason code, in the same order. */
  readonly narrative: readonly string[]
}

export type FormationFindingsResult =
  | { readonly ok: false; readonly candidateOnly: true; readonly reason: FormationFindingsRejection }
  | SuccessfulFormationFindingsResult

/**
 * The runtime-attested snapshot F7 must consume. The public result carries NO member identity; traceability lives here as
 * bounded member POSITIONS, aligned one-to-one with `publicResult.findings`. Resolving a position back to a member requires
 * the exact F1C subject, which only the attestation can prove.
 */
export type FormationFindingsSnapshot = {
  readonly publicResult: SuccessfulFormationFindingsResult
  readonly evidenceMemberIndexesByFinding: readonly (readonly number[])[]
}
