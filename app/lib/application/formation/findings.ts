/**
 * F6A — Deterministic Formation Findings Foundation (SUBJECT-SCOPED).
 *
 * ONE rule governs this module, inherited from F5: nothing here may assert a relationship the records do not establish. F6A
 * reports only what an authority ALREADY recorded — F1B's missing Goal fields and adapter issues, the canonical Done
 * Condition missing fields and invalid reasons (READ, never recomputed), and F1A's explicit `supersedes` / `supersededBy`
 * relationships, bound to another member ONLY by an exact provider + sourceObjectId tuple.
 *
 * `conflict` is reachable from EXACTLY ONE input: a cycle in the recorded (non-inferred), uniquely-bound supersession graph
 * — records that literally cannot all hold, the only contradiction the current typed contract proves. Every other proposed
 * F6 signal is DEFERRED, because each needs a typed claim binding that does not exist: contradictory outcomes and
 * acceptance criteria need a per-member claim bound to one decision subject plus a mutual-exclusion vocabulary (comparing
 * summaries for negation would be a heuristic); authority versus freshness is not conflict unless two BOUND claims already
 * disagree; two deadlines are two facts and two coexisting statuses two current states; `contradicting_claim` is caller-
 * supplied association metadata; stale implementation needs a trusted previous state or a typed spec-change edge.
 *
 * Authorities are consumed read-only and never overridden. F5 is invoked INTERNALLY from the same exact attested F1C object
 * — a caller may not supply a state prediction — so the F6 result is the first attested artifact carrying both. F6A
 * regroups nothing, changes no membership or role, recommends no Primary Source, resolves no cycle, ranks nothing,
 * formalizes nothing, and approves, executes, projects and stores nothing.
 */

import type { FormationSourceCandidate } from "./sourceContract.ts"
import { predictFormationState } from "./statePrediction.ts"
import { snapshotValidatedWorkUnitFormationResult, type WorkUnitFormationCandidate } from "./workUnitFormationAggregate.ts"
import {
  classifyDoneConditionInvalidReason, classifyDoneConditionMissingField,
  classifyFormationAdapterIssueCategory, classifyGoalHypothesisField,
  type FormationFinding, type FormationFindingReasonCode, type FormationFindingsInput,
  type FormationFindingsRejection, type FormationFindingsResult, type FormationFindingsSnapshot,
  type SuccessfulFormationFindingsResult,
} from "./findingsTypes.ts"

// One constant sentence per reason code. Nothing is interpolated, so no value from any source, adapter path or caller field
// can travel into a sentence.
const NARRATIVE: Record<FormationFindingReasonCode, string> = {
  no_findings_recorded: "No recorded evidence gap or supersession relationship was found.",
  finding_missing_goal_field: "A required Goal field is recorded as missing.",
  finding_missing_done_condition_field: "A required Done Condition field is recorded as missing.",
  finding_invalid_done_condition: "The canonical Done Condition records an invalid reason.",
  finding_evidence_reference_rejected: "An evidence reference was rejected because it is not a member of this subject.",
  finding_independent_closure_unknown: "Whether this Goal closes independently is not recorded.",
  finding_supersession_recorded: "One member is recorded as replacing another member of this subject.",
  finding_supersession_asserted_requires_review: "A supersession relationship is only inferred and needs human review.",
  finding_external_supersession_reference: "A supersession relationship points outside this subject and was not bound.",
  finding_supersession_cycle: "The recorded supersession relationships form a cycle and cannot all hold.",
  effective_state_from_state_prediction: "The effective state is the predicted subject state, unchanged.",
  effective_state_conflict_recorded_supersession_cycle: "The recorded supersession cycle places this subject in conflict.",
}

const FINDING_CODES: Record<FormationFinding["kind"], FormationFindingReasonCode> = {
  missing_goal_field: "finding_missing_goal_field",
  missing_done_condition_field: "finding_missing_done_condition_field",
  invalid_done_condition: "finding_invalid_done_condition",
  evidence_reference_rejected: "finding_evidence_reference_rejected",
  independent_closure_unknown: "finding_independent_closure_unknown",
  supersession_recorded: "finding_supersession_recorded",
  supersession_asserted_requires_review: "finding_supersession_asserted_requires_review",
  external_supersession_reference: "finding_external_supersession_reference",
  supersession_cycle: "finding_supersession_cycle",
}

