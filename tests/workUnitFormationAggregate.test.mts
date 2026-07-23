/**
 * F1C — WorkUnit Formation Aggregate permanent tests.
 *
 * Valid fixtures are built through the REAL public F1A boundary
 * (`buildFormationSourceCandidate`) and the REAL public F1B boundary
 * (`buildFormationGoalDoneConditionCandidate`). Structural casts are used only
 * in narrow malformed/edge fixtures (unknown role, failed result, raw JSON,
 * isolated F1B-consistency branches) — never as the main proof of the validated
 * F1A/F1B trust boundary.
 */

import test from "node:test"
import assert from "node:assert/strict"
import type { SourceRef } from "../app/lib/domain/types.ts"
import type { DoneConditionDraft } from "../app/lib/application/decomposition/types.ts"
import {
  buildFormationSourceCandidate,
  type FormationSourceContractResult,
  type FormationSourceCandidate,
} from "../app/lib/application/formation/sourceContract.ts"
import {
  buildFormationGoalDoneConditionCandidate,
  type FormationGoalDoneConditionCandidate,
} from "../app/lib/application/formation/goalDoneConditionAdapter.ts"
import {
  buildWorkUnitFormationCandidate,
  FORMATION_SOURCE_ROLES,
  type SourceRole,
} from "../app/lib/application/formation/workUnitFormationAggregate.ts"

type OkResult = Extract<FormationSourceContractResult, { ok: true }>

// ─── Real F1A fixtures ───────────────────────────────────────────────────────

function sourceResult(over: {
  source?: string
  externalId?: string
  url?: string
  container?: string
} = {}): OkResult {
  const source = over.source ?? "github"
  const externalId = over.externalId ?? "pr-1"
  const url = over.url ?? `https://example.com/${source}/${encodeURIComponent(externalId)}`
  const capturedAt = "2026-07-19T00:00:00Z"
  const sourceRef = {
    source,
    externalId,
    url,
    capturedAt,
    ...(over.container !== undefined ? { container: over.container } : {}),
  }
  const json = {
    provider: source,
    sourceRef,
    sourceObjectId: "example-org/example-repo#1",
    title: "PR #1: example",
    sanitizedSummary: "PR #1 is waiting for review",
    actorAssertions: [{ name: "Hayato", assertedRelation: "author" }],
    timestamps: { occurredAt: "2026-07-18T10:00:00Z", capturedAt },
    sourceLinks: [{ url }],
    referencedObjects: [],
    navigationTarget: url,
  }
  const result = buildFormationSourceCandidate(JSON.stringify(json))
  if (!result.ok) throw new Error(`F1A fixture rejected: ${JSON.stringify(result.findings)}`)
  return result
}

const ghResult = sourceResult({ source: "github", externalId: "pr-1" })
const ntResult = sourceResult({ source: "notion", externalId: "page-9" })
const ghCandidate = ghResult.candidate
const ntCandidate = ntResult.candidate
const ghRef: SourceRef = ghCandidate.sourceRef
const ntRef: SourceRef = ntCandidate.sourceRef

// ─── Real F1B fixtures ───────────────────────────────────────────────────────

const fullGoal = {
  outcome: "The formation spec is approved",
  workObject: "The formation spec document",
  decisionNeeded: "Approve or reject the spec",
  scope: "Only the F1C aggregate surface",
  verifier: "human_owner",
  timeHorizon: "Before the next release gate",
}

function draft(over: Partial<DoneConditionDraft> = {}): DoneConditionDraft {
  return {
    outcome: "Spec approved",
    verifier: "human_owner",
    acceptanceCriteria: ["Reviewer confirms the spec"],
    humanInputRef: "human:reviewer",
    missingFields: [],
    status: "complete",
    invalidReasons: [],
    riskFlags: [],
    candidateOnly: true,
    ...over,
  }
}

function f1b(over: {
  doneCondition?: DoneConditionDraft
  evidenceRefs?: readonly SourceRef[]
  validatedSources?: readonly FormationSourceCandidate[]
} = {}): FormationGoalDoneConditionCandidate {
  return buildFormationGoalDoneConditionCandidate({
    goal: fullGoal,
    doneCondition: over.doneCondition ?? draft(),
    evidenceRefs: over.evidenceRefs,
    validatedSources: over.validatedSources ?? [ghCandidate],
  })
}

