/**
 * WorkUnit OS Domain Lifecycle State Machine
 *
 * Defines the legal state transitions and guards for every domain object.
 * Follows WORKUNIT_DOMAIN_MODEL.md Section 5-6.
 */

import type {
  ExternalSignal,
  SourceCandidate,
  WorkUnitDraft,
  ReviewedWorkUnit,
  ExecutionCommand,
  ExecutionResult,
  TrustLevel,
} from "./types.ts"
import type { UserId } from "./tenant/types.ts"

// ─── Lifecycle Events ───────────────────────────────────────────

export type LifecycleEvent =
  | "external_signal_received"
  | "source_candidate_created"
  | "workunit_draft_created"
  | "workunit_reviewed"
  | "action_preview_created"
  | "action_approval_requested"
  | "action_approved"
  | "action_rejected"
  | "execution_command_created"
  | "execution_completed"
  | "execution_failed"
  | "validation_failed"
  | "rbac_denied"
  | "tenant_boundary_violation"
  | "approval_required"
  | "external_actions_disabled"

// ─── Transition Results ─────────────────────────────────────────

export type TransitionResult<T> =
  | { ok: true; value: T; event: LifecycleEvent }
  | { ok: false; reason: string; event: LifecycleEvent }

// ─── Signal → Candidate ─────────────────────────────────────────

export function externalSignalToSourceCandidate(
  signal: ExternalSignal,
  params: {
    summary: string
    actors: string[]
    problem?: string
    deadline?: string
    intent?: string
    confidence: number
  },
): TransitionResult<SourceCandidate> {
  if (signal.trustLevel !== "untrusted") {
    return { ok: false, reason: "Signal must be untrusted", event: "validation_failed" }
  }
  if (!params.summary) {
    return { ok: false, reason: "Summary is required", event: "validation_failed" }
  }
  const candidate: SourceCandidate = {
    id: `candidate:${signal.id}`,
    tenantId: signal.tenantId,
    sourceSignalIds: [signal.id],
    sourceType: signal.sourceType,
    extractedSummary: params.summary,
    detectedActors: params.actors,
    detectedProblem: params.problem,
    detectedDeadline: params.deadline,
    detectedIntent: params.intent,
    confidence: clamp01(params.confidence),
    trustLevel: "sanitized_candidate",
    createdAt: new Date().toISOString(),
  }
  return { ok: true, value: candidate, event: "source_candidate_created" }
}

// ─── Candidate → Draft ──────────────────────────────────────────

export function sourceCandidateToWorkUnitDraft(
  candidate: SourceCandidate,
  params: {
    createdBy: "system" | "ai" | "user"
  },
): TransitionResult<WorkUnitDraft> {
  if (candidate.trustLevel !== "sanitized_candidate") {
    return { ok: false, reason: "Candidate must be sanitized", event: "validation_failed" }
  }
  const missing = missingFieldsFromCandidate(candidate)
  const draft: WorkUnitDraft = {
    id: `draft:${candidate.id}`,
    tenantId: candidate.tenantId,
    sourceCandidateIds: [candidate.id],
    title: candidate.extractedSummary,
    situation: `Signal from ${candidate.sourceType}`,
    problem: candidate.detectedProblem ?? "Needs clarification",
    actors: candidate.detectedActors,
    urgency: 5,
    impact: 5,
    effort: 3,
    priorityScore: 0,
    nextAction: `Clarify: ${candidate.extractedSummary}`,
    tasks: ["Confirm actors", "Verify deadline", "Define next action"],
    missingFields: missing,
    status: "draft",
    trustLevel: "draft",
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return { ok: true, value: draft, event: "workunit_draft_created" }
}

// ─── Draft → Reviewed ───────────────────────────────────────────

export function reviewWorkUnitDraft(
  draft: WorkUnitDraft,
  reviewerUserId: UserId,
): TransitionResult<ReviewedWorkUnit> {
  if (draft.trustLevel !== "draft") {
    return { ok: false, reason: "Only drafts can be reviewed", event: "validation_failed" }
  }
  const reviewed: ReviewedWorkUnit = {
    id: draft.id.replace(/^draft:/, "wu:"),
    tenantId: draft.tenantId,
    sourceCandidateIds: draft.sourceCandidateIds,
    title: draft.title,
    situation: draft.situation,
    problem: draft.problem,
    actors: draft.actors,
    urgency: draft.urgency,
    impact: draft.impact,
    effort: draft.effort,
    priorityScore: draft.priorityScore,
    nextAction: draft.nextAction,
    tasks: draft.tasks,
    missingFields: draft.missingFields,
    status: "reviewed",
    trustLevel: "reviewed",
    reviewedByUserId: reviewerUserId,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return { ok: true, value: reviewed, event: "workunit_reviewed" }
}

// ─── Execution Command → Result ─────────────────────────────────

export function recordExecutionOutcome(
  command: ExecutionCommand,
  outcome: {
    status: "succeeded" | "failed" | "blocked" | "skipped"
    provider?: ExecutionResult["provider"]
    providerResultRef?: string
    safeMessage: string
    errorCode?: string
  },
): TransitionResult<ExecutionResult> {
  const result: ExecutionResult = {
    id: `result:${command.id}`,
    tenantId: command.tenantId,
    workUnitId: command.workUnitId,
    executionCommandId: command.id,
    status: outcome.status,
    provider: outcome.provider,
    providerResultRef: outcome.providerResultRef,
    safeMessage: outcome.safeMessage,
    errorCode: outcome.errorCode,
    executedAt: new Date().toISOString(),
  }
  const event = outcome.status === "failed" ? "execution_failed" : "execution_completed"
  return { ok: true, value: result, event }
}

// ─── Trust Level Validation ─────────────────────────────────────

export function assertTrustLevel<T extends { trustLevel: TrustLevel }>(
  obj: T,
  required: TrustLevel,
): TransitionResult<T> {
  if (obj.trustLevel !== required) {
    return { ok: false, reason: `Expected trust level ${required}, got ${obj.trustLevel}`, event: "validation_failed" }
  }
  return { ok: true, value: obj, event: "external_signal_received" }
}

// ─── Helpers ────────────────────────────────────────────────────

function missingFieldsFromCandidate(candidate: SourceCandidate): string[] {
  const missing: string[] = []
  if (!candidate.detectedProblem) missing.push("Problem")
  if (!candidate.detectedDeadline || candidate.detectedDeadline === "unspecified") missing.push("Deadline")
  if (candidate.detectedActors.length === 0) missing.push("Actors")
  if (!candidate.detectedIntent) missing.push("Intent")
  return missing
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
