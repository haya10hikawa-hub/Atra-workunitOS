/**
 * Candidate Extraction
 *
 * Extracts structured SourceCandidate data from a SanitizedSignal
 * using the LLM provider.
 */

import type { TenantId } from "../tenant/types.ts"
import type { SourceCandidate } from "../domain/types.ts"
import type { LlmProvider, SanitizedSignal, CandidateExtractionOutput, LlmProcessingResult, RiskFlag } from "./types.ts"
import { buildCandidateExtractionPrompt } from "./prompts.ts"
import type { LlmModelRoute } from "./modelRouter.ts"
import { assertBoundedStringArrayField, assertOptionalStringField, assertRiskFlagsField, assertStringField } from "./validateLlmOutput.ts"

/**
 * Extract a SourceCandidate from a SanitizedSignal.
 *
 * The LLM output is validated, normalized, and wrapped in a typed result.
 * LLM output is NEVER trusted directly — it is parsed, validated, and scored.
 */
export async function extractSourceCandidate(
  provider: LlmProvider,
  signal: SanitizedSignal,
  tenantId: TenantId,
  options: { modelRoute?: LlmModelRoute } = {},
): Promise<LlmProcessingResult<SourceCandidate>> {
  const warnings: { code: string; message: string; riskFlag?: RiskFlag }[] = []

  if (signal.riskFlags.includes("prompt_injection_detected")) {
    return {
      ok: false,
      error: "unsafe_input",
      warnings: [{ code: "unsafe_input", message: "Prompt injection detected in source content", riskFlag: "prompt_injection_detected" }],
      stage: "extract_candidate",
    }
  }

  const messages = buildCandidateExtractionPrompt(signal.sanitizedContent)

  let response
  try {
    response = await provider.generateJson({
      messages,
      model: options.modelRoute?.model,
      temperature: options.modelRoute?.temperature,
      maxTokens: options.modelRoute?.maxOutputTokens,
      stage: "extract_candidate",
    })
  } catch {
    return { ok: false, error: "invalid_llm_output", warnings, stage: "extract_candidate" }
  }

  const parsed = parseExtractionOutput(response.content, warnings)
  if (!parsed) {
    return { ok: false, error: "invalid_llm_output", warnings, stage: "extract_candidate" }
  }
  const blockingOutputRisk = parsed.riskFlags.find((flag) =>
    flag === "prompt_injection_detected" || flag === "source_content_includes_instruction" || flag === "sensitive_data_detected"
  )
  if (blockingOutputRisk) {
    warnings.push({ code: "unsafe_input", message: "Unsafe LLM output detected", riskFlag: blockingOutputRisk })
    return { ok: false, error: "unsafe_input", warnings, stage: "extract_candidate" }
  }

  const candidate: SourceCandidate = {
    id: `candidate:${signal.id}`,
    tenantId,
    sourceSignalIds: [signal.id],
    sourceType: signal.sourceType,
    extractedSummary: parsed.extractedSummary ?? "Untitled signal",
    detectedActors: parsed.detectedActors?.length ? parsed.detectedActors : ["Unknown"],
    detectedProblem: parsed.detectedProblem ?? undefined,
    detectedDeadline: parsed.detectedDeadline ?? undefined,
    detectedIntent: parsed.detectedIntent ?? undefined,
    confidence: clamp01(parsed.confidence ?? 0.5),
    trustLevel: "sanitized_candidate",
    createdAt: new Date().toISOString(),
  }

  return { ok: true, data: candidate, warnings, stage: "extract_candidate" }
}

function parseExtractionOutput(
  content: string,
  warnings: LlmProcessingResult<unknown>["warnings"],
): CandidateExtractionOutput | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>

    // Validate required fields
    if (!assertStringField(raw.extractedSummary, "summary", warnings)) return null
    if (!assertBoundedStringArrayField(raw.detectedActors === undefined ? [] : raw.detectedActors, "detectedActors", warnings)) return null
    for (const [key, value] of Object.entries({ detectedProblem: raw.detectedProblem, detectedDeadline: raw.detectedDeadline, detectedIntent: raw.detectedIntent })) {
      if (!assertOptionalStringField(value, key, warnings)) return null
    }
    if (raw.riskFlags !== undefined && !assertRiskFlagsField(raw.riskFlags, "riskFlags", warnings)) return null

    return {
      extractedSummary: raw.extractedSummary as string,
      detectedActors: raw.detectedActors as string[] | undefined ?? [],
      detectedProblem: typeof raw.detectedProblem === "string" ? raw.detectedProblem : undefined,
      detectedDeadline: typeof raw.detectedDeadline === "string" ? raw.detectedDeadline : undefined,
      detectedIntent: typeof raw.detectedIntent === "string" ? raw.detectedIntent : undefined,
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
      riskFlags: (raw.riskFlags as RiskFlag[] | undefined) ?? [],
    }
  } catch {
    warnings.push({ code: "parse_failed", message: "Failed to parse LLM JSON output" })
    return null
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
