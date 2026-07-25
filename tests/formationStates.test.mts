/**
 * F4 — Candidate-only formation state mappings — permanent tests.
 *
 * Every subject is compiled through the REAL public boundaries
 * (`buildFormationSourceCandidate` → `buildFormationGoalDoneConditionCandidate`
 * → `buildWorkUnitFormationCandidate`) and every grouping verdict through the
 * REAL `compareGroupingSubjects`, so each `formationResult` / `comparisonResult`
 * is a genuinely ATTESTED object — never a clone. The subject-state and
 * grouping-outcome counterexamples in `fixtures/formation/states/scenarios.json`
 * are permanent data; the attestation, pair-substitution, precedence,
 * forbidden-promotion, leakage, and determinism probes are pinned inline.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  buildFormationSourceCandidate,
  type FormationSourceContractResult,
  type FormationSourceCandidate,
} from "../app/lib/application/formation/sourceContract.ts"
import { buildFormationGoalDoneConditionCandidate } from "../app/lib/application/formation/goalDoneConditionAdapter.ts"
import { buildWorkUnitFormationCandidate } from "../app/lib/application/formation/workUnitFormationAggregate.ts"
import {
  attestValidatedGroupingComparison,
  attestedGroupingPairTokenMatches,
  compareGroupingSubjects,
} from "../app/lib/application/formation/grouping.ts"
import type {
  GroupingComparisonInput,
  GroupingSubjectInput,
  SuccessfulWorkUnitFormationResult,
} from "../app/lib/application/formation/groupingTypes.ts"
import {
  FORMATION_STATES,
  RESERVED_FORMATION_STATES,
  F4_EMITTABLE_STATES,
  FORMATION_PAIR_SIDES,
  mapFormationSubjectState,
  mapFormationGroupingOutcome,
  snapshotValidatedFormationGroupingOutcomeResult,
  type FormationGroupingOutcomeResult,
} from "../app/lib/application/formation/states.ts"

type OkSource = Extract<FormationSourceContractResult, { ok: true }>

// ─── Real subject builders (genuine attestation) ─────────────────────────────

const CAPTURED_AT = "2026-07-19T00:00:00Z"

type SourceSpec = {
  provider: string
  sourceObjectId: string
  externalId: string
  occurredAt: string
  container?: string
  actors?: readonly string[]
  deadline?: string
  referencedObjects?: readonly { provider: string; sourceObjectId: string }[]
  title?: string
  summary?: string
}

function buildSource(spec: SourceSpec): OkSource {
  const url = `https://example.com/${spec.provider}/${encodeURIComponent(spec.externalId)}`
  const json = {
    provider: spec.provider,
    sourceRef: {
      source: spec.provider,
      externalId: spec.externalId,
      url,
      capturedAt: CAPTURED_AT,
      ...(spec.container !== undefined ? { container: spec.container } : {}),
    },
    sourceObjectId: spec.sourceObjectId,
    title: spec.title ?? `Item ${spec.externalId}`,
    sanitizedSummary: spec.summary ?? `Summary for ${spec.externalId}`,
    actorAssertions: (spec.actors ?? []).map((name) => ({ name, assertedRelation: "author" })),
    timestamps: { occurredAt: spec.occurredAt, capturedAt: CAPTURED_AT },
    ...(spec.deadline !== undefined ? { explicitDeadline: { value: spec.deadline, inferred: false } } : {}),
    sourceLinks: [{ url }],
    referencedObjects: spec.referencedObjects ?? [],
    navigationTarget: url,
  }
  const result = buildFormationSourceCandidate(JSON.stringify(json))
  if (!result.ok) throw new Error(`F1A fixture rejected (${spec.externalId}): ${JSON.stringify(result.findings)}`)
  return result
}

// ─── Grouping-subject builder (F3 comparison subjects) ───────────────────────

type SubjectSpec = {
  sources: readonly SourceSpec[]
  goal?: Record<string, string>
  acceptanceCriteria?: readonly string[]
  independentClosure?: "independent" | "parent_bounded" | "unknown"
  canonicalWorkObjectRef?: { provider: string; sourceObjectId: string }
}

function buildGroupingSubject(spec: SubjectSpec): GroupingSubjectInput {
  const results = spec.sources.map(buildSource)
  const candidates: FormationSourceCandidate[] = results.map((r) => r.candidate)
  const gdc = buildFormationGoalDoneConditionCandidate({
    goal: (spec.goal ?? {}) as never,
    doneCondition: {
      outcome: "Placeholder done outcome",
      verifier: "human_owner",
      acceptanceCriteria: spec.acceptanceCriteria ?? [],
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
  return {
    formationResult: f1c as SuccessfulWorkUnitFormationResult,
    ...(spec.canonicalWorkObjectRef !== undefined
      ? { canonicalWorkObjectRef: spec.canonicalWorkObjectRef as never }
      : {}),
  }
}

// ─── Subject-state builder (F1B/F1C subject) ─────────────────────────────────

const ALL_GOAL_FIELDS: Record<string, string> = {
  outcome: "Ship the reviewed widget",
  workObject: "widget",
  decisionNeeded: "whether to ship",
  scope: "the widget module",
  verifier: "human_owner",
  timeHorizon: "this quarter",
}

type SubjectStateSpec = {
  goalFields: "all" | "missing_timeHorizon"
  doneCondition: "complete" | "partial" | "invalid"
  independentClosure: "independent" | "parent_bounded" | "unknown"
  nonMemberEvidenceRef?: boolean
}

function buildSubjectStateInput(spec: SubjectStateSpec): SuccessfulWorkUnitFormationResult {
  const source = buildSource({
    provider: "github",
    sourceObjectId: "org/repo#state",
    externalId: "pr-state",
    occurredAt: "2026-01-01T00:00:00Z",
  })
  const goal: Record<string, string> = { ...ALL_GOAL_FIELDS }
  if (spec.goalFields === "missing_timeHorizon") delete goal.timeHorizon

  const doneCondition =
    spec.doneCondition === "complete"
      ? { outcome: "Ship the reviewed widget", verifier: "human_owner", acceptanceCriteria: ["A human reviewer can verify the outcome."], humanInputRef: "human:reviewer" }
      : spec.doneCondition === "partial"
        ? { outcome: "Ship the reviewed widget", verifier: "human_owner", acceptanceCriteria: [], humanInputRef: "human:reviewer" }
        : { outcome: "Ship the reviewed widget", verifier: "ai", acceptanceCriteria: ["A human reviewer can verify the outcome."], humanInputRef: "human:reviewer" }

  const gdc = buildFormationGoalDoneConditionCandidate({
    goal: goal as never,
    doneCondition: {
      ...doneCondition,
      missingFields: [],
      status: "partial",
      invalidReasons: [],
      riskFlags: [],
      candidateOnly: true,
    },
    // A non-member evidence ref is DROPPED by F1B (recording a value-free
    // evidence_membership_mismatch issue), so F1C still succeeds while the
    // adapter issue survives on the bound gdc.
    ...(spec.nonMemberEvidenceRef
      ? { evidenceRefs: [{ source: "github", externalId: "not-a-member", capturedAt: CAPTURED_AT }] as never }
      : {}),
    independentClosure: spec.independentClosure,
    validatedSources: [source.candidate],
  })
  const f1c = buildWorkUnitFormationCandidate({
    members: [{ sourceResult: source, role: "evidence" }],
    goalDoneCondition: gdc,
  } as never)
  if (!f1c.ok) throw new Error(`subject-state F1C build failed: ${JSON.stringify(f1c)}`)
  return f1c as SuccessfulWorkUnitFormationResult
}

// ─── Recursive output inspection helpers ─────────────────────────────────────

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === "string") into.push(value)
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, into)
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, into)
}

function collectStringsOf(value: unknown): string[] {
  const out: string[] = []
  collectStrings(value, out)
  return out
}

function collectKeys(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) for (const v of value) collectKeys(v, into)
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k)
      collectKeys(v, into)
    }
  }
}

// Fields that must NEVER appear anywhere in an F4 output (Section 16).
const FORBIDDEN_OUTPUT_KEYS = [
  "merged", "grouped", "membership", "membersAfter", "memberToAdd", "memberToRemove",
  "finalizedSplit", "formalized", "approved", "executed", "approval", "execution",
  "persistence", "statePrediction", "ranking", "roi", "whyNow", "primarySource",
  "sourceRole", "SourceRole", "conflict", "formalNodeCandidate", "FormalNodeCandidate",
  // Unbound global candidate references — removed by the pair-binding remediation.
  "leftCandidateId", "rightCandidateId", "mergeTargetCandidateId",
  "targetNodeCandidateId", "sourceCandidateId", "candidateId",
]

function assertNoForbiddenSurface(result: unknown): void {
  const keys = new Set<string>()
  collectKeys(result, keys)
  for (const key of FORBIDDEN_OUTPUT_KEYS) assert.ok(!keys.has(key), `unexpected forbidden output key: ${key}`)
}

// ─── Formation-state vocabulary (Section 7; fixture 9) ───────────────────────

test("formation-state vocabulary is the exact closed set; conflict is reserved, never emittable", () => {
  assert.deepEqual([...FORMATION_STATES], [
    "formal_candidate", "clarification_needed", "context_only",
    "merge_candidate", "split_candidate", "conflict",
  ])
  // `conflict` is part of the shared vocabulary...
  assert.ok(FORMATION_STATES.includes("conflict"))
  assert.deepEqual([...RESERVED_FORMATION_STATES], ["conflict"])
  // ...but F4 may never emit it.
  assert.ok(!F4_EMITTABLE_STATES.includes("conflict" as never))
  assert.deepEqual([...F4_EMITTABLE_STATES], [
    "formal_candidate", "clarification_needed", "context_only",
    "merge_candidate", "split_candidate",
  ])
  // F3 verdicts are NOT formation states.
  for (const verdict of ["possible_match", "strong_match", "must_split"]) {
    assert.ok(!FORMATION_STATES.includes(verdict as never), `${verdict} is an F3 verdict, not a formation state`)
  }
})

// ─── Subject-state mapping + precedence (fixtures 1–8; Section 9) ─────────────

const scenariosPath = fileURLToPath(new URL("./fixtures/formation/states/scenarios.json", import.meta.url))
const scenarioDoc = JSON.parse(readFileSync(scenariosPath, "utf8")) as {
  subjectScenarios: (SubjectStateSpec & { name: string; expectState: string; expectReasonKinds: string[] })[]
  groupingScenarios: (SubjectSpec extends never ? never : {
    name: string
    left: SubjectSpec
    right: SubjectSpec
    mergeTargetSide?: "left" | "right"
    expectVerdict: string
    expectGroupingOutcome: string
    expectState: string | null
    expectProposalStrength?: string
    expectTargetSide?: "left" | "right"
    expectSourceSide?: "left" | "right"
  })[]
}

for (const scenario of scenarioDoc.subjectScenarios) {
  test(`subject-state ${scenario.name}`, () => {
    const formationResult = buildSubjectStateInput(scenario)
    const r = mapFormationSubjectState({ formationResult })
    assert.equal(r.ok, true, `expected ok for ${scenario.name}`)
    if (!r.ok) return
    assert.equal(r.state, scenario.expectState, `state mismatch for ${scenario.name}`)
    for (const kind of scenario.expectReasonKinds) {
      assert.ok(r.reasonKinds.includes(kind as never), `expected reason kind ${kind} for ${scenario.name}; got ${r.reasonKinds}`)
    }
    // A partial/invalid subject is NEVER formal_candidate; a parent_bounded
    // subject is NEVER formal_candidate; an unknown closure is NEVER
    // formal_candidate or context_only.
    if (scenario.doneCondition !== "complete") assert.notEqual(r.state, "formal_candidate")
    if (scenario.independentClosure === "parent_bounded") assert.notEqual(r.state, "formal_candidate")
    if (scenario.independentClosure === "unknown") {
      assert.notEqual(r.state, "formal_candidate")
      assert.notEqual(r.state, "context_only")
    }
    // Safety literals and clean surface.
    assert.equal(r.candidateOnly, true)
    assert.equal(r.humanReviewRequired, true)
    assertNoForbiddenSurface(r)
    // formal_candidate is a STATE LABEL only — no FormalNodeCandidate is built.
    const keys = new Set<string>()
    collectKeys(r, keys)
    assert.ok(!keys.has("doneCondition"), "subject-state must not surface a Done Condition draft")
    assert.ok(!keys.has("target"))
  })
}

test("subject-state rejects a cloned / forged / bare / failed F1C result (fixtures 16, 17)", () => {
  const good = buildSubjectStateInput({ goalFields: "all", doneCondition: "complete", independentClosure: "independent" })
  const bads: unknown[] = [
    JSON.parse(JSON.stringify(good)),
    { ...good },
    structuredClone(good),
    (good as { candidate?: unknown }).candidate,
    { ok: true, candidateOnly: true, candidate: { members: [], goalDoneCondition: {}, humanReviewRequired: true, candidateOnly: true } },
    buildWorkUnitFormationCandidate({ members: [], goalDoneCondition: {} } as never),
  ]
  for (const bad of bads) {
    const r = mapFormationSubjectState({ formationResult: bad as never })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "subject_not_validated")
  }
})

test("subject-state reads canonical Done Condition read-only and never mutates the input F1C (fixture 29)", () => {
  const formationResult = buildSubjectStateInput({ goalFields: "all", doneCondition: "complete", independentClosure: "independent" })
  const before = JSON.parse(JSON.stringify(formationResult))
  const first = mapFormationSubjectState({ formationResult })
  assert.deepEqual(JSON.parse(JSON.stringify(formationResult)), before, "input F1C must be untouched")
  assert.ok(first.ok && first.state === "formal_candidate")

  // Mutating the PUBLIC result after mapping cannot change a fresh mapping,
  // because F4 reads only the detached attested snapshot.
  ;(formationResult.candidate.goalDoneCondition.doneCondition as { status?: string }).status = "invalid"
  const second = mapFormationSubjectState({ formationResult })
  assert.ok(second.ok && second.state === "formal_candidate", "mutation of the public result must not change the mapping")
})

test("subject-state is deterministic: identical input → deeply equal output (fixture 30)", () => {
  const formationResult = buildSubjectStateInput({ goalFields: "all", doneCondition: "partial", independentClosure: "independent" })
  const a = mapFormationSubjectState({ formationResult })
  const b = mapFormationSubjectState({ formationResult })
  assert.deepEqual(a, b)
})

// ─── Grouping-outcome mapping (fixtures 10–14; Section 12) ───────────────────

function attestedComparison(left: SubjectSpec, right: SubjectSpec): {
  comparisonInput: GroupingComparisonInput
  comparisonResult: ReturnType<typeof compareGroupingSubjects>
} {
  const comparisonInput = { left: buildGroupingSubject(left), right: buildGroupingSubject(right) }
  const comparisonResult = compareGroupingSubjects(comparisonInput)
  return { comparisonInput, comparisonResult }
}

for (const scenario of scenarioDoc.groupingScenarios) {
  test(`grouping-outcome ${scenario.name}`, () => {
    const { comparisonInput, comparisonResult } = attestedComparison(scenario.left, scenario.right)
    assert.equal(comparisonResult.ok, true)
    if (!comparisonResult.ok) return
    assert.equal(comparisonResult.verdict, scenario.expectVerdict, `precondition F3 verdict for ${scenario.name}`)

    const r = mapFormationGroupingOutcome({
      comparisonInput,
      comparisonResult,
      ...(scenario.mergeTargetSide !== undefined ? { mergeTargetSide: scenario.mergeTargetSide } : {}),
    })
    assert.equal(r.ok, true, `expected ok for ${scenario.name}`)
    if (!r.ok) return

    assert.equal(r.groupingOutcome, scenario.expectGroupingOutcome)
    assert.equal(r.state, scenario.expectState)
    assert.equal(r.candidateOnly, true)
    assert.equal(r.humanReviewRequired, true)
    assertNoForbiddenSurface(r)

    if (r.groupingOutcome === "merge_candidate") {
      assert.equal(r.proposalStrength, scenario.expectProposalStrength)
      // A merge candidate (strong OR possible) is NEVER default-grouped.
      assert.equal(r.defaultGrouped, false)
      assert.equal(r.mergeCandidate.target, "merge_candidate")
      // Pair-relative identity only: target side is what was asked for, source
      // side is the deterministic opposite. No global candidate id exists.
      assert.equal(r.mergeCandidate.targetSide, scenario.expectTargetSide)
      assert.equal(r.mergeCandidate.sourceSide, scenario.expectSourceSide)
      assert.notEqual(r.mergeCandidate.targetSide, r.mergeCandidate.sourceSide)
      assert.equal(r.mergeCandidate.humanReviewRequired, true)
      assert.equal(r.mergeCandidate.candidateOnly, true)
      // possible → carries the closed uncertainty flag; strong → none.
      if (r.proposalStrength === "possible") assert.deepEqual(r.mergeCandidate.riskFlags, ["possible_match_uncertain"])
      else assert.deepEqual(r.mergeCandidate.riskFlags, [])
      // Forbidden-promotion proof present.
      assert.ok(r.forbiddenPromotionReasons.includes("merge_candidate_to_merged"))
      assert.ok(r.forbiddenPromotionReasons.length > 0)
    } else if (r.groupingOutcome === "split_candidate") {
      assert.equal(r.splitCandidate.target, "split_candidate")
      // The proposal is bound to exactly the two attested sides.
      assert.deepEqual([...r.splitCandidate.pairSides], ["left", "right"])
      assert.equal(r.splitCandidate.proposedParts.length, 2)
      assert.deepEqual(r.splitCandidate.proposedParts.map((p) => p.title), ["Goal candidate A", "Goal candidate B"])
      assert.equal(r.splitCandidate.humanReviewRequired, true)
      assert.equal(r.splitCandidate.candidateOnly, true)
      // Forbidden-promotion proof present.
      assert.ok(r.forbiddenPromotionReasons.includes("split_candidate_to_finalized_split"))
      assert.ok(r.forbiddenPromotionReasons.length > 0)
    } else {
      // insufficient — no merge / split candidate is created.
      assert.equal(r.groupingOutcome, "none")
      assert.equal(r.basisVerdict, "insufficient")
      const keys = new Set<string>()
      collectKeys(r, keys)
      assert.ok(!keys.has("mergeCandidate"))
      assert.ok(!keys.has("splitCandidate"))
    }

    // Reason bounds.
    const strings: string[] = []
    collectStrings(r, strings)
    for (const s of strings) assert.ok(s.length <= 200, `reason exceeds bound: ${s}`)
  })
}

// ─── Counterexample 8 (fixtures 15; Section 14) ──────────────────────────────

test("counterexample 8: one source object → two independently-closable Goals, hard split → split_candidate", () => {
  const MARKER = "CE8GOALMARKERZZZ"
  // Both subjects share the SAME provider source object (#CE8) — an exact
  // provider-object hard positive — but resolve to DIFFERENT canonical work
  // objects (a deterministic different_work_object hard split). The hard split
  // is final, so the verdict is must_split even with the shared object.
  const left: SubjectSpec = {
    sources: [{ provider: "github", sourceObjectId: "org/repo#CE8", externalId: "pr-ce8L", occurredAt: "2020-01-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: "org/wa#CE8-A" }] }],
    goal: { outcome: `${MARKER}-left`, workObject: `${MARKER}-wa-left` },
    canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/wa#CE8-A" },
    independentClosure: "independent",
  }
  const right: SubjectSpec = {
    sources: [{ provider: "github", sourceObjectId: "org/repo#CE8", externalId: "pr-ce8R", occurredAt: "2026-01-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: "org/wa#CE8-B" }] }],
    goal: { outcome: `${MARKER}-right`, workObject: `${MARKER}-wa-right` },
    canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/wa#CE8-B" },
    independentClosure: "independent",
  }
  const { comparisonInput, comparisonResult } = attestedComparison(left, right)
  assert.equal(comparisonResult.ok, true)
  if (!comparisonResult.ok) return
  assert.equal(comparisonResult.verdict, "must_split")

  const r = mapFormationGroupingOutcome({ comparisonInput, comparisonResult })
  assert.ok(r.ok && r.groupingOutcome === "split_candidate")
  if (!r.ok || r.groupingOutcome !== "split_candidate") return
  assert.equal(r.state, "split_candidate")
  assert.equal(r.splitCandidate.proposedParts.length, 2)
  assert.equal(r.humanReviewRequired, true)
  assert.equal(r.candidateOnly, true)
  assert.ok(r.forbiddenPromotionReasons.includes("split_candidate_to_finalized_split"))

  // No finalized split, no new member aggregate, no SourceRole rewrite.
  assertNoForbiddenSurface(r)
  // No raw Goal text (or the source object id) leaks into titles / reasons.
  const strings: string[] = []
  collectStrings(r, strings)
  for (const s of strings) {
    assert.ok(!s.includes(MARKER), `split candidate leaked raw Goal text: ${s}`)
    assert.ok(!s.includes("org/repo#CE8"), `split candidate leaked raw source object id: ${s}`)
  }
})

// ─── F3 runtime provenance (fixtures 18–21; Section 6) ───────────────────────

test("grouping-outcome rejects forged / cloned F3 results and cloned inputs (fixtures 18, 19, 20)", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok)
  const base = { mergeTargetSide: "left" as const }

  // Exact result + exact input attests (control).
  const ok = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, ...base })
  assert.ok(ok.ok)

  // Forged / cloned results do not attest.
  const forgedResults: unknown[] = [
    { ...comparisonResult },
    JSON.parse(JSON.stringify(comparisonResult)),
    structuredClone(comparisonResult),
    { ok: true, candidateOnly: true, humanReviewRequired: true, hardSplit: [], hardPositive: [], weakSupport: [], verdict: "strong_match", reasons: [] },
  ]
  for (const forged of forgedResults) {
    const r = mapFormationGroupingOutcome({ comparisonInput, comparisonResult: forged as never, ...base })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "grouping_not_validated")
  }

  // Exact result + CLONED input does not attest (identity, not shape).
  for (const clonedInput of [{ ...comparisonInput }, structuredClone(comparisonInput)] as unknown[]) {
    const r = mapFormationGroupingOutcome({ comparisonInput: clonedInput as never, comparisonResult, ...base })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "grouping_not_validated")
  }
})

test("grouping-outcome rejects a failed F3 comparison result (fixtures 18)", () => {
  // A comparison over an unattested subject fails closed.
  const failed = compareGroupingSubjects({ left: { formationResult: {} as never }, right: buildGroupingSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#f", externalId: "pr-f", occurredAt: "2026-01-01T00:00:00Z" }] }) })
  assert.equal(failed.ok, false)
  const r = mapFormationGroupingOutcome({ comparisonInput: {} as never, comparisonResult: failed as never })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "grouping_not_validated")
})

test("pair-A result cannot be applied to pair-B input (fixture 21)", () => {
  const a = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#PA1", externalId: "pr-pa1", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#PA1", externalId: "pr-pa2", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  const b = attestedComparison(
    { sources: [{ provider: "slack", sourceObjectId: "T/C/PB", externalId: "msg-pb1", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "slack", sourceObjectId: "T/C/PB", externalId: "msg-pb2", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(a.comparisonResult.ok && b.comparisonResult.ok)
  // Real pair-A result with pair-B input → rejected.
  const r1 = mapFormationGroupingOutcome({ comparisonInput: b.comparisonInput, comparisonResult: a.comparisonResult, mergeTargetSide: "left" })
  assert.equal(r1.ok, false)
  if (!r1.ok) assert.equal(r1.reason, "grouping_not_validated")
  // Real pair-B result with pair-A input → rejected.
  const r2 = mapFormationGroupingOutcome({ comparisonInput: a.comparisonInput, comparisonResult: b.comparisonResult, mergeTargetSide: "left" })
  assert.equal(r2.ok, false)
  if (!r2.ok) assert.equal(r2.reason, "grouping_not_validated")
  // Each result still attests with its OWN input (control).
  assert.ok(mapFormationGroupingOutcome({ comparisonInput: a.comparisonInput, comparisonResult: a.comparisonResult, mergeTargetSide: "left" }).ok)
})

test("mutating the public F3 result or input after attestation does not change the detached snapshot", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#MU", externalId: "pr-mua", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#MU", externalId: "pr-mub", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok)
  if (!comparisonResult.ok) return
  const base = { comparisonInput, comparisonResult, mergeTargetSide: "left" as const }
  const first = mapFormationGroupingOutcome(base)
  assert.ok(first.ok && first.groupingOutcome === "merge_candidate")
  // Forge the public verdict post-attestation.
  ;(comparisonResult as { verdict?: string }).verdict = "must_split"
  const second = mapFormationGroupingOutcome(base)
  assert.ok(second.ok && second.groupingOutcome === "merge_candidate", "verdict must come from the detached snapshot, not the mutated public result")
})

// ─── Pair-side vocabulary and validation (Sections 5, 6) ─────────────────────

test("pair-side vocabulary is the exact closed set", () => {
  assert.deepEqual([...FORMATION_PAIR_SIDES], ["left", "right"])
})

test("legacy unbound candidate ids fail CLOSED and are never honored (regression 1, 10)", () => {
  // THE REMEDIATED BLOCKER. A genuine attested A/B strong_match must never be
  // relabeled through free-form ids to target unrelated candidates C/D.
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok && comparisonResult.verdict === "strong_match")

  const legacyAttempts: Record<string, unknown>[] = [
    // The exact historical relabel attack.
    { leftCandidateId: "candidate-C", rightCandidateId: "candidate-D", mergeTargetCandidateId: "candidate-C" },
    // Any single legacy field is enough to fail closed.
    { leftCandidateId: "candidate-C" },
    { rightCandidateId: "candidate-D" },
    { mergeTargetCandidateId: "candidate-C" },
    // Legacy ids alongside a valid side must NOT be silently honored or ignored.
    { mergeTargetSide: "left", leftCandidateId: "candidate-C", rightCandidateId: "candidate-D" },
    // Tenant / provider / URL-shaped values are equally refused.
    { leftCandidateId: "tenant-42:user-7", rightCandidateId: "github:org:repo" },
    // Even an explicitly undefined legacy key is a stale-caller signal.
    { leftCandidateId: undefined },
  ]
  for (const attempt of legacyAttempts) {
    const r = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, ...attempt } as never)
    assert.equal(r.ok, false, `legacy attempt must reject: ${JSON.stringify(Object.keys(attempt))}`)
    if (!r.ok) assert.equal(r.reason, "unbound_candidate_reference_supplied")
    // The rejection is value-free — no supplied id is echoed back.
    assert.ok(!JSON.stringify(r).includes("candidate-C"))
    assert.ok(!JSON.stringify(r).includes("candidate-D"))
    assert.ok(!JSON.stringify(r).includes("tenant-42"))
  }
})

test("merge target side: required for strong/possible, and closed to the pair (regressions 7, 8)", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok)
  const call = (over: Record<string, unknown>): FormationGroupingOutcomeResult =>
    mapFormationGroupingOutcome({ comparisonInput, comparisonResult, ...over } as never)

  // Missing target side for a merge verdict (regression 8).
  const missing = call({})
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.equal(missing.reason, "merge_target_side_required")

  // Unknown / empty / id-shaped / provider-shaped / tenant-shaped sides (regression 7).
  for (const bad of ["", " ", "middle", "LEFT", "candidate-C", "github:org/repo", "tenant-42", 0 as never, null as never, {} as never]) {
    const r = call({ mergeTargetSide: bad })
    assert.equal(r.ok, false, `side ${JSON.stringify(bad)} must reject`)
    if (!r.ok) assert.equal(r.reason, "merge_target_side_invalid")
    assert.ok(!JSON.stringify(r).includes("candidate-C"))
  }
})

test("merge target side maps deterministically to target/source sides (regressions 2, 3)", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok)
  const left = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, mergeTargetSide: "left" })
  assert.ok(left.ok && left.groupingOutcome === "merge_candidate")
  if (left.ok && left.groupingOutcome === "merge_candidate") {
    assert.equal(left.mergeCandidate.targetSide, "left")
    assert.equal(left.mergeCandidate.sourceSide, "right")
  }
  const right = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, mergeTargetSide: "right" })
  assert.ok(right.ok && right.groupingOutcome === "merge_candidate")
  if (right.ok && right.groupingOutcome === "merge_candidate") {
    assert.equal(right.mergeCandidate.targetSide, "right")
    assert.equal(right.mergeCandidate.sourceSide, "left")
  }
})

test("no global candidate identifier appears anywhere in any F4 output (regression 9)", () => {
  const strong = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  const split = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#1", externalId: "pr-1", occurredAt: "2020-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#1" } },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#2", externalId: "pr-2", occurredAt: "2026-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#2" } },
  )
  const insufficient = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#40", externalId: "pr-40", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#41", externalId: "pr-41", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(strong.comparisonResult.ok && split.comparisonResult.ok && insufficient.comparisonResult.ok)
  const outputs = [
    mapFormationGroupingOutcome({ comparisonInput: strong.comparisonInput, comparisonResult: strong.comparisonResult as never, mergeTargetSide: "left" }),
    mapFormationGroupingOutcome({ comparisonInput: split.comparisonInput, comparisonResult: split.comparisonResult as never }),
    mapFormationGroupingOutcome({ comparisonInput: insufficient.comparisonInput, comparisonResult: insufficient.comparisonResult as never }),
  ]
  for (const out of outputs) {
    assert.ok(out.ok)
    assertNoForbiddenSurface(out)
    // Every string in the output is a closed template or a pair side — never an id.
    for (const s of collectStringsOf(out)) {
      assert.ok(!/^cand|candidate-[A-Z]|tenant|^gh:|^github:/.test(s), `output carries an id-shaped value: ${s}`)
    }
  }
})

// ─── possible_match cannot auto-group (fixture 27; Section 12.C) ──────────────

test("possible_match maps to a NON-default-grouped possible proposal (never strong, never grouped)", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#60", externalId: "pr-60", occurredAt: "2020-01-01T00:00:00Z", actors: ["Kaneko"], container: "shared-space", deadline: "2026-08-01T00:00:00Z" }] },
    { sources: [{ provider: "slack", sourceObjectId: "T1/C1/60", externalId: "msg-60", occurredAt: "2026-01-01T00:00:00Z", actors: ["Kaneko"], container: "shared-space", deadline: "2026-08-02T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok && comparisonResult.verdict === "possible_match")
  const r = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, mergeTargetSide: "right" })
  assert.ok(r.ok && r.groupingOutcome === "merge_candidate")
  if (!r.ok || r.groupingOutcome !== "merge_candidate") return
  assert.equal(r.proposalStrength, "possible")
  assert.notEqual(r.proposalStrength, "strong")
  assert.equal(r.defaultGrouped, false)
  assert.deepEqual(r.mergeCandidate.riskFlags, ["possible_match_uncertain"])
})

// ─── Forbidden-promotion proof (fixtures 25, 26; Section 13) ──────────────────

test("merge and split candidates each carry a non-empty forbidden-promotion proof", () => {
  const strong = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(strong.comparisonResult.ok)
  const merge = mapFormationGroupingOutcome({ comparisonInput: strong.comparisonInput, comparisonResult: strong.comparisonResult, mergeTargetSide: "left" })
  assert.ok(merge.ok && merge.groupingOutcome === "merge_candidate")
  if (merge.ok && merge.groupingOutcome === "merge_candidate") {
    assert.ok(merge.forbiddenPromotionReasons.length > 0)
    assert.ok(merge.forbiddenPromotionReasons.includes("merge_candidate_to_merged"))
  }

  const split = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#1", externalId: "pr-1", occurredAt: "2020-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#1" } },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#2", externalId: "pr-2", occurredAt: "2026-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#2" } },
  )
  assert.ok(split.comparisonResult.ok)
  const splitOut = mapFormationGroupingOutcome({ comparisonInput: split.comparisonInput, comparisonResult: split.comparisonResult })
  assert.ok(splitOut.ok && splitOut.groupingOutcome === "split_candidate")
  if (splitOut.ok && splitOut.groupingOutcome === "split_candidate") {
    assert.ok(splitOut.forbiddenPromotionReasons.length > 0)
    assert.ok(splitOut.forbiddenPromotionReasons.includes("split_candidate_to_finalized_split"))
  }
})

// ─── conflict is never emitted by F4 (fixture 9; Section 12.E) ────────────────

test("no F4 mapping over any verdict ever emits the reserved conflict state", () => {
  const specs: [SubjectSpec, SubjectSpec, "left" | "right" | undefined][] = [
    [{ sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] }, { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] }, "left"],
    [{ sources: [{ provider: "github", sourceObjectId: "org/repo#40", externalId: "pr-40", occurredAt: "2020-01-01T00:00:00Z" }] }, { sources: [{ provider: "github", sourceObjectId: "org/repo#41", externalId: "pr-41", occurredAt: "2026-01-01T00:00:00Z" }] }, undefined],
    [{ sources: [{ provider: "github", sourceObjectId: "org/repo#1", externalId: "pr-1", occurredAt: "2020-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#1" } }, { sources: [{ provider: "github", sourceObjectId: "org/repo#2", externalId: "pr-2", occurredAt: "2026-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#2" } }, undefined],
  ]
  for (const [left, right, target] of specs) {
    const { comparisonInput, comparisonResult } = attestedComparison(left, right)
    assert.ok(comparisonResult.ok)
    const r = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, ...(target ? { mergeTargetSide: target } : {}) })
    assert.ok(r.ok)
    if (!r.ok) continue
    assert.notEqual(r.state, "conflict")
    const strings: string[] = []
    collectStrings(r, strings)
    assert.ok(!strings.includes("conflict"), "F4 output must not carry a conflict finding")
  }
})

// ─── F4 outcome runtime provenance (Section 9; regressions 11, 12, 13) ───────

test("F4 outcome attestation: exact result + exact input attests; clones/forgeries/wrappers do not", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok)
  const outcome = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, mergeTargetSide: "left" })
  assert.ok(outcome.ok)

  // Exact result + exact original comparison input attests.
  const snap = snapshotValidatedFormationGroupingOutcomeResult(outcome, comparisonInput)
  assert.notEqual(snap, null)
  assert.equal(snap?.groupingOutcome, "merge_candidate")

  // Failed F4 result does not attest.
  const failed = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, mergeTargetSide: "middle" as never })
  assert.equal(failed.ok, false)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(failed, comparisonInput), null)

  // Bare payload / spread / JSON / structuredClone / forged / Proxy / Object.create.
  const bads: unknown[] = [
    outcome.ok && outcome.groupingOutcome === "merge_candidate" ? outcome.mergeCandidate : {},
    { ...outcome },
    JSON.parse(JSON.stringify(outcome)),
    structuredClone(outcome),
    { ok: true, candidateOnly: true, humanReviewRequired: true, state: "merge_candidate", groupingOutcome: "merge_candidate", basisVerdict: "strong_match", proposalStrength: "strong", defaultGrouped: false, mergeCandidate: {}, forbiddenPromotionReasons: [] },
    new Proxy(outcome as object, {}),
    Object.create(outcome as object),
  ]
  for (const bad of bads) {
    assert.equal(snapshotValidatedFormationGroupingOutcomeResult(bad, comparisonInput), null)
  }

  // Exact result + cloned / different input does not attest (identity, not shape).
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, { ...comparisonInput }), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, structuredClone(comparisonInput)), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, { left: comparisonInput.left, right: comparisonInput.right }), null)

  // Repeated snapshots are deeply equal but never alias; public mutation cannot
  // reach the private snapshot; snapshot mutation cannot reach a later snapshot.
  const s1 = snapshotValidatedFormationGroupingOutcomeResult(outcome, comparisonInput)
  const s2 = snapshotValidatedFormationGroupingOutcomeResult(outcome, comparisonInput)
  assert.notEqual(s1, s2)
  assert.deepEqual(s1, s2)
  ;(s1 as { state?: string }).state = "TAMPERED"
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, comparisonInput)?.state, "merge_candidate")
  ;(outcome as { state?: string }).state = "TAMPERED"
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, comparisonInput)?.state, "merge_candidate")
})

test("split pair traceability: identical split proposals are distinguished by provenance (Section 10; regression 14)", () => {
  // Two DIFFERENT genuine must_split comparisons whose closed proposals are
  // byte-identical — pair identity therefore cannot come from the payload.
  const a = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#1", externalId: "pr-1", occurredAt: "2020-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#1" } },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#2", externalId: "pr-2", occurredAt: "2026-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#2" } },
  )
  const b = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#3", externalId: "pr-3", occurredAt: "2020-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#3" } },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#4", externalId: "pr-4", occurredAt: "2026-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#4" } },
  )
  assert.ok(a.comparisonResult.ok && b.comparisonResult.ok)
  const outA = mapFormationGroupingOutcome({ comparisonInput: a.comparisonInput, comparisonResult: a.comparisonResult as never })
  const outB = mapFormationGroupingOutcome({ comparisonInput: b.comparisonInput, comparisonResult: b.comparisonResult as never })
  assert.ok(outA.ok && outB.ok)

  // The visible payloads really are indistinguishable...
  assert.deepEqual(JSON.parse(JSON.stringify(outA)), JSON.parse(JSON.stringify(outB)))

  // ...but runtime provenance separates them.
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(outA, a.comparisonInput), null)
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(outB, b.comparisonInput), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outA, b.comparisonInput), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outB, a.comparisonInput), null)
})

// ─── No LLM / network / provider-extraction / persistence surface in states.ts ─

test("states.ts imports no LLM / network / provider-extraction / persistence surface", () => {
  const path = fileURLToPath(new URL("../app/lib/application/formation/states.ts", import.meta.url))
  const src = readFileSync(path, "utf8")
  for (const banned of ["/extract/", "fetch(", "http://", "https://", "XMLHttpRequest", "WebSocket", "openai", "anthropic", "d1", "persist", "evaluateDoneConditionDraft", "buildFormationGoalDoneConditionCandidate"]) {
    assert.ok(!src.includes(banned), `states.ts must not reference ${banned}`)
  }
})

// ─── F4 ordered-pair binding (Section 7) ─────────────────────────────────────
//
// `comparisonInput` is a caller-owned MUTABLE object. Binding an outcome to its
// container identity alone let a caller replace or swap the pair after the
// outcome existed while attestation kept passing — which would silently
// re-point `targetSide` / `sourceSide` / `pairSides` at different candidates.
// F4 pins the ordered pair INDEPENDENTLY of F3.

type MutableOutcomePair = { left: GroupingSubjectInput; right: GroupingSubjectInput }

function outcomeSubject(tag: string, objectId: string, ref?: { provider: string; sourceObjectId: string }): GroupingSubjectInput {
  return buildGroupingSubject({
    sources: [{ provider: "github", sourceObjectId: objectId, externalId: `pr-${tag}`, occurredAt: "2026-01-01T00:00:00Z", ...(ref ? { referencedObjects: [ref] } : {}) }],
    goal: { outcome: `${tag} outcome`, workObject: `${tag} wa` },
    ...(ref ? { canonicalWorkObjectRef: ref } : {}),
  })
}

function strongPair(tag: string): MutableOutcomePair {
  return {
    left: outcomeSubject(`${tag}L`, `org/repo#${tag}`),
    right: outcomeSubject(`${tag}R`, `org/repo#${tag}`),
  }
}

test("F4 pair binding (R16): pair replaced BEFORE mapping → grouping_not_validated", () => {
  const input = strongPair("R16")
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok && comparisonResult.verdict === "strong_match")

  // Same container identity, entirely different pair.
  input.left = outcomeSubject("R16C", "org/other#R16C")
  input.right = outcomeSubject("R16D", "org/other#R16D")

  const out = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult, mergeTargetSide: "left" })
  assert.equal(out.ok, false, "an A/B verdict must not map over a C/D-populated container")
  if (out.ok) return
  assert.equal(out.reason, "grouping_not_validated")
  assert.equal(out.candidateOnly, true)
})

test("F4 pair binding (R17): pair replaced AFTER mapping → outcome attestation null", () => {
  const input = strongPair("R17")
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult, mergeTargetSide: "left" })
  assert.ok(outcome.ok)
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(outcome, input), null, "attests before mutation")

  input.left = outcomeSubject("R17C", "org/other#R17C")
  input.right = outcomeSubject("R17D", "org/other#R17D")
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, input), null)
})

test("F4 pair binding (R18): left/right swap → outcome attestation null", () => {
  const input = strongPair("R18")
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult, mergeTargetSide: "left" })
  assert.ok(outcome.ok && outcome.groupingOutcome === "merge_candidate")
  if (!outcome.ok || outcome.groupingOutcome !== "merge_candidate") return
  assert.equal(outcome.mergeCandidate.targetSide, "left")

  const tmp = input.left
  input.left = input.right
  input.right = tmp
  assert.equal(
    snapshotValidatedFormationGroupingOutcomeResult(outcome, input),
    null,
    "targetSide would otherwise silently denote the other candidate",
  )
})

test("F4 pair binding: replacing only the left formationResult → outcome attestation null", () => {
  const input = strongPair("FRL")
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult, mergeTargetSide: "left" })
  assert.ok(outcome.ok)

  const other = outcomeSubject("FRLZ", "org/other#FRLZ")
  ;(input.left as { formationResult: unknown }).formationResult = other.formationResult
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, input), null)
})

test("F4 pair binding: replacing only the right formationResult → outcome attestation null", () => {
  const input = strongPair("FRR")
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult, mergeTargetSide: "left" })
  assert.ok(outcome.ok)

  const other = outcomeSubject("FRRZ", "org/other#FRRZ")
  ;(input.right as { formationResult: unknown }).formationResult = other.formationResult
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, input), null)
})

test("F4 pair binding: canonical selector added, removed, or edited → outcome attestation null", () => {
  const REF = { provider: "github", sourceObjectId: "org/wa#F4SEL" }

  // Added after the outcome exists.
  const added = strongPair("SELA")
  const rAdded = compareGroupingSubjects(added)
  assert.ok(rAdded.ok)
  const oAdded = mapFormationGroupingOutcome({ comparisonInput: added, comparisonResult: rAdded, mergeTargetSide: "left" })
  assert.ok(oAdded.ok)
  ;(added.left as { canonicalWorkObjectRef?: unknown }).canonicalWorkObjectRef = { ...REF }
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(oAdded, added), null, "selector added must reject")

  // Present, then removed / edited.
  const withRef = {
    left: outcomeSubject("SELB", "org/repo#SELB", REF),
    right: outcomeSubject("SELC", "org/repo#SELB", REF),
  } as MutableOutcomePair
  const rRef = compareGroupingSubjects(withRef)
  assert.ok(rRef.ok)
  const oRef = mapFormationGroupingOutcome({ comparisonInput: withRef, comparisonResult: rRef, mergeTargetSide: "left" })
  assert.ok(oRef.ok)
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(oRef, withRef), null, "attests untouched")
  ;(withRef.left as { canonicalWorkObjectRef: { sourceObjectId: string } }).canonicalWorkObjectRef.sourceObjectId = "org/wa#OTHER"
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(oRef, withRef), null, "selector edit must reject")

  const removedRef = {
    left: outcomeSubject("SELD", "org/repo#SELD", REF),
    right: outcomeSubject("SELE", "org/repo#SELD", REF),
  } as MutableOutcomePair
  const rRem = compareGroupingSubjects(removedRef)
  assert.ok(rRem.ok)
  const oRem = mapFormationGroupingOutcome({ comparisonInput: removedRef, comparisonResult: rRem, mergeTargetSide: "left" })
  assert.ok(oRem.ok)
  delete (removedRef.left as { canonicalWorkObjectRef?: unknown }).canonicalWorkObjectRef
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(oRem, removedRef), null, "selector removed must reject")
})

test("F4 pair binding: an untouched exact ordered pair still attests, and cross-substitution still rejects", () => {
  const a = strongPair("OKA")
  const ra = compareGroupingSubjects(a)
  assert.ok(ra.ok)
  const oa = mapFormationGroupingOutcome({ comparisonInput: a, comparisonResult: ra, mergeTargetSide: "left" })
  assert.ok(oa.ok)

  const b = strongPair("OKB")
  const rb = compareGroupingSubjects(b)
  assert.ok(rb.ok)
  const ob = mapFormationGroupingOutcome({ comparisonInput: b, comparisonResult: rb, mergeTargetSide: "right" })
  assert.ok(ob.ok)

  // Self-applied attests; cross-applied rejects; cloned container rejects.
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(oa, a), null)
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(ob, b), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(oa, b), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(ob, a), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(oa, { ...a }), null)

  // A public mutation of the outcome cannot reach the private snapshot.
  ;(oa as { state?: string }).state = "conflict"
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(oa, a)?.state, "merge_candidate")
})

test("F4 pair binding: split outcomes are pair-bound and legacy id attacks stay closed", () => {
  // Two genuine must_split pairs produce structurally identical proposals; only
  // the ordered-pair binding separates them.
  const mkSplit = (tag: string) => {
    const pair = {
      left: buildGroupingSubject({
        sources: [{ provider: "github", sourceObjectId: `org/repo#${tag}`, externalId: `pr-${tag}L`, occurredAt: "2020-01-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: `org/wa#${tag}-A` }] }],
        goal: { outcome: `${tag} left outcome`, workObject: `${tag} left wa` },
        canonicalWorkObjectRef: { provider: "github", sourceObjectId: `org/wa#${tag}-A` },
        independentClosure: "independent",
      }),
      right: buildGroupingSubject({
        sources: [{ provider: "github", sourceObjectId: `org/repo#${tag}`, externalId: `pr-${tag}R`, occurredAt: "2026-01-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: `org/wa#${tag}-B` }] }],
        goal: { outcome: `${tag} right outcome`, workObject: `${tag} right wa` },
        canonicalWorkObjectRef: { provider: "github", sourceObjectId: `org/wa#${tag}-B` },
        independentClosure: "independent",
      }),
    } as MutableOutcomePair
    const r = compareGroupingSubjects(pair)
    assert.ok(r.ok && r.verdict === "must_split", `precondition must_split for ${tag}`)
    const o = mapFormationGroupingOutcome({ comparisonInput: pair, comparisonResult: r })
    assert.ok(o.ok && o.groupingOutcome === "split_candidate")
    return { pair, outcome: o }
  }

  const s1 = mkSplit("SP1")
  const s2 = mkSplit("SP2")
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(s1.outcome, s1.pair), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(s1.outcome, s2.pair), null, "split A must not attest against pair B")

  // Swapping the split pair's sides also breaks attestation.
  const tmp = s1.pair.left
  s1.pair.left = s1.pair.right
  s1.pair.right = tmp
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(s1.outcome, s1.pair), null)

  // The prior remediation stays closed: legacy global ids still fail closed.
  const legacy = strongPair("LEG")
  const rLegacy = compareGroupingSubjects(legacy)
  assert.ok(rLegacy.ok)
  for (const attempt of [
    { leftCandidateId: "cand-1" },
    { rightCandidateId: "cand-2" },
    { mergeTargetCandidateId: "cand-3" },
  ]) {
    const r = mapFormationGroupingOutcome({ comparisonInput: legacy, comparisonResult: rLegacy, mergeTargetSide: "left", ...attempt } as never)
    assert.equal(r.ok, false)
    if (r.ok) continue
    assert.equal(r.reason, "unbound_candidate_reference_supplied")
  }
})

test("F4 pair binding: no pair-binding or raw subject identity is exposed publicly", () => {
  const input = {
    left: outcomeSubject("PUBL", "org/repo#PUB", { provider: "github", sourceObjectId: "org/wa#PUB" }),
    right: outcomeSubject("PUBR", "org/repo#PUB", { provider: "github", sourceObjectId: "org/wa#PUB" }),
  } as MutableOutcomePair
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult, mergeTargetSide: "left" })
  assert.ok(outcome.ok)

  for (const value of [outcome, snapshotValidatedFormationGroupingOutcomeResult(outcome, input)]) {
    const serialized = JSON.stringify(value)
    for (const banned of ["binding", "leftSubject", "rightSubject", "formationResult", "canonicalWorkObjectRef", "sourceObjectId", "PUBL", "PUBR", "org/repo#PUB", "org/wa#PUB", "targetNodeCandidateId", "sourceCandidateId"]) {
      assert.ok(!serialized.includes(banned), `public F4 output must not expose ${banned}`)
    }
    // Top-level surface is exactly the documented closed set.
    assert.deepEqual(
      Object.keys(value as object).sort(),
      ["basisVerdict", "candidateOnly", "defaultGrouped", "forbiddenPromotionReasons", "groupingOutcome", "humanReviewRequired", "mergeCandidate", "ok", "proposalStrength", "state"],
    )
  }
})

test("F4 pair binding: a FRESH wrapper around the same formationResult rejects", () => {
  // Isolates the subject-wrapper identity check independently of F3.
  const mk = () => strongPair("WRP")

  const leftSwap = mk()
  const rLeft = compareGroupingSubjects(leftSwap)
  assert.ok(rLeft.ok)
  const oLeft = mapFormationGroupingOutcome({ comparisonInput: leftSwap, comparisonResult: rLeft, mergeTargetSide: "left" })
  assert.ok(oLeft.ok)
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(oLeft, leftSwap), null)
  leftSwap.left = { formationResult: leftSwap.left.formationResult }
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(oLeft, leftSwap), null, "replaced left wrapper must reject")

  const rightSwap = mk()
  const rRight = compareGroupingSubjects(rightSwap)
  assert.ok(rRight.ok)
  const oRight = mapFormationGroupingOutcome({ comparisonInput: rightSwap, comparisonResult: rRight, mergeTargetSide: "left" })
  assert.ok(oRight.ok)
  rightSwap.right = { formationResult: rightSwap.right.formationResult }
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(oRight, rightSwap), null, "replaced right wrapper must reject")
})

// ─── F4 single outer-input capture + opaque F3 pair token (T8–T10) ───────────
//
// F4 used to re-capture the ordered pair from `comparisonInput` AFTER the F3
// attestation had already read it. Because `readonly` is erased at runtime, a
// two-valued getter could serve pair A/B to the attestation and pair C/D to the
// registration a few statements later: an outcome derived entirely from the A/B
// verdict was registered as belonging to C/D and REFUSED to attest against the
// pair it actually came from. F4 now reads its own outer input exactly once and
// stores the OPAQUE F3 PAIR TOKEN instead of recapturing the caller graph.

/** A property whose reads are counted; `force` pins a value for later phases. */
function outerProbe<T>(script: readonly T[]) {
  const state = { reads: 0, observed: [] as T[], forced: undefined as T | undefined, forcing: false }
  return {
    state,
    get(): T {
      const value = state.forcing ? (state.forced as T) : script[Math.min(state.reads, script.length - 1)]
      state.reads += 1
      state.observed.push(value)
      return value
    },
    force(value: T): void {
      state.forcing = true
      state.forced = value
    },
  }
}