/** Default F1B: human-input anchor, no evidence refs → empty evidenceRefs. */
const f1bHumanOnly = f1b()

function member(sourceResultValue: OkResult, role: SourceRole) {
  return { sourceResult: sourceResultValue, role }
}

function build(members: ReadonlyArray<{ sourceResult: OkResult; role: SourceRole }>, gdc = f1bHumanOnly) {
  return buildWorkUnitFormationCandidate({ members, goalDoneCondition: gdc } as never)
}

// ─── SourceRole ──────────────────────────────────────────────────────────────

// 1
test("role enum is exactly the required closed set", () => {
  assert.deepEqual([...FORMATION_SOURCE_ROLES], [
    "implementation",
    "original_request",
    "accepted_specification",
    "decision_record",
    "external_context",
    "review_state",
    "evidence",
    "open_question",
    "deadline_context",
    "historical_context",
    "contradicting_claim",
  ])
})

// 2
test("every role is accepted and preserved", () => {
  for (const role of FORMATION_SOURCE_ROLES) {
    const r = build([member(ghResult, role)])
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.candidate.members[0].role, role)
  }
})

// 3
test("unknown role is rejected at runtime", () => {
  const r = build([member(ghResult, "not_a_role" as unknown as SourceRole)])
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "unknown_source_role")
})

// 4
test("provider never determines role", () => {
  const a = build([member(ghResult, "evidence")]) // github but role evidence, not implementation
  const b = build([member(ntResult, "implementation")]) // notion but role implementation
  assert.equal(a.ok && a.candidate.members[0].role, "evidence")
  assert.equal(b.ok && b.candidate.members[0].role, "implementation")
})

// 5
test("same provider can carry different roles in separate aggregates", () => {
  const a = build([member(ghResult, "implementation")])
  const b = build([member(sourceResult({ source: "github", externalId: "pr-2" }), "review_state")])
  assert.equal(a.ok && a.candidate.members[0].role, "implementation")
  assert.equal(b.ok && b.candidate.members[0].role, "review_state")
})

// 6
test("same validated source can carry different roles in separate aggregates", () => {
  const a = build([member(ghResult, "original_request")])
  const b = build([member(ghResult, "decision_record")])
  assert.equal(a.ok && a.candidate.members[0].role, "original_request")
  assert.equal(b.ok && b.candidate.members[0].role, "decision_record")
})

// ─── Validated members ───────────────────────────────────────────────────────

// 7
test("one successful F1A result can form a candidate", () => {
  const r = build([member(ghResult, "evidence")])
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.candidate.members.length, 1)
})

// 8
test("two or more successful F1A results form plural membership", () => {
  const r = build([member(ghResult, "evidence"), member(ntResult, "accepted_specification")])
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.candidate.members.length, 2)
})

// 9
test("failed F1A result is rejected", () => {
  const failed = buildFormationSourceCandidate(JSON.stringify({ provider: "github" })) // missing fields
  assert.equal(failed.ok, false)
  const r = build([{ sourceResult: failed as unknown as OkResult, role: "evidence" }])
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "member_not_validated")
})

// 10
test("empty membership is rejected", () => {
  const r = build([])
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "empty_members")
})

// 11
test("member order is preserved", () => {
  const r1 = build([member(ghResult, "evidence"), member(ntResult, "evidence")])
  const r2 = build([member(ntResult, "evidence"), member(ghResult, "evidence")])
  assert.equal(r1.ok && r1.candidate.members[0].source.sourceRef.source, "github")
  assert.equal(r2.ok && r2.candidate.members[0].source.sourceRef.source, "notion")
})

// 12
test("source candidate fields are preserved", () => {
  const r = build([member(ghResult, "evidence")])
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.candidate.members[0].source, ghCandidate)
})

// 13
test("raw JSON is not accepted directly as a member source", () => {
  const raw = JSON.stringify({ provider: "github", sourceRef: ghRef })
  const r = build([{ sourceResult: raw as unknown as OkResult, role: "evidence" }])
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "member_not_validated")
})

// 14
test("structurally matching unvalidated object is not the primary valid path", () => {
  // The primary valid path uses the REAL F1A builder (see every other test).
  // A hand-built object with a MALFORMED canonical identity fails closed here;
  // full F1A validation is deliberately NOT reimplemented in F1C.
  const structural = { ok: true, candidate: { sourceRef: { source: "", externalId: "" } } }
  const r = build([{ sourceResult: structural as unknown as OkResult, role: "evidence" }])
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "member_not_validated")
})

