/**
 * F4 — Candidate-only formation state mappings.
 *
 * F4 MAPS already-validated candidate state. It does not decide Goal Identity,
 * does not recompute the Done Condition, does not detect general conflicts, does
 * not mutate membership, does not formalize, and does not merge or split. Every
 * successful output is literal `candidateOnly: true` and `humanReviewRequired:
 * true`; the input cannot set either to false.
 *
 * Authorities consumed read-only:
 *  - F1B: sole Done Condition status authority — its canonical
 *    `status` / `missingFields` / `invalidReasons` are READ, never recomputed.
 *  - F1C: sole validated-subject authority — a subject is admitted only as the
 *    EXACT attested F1C success result (`snapshotValidatedWorkUnitFormationResult`).
 *  - F3: sole grouping-evidence/verdict authority — a grouping outcome is mapped
 *    only from an ATTESTED F3 success (`snapshotValidatedGroupingComparisonResult`),
 *    bound to its EXACT original comparison input; the detached snapshot is the
 *    only source of verdict/reason data.
 *
 * Candidate references are PAIR-RELATIVE only. F4 accepts no global candidate
 * identifier: a merge target is named `left` / `right` against the attested
 * comparison pair, the source side is the deterministic opposite, and any
 * legacy `leftCandidateId` / `rightCandidateId` / `mergeTargetCandidateId`
 * field fails closed. Every successful outcome is additionally bound by runtime
 * provenance to the exact `GroupingComparisonInput` that produced it, so a
 * proposal derived from one pair never attests against another.
 *
 * The `conflict` state is part of the shared formation-state vocabulary but is
 * RESERVED — general conflict detection belongs to F6 and F4 NEVER emits it.
 * `formal_candidate` here is a STATE LABEL only: F4 builds no `FormalNodeCandidate`
 * and authorizes no pending-to-formal promotion. `possible_match` never becomes a
 * default-grouped, strong, or membership-changing outcome. `detectForbiddenPromotion`
 * proves that merge/split candidates cannot finalize.
 */

import type {
  GroupingComparisonInput,
  SuccessfulWorkUnitFormationResult,
} from "./groupingTypes.ts"
import {
  snapshotValidatedGroupingComparisonResult,
  type SuccessfulGroupingComparisonResult,
} from "./grouping.ts"
import { snapshotValidatedWorkUnitFormationResult } from "./workUnitFormationAggregate.ts"
import { detectForbiddenPromotion } from "../decomposition/promotionRules.ts"
import type {
  ForbiddenPromotionReason,
  MergeCandidate,
  SplitCandidate,
} from "../decomposition/types.ts"

// ─── Formation-state vocabulary (Section 7) ─────────────────────
//
// Exactly these six. `conflict` is RESERVED (F6), present in the shared
// vocabulary but never emitted by F4. `possible_match` / `strong_match` /
// `must_split` are F3 VERDICTS, not formation states, and deliberately absent.

export const FORMATION_STATES = [
  "formal_candidate",
  "clarification_needed",
  "context_only",
  "merge_candidate",
  "split_candidate",
  "conflict",
] as const

export type FormationState = (typeof FORMATION_STATES)[number]

/** The RESERVED states F4 must never emit (`conflict` → F6). */
export const RESERVED_FORMATION_STATES = ["conflict"] as const satisfies readonly FormationState[]

/** The narrower set of states F4 MAY emit. `conflict` is excluded. */
export const F4_EMITTABLE_STATES = [
  "formal_candidate",
  "clarification_needed",
  "context_only",
  "merge_candidate",
  "split_candidate",
] as const satisfies readonly FormationState[]

export type F4EmittableFormationState = (typeof F4_EMITTABLE_STATES)[number]

// ─── Subject-state input (Section 8) ────────────────────────────

/**
 * The closed subject-state input: exactly one attested F1C success result.
 * Nothing else is admitted — no raw F1A/F1B/F1C candidate, grouping evidence,
 * provider payload, ROI, priority, timestamp, actor weight, or LLM output.
 */
export type FormationSubjectStateInput = {
  readonly formationResult: SuccessfulWorkUnitFormationResult
}

