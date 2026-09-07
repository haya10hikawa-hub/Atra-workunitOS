/**
 * WorkUnit Draft Generation
 *
 * Generates a WorkUnitDraft from a SourceCandidate using the LLM provider.
 * LLM-suggested scores are validated; final priorityScore is computed
 * deterministically by application logic.
 */

import type { TenantId } from "../tenant/types.ts"
import type { SourceCandidate, WorkUnitDraft } from "../domain/types.ts"
import type { LlmProvider, WorkUnitDraftGenerationOutput, LlmProcessingResult, RiskFlag } from "./types.ts"
import { buildWorkUnitDraftGenerationPrompt } from "./prompts.ts"
import { calculatePriorityScore, clampScore } from "./scoreWorkUnit.ts"
import { assertBoundedStringArrayField, assertRiskFlagsField, validateWorkUnitDraftMinimum } from "./validateLlmOutput.ts"
import type { LlmModelRoute } from "./modelRouter.ts"

/**
 * Generate a WorkUnitDraft from a SourceCandidate.
 *
 * The LLM suggests content and score inputs.
 * The final priorityScore is calculated deterministically by application logic.
 * Output is ALWAYS marked as draft — never reviewed, never approved.
 */
export async function generateWorkUnitDraftFromCandidate(
  provider: LlmProvider,
  candidate: SourceCandidate,
  tenantId: TenantId,
  options: { createdBy?: "system" | "ai"; modelRoute?: LlmModelRoute } = {},
): Promise<LlmProcessingResult<WorkUnitDraft>> {
  const warnings: { code: string; message: string; riskFlag?: RiskFlag }[] = []

  const messages = buildWorkUnitDraftGenerationPrompt(
    candidate.extractedSummary,
    candidate.detectedActors,
    candidate.detectedProblem,
    candidate.detectedDeadline,
    candidate.detectedIntent,
  )

  let response
  try {
    response = await provider.generateJson({
      messages,
      model: options.modelRoute?.model,
      temperature: options.modelRoute?.temperature,
      maxTokens: options.modelRoute?.maxOutputTokens,
      stage: "generate_workunit_draft",
    })
  } catch {
    return { ok: false, error: "invalid_llm_output", warnings, stage: "generate_workunit_draft" }
  }

  const parsed = parseDraftOutput(response.content, warnings)
  if (!parsed) {
    return { ok: false, error: "invalid_llm_output", warnings, stage: "generate_workunit_draft" }
  }

  // Deterministic priority scoring — LLM only suggests inputs
  const impact = clampScore(parsed.suggestedImpact, 3)
  const urgency = clampScore(parsed.suggestedUrgency, 3)
  const effort = Math.max(1, clampScore(parsed.suggestedEffort, 3))
  const actorWeight = clampScore(parsed.suggestedActorWeight, 3)
  const priorityScore = calculatePriorityScore({ impact, urgency, actorWeight, effort })

  const draft: WorkUnitDraft = {
    id: `draft:${candidate.id}`,
    tenantId,
    sourceCandidateIds: [candidate.id],
    title: parsed.title ?? candidate.extractedSummary,
    situation: parsed.situation ?? `Signal from ${candidate.sourceType}`,
    problem: parsed.problem ?? candidate.detectedProblem ?? "Needs clarification",
    actors: parsed.actors?.length ? parsed.actors : candidate.detectedActors,
    urgency,
    impact,
    effort,
    priorityScore: priorityScore.priorityScore,
    nextAction: parsed.nextAction ?? "Clarify next steps",
    tasks: parsed.tasks?.length ? parsed.tasks : ["Review source", "Confirm actors", "Define action"],
    missingFields: parsed.missingFields ?? [],
    status: "draft",
    trustLevel: "draft",
    createdBy: options.createdBy ?? "ai",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return { ok: true, data: draft, warnings, stage: "generate_workunit_draft" }
}

function parseDraftOutput(
  content: string,
  warnings: LlmProcessingResult<unknown>["warnings"],
): WorkUnitDraftGenerationOutput | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>

    if (!validateWorkUnitDraftMinimum(raw, warnings)) return null

    for (const [field, value] of Object.entries({
      missingFields: raw.missingFields,
      riskFlags: raw.riskFlags,
    })) {
      if (value === undefined) continue
      const valid = field === "riskFlags"
        ? assertRiskFlagsField(value, field, warnings)
        : assertBoundedStringArrayField(value, field, warnings)
      if (!valid) return null
    }

    if (typeof raw.title !== "string" || !raw.title.trim()) {
      warnings.push({ code: "missing_title", message: "LLM did not produce a title" })
      return null
    }

    return {
      title: raw.title as string,
      situation: typeof raw.situation === "string" ? raw.situation : "",
      problem: typeof raw.problem === "string" ? raw.problem : "",
      actors: raw.actors as string[],
      nextAction: typeof raw.nextAction === "string" ? raw.nextAction : "",
      tasks: raw.tasks as string[],
      missingFields: (raw.missingFields as string[] | undefined) ?? [],
      suggestedImpact: typeof raw.suggestedImpact === "number" ? raw.suggestedImpact : 3,
      suggestedUrgency: typeof raw.suggestedUrgency === "number" ? raw.suggestedUrgency : 3,
      suggestedEffort: typeof raw.suggestedEffort === "number" ? raw.suggestedEffort : 3,
      suggestedActorWeight: typeof raw.suggestedActorWeight === "number" ? raw.suggestedActorWeight : 3,
      riskFlags: (raw.riskFlags as RiskFlag[] | undefined) ?? [],
    }
  } catch {
    warnings.push({ code: "parse_failed", message: "Failed to parse LLM JSON output" })
    return null
  }
}
