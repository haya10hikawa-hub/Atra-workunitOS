/**
 * F5 — Deterministic State Prediction.
 *
 * F5 explains ONE already-validated formation subject: who is acting, what
 * limit applies, when the source event happened, whether a meaningful update
 * occurred, what authority is recorded, what is unresolved, and what is
 * missing. It answers "what is happening now, and why does it matter now?" and
 * nothing else.
 *
 * F5 explicitly does NOT answer whether sources belong to the same Goal,
 * whether membership should change, which WorkUnit comes first, whether a
 * conflict is resolved, whether a candidate is formalized, or whether anything
 * is approved or executed. It emits no F6 conflict finding, no F7 ranking value,
 * and no numeric score of any kind. Every successful output is literal
 * `candidateOnly: true` and `humanReviewRequired: true`; the input cannot set
 * either to false. There is no external call, no generated narrative and no
 * randomness or wall-clock read anywhere in this file — the same input always
 * produces byte-identical output.
 *
 * Authorities consumed read-only:
 *  - F1C: sole validated-subject authority — a subject is admitted only as the
 *    EXACT attested F1C success (`snapshotValidatedWorkUnitFormationResult`),
 *    and every factor is computed from the DETACHED inert snapshot it returns.
 *  - F1B (through that snapshot): sole Done Condition status authority — its
 *    canonical `status` / `missingFields` / `invalidReasons` / `adapterIssues` /
 *    `independentClosure` are READ, never recomputed.
 *  - F4: sole formation-state and grouping-outcome authority — the subject state
 *    is obtained by calling F4's own mapper with the already-attested subject
 *    (so no forged F4 state can be supplied), and a grouping outcome is admitted
 *    only as the EXACT attested F4 success bound to its EXACT comparison input
 *    (`snapshotValidatedFormationGroupingOutcomeResult`).
 *
 * Consumer boundary against F4/F3 (the carried F4 follow-up):
 *  F5 resolves NO pair side. It never reads `comparisonInput.left` / `.right`,
 *  never derives `targetSide` / `sourceSide` / `pairSides`, and never exposes
 *  the F3 pair token or either private subject. `comparisonInput` is captured
 *  ONCE and handed to the F4 attestation purely as an identity token; the
 *  attestation's own single verification read is the only read of the pair, so a
 *  mutated, swapped or phase-splitting caller fails closed instead of binding a
 *  prediction to a pair it did not come from. Consequently the grouping outcome
 *  enters as PAIR-SCOPED context only: F5 does not claim the subject is a member
 *  of that pair (`subjectSideResolved: false`), and no grouping value can reach
 *  any factor. Resolving a side back to a durable candidate belongs to a later,
 *  separately reviewed trusted boundary; F5 deliberately creates none.
 */

import type { FormationGoalDoneConditionCandidate } from "./goalDoneConditionAdapter.ts"
import type { FormationSourceCandidate } from "./sourceContract.ts"
import {
  mapFormationSubjectState,
  snapshotValidatedFormationGroupingOutcomeResult,
  type SubjectFormationState,
  type SuccessfulFormationGroupingOutcomeSnapshot,
} from "./states.ts"
import {
  snapshotValidatedWorkUnitFormationResult,
  type WorkUnitFormationCandidate,
} from "./workUnitFormationAggregate.ts"
import {
  type FormationStatePredictionFactors,
  type FormationStatePredictionGroupingContext,
  type FormationStatePredictionInput,
  type FormationStatePredictionRejection,
  type FormationStatePredictionResult,
  type StatePredictionActorFactor,
  type StatePredictionAuthorityFactor,
  type StatePredictionEventTimeFactor,
  type StatePredictionLimitFactor,
  type StatePredictionMissingFactor,
  type StatePredictionReasonCode,
  type StatePredictionUnresolvedFactor,
  type StatePredictionUpdateFactor,
} from "./statePredictionTypes.ts"