// ─── Duplicate rejection ─────────────────────────────────────────────────────

// 15
test("same success result repeated is rejected", () => {
  const r = build([member(ghResult, "evidence"), member(ghResult, "evidence")])
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "duplicate_member_identity")
})

// 16
test("same SourceRef identity from two candidates is rejected", () => {
  const ghAgain = sourceResult({ source: "github", externalId: "pr-1", url: "https://example.com/other" })
  const r = build([member(ghResult, "evidence"), member(ghAgain, "decision_record")])
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "duplicate_member_identity")
})

// 17
test("duplicate source with different roles is rejected", () => {
  const r = build([member(ghResult, "implementation"), member(ghResult, "review_state")])
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "duplicate_member_identity")
})

// 18
test("similar URL but distinct identity remains distinct", () => {
  const a = sourceResult({ source: "github", externalId: "pr-1", url: "https://example.com/shared" })
  const b = sourceResult({ source: "github", externalId: "pr-2", url: "https://example.com/shared" })
  const r = build([member(a, "evidence"), member(b, "evidence")])
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.candidate.members.length, 2)
})

// 19
test("similar externalId under different source remains distinct", () => {
  const gh = sourceResult({ source: "github", externalId: "same-id" })
  const nt = sourceResult({ source: "notion", externalId: "same-id" })
  const r = build([member(gh, "evidence"), member(nt, "evidence")])
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.candidate.members.length, 2)
})

// 20
test("delimiter-containing identities do not collide", () => {
  const a = sourceResult({ source: "github", externalId: "a:b/c" })
  const b = sourceResult({ source: "github", externalId: "a" })
  const distinct = build([member(a, "evidence"), member(b, "evidence")])
  assert.equal(distinct.ok, true)
  if (distinct.ok) assert.equal(distinct.candidate.members.length, 2)
  // exact identity still dedups
  const dup = build([member(a, "evidence"), member(sourceResult({ source: "github", externalId: "a:b/c" }), "evidence")])
  assert.equal(dup.ok, false)
})

// 21
test("duplicate input is not silently deduplicated", () => {
  const r = build([member(ghResult, "evidence"), member(ghResult, "evidence")])
  assert.equal(r.ok, false) // rejected, not reduced to one member
})

// ─── F1B consistency ─────────────────────────────────────────────────────────

// 22
test("every F1B evidenceRef matching a member is accepted", () => {
  const gdc = f1b({ validatedSources: [ghCandidate], evidenceRefs: [ghRef] })
  assert.ok(gdc.evidenceRefs.length >= 1)
  const r = build([member(ghResult, "evidence")], gdc)
  assert.equal(r.ok, true)
})

// 23
test("unknown F1B evidenceRef rejects the aggregate", () => {
  const gdc = f1b({ validatedSources: [ghCandidate, ntCandidate], evidenceRefs: [ghRef, ntRef] })
  assert.ok(gdc.evidenceRefs.some((r) => r.source === "notion"))
  const r = build([member(ghResult, "evidence")], gdc) // notion is NOT a member
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "evidence_ref_not_a_member")
})

// 24
test("matching primary Done Condition sourceRef is accepted", () => {
  const gdc = f1b({
    validatedSources: [ghCandidate],
    doneCondition: draft({ humanInputRef: undefined, sourceRef: ghRef }),
  })
  assert.ok(gdc.doneCondition.sourceRef)
  const r = build([member(ghResult, "evidence")], gdc)
  assert.equal(r.ok, true)
})

// 25
test("unknown primary sourceRef rejects the aggregate", () => {
  // Narrow structural F1B fixture isolating the primary-consistency branch:
  // a primary sourceRef with NO co-located evidence ref.
  const gdc = {
    goal: fullGoal,
    doneCondition: {
      outcome: "o",
      verifier: "human_owner",
      acceptanceCriteria: ["c"],
      sourceRef: { source: "notion", externalId: "page-9", capturedAt: "2026-07-19T00:00:00Z" },
      missingFields: [],
      status: "complete",
      invalidReasons: [],
      riskFlags: [],
      candidateOnly: true,
    },
    evidenceRefs: [],
    independentClosure: "unknown",
    adapterIssues: [],
    humanReviewRequired: true,
    candidateOnly: true,
  } as unknown as FormationGoalDoneConditionCandidate
  const r = build([member(ghResult, "evidence")], gdc)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "primary_source_ref_not_a_member")
})

