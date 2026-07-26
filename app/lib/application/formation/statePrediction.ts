/**
 * F5 — Deterministic State Prediction (SUBJECT-SCOPED).
 *
 * F5 explains ONE already-validated formation subject — actor, limit, event
 * time, update, authority, unresolved and missing evidence.
 *
 * ONE rule governs the whole module: nothing here may assert a relationship the
 * records do not establish.
 *  - No pair artifact is consumed. An earlier head took a comparison input and an
 *    F4 grouping outcome and reported that verdict as "pair-scoped context",
 *    though nothing proved the subject was either side; the capability is REMOVED
 *    rather than disclosed. F4 stays the sole authority for pair verdicts,
 *    merge/split proposals and membership; those fields fail closed.
 *  - Two unbound records never bind an actor to an authority signal.
 *  - One CURRENT value never establishes a transition. A source status, a single
 *    current version and an edit timestamp are current STATE, and F1A carries no
 *    previous status, transition edge or prior snapshot, so `update` requires an
 *    explicit non-inferred change EVENT and `unchanged` is RESERVED.
 *  - Uncertainty about CHANGE is not uncertainty about whether something is OPEN.
 *  - Sharing an aggregate is not describing the same thing. F1C proves membership
 *    and an explicit role, never that two members concern one decision, object or
 *    moment, so no status pair, role, provider or id may imply a contradiction —
 *    that is F6's. `unresolved` reads ONLY unresolvedMarkers and `unknown` is
 *    RESERVED. Consequently `statusMarkers` is read NOWHERE in this module: it is
 *    current source STATE, and no factor here may conclude anything from it.
 *
 * Authorities consumed read-only: F1C is the sole validated-subject authority
 * (`snapshotValidatedWorkUnitFormationResult`; every factor comes from the
 * DETACHED inert snapshot it returns); F1B, through that snapshot, is the sole
 * Done Condition status authority (read, never recomputed); F4 is the sole
 * formation-state authority (`mapFormationSubjectState` over the same attested
 * subject). The subject is read EXACTLY ONCE, so a changing accessor cannot
 * split validation from reporting and a hostile accessor fails closed. Output is
 * closed enums, closed reason codes and constant sentences only, with no
 * external call, wall-clock or randomness read.
 */

import type { FormationSourceCandidate } from "./sourceContract.ts"
import { mapFormationSubjectState } from "./states.ts"
import { snapshotValidatedWorkUnitFormationResult, type WorkUnitFormationCandidate } from "./workUnitFormationAggregate.ts"
import {
  type FormationStatePredictionFactors, type FormationStatePredictionInput,
  type FormationStatePredictionRejection, type FormationStatePredictionResult,
  type StatePredictionActorFactor, type StatePredictionAuthorityFactor,
  type StatePredictionEventTimeFactor, type StatePredictionLimitFactor,
  type StatePredictionMissingFactor, type StatePredictionReasonCode,
  type StatePredictionUnresolvedFactor, type StatePredictionUpdateFactor,
} from "./statePredictionTypes.ts"

// A signal is STRUCTURED only when the source records it as fact
// (`inferred: false`) AND its kind is a structural record rather than a claim
// about a person; `decision_maker_named` is excluded, and provider is never
// authority. An authority signal names nobody, so it binds no actor.
const STRUCTURED_AUTHORITY_SIGNAL_KINDS: ReadonlySet<string> = new Set([
  "accepted_status", "owner_of_record", "signed_off_review", "official_external_communication", "superseded_marker",
])
/** Actor relations that assert responsibility without proving it. */
const ASSERTED_ACTOR_RELATIONS: ReadonlySet<string> = new Set(["owner_claimed", "approver_claimed"])