// ─── Closed classification tables ───────────────────────────────
//
// An authority signal counts as STRUCTURED only when the source records it as a
// fact (`inferred: false`) AND its kind is a structural record rather than a
// claim about a person. `decision_maker_named` is deliberately excluded: naming
// a decision maker is an assertion, not a structural authority. Provider
// identity appears nowhere here — provider is never authority.
const STRUCTURED_AUTHORITY_SIGNAL_KINDS: ReadonlySet<string> = new Set([
  "accepted_status",
  "owner_of_record",
  "signed_off_review",
  "official_external_communication",
  "superseded_marker",
])

/** Actor relations that assert responsibility without proving it. */
const ASSERTED_ACTOR_RELATIONS: ReadonlySet<string> = new Set(["owner_claimed", "approver_claimed"])

/** Status values that record a real state transition, not mere activity. */
const MEANINGFUL_STATUS_MARKERS: ReadonlySet<string> = new Set([
  "approved",
  "changes_requested",
  "merged",
  "closed",
  "cancelled",
])

/** Contradiction-shaped status pairs. Reported as unresolved — never resolved. */
const SETTLED_STATUS_MARKERS: ReadonlySet<string> = new Set(["approved", "merged"])
const CONTESTED_STATUS_MARKERS: ReadonlySet<string> = new Set(["changes_requested", "cancelled"])

// ─── Bounded constant narrative (Section 7) ─────────────────────
//
// One constant sentence per reason code. Nothing is interpolated: no Goal text,
// source title, summary, URL, identifier, actor name, timestamp, deadline value,
// or count can travel into a sentence, because no value is ever inserted.
const NARRATIVE: Record<StatePredictionReasonCode, string> = {
  actor_known_structured_owner: "A single named actor is backed by a recorded owner of record.",
  actor_asserted_only: "The acting party is only asserted by the sources and is not proven here.",
  actor_unknown_no_assertion: "No source asserts who is acting.",
  limit_explicit_declared: "At least one source declares an explicit time limit.",
  limit_inferred_not_authoritative: "A time limit is only inferred, so it is not treated as a fact.",
  limit_absent: "No source declares a time limit.",
  event_time_known: "Every source event time is recorded and internally consistent.",
  event_time_uncertain: "At least one source event time is inconsistent with its capture, so timing is uncertain.",
  event_time_absent: "No usable source event time is recorded.",
  update_meaningful_recorded: "A meaningful state change is recorded on at least one source.",
  update_unchanged: "No source records a change beyond its original state.",
  update_unknown_inferred_only: "Only inferred change signals are present, so whether anything meaningful changed is unknown.",
  authority_structured_signal: "At least one source carries a recorded structural authority signal.",
  authority_asserted_only: "Authority is only asserted or inferred, never structurally recorded.",
  authority_absent: "No source carries an authority signal.",
  unresolved_present: "At least one open item or contradiction-shaped signal is carried by the sources.",
  unresolved_unknown_inferred_only: "Only inferred change claims are present, so whether anything is unresolved is unknown.",
  unresolved_absent: "No source carries an open item.",
  missing_present: "Required Goal or Done Condition evidence is still missing.",
  missing_absent: "No required Goal or Done Condition evidence is missing.",
  subject_state_formal_candidate: "The validated subject state is a formal candidate awaiting human review.",
  subject_state_clarification_needed: "The validated subject state needs clarification before it can proceed.",
  subject_state_context_only: "The validated subject state is context only.",
  grouping_context_absent: "No fixed grouping decision was supplied with this subject.",
  grouping_fixed_strong_match: "A fixed strong-match grouping proposal exists for the supplied pair and still awaits a human decision.",
  grouping_fixed_possible_match_not_grouped: "A fixed possible-match grouping proposal exists for the supplied pair and is deliberately not grouped.",
  grouping_fixed_split_candidate: "A fixed split proposal exists for the supplied pair and is left exactly as decided.",
  grouping_fixed_insufficient: "The supplied pair produced no grouping proposal at all.",
}