/** The states subject-state mapping may produce (a strict subset of emittable). */
export type SubjectFormationState =
  | "formal_candidate"
  | "clarification_needed"
  | "context_only"

// Closed subject-state reason kinds + templates (Section 9, Section 17). No raw
// Goal text, missing-field value, invalid raw value, source title/summary/URL,
// provider payload, actor, or container is ever echoed.
export const SUBJECT_STATE_REASON_KINDS = [
  "done_condition_status_invalid",
  "done_condition_status_partial",
  "adapter_issue_present",
  "independent_closure_unknown",
  "parent_bounded_context_only",
  "complete_independent_formal_candidate",
] as const

export type SubjectStateReasonKind = (typeof SUBJECT_STATE_REASON_KINDS)[number]

const SUBJECT_STATE_REASONS: Record<SubjectStateReasonKind, string> = {
  done_condition_status_invalid: "The canonical Done Condition status is invalid.",
  done_condition_status_partial: "The canonical Done Condition status is partial.",
  adapter_issue_present: "At least one formation adapter issue is present.",
  independent_closure_unknown: "Independent closure is unknown.",
  parent_bounded_context_only:
    "This complete Goal closes only within its parent, so it maps to context only.",
  complete_independent_formal_candidate:
    "This complete, independently closable Goal maps to a formal candidate.",
}

export type FormationSubjectStateResult =
  | { readonly ok: false; readonly candidateOnly: true; readonly reason: "subject_not_validated" }
  | {
    readonly ok: true
    readonly candidateOnly: true
    readonly humanReviewRequired: true
    readonly state: SubjectFormationState
    readonly reasonKinds: readonly SubjectStateReasonKind[]
    readonly reasons: readonly string[]
  }

/**
 * Deterministically map an attested F1C subject to its formation state.
 *
 * The F1C success result must be the EXACT attested object; a clone, forged
 * object, bare candidate, or failed result rejects value-free as
 * `subject_not_validated`. Only the DETACHED attested snapshot's canonical
 * fields are read — `goalDoneCondition.doneCondition.{status,missingFields,
 * invalidReasons}`, `goalDoneCondition.adapterIssues`, and
 * `goalDoneCondition.independentClosure`. Nothing is recomputed and no canonical
 * field is rewritten.
 *
 * Precedence (Section 9):
 *   1. status invalid                                → clarification_needed
 *   2. status partial                                → clarification_needed
 *   3. any adapterIssue                              → clarification_needed
 *   4. independentClosure unknown                    → clarification_needed
 *   5. complete + parent_bounded + zero issues       → context_only
 *   6. complete + independent   + zero issues        → formal_candidate
 */
export function mapFormationSubjectState(
  input: FormationSubjectStateInput,
): FormationSubjectStateResult {
  const snapshot = snapshotValidatedWorkUnitFormationResult(
    (input as { formationResult?: unknown } | null | undefined)?.formationResult,
  )
  if (snapshot === null) return { ok: false, candidateOnly: true, reason: "subject_not_validated" }

  const gdc = snapshot.goalDoneCondition
  const status = gdc.doneCondition.status
  const issues = gdc.adapterIssues
  const closure = gdc.independentClosure

  // Collect all applicable closed reason kinds in a fixed deterministic order;
  // the STATE itself is decided by strict precedence below.
  const reasonKinds: SubjectStateReasonKind[] = []
  if (status === "invalid") reasonKinds.push("done_condition_status_invalid")
  if (status === "partial") reasonKinds.push("done_condition_status_partial")
  if (Array.isArray(issues) && issues.length > 0) reasonKinds.push("adapter_issue_present")
  if (closure === "unknown") reasonKinds.push("independent_closure_unknown")

  const hasIssue = Array.isArray(issues) && issues.length > 0
  let state: SubjectFormationState
  if (status === "invalid" || status === "partial" || hasIssue || closure === "unknown") {
    // A partial/invalid subject is NEVER formal_candidate; an unknown closure is
    // NEVER formal_candidate or context_only; any adapter issue defers.
    state = "clarification_needed"
  } else if (status === "complete" && closure === "parent_bounded") {
    // A parent_bounded subject is NEVER formal_candidate.
    state = "context_only"
    reasonKinds.push("parent_bounded_context_only")
  } else {
    // complete + independent + zero issues (the only remaining case).
    state = "formal_candidate"
    reasonKinds.push("complete_independent_formal_candidate")
  }

  return {
    ok: true,
    candidateOnly: true,
    humanReviewRequired: true,
    state,
    reasonKinds,
    reasons: reasonKinds.map((kind) => SUBJECT_STATE_REASONS[kind]),
  }
}

