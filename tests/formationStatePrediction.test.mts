/**
 * F5 — Deterministic State Prediction — permanent tests.
 *
 * Every subject is compiled through the REAL F1A/F1B/F1C boundaries and every
 * pair through the REAL F3/F4 boundaries, so each `formationResult` /
 * `groupingOutcomeResult` is a genuinely ATTESTED object, never a clone. The
 * closed factor expectations live in `fixtures/formation/state-prediction/
 * scenarios.json`; the attestation, one-read, leakage, determinism and
 * grouping-immutability counterexamples are pinned inline.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  buildFormationSourceCandidate,
  type FormationSourceCandidate,
  type FormationSourceContractResult,
} from "../app/lib/application/formation/sourceContract.ts"
import { buildFormationGoalDoneConditionCandidate } from "../app/lib/application/formation/goalDoneConditionAdapter.ts"
import { buildWorkUnitFormationCandidate } from "../app/lib/application/formation/workUnitFormationAggregate.ts"
import { compareGroupingSubjects } from "../app/lib/application/formation/grouping.ts"
import type {
  GroupingComparisonInput,
  GroupingSubjectInput,
  SuccessfulWorkUnitFormationResult,
} from "../app/lib/application/formation/groupingTypes.ts"
import {
  mapFormationGroupingOutcome,
  snapshotValidatedFormationGroupingOutcomeResult,
} from "../app/lib/application/formation/states.ts"
import {
  STATE_PREDICTION_ACTOR_FACTORS,
  STATE_PREDICTION_AUTHORITY_FACTORS,
  STATE_PREDICTION_EVENT_TIME_FACTORS,
  STATE_PREDICTION_LIMIT_FACTORS,
  STATE_PREDICTION_MISSING_FACTORS,
  STATE_PREDICTION_REASON_CODES,
  STATE_PREDICTION_REJECTIONS,
  STATE_PREDICTION_UNRESOLVED_FACTORS,
  STATE_PREDICTION_UPDATE_FACTORS,
} from "../app/lib/application/formation/statePredictionTypes.ts"
import { predictFormationState } from "../app/lib/application/formation/statePrediction.ts"

type OkSource = Extract<FormationSourceContractResult, { ok: true }>

const CAPTURED_AT = "2026-07-19T00:00:00Z"
const DEFAULT_OCCURRED_AT = "2026-01-01T00:00:00Z"

type SourceSpec = {
  externalId: string
  sourceObjectId: string
  provider?: string
  occurredAt?: string
  capturedAt?: string
  editedAt?: string
  container?: string
  actors?: readonly { name: string; relation?: string }[]
  deadline?: { value: string; inferred: boolean }
  versionInfo?: { value: string; inferred: boolean }
  supersedes?: readonly { provider: string; sourceObjectId: string; inferred: boolean }[]
  unresolvedMarkers?: readonly { kind: string; summary: string }[]
  decisionMarkers?: readonly { kind: string; summary: string; inferred: boolean }[]
  statusMarkers?: readonly string[]
  authoritySignals?: readonly { kind: string; inferred: boolean }[]
  referencedObjects?: readonly { provider: string; sourceObjectId: string }[]
}

function buildSource(spec: SourceSpec): OkSource {
  const provider = spec.provider ?? "github"
  const url = `https://example.com/${provider}/${encodeURIComponent(spec.externalId)}`
  const json = {
    provider,
    sourceRef: {
      source: provider,
      externalId: spec.externalId,
      url,
      capturedAt: CAPTURED_AT,
      ...(spec.container !== undefined ? { container: spec.container } : {}),
    },
    sourceObjectId: spec.sourceObjectId,
    title: `Item ${spec.externalId}`,
    sanitizedSummary: `Summary for ${spec.externalId}`,
    actorAssertions: (spec.actors ?? []).map((a) => ({ name: a.name, assertedRelation: a.relation ?? "author" })),
    timestamps: {
      occurredAt: spec.occurredAt ?? DEFAULT_OCCURRED_AT,
      capturedAt: spec.capturedAt ?? CAPTURED_AT,
      ...(spec.editedAt !== undefined ? { editedAt: spec.editedAt } : {}),
    },
    ...(spec.deadline !== undefined ? { explicitDeadline: spec.deadline } : {}),
    sourceLinks: [{ url }],
    referencedObjects: spec.referencedObjects ?? [],
    ...(spec.versionInfo !== undefined ? { versionInfo: spec.versionInfo } : {}),
    supersedes: spec.supersedes ?? [],
    unresolvedMarkers: spec.unresolvedMarkers ?? [],
    decisionMarkers: spec.decisionMarkers ?? [],
    statusMarkers: spec.statusMarkers ?? [],
    authoritySignals: spec.authoritySignals ?? [],
    navigationTarget: url,
  }
  const result = buildFormationSourceCandidate(JSON.stringify(json))
  if (!result.ok) throw new Error(`F1A fixture rejected (${spec.externalId}): ${JSON.stringify(result.findings)}`)
  return result
}

const ALL_GOAL_FIELDS: Record<string, string> = {
  outcome: "Ship the reviewed widget",
  workObject: "widget",
  decisionNeeded: "whether to ship",
  scope: "the widget module",
  verifier: "human_owner",
  timeHorizon: "this quarter",
}

type SubjectSpec = {
  sources: readonly SourceSpec[]
  goalFields?: "all" | "missing_timeHorizon"
  doneCondition?: "complete" | "partial"
  independentClosure?: "independent" | "parent_bounded" | "unknown"
  goal?: Record<string, string>
  outcome?: string
  acceptanceCriteria?: readonly string[]
  canonicalWorkObjectRef?: { provider: string; sourceObjectId: string }
}

function buildSubject(spec: SubjectSpec): SuccessfulWorkUnitFormationResult {
  const results = spec.sources.map(buildSource)
  const candidates: FormationSourceCandidate[] = results.map((r) => r.candidate)
  const goal: Record<string, string> = spec.goal ?? { ...ALL_GOAL_FIELDS }
  if (spec.goalFields === "missing_timeHorizon") delete goal.timeHorizon
  const acceptanceCriteria = spec.acceptanceCriteria
    ?? (spec.doneCondition === "partial" ? [] : ["A human reviewer can verify the outcome."])
  const gdc = buildFormationGoalDoneConditionCandidate({
    goal: goal as never,
    doneCondition: {
      outcome: spec.outcome ?? "Ship the reviewed widget",
      verifier: "human_owner",
      acceptanceCriteria,
      humanInputRef: "human:reviewer",
      missingFields: [],
      status: "partial",
      invalidReasons: [],
      riskFlags: [],
      candidateOnly: true,
    },
    independentClosure: spec.independentClosure ?? "unknown",
    validatedSources: candidates,
  })
  const f1c = buildWorkUnitFormationCandidate({
    members: results.map((r) => ({ sourceResult: r, role: "evidence" })),
    goalDoneCondition: gdc,
  } as never)
  if (!f1c.ok) throw new Error(`F1C build failed: ${JSON.stringify(f1c)}`)
  return f1c as SuccessfulWorkUnitFormationResult
}

/**
 * A comparison subject. Its Goal stays deliberately minimal unless the fixture
 * supplies one, so the pair verdict is driven by the fixture's own evidence and
 * not by an incidental full-Goal match.
 */
