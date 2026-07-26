/**
 * F5 — Deterministic State Prediction (SUBJECT-SCOPED) — permanent tests.
 *
 * Every subject is compiled through the REAL F1A/F1B/F1C boundaries, so each
 * `formationResult` is genuinely ATTESTED, never a clone. Closed factor
 * expectations live in `fixtures/formation/state-prediction/scenarios.json`;
 * attestation, one-read capture, leakage, determinism, unbound actor promotion
 * and the subject-only boundary are pinned inline.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  buildFormationSourceCandidate, type FormationSourceCandidate, type FormationSourceContractResult,
} from "../app/lib/application/formation/sourceContract.ts"
import { buildFormationGoalDoneConditionCandidate } from "../app/lib/application/formation/goalDoneConditionAdapter.ts"
import { buildWorkUnitFormationCandidate } from "../app/lib/application/formation/workUnitFormationAggregate.ts"
// Imported ONLY to prove the unrelated subject/pair composition is rejected.
import { compareGroupingSubjects } from "../app/lib/application/formation/grouping.ts"
import { mapFormationGroupingOutcome } from "../app/lib/application/formation/states.ts"
import {
  STATE_PREDICTION_ACTOR_FACTORS, STATE_PREDICTION_AUTHORITY_FACTORS,
  STATE_PREDICTION_EVENT_TIME_FACTORS, STATE_PREDICTION_LIMIT_FACTORS,
  STATE_PREDICTION_MISSING_FACTORS, STATE_PREDICTION_REASON_CODES,
  STATE_PREDICTION_REJECTIONS, STATE_PREDICTION_UNRESOLVED_FACTORS,
  STATE_PREDICTION_UPDATE_FACTORS, type ValidatedFormationSubjectResult,
} from "../app/lib/application/formation/statePredictionTypes.ts"
import { predictFormationState } from "../app/lib/application/formation/statePrediction.ts"

type OkSource = Extract<FormationSourceContractResult, { ok: true }>
type Entry = { kind: string; summary?: string; inferred?: boolean }

const CAPTURED_AT = "2026-07-19T00:00:00Z"
const OCCURRED_AT = "2026-01-01T00:00:00Z"

type SourceSpec = {
  externalId: string; sourceObjectId: string; provider?: string
  occurredAt?: string; capturedAt?: string; editedAt?: string
  actors?: readonly { name: string; relation?: string }[]
  deadline?: { value: string; inferred: boolean }; versionInfo?: { value: string; inferred: boolean }
  supersedes?: readonly { provider: string; sourceObjectId: string; inferred: boolean }[]
  unresolvedMarkers?: readonly Entry[]; decisionMarkers?: readonly Entry[]
  statusMarkers?: readonly string[]; authoritySignals?: readonly Entry[]
}

function buildSource(spec: SourceSpec): OkSource {
  const provider = spec.provider ?? "github"
  const url = `https://example.com/${provider}/${encodeURIComponent(spec.externalId)}`
  const result = buildFormationSourceCandidate(JSON.stringify({
    provider,
    sourceRef: { source: provider, externalId: spec.externalId, url, capturedAt: CAPTURED_AT },
    sourceObjectId: spec.sourceObjectId,
    title: `Item ${spec.externalId}`,
    sanitizedSummary: `Summary for ${spec.externalId}`,
    actorAssertions: (spec.actors ?? []).map((a) => ({ name: a.name, assertedRelation: a.relation ?? "author" })),
    timestamps: { occurredAt: spec.occurredAt ?? OCCURRED_AT, capturedAt: spec.capturedAt ?? CAPTURED_AT, ...(spec.editedAt !== undefined ? { editedAt: spec.editedAt } : {}) },
    ...(spec.deadline !== undefined ? { explicitDeadline: spec.deadline } : {}),
    ...(spec.versionInfo !== undefined ? { versionInfo: spec.versionInfo } : {}),
    sourceLinks: [{ url }], referencedObjects: [], supersedes: spec.supersedes ?? [],
    unresolvedMarkers: spec.unresolvedMarkers ?? [], decisionMarkers: spec.decisionMarkers ?? [],
    statusMarkers: spec.statusMarkers ?? [], authoritySignals: spec.authoritySignals ?? [],
    navigationTarget: url,
  }))
  if (!result.ok) throw new Error(`F1A fixture rejected (${spec.externalId}): ${JSON.stringify(result.findings)}`)
  return result
}

const ALL_GOAL_FIELDS: Record<string, string> = {
  outcome: "Ship the reviewed widget", workObject: "widget", decisionNeeded: "whether to ship",
  scope: "the widget module", verifier: "human_owner", timeHorizon: "this quarter",
}

type SubjectSpec = {
  sources: readonly SourceSpec[]; goalFields?: "all" | "missing_timeHorizon"
  doneCondition?: "complete" | "partial"; minimalGoal?: boolean
  independentClosure?: "independent" | "parent_bounded" | "unknown"
}

function buildSubject(spec: SubjectSpec): ValidatedFormationSubjectResult {
  const results = spec.sources.map(buildSource)
  const candidates: FormationSourceCandidate[] = results.map((r) => r.candidate)
  const goal: Record<string, string> = spec.minimalGoal ? {} : { ...ALL_GOAL_FIELDS }
  if (spec.goalFields === "missing_timeHorizon") delete goal.timeHorizon
  const gdc = buildFormationGoalDoneConditionCandidate({
    goal: goal as never,
    doneCondition: {
      outcome: "Ship the reviewed widget", verifier: "human_owner",
      acceptanceCriteria: spec.doneCondition === "partial" ? [] : ["A human reviewer can verify the outcome."],
      humanInputRef: "human:reviewer", missingFields: [], status: "partial",
      invalidReasons: [], riskFlags: [], candidateOnly: true,
    },
    independentClosure: spec.independentClosure ?? "unknown",
    validatedSources: candidates,
  })
  const f1c = buildWorkUnitFormationCandidate({
    members: results.map((r) => ({ sourceResult: r, role: "evidence" })), goalDoneCondition: gdc,
  } as never)
  if (!f1c.ok) throw new Error(`F1C build failed: ${JSON.stringify(f1c)}`)
  return f1c as ValidatedFormationSubjectResult
}

/** A complete, independently closable single-source subject. */
function subjectOf(externalId: string, sourceObjectId: string, extra: Partial<SourceSpec> = {}): ValidatedFormationSubjectResult {
  return buildSubject({ sources: [{ externalId, sourceObjectId, ...extra }], doneCondition: "complete", independentClosure: "independent" })
}