// ─── Pair-relative candidate references (Sections 5–8) ──────────
//
// F4 previously accepted free-form `leftCandidateId` / `rightCandidateId` /
// `mergeTargetCandidateId` strings and copied them verbatim into the emitted
// proposal. Those labels were NEVER bound to the attested subjects carried by
// `comparisonInput`, so a genuine A/B verdict could be relabeled to name
// unrelated candidates C/D. Validating their SHAPE (a safe-id regex) and
// checking that the merge target was one of the SUPPLIED ids did not help: the
// supplied ids themselves were unproven.
//
// F4 has no trusted global candidate registry to resolve such an id against,
// and adding a public arbitrary-id binding builder here would only move the
// same unbound trust one call earlier. So F4 now accepts NO global candidate
// identifier at all. A merge target is named only RELATIVE to the attested
// comparison pair — `left` or `right` — which is meaningful ONLY together with
// the exact `comparisonInput` the F3 result is already attested against.
// Resolving a side back to a durable candidate id belongs to a later,
// separately reviewed trusted boundary.

export const FORMATION_PAIR_SIDES = ["left", "right"] as const

export type FormationPairSide = (typeof FORMATION_PAIR_SIDES)[number]

const PAIR_SIDE_SET: ReadonlySet<string> = new Set(FORMATION_PAIR_SIDES)

function isPairSide(value: unknown): value is FormationPairSide {
  return typeof value === "string" && PAIR_SIDE_SET.has(value)
}

function oppositePairSide(side: FormationPairSide): FormationPairSide {
  return side === "left" ? "right" : "left"
}

// Legacy unbound fields (Section 6). Their mere PRESENCE fails closed, so a
// stale caller can never believe its old candidate ids still control the
// output. The supplied value is never read beyond presence and never echoed.
const LEGACY_UNBOUND_FIELDS = [
  "leftCandidateId",
  "rightCandidateId",
  "mergeTargetCandidateId",
] as const

function hasLegacyUnboundField(input: unknown): boolean {
  if (input === null || typeof input !== "object") return false
  for (const field of LEGACY_UNBOUND_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) return true
  }
  return false
}

// ─── Grouping-outcome input & result (Sections 11, 12) ──────────

/**
 * The closed grouping-outcome input. `comparisonResult` must be the EXACT F3
 * success object bound to the EXACT `comparisonInput` that produced it (runtime
 * provenance, not shape). `mergeTargetSide` names the merge target only
 * RELATIVE to that attested pair; no global candidate identifier is accepted.
 */
export type FormationGroupingOutcomeInput = {
  readonly comparisonInput: GroupingComparisonInput
  readonly comparisonResult: SuccessfulGroupingComparisonResult
  readonly mergeTargetSide?: FormationPairSide
}

export const FORMATION_GROUPING_OUTCOME_REJECTIONS = [
  "grouping_not_validated",
  "unbound_candidate_reference_supplied",
  "merge_target_side_required",
  "merge_target_side_invalid",
  "forbidden_promotion_proof_missing",
] as const

export type FormationGroupingOutcomeRejection =
  (typeof FORMATION_GROUPING_OUTCOME_REJECTIONS)[number]

/**
 * A merge candidate carrying PAIR-RELATIVE identity only (Section 7). The
 * existing candidate semantics are preserved except that the unbound global
 * `targetNodeCandidateId` is replaced by `targetSide` / `sourceSide`, which are
 * meaningful only against the attested `comparisonInput`.
 */
export type PairBoundMergeCandidate = Omit<MergeCandidate, "targetNodeCandidateId"> & {
  readonly targetSide: FormationPairSide
  readonly sourceSide: FormationPairSide
}

/**
 * A split candidate bound to the compared pair (Section 8). `pairSides` records
 * that the proposal concerns exactly the two attested sides; the proposal is
 * further tied to its exact comparison input by runtime provenance.
 */
