/**
 * WorkUnit Evaluation
 *
 * Evaluates a WorkUnitDraft for readiness without executing anything.
 * Checks completeness, hallucination risk, and suggests next steps.
 */

import type { WorkUnitDraft } from "../domain/types.ts"
import type { LlmProvider, WorkUnitEvaluationResult, LlmProcessingResult } from "./types.ts"
import { buildWorkUnitEvaluationPrompt } from "./prompts.ts"
import type { LlmModelRoute } from "./modelRouter.ts"
import { assertBoundedStringArrayField, assertOptionalStringField } from "./validateLlmOutput.ts"

/**
 * Evaluate a WorkUnitDraft for readiness.
 *
 * Checks:
 *   - Required fields present
 *   - Next action is defined
 *   - Tasks are concrete
 *   - Hallucination risk assessment
 *
 * NEVER triggers external execution.
 */
export async function evaluateWorkUnit(
  provider: LlmProvider,
  draft: WorkUnitDraft,
  options: { modelRoute?: LlmModelRoute } = {},
): Promise<LlmProcessingResult<WorkUnitEvaluationResult>> {
  const warnings: { code: string; message: string }[] = []

  // Deterministic checks first (no LLM needed for basic validation)
  const deterministicResult = evaluateDeterministic(draft)
  if (deterministicResult.hallucinationRisk === "high") {
    return {
      ok: true,
      data: deterministicResult,
      warnings,
      stage: "evaluate_workunit",
    }
  }

  // LLM-based evaluation
  const messages = buildWorkUnitEvaluationPrompt(
    draft.title,
    draft.situation,
    draft.problem,
    draft.nextAction,
    draft.tasks,
    draft.missingFields,
  )

  try {
    const response = await provider.generateJson({
      messages,
      model: options.modelRoute?.model,
      temperature: options.modelRoute?.temperature,
      maxTokens: options.modelRoute?.maxOutputTokens,
      stage: "evaluate_workunit",
    })
    const raw = JSON.parse(response.content) as Record<string, unknown>

    // Evaluation text is still untrusted model output. Reject malformed or
    // oversized values and fall back to deterministic evaluation below.
    if (raw.missingFields !== undefined && !assertBoundedStringArrayField(raw.missingFields, "missingFields", warnings)) {
      return { ok: true, data: deterministicResult, warnings, stage: "evaluate_workunit" }
    }
    if (raw.warnings !== undefined && !assertBoundedStringArrayField(raw.warnings, "warnings", warnings)) {
      return { ok: true, data: deterministicResult, warnings, stage: "evaluate_workunit" }
    }
    if (raw.suggestedNextStep !== undefined && !assertOptionalStringField(raw.suggestedNextStep, "suggestedNextStep", warnings)) {
      return { ok: true, data: deterministicResult, warnings, stage: "evaluate_workunit" }
    }

    const result: WorkUnitEvaluationResult = {
      // LLM claims cannot elevate deterministic readiness or execution safety.
      isExecutable: raw.isExecutable === true && deterministicResult.isExecutable,
      isComplete: raw.isComplete === true && deterministicResult.isComplete,
      missingFields: mergeUnique(deterministicResult.missingFields, (raw.missingFields as string[] | undefined) ?? []),
      warnings: mergeUnique(deterministicResult.warnings, (raw.warnings as string[] | undefined) ?? []),
      hallucinationRisk: stricterRisk(deterministicResult.hallucinationRisk, raw.hallucinationRisk),
      suggestedNextStep: !deterministicResult.isExecutable
        ? deterministicResult.suggestedNextStep
        : (raw.suggestedNextStep as string | undefined) ?? deterministicResult.suggestedNextStep,
    }

    return { ok: true, data: result, warnings, stage: "evaluate_workunit" }
  } catch {
    return { ok: true, data: deterministicResult, warnings, stage: "evaluate_workunit" }
  }
}

function evaluateDeterministic(draft: WorkUnitDraft): WorkUnitEvaluationResult {
  const missingFields = [...draft.missingFields]
  const warnings: string[] = []

  if (!draft.nextAction || draft.nextAction.startsWith("Clarify")) {
    warnings.push("Next action is vague")
  }
  if (draft.tasks.length === 0) {
    warnings.push("No tasks defined")
    missingFields.push("Tasks")
  }
  if (!draft.actors.length || draft.actors.includes("Unknown")) {
    warnings.push("Actors are unknown")
    missingFields.push("Actors")
  }

  const hallucinationRisk: WorkUnitEvaluationResult["hallucinationRisk"] =
    missingFields.length >= 3 ? "high" :
    missingFields.length >= 1 ? "medium" :
    "low"

  const isComplete = missingFields.length === 0
  const isExecutable = isComplete && warnings.length === 0

  return {
    isExecutable,
    isComplete,
    missingFields,
    warnings,
    hallucinationRisk,
    suggestedNextStep: isExecutable
      ? "Create action preview for external execution"
      : "Fill missing fields before proceeding",
  }
}

function isValidHallucinationRisk(value: unknown): value is WorkUnitEvaluationResult["hallucinationRisk"] {
  return value === "none" || value === "low" || value === "medium" || value === "high"
}

function mergeUnique(first: string[], second: string[]): string[] {
  return [...new Set([...first, ...second])]
}

function stricterRisk(
  deterministicRisk: WorkUnitEvaluationResult["hallucinationRisk"],
  modelRisk: unknown,
): WorkUnitEvaluationResult["hallucinationRisk"] {
  if (!isValidHallucinationRisk(modelRisk)) return deterministicRisk
  const rank = { none: 0, low: 1, medium: 2, high: 3 } as const
  return rank[modelRisk] >= rank[deterministicRisk] ? modelRisk : deterministicRisk
}