function defineOuterGetter(target: object, key: string, get: () => unknown): void {
  Object.defineProperty(target, key, { get, enumerable: true, configurable: true })
}

test("F4 capture (T8): a changing comparisonInput getter is read ONCE", () => {
  const inputAB = strongPair("T8AB")
  const inputCD = strongPair("T8CD") // a genuine pair, but NEVER compared
  const comparisonResult = compareGroupingSubjects(inputAB)
  assert.ok(comparisonResult.ok && comparisonResult.verdict === "strong_match")

  const ci = outerProbe([inputAB, inputCD])
  const outer = { comparisonResult, mergeTargetSide: "left" } as Record<string, unknown>
  defineOuterGetter(outer, "comparisonInput", ci.get)

  const outcome = mapFormationGroupingOutcome(outer as never)
  assert.equal(ci.state.reads, 1, "comparisonInput must be read exactly once per mapping")
  assert.equal(ci.state.observed[0], inputAB, "the single read is the pair the outcome is built from")
  assert.ok(outcome.ok, "a genuine attested A/B verdict still maps")

  assert.equal(
    snapshotValidatedFormationGroupingOutcomeResult(outcome, inputCD),
    null,
    "an outcome computed from A/B must never attest against the never-compared pair C/D",
  )
  assert.notEqual(
    snapshotValidatedFormationGroupingOutcomeResult(outcome, inputAB),
    null,
    "and it must still attest against the pair it WAS computed from",
  )
})

