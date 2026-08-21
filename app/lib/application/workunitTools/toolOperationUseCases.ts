/**
 * WU-06 final route delegation — tools-route Application use cases.
 *
 * Owns the business decision flow that used to live inline in
 * `app/api/workunit/tools/route.ts`: whether the LLM ingest pipeline runs
 * (provider availability decision, ExternalSignal formation, process-work-signal
 * invocation, result interpretation) and how an external operation's runtime
 * authorization request is prepared and interpreted (operation/source ->
 * ApprovalActionType, required WorkUnit/approval/preview decision, authorization
 * request preparation, result interpretation).
 *
 * Concrete execution — which LLM provider runs, and the Runtime Authorization
 * gate itself (approval claim, evidence resolution, audit persistence) — is
 * supplied by the composition root (`app/lib/composition/workunitTools.ts`)
 * through the narrow capability contracts declared here, exactly as
 * `sessionResolver.ts` declares `SessionDependencies`. This module returns typed,
 * HTTP-independent outcomes: it never constructs a `NextResponse`, an HTTP status
 * code, or a safe-error envelope — that mapping stays in the route.
 */

import { createExternalSignal, type ApprovalActionType, type ExternalSignal } from "../../domain/types.ts"
import type { TenantId } from "../../tenant/types.ts"

// ─── LLM ingest orchestration ────────────────────────────────────

export type IngestOrchestrationInput = {
  readonly id: string
  readonly source: string
  readonly tenantId: string
  readonly eventId: string | undefined
  readonly eventTimestamp: string | undefined
  readonly metadata: Record<string, unknown>
}

/** Structural mirror of `ProcessWorkSignalResult`, loose enough to avoid a concrete llm/ import. */
export type ProcessSignalResult =
  | {
      readonly ok: true
      readonly sanitizedSignal: unknown
      readonly candidate: unknown
      readonly draft: unknown
      readonly evaluation: unknown
      readonly warnings: readonly unknown[]
      readonly riskFlags: readonly unknown[]
    }
  | { readonly ok: false; readonly error: string }

export type IngestOrchestrationCapabilities = {
  /** Whether the composition root resolved a runnable LLM provider for this request. */
  readonly providerAvailable: boolean
  readonly allowLegacyFallback: boolean
  /**
   * Lifecycle callback: invoked once providerAvailable is known true, before
   * processSignal is invoked. This is what lets Delivery's "processing started"
   * audit fire ahead of the pipeline call — including ahead of an unexpected
   * throw from processSignal — without Delivery deciding *when* it fires.
   */
  onProcessingStarted(): void
  processSignal(signal: ExternalSignal, tenantId: TenantId): Promise<ProcessSignalResult>
}

export type IngestOutcome =
  | { readonly kind: "no_provider_blocked" }
  | { readonly kind: "no_provider_fallback" }
  | { readonly kind: "llm_error"; readonly error: string }
  | {
      readonly kind: "processed"
      readonly result: {
        readonly candidate: unknown
        readonly draft: unknown
        readonly evaluation: unknown
        readonly sanitizedSignal: unknown
        readonly warnings: readonly unknown[]
        readonly riskFlags: readonly unknown[]
      }
    }

/**
 * Decide whether the LLM pipeline runs at all, and if it does, form the
 * ExternalSignal and interpret the pipeline's result. When no provider is
 * available the decision is either a hard block (`no_provider_blocked`) or a
 * fall-through to the legacy backend (`no_provider_fallback`) depending only on
 * the composition-resolved `allowLegacyFallback` flag — never on `process.env`.
 */
