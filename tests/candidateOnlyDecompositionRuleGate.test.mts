import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  evaluateCandidateOnlyDecompositionRuleGate,
  createBlockedCandidateOnlyDecompositionRuleGateResult,
} from "../app/lib/application/llmProvider/candidateOnlyDecompositionRuleGate.ts"

const SRC = readFileSync(join(import.meta.dirname!, "../app/lib/application/llmProvider/candidateOnlyDecompositionRuleGate.ts"), "utf-8")

// Local fixture — no runtime imports from 4I
function cls(opts?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    phase: "phase_4i_candidate_only_decomposition_classifier",
    candidateOnly: true,
    rawCandidateTextIncluded: false,
    decision: "classify_candidate_type",
    candidateType: "workunit_candidate",
    reason: "dry_run_workunit_candidate_detected",
    liveIntegrationAllowed: false,
    externalExecutionAllowed: false,
    approvalCreationAllowed: false,
    executionCreationAllowed: false,
    productionPipelineConnected: false,
    uiConnected: false,
    apiConnected: false,
    sourceSignalConnected: false,
    realContextPackBuilderConnected: false,
    realExclusionScannerConnected: false,
    mockBoundaryHarnessConnected: false,
    guardedChainConnected: false,
    decompositionOrchestratorConnected: false,
    actionFieldConnected: false,
    humanReviewConnected: false,
    ...opts,
  }
}

const workunit = cls()
const blocked = cls({ decision: "block_candidate_type", candidateType: "blocked_candidate", reason: "mock_boundary_blocked" })
const clarification = cls({ candidateType: "clarification_needed", reason: "missing_mock_boundary_text" })

function gate(u: unknown) { return evaluateCandidateOnlyDecompositionRuleGate(u as unknown as Parameters<typeof evaluateCandidateOnlyDecompositionRuleGate>[0]) }

// ─── Classification paths ─────────────────────────────────────

test("workunit_candidate classifier result allows", () => {
  const r = gate(workunit)
  assert.equal(r.decision, "allow_candidate_only_decomposition")
  assert.equal(r.reason, "workunit_candidate_allowed_by_rule_gate")
})

test("blocked classifier result blocks", () => {
  const r = gate(blocked)
  assert.equal(r.decision, "block_candidate_only_decomposition")
  assert.equal(r.reason, "classifier_blocked_by_rule_gate")
})

test("clarification_needed classifier result requests clarification", () => {
  const r = gate(clarification)
  assert.equal(r.decision, "request_candidate_clarification")
  assert.equal(r.reason, "classifier_requires_clarification")
})

// ─── Contract validation ──────────────────────────────────────

test("candidateOnly false blocks", () => {
  assert.equal(gate(cls({ candidateOnly: false })).decision, "block_candidate_only_decomposition")
})

test("rawCandidateTextIncluded true blocks", () => {
  assert.equal(gate(cls({ rawCandidateTextIncluded: true })).decision, "block_candidate_only_decomposition")
})

// ─── Inherited flag validation ────────────────────────────────

for (const [key, name] of [
  ["liveIntegrationAllowed", "live"], ["externalExecutionAllowed", "external"], ["approvalCreationAllowed", "approval"], ["executionCreationAllowed", "execution"],
  ["productionPipelineConnected", "production"], ["uiConnected", "ui"], ["apiConnected", "api"], ["sourceSignalConnected", "sourceSignal"],
  ["realContextPackBuilderConnected", "contextPack"], ["realExclusionScannerConnected", "scanner"], ["mockBoundaryHarnessConnected", "mockHarness"],
  ["guardedChainConnected", "guardedChain"], ["decompositionOrchestratorConnected", "orchestrator"], ["actionFieldConnected", "actionField"], ["humanReviewConnected", "humanReview"],
] as const) {
  test(`inherited ${name} true blocks`, () => {
    assert.equal(gate(cls({ [key]: true })).decision, "block_candidate_only_decomposition")
  })
}

// ─── Inconsistent shapes ──────────────────────────────────────

test("decision block_candidate_type with workunit_candidate blocks", () => {
  assert.equal(gate(cls({ decision: "block_candidate_type", candidateType: "workunit_candidate" })).decision, "block_candidate_only_decomposition")
})

test("decision classify_candidate_type with blocked_candidate blocks", () => {
  assert.equal(gate(cls({ decision: "classify_candidate_type", candidateType: "blocked_candidate" })).decision, "block_candidate_only_decomposition")
})

test("workunit_candidate with wrong reason blocks", () => {
  assert.equal(gate(cls({ candidateType: "workunit_candidate", reason: "unknown_candidate_shape" })).decision, "block_candidate_only_decomposition")
})

// ─── Own invariants ───────────────────────────────────────────