/** One closed reason code per factor value, plus one per mapped subject state. */
const CODES = {
  actor: { known: "actor_known_structured_owner", asserted: "actor_asserted_only", unknown: "actor_unknown_no_assertion" },
  limit: { explicit: "limit_explicit_declared", inferred: "limit_inferred_not_authoritative", absent: "limit_absent" },
  eventTime: { known: "event_time_known", uncertain: "event_time_uncertain", absent: "event_time_absent" },
  update: { meaningful: "update_meaningful_recorded", unchanged: "update_unchanged", unknown: "update_unknown_inferred_only" },
  authority: { structured: "authority_structured_signal", asserted: "authority_asserted_only", absent: "authority_absent" },
  unresolved: { present: "unresolved_present", absent: "unresolved_absent", unknown: "unresolved_unknown_inferred_only" },
  missing: { present: "missing_present", absent: "missing_absent" },
  subjectState: { formal_candidate: "subject_state_formal_candidate", clarification_needed: "subject_state_clarification_needed", context_only: "subject_state_context_only" },
} as const satisfies {
  actor: Record<StatePredictionActorFactor, StatePredictionReasonCode>
  limit: Record<StatePredictionLimitFactor, StatePredictionReasonCode>
  eventTime: Record<StatePredictionEventTimeFactor, StatePredictionReasonCode>
  update: Record<StatePredictionUpdateFactor, StatePredictionReasonCode>
  authority: Record<StatePredictionAuthorityFactor, StatePredictionReasonCode>
  unresolved: Record<StatePredictionUnresolvedFactor, StatePredictionReasonCode>
  missing: Record<StatePredictionMissingFactor, StatePredictionReasonCode>
  subjectState: Record<SubjectFormationState, StatePredictionReasonCode>
}

// Caller-supplied fields that must never bind or override anything here. Their
// mere PRESENCE fails closed; the supplied value is never read and never echoed.
const FORBIDDEN_INPUT_FIELDS = [
  "candidateId", "leftCandidateId", "rightCandidateId", "mergeTargetCandidateId",
  "targetSide", "sourceSide", "pairSides", "pairToken", "subject", "factors",
  "roi", "score", "rank", "ranking", "priority", "urgency", "weight",
  "conflictFindings", "conflicts", "membership", "approved", "executed", "formalized",
  "candidateOnly", "humanReviewRequired", "reasonCodes", "narrative", "subjectState",
] as const

// ─── Defensive readers over the DETACHED attested snapshot ──────

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function instant(value: unknown): number {
  return typeof value === "string" ? Date.parse(value) : Number.NaN
}

function memberSources(candidate: WorkUnitFormationCandidate): readonly FormationSourceCandidate[] {
  const out: FormationSourceCandidate[] = []
  for (const member of list((candidate as { members?: unknown }).members)) {
    const source = record(member)?.source
    if (record(source) !== null) out.push(source as FormationSourceCandidate)
  }
  return out
}

function hasStructuredSignal(source: FormationSourceCandidate, kind: string): boolean {
  for (const signal of list((source as { authoritySignals?: unknown }).authoritySignals)) {
    const entry = record(signal)
    if (entry?.inferred === false && entry?.kind === kind) return true
  }
  return false
}

// ─── Factor classification (Section 6) ──────────────────────────

function classifyActor(sources: readonly FormationSourceCandidate[]): StatePredictionActorFactor {
  const names = new Set<string>()
  let structuredOwnerNamed = false
  for (const source of sources) {
    let named = false
    for (const assertion of list((source as { actorAssertions?: unknown }).actorAssertions)) {
      const name = record(assertion)?.name
      if (typeof name === "string" && name.length > 0) {
        names.add(name)
        named = true
      }
    }
    // A single named actor is `known` only when the SAME source also records an
    // owner of record as a fact. An assertion alone never reaches `known`.
    if (named && hasStructuredSignal(source, "owner_of_record")) structuredOwnerNamed = true
  }
  if (names.size === 0) return "unknown"
  return names.size === 1 && structuredOwnerNamed ? "known" : "asserted"
}