test("F4 capture (T9): a changing comparisonResult getter is read ONCE", () => {
  const inputAB = strongPair("T9AB")
  const inputCD = strongPair("T9CD")
  const resultAB = compareGroupingSubjects(inputAB)
  const resultCD = compareGroupingSubjects(inputCD)
  assert.ok(resultAB.ok && resultCD.ok)

  const cr = outerProbe([resultAB, resultCD])
  const outer = { comparisonInput: inputAB, mergeTargetSide: "left" } as Record<string, unknown>
  defineOuterGetter(outer, "comparisonResult", cr.get)

  const outcome = mapFormationGroupingOutcome(outer as never)
  assert.equal(cr.state.reads, 1, "comparisonResult must be read exactly once per mapping")
  assert.equal(cr.state.observed[0], resultAB)
  assert.ok(outcome.ok)
  // The outcome belongs to the pair of the ONE result that was read.
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(outcome, inputAB), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, inputCD), null)
})

test("F4 capture (T10): a changing mergeTargetSide getter is read ONCE", () => {
  const input = strongPair("T10")
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok)

  const side = outerProbe(["left", "right"])
  const outer = { comparisonInput: input, comparisonResult } as Record<string, unknown>
  defineOuterGetter(outer, "mergeTargetSide", side.get)

  const outcome = mapFormationGroupingOutcome(outer as never)
  assert.equal(side.state.reads, 1, "mergeTargetSide must be read exactly once per mapping")
  assert.equal(side.state.observed[0], "left")
  assert.ok(outcome.ok && outcome.groupingOutcome === "merge_candidate")
  if (!outcome.ok || outcome.groupingOutcome !== "merge_candidate") return
  // Validation and construction used the SAME read: a second read returning
  // "right" cannot have produced a target/source pair from a different value.
  assert.equal(outcome.mergeCandidate.targetSide, "left")
  assert.equal(outcome.mergeCandidate.sourceSide, "right")
})