// One constant sentence per reason code. Nothing is interpolated, so no value
// from any source can travel into a sentence.
const NARRATIVE: Record<StatePredictionReasonCode, string> = {
  // RESERVED: unreachable until a contract binds a canonical actor identity.
  actor_known_structured_owner: "A named actor is bound to a recorded owner of record.",
  actor_asserted_only: "The acting party is only asserted by the sources and is not proven here.",
  actor_unknown_no_assertion: "No source asserts who is acting.",
  limit_explicit_declared: "At least one source declares an explicit time limit.",
  limit_inferred_not_authoritative: "A time limit is only inferred, so it is not treated as a fact.",
  limit_absent: "No source declares a time limit.",
  event_time_known: "Every source event time is recorded and internally consistent.",
  event_time_uncertain: "At least one source event time is inconsistent with its capture, so timing is uncertain.",
  event_time_absent: "No usable source event time is recorded.",
  update_meaningful_recorded: "An explicit change event is recorded on at least one source.",
  // RESERVED: unreachable until a contract supplies a trusted previous state.
  update_unchanged: "No source records a change beyond its original state.",
  update_unknown_no_trusted_baseline: "The available evidence does not establish whether a meaningful change occurred.",
  authority_structured_signal: "At least one source carries a recorded structural authority signal.",
  authority_asserted_only: "Authority is only asserted or inferred, never structurally recorded.",
  authority_absent: "No source carries an authority signal.",
  unresolved_present: "At least one source records an unresolved item.",
  // RESERVED: unreachable until a contract can express uncertain unresolved evidence.
  unresolved_unknown: "Whether anything is unresolved is unknown.",
  unresolved_absent: "No source carries an open item.",
  missing_present: "Required Goal or Done Condition evidence is still missing.",
  missing_absent: "No required Goal or Done Condition evidence is missing.",
  subject_state_formal_candidate: "The validated subject state is a formal candidate awaiting human review.",
  subject_state_clarification_needed: "The validated subject state needs clarification before it can proceed.",
  subject_state_context_only: "The validated subject state is context only.",
}

const CODES = {
  actor: { known: "actor_known_structured_owner", asserted: "actor_asserted_only", unknown: "actor_unknown_no_assertion" },
  limit: { explicit: "limit_explicit_declared", inferred: "limit_inferred_not_authoritative", absent: "limit_absent" },
  eventTime: { known: "event_time_known", uncertain: "event_time_uncertain", absent: "event_time_absent" },
  update: { meaningful: "update_meaningful_recorded", unchanged: "update_unchanged", unknown: "update_unknown_no_trusted_baseline" },
  authority: { structured: "authority_structured_signal", asserted: "authority_asserted_only", absent: "authority_absent" },
  unresolved: { present: "unresolved_present", absent: "unresolved_absent", unknown: "unresolved_unknown" },
  missing: { present: "missing_present", absent: "missing_absent" },
  subjectState: { formal_candidate: "subject_state_formal_candidate", clarification_needed: "subject_state_clarification_needed", context_only: "subject_state_context_only" },
} as const satisfies Record<string, Record<string, StatePredictionReasonCode>>

// Pair-shaped fields the previous head accepted: presence now fails closed, so a
// stale caller is told rather than silently ignored.
const PAIR_INPUT_FIELDS = ["comparisonInput", "groupingOutcomeResult"] as const

// Other caller-supplied fields that must never bind or override anything here.
// Presence alone rejects; the value is never read and never echoed.
const FORBIDDEN_INPUT_FIELDS = [
  "candidateId", "leftCandidateId", "rightCandidateId", "mergeTargetCandidateId", "targetSide",
  "sourceSide", "pairSides", "pairToken", "pairGroupingContext", "comparisonResult",
  "groupingOutcome", "subject", "factors", "roi", "score", "rank", "ranking", "priority",
  "urgency", "weight", "conflictFindings", "conflicts", "membership", "approved", "executed",
  "formalized", "candidateOnly", "humanReviewRequired", "reasonCodes", "narrative", "subjectState",
] as const

// Defensive readers over the DETACHED attested snapshot.
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

function field(source: FormationSourceCandidate, key: string): unknown {
  return (source as unknown as Record<string, unknown>)[key]
}