export type PairBoundSplitCandidate = SplitCandidate & {
  readonly pairSides: readonly ["left", "right"]
}

export type FormationGroupingOutcomeResult =
  | {
    readonly ok: false
    readonly candidateOnly: true
    readonly reason: FormationGroupingOutcomeRejection
  }
  | {
    // Section 12.B / 12.C — strong or possible merge candidate.
    readonly ok: true
    readonly candidateOnly: true
    readonly humanReviewRequired: true
    readonly state: "merge_candidate"
    readonly groupingOutcome: "merge_candidate"
    readonly basisVerdict: "strong_match" | "possible_match"
    readonly proposalStrength: "strong" | "possible"
    readonly defaultGrouped: false
    readonly mergeCandidate: PairBoundMergeCandidate
    readonly forbiddenPromotionReasons: readonly ForbiddenPromotionReason[]
  }
  | {
    // Section 12.A — hard split candidate.
    readonly ok: true
    readonly candidateOnly: true
    readonly humanReviewRequired: true
    readonly state: "split_candidate"
    readonly groupingOutcome: "split_candidate"
    readonly basisVerdict: "must_split"
    readonly splitCandidate: PairBoundSplitCandidate
    readonly forbiddenPromotionReasons: readonly ForbiddenPromotionReason[]
  }
  | {
    // Section 12.D — insufficient: no grouping candidate is created.
    readonly ok: true
    readonly candidateOnly: true
    readonly humanReviewRequired: true
    readonly state: null
    readonly groupingOutcome: "none"
    readonly basisVerdict: "insufficient"
  }

/** A successful F4 grouping-outcome result — the only attestable outcome. */
export type SuccessfulFormationGroupingOutcomeResult = Extract<
  FormationGroupingOutcomeResult,
  { readonly ok: true }
>

/** A fresh, fully detached inert snapshot of a validated F4 outcome result. */
export type SuccessfulFormationGroupingOutcomeSnapshot = SuccessfulFormationGroupingOutcomeResult

// Closed split-part text (Section 12.A). No raw Goal text is ever copied in.
const SPLIT_PART_A_TITLE = "Goal candidate A"
const SPLIT_PART_B_TITLE = "Goal candidate B"
const SPLIT_PART_REASON = "Preserve this independently closable Goal as a separate candidate."

// Closed fallbacks (Section 17) used only when the attested F3 reasons is empty.
const SPLIT_REASON_FALLBACK = "A deterministic hard split separates these Goal candidates."
const MERGE_REASON_FALLBACK = "The candidates share a compatible Done Condition; human review is required."

// Reason bounds (Section 17): stable order, ≤20 entries, ≤200 chars each. The
// attested F3 reasons are already closed deterministic templates — they are
// re-bounded here and never concatenated with any extra data.
const MAX_STATE_REASONS = 20
const MAX_STATE_REASON_LENGTH = 200

function boundReasons(reasons: readonly string[]): string[] {
  const out: string[] = []
  for (const reason of reasons) {
    if (typeof reason !== "string") continue
    out.push(reason.length > MAX_STATE_REASON_LENGTH ? reason.slice(0, MAX_STATE_REASON_LENGTH) : reason)
    if (out.length >= MAX_STATE_REASONS) break
  }
  return out
}

function reject(reason: FormationGroupingOutcomeRejection): FormationGroupingOutcomeResult {
  return { ok: false, candidateOnly: true, reason }
}

// ─── F4 grouping-outcome runtime provenance (Sections 9, 10) ────
//
// Two different genuine `must_split` comparisons produce structurally identical
// closed proposals (the titles and reasons are constants, and no raw Goal text,
// source id, or global candidate id may be exposed). Pair traceability is
// therefore established by IDENTITY, not by payload: the EXACT successful result
// object is registered here against (a) the EXACT original
// `GroupingComparisonInput` identity and (b) a detached inert snapshot taken
// before the result is exposed. A spread/JSON/structuredClone copy, a forged
// look-alike, a Proxy wrapper, an `Object.create` descendant, a failed result,
// or the exact result paired with a cloned/different/other-pair input is a
// different identity and never attests. No public forgeable brand is added.