// 26
test("human-input-only Done Condition is accepted without a primary sourceRef", () => {
  const gdc = f1b({ validatedSources: [ghCandidate], doneCondition: draft() }) // humanInputRef anchor
  assert.equal(gdc.doneCondition.sourceRef, undefined)
  const r = build([member(ghResult, "evidence")], gdc)
  assert.equal(r.ok, true)
})

// 27
test("F1B evidenceRefs cannot add members", () => {
  const gdc = f1b({ validatedSources: [ghCandidate], evidenceRefs: [ghRef] })
  const r = build([member(ghResult, "evidence")], gdc)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.candidate.members.length, 1) // only the explicit member
})

// 28
test("members absent from evidenceRefs may still exist as contextual members", () => {
  const gdc = f1b({ validatedSources: [ghCandidate], evidenceRefs: [ghRef] })
  const r = build([member(ghResult, "evidence"), member(ntResult, "external_context")], gdc)
  assert.equal(r.ok, true) // notion is contextual; not referenced by F1B
  if (r.ok) assert.equal(r.candidate.members.length, 2)
})

// 29
test("the aggregate does not rewrite F1B evidenceRefs", () => {
  const gdc = f1b({ validatedSources: [ghCandidate], evidenceRefs: [ghRef] })
  const before = JSON.parse(JSON.stringify(gdc.evidenceRefs))
  const r = build([member(ghResult, "evidence")], gdc)
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.candidate.goalDoneCondition.evidenceRefs, before)
})

// 30
test("the aggregate does not rewrite F1B adapterIssues", () => {
  const gdc = f1b({ validatedSources: [ghCandidate], evidenceRefs: [ghRef] })
  const before = JSON.parse(JSON.stringify(gdc.adapterIssues))
  const r = build([member(ghResult, "evidence")], gdc)
  if (r.ok) assert.deepEqual(r.candidate.goalDoneCondition.adapterIssues, before)
})

// ─── Canonical status preservation ───────────────────────────────────────────

function partialGdc(): FormationGoalDoneConditionCandidate {
  return f1b({ validatedSources: [ghCandidate], doneCondition: draft({ outcome: "   " }) }) // blank outcome → partial
}
function invalidGdc(): FormationGoalDoneConditionCandidate {
  return f1b({ validatedSources: [ghCandidate], doneCondition: draft({ verifier: "AI" }) }) // AI verifier → invalid
}

// 31
test("complete remains complete", () => {
  const r = build([member(ghResult, "evidence")], f1bHumanOnly)
  assert.equal(r.ok && r.candidate.goalDoneCondition.doneCondition.status, "complete")
})

// 32
test("partial remains partial", () => {
  const r = build([member(ghResult, "evidence")], partialGdc())
  assert.equal(r.ok && r.candidate.goalDoneCondition.doneCondition.status, "partial")
})

// 33
test("invalid remains invalid", () => {
  const r = build([member(ghResult, "evidence")], invalidGdc())
  assert.equal(r.ok && r.candidate.goalDoneCondition.doneCondition.status, "invalid")
})

// 34
test("member count cannot upgrade partial", () => {
  const r = build([member(ghResult, "evidence"), member(ntResult, "evidence")], partialGdc())
  assert.equal(r.ok && r.candidate.goalDoneCondition.doneCondition.status, "partial")
})

// 35
test("role cannot upgrade partial or invalid", () => {
  const p = build([member(ghResult, "accepted_specification")], partialGdc())
  const i = build([member(ghResult, "accepted_specification")], invalidGdc())
  assert.equal(p.ok && p.candidate.goalDoneCondition.doneCondition.status, "partial")
  assert.equal(i.ok && i.candidate.goalDoneCondition.doneCondition.status, "invalid")
})

// 36
test("adapter issues cannot assign status", () => {
  const gdc = partialGdc()
  assert.ok(gdc.adapterIssues.length >= 0)
  const r = build([member(ghResult, "evidence")], gdc)
  assert.equal(r.ok && r.candidate.goalDoneCondition.doneCondition.status, "partial")
})