test("F4 capture: states.ts does not recapture the pair after F3 attestation", () => {
  const A = outcomeSubject("NRA", "org/repo#NR")
  const B = outcomeSubject("NRB", "org/repo#NR")
  let leftReads = 0
  let rightReads = 0
  const container = {} as Record<string, unknown>
  defineOuterGetter(container, "left", () => {
    leftReads += 1
    return A
  })
  defineOuterGetter(container, "right", () => {
    rightReads += 1
    return B
  })

  const comparisonResult = compareGroupingSubjects(container as never)
  assert.ok(comparisonResult.ok)
  assert.equal(leftReads, 1, "the F3 comparison captures the pair exactly once")
  assert.equal(rightReads, 1)

  const beforeLeft = leftReads
  const beforeRight = rightReads
  const outcome = mapFormationGroupingOutcome({
    comparisonInput: container,
    comparisonResult,
    mergeTargetSide: "left",
  } as never)
  assert.ok(outcome.ok)

  // Exactly ONE further read per side: F3's attestation check. F4 adds none —
  // it stores the opaque F3 pair token instead of recapturing the caller graph.
  assert.equal(leftReads - beforeLeft, 1, "F4 must not re-read comparisonInput.left after attestation")
  assert.equal(rightReads - beforeRight, 1, "F4 must not re-read comparisonInput.right after attestation")
})