export async function runIngestOrchestration(
  input: IngestOrchestrationInput,
  capabilities: IngestOrchestrationCapabilities,
): Promise<IngestOutcome> {
  if (!capabilities.providerAvailable) {
    return capabilities.allowLegacyFallback ? { kind: "no_provider_fallback" } : { kind: "no_provider_blocked" }
  }

  // Fires before ExternalSignal formation and before processSignal is invoked,
  // so it is emitted even if either of those unexpectedly throws.
  capabilities.onProcessingStarted()

  const externalId = input.eventId ?? input.id
  const source = (input.source === "github" ? "github" : input.source) as Parameters<typeof createExternalSignal>[0]["sourceType"]
  const signal = createExternalSignal({
    id: externalId,
    tenantId: input.tenantId as TenantId,
    sourceType: source,
    sourceRef: {
      source: source as Parameters<typeof createExternalSignal>[0]["sourceRef"]["source"],
      externalId,
      capturedAt: input.eventTimestamp ?? new Date().toISOString(),
    },
    metadata: input.metadata,
  })

  const result = await capabilities.processSignal(signal, input.tenantId as TenantId)
  if (!result.ok) return { kind: "llm_error", error: result.error }
  return {
    kind: "processed",
    result: {
      candidate: result.candidate,
      draft: result.draft,
      evaluation: result.evaluation,
      sanitizedSignal: result.sanitizedSignal,
      warnings: result.warnings,
      riskFlags: result.riskFlags,
    },
  }
}

// ─── Runtime authorization preparation (Issue #145) ──────────────

export type RuntimeAuthorizationPreparationInput = {
  readonly operation: string
  readonly source: string
  readonly draftId: string | undefined
  readonly approvalId: string | undefined
  readonly actionPreviewId: string | undefined
  readonly tenantId: string
}

export type RuntimeAuthorizationDecision =
  | { readonly ok: true; readonly authorizationId: string; readonly actionType: string; readonly expiresAt: string }
  | { readonly ok: false; readonly state: string }

export type RuntimeAuthorizationCapabilities = {
  authorize(request: {
    readonly tenantId: string
    readonly workUnitId: string
    readonly actionPreviewId: string
    readonly approvalId: string
    readonly actionType: string
  }): Promise<RuntimeAuthorizationDecision>
}

export type RuntimeAuthorizationPreparationOutcome =
  | { readonly kind: "invalid_request" }
  | { readonly kind: "approval_required" }
  | { readonly kind: "rejected"; readonly state: string }
  | {
      readonly kind: "authorized"
      readonly workUnitId: string
      readonly actionPreviewId: string
      readonly approvalId: string
      readonly authorizationId: string
      readonly actionType: string
      readonly expiresAt: string
    }

/** Map an external operation + source to its ApprovalActionType. */
function runtimeActionTypeFor(operation: string, source: string): ApprovalActionType | null {
  if (operation === "create_issue") return "github_issue"
  if (operation === "schedule") return "calendar_event"
  if (operation === "reply") return source === "gmail" ? "gmail_reply" : "slack_reply"
  return null
}

/**
 * Prepare the business request for the final Runtime Authorization gate and
 * interpret its typed result. The gate itself — approval claim, evidence
 * resolution, audit persistence — is entirely behind `capabilities.authorize`,
 * supplied by the composition root; this use case never touches it directly.
 */
export async function prepareAndAuthorizeExternalOperation(
  input: RuntimeAuthorizationPreparationInput,
  capabilities: RuntimeAuthorizationCapabilities,
): Promise<RuntimeAuthorizationPreparationOutcome> {
  const actionType = runtimeActionTypeFor(input.operation, input.source)
  const workUnitId = input.draftId
  if (!actionType || !workUnitId) return { kind: "invalid_request" }
  if (!input.approvalId || !input.actionPreviewId) return { kind: "approval_required" }

  const decision = await capabilities.authorize({
    tenantId: input.tenantId,
    workUnitId,
    actionPreviewId: input.actionPreviewId,
    approvalId: input.approvalId,
    actionType,
  })
  if (!decision.ok) return { kind: "rejected", state: decision.state }
  return {
    kind: "authorized",
    workUnitId,
    actionPreviewId: input.actionPreviewId,
    approvalId: input.approvalId,
    authorizationId: decision.authorizationId,
    actionType: decision.actionType,
    expiresAt: decision.expiresAt,
  }
}
