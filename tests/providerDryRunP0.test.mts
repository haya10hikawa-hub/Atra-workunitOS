import test from "node:test"
import assert from "node:assert/strict"
import { FAKE_DRY_RUN_PROVIDER } from "../app/lib/application/llmProvider/fakeDryRunLlmProvider.ts"
import type { LLMContextPack } from "../app/lib/application/llmContext/types.ts"
import { REAL_LLM_PROVIDER_POLICY_REQUIRED } from "../app/lib/application/llmReadiness/realLlmProviderPolicy.ts"

const base: LLMContextPack = {
  route: "fast_extraction", nodeSummary: "test", constraints: {
    externalExecutionBlocked: true, approvalRequired: true, humanReviewRequired: true, forbiddenActions: [],
  },
}

const controls = { featureFlagEnabled: true, globalKillSwitchOpen: true, tenantAllowlisted: true, budgetLimitAvailable: true, redactionApplied: true, auditLoggingEnabled: true, p0ScannerEnabled: true, contextAllowlistApplied: true }

// P0: Forbidden context fields must be rejected.
// The provider boundary in Phase 2A blocks these at the context allowlist level.
// Phase 2C verifies the contract honors this via the preflight.

test("P0: rejects forbidden approvalId in context", () => {
  const bad: LLMContextPack & { approvalId: string } = { ...base, approvalId: "secret" }
  const r = FAKE_DRY_RUN_PROVIDER.adapt({ contextPack: bad }, controls, REAL_LLM_PROVIDER_POLICY_REQUIRED)
  assert.equal(r.ok, false)
})

test("P0: rejects forbidden hash in context", () => {
  const bad: LLMContextPack & { hash: string } = { ...base, hash: "abc123" }
  const r = FAKE_DRY_RUN_PROVIDER.adapt({ contextPack: bad }, controls, REAL_LLM_PROVIDER_POLICY_REQUIRED)
  assert.equal(r.ok, false)
})

test("P0: rejects forbidden tenantId in context", () => {
  const bad: LLMContextPack & { tenantId: string } = { ...base, tenantId: "t1" }
  const r = FAKE_DRY_RUN_PROVIDER.adapt({ contextPack: bad }, controls, REAL_LLM_PROVIDER_POLICY_REQUIRED)
  assert.equal(r.ok, false)
})

test("P0: rejects forbidden userId in context", () => {
  const bad: LLMContextPack & { userId: string } = { ...base, userId: "u1" }
  const r = FAKE_DRY_RUN_PROVIDER.adapt({ contextPack: bad }, controls, REAL_LLM_PROVIDER_POLICY_REQUIRED)
  assert.equal(r.ok, false)
})

test("P0: rejects forbidden role in context", () => {
  const bad: LLMContextPack & { role: string } = { ...base, role: "admin" }
  const r = FAKE_DRY_RUN_PROVIDER.adapt({ contextPack: bad }, controls, REAL_LLM_PROVIDER_POLICY_REQUIRED)
  assert.equal(r.ok, false)
})

test("P0: dry-run result never contains execution-ready payload", () => {
  const r = FAKE_DRY_RUN_PROVIDER.adapt({ contextPack: base }, controls, REAL_LLM_PROVIDER_POLICY_REQUIRED)
  const s = JSON.stringify(r)
  assert.equal(s.includes("\"execute\""), false)
  assert.equal(s.includes("\"execution\""), false)
  assert.equal(s.includes("\"approvalId\""), false)
})

test("P0: contract capability declares no SDK and no network", () => {
  assert.equal(FAKE_DRY_RUN_PROVIDER.capability.features.includes("no-network"), true)
  assert.equal(FAKE_DRY_RUN_PROVIDER.capability.features.includes("no-sdk"), true)
})