function buildGroupingSubject(spec: SubjectSpec): GroupingSubjectInput {
  return {
    formationResult: buildSubject({
      ...spec,
      goal: spec.goal ?? {},
      outcome: "Placeholder done outcome",
      acceptanceCriteria: [],
    }),
    ...(spec.canonicalWorkObjectRef !== undefined
      ? { canonicalWorkObjectRef: spec.canonicalWorkObjectRef as never }
      : {}),
  }
}

type PairFixture = {
  name: string
  left: SubjectSpec
  right: SubjectSpec
  mergeTargetSide?: "left" | "right"
  expect: {
    groupingOutcome: string
    basisVerdict: string
    formationState: string | null
    proposalStrength: string | null
  }
}

/** Build a REAL attested pair plus its REAL attested F4 grouping outcome. */
function buildPair(spec: PairFixture): { input: GroupingComparisonInput; outcome: unknown } {
  const input: GroupingComparisonInput = {
    left: buildGroupingSubject(spec.left),
    right: buildGroupingSubject(spec.right),
  }
  const comparisonResult = compareGroupingSubjects(input)
  if (!comparisonResult.ok) throw new Error(`F3 compare failed: ${JSON.stringify(comparisonResult)}`)
  const outcome = mapFormationGroupingOutcome({
    comparisonInput: input,
    comparisonResult,
    ...(spec.mergeTargetSide !== undefined ? { mergeTargetSide: spec.mergeTargetSide } : {}),
  })
  if (!outcome.ok) throw new Error(`F4 outcome failed: ${JSON.stringify(outcome)}`)
  return { input, outcome }
}

