import { buildLlmContextPack } from "../llmContext/buildLlmContextPack.ts"
import type { LLMContextPack } from "../llmContext/types.ts"
import { applyColdMemoryPolicy } from "../memory/coldMemoryPolicy.ts"
import { selectHotMemorySummaries } from "../memory/hotMemorySelector.ts"
import { selectWarmMemorySummaries } from "../memory/warmMemorySelector.ts"
import type { ColdMemoryPolicyResult } from "../memory/types.ts"
import type { SourceRef } from "../../domain/types.ts"
import { classifyDecompositionCandidate } from "./decompositionClassifier.ts"
import { createStaticMockDecompositionLlm, validateMockDecompositionLlmOutput, type MockDecompositionLlm } from "./mockDecompositionLlm.ts"
import { evaluateLlmProviderBoundary, type LlmProviderRuntimeControls } from "../llmProvider/llmProviderBoundary.ts"
import { containsForbiddenSummaryText } from "../safety/p0Policy.ts"
import { runRuleGate, type RuleGateResult } from "./ruleGate.ts"
import type { DecompositionResult, DecompositionTarget } from "./types.ts"

export type DecompositionOrchestratorInput = {
  readonly safeInputSummary: string
  readonly sourceRef?: SourceRef
  readonly humanInputRef?: string
  readonly sourceSummary?: string
  readonly evidenceSummaries?: readonly string[]
  readonly relatedCandidateSummaries?: readonly string[]
  readonly hotMemorySummaries?: readonly string[]
  readonly warmMemorySummaries?: readonly string[]
  readonly coldMemoryRefs?: readonly string[]
  readonly rawContext?: unknown
  readonly mockLlm?: MockDecompositionLlm
}

type DecompositionOrchestrationBlockedReason =
  | "forbidden_context"
  | "forbidden_memory"
  | "invalid_mock_llm_output"
  | "forbidden_mock_llm_output"
  | "p0_violation"
  | "real_provider_requires_readiness_gate"

// Nothing in the candidate-only phase wires real-LLM runtime controls. The
// enforcement seam evaluates the provider boundary with every control closed, so a
// non-mock provider always fails closed before it can generate anything.
const NO_GO_RUNTIME_CONTROLS: LlmProviderRuntimeControls = {
  featureFlagEnabled: false,
  globalKillSwitchOpen: false,
  tenantAllowlisted: false,
  budgetLimitAvailable: false,
  redactionApplied: false,
  auditLoggingEnabled: false,
  p0ScannerEnabled: false,
  contextAllowlistApplied: false,
}

type SummaryBoundaryFinding = {
  readonly path: string
  readonly valuePreview: string
  readonly reason: "forbidden_summary_text"
}

export type DecompositionOrchestrationResult =
  | {
    readonly ok: true
    readonly phase: "candidate_only"
    readonly candidateOnly: true
    readonly mockBoundary: "mock_only"
    readonly contextPack: LLMContextPack
    readonly coldMemoryPolicy: ColdMemoryPolicyResult
    readonly decomposition: DecompositionResult
    readonly promotionGate: RuleGateResult
    readonly auditSignalCandidate: { readonly kind: "decomposition_orchestration"; readonly candidateOnly: true }
    readonly tuningSignalCandidate: { readonly kind: "pm_correction_pending"; readonly candidateOnly: true }
  }
  | {
    readonly ok: false
    readonly phase: "blocked"
    readonly candidateOnly: true
    readonly mockBoundary: "mock_only"
    readonly reason: DecompositionOrchestrationBlockedReason
    readonly mockCalled: boolean
    readonly findings?: readonly unknown[]
  }

