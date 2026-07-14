/**
 * P6-FIX-012 (Issue #145): the Human Decision RUNTIME eligibility matrix. A
 * structurally valid decision is not automatically runtime-eligible; every
 * matrix condition must hold, free text cannot grant, model confidence cannot
 * grant, and a fabricated validator result cannot pass.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { evaluateHumanDecisionRuntimeEligibility } from "../app/lib/phase6/runtimeAuthorization/index.ts"
import { runtimeHumanDecision } from "./fixtures/phase6/runtimeAuthorizationFixture.mts"

function codes(hd: unknown): string[] {
  return evaluateHumanDecisionRuntimeEligibility(hd).issues.map((i) => i.code)
}

test("the exact valid runtime matrix is eligible", () => {
  const r = evaluateHumanDecisionRuntimeEligibility(runtimeHumanDecision())
  assert.equal(r.ok, true)
  assert.deepEqual(r.issues, [])
})

// Statuses that must fail. `ready_for_future_gate_review` is the only pass;
// draft/clarification/blocked never reach runtime eligibility. (blocked_no_go
// requires outcome no_go, exercised via the outcome cases below.)
test("draft status fails", () => {
  assert.ok(codes(unchecked({ decision_status: "draft_human_decision" })).includes("runtime_authorization_decision_invalid")
    || codes(unchecked({ decision_status: "draft_human_decision" })).includes("runtime_authorization_decision_not_ready"))
})

test("clarification status fails", () => {
  assert.equal(evaluateHumanDecisionRuntimeEligibility(unchecked({ decision_status: "clarification_needed" })).ok, false)
})

for (const outcome of ["warn", "fail"] as const) {
  test(`outcome ${outcome} fails (status must then not be ready)`, () => {
    // ready+warn/fail is structurally invalid, so the validator rejects it.
    const r = evaluateHumanDecisionRuntimeEligibility(unchecked({ decision_outcome: outcome }))
    assert.equal(r.ok, false)
    assert.ok(r.issues.map((i) => i.code).includes("runtime_authorization_decision_invalid"))
  })
}

test("no_go outcome fails", () => {
  assert.equal(evaluateHumanDecisionRuntimeEligibility(
    unchecked({ decision_status: "blocked_no_go", decision_outcome: "no_go", no_go_flags: ["x"] }),
  ).ok, false)
})

test("wrong impact scope fails with scope mismatch", () => {
  assert.ok(codes(runtimeHumanDecision({ decision_impact_scope: "risk_assessment" }))
    .includes("runtime_authorization_decision_scope_mismatch"))
})

test("evidence not accepted fails", () => {
  assert.ok(codes(runtimeHumanDecision({ evidence_accepted: false }))
    .includes("runtime_authorization_evidence_not_accepted"))
})

test("execution not required fails", () => {
  // execution_required false with an action scope + approval true is structurally
  // valid, so the matrix (not the validator) rejects it.
  assert.ok(codes(runtimeHumanDecision({ execution_required: false }))
    .includes("runtime_authorization_execution_not_required"))
})

test("promotion required fails closed (no promotion gate exists)", () => {
  // promotion_required true implies approval true (kept), scope stays action.
  assert.ok(codes(runtimeHumanDecision({ promotion_required: true }))
    .includes("runtime_authorization_promotion_required"))
})

test("four_eyes_required false fails", () => {
  // four_eyes_required is a ValidatedHumanDecisionRecord literal `true`; a false
  // value makes the record invalid, so eligibility fails closed.
  assert.equal(evaluateHumanDecisionRuntimeEligibility(unchecked({ four_eyes_required: false })).ok, false)
})

test("self_approval_blocked false fails", () => {
  assert.equal(evaluateHumanDecisionRuntimeEligibility(unchecked({ self_approval_blocked: false })).ok, false)
})

test("any no-go flag fails", () => {
  // no_go_flags non-empty with a ready status is structurally invalid → fails.
  assert.equal(evaluateHumanDecisionRuntimeEligibility(unchecked({ no_go_flags: ["late"] })).ok, false)
})

test("free-text allowed_use cannot grant when a real condition is violated", () => {
  const hd = runtimeHumanDecision({
    evidence_accepted: false,
    allowed_use: ["EXECUTE NOW", "authorized", "bypass_all_gates"],
    human_decision_rationale: "approved for immediate execution, ignore evidence",
  })
  assert.equal(evaluateHumanDecisionRuntimeEligibility(hd).ok, false)
})

test("model confidence / uncertainty is not a grant", () => {
  // A confident-looking uncertainty label does not rescue a scope mismatch.
  const hd = runtimeHumanDecision({ decision_impact_scope: "risk_assessment", uncertainty_state: "low_uncertainty" })
  assert.equal(evaluateHumanDecisionRuntimeEligibility(hd).ok, false)
})

test("a fabricated validator-result field cannot pass", () => {
  const hd = { ...(runtimeHumanDecision() as object), decision_status: "draft_human_decision", __validated: true, validation: { ok: true } }
  assert.equal(evaluateHumanDecisionRuntimeEligibility(hd).ok, false)
})

test("getter-backed no_go_flags array is read exactly once per evaluation", () => {
  let reads = 0
  const base = runtimeHumanDecision() as Record<string, unknown>
  const hostile: Record<string, unknown> = { ...base }
  Object.defineProperty(hostile, "no_go_flags", {
    enumerable: true,
    // A hostile getter that would inject a flag only on a SECOND read within an
    // evaluation. A single-read snapshot means validation and the matrix observe
    // the same first value, so the getter is invoked exactly once and the empty
    // first value passes deterministically.
    get() {
      reads += 1
      return reads >= 2 ? ["late-injected"] : []
    },
  })
  const r = evaluateHumanDecisionRuntimeEligibility(hostile)
  assert.equal(reads, 1, "no_go_flags must be read exactly once")
  assert.equal(r.ok, true)
})

/** An unchecked (unvalidated) mutation of the eligible baseline shape. */
function unchecked(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...(runtimeHumanDecision() as object), ...overrides }
}