// ─── Output inspection helpers ───────────────────────────────────────────────

function collectValues(value: unknown, strings: string[], numbers: number[], keys: Set<string>): void {
  if (typeof value === "string") strings.push(value)
  else if (typeof value === "number") numbers.push(value)
  else if (Array.isArray(value)) for (const v of value) collectValues(v, strings, numbers, keys)
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k)
      collectValues(v, strings, numbers, keys)
    }
  }
}

function inspect(value: unknown): { strings: string[]; numbers: number[]; keys: Set<string> } {
  const strings: string[] = []
  const numbers: number[] = []
  const keys = new Set<string>()
  collectValues(value, strings, numbers, keys)
  return { strings, numbers, keys }
}

// Keys that must NEVER appear anywhere in an F5 output (Section 7).
const FORBIDDEN_OUTPUT_KEYS = [
  "targetSide", "sourceSide", "pairSides", "pairToken", "comparisonInput", "comparisonResult",
  "formationResult", "subject", "members", "goal", "goalDoneCondition", "doneCondition",
  "sourceRef", "sourceObjectId", "title", "sanitizedSummary", "navigationTarget", "url",
  "actorAssertions", "authoritySignals", "timestamps", "explicitDeadline", "tenantId", "userId",
  "roi", "ranking", "rank", "score", "priority", "urgency", "whyNow",
  "grouped", "membership", "merged", "formalized", "approved", "executed",
  "conflictFindings", "conflicts", "mergeCandidate", "splitCandidate", "proposedParts",
]

function assertBoundedSafeOutput(result: unknown): void {
  const { strings, numbers, keys } = inspect(result)
  for (const key of FORBIDDEN_OUTPUT_KEYS) assert.ok(!keys.has(key), `forbidden output key: ${key}`)
  // No universal score, weight, or count of any kind may be invented.
  assert.deepEqual(numbers, [], "F5 output must carry no numeric value")
  for (const s of strings) assert.ok(s.length <= 200, `output string exceeds 200 chars: ${s.slice(0, 40)}`)
  // No raw source / Goal / actor text may travel into the output.
  for (const raw of [
    "Dana", "Sam", "Kaneko", "org/repo#", "Ship the reviewed widget", "widget",
    "Item ", "Summary for", "https://", "error response shape", "rollout decision",
    "shared-space", "human:reviewer", "A human reviewer can verify",
  ]) {
    for (const s of strings) assert.ok(!s.includes(raw), `raw value leaked into output: ${raw}`)
  }
}