test("F4 capture: an A/B outcome cannot be attested as C/D through one phased container", () => {
  const A = outcomeSubject("PHA", "org/repo#PH")
  const B = outcomeSubject("PHB", "org/repo#PH")
  const C = outcomeSubject("PHC", "org/other#PH2")
  const D = outcomeSubject("PHD", "org/other#PH2")
  let reads = 0
  let flipAfter = Number.POSITIVE_INFINITY
  let forced: "AB" | "CD" | null = null
  const serveCD = (): boolean => forced === "CD" || (forced === null && reads > flipAfter)
  const container = {} as Record<string, unknown>
  defineOuterGetter(container, "left", () => {
    reads += 1
    return serveCD() ? C : A
  })
  defineOuterGetter(container, "right", () => {
    reads += 1
    return serveCD() ? D : B
  })

  const comparisonResult = compareGroupingSubjects(container as never)
  assert.ok(comparisonResult.ok && comparisonResult.verdict === "strong_match")
  // Let F3's attestation read (one per side) still see A/B; anything AFTER that
  // — i.e. any F4 pair capture — sees C/D.
  flipAfter = reads + 2
  const outcome = mapFormationGroupingOutcome({
    comparisonInput: container,
    comparisonResult,
    mergeTargetSide: "left",
  } as never)
  assert.ok(outcome.ok)

  forced = "CD"
  assert.equal(
    snapshotValidatedFormationGroupingOutcomeResult(outcome, container),
    null,
    "an outcome computed over A/B must never attest against C/D",
  )
  forced = "AB"
  assert.notEqual(
    snapshotValidatedFormationGroupingOutcomeResult(outcome, container),
    null,
    "it must still attest against the pair it was computed from",
  )
})