function classifyLimit(sources: readonly FormationSourceCandidate[]): StatePredictionLimitFactor {
  let inferred = false
  for (const source of sources) {
    const deadline = record((source as { explicitDeadline?: unknown }).explicitDeadline)
    if (deadline === null) continue
    if (deadline.inferred === false) return "explicit"
    inferred = true
  }
  return inferred ? "inferred" : "absent"
}

function classifyEventTime(sources: readonly FormationSourceCandidate[]): StatePredictionEventTimeFactor {
  let present = false
  let uncertain = false
  for (const source of sources) {
    const timestamps = record((source as { timestamps?: unknown }).timestamps)
    const occurred = instant(timestamps?.occurredAt)
    if (!Number.isFinite(occurred)) {
      uncertain = true
      continue
    }
    present = true
    const captured = instant(timestamps?.capturedAt)
    // Capture cannot precede the event it captured; the source event time is
    // recorded but cannot be trusted as exact. It is never silently corrected.
    if (Number.isFinite(captured) && occurred > captured) uncertain = true
    const edited = instant(timestamps?.editedAt)
    if (Number.isFinite(edited) && edited < occurred) uncertain = true
  }
  if (!present) return "absent"
  return uncertain ? "uncertain" : "known"
}

/** Change signals split into recorded facts and merely inferred claims. */
type ChangeSignals = { readonly meaningful: boolean; readonly inferredOnly: boolean }

function readChangeSignals(sources: readonly FormationSourceCandidate[]): ChangeSignals {
  let meaningful = false
  let inferredOnly = false
  for (const source of sources) {
    for (const marker of list((source as { decisionMarkers?: unknown }).decisionMarkers)) {
      if (record(marker)?.inferred === false) meaningful = true
      else inferredOnly = true
    }
    for (const key of ["supersedes", "supersededBy"] as const) {
      for (const claim of list((source as Record<string, unknown>)[key])) {
        if (record(claim)?.inferred === false) meaningful = true
        else inferredOnly = true
      }
    }
    for (const status of list((source as { statusMarkers?: unknown }).statusMarkers)) {
      if (typeof status === "string" && MEANINGFUL_STATUS_MARKERS.has(status)) meaningful = true
    }
    const version = record((source as { versionInfo?: unknown }).versionInfo)
    if (version !== null) {
      if (version.inferred === false) meaningful = true
      else inferredOnly = true
    }
    // An edit timestamp alone is activity, never a meaningful update.
    const timestamps = record((source as { timestamps?: unknown }).timestamps)
    if (timestamps?.editedAt !== undefined) inferredOnly = true
  }
  return { meaningful, inferredOnly }
}

function classifyUpdate(change: ChangeSignals): StatePredictionUpdateFactor {
  if (change.meaningful) return "meaningful"
  return change.inferredOnly ? "unknown" : "unchanged"
}

function classifyAuthority(sources: readonly FormationSourceCandidate[]): StatePredictionAuthorityFactor {
  let asserted = false
  let structured = false
  for (const source of sources) {
    for (const signal of list((source as { authoritySignals?: unknown }).authoritySignals)) {
      const entry = record(signal)
      if (entry === null) continue
      asserted = true
      if (entry.inferred === false && typeof entry.kind === "string" && STRUCTURED_AUTHORITY_SIGNAL_KINDS.has(entry.kind)) {
        structured = true
      }
    }
    for (const assertion of list((source as { actorAssertions?: unknown }).actorAssertions)) {
      const relation = record(assertion)?.assertedRelation
      if (typeof relation === "string" && ASSERTED_ACTOR_RELATIONS.has(relation)) asserted = true
    }
  }
  if (structured) return "structured"
  return asserted ? "asserted" : "absent"
}

