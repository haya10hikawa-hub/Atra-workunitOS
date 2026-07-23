import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  classifyDecompositionCandidate,
  detectForbiddenPromotion,
  evaluateDoneConditionDraft,
} from "../app/lib/application/decomposition/decompositionClassifier.ts"
import type { DoneConditionDraft } from "../app/lib/application/decomposition/types.ts"
import type { SourceRef } from "../app/lib/domain/types.ts"

const sourceRef: SourceRef = {
  source: "manual",
  externalId: "p0",
  capturedAt: "2026-06-21T00:00:00.000Z",
}

const completeDone: DoneConditionDraft = {
  outcome: "PM can review the contract memo.",
  verifier: "human_owner",
  acceptanceCriteria: ["Memo is ready for PM review."],
  sourceRef,
  missingFields: [],
  status: "complete",
  invalidReasons: [],
  riskFlags: [],
  candidateOnly: true,
}

test("P0: DoneCondition complete must not promote to done", () => {
  const reasons = detectForbiddenPromotion({ from: "done_condition", to: "done", doneCondition: completeDone })
  assert.ok(reasons.includes("done_condition_complete_to_done"))
})
test("P0: Merge Candidate must not promote to merged", () => {
  const reasons = detectForbiddenPromotion({ from: "merge_candidate", to: "merged" })
  assert.ok(reasons.includes("merge_candidate_to_merged"))
})

test("P0: Split Candidate must not promote to finalized split", () => {
  const reasons = detectForbiddenPromotion({ from: "split_candidate", to: "finalized_split" })
  assert.ok(reasons.includes("split_candidate_to_finalized_split"))
})

test("P0: draft, preview, approval cannot skip boundaries", () => {
  assert.ok(detectForbiddenPromotion({ from: "draft", to: "approved" }).includes("draft_to_approved"))
  assert.ok(detectForbiddenPromotion({ from: "preview", to: "approval" }).includes("preview_to_approval"))
  assert.ok(detectForbiddenPromotion({ from: "approval", to: "execution" }).includes("approval_to_execution"))
})

test("P0: Evidence Noise and Subtask must not promote to Formal", () => {
  assert.ok(detectForbiddenPromotion({ from: "evidence", to: "formal" }).includes("evidence_to_formal_without_independent_done_condition"))
  assert.ok(detectForbiddenPromotion({ from: "noise", to: "formal" }).includes("noise_to_formal"))
  assert.ok(detectForbiddenPromotion({ from: "subtask", to: "formal" }).includes("subtask_to_formal_without_separate_boundary"))
})

test("P0: AI verifier is rejected", () => {
  const status = evaluateDoneConditionDraft({ ...completeDone, verifier: "AI" })
  assert.equal(status.status, "invalid")
  assert.ok(status.invalidReasons.includes("ai_verifier_forbidden"))
})

test("P0: sourceRef-less Formal Node is not accepted", () => {
  const result = classifyDecompositionCandidate({
    text: "A社契約書の修正要否を金曜までにPM確認可能なメモにする",
  })
  assert.notEqual(result.target, "formal_node_candidate")
  assert.equal(result.doneCondition.status, "partial")
  assert.ok(result.doneCondition.missingFields.includes("sourceRefOrHumanInputRef"))
})

test("P0: forbidden AI context fields are blocked", () => {
  const result = classifyDecompositionCandidate({
    text: "Slack投稿を準備する",
    sourceRef,
    context: { approvalId: "approval:1", nested: { targetHash: "hash" } },
  })
  assert.equal(result.target, "noise_candidate")
  assert.equal(result.humanReview?.severity, "p0")
  assert.ok(result.doneCondition.invalidReasons.includes("forbidden_context_field_present"))
})

test("P0: Pending candidate exposes no Draft Preview Approval Execution fields", () => {
  const result = classifyDecompositionCandidate({ text: "A社の件、金曜まで", sourceRef })
  const flat = JSON.stringify(result.pendingNodeCandidate)
  for (const forbidden of ["Draft", "Preview", "Approval", "Execution", "Execute"]) {
    assert.equal(flat.includes(forbidden), false)
  }
})