// F1A models actor assertions and authority signals as SEPARATE unbound records:
// an authority signal carries `kind` + `inferred` and NO actor identity, so no
// combination of them proves the named actor IS the recorded owner. `known` is
// RESERVED and unreachable until a separately reviewed contract binds a canonical
// actor identity. Nothing below reads authoritySignals, provider, source identity,
// relation labels, or display-name equality — an assertion is only an assertion,
// and authority stays independent, so `asserted` + `structured` is the pairing.
function classifyActor(sources: readonly FormationSourceCandidate[]): StatePredictionActorFactor {
  const named = sources.some((source) => list(field(source, "actorAssertions")).some((assertion) => {
    const name = record(assertion)?.name
    return typeof name === "string" && name.length > 0
  }))
  return named ? "asserted" : "unknown"
}

function classifyLimit(sources: readonly FormationSourceCandidate[]): StatePredictionLimitFactor {
  let inferred = false
  for (const source of sources) {
    const deadline = record(field(source, "explicitDeadline"))
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
    const timestamps = record(field(source, "timestamps"))
    const occurred = instant(timestamps?.occurredAt)
    if (!Number.isFinite(occurred)) { uncertain = true; continue }
    present = true
    // Capture cannot precede the event it captured, and an edit cannot precede
    // the event: the time is recorded but not exact. It is never corrected.
    const captured = instant(timestamps?.capturedAt)
    if (Number.isFinite(captured) && occurred > captured) uncertain = true
    const edited = instant(timestamps?.editedAt)
    if (Number.isFinite(edited) && edited < occurred) uncertain = true
  }
  if (!present) return "absent"
  return uncertain ? "uncertain" : "known"
}

// The ONLY proof of change: an explicit non-inferred relationship that IS itself
// a change event. `statusMarkers` is deliberately NOT read — F2 defines it as
// CURRENT SOURCE STATUS only, so no status value can prove a transition — and
// `versionInfo` carries one CURRENT version and no previous one, so even
// uninferred it is state. This returns a bare boolean deliberately: there is no
// change-uncertainty value in existence for any other factor to read.
function hasExplicitRecordedChange(sources: readonly FormationSourceCandidate[]): boolean {
  for (const source of sources) {
    for (const key of ["decisionMarkers", "supersedes", "supersededBy"] as const) {
      for (const entry of list(field(source, key))) {
        if (record(entry)?.inferred === false) return true
      }
    }
  }
  return false
}

/** `unchanged` is RESERVED and never returned: proving nothing changed needs a
 * trusted previous-state baseline, and none exists. Absence of change evidence is
 * never evidence that nothing changed, so everything unproven reports `unknown`. */
function classifyUpdate(explicitRecordedChange: boolean): StatePredictionUpdateFactor {
  return explicitRecordedChange ? "meaningful" : "unknown"
}

function classifyAuthority(sources: readonly FormationSourceCandidate[]): StatePredictionAuthorityFactor {
  let asserted = false
  let structured = false
  for (const source of sources) {
    for (const signal of list(field(source, "authoritySignals"))) {
      const entry = record(signal)
      if (entry === null) continue
      asserted = true
      if (entry.inferred === false && typeof entry.kind === "string" && STRUCTURED_AUTHORITY_SIGNAL_KINDS.has(entry.kind)) {
        structured = true
      }
    }
    for (const assertion of list(field(source, "actorAssertions"))) {
      const relation = record(assertion)?.assertedRelation
      if (typeof relation === "string" && ASSERTED_ACTOR_RELATIONS.has(relation)) asserted = true
    }
  }
  if (structured) return "structured"
  return asserted ? "asserted" : "absent"
}