type AttestedOutcomeEntry = {
  readonly input: object
  readonly snapshot: SuccessfulFormationGroupingOutcomeSnapshot
}

const attestedOutcomeResults = new WeakMap<object, AttestedOutcomeEntry>()

// Deep clone over INTERNALLY-CONSTRUCTED, JSON-safe data only. Never run over an
// arbitrary caller graph: callers reach only the WeakMap identity lookup.
function inertOutcomeClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item) => inertOutcomeClone(item)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = inertOutcomeClone((value as Record<string, unknown>)[key])
  }
  return out as T
}

function registerOutcome(
  result: SuccessfulFormationGroupingOutcomeResult,
  comparisonInput: object,
): SuccessfulFormationGroupingOutcomeResult {
  attestedOutcomeResults.set(result, {
    input: comparisonInput,
    snapshot: inertOutcomeClone(result),
  })
  return result
}

/**
 * Runtime-provenance attestation for a validated F4 grouping outcome.
 *
 * Returns a fresh, fully detached inert snapshot ONLY when `value` is the EXACT
 * successful object a real `mapFormationGroupingOutcome` call returned AND
 * `comparisonInput` is the EXACT original comparison input that produced it;
 * otherwise `null`. This is what distinguishes two otherwise-identical split
 * proposals: a proposal derived from pair A does not attest against pair B.
 * Repeated snapshots neither alias each other nor the stored snapshot, and a
 * later mutation of the public result cannot alter it.
 */
export function snapshotValidatedFormationGroupingOutcomeResult(
  value: unknown,
  comparisonInput: unknown,
): SuccessfulFormationGroupingOutcomeSnapshot | null {
  if (value === null || typeof value !== "object") return null
  if (comparisonInput === null || typeof comparisonInput !== "object") return null
  const entry = attestedOutcomeResults.get(value as object)
  if (entry === undefined) return null
  if (entry.input !== (comparisonInput as object)) return null
  return inertOutcomeClone(entry.snapshot)
}

/**
 * Deterministically map an ATTESTED F3 verdict to a candidate-only grouping
 * outcome. The F3 success must be the exact object bound to its exact original
 * comparison input; a forged/cloned result, a cloned/different/other-pair input,
 * or a failed result rejects. No global candidate identifier is accepted: a
 * merge target is named only as `left` / `right` relative to that attested pair,
 * and any legacy unbound id field fails closed. F4 uses `comparisonInput` ONLY
 * as an identity token; all verdict/reason data comes from the detached
 * snapshot. The successful result is registered for pair-bound provenance.
 *
 *   must_split      → split_candidate       (2 parts, forbidden-promotion proof)
 *   strong_match    → merge_candidate/strong,   defaultGrouped false
 *   possible_match  → merge_candidate/possible,  defaultGrouped false (uncertain)
 *   insufficient    → groupingOutcome none  (no merge/split; not context_only)
 *   conflict        → never (F3 emits no conflict; F4 never emits conflict)
 */
export function mapFormationGroupingOutcome(
  input: FormationGroupingOutcomeInput,
): FormationGroupingOutcomeResult {
  const raw = input as Partial<FormationGroupingOutcomeInput> | null | undefined

  // 1. Legacy unbound candidate ids fail CLOSED (Section 6) — their presence
  //    alone rejects, so a stale caller cannot believe they still bind the
  //    output. The supplied value is never read beyond presence, never echoed.
  if (hasLegacyUnboundField(raw)) return reject("unbound_candidate_reference_supplied")

  // 2. Pair-side validation (value-free). An unknown/empty/id-shaped side is
  //    rejected without echoing it.
  const mergeTargetSide = raw?.mergeTargetSide
  if (mergeTargetSide !== undefined && !isPairSide(mergeTargetSide)) {
    return reject("merge_target_side_invalid")
  }

  // 3. F3 runtime-provenance attestation — the sole source of the verdict.
  const snapshot = snapshotValidatedGroupingComparisonResult(raw?.comparisonResult, raw?.comparisonInput)
  if (snapshot === null) return reject("grouping_not_validated")

  const reasons = boundReasons(snapshot.reasons)

  let result: FormationGroupingOutcomeResult
  switch (snapshot.verdict) {
    case "must_split":
      result = buildSplitOutcome(reasons)
      break
    case "strong_match":
      result = buildMergeOutcome("strong", mergeTargetSide, reasons)
      break
    case "possible_match":
      result = buildMergeOutcome("possible", mergeTargetSide, reasons)
      break
    case "insufficient":
      // No merge_candidate, no split_candidate, and NOT context_only.
      result = {
        ok: true,
        candidateOnly: true,
        humanReviewRequired: true,
        state: null,
        groupingOutcome: "none",
        basisVerdict: "insufficient",
      }
      break
    default:
      // Unreachable: the F3 verdict vocabulary is closed and excludes conflict.
      return reject("grouping_not_validated")
  }

  if (!result.ok) return result
  // 4. Bind the successful outcome to the EXACT comparison input identity, so a
  //    proposal derived from pair A never attests against pair B. Attestation
  //    above guarantees `comparisonInput` is an object.
  return registerOutcome(result, raw?.comparisonInput as object)
}