test("F4 token: a forged or cloned pair token cannot authorize an outcome", () => {
  const input = strongPair("TOK")
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok)
  const attested = attestValidatedGroupingComparison(comparisonResult, input)
  assert.notEqual(attested, null)
  const token = attested!.pairToken

  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult, mergeTargetSide: "left" })
  assert.ok(outcome.ok)
  assert.notEqual(snapshotValidatedFormationGroupingOutcomeResult(outcome, input), null, "the genuine binding attests")

  // The authorization primitive F4 relies on rejects every forged/cloned token.
  assert.equal(attestedGroupingPairTokenMatches({}, input), false)
  assert.equal(attestedGroupingPairTokenMatches({ ...(token as object) }, input), false)
  assert.equal(attestedGroupingPairTokenMatches(structuredClone(token), input), false)
  assert.equal(attestedGroupingPairTokenMatches(JSON.parse(JSON.stringify(token)), input), false)
  assert.equal(attestedGroupingPairTokenMatches(Object.create(token as object), input), false)
  assert.ok(attestedGroupingPairTokenMatches(token, input), "only the genuine token resolves")

  // A different container never authorizes this outcome, cloned or otherwise.
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, { ...input }), null)
  assert.equal(snapshotValidatedFormationGroupingOutcomeResult(outcome, strongPair("TOK2")), null)
})