export function runDecompositionOrchestrator(input: DecompositionOrchestratorInput): DecompositionOrchestrationResult {
  const summaryScan = scanSummaryBoundary([
    ["safeInputSummary", input.safeInputSummary],
    ["sourceSummary", input.sourceSummary],
    ...(input.evidenceSummaries ?? []).map((value, index) => [`evidenceSummaries[${index}]`, value] as const),
    ...(input.relatedCandidateSummaries ?? []).map((value, index) => [`relatedCandidateSummaries[${index}]`, value] as const),
  ])
  if (summaryScan.length > 0) return blocked("forbidden_context", false, summaryScan)
  const memorySummaryScan = scanSummaryBoundary([
    ...(input.hotMemorySummaries ?? []).map((value, index) => [`hotMemorySummaries[${index}]`, value] as const),
    ...(input.warmMemorySummaries ?? []).map((value, index) => [`warmMemorySummaries[${index}]`, value] as const),
  ])
  if (memorySummaryScan.length > 0) return blocked("forbidden_memory", false, memorySummaryScan)
  const hot = selectHotMemorySummaries({ summaries: input.hotMemorySummaries ?? [] })
  if (!hot.ok) return blocked("forbidden_memory", false, hot.findings)
  const warm = selectWarmMemorySummaries({ summaries: input.warmMemorySummaries ?? [] })
  if (!warm.ok) return blocked("forbidden_memory", false, warm.findings)
  const coldMemoryPolicy = applyColdMemoryPolicy({ refs: input.coldMemoryRefs ?? [] })
  const context = buildLlmContextPack({
    route: "fast_extraction",
    nodeSummary: input.safeInputSummary,
    sourceSummary: input.sourceSummary,
    evidenceSummaries: [...(input.evidenceSummaries ?? []), ...hot.summaries, ...warm.summaries],
    relatedCandidateSummaries: input.relatedCandidateSummaries,
    rawContext: input.rawContext,
  })
  if (!context.ok) return blocked("forbidden_context", false, context.findings)
  const provider = input.mockLlm ?? createStaticMockDecompositionLlm({ text: input.safeInputSummary })
  // Phase 2A enforcement seam: the mock boundary is the only path allowed to
  // generate decomposition candidates. Any non-mock provider must be routed through
  // the real-LLM provider boundary first, which fails closed (readiness gate +
  // runtime controls). The provider is never asked to generate, so no real provider
  // can run without the Phase 1E readiness gate.
  const providerKind: string = provider.kind
  if (providerKind !== "mock") {
    const boundary = evaluateLlmProviderBoundary({ request: { contextPack: context.pack }, controls: NO_GO_RUNTIME_CONTROLS })
    return blocked("real_provider_requires_readiness_gate", false, boundary.blockedReasons)
  }
  const mockOutput = validateMockDecompositionLlmOutput(provider.generate({ contextPack: context.pack }))
  if (!mockOutput.ok) return blocked(mockOutput.reason, true)
  const decomposition = classifyDecompositionCandidate({
    text: mockOutput.output.text,
    sourceRef: input.sourceRef,
    humanInputRef: input.humanInputRef,
    intent: mockOutput.output.intent,
    outcome: mockOutput.output.outcome,
    verifier: mockOutput.output.verifier,
    acceptanceCriteria: mockOutput.output.acceptanceCriteria,
  })
  if (decomposition.humanReview?.severity === "p0") return blocked("p0_violation", true)
  return {
    ok: true,
    phase: "candidate_only",
    candidateOnly: true,
    mockBoundary: "mock_only",
    contextPack: context.pack,
    coldMemoryPolicy,
    decomposition,
    promotionGate: runRuleGate({ boundary: gateBoundary(decomposition.target), source: gateSource(decomposition.target), doneCondition: decomposition.doneCondition, context: context.pack }),
    auditSignalCandidate: { kind: "decomposition_orchestration", candidateOnly: true },
    tuningSignalCandidate: { kind: "pm_correction_pending", candidateOnly: true },
  }
}

function gateBoundary(target: DecompositionTarget): "formal_candidate" | "merge_finalization" | "split_finalization" {
  if (target === "merge_candidate") return "merge_finalization"
  if (target === "split_candidate") return "split_finalization"
  return "formal_candidate"
}

function gateSource(target: DecompositionTarget): "pending" | "evidence" | "subtask" | "noise" | "merge_candidate" | "split_candidate" {
  if (target === "evidence_candidate" || target === "ai_silent_processing_event_candidate") return "evidence"
  if (target === "subtask_candidate") return "subtask"
  if (target === "noise_candidate") return "noise"
  if (target === "merge_candidate") return "merge_candidate"
  if (target === "split_candidate") return "split_candidate"
  return "pending"
}

function blocked(reason: DecompositionOrchestrationBlockedReason, mockCalled: boolean, findings?: readonly unknown[]): DecompositionOrchestrationResult {
  return { ok: false, phase: "blocked", candidateOnly: true, mockBoundary: "mock_only", reason, mockCalled, findings }
}

function scanSummaryBoundary(entries: readonly (readonly [string, string | undefined])[]): readonly SummaryBoundaryFinding[] {
  return entries.flatMap(([path, value]) => value && containsForbiddenSummaryText(value) ? [{ path, valuePreview: value.slice(0, 80), reason: "forbidden_summary_text" as const }] : [])
}