// Caller-supplied fields that must never bind, seed or override anything here. Presence alone rejects; the value is never
// read and never echoed. The F5 output fields lead the list: F6A produces the prediction itself, and a supplied one would
// let a caller choose the base state a conflict builds on.
const FORBIDDEN_INPUT_FIELDS = [
  "statePredictionResult", "statePrediction", "subjectState", "baseSubjectState", "effectiveState",
  "factors", "findings", "conflictFindings", "conflicts", "comparisonInput", "comparisonResult",
  "groupingOutcomeResult", "groupingOutcome", "pairToken", "pairSides", "targetSide", "sourceSide",
  "rankingEvidence", "roi", "score", "rank", "ranking", "priority", "urgency", "weight",
  "membership", "members", "primarySource", "approved", "executed", "formalized",
  "candidateOnly", "humanReviewRequired", "reasonCodes", "narrative",
] as const

function reject(reason: FormationFindingsRejection): FormationFindingsResult {
  return { ok: false, candidateOnly: true, reason }
}

/** Own-property probe: it reads no value and triggers no accessor. */
function hasAnyField(input: unknown, fields: readonly string[]): boolean {
  if (input === null || typeof input !== "object") return false
  return fields.some((name) => Object.prototype.hasOwnProperty.call(input, name))
}

// Defensive readers over the DETACHED attested snapshot.
function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null
}

// Deep clone over INTERNALLY-CONSTRUCTED, JSON-safe data only. Never run over an arbitrary caller graph: callers reach only
// the WeakMap identity lookup.
function inertResultClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item) => inertResultClone(item)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>)) out[key] = inertResultClone((value as Record<string, unknown>)[key])
  return out as T
}

// ─── Runtime provenance for the WHOLE F6 result ─────────────────
//
// F5's successful output had no consumer and no attestation; F6A must not repeat that gap. The EXACT success object is
// registered against the EXACT F1C object it came from, plus a detached inert snapshot carrying the internal finding-to-
// member evidence positions.
const attestedFindingsResults = new WeakMap<object, { readonly subject: object; readonly snapshot: FormationFindingsSnapshot }>()

/**
 * Runtime-provenance resolver — the binding F7 must consume. Returns a fresh, fully detached snapshot ONLY when
 * `findingsResult` is the exact success object a real `buildFormationFindings` call returned AND `formationResult` is the
 * exact F1C success it was produced from; otherwise `null`. A spread/JSON/ structuredClone copy, an `Object.create` or
 * Proxy wrapper, a forged look-alike, a failed result, a bare findings array, or a genuine result replayed against a
 * DIFFERENT subject is a different identity or binding and never attests. Repeated snapshots never alias, and mutating the
 * public result afterwards cannot alter what is stored.
 */
export function snapshotValidatedFormationFindingsResult(findingsResult: unknown, formationResult: unknown): FormationFindingsSnapshot | null {
  if (findingsResult === null || typeof findingsResult !== "object") return null
  if (formationResult === null || typeof formationResult !== "object") return null
  const stored = attestedFindingsResults.get(findingsResult as object)
  if (stored === undefined) return null
  if (stored.subject !== formationResult) return null
  return inertResultClone(stored.snapshot)
}

// ─── Supersession graph ─────────────────────────────────────────

/**
 * Member-object identity, LOCAL to F6 supersession resolution and read the SAME way from a member and from a supersession
 * claim — the only tuple such a claim can name, JSON-encoded so no raw delimiter can forge a collision. Nothing else
 * (externalId, URL, title, thread, parent, actor, timestamp, role) may bind a target. It is NOT F1C membership identity and
 * never replaces it: two members may legitimately be distinct F1C members while naming ONE provider object, and that
 * ambiguity fails closed rather than picking the first or the latest.
 */
function objectIdentity(value: Record<string, unknown>): string | null {
  const { provider, sourceObjectId } = value
  if (typeof provider !== "string" || provider.length === 0) return null
  if (typeof sourceObjectId !== "string" || sourceObjectId.length === 0) return null
  return JSON.stringify([provider, sourceObjectId])
}

type Edge = { readonly from: number; readonly to: number; recorded: boolean }

/**
 * Normalized directed edges, newer/replacing member -> older/replaced member. `A.supersedes` contributes A -> B;
 * `A.supersededBy` contributes B -> A. The same directed edge recorded by both sides is ONE edge; it is `recorded` when ANY
 * contributing relation is non-inferred, so a duplicate inferred claim can never demote a recorded one and — the direction
 * that matters — an inferred claim alone can never be promoted to recorded.
 */
