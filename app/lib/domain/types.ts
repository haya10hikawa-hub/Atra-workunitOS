/**
 * WorkUnit OS Domain Model Types
 *
 * Defines all eight core domain objects with explicit trust levels.
 * Follows WORKUNIT_DOMAIN_MODEL.md — this file is the canonical type source.
 */

import type { TenantId, UserId } from "./tenant/types.ts"

// ─── Trust Levels ───────────────────────────────────────────────

export type TrustLevel =
  | "untrusted"
  | "sanitized_candidate"
  | "draft"
  | "reviewed"
  | "approved"
  | "executed"

export const TRUST_LEVEL_RULES = {
  untrusted:            { canTriggerExternal: false, description: "Raw external or user-provided source" },
  sanitized_candidate:  { canTriggerExternal: false, description: "Extracted and filtered signal" },
  draft:                { canTriggerExternal: false, description: "Generated WorkUnit proposal" },
  reviewed:             { canTriggerExternal: false, description: "User accepted as a valid WorkUnit" },
  approved:             { canTriggerExternal: false, description: "Specific action payload approved — not directly executable" },
  executed:             { canTriggerExternal: false, description: "Action has already been performed" },
} as const satisfies Record<TrustLevel, { canTriggerExternal: boolean; description: string }>

// ─── Source Types ───────────────────────────────────────────────

export type SourceType =
  | "slack"
  | "notion"
  | "gmail"
  | "google_drive"
  | "google_calendar"
  | "github"
  | "manual"
  | "meeting_transcript"

/**
 * The namespace in which a canonical `SourceRecordV1.providerObjectKey` is interpreted.
 *
 * DISTINCT FROM `SourceType`, DELIBERATELY. `SourceType` is the application's
 * integration/branding vocabulary: which product a signal came from. This is the
 * canonical *identity* vocabulary: the space a provider's own key is unique within.
 * They answer different questions, so neither is derived from the other — mapping one
 * onto the other by string manipulation would be provider relabelling, and a single
 * union serving both would force one question's answer to be wrong.
 *
 * WHY GITHUB IS SPLIT BY RESOURCE
 *
 * GitHub issues them separately: the REST `id` of an issue and the REST `id` of a pull
 * request are drawn from different provider tables, and their observed numeric ranges
 * overlap. Under one `"github"` namespace, an issue key and a pull-request key that
 * happen to be numerically equal become the same canonical identity — a false merge
 * produced by Atra's vocabulary, not by anything GitHub said. So the resource is part
 * of the namespace, and `"github"` is not a member here at all: there is no spelling of
 * this type that lets a reviewed GitHub resource fall back to the generic provider.
 *
 * WHY THE OTHER MEMBERS ARE NOT RESOURCE-SCOPED
 *
 * They are provider-level because nothing has yet reviewed them. No identity or
 * content-scope profile is ratified for Slack, Google Calendar or any other member, so
 * no producer can emit a record under one, and splitting them now would invent resource
 * boundaries for providers whose identity contracts are unexamined. Each must be
 * resolved into resource-scoped namespaces by the WorkUnit that reviews its profile —
 * the same way GitHub was — rather than inheriting a shape from GitHub's case.
 *
 * This is a closed vocabulary, not a generalized namespace model: there is no separate
 * `providerNamespace` field on `SourceRecordV1`, and identity stays exactly
 * `(tenantId, provider, providerObjectKey)`.
 */
export type SourceIdentityNamespace =
  | "slack"
  | "notion"
  | "gmail"
  | "google_drive"
  | "google_calendar"
  | "github_issue"
  | "github_pull_request"
  | "manual"
  | "meeting_transcript"

export type SourceRef = {
  source: SourceType
  externalId: string
  container?: string
  url?: string
  capturedAt: string
}

// ─── 3.1 External Signal ────────────────────────────────────────

export type ExternalSignal = {
  id: string
  tenantId: TenantId
  sourceType: SourceType
  sourceRef: SourceRef
  receivedAt: string
  trustLevel: "untrusted"
  rawContentRef?: string
  metadata: Record<string, unknown>
}

// ─── 3.2 Source Candidate ───────────────────────────────────────

export type SourceCandidate = {
  id: string
  tenantId: TenantId
  sourceSignalIds: string[]
  sourceType: SourceType
  extractedSummary: string
  detectedActors: string[]
  detectedProblem?: string
  detectedDeadline?: string
  detectedIntent?: string
  confidence: number
  trustLevel: "sanitized_candidate"
  createdAt: string
}

// ─── 3.3 WorkUnit Draft ─────────────────────────────────────────

export type WorkUnitDraft = {
  id: string
  tenantId: TenantId
  sourceCandidateIds: string[]

  title: string
  situation: string
  problem: string
  actors: string[]

  urgency: number
  impact: number
  effort: number
  priorityScore: number

  nextAction: string
  tasks: string[]
  missingFields: string[]

  status: "draft"
  trustLevel: "draft"

  createdBy: "system" | "ai" | "user"
  createdAt: string
  updatedAt: string
}

// ─── 3.4 Reviewed WorkUnit ──────────────────────────────────────

export type ReviewedWorkUnit = {
  id: string
  tenantId: TenantId
  sourceCandidateIds: string[]

  title: string
  situation: string
  problem: string
  actors: string[]

  urgency: number
  impact: number
  effort: number
  priorityScore: number

  nextAction: string
  tasks: string[]
  missingFields: string[]

  status: "reviewed"
  trustLevel: "reviewed"

  reviewedByUserId: UserId
  reviewedAt: string
  updatedAt: string
}