function okResult(input: Parameters<typeof predictFormationState>[0]) {
  const r = predictFormationState(input)
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`)
  if (!r.ok) throw new Error("unreachable")
  return r
}

// ─── Closed vocabularies (Section 6) ─────────────────────────────────────────

test("state-prediction factor vocabularies are exactly the closed sets", () => {
  assert.deepEqual([...STATE_PREDICTION_ACTOR_FACTORS], ["known", "asserted", "unknown"])
  assert.deepEqual([...STATE_PREDICTION_LIMIT_FACTORS], ["explicit", "inferred", "absent"])
  assert.deepEqual([...STATE_PREDICTION_EVENT_TIME_FACTORS], ["known", "uncertain", "absent"])
  assert.deepEqual([...STATE_PREDICTION_UPDATE_FACTORS], ["meaningful", "unchanged", "unknown"])
  assert.deepEqual([...STATE_PREDICTION_AUTHORITY_FACTORS], ["structured", "asserted", "absent"])
  assert.deepEqual([...STATE_PREDICTION_UNRESOLVED_FACTORS], ["present", "absent", "unknown"])
  assert.deepEqual([...STATE_PREDICTION_MISSING_FACTORS], ["present", "absent"])
  // No F6 conflict finding and no F7 ranking vocabulary is introduced here.
  for (const code of STATE_PREDICTION_REASON_CODES) {
    assert.ok(!/conflict_finding|ranking|roi|score|urgency/i.test(code), `out-of-slice reason code: ${code}`)
  }
})

// ─── Deterministic factors (Section 9, fixtures A–L) ─────────────────────────

const fixturePath = fileURLToPath(new URL("./fixtures/formation/state-prediction/scenarios.json", import.meta.url))
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  subjectScenarios: (SubjectSpec & { name: string; expect: Record<string, string> })[]
  pairScenarios: PairFixture[]
}

for (const scenario of fixtures.subjectScenarios) {
  test(`state-prediction ${scenario.name}`, () => {
    const formationResult = buildSubject(scenario)
    const r = okResult({ formationResult })
    assert.equal(r.candidateOnly, true)
    assert.equal(r.humanReviewRequired, true)
    assert.deepEqual({ ...r.factors }, {
      actor: scenario.expect.actor,
      limit: scenario.expect.limit,
      eventTime: scenario.expect.eventTime,
      update: scenario.expect.update,
      authority: scenario.expect.authority,
      unresolved: scenario.expect.unresolved,
      missing: scenario.expect.missing,
    })
    assert.equal(r.subjectState, scenario.expect.subjectState)
    // Every reason code is closed, and the narrative is bounded and derived from it.
    for (const code of r.reasonCodes) assert.ok(STATE_PREDICTION_REASON_CODES.includes(code), `unclosed code ${code}`)
    assert.ok(r.reasonCodes.length <= 20 && r.narrative.length === r.reasonCodes.length)
    assert.equal(r.pairGroupingContext.present, false)
    assertBoundedSafeOutput(r)
  })
}

test("missing evidence stays missing and never becomes fabricated certainty (counterexample 13)", () => {
  const r = okResult({ formationResult: buildSubject({
    sources: [{ externalId: "miss-1", sourceObjectId: "org/repo#900" }],
    goalFields: "missing_timeHorizon", doneCondition: "partial", independentClosure: "unknown",
  }) })
  assert.equal(r.factors.missing, "present")
  assert.equal(r.factors.actor, "unknown")
  assert.equal(r.factors.limit, "absent")
  assert.equal(r.subjectState, "clarification_needed")
  assert.ok(r.reasonCodes.includes("missing_present"))
})

test("an asserted or inferred authority signal never becomes structured (counterexample 14)", () => {
  const cases = [
    [{ kind: "accepted_status", inferred: true }],
    [{ kind: "owner_of_record", inferred: true }],
    [{ kind: "signed_off_review", inferred: true }],
    [{ kind: "decision_maker_named", inferred: false }],
  ]
  for (const [index, signals] of cases.entries()) {
    const r = okResult({ formationResult: buildSubject({
      sources: [{ externalId: `auth-${index}`, sourceObjectId: "org/repo#901", authoritySignals: signals }],
      doneCondition: "complete", independentClosure: "independent",
    }) })
    assert.equal(r.factors.authority, "asserted")
    assert.ok(r.reasonCodes.includes("authority_asserted_only"))
  }
})

test("provider identity alone never creates authority or a known actor (counterexample 15)", () => {
  for (const provider of ["github", "slack", "notion", "gmail", "google_calendar", "google_drive"]) {
    const r = okResult({ formationResult: buildSubject({
      sources: [{ provider, externalId: `prov-${provider}`, sourceObjectId: `obj/${provider}` }],
      doneCondition: "complete", independentClosure: "independent",
    }) })
    assert.equal(r.factors.authority, "absent")
    assert.equal(r.factors.actor, "unknown")
  }
})

test("an inferred limit never becomes an explicit fact or a deterministic urgency (counterexample 16)", () => {
  const r = okResult({ formationResult: buildSubject({
    sources: [{ externalId: "lim-1", sourceObjectId: "org/repo#902", deadline: { value: "2026-08-01T00:00:00Z", inferred: true } }],
    doneCondition: "complete", independentClosure: "independent",
  }) })
  assert.equal(r.factors.limit, "inferred")
  assert.ok(r.reasonCodes.includes("limit_inferred_not_authoritative"))
  assert.ok(!r.reasonCodes.includes("limit_explicit_declared"))
  // No deadline value, no urgency, no score.
  assertBoundedSafeOutput(r)
})

// ─── Attested F4 pair context (Sections 5, 7; fixtures I, J) ─────────────────

for (const scenario of fixtures.pairScenarios) {
  test(`pair-scoped grouping context ${scenario.name}`, () => {
    const { input, outcome } = buildPair(scenario)
    const formationResult = buildSubject({
      sources: [{ externalId: `subj-${scenario.name}`, sourceObjectId: "org/repo#903" }],
      doneCondition: "complete", independentClosure: "independent",
    })
    const before = JSON.stringify(outcome)
    const r = okResult({ formationResult, comparisonInput: input, groupingOutcomeResult: outcome as never })
    const ctx = r.pairGroupingContext
    assert.equal(ctx.present, true)
    if (!ctx.present) return
    assert.equal(ctx.groupingOutcome, scenario.expect.groupingOutcome)
    assert.equal(ctx.basisVerdict, scenario.expect.basisVerdict)
    assert.equal(ctx.formationState, scenario.expect.formationState)
    assert.equal(ctx.proposalStrength, scenario.expect.proposalStrength)
    // Counterexamples 11, 12: grouping is fixed, never grouped by prediction.
    assert.equal(ctx.defaultGrouped, false)
    assert.equal(ctx.groupingUnchanged, true)
    assert.equal(ctx.membershipUnchanged, true)
    // F5 resolves no side and claims no subject membership in the pair.
    assert.equal(ctx.subjectSideResolved, false)
    // The F4 outcome object is untouched and still attests afterwards.
    assert.equal(JSON.stringify(outcome), before)
    assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(outcome, input), null)
    assertBoundedSafeOutput(r)
  })
}

test("a fixed grouping outcome never changes any subject factor or subject state (mutations S5, S6, S11)", () => {
  const formationResult = buildSubject({
    sources: [{ externalId: "fixed-1", sourceObjectId: "org/repo#904", statusMarkers: ["approved"] }, { externalId: "fixed-2", sourceObjectId: "org/repo#905", statusMarkers: ["changes_requested"] }],
    doneCondition: "complete", independentClosure: "independent",
  })
  const alone = okResult({ formationResult })
  // Conflict-shaped evidence is reported, never resolved or regrouped.
  assert.equal(alone.factors.unresolved, "present")
  for (const scenario of fixtures.pairScenarios) {
    const { input, outcome } = buildPair(scenario)
    const withPair = okResult({ formationResult, comparisonInput: input, groupingOutcomeResult: outcome as never })
    assert.deepEqual(withPair.factors, alone.factors, `${scenario.name} altered the subject factors`)
    assert.equal(withPair.subjectState, alone.subjectState)
    // ...and the grouping decision is reported exactly as F4 fixed it, even
    // though this subject carries contradiction-shaped evidence.
    const ctx = withPair.pairGroupingContext
    assert.equal(ctx.present, true)
    if (!ctx.present) return
    assert.equal(ctx.groupingOutcome, scenario.expect.groupingOutcome)
    assert.equal(ctx.basisVerdict, scenario.expect.basisVerdict)
    assert.equal(ctx.formationState, scenario.expect.formationState)
    assert.equal(ctx.groupingUnchanged, true)
    assert.equal(ctx.membershipUnchanged, true)
    assert.equal(ctx.defaultGrouped, false)
  }
})

// ─── Runtime provenance (counterexamples 1–8) ────────────────────────────────

test("a cloned, forged, wrapped, or failed F1C subject rejects (counterexamples 2–6)", () => {
  const good = buildSubject({ sources: [{ externalId: "prov-1", sourceObjectId: "org/repo#906" }] })
  const bads: unknown[] = [
    { ...good },
    JSON.parse(JSON.stringify(good)),
    structuredClone(good),
    Object.create(good as object),
    new Proxy(good as object, {}),
    (good as { candidate?: unknown }).candidate,
    { ok: true, candidateOnly: true, candidate: { members: [], goalDoneCondition: {}, humanReviewRequired: true, candidateOnly: true } },
    buildWorkUnitFormationCandidate({ members: [], goalDoneCondition: {} } as never),
  ]
  for (const bad of bads) {
    const r = predictFormationState({ formationResult: bad as never })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "subject_not_validated")
  }
})

test("a cloned, forged, wrapped, or cross-pair F4 outcome rejects (counterexamples 2–7)", () => {
  const formationResult = buildSubject({ sources: [{ externalId: "prov-2", sourceObjectId: "org/repo#907" }] })
  const a = buildPair(fixtures.pairScenarios[0])
  const b = buildPair(fixtures.pairScenarios[1])
  const bads: unknown[] = [
    { ...(a.outcome as object) },
    JSON.parse(JSON.stringify(a.outcome)),
    structuredClone(a.outcome),
    Object.create(a.outcome as object),
    new Proxy(a.outcome as object, {}),
    { ok: true, candidateOnly: true, humanReviewRequired: true, state: "merge_candidate", groupingOutcome: "merge_candidate", basisVerdict: "strong_match", proposalStrength: "strong", defaultGrouped: false },
  ]
  for (const bad of bads) {
    const r = predictFormationState({ formationResult, comparisonInput: a.input, groupingOutcomeResult: bad as never })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "grouping_outcome_not_validated")
  }
  // Counterexample 7: the genuine pair-A outcome substituted into pair B.
  for (const [outcome, input] of [[a.outcome, b.input], [b.outcome, a.input]] as const) {
    const r = predictFormationState({ formationResult, comparisonInput: input, groupingOutcomeResult: outcome as never })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "grouping_outcome_not_validated")
  }
  // A wrapped comparison input is a different identity and never attests.
  const wrapped = predictFormationState({
    formationResult, comparisonInput: new Proxy(a.input as object, {}) as never, groupingOutcomeResult: a.outcome as never,
  })
  assert.equal(wrapped.ok, false)
})

test("mutating the public F4 result cannot alter the validated grouping context (counterexample 8)", () => {
  const formationResult = buildSubject({ sources: [{ externalId: "prov-3", sourceObjectId: "org/repo#908" }] })
  const { input, outcome } = buildPair(fixtures.pairScenarios[1])
  const clean = okResult({ formationResult, comparisonInput: input, groupingOutcomeResult: outcome as never })
  const mutable = outcome as Record<string, unknown>
  mutable.basisVerdict = "strong_match"
  mutable.proposalStrength = "strong"
  mutable.defaultGrouped = true
  mutable.state = "formal_candidate"
  const after = okResult({ formationResult, comparisonInput: input, groupingOutcomeResult: outcome as never })
  assert.deepEqual(after.pairGroupingContext, clean.pairGroupingContext)
  if (after.pairGroupingContext.present) assert.equal(after.pairGroupingContext.defaultGrouped, false)
})

// ─── One-read capture (counterexamples 9, 10; carried F4 follow-up) ──────────

test("a caller getter that changes between reads cannot split validation from reporting (counterexample 9)", () => {
  const first = buildSubject({ sources: [{ externalId: "read-1", sourceObjectId: "org/repo#909", actors: [{ name: "Dana" }], authoritySignals: [{ kind: "owner_of_record", inferred: false }], deadline: { value: "2026-08-01T00:00:00Z", inferred: false }, statusMarkers: ["approved"] }], doneCondition: "complete", independentClosure: "independent" })
  const second = buildSubject({ sources: [{ externalId: "read-2", sourceObjectId: "org/repo#910" }], goalFields: "missing_timeHorizon", doneCondition: "partial", independentClosure: "unknown" })
  const expectedFirst = okResult({ formationResult: first })
  const expectedSecond = okResult({ formationResult: second })
  assert.notDeepEqual(expectedFirst.factors, expectedSecond.factors)
  let reads = 0
  const phaseSplit = {
    get formationResult() {
      reads += 1
      return reads === 1 ? first : second
    },
  }
  const r = okResult(phaseSplit as never)
  assert.equal(reads, 1, "the subject must be read exactly once")
  assert.deepEqual(r.factors, expectedFirst.factors)
  assert.deepEqual(r.reasonCodes, expectedFirst.reasonCodes)
})

test("F5 performs no pair read of its own beyond the F4 attestation (carried F4 follow-up)", () => {
  const formationResult = buildSubject({ sources: [{ externalId: "read-3", sourceObjectId: "org/repo#911" }] })
  const left = buildGroupingSubject(fixtures.pairScenarios[0].left)
  const right = buildGroupingSubject(fixtures.pairScenarios[0].right)
  let leftReads = 0
  let rightReads = 0
  const input = {
    get left() { leftReads += 1; return left },
    get right() { rightReads += 1; return right },
  } as unknown as GroupingComparisonInput
  const comparisonResult = compareGroupingSubjects(input)
  assert.equal(comparisonResult.ok, true)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult: comparisonResult as never, mergeTargetSide: "left" })
  assert.equal(outcome.ok, true)
  // Baseline: the reads the F4 attestation alone performs.
  leftReads = 0
  rightReads = 0
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(outcome, input), null)
  const attestationLeft = leftReads
  const attestationRight = rightReads
  // F5 must add exactly zero further reads: it resolves no side from the pair.
  leftReads = 0
  rightReads = 0
  const r = okResult({ formationResult, comparisonInput: input, groupingOutcomeResult: outcome as never })
  assert.equal(leftReads, attestationLeft, "F5 read the pair's left side more than the attestation does")
  assert.equal(rightReads, attestationRight, "F5 read the pair's right side more than the attestation does")
  assertBoundedSafeOutput(r)
})

test("a pair whose sides change after attestation fails closed (counterexample 10)", () => {
  const formationResult = buildSubject({ sources: [{ externalId: "read-4", sourceObjectId: "org/repo#912" }] })
  const left = buildGroupingSubject(fixtures.pairScenarios[0].left)
  const right = buildGroupingSubject(fixtures.pairScenarios[0].right)
  const foreign = buildGroupingSubject(fixtures.pairScenarios[2].left)
  let swapped = false
  const input = {
    get left() { return swapped ? foreign : left },
    right,
  } as unknown as GroupingComparisonInput
  const comparisonResult = compareGroupingSubjects(input)
  assert.equal(comparisonResult.ok, true)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult: comparisonResult as never, mergeTargetSide: "left" })
  assert.equal(outcome.ok, true)
  // The accessor now answers with a different pair than the one that was attested.
  swapped = true
  const r = predictFormationState({ formationResult, comparisonInput: input, groupingOutcomeResult: outcome as never })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "grouping_outcome_not_validated")
  // A plain container whose sides are swapped in place fails the same way.
  const plain = { left, right } as GroupingComparisonInput
  const plainResult = compareGroupingSubjects(plain)
  assert.equal(plainResult.ok, true)
  const plainOutcome = mapFormationGroupingOutcome({ comparisonInput: plain, comparisonResult: plainResult as never, mergeTargetSide: "left" })
  assert.equal(plainOutcome.ok, true)
  ;(plain as { left: unknown; right: unknown }).left = right
  ;(plain as { left: unknown; right: unknown }).right = left
  const swappedResult = predictFormationState({ formationResult, comparisonInput: plain, groupingOutcomeResult: plainOutcome as never })
  assert.equal(swappedResult.ok, false)
})

// ─── Fail-closed input handling (counterexample 20) ──────────────────────────

test("hostile, malformed and partial input fails closed (counterexample 20)", () => {
  const formationResult = buildSubject({ sources: [{ externalId: "hostile-1", sourceObjectId: "org/repo#913" }] })
  const { input, outcome } = buildPair(fixtures.pairScenarios[0])
  const hostile: unknown[] = [
    null, undefined, 42, "subject", [], {}, { formationResult: null }, { formationResult: {} },
    new Proxy({}, { get() { throw new Error("hostile accessor") } }),
    new Proxy({}, { get() { return new Proxy({}, { get() { throw new Error("deep") } }) } }),
  ]
  for (const [index, bad] of hostile.entries()) {
    const r = predictFormationState(bad as never)
    assert.equal(r.ok, false, `expected fail-closed for hostile input ${index}`)
    if (!r.ok) assert.ok(STATE_PREDICTION_REJECTIONS.includes(r.reason))
  }
  // A half-supplied grouping context never degrades to "no context".
  for (const partial of [
    { formationResult, comparisonInput: input },
    { formationResult, groupingOutcomeResult: outcome },
  ]) {
    const r = predictFormationState(partial as never)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "grouping_context_incomplete")
  }
})

test("forbidden caller-supplied bindings and safety-literal overrides fail closed (mutations S14, S15, S16, S20)", () => {
  const formationResult = buildSubject({ sources: [{ externalId: "forbid-1", sourceObjectId: "org/repo#914" }] })
  for (const field of [
    "candidateId", "targetSide", "sourceSide", "pairSides", "pairToken", "roi", "score", "rank",
    "ranking", "priority", "urgency", "conflictFindings", "membership", "approved", "executed",
    "candidateOnly", "humanReviewRequired",
  ]) {
    const r = predictFormationState({ formationResult, [field]: "x" } as never)
    assert.equal(r.ok, false, `${field} must fail closed`)
    if (!r.ok) assert.equal(r.reason, "unbound_reference_supplied")
  }
})

// ─── Determinism and output bounds (counterexamples 18, 19) ─────────────────

test("repeated predictions are byte-stable, deeply equal and non-aliasing (counterexample 19)", () => {
  const formationResult = buildSubject({
    sources: [{ externalId: "det-1", sourceObjectId: "org/repo#915", actors: [{ name: "Dana" }], authoritySignals: [{ kind: "owner_of_record", inferred: false }], deadline: { value: "2026-08-01T00:00:00Z", inferred: false }, statusMarkers: ["approved"], unresolvedMarkers: [{ kind: "open_question", summary: "One question is still open." }] }],
    doneCondition: "complete", independentClosure: "independent",
  })
  const { input, outcome } = buildPair(fixtures.pairScenarios[1])
  const args = { formationResult, comparisonInput: input, groupingOutcomeResult: outcome as never }
  const first = okResult(args)
  const second = okResult(args)
  assert.deepEqual(second, first)
  assert.equal(JSON.stringify(second), JSON.stringify(first))
  assert.notEqual(second, first)
  assert.notEqual(second.factors, first.factors)
  assert.notEqual(second.reasonCodes, first.reasonCodes)
  assert.notEqual(second.narrative, first.narrative)
  assert.notEqual(second.pairGroupingContext, first.pairGroupingContext)
  // Mutating a returned prediction cannot affect the next one.
  ;(second.factors as Record<string, unknown>).actor = "unknown"
  assert.deepEqual(okResult(args).factors, first.factors)
  assertBoundedSafeOutput(first)
})

test("the F5 module imports only validated formation boundaries and no time or randomness source (mutations S17, S18)", () => {
  const modulePath = fileURLToPath(new URL("../app/lib/application/formation/statePrediction.ts", import.meta.url))
  const source = readFileSync(modulePath, "utf8")
  const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort()
  assert.deepEqual(specifiers, [
    "./goalDoneConditionAdapter.ts",
    "./sourceContract.ts",
    "./statePredictionTypes.ts",
    "./states.ts",
    "./workUnitFormationAggregate.ts",
  ])
  for (const forbidden of [/\bfetch\s*\(/, /\bDate\.now\b/, /\bMath\.random\b/, /orchestrator/i, /\bmodel\b/i]) {
    assert.ok(!forbidden.test(source), `F5 must not contain ${forbidden}`)
  }
})