test("F4 token: no pair or token data is reachable from the public outcome", () => {
  const input = strongPair("LEAK2")
  const comparisonResult = compareGroupingSubjects(input)
  assert.ok(comparisonResult.ok)
  const outcome = mapFormationGroupingOutcome({ comparisonInput: input, comparisonResult, mergeTargetSide: "left" })
  assert.ok(outcome.ok)

  const keys = new Set<string>()
  collectKeys(outcome, keys)
  for (const banned of ["pairToken", "token", "capture", "binding", "comparisonInput", "formationResult", "canonicalWorkObjectRef", "leftSubject", "rightSubject", "stable"]) {
    assert.ok(!keys.has(banned), `the public F4 outcome must not expose ${banned}`)
  }

  const reachable = new Set<unknown>()
  const walkValues = (value: unknown): void => {
    if (value === null || typeof value !== "object") return
    if (reachable.has(value)) return
    reachable.add(value)
    for (const v of Object.values(value)) walkValues(v)
  }
  walkValues(outcome)
  assert.ok(!reachable.has(input), "the comparison input must not be reachable from the outcome")
  assert.ok(!reachable.has(input.left), "no subject wrapper may be reachable from the outcome")
  assert.ok(!reachable.has(input.right))
  assert.ok(!reachable.has(input.left.formationResult), "no attested F1C result may be reachable")
  assert.ok(!reachable.has(comparisonResult), "the F3 result object must not be reachable")
})