test("P0: decomposition source has no Tool Pin executable language", async () => {
  const source = await readFile("app/lib/application/decomposition/decompositionClassifier.ts", "utf8")
  assert.equal(source.includes("Tool Pin"), false)
  assert.equal(source.includes("Send / Post / Execute"), false)
})

// ── Canonical Done Condition presence hardening (prerequisite for PR #192) ──
// evaluateDoneConditionDraft is the SOLE completion authority; malformed runtime
// values must never satisfy completion-presence requirements. Every malformed or
// partial case must also report validForFormalCandidate === false.

function doneWith(overrides: Partial<DoneConditionDraft>): DoneConditionDraft {
  return { ...completeDone, ...overrides }
}

function assertPartialMissing(input: DoneConditionDraft, field: string): void {
  const status = evaluateDoneConditionDraft(input)
  assert.equal(status.status, "partial")
  assert.ok(status.missingFields.includes(field), `missingFields should include ${field}`)
  assert.equal(status.validForFormalCandidate, false)
}

// Outcome
test("presence: valid nonblank outcome can complete", () => {
  const status = evaluateDoneConditionDraft(completeDone)
  assert.equal(status.status, "complete")
  assert.equal(status.validForFormalCandidate, true)
})
test("presence: empty outcome is partial", () => {
  assertPartialMissing(doneWith({ outcome: "" }), "outcome")
})
test("presence: whitespace-only outcome is partial", () => {
  assertPartialMissing(doneWith({ outcome: "   " }), "outcome")
})
test("presence: tab/newline-only outcome is partial", () => {
  assertPartialMissing(doneWith({ outcome: "\t\n" }), "outcome")
})

// Verifier
test("presence: empty verifier is partial", () => {
  assertPartialMissing(doneWith({ verifier: "" }), "verifier")
})
test("presence: whitespace-only verifier is partial", () => {
  assertPartialMissing(doneWith({ verifier: "   " }), "verifier")
})
test("presence: AI verifier remains invalid", () => {
  const status = evaluateDoneConditionDraft(doneWith({ verifier: "AI" }))
  assert.equal(status.status, "invalid")
  assert.ok(status.invalidReasons.includes("ai_verifier_forbidden"))
  assert.equal(status.validForFormalCandidate, false)
})
test("presence: whitespace-padded AI verifier remains invalid", () => {
  const status = evaluateDoneConditionDraft(doneWith({ verifier: "  AI  " }))
  assert.equal(status.status, "invalid")
  assert.ok(status.invalidReasons.includes("ai_verifier_forbidden"))
  assert.equal(status.validForFormalCandidate, false)
})

// Acceptance criteria
test("presence: empty acceptance-criteria array is partial", () => {
  assertPartialMissing(doneWith({ acceptanceCriteria: [] }), "acceptanceCriteria")
})
test("presence: single empty-string criterion is partial", () => {
  assertPartialMissing(doneWith({ acceptanceCriteria: [""] }), "acceptanceCriteria")
})
test("presence: single whitespace criterion is partial", () => {
  assertPartialMissing(doneWith({ acceptanceCriteria: [" "] }), "acceptanceCriteria")
})
test("presence: several blank criteria are partial", () => {
  assertPartialMissing(doneWith({ acceptanceCriteria: ["", "   "] }), "acceptanceCriteria")
})
test("presence: at least one nonblank criterion satisfies the requirement", () => {
  const status = evaluateDoneConditionDraft(
    doneWith({ acceptanceCriteria: ["", "Reviewer confirms the result", "   "] }),
  )
  assert.equal(status.status, "complete")
  assert.equal(status.missingFields.includes("acceptanceCriteria"), false)
  assert.equal(status.validForFormalCandidate, true)
})