function classifyUnresolved(
  sources: readonly FormationSourceCandidate[],
  change: ChangeSignals,
): StatePredictionUnresolvedFactor {
  let settled = false
  let contested = false
  for (const source of sources) {
    if (list((source as { unresolvedMarkers?: unknown }).unresolvedMarkers).length > 0) return "present"
    for (const status of list((source as { statusMarkers?: unknown }).statusMarkers)) {
      if (typeof status !== "string") continue
      if (SETTLED_STATUS_MARKERS.has(status)) settled = true
      if (CONTESTED_STATUS_MARKERS.has(status)) contested = true
    }
  }
  // Contradiction-shaped evidence is REPORTED, never resolved and never allowed
  // to regroup, merge, split, or change membership anywhere in this slice.
  if (settled && contested) return "present"
  return change.inferredOnly ? "unknown" : "absent"
}

function classifyMissing(candidate: WorkUnitFormationCandidate): StatePredictionMissingFactor {
  const gdc = record((candidate as { goalDoneCondition?: unknown }).goalDoneCondition) as
    | (FormationGoalDoneConditionCandidate & Record<string, unknown>)
    | null
  if (gdc === null) return "present"
  if (list(gdc.adapterIssues).length > 0) return "present"
  if (gdc.independentClosure === "unknown") return "present"
  const doneCondition = record(gdc.doneCondition)
  if (doneCondition === null) return "present"
  // The canonical F1B verdict is read, never recomputed and never overridden.
  if (doneCondition.status !== "complete") return "present"
  if (list(doneCondition.missingFields).length > 0) return "present"
  if (list(doneCondition.invalidReasons).length > 0) return "present"
  return "absent"
}

// ─── Pair-scoped grouping context (Section 5) ───────────────────

// Literals F5 writes itself, never copied from any input: a prediction never
// groups anything, never changes membership, and resolves no subject side.
const FIXED_GROUPING_INVARIANTS = {
  present: true,
  defaultGrouped: false,
  groupingUnchanged: true,
  membershipUnchanged: true,
  subjectSideResolved: false,
} as const

function buildGroupingContext(
  snapshot: SuccessfulFormationGroupingOutcomeSnapshot,
): FormationStatePredictionGroupingContext {
  // The verdict data is copied from F4's DETACHED snapshot; nothing is
  // recomputed and no side, token, or subject is read, derived, or exposed.
  if (snapshot.groupingOutcome === "merge_candidate") {
    return {
      ...FIXED_GROUPING_INVARIANTS,
      groupingOutcome: "merge_candidate",
      basisVerdict: snapshot.basisVerdict,
      formationState: "merge_candidate",
      proposalStrength: snapshot.proposalStrength,
    }
  }
  if (snapshot.groupingOutcome === "split_candidate") {
    return {
      ...FIXED_GROUPING_INVARIANTS,
      groupingOutcome: "split_candidate",
      basisVerdict: "must_split",
      formationState: "split_candidate",
      proposalStrength: null,
    }
  }
  return {
    ...FIXED_GROUPING_INVARIANTS,
    groupingOutcome: "none",
    basisVerdict: "insufficient",
    formationState: null,
    proposalStrength: null,
  }
}

function groupingCode(context: FormationStatePredictionGroupingContext): StatePredictionReasonCode {
  if (!context.present) return "grouping_context_absent"
  switch (context.basisVerdict) {
    case "strong_match":
      return "grouping_fixed_strong_match"
    case "possible_match":
      return "grouping_fixed_possible_match_not_grouped"
    case "must_split":
      return "grouping_fixed_split_candidate"
    default:
      return "grouping_fixed_insufficient"
  }
}

function reject(reason: FormationStatePredictionRejection): FormationStatePredictionResult {
  return { ok: false, candidateOnly: true, reason }
}

function hasForbiddenField(input: unknown): boolean {
  if (input === null || typeof input !== "object") return false
  for (const field of FORBIDDEN_INPUT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) return true
  }
  return false
}