function collectEdges(sources: readonly FormationSourceCandidate[], indexByIdentity: ReadonlyMap<string, number>): {
  readonly edges: readonly Edge[]; readonly externalMemberIndexes: readonly number[]
} {
  const byKey = new Map<string, Edge>()
  const external = new Set<number>()
  const add = (from: number, to: number, inferred: boolean): void => {
    const existing = byKey.get(`${from}>${to}`)
    if (existing === undefined) byKey.set(`${from}>${to}`, { from, to, recorded: !inferred })
    else if (!inferred) existing.recorded = true
  }
  for (const [index, source] of sources.entries()) {
    for (const [key, forward] of [["supersedes", true], ["supersededBy", false]] as const) {
      for (const entry of list((source as unknown as Record<string, unknown>)[key])) {
        const claim = record(entry)
        if (claim === null) continue
        const identity = objectIdentity(claim)
        const target = identity === null ? undefined : indexByIdentity.get(identity)
        // An unmatched target is NEVER bound to an arbitrary member.
        if (target === undefined) { external.add(index); continue }
        const inferred = claim.inferred !== false
        if (forward) add(index, target, inferred)
        else add(target, index, inferred)
      }
    }
  }
  return {
    edges: [...byKey.values()].sort((a, b) => (a.from - b.from) || (a.to - b.to)),
    externalMemberIndexes: [...external].sort((a, b) => a - b),
  }
}

/**
 * Members that lie on a cycle of RECORDED edges, ascending. A self-edge is a cycle of length one and is included by
 * construction (though no validated member can carry one: F1A rejects a source that supersedes itself). Inferred edges are
 * absent from `adjacency` and can never complete a cycle. A cycle is SURFACED, never resolved: no member is dropped,
 * reordered or re-roled.
 */
function membersOnRecordedCycle(edges: readonly Edge[], memberCount: number): readonly number[] {
  const adjacency = new Map<number, number[]>()
  for (const edge of edges) {
    if (!edge.recorded) continue
    const next = adjacency.get(edge.from)
    if (next === undefined) adjacency.set(edge.from, [edge.to])
    else next.push(edge.to)
  }
  const onCycle: number[] = []
  for (let start = 0; start < memberCount; start++) {
    const stack = [...(adjacency.get(start) ?? [])]
    const seen = new Set<number>()
    while (stack.length > 0) {
      const node = stack.pop() as number
      if (node === start) { onCycle.push(start); break }
      if (seen.has(node)) continue
      seen.add(node)
      for (const next of adjacency.get(node) ?? []) stack.push(next)
    }
  }
  return onCycle
}

// ─── Findings ───────────────────────────────────────────────────

type Collected = { readonly findings: FormationFinding[]; readonly evidence: number[][] }

function memberSources(candidate: WorkUnitFormationCandidate): readonly FormationSourceCandidate[] | null {
  const out: FormationSourceCandidate[] = []
  for (const member of list((candidate as { members?: unknown }).members)) {
    const source = record(member)?.source
    if (record(source) === null) return null
    out.push(source as FormationSourceCandidate)
  }
  return out
}

/**
 * Canonical evidence findings, in a fixed order: missing Goal fields (F1B issue order), canonical Done Condition missing
 * fields, canonical invalid reasons, then the remaining adapter issues. Every upstream enum value passes a CLOSED
 * classifier; an unrecognized string is drift and fails the whole call closed. These findings DESCRIBE canonical evidence
 * and create no second completion status: `doneCondition.status`, the F5 `missing` factor and the F5 subject state are
 * read-only here and none of them is recomputed or overridden.
 */
function collectCanonicalFindings(candidate: WorkUnitFormationCandidate, into: Collected): boolean {
  const gdc = record((candidate as { goalDoneCondition?: unknown }).goalDoneCondition)
  if (gdc === null) return false
  const issues = list(gdc.adapterIssues).map(record)
  if (issues.some((issue) => issue === null)) return false
  // Classify every category once, so drift in ANY issue fails closed even when its category would not have produced a
  // finding in its own pass.
  const categories = issues.map((issue) => classifyFormationAdapterIssueCategory((issue as Record<string, unknown>).category))
  if (categories.some((category) => category === null)) return false
  const push = (finding: FormationFinding): void => { into.findings.push(finding); into.evidence.push([]) }

  for (const [index, category] of categories.entries()) {
    if (category === "missing_goal_field") {
      const field = classifyGoalHypothesisField((issues[index] as Record<string, unknown>).field)
      if (field === null) return false
      push({ kind: "missing_goal_field", field })
    }
  }

  const doneCondition = record(gdc.doneCondition)
  if (doneCondition === null) return false
  for (const value of list(doneCondition.missingFields)) {
    const field = classifyDoneConditionMissingField(value)
    if (field === null) return false
    push({ kind: "missing_done_condition_field", field })
  }
  for (const value of list(doneCondition.invalidReasons)) {
    const reason = classifyDoneConditionInvalidReason(value)
    if (reason === null) return false
    push({ kind: "invalid_done_condition", reason })
  }

  for (const category of categories) {
    // The adapter issue's `path` (e.g. `evidenceRefs[3]`) is caller-influenced and is deliberately never read, echoed, or
    // counted into the finding.
    if (category === "evidence_membership_mismatch") push({ kind: "evidence_reference_rejected" })
    else if (category === "independent_closure_unknown") push({ kind: "independent_closure_unknown" })
  }
  return true
}