function inspect(value: unknown): { strings: string[]; numbers: number[]; keys: Set<string> } {
  const strings: string[] = []; const numbers: number[] = []; const keys = new Set<string>()
  const walk = (v: unknown): void => {
    if (typeof v === "string") strings.push(v)
    else if (typeof v === "number") numbers.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === "object") for (const [k, inner] of Object.entries(v)) { keys.add(k); walk(inner) }
  }
  walk(value)
  return { strings, numbers, keys }
}

// The first row is the removed pair surface; the rest are raw-data, ranking and
// lifecycle fields that must never appear.
const FORBIDDEN_OUTPUT_KEYS = [
  "pairGroupingContext", "groupingOutcome", "basisVerdict", "proposalStrength", "defaultGrouped",
  "groupingUnchanged", "membershipUnchanged", "subjectSideResolved", "targetSide", "sourceSide",
  "pairSides", "pairToken", "comparisonInput", "comparisonResult", "groupingContext", "present",
  "formationResult", "subject", "members", "goal", "goalDoneCondition", "doneCondition", "sourceRef",
  "sourceObjectId", "title", "sanitizedSummary", "navigationTarget", "url", "actorAssertions",
  "authoritySignals", "timestamps", "explicitDeadline", "tenantId", "userId", "roi", "ranking", "rank",
  "score", "priority", "urgency", "whyNow", "grouped", "membership", "merged", "formalized",
  "approved", "executed", "conflictFindings", "conflicts", "mergeCandidate", "splitCandidate"]