function buildSplitOutcome(reasons: readonly string[]): FormationGroupingOutcomeResult {
  const splitCandidate: PairBoundSplitCandidate = {
    target: "split_candidate",
    proposedParts: [
      { title: SPLIT_PART_A_TITLE, reason: SPLIT_PART_REASON },
      { title: SPLIT_PART_B_TITLE, reason: SPLIT_PART_REASON },
    ],
    splitReasons: reasons.length > 0 ? reasons : [SPLIT_REASON_FALLBACK],
    // The proposal concerns exactly the two attested sides. It carries no global
    // candidate id; pair traceability comes from runtime provenance.
    pairSides: ["left", "right"],
    humanReviewRequired: true,
    candidateOnly: true,
  }

  // Forbidden-promotion proof (Section 13). No Done Condition and no context are
  // passed, so no canonical re-evaluation is triggered. An empty/missing proof
  // is a hard failure.
  const forbiddenPromotionReasons = detectForbiddenPromotion({
    from: "split_candidate",
    to: "finalized_split",
  })
  if (!forbiddenPromotionReasons.includes("split_candidate_to_finalized_split")) {
    return reject("forbidden_promotion_proof_missing")
  }

  return {
    ok: true,
    candidateOnly: true,
    humanReviewRequired: true,
    state: "split_candidate",
    groupingOutcome: "split_candidate",
    basisVerdict: "must_split",
    splitCandidate,
    forbiddenPromotionReasons,
  }
}

function buildMergeOutcome(
  strength: "strong" | "possible",
  mergeTargetSide: FormationPairSide | undefined,
  reasons: readonly string[],
): FormationGroupingOutcomeResult {
  // A merge proposal must name its target side; it is never defaulted.
  if (mergeTargetSide === undefined) return reject("merge_target_side_required")
  // The source is deterministically the OPPOSITE side of the attested pair, so
  // a merge can never introduce a third candidate — there is no id to inject.
  const sourceSide = oppositePairSide(mergeTargetSide)

  const mergeCandidate: PairBoundMergeCandidate = {
    target: "merge_candidate",
    targetSide: mergeTargetSide,
    sourceSide,
    sameDoneConditionReason: reasons.length > 0 ? reasons[0] : MERGE_REASON_FALLBACK,
    // A possible match carries the closed uncertainty flag; a strong match carries none.
    riskFlags: strength === "possible" ? ["possible_match_uncertain"] : [],
    humanReviewRequired: true,
    candidateOnly: true,
  }

  const forbiddenPromotionReasons = detectForbiddenPromotion({
    from: "merge_candidate",
    to: "merged",
  })
  if (!forbiddenPromotionReasons.includes("merge_candidate_to_merged")) {
    return reject("forbidden_promotion_proof_missing")
  }

  return {
    ok: true,
    candidateOnly: true,
    humanReviewRequired: true,
    state: "merge_candidate",
    groupingOutcome: "merge_candidate",
    basisVerdict: strength === "strong" ? "strong_match" : "possible_match",
    proposalStrength: strength,
    // A possible match must NEVER default to grouped, and a strong proposal
    // still requires an explicit human grouping decision.
    defaultGrouped: false,
    mergeCandidate,
    forbiddenPromotionReasons,
  }
}