// `unresolvedMarkers` is the ONLY current upstream record of an unresolved item,
// so it is the only thing read here. F1C proves that every member is a validated
// F1A source carrying an explicit caller-supplied role inside one aggregate — it
// proves NOTHING about whether two members describe the same decision, the same
// object, the same moment, or mutually exclusive outcomes. Cohabitation is not a
// semantic relation, so no status pair, role, provider, object id, time or update
// value may reach this factor; detecting status conflict belongs to F6 or to a
// future explicit upstream contract. `unknown` is RESERVED: no current F1A input
// can express inferred or uncertain unresolved evidence.
function classifyUnresolved(sources: readonly FormationSourceCandidate[]): StatePredictionUnresolvedFactor {
  for (const source of sources) {
    if (list(field(source, "unresolvedMarkers")).length > 0) return "present"
  }
  return "absent"
}

function classifyMissing(candidate: WorkUnitFormationCandidate): StatePredictionMissingFactor {
  const gdc = record((candidate as { goalDoneCondition?: unknown }).goalDoneCondition)
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

function reject(reason: FormationStatePredictionRejection): FormationStatePredictionResult {
  return { ok: false, candidateOnly: true, reason }
}

/** Own-property probe: it reads no value and triggers no accessor. */
function hasAnyField(input: unknown, fields: readonly string[]): boolean {
  if (input === null || typeof input !== "object") return false
  return fields.some((name) => Object.prototype.hasOwnProperty.call(input, name))
}

/**
 * Deterministically predict the current state of ONE attested formation subject.
 *
 * The F1C success must be the EXACT attested object; a clone, forgery, Proxy
 * wrapper, bare candidate, or failed result rejects value-free. A pair,
 * comparison input, or F4 grouping outcome is NOT part of the contract and
 * rejects on presence — never read, echoed, or silently ignored. The subject is
 * read exactly once, and a hostile accessor fails closed.
 */
export function predictFormationState(input: FormationStatePredictionInput): FormationStatePredictionResult {
  try {
    return predict(input)
  } catch {
    return reject("input_unreadable")
  }
}

function predict(input: FormationStatePredictionInput): FormationStatePredictionResult {
  const raw = input as Partial<FormationStatePredictionInput> | null | undefined

  // 1. Pair-shaped and other forbidden bindings fail CLOSED on presence.
  if (hasAnyField(raw, PAIR_INPUT_FIELDS)) return reject("grouping_context_not_supported")
  if (hasAnyField(raw, FORBIDDEN_INPUT_FIELDS)) return reject("unbound_reference_supplied")

  // 2. ONE read of the only security-sensitive caller field.
  const formationResult = raw?.formationResult

  // 3. F1C runtime-provenance attestation — the sole source of subject data.
  const subject = snapshotValidatedWorkUnitFormationResult(formationResult)
  if (subject === null) return reject("subject_not_validated")

  // 4. The subject state comes from F4's own mapper over the SAME captured,
  //    already-attested subject — never from a caller-supplied state value.
  const mapped = mapFormationSubjectState({ formationResult: formationResult as never })
  if (!mapped.ok) return reject("subject_state_unavailable")

  // 5. Factors, computed solely from the detached inert F1C snapshot.
  const sources = memberSources(subject)
  const factors: FormationStatePredictionFactors = {
    actor: classifyActor(sources), limit: classifyLimit(sources),
    eventTime: classifyEventTime(sources), update: classifyUpdate(hasExplicitRecordedChange(sources)),
    authority: classifyAuthority(sources), unresolved: classifyUnresolved(sources),
    missing: classifyMissing(subject),
  }

  const reasonCodes: readonly StatePredictionReasonCode[] = [
    CODES.actor[factors.actor], CODES.limit[factors.limit], CODES.eventTime[factors.eventTime],
    CODES.update[factors.update], CODES.authority[factors.authority],
    CODES.unresolved[factors.unresolved], CODES.missing[factors.missing],
    CODES.subjectState[mapped.state],
  ]

  // 6. The safety literals are written here and never read from the input.
  return {
    ok: true,
    candidateOnly: true,
    humanReviewRequired: true,
    factors,
    subjectState: mapped.state,
    reasonCodes,
    narrative: reasonCodes.map((code) => NARRATIVE[code]),
  }
}