function assertBoundedSafeOutput(result: unknown): void {
  const { strings, numbers, keys } = inspect(result)
  for (const key of FORBIDDEN_OUTPUT_KEYS) assert.ok(!keys.has(key), `forbidden output key: ${key}`)
  // No grouping or pair concept may survive anywhere, under any key or wording.
  for (const key of keys) assert.ok(!/group|pair|merge|split|membership/i.test(key), `grouping-shaped key: ${key}`)
  for (const s of strings) assert.ok(!/\bgrouping\b|\bpair\b|merge candidate|split proposal/i.test(s), `grouping-shaped text: ${s}`)
  assert.deepEqual(numbers, [], "F5 output must carry no numeric value")
  for (const s of strings) assert.ok(s.length <= 200, `output string exceeds 200 chars: ${s.slice(0, 40)}`)
  for (const raw of [
    "Dana", "Sam", "org/repo#", "org/other#", "Ship the reviewed widget", "widget", "Item ",
    "Summary for", "https://", "error response shape", "rollout decision", "human:reviewer",
  ]) for (const s of strings) assert.ok(!s.includes(raw), `raw value leaked into output: ${raw}`)
}

function okResult(input: unknown) {
  const r = predictFormationState(input as never)
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`)
  if (!r.ok) throw new Error("unreachable")
  assert.equal(r.candidateOnly, true)
  assert.equal(r.humanReviewRequired, true)
  // RESERVED and unreachable: no genuine F1A input may promote an actor.
  assert.ok(!r.reasonCodes.includes("actor_known_structured_owner"), "reserved actor code emitted")
  assert.notEqual(r.factors.actor, "known", "actor was promoted to known")
  assertBoundedSafeOutput(r)
  return r
}

function rejects(input: unknown, reason: string, label: string): void {
  const r = predictFormationState(input as never)
  assert.equal(r.ok, false, `${label} must fail closed`)
  if (!r.ok) assert.equal(r.reason, reason, label)
}

// ─── Closed vocabularies ─────────────────────────────────────────────────────

test("factor vocabularies are exactly the closed sets and carry no grouping concept", () => {
  // `actor: known` stays in the vocabulary as a RESERVED future state.
  assert.deepEqual([
    [...STATE_PREDICTION_ACTOR_FACTORS], [...STATE_PREDICTION_LIMIT_FACTORS],
    [...STATE_PREDICTION_EVENT_TIME_FACTORS], [...STATE_PREDICTION_UPDATE_FACTORS],
    [...STATE_PREDICTION_AUTHORITY_FACTORS], [...STATE_PREDICTION_UNRESOLVED_FACTORS],
    [...STATE_PREDICTION_MISSING_FACTORS],
  ], [
    ["known", "asserted", "unknown"], ["explicit", "inferred", "absent"],
    ["known", "uncertain", "absent"], ["meaningful", "unchanged", "unknown"],
    ["structured", "asserted", "absent"], ["present", "absent", "unknown"],
    ["present", "absent"],
  ])
  for (const code of STATE_PREDICTION_REASON_CODES) {
    assert.ok(!/group|pair|merge|split|conflict_finding|ranking|roi|score|urgency/i.test(code), `out-of-slice code: ${code}`)
  }
  assert.ok(STATE_PREDICTION_REJECTIONS.includes("grouping_context_not_supported"))
})

// ─── Deterministic factors (fixtures A–L) ────────────────────────────────────

const fixturePath = fileURLToPath(new URL("./fixtures/formation/state-prediction/scenarios.json", import.meta.url))
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as
  { subjectScenarios: (SubjectSpec & { name: string; expect: Record<string, string> })[] }

for (const scenario of fixtures.subjectScenarios) {
  test(`state-prediction ${scenario.name}`, () => {
    const r = okResult({ formationResult: buildSubject(scenario) })
    assert.deepEqual({ ...r.factors }, {
      actor: scenario.expect.actor, limit: scenario.expect.limit, eventTime: scenario.expect.eventTime,
      update: scenario.expect.update, authority: scenario.expect.authority,
      unresolved: scenario.expect.unresolved, missing: scenario.expect.missing })
    assert.equal(r.subjectState, scenario.expect.subjectState)
    for (const code of r.reasonCodes) assert.ok(STATE_PREDICTION_REASON_CODES.includes(code), `unclosed code ${code}`)
    assert.equal(r.reasonCodes.length, 8)
    assert.equal(r.narrative.length, r.reasonCodes.length)
  })
}

test("missing evidence stays missing; conflict-shaped evidence becomes unresolved only", () => {
  const missing = okResult({ formationResult: buildSubject({
    sources: [{ externalId: "miss-1", sourceObjectId: "org/repo#900" }],
    goalFields: "missing_timeHorizon", doneCondition: "partial", independentClosure: "unknown",
  }) })
  assert.equal(missing.factors.missing, "present")
  assert.equal(missing.subjectState, "clarification_needed")
  assert.ok(missing.reasonCodes.includes("missing_present"))
  // A settled/contested contradiction is reported, never resolved — and F5 has
  // no grouping input or output through which it could regroup anything.
  const conflict = okResult({ formationResult: buildSubject({
    sources: [
      { externalId: "conf-1", sourceObjectId: "org/repo#901", statusMarkers: ["approved"] },
      { externalId: "conf-2", sourceObjectId: "org/repo#902", statusMarkers: ["changes_requested"] }],
    doneCondition: "complete", independentClosure: "independent",
  }) })
  assert.equal(conflict.factors.unresolved, "present")
  assert.equal(conflict.subjectState, "formal_candidate")
})

test("an unbound authority signal never promotes actor certainty", () => {
  // F1A binds no actor identity to an authority signal, so an uninferred
  // owner_of_record on the SAME source proves nothing about the named actor.
  // Authority stays independently structured; the actor stays asserted.
  const authoritySignals = [{ kind: "owner_of_record", inferred: false }]
  for (const relation of ["author", "assignee", "reviewer_requested", "mentioned", "owner_claimed", "approver_claimed"]) {
    const r = okResult({ formationResult: subjectOf(`rel-${relation}`, "org/repo#920", { actors: [{ name: "Dana", relation }], authoritySignals }) })
    assert.equal(r.factors.actor, "asserted", relation)
    assert.equal(r.factors.authority, "structured", relation)
  }
  // One repeated display name across sources is still only an assertion.
  const repeated = okResult({ formationResult: buildSubject({
    sources: [
      { externalId: "rep-1", sourceObjectId: "org/repo#921", actors: [{ name: "Dana" }], authoritySignals },
      { externalId: "rep-2", sourceObjectId: "org/repo#922", actors: [{ name: "Dana" }], authoritySignals }],
    doneCondition: "complete", independentClosure: "independent",
  }) })
  assert.equal(repeated.factors.actor, "asserted")
  // Multiple distinct names, and provider identity, change nothing either.
  assert.equal(okResult({ formationResult: subjectOf("dist-1", "org/repo#923", { actors: [{ name: "Dana" }, { name: "Sam", relation: "assignee" }], authoritySignals }) }).factors.actor, "asserted")
  for (const provider of ["github", "slack", "notion"]) {
    assert.equal(okResult({ formationResult: subjectOf(`pa-${provider}`, `obj/${provider}`, { provider, actors: [{ name: "Dana" }], authoritySignals }) }).factors.actor, "asserted")
  }
  // An assertion without authority, and authority without any assertion.
  const noAuthority = okResult({ formationResult: subjectOf("noauth-1", "org/repo#924", { actors: [{ name: "Dana" }] }) })
  assert.equal(noAuthority.factors.actor, "asserted")
  assert.equal(noAuthority.factors.authority, "absent")
  const noActor = okResult({ formationResult: subjectOf("noactor-1", "org/repo#925", { authoritySignals }) })
  assert.equal(noActor.factors.actor, "unknown")
  assert.equal(noActor.factors.authority, "structured")
})

test("assertion, inference and provider identity are never promoted to fact", () => {
  // Asserted / inferred authority never becomes structured authority.
  const signals = [
    [{ kind: "accepted_status", inferred: true }], [{ kind: "owner_of_record", inferred: true }],
    [{ kind: "signed_off_review", inferred: true }], [{ kind: "decision_maker_named", inferred: false }],
  ]
  for (const [i, authoritySignals] of signals.entries()) {
    const r = okResult({ formationResult: subjectOf(`auth-${i}`, "org/repo#903", { authoritySignals }) })
    assert.equal(r.factors.authority, "asserted")
    assert.ok(r.reasonCodes.includes("authority_asserted_only"))
  }
  // Provider identity alone is neither authority nor a known actor.
  for (const provider of ["github", "slack", "notion", "gmail", "google_calendar", "google_drive"]) {
    const r = okResult({ formationResult: subjectOf(`prov-${provider}`, `obj/${provider}`, { provider }) })
    assert.equal(r.factors.authority, "absent")
    assert.equal(r.factors.actor, "unknown")
  }
  // An inferred limit never becomes explicit, and no urgency is derived from it.
  const limit = okResult({ formationResult: subjectOf("lim-1", "org/repo#904", { deadline: { value: "2026-08-01T00:00:00Z", inferred: true } }) })
  assert.equal(limit.factors.limit, "inferred")
  assert.ok(limit.reasonCodes.includes("limit_inferred_not_authoritative"))
  assert.ok(!limit.reasonCodes.includes("limit_explicit_declared"))
})

// ─── Runtime provenance and one-read capture ─────────────────────────────────

test("a cloned, forged, wrapped, bare or failed F1C subject rejects", () => {
  const good = subjectOf("prov-1", "org/repo#905")
  const bads: unknown[] = [
    { ...good }, JSON.parse(JSON.stringify(good)), structuredClone(good),
    Object.create(good as object), new Proxy(good as object, {}),
    (good as { candidate?: unknown }).candidate,
    { ok: true, candidateOnly: true, candidate: { members: [], goalDoneCondition: {}, humanReviewRequired: true, candidateOnly: true } },
    buildWorkUnitFormationCandidate({ members: [], goalDoneCondition: {} } as never),
  ]
  for (const [i, bad] of bads.entries()) rejects({ formationResult: bad }, "subject_not_validated", `clone ${i}`)
})

test("mutating the public F1C result after attestation cannot alter the prediction", () => {
  const formationResult = subjectOf("mut-1", "org/repo#906")
  const clean = okResult({ formationResult })
  const candidate = (formationResult as { candidate: Record<string, unknown> }).candidate
  ;(candidate.goalDoneCondition as Record<string, unknown>).independentClosure = "unknown"
  ;(candidate as Record<string, unknown>).members = []
  assert.deepEqual(okResult({ formationResult }), clean)
})

test("the subject is read exactly once; hostile and malformed input fails closed", () => {
  const first = subjectOf("read-1", "org/repo#907", {
    actors: [{ name: "Dana" }], authoritySignals: [{ kind: "owner_of_record", inferred: false }],
    deadline: { value: "2026-08-01T00:00:00Z", inferred: false }, statusMarkers: ["approved"],
  })
  const second = buildSubject({
    sources: [{ externalId: "read-2", sourceObjectId: "org/repo#908" }],
    goalFields: "missing_timeHorizon", doneCondition: "partial", independentClosure: "unknown",
  })
  const expected = okResult({ formationResult: first })
  assert.notDeepEqual(okResult({ formationResult: second }).factors, expected.factors)
  let reads = 0
  const phaseSplit = { get formationResult() { reads += 1; return reads === 1 ? first : second } }
  const r = okResult(phaseSplit)
  assert.equal(reads, 1, "the subject must be read exactly once")
  assert.deepEqual(r.factors, expected.factors)
  assert.deepEqual(r.reasonCodes, expected.reasonCodes)
  for (const hostile of [
    new Proxy({}, { get() { throw new Error("hostile accessor") } }),
    { get formationResult(): never { throw new Error("hostile getter") } },
  ]) rejects(hostile, "input_unreadable", "hostile accessor")
  for (const [i, bad] of [null, undefined, 42, "subject", [], {}, { formationResult: null }, { formationResult: {} }].entries()) {
    const failed = predictFormationState(bad as never)
    assert.equal(failed.ok, false, `malformed input ${i}`)
    if (!failed.ok) assert.ok(STATE_PREDICTION_REJECTIONS.includes(failed.reason))
  }
})

test("repeated predictions are byte-stable, deeply equal and non-aliasing", () => {
  const formationResult = subjectOf("det-1", "org/repo#909", {
    actors: [{ name: "Dana" }], authoritySignals: [{ kind: "owner_of_record", inferred: false }],
    deadline: { value: "2026-08-01T00:00:00Z", inferred: false }, statusMarkers: ["approved"],
    unresolvedMarkers: [{ kind: "open_question", summary: "One question is still open." }],
  })
  const first = okResult({ formationResult })
  const second = okResult({ formationResult })
  assert.deepEqual(second, first)
  assert.equal(JSON.stringify(second), JSON.stringify(first))
  assert.notEqual(second, first)
  assert.notEqual(second.factors, first.factors)
  assert.notEqual(second.reasonCodes, first.reasonCodes)
  assert.notEqual(second.narrative, first.narrative)
  ;(second.factors as Record<string, unknown>).actor = "unknown"
  assert.deepEqual(okResult({ formationResult }).factors, first.factors)
})

// ─── Subject-only boundary (the remediated blocker) ──────────────────────────

test("pair-shaped and other forbidden caller bindings fail closed value-free", () => {
  const formationResult = subjectOf("bound-1", "org/repo#910")
  for (const field of ["comparisonInput", "groupingOutcomeResult"]) {
    for (const value of [undefined, null, {}, "x"]) {
      rejects({ formationResult, [field]: value }, "grouping_context_not_supported", `${field}=${String(value)}`)
    }
    // The probe is an own-property check, so the value is never read.
    let read = false
    rejects({ formationResult, get [field]() { read = true; return {} } }, "grouping_context_not_supported", field)
    assert.equal(read, false, `${field} must never be read`)
  }
  for (const field of [
    "candidateId", "targetSide", "sourceSide", "pairSides", "pairToken", "pairGroupingContext",
    "roi", "score", "rank", "ranking", "priority", "urgency", "conflictFindings", "membership",
    "approved", "executed", "candidateOnly", "humanReviewRequired",
  ]) rejects({ formationResult, [field]: "x" }, "unbound_reference_supplied", field)
})

test("an unrelated subject can no longer be composed with a genuine grouping outcome", () => {
  // Subject C is attested but belongs to NEITHER side of the attested pair A/B.
  // The predecessor accepted this and reported a pair verdict for C; it is now
  // rejected before anything is read, and no resolver was invented to allow it.
  const a = { formationResult: buildSubject({ sources: [{ externalId: "pr-A", sourceObjectId: "org/repo#80" }], minimalGoal: true }) }
  const b = { formationResult: buildSubject({ sources: [{ externalId: "pr-B", sourceObjectId: "org/repo#80", occurredAt: "2026-06-01T00:00:00Z" }], minimalGoal: true }) }
  const c = subjectOf("pr-C", "org/other#999")
  const pair = { left: a, right: b }
  const comparison = compareGroupingSubjects(pair as never)
  assert.equal(comparison.ok, true)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: pair as never, comparisonResult: comparison as never, mergeTargetSide: "left" })
  assert.equal(outcome.ok, true, "F4 still owns and produces the pair verdict")
  rejects({ formationResult: c, comparisonInput: pair, groupingOutcomeResult: outcome }, "grouping_context_not_supported", "unrelated subject C")
  // Equally rejected for a subject that IS a side: F5 has no pair capability at
  // all, so no association can be asserted in either direction.
  rejects({ formationResult: a.formationResult, comparisonInput: pair, groupingOutcomeResult: outcome }, "grouping_context_not_supported", "subject A")
})

test("the F5 module imports only subject authorities and no F4 grouping-outcome API", () => {
  const modulePath = fileURLToPath(new URL("../app/lib/application/formation/statePrediction.ts", import.meta.url))
  const source = readFileSync(modulePath, "utf8")
  assert.deepEqual([...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort(), [
    "./sourceContract.ts", "./statePredictionTypes.ts", "./states.ts", "./workUnitFormationAggregate.ts",
  ])
  for (const forbidden of [
    "snapshotValidatedFormationGroupingOutcomeResult", "attestValidatedGroupingComparison",
    "attestedGroupingPairTokenMatches", "GroupingComparisonInput", "AttestedGroupingPairToken",
    "SuccessfulFormationGroupingOutcomeResult", "SuccessfulFormationGroupingOutcomeSnapshot",
    "./grouping.ts", "./groupingTypes.ts",
  ]) assert.ok(!source.includes(forbidden), `F5 must not reference ${forbidden}`)
  for (const forbidden of [/\bfetch\s*\(/, /\bDate\.now\b/, /\bMath\.random\b/, /orchestrator/i]) {
    assert.ok(!forbidden.test(source), `F5 must not contain ${forbidden}`)
  }
})