// Evidence anchor
test("presence: missing sourceRef and humanInputRef is partial", () => {
  assertPartialMissing(doneWith({ sourceRef: undefined, humanInputRef: undefined }), "sourceRefOrHumanInputRef")
})
test("presence: empty-object runtime sourceRef is partial", () => {
  assertPartialMissing(
    doneWith({ sourceRef: {} as unknown as SourceRef, humanInputRef: undefined }),
    "sourceRefOrHumanInputRef",
  )
})
test("presence: blank sourceRef.source is partial", () => {
  assertPartialMissing(
    doneWith({ sourceRef: { source: "   ", externalId: "id" } as unknown as SourceRef, humanInputRef: undefined }),
    "sourceRefOrHumanInputRef",
  )
})
test("presence: blank sourceRef.externalId is partial", () => {
  assertPartialMissing(
    doneWith({ sourceRef: { source: "github", externalId: "   " } as unknown as SourceRef, humanInputRef: undefined }),
    "sourceRefOrHumanInputRef",
  )
})
test("presence: blank humanInputRef is not a valid anchor", () => {
  assertPartialMissing(doneWith({ sourceRef: undefined, humanInputRef: "   " }), "sourceRefOrHumanInputRef")
})
test("presence: valid sourceRef satisfies the anchor requirement", () => {
  const status = evaluateDoneConditionDraft(doneWith({ sourceRef, humanInputRef: undefined }))
  assert.equal(status.status, "complete")
  assert.equal(status.missingFields.includes("sourceRefOrHumanInputRef"), false)
  assert.equal(status.validForFormalCandidate, true)
})
test("presence: valid nonblank humanInputRef satisfies the anchor requirement", () => {
  const status = evaluateDoneConditionDraft(doneWith({ sourceRef: undefined, humanInputRef: "human:approver" }))
  assert.equal(status.status, "complete")
  assert.equal(status.missingFields.includes("sourceRefOrHumanInputRef"), false)
  assert.equal(status.validForFormalCandidate, true)
})

// Existing security behavior preserved
test("presence: forbidden context remains invalid", () => {
  const status = evaluateDoneConditionDraft(completeDone, { approvalId: "approval:1" })
  assert.equal(status.status, "invalid")
  assert.ok(status.invalidReasons.includes("forbidden_context_field_present"))
  assert.equal(status.validForFormalCandidate, false)
})
test("presence: external-execution context remains invalid", () => {
  const status = evaluateDoneConditionDraft(completeDone, { sendableBody: "hello" })
  assert.equal(status.status, "invalid")
  assert.ok(status.invalidReasons.includes("external_execution_payload_present"))
  assert.equal(status.validForFormalCandidate, false)
})
test("presence: complete remains candidate-only and cannot promote to done", () => {
  const status = evaluateDoneConditionDraft(completeDone)
  assert.equal(status.status, "complete")
  assert.equal(completeDone.candidateOnly, true)
  assert.ok(
    detectForbiddenPromotion({ from: "done_condition", to: "done", doneCondition: completeDone })
      .includes("done_condition_complete_to_done"),
  )
})
test("presence: evaluator is deterministic", () => {
  const draft = doneWith({ acceptanceCriteria: ["", "Reviewer confirms the result"] })
  assert.deepEqual(evaluateDoneConditionDraft(draft), evaluateDoneConditionDraft(draft))
})
test("presence: input draft is not mutated", () => {
  const draft = doneWith({ outcome: "   ", acceptanceCriteria: ["", "  keep  "], humanInputRef: "  h  " })
  const snapshot = JSON.stringify(draft)
  evaluateDoneConditionDraft(draft)
  assert.equal(JSON.stringify(draft), snapshot)
})

test("P0: decomposition modules do not import UI API D1 provider fetch or live LLM", async () => {
  const files = [
    "types.ts",
    "doneConditionGate.ts",
    "promotionRules.ts",
    "pmCorrectionTaxonomy.ts",
    "decompositionClassifier.ts",
  ]
  for (const file of files) {
    const source = await readFile(`app/lib/application/decomposition/${file}`, "utf8")
    assert.equal(source.includes("react"), false, `${file} should not import react`)
    assert.equal(source.includes("next/server"), false, `${file} should not import API helpers`)
    assert.equal(source.includes("/api/"), false, `${file} should not import routes`)
    assert.equal(source.includes("/persistence/d1/"), false, `${file} should not import D1`)
    assert.equal(source.includes("/infrastructure/external/"), false, `${file} should not import providers`)
    assert.equal(source.includes("fetch("), false, `${file} should not call fetch`)
    assert.equal(source.includes("generateJson"), false, `${file} should not call live LLM providers`)
  }
})