// 37
test("incoming F1B missingFields remain unchanged", () => {
  const gdc = partialGdc()
  const r = build([member(ghResult, "evidence")], gdc)
  if (r.ok) assert.deepEqual(r.candidate.goalDoneCondition.doneCondition.missingFields, gdc.doneCondition.missingFields)
})

// 38
test("incoming F1B invalidReasons remain unchanged", () => {
  const gdc = invalidGdc()
  const r = build([member(ghResult, "evidence")], gdc)
  if (r.ok) assert.deepEqual(r.candidate.goalDoneCondition.doneCondition.invalidReasons, gdc.doneCondition.invalidReasons)
})

// 39
test("no aggregate-local completion status field exists", () => {
  const r = build([member(ghResult, "evidence")])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal("status" in r.candidate, false)
    assert.equal("validForFormalCandidate" in r.candidate, false)
    assert.equal("missingFields" in r.candidate, false)
    assert.equal("invalidReasons" in r.candidate, false)
  }
})

// ─── Safety boundary ─────────────────────────────────────────────────────────

// 40 & 41
test("candidateOnly and humanReviewRequired are literal true", () => {
  const r = build([member(ghResult, "evidence")])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.candidate.candidateOnly, true)
    assert.equal(r.candidate.humanReviewRequired, true)
  }
})

// 42
test("input cannot set either literal false", () => {
  const r = buildWorkUnitFormationCandidate({
    members: [member(ghResult, "evidence")],
    goalDoneCondition: f1bHumanOnly,
    candidateOnly: false,
    humanReviewRequired: false,
  } as never)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.candidate.candidateOnly, true)
    assert.equal(r.candidate.humanReviewRequired, true)
  }
})

// 43–50
test("no formalization / merge / split / approval / execution / raw / identity / projection / grouping field exists", () => {
  const r = build([member(ghResult, "evidence")])
  assert.equal(r.ok, true)
  if (!r.ok) return
  const forbidden = [
    "formalized", "formalCandidate", "approved", "approvalId", "executed", "executionId", "done",
    "merged", "mergeCandidate", "mergeApproved", "mergeAuthorization",
    "split", "splitCandidate", "splitApproved", "splitAuthorization",
    "raw", "rawPayload", "providerPayload", "tenantId", "actorId", "owner",
    "projection", "publicProjection", "groupingEvidence", "groupingVerdict", "formationState",
    "statePrediction", "ranking", "rankingEvidence", "whyNow", "conflicts", "primarySourceRecommendation",
  ]
  for (const key of forbidden) assert.equal(key in r.candidate, false, `unexpected field: ${key}`)
})

// ─── Purity ──────────────────────────────────────────────────────────────────

// 51
test("repeated calls are deeply equal", () => {
  const members = [member(ghResult, "evidence"), member(ntResult, "external_context")]
  const a = buildWorkUnitFormationCandidate({ members, goalDoneCondition: f1bHumanOnly } as never)
  const b = buildWorkUnitFormationCandidate({ members, goalDoneCondition: f1bHumanOnly } as never)
  assert.deepEqual(a, b)
})

// 52
test("inputs are not mutated", () => {
  const members = [member(ghResult, "evidence"), member(ntResult, "external_context")]
  const input = { members, goalDoneCondition: f1bHumanOnly }
  const snapshot = JSON.parse(JSON.stringify(input))
  buildWorkUnitFormationCandidate(input as never)
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot)
})

// 53
test("rejected input is not repaired", () => {
  const members = [member(ghResult, "evidence"), member(ghResult, "evidence")]
  const r = buildWorkUnitFormationCandidate({ members, goalDoneCondition: f1bHumanOnly } as never)
  assert.equal(r.ok, false)
  assert.equal(members.length, 2) // input untouched, not deduplicated
})

// 54
test("member source order is deterministic", () => {
  const order = [member(ntResult, "evidence"), member(ghResult, "evidence")]
  const r = build(order)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.candidate.members[0].source.sourceRef.source, "notion")
    assert.equal(r.candidate.members[1].source.sourceRef.source, "github")
  }
})

// 55
test("role association remains deterministic", () => {
  const r1 = build([member(ghResult, "decision_record"), member(ntResult, "open_question")])
  const r2 = build([member(ghResult, "decision_record"), member(ntResult, "open_question")])
  assert.equal(r1.ok && r1.candidate.members.map((m) => m.role).join(","), "decision_record,open_question")
  assert.deepEqual(r1, r2)
})