/**
 * Build the deterministic F6A findings for ONE attested formation subject. The F1C success must be the EXACT attested
 * object; a clone, forgery, wrapper, bare candidate or failed result rejects value-free. F5 is called INTERNALLY from that
 * same exact object — a caller-supplied state prediction rejects on presence. The caller property is read exactly once, and
 * a hostile accessor fails closed.
 */
export function buildFormationFindings(input: FormationFindingsInput): FormationFindingsResult {
  try { return build(input) } catch { return reject("input_unreadable") }
}

function build(input: FormationFindingsInput): FormationFindingsResult {
  const raw = input as Partial<FormationFindingsInput> | null | undefined

  // 1. Unbound caller bindings fail CLOSED on own-property presence.
  if (hasAnyField(raw, FORBIDDEN_INPUT_FIELDS)) return reject("unbound_reference_supplied")

  // 2. ONE read of the only security-sensitive caller property. Everything below
  //    uses this captured object or the private snapshots taken from it.
  const formationResult = raw?.formationResult

  // 3. F1C runtime-provenance attestation — the sole source of subject data.
  const subject = snapshotValidatedWorkUnitFormationResult(formationResult)
  if (subject === null) return reject("subject_not_validated")

  // 4. F5 is consumed INTERNALLY over the SAME captured exact object. Its
  //    factors, narrative and subject state are copied, never recomputed.
  const prediction = predictFormationState({ formationResult: formationResult as never })
  if (!prediction.ok) return reject("state_prediction_unavailable")

  // 5. Member-object index. Two members naming the same provider object make
  //    every supersession claim ambiguous; the whole call fails closed rather
  //    than choosing the first or the latest member.
  const sources = memberSources(subject)
  if (sources === null) return reject("upstream_contract_drift")
  const indexByIdentity = new Map<string, number>()
  for (const [index, source] of sources.entries()) {
    const identity = objectIdentity(source as unknown as Record<string, unknown>)
    if (identity === null) return reject("upstream_contract_drift")
    if (indexByIdentity.has(identity)) return reject("member_object_identity_ambiguous")
    indexByIdentity.set(identity, index)
  }

  // 6. Canonical evidence findings, then the explicit supersession graph.
  const collected: Collected = { findings: [], evidence: [] }
  if (!collectCanonicalFindings(subject, collected)) return reject("upstream_contract_drift")
  const { edges, externalMemberIndexes } = collectEdges(sources, indexByIdentity)
  for (const edge of edges) {
    collected.findings.push({ kind: edge.recorded ? "supersession_recorded" : "supersession_asserted_requires_review" })
    collected.evidence.push([edge.from, edge.to].sort((a, b) => a - b))
  }
  // Exactly ONE generic finding for all unmatched targets, so neither an external identifier nor a count of them can leak
  // through multiplicity.
  if (externalMemberIndexes.length > 0) {
    collected.findings.push({ kind: "external_supersession_reference" })
    collected.evidence.push([...externalMemberIndexes])
  }
  const cycleMembers = membersOnRecordedCycle(edges, sources.length)
  if (cycleMembers.length > 0) {
    collected.findings.push({ kind: "supersession_cycle" })
    collected.evidence.push([...cycleMembers])
  }

  // 7. Effective state. A recorded supersession cycle is the ONLY input that may
  //    promote to `conflict`; otherwise the F5 state is copied exactly.
  const conflict = cycleMembers.length > 0
  const reasonCodes: FormationFindingReasonCode[] = collected.findings.length === 0
    ? ["no_findings_recorded"] : collected.findings.map((finding) => FINDING_CODES[finding.kind])
  reasonCodes.push(conflict ? "effective_state_conflict_recorded_supersession_cycle" : "effective_state_from_state_prediction")

  // 8. The safety literals are written here and never read from the input.
  const result: SuccessfulFormationFindingsResult = {
    ok: true, candidateOnly: true, humanReviewRequired: true,
    statePrediction: inertResultClone(prediction),
    baseSubjectState: prediction.subjectState,
    effectiveState: conflict ? "conflict" : prediction.subjectState,
    findings: collected.findings, reasonCodes, narrative: reasonCodes.map((code) => NARRATIVE[code]),
  }

  // 9. Register runtime provenance BEFORE the result leaves this module, bound to
  //    the EXACT captured F1C object, over an independent inert snapshot so a
  //    later mutation of the public result cannot reach the stored evidence.
  attestedFindingsResults.set(result, {
    subject: formationResult as object,
    snapshot: inertResultClone({ publicResult: result, evidenceMemberIndexesByFinding: collected.evidence }),
  })
  return result
}
