/**
 * F5 — Deterministic State Prediction (SUBJECT-SCOPED).
 *
 * F5 explains ONE already-validated formation subject — actor, limit, event
 * time, meaningful update, authority, unresolved and missing evidence — and
 * nothing else.
 *
 * F5 consumes NO pair artifact. An earlier head took a comparison input and an
 * F4 grouping outcome alongside the subject and reported that verdict as
 * "pair-scoped context": both were independently attested, but nothing proved
 * the subject was either side of that pair, so an unrelated subject could be
 * combined with a real verdict into one subject-specific prediction. No trusted
 * immutable subject-to-side resolver exists and inventing one is out of scope,
 * so the capability is REMOVED rather than disclosed. F4 remains the sole
 * authority for pair verdicts, merge/split proposals and membership, and
 * supplying `comparisonInput` or `groupingOutcomeResult` fails closed.
 *
 * Authorities consumed read-only: F1C is the sole validated-subject authority
 * (`snapshotValidatedWorkUnitFormationResult`; every factor comes from the
 * DETACHED inert snapshot it returns); F1B, through that snapshot, is the sole
 * Done Condition status authority (read, never recomputed); F4 is the sole
 * formation-state authority (`mapFormationSubjectState` over the same attested
 * subject, so no caller-supplied state exists to forge).
 *
 * The subject is read EXACTLY ONCE, so a changing accessor cannot split
 * validation from reporting, and a hostile accessor fails closed. Output is
 * closed enums, closed reason codes and constant sentences only — no raw text,
 * identifier, timestamp, deadline value, numeric score, or F6/F7 concept can
 * travel out — and there is no external call, wall-clock or randomness read.
 */

import type { FormationSourceCandidate } from "./sourceContract.ts"
import { mapFormationSubjectState } from "./states.ts"
import {
  snapshotValidatedWorkUnitFormationResult,
  type WorkUnitFormationCandidate,
} from "./workUnitFormationAggregate.ts"
import {
  type FormationStatePredictionFactors,
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

// A signal is STRUCTURED only when the source records it as fact
// (`inferred: false`) AND its kind is a structural record rather than a claim
// about a person; `decision_maker_named` is therefore excluded. Provider
// identity appears nowhere here — provider is never authority.
const STRUCTURED_AUTHORITY_SIGNAL_KINDS: ReadonlySet<string> = new Set([
  "accepted_status", "owner_of_record", "signed_off_review", "official_external_communication", "superseded_marker",
])
/** Actor relations that assert responsibility without proving it. */
const ASSERTED_ACTOR_RELATIONS: ReadonlySet<string> = new Set(["owner_claimed", "approver_claimed"])
/** Status values recording a real transition, not mere activity. */
const MEANINGFUL_STATUS_MARKERS: ReadonlySet<string> = new Set(["approved", "changes_requested", "merged", "closed", "cancelled"])
/** Contradiction-shaped status pairs — reported as unresolved, never resolved. */
const SETTLED_STATUS_MARKERS: ReadonlySet<string> = new Set(["approved", "merged"])
const CONTESTED_STATUS_MARKERS: ReadonlySet<string> = new Set(["changes_requested", "cancelled"])

// One constant sentence per reason code. Nothing is interpolated, so no value
// from any source can travel into a sentence.
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
}

const CODES = {
  actor: { known: "actor_known_structured_owner", asserted: "actor_asserted_only", unknown: "actor_unknown_no_assertion" },
  limit: { explicit: "limit_explicit_declared", inferred: "limit_inferred_not_authoritative", absent: "limit_absent" },
  eventTime: { known: "event_time_known", uncertain: "event_time_uncertain", absent: "event_time_absent" },
  update: { meaningful: "update_meaningful_recorded", unchanged: "update_unchanged", unknown: "update_unknown_inferred_only" },
  authority: { structured: "authority_structured_signal", asserted: "authority_asserted_only", absent: "authority_absent" },
  unresolved: { present: "unresolved_present", absent: "unresolved_absent", unknown: "unresolved_unknown_inferred_only" },
  missing: { present: "missing_present", absent: "missing_absent" },
  subjectState: { formal_candidate: "subject_state_formal_candidate", clarification_needed: "subject_state_clarification_needed", context_only: "subject_state_context_only" },
} as const satisfies Record<string, Record<string, StatePredictionReasonCode>>

// Pair-shaped fields the previous head accepted. Their own-property presence now
// fails closed — a stale caller is told, never silently ignored.
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

function classifyActor(sources: readonly FormationSourceCandidate[]): StatePredictionActorFactor {
  const names = new Set<string>()
  let structuredOwnerNamed = false
  for (const source of sources) {
    const named = list(field(source, "actorAssertions"))
      .map((a) => record(a)?.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0)
    named.forEach((n) => names.add(n))
    // A single named actor is `known` only when the SAME source also records an
    // owner of record as fact. An assertion alone never reaches `known`.
    const owned = list(field(source, "authoritySignals")).some((s) => {
      const entry = record(s)
      return entry?.inferred === false && entry?.kind === "owner_of_record"
    })
    if (named.length > 0 && owned) structuredOwnerNamed = true
  }
  if (names.size === 0) return "unknown"
  return names.size === 1 && structuredOwnerNamed ? "known" : "asserted"
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

/** Change signals split into recorded facts and merely inferred claims. */
type ChangeSignals = { readonly meaningful: boolean; readonly inferredOnly: boolean }

function readChangeSignals(sources: readonly FormationSourceCandidate[]): ChangeSignals {
  let meaningful = false
  let inferredOnly = false
  for (const source of sources) {
    for (const key of ["decisionMarkers", "supersedes", "supersededBy"] as const) {
      for (const entry of list(field(source, key))) {
        if (record(entry)?.inferred === false) meaningful = true
        else inferredOnly = true
      }
    }
    for (const status of list(field(source, "statusMarkers"))) {
      if (typeof status === "string" && MEANINGFUL_STATUS_MARKERS.has(status)) meaningful = true
    }
    const version = record(field(source, "versionInfo"))
    if (version !== null) {
      if (version.inferred === false) meaningful = true
      else inferredOnly = true
    }
    // An edit timestamp alone is activity, never a meaningful update.
    if (record(field(source, "timestamps"))?.editedAt !== undefined) inferredOnly = true
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

function classifyUnresolved(
  sources: readonly FormationSourceCandidate[],
  change: ChangeSignals,
): StatePredictionUnresolvedFactor {
  let settled = false
  let contested = false
  for (const source of sources) {
    if (list(field(source, "unresolvedMarkers")).length > 0) return "present"
    for (const status of list(field(source, "statusMarkers"))) {
      if (typeof status !== "string") continue
      if (SETTLED_STATUS_MARKERS.has(status)) settled = true
      if (CONTESTED_STATUS_MARKERS.has(status)) contested = true
    }
  }
  // Contradiction-shaped evidence is REPORTED, never resolved, and can change
  // no membership: F5 has no grouping input or output to change.
  if (settled && contested) return "present"
  return change.inferredOnly ? "unknown" : "absent"
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

  const reasonCodes: readonly StatePredictionReasonCode[] = [
    CODES.actor[factors.actor],
    CODES.limit[factors.limit],
    CODES.eventTime[factors.eventTime],
    CODES.update[factors.update],
    CODES.authority[factors.authority],
    CODES.unresolved[factors.unresolved],
    CODES.missing[factors.missing],
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
