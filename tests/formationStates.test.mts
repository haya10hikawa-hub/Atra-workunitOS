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
  mapFormationSubjectState,
  mapFormationGroupingOutcome,
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
    leftCandidateId: string
    rightCandidateId: string
    mergeTargetCandidateId?: string
    expectVerdict: string
    expectGroupingOutcome: string
    expectState: string | null
    expectProposalStrength?: string
    expectSourceCandidateId?: string
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
      leftCandidateId: scenario.leftCandidateId,
      rightCandidateId: scenario.rightCandidateId,
      ...(scenario.mergeTargetCandidateId !== undefined ? { mergeTargetCandidateId: scenario.mergeTargetCandidateId } : {}),
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
      assert.equal(r.mergeCandidate.targetNodeCandidateId, scenario.mergeTargetCandidateId)
      assert.equal(r.sourceCandidateId, scenario.expectSourceCandidateId)
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

  const r = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right" })
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
  const base = { leftCandidateId: "cand-left", rightCandidateId: "cand-right", mergeTargetCandidateId: "cand-left" as string }

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
  const r = mapFormationGroupingOutcome({ comparisonInput: {} as never, comparisonResult: failed as never, leftCandidateId: "cand-left", rightCandidateId: "cand-right" })
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
  const r1 = mapFormationGroupingOutcome({ comparisonInput: b.comparisonInput, comparisonResult: a.comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right", mergeTargetCandidateId: "cand-left" })
  assert.equal(r1.ok, false)
  if (!r1.ok) assert.equal(r1.reason, "grouping_not_validated")
  // Real pair-B result with pair-A input → rejected.
  const r2 = mapFormationGroupingOutcome({ comparisonInput: a.comparisonInput, comparisonResult: b.comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right", mergeTargetCandidateId: "cand-left" })
  assert.equal(r2.ok, false)
  if (!r2.ok) assert.equal(r2.reason, "grouping_not_validated")
  // Each result still attests with its OWN input (control).
  assert.ok(mapFormationGroupingOutcome({ comparisonInput: a.comparisonInput, comparisonResult: a.comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right", mergeTargetCandidateId: "cand-left" }).ok)
})

test("mutating the public F3 result or input after attestation does not change the detached snapshot", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#MU", externalId: "pr-mua", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#MU", externalId: "pr-mub", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok)
  if (!comparisonResult.ok) return
  const base = { comparisonInput, comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right", mergeTargetCandidateId: "cand-left" }
  const first = mapFormationGroupingOutcome(base)
  assert.ok(first.ok && first.groupingOutcome === "merge_candidate")
  // Forge the public verdict post-attestation.
  ;(comparisonResult as { verdict?: string }).verdict = "must_split"
  const second = mapFormationGroupingOutcome(base)
  assert.ok(second.ok && second.groupingOutcome === "merge_candidate", "verdict must come from the detached snapshot, not the mutated public result")
})

// ─── Candidate-id validation (fixtures 22, 23, 24; Section 10) ────────────────

test("candidate-id validation: invalid, equal, and out-of-pair merge target are rejected value-free", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] },
    { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok)
  const call = (over: Record<string, unknown>): FormationGroupingOutcomeResult =>
    mapFormationGroupingOutcome({ comparisonInput, comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right", mergeTargetCandidateId: "cand-left", ...over } as never)

  // Invalid ids (fixture 22).
  for (const bad of ["", " ", "a".repeat(129), "has space", "has/slash", 5 as never, null as never]) {
    const r = call({ leftCandidateId: bad })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "candidate_id_invalid")
  }
  // Equal ids (fixture 23).
  const eq = call({ leftCandidateId: "same", rightCandidateId: "same", mergeTargetCandidateId: "same" })
  assert.equal(eq.ok, false)
  if (!eq.ok) assert.equal(eq.reason, "candidate_ids_not_distinct")
  // Merge target introduces a THIRD candidate (fixture 24).
  const outside = call({ mergeTargetCandidateId: "cand-third" })
  assert.equal(outside.ok, false)
  if (!outside.ok) assert.equal(outside.reason, "merge_target_not_a_compared_candidate")
})

// ─── possible_match cannot auto-group (fixture 27; Section 12.C) ──────────────

test("possible_match maps to a NON-default-grouped possible proposal (never strong, never grouped)", () => {
  const { comparisonInput, comparisonResult } = attestedComparison(
    { sources: [{ provider: "github", sourceObjectId: "org/repo#60", externalId: "pr-60", occurredAt: "2020-01-01T00:00:00Z", actors: ["Kaneko"], container: "shared-space", deadline: "2026-08-01T00:00:00Z" }] },
    { sources: [{ provider: "slack", sourceObjectId: "T1/C1/60", externalId: "msg-60", occurredAt: "2026-01-01T00:00:00Z", actors: ["Kaneko"], container: "shared-space", deadline: "2026-08-02T00:00:00Z" }] },
  )
  assert.ok(comparisonResult.ok && comparisonResult.verdict === "possible_match")
  const r = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right", mergeTargetCandidateId: "cand-right" })
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
  const merge = mapFormationGroupingOutcome({ comparisonInput: strong.comparisonInput, comparisonResult: strong.comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right", mergeTargetCandidateId: "cand-left" })
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
  const splitOut = mapFormationGroupingOutcome({ comparisonInput: split.comparisonInput, comparisonResult: split.comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right" })
  assert.ok(splitOut.ok && splitOut.groupingOutcome === "split_candidate")
  if (splitOut.ok && splitOut.groupingOutcome === "split_candidate") {
    assert.ok(splitOut.forbiddenPromotionReasons.length > 0)
    assert.ok(splitOut.forbiddenPromotionReasons.includes("split_candidate_to_finalized_split"))
  }
})

// ─── conflict is never emitted by F4 (fixture 9; Section 12.E) ────────────────

test("no F4 mapping over any verdict ever emits the reserved conflict state", () => {
  const specs: [SubjectSpec, SubjectSpec, string | undefined][] = [
    [{ sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80a", occurredAt: "2020-01-01T00:00:00Z" }] }, { sources: [{ provider: "github", sourceObjectId: "org/repo#80", externalId: "pr-80b", occurredAt: "2026-01-01T00:00:00Z" }] }, "cand-left"],
    [{ sources: [{ provider: "github", sourceObjectId: "org/repo#40", externalId: "pr-40", occurredAt: "2020-01-01T00:00:00Z" }] }, { sources: [{ provider: "github", sourceObjectId: "org/repo#41", externalId: "pr-41", occurredAt: "2026-01-01T00:00:00Z" }] }, undefined],
    [{ sources: [{ provider: "github", sourceObjectId: "org/repo#1", externalId: "pr-1", occurredAt: "2020-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#1" } }, { sources: [{ provider: "github", sourceObjectId: "org/repo#2", externalId: "pr-2", occurredAt: "2026-01-01T00:00:00Z" }], goal: { workObject: "auth" }, canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#2" } }, undefined],
  ]
  for (const [left, right, target] of specs) {
    const { comparisonInput, comparisonResult } = attestedComparison(left, right)
    assert.ok(comparisonResult.ok)
    const r = mapFormationGroupingOutcome({ comparisonInput, comparisonResult, leftCandidateId: "cand-left", rightCandidateId: "cand-right", ...(target ? { mergeTargetCandidateId: target } : {}) })
    assert.ok(r.ok)
    if (!r.ok) continue
    assert.notEqual(r.state, "conflict")
    const strings: string[] = []
    collectStrings(r, strings)
    assert.ok(!strings.includes("conflict"), "F4 output must not carry a conflict finding")
  }
})

// ─── No LLM / network / provider-extraction / persistence surface in states.ts ─

test("states.ts imports no LLM / network / provider-extraction / persistence surface", () => {
  const path = fileURLToPath(new URL("../app/lib/application/formation/states.ts", import.meta.url))
  const src = readFileSync(path, "utf8")
  for (const banned of ["/extract/", "fetch(", "http://", "https://", "XMLHttpRequest", "WebSocket", "openai", "anthropic", "d1", "persist", "evaluateDoneConditionDraft", "buildFormationGoalDoneConditionCandidate"]) {
    assert.ok(!src.includes(banned), `states.ts must not reference ${banned}`)
  }
})