// ─── Action Target / Payload Previews ───────────────────────────

export type ActionTargetPreview = {
  provider: string
  destination: string
  label: string
}

export type ActionPayloadPreview = {
  title?: string
  bodySnippet: string
  detailFields: Record<string, string>
}

export type ResolvedExternalTarget = {
  provider: string
  channel?: string
  recipient?: string
  owner?: string
  repo?: string
  calendarId?: string
}

export type ResolvedExternalPayload = {
  title: string
  body: string
  labels?: string[]
  attendees?: string[]
  timeHint?: string
}

// ─── 3.5 Action Preview ─────────────────────────────────────────

export type ActionPreviewActionType =
  | "internal_task"
  | "slack_reply"
  | "gmail_reply"
  | "github_issue"
  | "calendar_event"

export function isExternalPreviewAction(actionType: ActionPreviewActionType): boolean {
  return actionType !== "internal_task"
}

export type ActionPreview = {
  id: string
  tenantId: TenantId
  workUnitId: string

  actionType: ActionPreviewActionType

  targetPreview: ActionTargetPreview
  payloadPreview: ActionPayloadPreview

  requiresApproval: boolean
  status: "preview"

  payloadHash: string
  targetHash: string

  createdAt: string
  expiresAt?: string
}

// ─── 3.6 Approval Record ────────────────────────────────────────

export type ApprovalActionType =
  | "slack_reply"
  | "gmail_reply"
  | "github_issue"
  | "calendar_event"

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "used"

export type ActionApprovalRecord = {
  id: string
  tenantId: TenantId
  workUnitId: string
  actionPreviewId: string

  actionType: ApprovalActionType

  targetHash: string
  payloadHash: string

  status: ApprovalStatus

  approvedByUserId?: UserId
  createdAt: string
  approvedAt?: string
  expiresAt: string
  usedAt?: string
}

// ─── 3.7 Execution Command ──────────────────────────────────────

export type ExecutionActionType =
  | "slack_reply"
  | "gmail_reply"
  | "github_issue"
  | "calendar_event"

export type ExecutionCommand = {
  id: string
  tenantId: TenantId
  workUnitId: string
  approvalId: string

  actionType: ExecutionActionType

  resolvedTarget: ResolvedExternalTarget
  resolvedPayload: ResolvedExternalPayload

  idempotencyKey: string
  createdAt: string
}

// ─── 3.8 Execution Result ───────────────────────────────────────

export type ExecutionResultStatus =
  | "succeeded"
  | "failed"
  | "blocked"
  | "skipped"

export type IntegrationProvider =
  | "slack"
  | "gmail"
  | "github"
  | "google_calendar"
  | "notion"
  | "google_drive"

export type ExecutionResult = {
  id: string
  tenantId: TenantId
  workUnitId: string
  executionCommandId: string

  status: ExecutionResultStatus

  provider?: IntegrationProvider
  providerResultRef?: string

  safeMessage: string
  errorCode?: string

  executedAt: string
}

// ─── Factory Helpers ────────────────────────────────────────────

export function createExternalSignal(params: {
  id: string
  tenantId: TenantId
  sourceType: SourceType
  sourceRef: SourceRef
  metadata?: Record<string, unknown>
  rawContentRef?: string
}): ExternalSignal {
  return {
    id: params.id,
    tenantId: params.tenantId,
    sourceType: params.sourceType,
    sourceRef: params.sourceRef,
    receivedAt: new Date().toISOString(),
    trustLevel: "untrusted",
    rawContentRef: params.rawContentRef,
    metadata: params.metadata ?? {},
  }
}

export function createExecutionCommand(params: {
  tenantId: TenantId
  workUnitId: string
  approvalId: string
  actionType: ExecutionActionType
  resolvedTarget: ResolvedExternalTarget
  resolvedPayload: ResolvedExternalPayload
}): ExecutionCommand {
  return {
    id: `exec:${params.workUnitId}:${params.actionType}:${Date.now()}`,
    tenantId: params.tenantId,
    workUnitId: params.workUnitId,
    approvalId: params.approvalId,
    actionType: params.actionType,
    resolvedTarget: params.resolvedTarget,
    resolvedPayload: params.resolvedPayload,
    idempotencyKey: `${params.workUnitId}:${params.actionType}:${hashPayload(params.resolvedPayload)}`,
    createdAt: new Date().toISOString(),
  }
}

export function createExecutionResult(params: {
  tenantId: TenantId
  workUnitId: string
  executionCommandId: string
  status: ExecutionResultStatus
  provider?: IntegrationProvider
  providerResultRef?: string
  safeMessage: string
  errorCode?: string
}): ExecutionResult {
  return {
    id: `result:${params.executionCommandId}`,
    tenantId: params.tenantId,
    workUnitId: params.workUnitId,
    executionCommandId: params.executionCommandId,
    status: params.status,
    provider: params.provider,
    providerResultRef: params.providerResultRef,
    safeMessage: params.safeMessage,
    errorCode: params.errorCode,
    executedAt: new Date().toISOString(),
  }
}

function hashPayload(payload: unknown): string {
  const s = JSON.stringify(payload ?? "")
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return `h${Math.abs(h).toString(36)}`
}