test("result candidateOnly is true", () => { assert.equal(gate(workunit).candidateOnly, true) })
test("result rawCandidateTextIncluded is false", () => { assert.equal(gate(workunit).rawCandidateTextIncluded, false) })
test("result ruleGateEvaluated is true", () => { assert.equal(gate(workunit).ruleGateEvaluated, true) })
test("result liveIntegrationAllowed is false", () => { assert.equal(gate(workunit).liveIntegrationAllowed, false) })
test("result decompositionOrchestratorConnected is false", () => { assert.equal(gate(workunit).decompositionOrchestratorConnected, false) })
test("result classifierRuntimeConnected is false", () => { assert.equal(gate(workunit).classifierRuntimeConnected, false) })

// ─── Serialized safety ────────────────────────────────────────

test("serialized result has no forbidden fields", () => {
  const s = JSON.stringify(gate(workunit))
  for (const f of ["approvalId", "executionId", "executionPayload", "providerRequest", "providerResponse"]) assert.equal(s.includes(f), false)
  for (const f of ["sk-", "TOKEN", "API_KEY", "Bearer", "SECRET"]) assert.equal(s.includes(f), false)
})

// ─── Determinism + freshness ──────────────────────────────────

test("output is deterministic", () => { assert.deepEqual(gate(workunit), gate(workunit)) })
test("returned object is fresh per call", () => {
  const a = gate(workunit)
  ;(a as unknown as { liveIntegrationAllowed: boolean }).liveIntegrationAllowed = true
  assert.equal(gate(workunit).liveIntegrationAllowed, false)
})

// ─── Helper ───────────────────────────────────────────────────

test("helper returns blocked decision", () => {
  const r = createBlockedCandidateOnlyDecompositionRuleGateResult(blocked as unknown as Parameters<typeof createBlockedCandidateOnlyDecompositionRuleGateResult>[0], "default_blocked")
  assert.equal(r.decision, "block_candidate_only_decomposition")
  assert.equal(r.candidateOnly, true)
})

// ─── Source scans ─────────────────────────────────────────────

test("source has no provider SDK", () => { for (const sdk of ["openai", "anthropic", "deepseek", "gemini", "ollama"]) assert.equal(SRC.includes(sdk), false) })
test("source has no fetch", () => { assert.equal(SRC.includes("fetch("), false) })
test("source has no process.env", () => { assert.equal(SRC.includes("process.env"), false) })

test("source has no forbidden runtime imports", () => {
  for (const p of ["BLOCKED_PROVIDER_ADAPTER", "DRY_RUN_PROVIDER_ADAPTER", "routeProviderAdapter",
    "runCandidateOnlyMockBoundaryHarness", "guardCandidateOnlyContextPackForMockBoundary", "runGuardedCandidateOnlyMockBoundaryChain",
    "classifyCandidateOnlyMockBoundaryResult", "createBlockedCandidateOnlyDecompositionClassifierResult"]) {
    assert.equal(SRC.includes(p), false, `should not contain ${p}`)
  }
})

test("source has no upstream/downstream imports", () => {
  for (const p of ["orchestrator", "processWorkSignal", "generateWorkUnitDraft", "evaluateWorkUnit", "extractCandidate",
    "route.ts", "React", "useState", "useEffect", "Supabase", "createClient", "D1", "database"]) assert.equal(SRC.includes(p), false)
})

test("source imports only CandidateOnlyDecompositionClassifierResult as type-only", () => {
  const imports = SRC.match(/^import .+$/gm) ?? []
  assert.equal(imports.length, 1)
  assert.ok(imports[0].startsWith("import type "))
  assert.ok(imports[0].includes("CandidateOnlyDecompositionClassifierResult"))
  assert.ok(imports[0].includes("./candidateOnlyDecompositionClassifier.ts"))
})

test("result approvalCreationAllowed is false", () => { assert.equal(gate(workunit).approvalCreationAllowed, false) })
test("result executionCreationAllowed is false", () => { assert.equal(gate(workunit).executionCreationAllowed, false) })
test("result productionPipelineConnected is false", () => { assert.equal(gate(workunit).productionPipelineConnected, false) })
test("result uiConnected is false", () => { assert.equal(gate(workunit).uiConnected, false) })
test("result apiConnected is false", () => { assert.equal(gate(workunit).apiConnected, false) })
test("result sourceSignalConnected is false", () => { assert.equal(gate(workunit).sourceSignalConnected, false) })
test("result realContextPackBuilderConnected is false", () => { assert.equal(gate(workunit).realContextPackBuilderConnected, false) })
test("result realExclusionScannerConnected is false", () => { assert.equal(gate(workunit).realExclusionScannerConnected, false) })
test("result mockBoundaryHarnessConnected is false", () => { assert.equal(gate(workunit).mockBoundaryHarnessConnected, false) })
test("result guardedChainConnected is false", () => { assert.equal(gate(workunit).guardedChainConnected, false) })
test("result actionFieldConnected is false", () => { assert.equal(gate(workunit).actionFieldConnected, false) })
test("result humanReviewConnected is false", () => { assert.equal(gate(workunit).humanReviewConnected, false) })

test("result externalExecutionAllowed is false", () => { assert.equal(gate(workunit).externalExecutionAllowed, false) })