/**
 * Deterministically predict the current state of ONE attested formation subject.
 *
 * The F1C success must be the EXACT attested object; a clone, forgery, Proxy
 * wrapper, bare candidate, or failed result rejects value-free. A grouping
 * context is optional but all-or-nothing, and is admitted only as the EXACT
 * attested F4 outcome bound to its EXACT comparison input — a cloned outcome, a
 * cloned or different input, a pair-A outcome applied to pair B, or a pair whose
 * sides changed after attestation all reject. Every security-sensitive caller
 * field is read EXACTLY ONCE, so a changing accessor or Proxy can never have one
 * value validated and another reported.
 *
 * The grouping decision is copied unchanged and can influence no factor. The
 * fixed grouping, the formation membership, the target/source side, the
 * merge/split proposal strength, and the candidate-only state are all left
 * exactly as they were: F5 changes the EXPLANATION only.
 */
export function predictFormationState(
  input: FormationStatePredictionInput,
): FormationStatePredictionResult {
  try {
    return predict(input)
  } catch {
    // A hostile accessor, Proxy trap, or malformed graph fails closed.
    return reject("input_unreadable")
  }
}

function predict(input: FormationStatePredictionInput): FormationStatePredictionResult {
  const raw = input as Partial<FormationStatePredictionInput> | null | undefined

  // 1. Forbidden bindings and safety-literal overrides fail CLOSED on presence.
  //    This is an own-property probe: it reads no value and triggers no accessor.
  if (hasForbiddenField(raw)) return reject("unbound_reference_supplied")

  // 2. ONE read of each security-sensitive caller field. Every step below uses
  //    these captured values; the caller graph is never re-read.
  const formationResult = raw?.formationResult
  const comparisonInput = raw?.comparisonInput
  const groupingOutcomeResult = raw?.groupingOutcomeResult

  // 3. F1C runtime-provenance attestation — the sole source of subject data.
  const subject = snapshotValidatedWorkUnitFormationResult(formationResult)
  if (subject === null) return reject("subject_not_validated")

  // 4. Optional, all-or-nothing grouping context. `comparisonInput` is used ONLY
  //    as an identity token for F4's attestation; F5 reads no side from it.
  let pairGroupingContext: FormationStatePredictionGroupingContext = { present: false }
  if (comparisonInput !== undefined || groupingOutcomeResult !== undefined) {
    if (comparisonInput === undefined || groupingOutcomeResult === undefined) {
      return reject("grouping_context_incomplete")
    }
    const attested = snapshotValidatedFormationGroupingOutcomeResult(groupingOutcomeResult, comparisonInput)
    if (attested === null) return reject("grouping_outcome_not_validated")
    pairGroupingContext = buildGroupingContext(attested)
  }

  // 5. The subject state comes from F4's own mapper over the SAME captured,
  //    already-attested subject — never from a caller-supplied state value.
  const mapped = mapFormationSubjectState({ formationResult: formationResult as never })
  if (!mapped.ok) return reject("subject_state_unavailable")

  // 6. Factors, computed solely from the detached inert F1C snapshot.
  const sources = memberSources(subject)
  const change = readChangeSignals(sources)
  const factors: FormationStatePredictionFactors = {
    actor: classifyActor(sources),
    limit: classifyLimit(sources),
    eventTime: classifyEventTime(sources),
    update: classifyUpdate(change),
    authority: classifyAuthority(sources),
    unresolved: classifyUnresolved(sources, change),
    missing: classifyMissing(subject),
  }

  // 7. Bounded, fixed-order reason codes and their constant sentences.
  const reasonCodes: readonly StatePredictionReasonCode[] = [
    CODES.actor[factors.actor],
    CODES.limit[factors.limit],
    CODES.eventTime[factors.eventTime],
    CODES.update[factors.update],
    CODES.authority[factors.authority],
    CODES.unresolved[factors.unresolved],
    CODES.missing[factors.missing],
    CODES.subjectState[mapped.state],
    groupingCode(pairGroupingContext),
  ]

  // 8. The safety literals are written here and never read from the input.
  return {
    ok: true,
    candidateOnly: true,
    humanReviewRequired: true,
    factors,
    subjectState: mapped.state,
    pairGroupingContext,
    reasonCodes,
    narrative: reasonCodes.map((code) => NARRATIVE[code]),
  }
}
