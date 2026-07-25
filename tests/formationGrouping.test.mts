/**
 * F3 — Deterministic grouping evidence ledger — permanent tests.
 *
 * Every subject is compiled through the REAL public boundaries
 * (`buildFormationSourceCandidate` → `buildFormationGoalDoneConditionCandidate`
 * → `buildWorkUnitFormationCandidate`), so each `formationResult` is a genuinely
 * ATTESTED F1C success — never a clone. The comparison counterexamples in
 * `fixtures/formation/grouping/scenarios.json` are permanent data; the
 * attestation, resource-bound, leakage, determinism, and non-membership probes
 * are pinned inline.
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
import {
  buildWorkUnitFormationCandidate,
  snapshotValidatedWorkUnitFormationResult,
} from "../app/lib/application/formation/workUnitFormationAggregate.ts"
import {
  canonicalObjectKey,
  GROUPING_BOUNDS,
} from "../app/lib/application/formation/goalIdentity.ts"
import {
  compareGroupingSubjects,
  retrieveComparableSubjects,
  snapshotValidatedGroupingComparisonResult,
  WEAK_MIN_DISTINCT_KINDS,
} from "../app/lib/application/formation/grouping.ts"
import {
  HARD_SPLIT_KINDS,
  HARD_POSITIVE_KINDS,
  WEAK_KINDS,
  RETRIEVAL_KEY_KINDS,
  type GroupingSubjectInput,
  type SuccessfulWorkUnitFormationResult,
} from "../app/lib/application/formation/groupingTypes.ts"

type OkSource = Extract<FormationSourceContractResult, { ok: true }>

// ─── Real subject builders (genuine attestation) ─────────────────────────────

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

type SubjectSpec = {
  sources: readonly SourceSpec[]
  goal?: Record<string, string>
  acceptanceCriteria?: readonly string[]
  independentClosure?: "independent" | "parent_bounded" | "unknown"
  canonicalWorkObjectRef?: { provider: string; sourceObjectId: string }
}

const CAPTURED_AT = "2026-07-19T00:00:00Z"

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

function buildSubject(spec: SubjectSpec): GroupingSubjectInput {
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

// ─── Scenario counterexamples (permanent fixtures 1–17,19,22) ────────────────

type Scenario = {
  name: string
  left: SubjectSpec
  right: SubjectSpec
  expectVerdict?: string
  notStrong?: boolean
  hardSplitIncludes?: string[]
  hardPositiveIncludes?: string[]
  hardPositiveExcludes?: string[]
  hardPositiveEmpty?: boolean
  weakKindsEqual?: string[]
}

const scenariosPath = fileURLToPath(new URL("./fixtures/formation/grouping/scenarios.json", import.meta.url))
const scenarioDoc = JSON.parse(readFileSync(scenariosPath, "utf8")) as { scenarios: Scenario[] }

for (const scenario of scenarioDoc.scenarios) {
  test(`scenario ${scenario.name}`, () => {
    const left = buildSubject(scenario.left)
    const right = buildSubject(scenario.right)
    const r = compareGroupingSubjects({ left, right })
    assert.equal(r.ok, true)
    if (!r.ok) return

    if (scenario.expectVerdict !== undefined) assert.equal(r.verdict, scenario.expectVerdict)
    if (scenario.notStrong) assert.notEqual(r.verdict, "strong_match")

    const splitKinds = r.hardSplit.map((e) => e.kind)
    const positiveKinds = r.hardPositive.map((e) => e.kind)
    const weakKinds = r.weakSupport.map((e) => e.kind)

    for (const k of scenario.hardSplitIncludes ?? []) assert.ok(splitKinds.includes(k as never), `expected hard split ${k}; got ${splitKinds}`)
    for (const k of scenario.hardPositiveIncludes ?? []) assert.ok(positiveKinds.includes(k as never), `expected hard positive ${k}; got ${positiveKinds}`)
    for (const k of scenario.hardPositiveExcludes ?? []) assert.ok(!positiveKinds.includes(k as never), `did not expect hard positive ${k}`)
    if (scenario.hardPositiveEmpty) assert.equal(r.hardPositive.length, 0, `expected no hard positive; got ${positiveKinds}`)
    if (scenario.weakKindsEqual !== undefined) {
      assert.deepEqual([...weakKinds].sort(), [...scenario.weakKindsEqual].sort(), `weak kinds mismatch for ${scenario.name}`)
    }

    // Every result is candidate-only, human-review-required, and outcome-free.
    assert.equal(r.candidateOnly, true)
    assert.equal(r.humanReviewRequired, true)
  })
}

// ─── F1C runtime provenance (fixtures 20, 21) ────────────────────────────────

test("F1C attestation: exact real result attests; clones and forgeries do not", () => {
  const subject = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#900", externalId: "pr-900", occurredAt: "2026-01-01T00:00:00Z" }] })
  const result = subject.formationResult

  // Exact real result attests.
  const snap = snapshotValidatedWorkUnitFormationResult(result)
  assert.notEqual(snap, null)

  // Candidate-only object (not the result) does not attest.
  assert.equal(snapshotValidatedWorkUnitFormationResult(result.candidate), null)
  // Spread clone does not attest.
  assert.equal(snapshotValidatedWorkUnitFormationResult({ ...result }), null)
  // JSON clone does not attest.
  assert.equal(snapshotValidatedWorkUnitFormationResult(JSON.parse(JSON.stringify(result))), null)
  // structuredClone does not attest.
  assert.equal(snapshotValidatedWorkUnitFormationResult(structuredClone(result)), null)
  // Structural forgery does not attest.
  const forged = { ok: true, candidateOnly: true, candidate: { members: [], goalDoneCondition: {}, humanReviewRequired: true, candidateOnly: true } }
  assert.equal(snapshotValidatedWorkUnitFormationResult(forged), null)
  // Failed result does not attest.
  const failed = buildWorkUnitFormationCandidate({ members: [], goalDoneCondition: {} } as never)
  assert.equal(failed.ok, false)
  assert.equal(snapshotValidatedWorkUnitFormationResult(failed), null)

  // Repeated snapshots never alias but are deeply equal.
  const s1 = snapshotValidatedWorkUnitFormationResult(result)
  const s2 = snapshotValidatedWorkUnitFormationResult(result)
  assert.notEqual(s1, s2)
  assert.deepEqual(s1, s2)
})

test("comparison rejects cloned / forged / non-result F1C subjects (fixtures 20, 21)", () => {
  const good = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#910", externalId: "pr-910", occurredAt: "2026-01-01T00:00:00Z" }] })
  const clones: unknown[] = [
    JSON.parse(JSON.stringify(good.formationResult)),
    { ...good.formationResult },
    structuredClone(good.formationResult),
    good.formationResult.candidate,
    { ok: true, candidateOnly: true, candidate: { members: [], goalDoneCondition: {}, humanReviewRequired: true, candidateOnly: true } },
  ]
  for (const bad of clones) {
    const r = compareGroupingSubjects({ left: { formationResult: bad as never }, right: good })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "subject_not_validated")
  }
})

// ─── Object-key tuple collision resistance (fixture 22, M22) ──────────────────

test("canonical object key is a collision-safe tuple, not raw concatenation", () => {
  assert.equal(canonicalObjectKey("github", "a"), canonicalObjectKey("github", "a"))
  // provider is part of identity — same id under different providers must differ.
  assert.notEqual(canonicalObjectKey("github", "a"), canonicalObjectKey("slack", "a"))
  assert.notEqual(canonicalObjectKey("github", "a"), canonicalObjectKey("github", "b"))
  // delimiter-bearing ids never collide across the (provider,id) boundary.
  assert.notEqual(
    canonicalObjectKey("github", JSON.stringify(["slack", "a"])),
    canonicalObjectKey("slack", "a"),
  )
  // untrusted / malformed identities are refused (a selector cannot introduce one).
  assert.equal(canonicalObjectKey("not_a_provider", "a"), null)
  assert.equal(canonicalObjectKey("github", ""), null)
  assert.equal(canonicalObjectKey("github", 5), null)
})

// ─── Distinct weak-kind counting (M3, M4) ────────────────────────────────────

test("three instances of one weak kind count as ONE kind → insufficient", () => {
  const left = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#920", externalId: "pr-920", occurredAt: "2020-01-01T00:00:00Z", actors: ["A1", "A2", "A3"] }] })
  const right = buildSubject({ sources: [{ provider: "slack", sourceObjectId: "T/C/920", externalId: "msg-920", occurredAt: "2026-01-01T00:00:00Z", actors: ["A1", "A2", "A3"] }] })
  const r = compareGroupingSubjects({ left, right })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.weakSupport.length, 1)
  assert.equal(r.weakSupport[0].kind, "actor_overlap")
  assert.equal(r.weakSupport[0].support.shared, 3)
  assert.equal(r.verdict, "insufficient")
  assert.ok(WEAK_MIN_DISTINCT_KINDS === 3)
})

// ─── ROI / priority-shaped fields are ignored (fixture 18, M12) ──────────────

test("ROI / priority-shaped fields do not change the verdict", () => {
  const leftSpec: SubjectSpec = { sources: [{ provider: "github", sourceObjectId: "org/repo#930", externalId: "pr-930", occurredAt: "2020-01-01T00:00:00Z" }] }
  const rightSpec: SubjectSpec = { sources: [{ provider: "slack", sourceObjectId: "T/C/930", externalId: "msg-930", occurredAt: "2026-01-01T00:00:00Z" }] }
  const baseline = compareGroupingSubjects({ left: buildSubject(leftSpec), right: buildSubject(rightSpec) })
  const poisoned = compareGroupingSubjects({
    left: { ...buildSubject(leftSpec), roi: 999, priority: "high", whyNow: "urgent", ranking: 1 } as never,
    right: { ...buildSubject(rightSpec), roi: -1, priority: "low" } as never,
  })
  assert.equal(baseline.ok, true)
  assert.equal(poisoned.ok, true)
  if (baseline.ok && poisoned.ok) assert.equal(poisoned.verdict, baseline.verdict)
})

// ─── Reasons: bounded, closed templates, never echo raw content (fixture 27, M17) ──

test("no raw source text is ever echoed into evidence or reasons", () => {
  // A benign but distinctive marker embedded in every source-controlled field
  // F3 touches (object id, container, actor, goal text). It must never surface
  // in the evidence ledger or reasons. (Injection-phrased text is separately
  // rejected upstream by F1A, so the marker itself stays neutral.)
  const marker = "P0ISONZZZINJECT"
  const left = buildSubject({
    sources: [{ provider: "github", sourceObjectId: `org/repo#${marker}`, externalId: "pr-940", occurredAt: "2020-01-01T00:00:00Z", container: `container-${marker}`, actors: [`Actor-${marker}`], title: `Title-${marker}`, summary: `Summary ${marker}` }],
    goal: { outcome: `Outcome ${marker}`, workObject: `WorkObject-${marker}` },
  })
  const right = buildSubject({
    sources: [{ provider: "github", sourceObjectId: `org/repo#${marker}`, externalId: "pr-941", occurredAt: "2020-01-01T06:00:00Z", container: `container-${marker}`, actors: [`Actor-${marker}`], title: `Title-${marker}`, summary: `Summary ${marker}` }],
    goal: { outcome: `Outcome ${marker}`, workObject: `WorkObject-${marker}` },
  })
  const r = compareGroupingSubjects({ left, right })
  assert.equal(r.ok, true)
  if (!r.ok) return

  const strings: string[] = []
  collectStrings(r, strings)
  for (const s of strings) assert.ok(!s.includes(marker), `output leaked raw source text: ${s}`)

  // Reason bounds.
  assert.ok(r.reasons.length <= 20)
  for (const reason of r.reasons) assert.ok(reason.length <= 200)
})

// ─── No membership mutation; no outcome / SourceRole fields (fixtures 29, 30; M18–M20) ──

test("comparison mutates no input membership and emits no grouping-outcome field", () => {
  const left = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#950", externalId: "pr-950", occurredAt: "2020-01-01T00:00:00Z" }] })
  const right = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#950", externalId: "pr-951", occurredAt: "2026-01-01T00:00:00Z" }] })
  const before = JSON.parse(JSON.stringify(left.formationResult))
  const r = compareGroupingSubjects({ left, right })
  // Input F1C result is untouched (no membership change).
  assert.deepEqual(JSON.parse(JSON.stringify(left.formationResult)), before)

  assert.equal(r.ok, true)
  if (!r.ok) return
  const keys = new Set<string>()
  collectKeys(r, keys)
  const forbidden = [
    "merged", "grouped", "membership", "memberToAdd", "memberToRemove",
    "merge_candidate", "split_candidate", "formal_candidate", "context_only",
    "mergeCandidate", "splitCandidate", "formalCandidate",
    "sourceRole", "SourceRole", "primarySource", "statePrediction",
    "ranking", "whyNow", "approval", "execution", "roi", "priority",
  ]
  for (const key of forbidden) assert.ok(!keys.has(key), `unexpected outcome field: ${key}`)
})

// ─── Result / input mutation does not disturb the attested snapshot (fixture 29) ──

test("mutating the public F1C result after building does not change the verdict", () => {
  const left = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#960", externalId: "pr-960", occurredAt: "2020-01-01T00:00:00Z" }], goal: { verifier: "human_owner" } })
  const right = buildSubject({ sources: [{ provider: "slack", sourceObjectId: "T/C/960", externalId: "msg-960", occurredAt: "2026-01-01T00:00:00Z" }], goal: { verifier: "human_owner" } })
  const first = compareGroupingSubjects({ left, right })
  assert.equal(first.ok, true)
  const verdict = first.ok ? first.verdict : ""
  // Forge the public result's verifier post-attestation.
  ;(left.formationResult.candidate.goalDoneCondition.goal as { verifier?: string }).verifier = "TAMPERED"
  const second = compareGroupingSubjects({ left, right })
  assert.equal(second.ok && second.verdict, verdict)
})

// ─── Determinism (fixture 28) ────────────────────────────────────────────────

test("identical input yields deeply equal output and stable order", () => {
  const left = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#970", externalId: "pr-970", occurredAt: "2020-01-01T00:00:00Z", actors: ["X"], container: "c" }], goal: { verifier: "human_owner", outcome: "Ship" } })
  const right = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#970", externalId: "pr-971", occurredAt: "2020-01-01T02:00:00Z", actors: ["X"], container: "c" }], goal: { verifier: "human_owner", outcome: "Ship" } })
  const a = compareGroupingSubjects({ left, right })
  const b = compareGroupingSubjects({ left, right })
  assert.deepEqual(a, b)
})

// ─── Resource bounds: members (fixtures 25, 26; M16) ─────────────────────────

function manyMemberSubject(count: number): GroupingSubjectInput {
  const sources: SourceSpec[] = []
  for (let i = 0; i < count; i += 1) {
    sources.push({ provider: "github", sourceObjectId: `org/repo#m${i}`, externalId: `pr-m${i}`, occurredAt: "2026-01-01T00:00:00Z" })
  }
  return buildSubject({ sources })
}

test("50 members is a bounded success; 51 members is a bounded rejection", () => {
  const other = buildSubject({ sources: [{ provider: "slack", sourceObjectId: "T/C/990", externalId: "msg-990", occurredAt: "2026-01-01T00:00:00Z" }] })
  const ok = compareGroupingSubjects({ left: manyMemberSubject(GROUPING_BOUNDS.maxSubjectMembers), right: other })
  assert.equal(ok.ok, true)
  const rejected = compareGroupingSubjects({ left: manyMemberSubject(GROUPING_BOUNDS.maxSubjectMembers + 1), right: other })
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.reason, "subject_members_exceeded")
})

// ─── Selector membership (Section 7) ─────────────────────────────────────────

test("a canonicalWorkObjectRef selector that is not a universe member is rejected without echo", () => {
  const left = buildSubject({
    sources: [{ provider: "github", sourceObjectId: "org/repo#1000", externalId: "pr-1000", occurredAt: "2026-01-01T00:00:00Z" }],
    canonicalWorkObjectRef: { provider: "github", sourceObjectId: "org/repo#NOT-A-MEMBER" },
  })
  const right = buildSubject({ sources: [{ provider: "slack", sourceObjectId: "T/C/1000", externalId: "msg-1000", occurredAt: "2026-01-01T00:00:00Z" }] })
  const r = compareGroupingSubjects({ left, right })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "canonical_work_object_ref_not_a_member")
  // A member selector (resolving via referencedObjects) is admitted.
  const okLeft = buildSubject({
    sources: [{ provider: "github", sourceObjectId: "org/repo#1001", externalId: "pr-1001", occurredAt: "2026-01-01T00:00:00Z", referencedObjects: [{ provider: "notion", sourceObjectId: "page-1001" }] }],
    canonicalWorkObjectRef: { provider: "notion", sourceObjectId: "page-1001" },
  })
  const ok = compareGroupingSubjects({ left: okLeft, right })
  assert.equal(ok.ok, true)
})

// ─── Retrieval: bounds, stability, widening-only (fixtures 23, 24; M15, M21) ──

test("retrieval accepts 100 candidates and rejects 101 (bounded, no truncation)", () => {
  const subject = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#SHARED", externalId: "pr-sub", occurredAt: "2026-01-01T00:00:00Z" }] })
  const oneCandidate = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#SHARED", externalId: "pr-cand", occurredAt: "2026-01-01T00:00:00Z" }] })
  const hundred = Array.from({ length: GROUPING_BOUNDS.maxRetrievalCandidates }, () => oneCandidate)
  const ok = retrieveComparableSubjects(subject, hundred)
  assert.equal(ok.ok, true)
  const oversized = Array.from({ length: GROUPING_BOUNDS.maxRetrievalCandidates + 1 }, () => oneCandidate)
  const rejected = retrieveComparableSubjects(subject, oversized)
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.reason, "retrieval_candidates_exceeded")
})

test("retrieval returns comparable candidates in original stable order (never by time/ROI)", () => {
  const subject = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#RETR", externalId: "pr-r", occurredAt: "2026-01-01T00:00:00Z" }] })
  // Three candidates that all share the object, with NON-monotonic timestamps by index.
  const times = ["2026-03-01T00:00:00Z", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"]
  const candidates = times.map((t, i) => buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#RETR", externalId: `pr-c${i}`, occurredAt: t }] }))
  const r = retrieveComparableSubjects(subject, candidates)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.comparable.map((m) => m.index), [0, 1, 2])
  for (const m of r.comparable) assert.equal(m.via, "exact_provider_object")
  // Determinism.
  assert.deepEqual(retrieveComparableSubjects(subject, candidates), r)
})

test("retrieval never uses provider identity alone as a match key", () => {
  // Same provider, disjoint objects, no shared work object / cross-link / lexical.
  const subject = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#PA", externalId: "pr-pa", occurredAt: "2026-01-01T00:00:00Z" }] })
  const candidate = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#PB", externalId: "pr-pb", occurredAt: "2026-01-01T00:00:00Z" }] })
  const r = retrieveComparableSubjects(subject, [candidate])
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.comparable.length, 0)
})

// ─── Case F: retrieval-key matrix distinguishes member/member, member/reference,
//     reference/reference-only, and provider-only (M25/M31 regression) ──────────
test("retrieval key matrix: member/member, member/reference, reference/reference, provider-only", () => {
  const subject = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#M", externalId: "pr-m", occurredAt: "2026-01-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: "org/common#999" }] }] })
  // 0: member/member — shares the member object #M.
  const memberMember = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#M", externalId: "pr-m2", occurredAt: "2026-02-01T00:00:00Z" }] })
  // 1: member/reference — references the subject's member object #M.
  const memberReference = buildSubject({ sources: [{ provider: "slack", sourceObjectId: "T/C/M", externalId: "msg-m", occurredAt: "2026-02-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: "org/repo#M" }] }] })
  // 2: reference/reference only — shares only the third-party reference #999.
  const referenceReference = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#OTHER", externalId: "pr-o", occurredAt: "2026-02-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: "org/common#999" }] }] })
  // 3: provider-only — same provider, disjoint objects, no shared reference.
  const providerOnly = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#PX", externalId: "pr-px", occurredAt: "2026-02-01T00:00:00Z" }] })

  const r = retrieveComparableSubjects(subject, [memberMember, memberReference, referenceReference, providerOnly])
  assert.equal(r.ok, true)
  if (!r.ok) return
  // Original stable order preserved; provider-only (index 3) is NOT retrieved.
  assert.deepEqual(r.comparable, [
    { index: 0, via: "exact_provider_object" },
    { index: 1, via: "explicit_cross_link" },
    { index: 2, via: "shared_referenced_object" },
  ])
  // Retrieval returns ONLY index + a closed key — never raw object identity.
  for (const m of r.comparable) {
    assert.deepEqual(Object.keys(m).sort(), ["index", "via"])
    assert.ok(!JSON.stringify(m).includes("999"))
    assert.ok(!JSON.stringify(m).includes("org/"))
  }
})

// ─── Case C: shared third-party reference is recall-only, contributes NO
//     comparison hard positive, and never echoes the shared object id ───────────
test("shared third-party reference: no comparison hard positive, recall-only, no echo", () => {
  const left = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#C1", externalId: "pr-c1", occurredAt: "2020-01-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: "org/common#SHARED999" }] }] })
  const right = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#C2", externalId: "pr-c2", occurredAt: "2026-01-01T00:00:00Z", referencedObjects: [{ provider: "github", sourceObjectId: "org/common#SHARED999" }] }] })
  const cmp = compareGroupingSubjects({ left, right })
  assert.equal(cmp.ok, true)
  if (!cmp.ok) return
  // The shared referenced-only object is NOT a hard positive and NOT strong.
  assert.equal(cmp.hardPositive.length, 0)
  assert.notEqual(cmp.verdict, "strong_match")
  assert.equal(cmp.verdict, "insufficient")
  // No comparison reason or evidence echoes the shared third-party object id.
  const strings: string[] = []
  collectStrings(cmp, strings)
  for (const s of strings) assert.ok(!s.includes("SHARED999"), `comparison leaked shared reference id: ${s}`)
  // But the shared reference DOES widen retrieval (recall-only), via the closed key.
  const retr = retrieveComparableSubjects(left, [right])
  assert.equal(retr.ok, true)
  if (retr.ok) assert.deepEqual(retr.comparable, [{ index: 0, via: "shared_referenced_object" }])
})

// ─── Closed vocabularies are exactly as specified ────────────────────────────

test("verdict / evidence / retrieval vocabularies are the required closed sets", () => {
  assert.deepEqual([...HARD_SPLIT_KINDS], [
    "different_work_object", "different_verifier", "separate_decision_boundary",
    "independently_closable_outcomes", "incompatible_acceptance_boundary",
  ])
  assert.deepEqual([...HARD_POSITIVE_KINDS], [
    "exact_provider_object", "explicit_cross_link", "same_canonical_work_object",
    "same_outcome", "same_verifier", "compatible_acceptance_criteria", "same_decision_boundary",
  ])
  assert.deepEqual([...WEAK_KINDS], [
    "actor_overlap", "container_overlap", "provider_overlap",
    "timestamp_proximity", "related_deadline", "bounded_lexical_similarity",
  ])
  assert.deepEqual([...RETRIEVAL_KEY_KINDS], [
    "exact_provider_object", "explicit_cross_link", "same_canonical_work_object",
    "shared_referenced_object", "exact_work_object_text", "bounded_lexical_similarity",
  ])
})

// ─── F3 runtime-provenance attestation (consumed by F4; Section 6) ───────────

test("F3 attestation: exact result + exact input attests; clones/forgeries/mismatched inputs do not", () => {
  const left = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#A80", externalId: "pr-a80", occurredAt: "2020-01-01T00:00:00Z" }] })
  const right = buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#A80", externalId: "pr-b80", occurredAt: "2026-01-01T00:00:00Z" }] })
  const input = { left, right }
  const result = compareGroupingSubjects(input)
  assert.equal(result.ok, true)

  // Exact success result + exact original input attests.
  const snap = snapshotValidatedGroupingComparisonResult(result, input)
  assert.notEqual(snap, null)
  assert.equal(snap?.verdict, "strong_match")

  // Failed comparison does not attest.
  const failed = compareGroupingSubjects({ left: { formationResult: {} as never }, right })
  assert.equal(failed.ok, false)
  assert.equal(snapshotValidatedGroupingComparisonResult(failed, { left: { formationResult: {} }, right }), null)

  // Spread / JSON / structuredClone / forged result does not attest.
  assert.equal(snapshotValidatedGroupingComparisonResult({ ...result }, input), null)
  assert.equal(snapshotValidatedGroupingComparisonResult(JSON.parse(JSON.stringify(result)), input), null)
  assert.equal(snapshotValidatedGroupingComparisonResult(structuredClone(result), input), null)
  assert.equal(snapshotValidatedGroupingComparisonResult({ ok: true, candidateOnly: true, humanReviewRequired: true, hardSplit: [], hardPositive: [], weakSupport: [], verdict: "strong_match", reasons: [] }, input), null)

  // Exact result + cloned / different input does not attest (identity, not shape).
  assert.equal(snapshotValidatedGroupingComparisonResult(result, { ...input }), null)
  assert.equal(snapshotValidatedGroupingComparisonResult(result, { left, right }), null)
  assert.equal(snapshotValidatedGroupingComparisonResult(result, structuredClone(input)), null)

  // Repeated snapshots do not alias but are deeply equal; a later mutation of the
  // public result cannot change a fresh snapshot.
  const s1 = snapshotValidatedGroupingComparisonResult(result, input)
  const s2 = snapshotValidatedGroupingComparisonResult(result, input)
  assert.notEqual(s1, s2)
  assert.deepEqual(s1, s2)
  ;(result as { verdict?: string }).verdict = "must_split"
  assert.equal(snapshotValidatedGroupingComparisonResult(result, input)?.verdict, "strong_match")
})

test("F3 attestation: a pair-A result cannot be applied to a pair-B input", () => {
  const a = { left: buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#PA", externalId: "pr-pa1", occurredAt: "2020-01-01T00:00:00Z" }] }), right: buildSubject({ sources: [{ provider: "github", sourceObjectId: "org/repo#PA", externalId: "pr-pa2", occurredAt: "2026-01-01T00:00:00Z" }] }) }
  const b = { left: buildSubject({ sources: [{ provider: "slack", sourceObjectId: "T/C/PB", externalId: "msg-pb1", occurredAt: "2020-01-01T00:00:00Z" }] }), right: buildSubject({ sources: [{ provider: "slack", sourceObjectId: "T/C/PB", externalId: "msg-pb2", occurredAt: "2026-01-01T00:00:00Z" }] }) }
  const ra = compareGroupingSubjects(a)
  const rb = compareGroupingSubjects(b)
  assert.ok(ra.ok && rb.ok)
  // Cross-applied → null; self-applied → attests.
  assert.equal(snapshotValidatedGroupingComparisonResult(ra, b), null)
  assert.equal(snapshotValidatedGroupingComparisonResult(rb, a), null)
  assert.notEqual(snapshotValidatedGroupingComparisonResult(ra, a), null)
  assert.notEqual(snapshotValidatedGroupingComparisonResult(rb, b), null)
})

// ─── No LLM / network / provider-extraction surface in F3 modules ────────────

test("F3 modules import no LLM / network / provider-extraction surface", () => {
  const files = ["grouping.ts", "goalIdentity.ts", "groupingTypes.ts"]
  for (const file of files) {
    const path = fileURLToPath(new URL(`../app/lib/application/formation/${file}`, import.meta.url))
    const src = readFileSync(path, "utf8")
    for (const banned of ["/extract/", "fetch(", "http://", "https://", "XMLHttpRequest", "WebSocket", "openai", "anthropic", "llm"]) {
      assert.ok(!src.includes(banned), `${file} must not reference ${banned}`)
    }
  }
})

// ─── F3 ordered-pair binding (Section 6) ─────────────────────────────────────
//
// The attested `comparisonInput` is a caller-owned MUTABLE object. Binding to
// its container identity alone let a caller replace or swap the compared pair
// in place while attestation kept passing, so a genuine pair-A verdict could be
// carried on a container now holding pair C/D. These pin the ordered pair.

type MutablePair = { left: GroupingSubjectInput; right: GroupingSubjectInput }

function pairSubject(tag: string, objectId: string): GroupingSubjectInput {
  return buildSubject({
    sources: [{ provider: "github", sourceObjectId: objectId, externalId: `pr-${tag}`, occurredAt: "2026-01-01T00:00:00Z" }],
    goal: { outcome: `${tag} outcome`, workObject: `${tag} wa` },
  })
}

test("F3 pair binding: replacing both sides of the SAME input object rejects", () => {
  const input = { left: pairSubject("pbA", "org/repo#PB"), right: pairSubject("pbB", "org/repo#PB") } as MutablePair
  const result = compareGroupingSubjects(input)
  assert.ok(result.ok && result.verdict === "strong_match")
  assert.notEqual(snapshotValidatedGroupingComparisonResult(result, input), null, "attests before mutation")

  input.left = pairSubject("pbC", "org/other#PC")
  input.right = pairSubject("pbD", "org/other#PD")
  assert.equal(
    snapshotValidatedGroupingComparisonResult(result, input),
    null,
    "a pair-A verdict must not survive the container being repopulated with C/D",
  )
})

test("F3 pair binding: replacing only one side of the SAME input object rejects", () => {
  const mkInput = () => ({ left: pairSubject("p1A", "org/repo#P1"), right: pairSubject("p1B", "org/repo#P1") }) as MutablePair

  const onlyLeft = mkInput()
  const rLeft = compareGroupingSubjects(onlyLeft)
  assert.ok(rLeft.ok)
  onlyLeft.left = pairSubject("p1X", "org/other#PX")
  assert.equal(snapshotValidatedGroupingComparisonResult(rLeft, onlyLeft), null, "replaced left must reject")

  const onlyRight = mkInput()
  const rRight = compareGroupingSubjects(onlyRight)
  assert.ok(rRight.ok)
  onlyRight.right = pairSubject("p1Y", "org/other#PY")
  assert.equal(snapshotValidatedGroupingComparisonResult(rRight, onlyRight), null, "replaced right must reject")
})

test("F3 pair binding: swapping left/right on the SAME input object rejects (ordered)", () => {
  const input = { left: pairSubject("swA", "org/repo#SW"), right: pairSubject("swB", "org/repo#SW") } as MutablePair
  const result = compareGroupingSubjects(input)
  assert.ok(result.ok)
  assert.notEqual(snapshotValidatedGroupingComparisonResult(result, input), null)

  const tmp = input.left
  input.left = input.right
  input.right = tmp
  assert.equal(
    snapshotValidatedGroupingComparisonResult(result, input),
    null,
    "left/right orientation is part of the binding; a swap must reject",
  )
})

test("F3 pair binding: same subject wrapper with a replaced formationResult rejects", () => {
  const input = { left: pairSubject("frA", "org/repo#FR"), right: pairSubject("frB", "org/repo#FR") } as MutablePair
  const result = compareGroupingSubjects(input)
  assert.ok(result.ok)

  // The wrapper object identity is UNCHANGED; only the attested F1C result inside
  // it is swapped for another genuine one.
  const other = pairSubject("frZ", "org/other#FZ")
  ;(input.left as { formationResult: unknown }).formationResult = other.formationResult
  assert.equal(
    snapshotValidatedGroupingComparisonResult(result, input),
    null,
    "a re-pointed formationResult inside the same wrapper must reject",
  )
})

test("F3 pair binding: canonical selector added, removed, or edited rejects", () => {
  const REF = { provider: "github", sourceObjectId: "org/wa#SEL" }
  const withRef = () =>
    buildSubject({
      sources: [{ provider: "github", sourceObjectId: "org/repo#SEL", externalId: "pr-sel", occurredAt: "2026-01-01T00:00:00Z", referencedObjects: [REF] }],
      goal: { outcome: "sel outcome", workObject: "sel wa" },
      canonicalWorkObjectRef: REF,
    })
  const plain = () =>
    buildSubject({
      sources: [{ provider: "github", sourceObjectId: "org/repo#SEL", externalId: "pr-sel2", occurredAt: "2026-01-01T00:00:00Z", referencedObjects: [REF] }],
      goal: { outcome: "sel2 outcome", workObject: "sel2 wa" },
    })

  // Added after comparison.
  const added = { left: plain(), right: plain() } as MutablePair
  const rAdded = compareGroupingSubjects(added)
  assert.ok(rAdded.ok)
  assert.notEqual(snapshotValidatedGroupingComparisonResult(rAdded, added), null)
  ;(added.left as { canonicalWorkObjectRef?: unknown }).canonicalWorkObjectRef = { ...REF }
  assert.equal(snapshotValidatedGroupingComparisonResult(rAdded, added), null, "selector added must reject")

  // Removed after comparison.
  const removed = { left: withRef(), right: plain() } as MutablePair
  const rRemoved = compareGroupingSubjects(removed)
  assert.ok(rRemoved.ok)
  assert.notEqual(snapshotValidatedGroupingComparisonResult(rRemoved, removed), null)
  delete (removed.left as { canonicalWorkObjectRef?: unknown }).canonicalWorkObjectRef
  assert.equal(snapshotValidatedGroupingComparisonResult(rRemoved, removed), null, "selector removed must reject")

  // provider edited in place.
  const editedProvider = { left: withRef(), right: plain() } as MutablePair
  const rProv = compareGroupingSubjects(editedProvider)
  assert.ok(rProv.ok)
  ;(editedProvider.left as { canonicalWorkObjectRef: { provider: string } }).canonicalWorkObjectRef.provider = "slack"
  assert.equal(snapshotValidatedGroupingComparisonResult(rProv, editedProvider), null, "selector provider change must reject")

  // sourceObjectId edited in place.
  const editedId = { left: withRef(), right: plain() } as MutablePair
  const rId = compareGroupingSubjects(editedId)
  assert.ok(rId.ok)
  ;(editedId.left as { canonicalWorkObjectRef: { sourceObjectId: string } }).canonicalWorkObjectRef.sourceObjectId = "org/wa#OTHER"
  assert.equal(snapshotValidatedGroupingComparisonResult(rId, editedId), null, "selector sourceObjectId change must reject")
})

test("F3 pair binding: an untouched exact ordered pair still attests", () => {
  const input = { left: pairSubject("okA", "org/repo#OK"), right: pairSubject("okB", "org/repo#OK") } as MutablePair
  const result = compareGroupingSubjects(input)
  assert.ok(result.ok)
  const snap = snapshotValidatedGroupingComparisonResult(result, input)
  assert.notEqual(snap, null)
  assert.equal(snap?.verdict, "strong_match")
  // Still attests on repeat, and a structural clone of the container still rejects.
  assert.notEqual(snapshotValidatedGroupingComparisonResult(result, input), null)
  assert.equal(snapshotValidatedGroupingComparisonResult(result, { ...input }), null)
})

test("F3 pair binding: a FRESH wrapper around the same formationResult rejects", () => {
  // Isolates the subject-wrapper identity check: the replacement carries the
  // identical attested formationResult and an identically-absent selector, so
  // only the wrapper object identity differs.
  const mk = () => ({ left: pairSubject("wrA", "org/repo#WR"), right: pairSubject("wrB", "org/repo#WR") }) as MutablePair

  const leftSwap = mk()
  const rLeft = compareGroupingSubjects(leftSwap)
  assert.ok(rLeft.ok)
  assert.notEqual(snapshotValidatedGroupingComparisonResult(rLeft, leftSwap), null)
  leftSwap.left = { formationResult: leftSwap.left.formationResult }
  assert.equal(snapshotValidatedGroupingComparisonResult(rLeft, leftSwap), null, "replaced left wrapper must reject")

  const rightSwap = mk()
  const rRight = compareGroupingSubjects(rightSwap)
  assert.ok(rRight.ok)
  rightSwap.right = { formationResult: rightSwap.right.formationResult }
  assert.equal(snapshotValidatedGroupingComparisonResult(rRight, rightSwap), null, "replaced right wrapper must reject")
})
