import { NextResponse } from "next/server.js"
import { listToolBackendAdapters, runToolBackendRequest } from "../../../lib/toolBackend.ts"
import { validateToolBackendRequest } from "../../../lib/toolBackendValidation.ts"
import { areExternalActionsEnabled, isExternalOperation } from "../../../lib/security/externalActions.ts"
import { getSafeErrorStatus, safeError, toSafeErrorCode } from "../../../lib/security/safeErrors.ts"
import { getSessionErrorStatus, type Session } from "../../../lib/security/session.ts"
import { requireSession } from "../../../lib/composition/requestSession.ts"
import { checkMutationRequestIntegrity, readGuardedJsonBody } from "../../../lib/security/httpMutationGuard.ts"
import { resolveRequestId } from "../../../lib/security/routeGuards.ts"
import { checkRateLimit, getTrustedClientIp } from "../../../lib/security/rateLimitGate.ts"
import { hasPermission } from "../../../lib/security/rbac.ts"
import { writeAuditLog, type AuditEventKind, type AuditEvent } from "../../../lib/security/auditLog.ts"
import { recordAuditEvent } from "../../../lib/security/auditPersistence.ts"
import type { WorkUnitPermission } from "../../../lib/security/policy.ts"
import type { ToolBackendOperation, ToolBackendRequest } from "../../../types/toolBackend.ts"

// Tools-route Application use cases (WU-06 final route delegation): business
// orchestration for LLM ingest and runtime-authorization preparation now lives
// here, not in this route. See app/lib/application/workunitTools/.
import {
  runIngestOrchestration,
  prepareAndAuthorizeExternalOperation,
} from "../../../lib/application/workunitTools/toolOperationUseCases.ts"
// Composition root: selects the concrete LLM provider and wraps the Runtime
// Authorization gate behind the capability contracts the use cases above declare.
import {
  buildIngestCapabilities,
  buildRuntimeAuthorizationCapabilities,
} from "../../../lib/composition/workunitTools.ts"
import type { TenantId } from "../../../lib/tenant/types.ts"

// Approval store import (legacy backend path only — the runtime-authorization
// path's ApprovalStore is resolved inside the composition root).
import { resolveApprovalStore, resolveRepositoryBackedApprovalStore } from "../../../lib/security/approvalStoreResolver.ts"

// Repository resolver (for preview hash context resolution)
import { resolveRouteRepositories } from "../../../lib/persistence/routeRepositories.ts"

// Runtime authorization gate (Issue #145) — the final gate for external ops.
// The route no longer calls it directly; it constructs the audit sink (a
// genuinely HTTP-facing / durable-persistence delivery concern) and threads it
// through the composition root, which performs the actual gate call.
import type { RuntimeAuthorizationAuditSink } from "../../../lib/phase6/runtimeAuthorization/index.ts"

// Request-scoped validated runtime config (auth / security / llm / persistence).
import {
  resolveValidatedRequestRuntimeConfig,
  projectRuntimeAuthorizationEnv,
  type ValidatedRequestRuntimeConfig,
} from "../../../lib/runtime/requestRuntimeConfig.ts"

// TODO: tenant boundary — validate that the requested source belongs to the caller's tenant
// Phase 5A: CSRF, rate limit, and role fail-closed hardening applied above

// ─── Operation → Permission Mapping ─────────────────────────────

// Preserved verbatim: readBoundedJsonObject's default maxBytes (64 KiB).
const BODY_LIMITS = { maxBytes: 64 * 1024 } as const

const OPERATION_PERMISSION: Record<ToolBackendOperation, WorkUnitPermission> = {
  ingest:       "workunit.create",
  draft:        "workunit.create",
  create_task:  "workunit.create",
  reply:        "workunit.execute_external_action",
  schedule:     "workunit.execute_external_action",
  create_issue: "workunit.execute_external_action",
}

// ─── Helpers ────────────────────────────────────────────────────

function audit(kind: AuditEventKind, requestId: string, extras?: Partial<Parameters<typeof writeAuditLog>[0]>) {
  writeAuditLog({
    kind,
    timestamp: new Date().toISOString(),
    requestId,
    ...extras,
  })
}

// Security P2: persist a security-relevant tools-route audit event, tenant-scoped
// and fail-open. The repository bundle is resolved on demand because these calls
// run only on terminal blocked/guarded paths. Metadata is redacted and requestId
// sanitized inside recordAuditEvent; this helper never throws.
async function persistAuditEvent(
  tenantId: string,
  event: AuditEvent,
  runtime?: ValidatedRequestRuntimeConfig,
): Promise<void> {
  try {
    const repoResult = await resolveRouteRepositories(tenantId as TenantId, runtime)
    if (!repoResult.ok) return
    await recordAuditEvent(repoResult.bundle.auditLogs, repoResult.bundle.ctx, event)
  } catch {
    // Fail-open: audit persistence must never break the request path.
  }
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

function errorResponse(requestId: string, code: ReturnType<typeof safeError>["error"], status: number): NextResponse {
  return json(safeError(requestId, code), status)
}

// ─── GET ────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) {
    return errorResponse("tools-list-na", "integration_missing", 503)
  }
  const sessionResult = await requireSession(request, runtimeResult.runtime)
  if (!sessionResult.ok) {
    return errorResponse(
      "tools-list-na",
      (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized",
      getSessionErrorStatus(sessionResult.reason),
    )
  }
  if (!hasPermission(sessionResult.session, "workunit.read")) {
    return errorResponse("tools-list-na", "forbidden", 403)
  }
  return NextResponse.json({
    adapters: listToolBackendAdapters().map(({ source, operations }) => ({ source, operations })),
  })
}

// ─── POST ───────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = resolveRequestId(request)

  // ── 0. Resolve the request-scoped runtime config ONCE, FIRST ─
  // Auth, security (kill switch + trusted origins), LLM, and persistence all
  // derive from this one frozen snapshot. A config error (malformed Cloudflare
  // env) fails closed. It resolves before request integrity because the guard's
  // trusted-origin policy is a projection of it.
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) {
    audit("integration_missing" as AuditEventKind, requestId, { reason: "runtime_config_invalid" })
    return errorResponse(requestId, "integration_missing", 503)
  }
  const runtime = runtimeResult.runtime

  // ── 1–6. Request integrity (header-only, synchronous) ───────
  const integrity = checkMutationRequestIntegrity(request, {
    method: "POST",
    trustedOrigins: runtime.security.trustedOrigins,
    maxBytes: BODY_LIMITS.maxBytes,
  })
  if (!integrity.ok) {
    audit("workunit_tools_csrf_blocked" as AuditEventKind, requestId, { reason: integrity.category })
    return errorResponse(requestId, integrity.error, integrity.status)
  }

  // ── Audit: request received ─────────────────────────────────
  audit("tool_request_received", requestId)

  // ── 7. Authentication ───────────────────────────────────────
  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    audit("auth_required", requestId, { reason: sessionResult.reason })
    return errorResponse(
      requestId,
      (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized",
      getSessionErrorStatus(sessionResult.reason),
    )
  }
  const session = sessionResult.session

  // ── 8–9. Tenant authority is the verified session's tenantId (this route
  //        resolves repositories lazily, on the paths that need them), then the
  //        rate limit — after authentication, before the body read and before
  //        the operation-derived RBAC check below.
  const clientIp = getTrustedClientIp(request)
  const rateResult = checkRateLimit({
    tenantId: session.tenantId,
    actorUserId: session.userId,
    clientIp,
    routeFamily: "workunit_tools",
  })
  if (!rateResult.ok) {
    audit("workunit_tools_rate_limited" as AuditEventKind, requestId)
    return errorResponse(requestId, "rate_limited", 429)
  }

  // ── 11–12. Body read and JSON parse ─────────────────────────
  // NOTE: unlike the other four mutation routes, this route's required
  // permission is DERIVED FROM THE BODY (`OPERATION_PERMISSION[operation]`), so
  // RBAC cannot precede the body read here. The rate limit still precedes both.
  const bodyResult = await readGuardedJsonBody(request, BODY_LIMITS)
  if (!bodyResult.ok) {
    audit("tool_request_rejected", requestId, { reason: bodyResult.reason })
    return errorResponse(requestId, "invalid_request", bodyResult.reason === "payload_too_large" ? 413 : 400)
  }
  const body: unknown = bodyResult.value

  // ── 13. Domain validation ─────────────────────────────────────
  const validation = validateToolBackendRequest(body)
  if (!validation.ok) {
    audit("tool_request_rejected", requestId, { reason: "validation_failed" })
    return errorResponse(requestId, "invalid_request", 400)
  }
  audit("tool_request_validated", requestId)
  const { request: validated } = validation

  // ── 10. Route-specific RBAC (operation-derived; see note above) ─
  const requiredPermission = OPERATION_PERMISSION[validated.operation]
  if (!hasPermission(session, requiredPermission)) {
    audit("rbac_denied", requestId, {
      actorId: session.userId,
      tenantId: session.tenantId,
      reason: `missing_permission:${requiredPermission}`,
    })
    // Security P2: persist the RBAC denial (tenant-scoped, redacted, fail-open).
    await persistAuditEvent(session.tenantId, {
      kind: "rbac_denied",
      timestamp: new Date().toISOString(),
      requestId,
      actorId: session.userId,
      reason: `missing_permission:${requiredPermission}`,
      metadata: { operation: validated.operation },
    }, runtime)
    return errorResponse(requestId, "forbidden", 403)
  }

  // ── 6. LLM Ingest Path ────────────────────────────────────────
  if (validated.operation === "ingest" && validated.event) {
    const outcome = await runIngestOrchestration(
      {
        id: validated.id,
        source: validated.source,
        tenantId: session.tenantId,
        eventId: validated.event.id,
        eventTimestamp: validated.event.timestamp,
        metadata: validated.event as unknown as Record<string, unknown>,
      },
      buildIngestCapabilities(runtime),
    )

    if (outcome.kind === "no_provider_blocked") {
      audit("llm_processing_blocked", requestId, { reason: "no_llm_provider" })
      return errorResponse(requestId, "integration_missing", 503)
    }
    if (outcome.kind === "no_provider_fallback") {
      // Fall through to legacy backend
      audit("llm_processing_blocked", requestId, { reason: "no_llm_provider_fallback_to_legacy" })
    } else if (outcome.kind === "llm_error") {
      audit("llm_processing_started", requestId)
      // Map LLM pipeline errors to safe API errors
      const mapped = mapLlmError(outcome.error)
      audit(mapped.auditKind, requestId, { operation: "ingest", reason: outcome.error })
      return errorResponse(requestId, mapped.code, mapped.status)
    } else {
      audit("llm_processing_started", requestId)
      audit("llm_processing_completed", requestId, { operation: "ingest" })

      return json({
        ok: true,
        requestId,
        target: "hopper",
        result: {
          candidate: outcome.result.candidate,
          draft: outcome.result.draft,
          evaluation: outcome.result.evaluation,
        },
        sanitizedSignal: outcome.result.sanitizedSignal,
        warnings: outcome.result.warnings,
        riskFlags: outcome.result.riskFlags,
        errors: [],
      }, 200)
    }
  }

  // ── 7. Kill switch for external operations ────────────────────
  // Kill-switch state comes from the request-scoped security config, NOT process.env.
  const killSwitchEnv = projectRuntimeAuthorizationEnv(runtime.security)
  if (isExternalOperation(validated.operation)) {
    if (!areExternalActionsEnabled(killSwitchEnv)) {
      audit("external_action_blocked", requestId, {
        operation: validated.operation,
        reason: "kill_switch_off",
      })
      // Security P2: persist the blocked external-action attempt (tenant-scoped,
      // redacted, fail-open). External execution remains disabled — this only logs.
      await persistAuditEvent(session.tenantId, {
        kind: "external_action_blocked",
        timestamp: new Date().toISOString(),
        requestId,
        actorId: session.userId,
        reason: "kill_switch_off",
        metadata: { operation: validated.operation },
      }, runtime)
      return errorResponse(requestId, "external_actions_disabled", 403)
    }
  }

  // NOTE: validated request has already stripped approvedByPm and externalConfig.
  // The client cannot authorize external execution or choose arbitrary targets.

  // ── 7b. Final runtime authorization gate (Issue #145) ─────────
  // External operations no longer reach the legacy verifyApproval →
  // markApprovalUsed backend path. They are routed through the server-side
  // runtime authorization gate, which loads all Phase 6 evidence from the
  // server-authoritative resolver (never the client body), re-runs
  // verifyApprovalLinkage internally, evaluates the Human Decision runtime
  // matrix, enforces executor-vs-approver separation, rechecks RBAC + the kill
  // switch, and performs the exact-binding atomic claim. On success it returns
  // an `authorized_not_executed` receipt — NO provider is called, no
  // ExecutionResult is created, and no externalRef is returned. The evidence
  // resolver is default-deny in this patch, so production external operations
  // fail closed until server-authoritative evidence persistence lands.
  if (isExternalOperation(validated.operation)) {
    return await authorizeExternalOperation(validated, session, requestId, runtime)
  }

  // ── 8. Execute (legacy backend) ───────────────────────────────
  try {
    let approvalStore = resolveApprovalStore(session.tenantId as TenantId)

    // Resolve preview hash context for external operations
    // WU-06 final route delegation — classified DEAD_LEGACY_WIRING, inspected once,
    // left in place: every external operation returns at "7b" above via
    // authorizeExternalOperation, so `isExternalOperation(validated.operation)` is
    // always false by the time execution reaches here — this block is dead code.
    // Not removed in this slice: removal is behavior-neutral for the route's own
    // control flow, but would also drop the only call site that exercises
    // `resolveRepositoryBackedApprovalStore` and the ActionPreview lookup path in
    // this file, which is new review scope beyond this WorkUnit's toolBackend/
    // external-execution-semantics boundary ("do not redesign toolBackend").
    let previewHashContext: { actionPreviewId: string; targetHash: string; payloadHash: string } | undefined
    if (isExternalOperation(validated.operation) && validated.approvalId && validated.actionPreviewId) {
      const repoResult = await resolveRouteRepositories(session.tenantId as TenantId, runtime)
      if (!repoResult.ok) {
        audit("execution_approval_failed" as AuditEventKind, requestId, {
          operation: validated.operation,
          reason: `persistence_not_available`,
        })
        return errorResponse(requestId, "integration_missing", 503)
      }
      const { actionPreviews: previewRepo, approvalRecords: approvalRepo, ctx } = repoResult.bundle
      const storedPreview = await previewRepo.findById(ctx, validated.actionPreviewId)
      if (!storedPreview) {
        audit("execution_approval_failed" as AuditEventKind, requestId, {
          operation: validated.operation,
          reason: `preview_not_found:${validated.actionPreviewId}`,
        })
        return errorResponse(requestId, "approval_required", 403)
      }
      previewHashContext = {
        actionPreviewId: validated.actionPreviewId,
        targetHash: storedPreview.targetHash as string,
        payloadHash: storedPreview.payloadHash as string,
      }
      approvalStore = resolveRepositoryBackedApprovalStore(approvalRepo, ctx)
    }

    const result = await runToolBackendRequest(validated, {
      approvalStore,
      tenantId: session.tenantId as TenantId,
      previewHashContext,
    })
    if (!result.ok) {
      const safeCode = toSafeErrorCode(result.errors[0] ?? "internal_error")
      const status = getSafeErrorStatus(safeCode)
      audit(safeCode as AuditEventKind, requestId, { operation: validated.operation, reason: safeCode })
      return json(safeError(requestId, safeCode), status)
    }
    return json(result, 200)
  } catch {
    audit("internal_error", requestId, { operation: validated.operation })
    return errorResponse(requestId, "internal_error", 500)
  }
}

// ─── Runtime Authorization (Issue #145) ─────────────────────────

/** Map a runtime authorization failure state to a safe error + audit kind. */
function mapRuntimeAuthorizationFailure(
  state: string,
): { code: ReturnType<typeof safeError>["error"]; status: number; auditKind: AuditEventKind } {
  switch (state) {
    case "invalid":
      return { code: "invalid_request", status: 400, auditKind: "runtime_authorization_rejected" }
    case "not_ready":
    case "revoked":
      return { code: "approval_required", status: 403, auditKind: "runtime_authorization_rejected" }
    case "forbidden":
      return { code: "forbidden", status: 403, auditKind: "runtime_authorization_rejected" }
    case "stale":
      return { code: "conflict", status: 409, auditKind: "runtime_authorization_rejected" }
    case "expired":
      return { code: "approval_expired", status: 403, auditKind: "runtime_authorization_rejected" }
    case "used":
    case "replayed":
      return { code: "approval_used", status: 409, auditKind: "runtime_authorization_replayed" }
    case "blocked":
      return { code: "external_actions_disabled", status: 403, auditKind: "runtime_authorization_blocked" }
    default:
      return { code: "internal_error", status: 500, auditKind: "runtime_authorization_rejected" }
  }
}

/**
 * Drive the final runtime authorization gate for an external operation. Returns
 * only a redacted `authorized_not_executed` summary on success (no hashes, no
 * executor id, no target/payload, no externalRef), or a mapped safe error. No
 * provider is ever called and no ExecutionResult is created.
 */
async function authorizeExternalOperation(
  validated: ToolBackendRequest,
  session: Session,
  requestId: string,
  runtime: ValidatedRequestRuntimeConfig,
): Promise<NextResponse> {
  // Redacted, DURABLE audit sink: the gate buffers the requested → eligible →
  // claimed → created lifecycle (or rejected/replayed/blocked) as already-redacted
  // events and flushes them here ONCE, after the terminal decision — never inside
  // the security-critical window. Persistence is AWAITED (internally fail-open) so
  // its completion is attached to the request lifecycle; a persistence failure
  // never changes the authorization result. Issue codes are the gate's canonical
  // allowlisted reasons. This stays a route-level (delivery) concern: it is the
  // HTTP request's own audit + durable-persistence plumbing, threaded through the
  // composition root to the gate rather than assembled there.
  const auditSink: RuntimeAuthorizationAuditSink = {
    async flush(events) {
      for (const event of events) {
        const reason = event.issue_codes[0] ?? event.state
        audit(event.event_kind as AuditEventKind, requestId, {
          operation: validated.operation,
          metadata: {
            actionType: event.action_type,
            actionPreviewId: event.action_preview_id,
            approvalId: event.approval_id,
            reason,
          },
        })
        await persistAuditEvent(session.tenantId, {
          kind: event.event_kind as AuditEventKind,
          timestamp: event.evaluated_at,
          requestId,
          actorId: session.userId,
          workUnitId: event.workunit_id === "redacted" ? undefined : event.workunit_id,
          reason,
          metadata: { operation: validated.operation, actionType: event.action_type },
        }, runtime)
      }
    },
  }

  const outcome = await prepareAndAuthorizeExternalOperation(
    {
      operation: validated.operation,
      source: validated.source,
      draftId: validated.draft?.id,
      approvalId: validated.approvalId,
      actionPreviewId: validated.actionPreviewId,
      tenantId: session.tenantId,
    },
    buildRuntimeAuthorizationCapabilities(session, runtime, auditSink),
  )

  if (outcome.kind === "invalid_request") {
    audit("runtime_authorization_rejected", requestId, { operation: validated.operation, reason: "invalid_request" })
    return errorResponse(requestId, "invalid_request", 400)
  }
  if (outcome.kind === "approval_required") {
    audit("runtime_authorization_rejected", requestId, { operation: validated.operation, reason: "approval_required" })
    return errorResponse(requestId, "approval_required", 403)
  }
  if (outcome.kind === "rejected") {
    const mapped = mapRuntimeAuthorizationFailure(outcome.state)
    return errorResponse(requestId, mapped.code, mapped.status)
  }

  // Success: authorized, NOT executed. Return only redacted, safe identifiers.
  return json({
    ok: true,
    requestId,
    mode: "runtime_authorization",
    status: "authorized_not_executed",
    authorizationId: outcome.authorizationId,
    workUnitId: outcome.workUnitId,
    actionPreviewId: outcome.actionPreviewId,
    approvalId: outcome.approvalId,
    actionType: outcome.actionType,
    expiresAt: outcome.expiresAt,
    errors: [],
  }, 200)
}

// ─── LLM Error Mapping ──────────────────────────────────────────

function mapLlmError(error: string): { code: ReturnType<typeof safeError>["error"]; status: number; auditKind: AuditEventKind } {
  switch (error) {
    case "unsafe_input":
      return { code: "invalid_request", status: 400, auditKind: "llm_processing_blocked" }
    case "invalid_llm_output":
      return { code: "internal_error", status: 500, auditKind: "llm_processing_failed" }
    case "token_budget_exceeded":
      return { code: "rate_limited", status: 429, auditKind: "llm_budget_exceeded" }
    default:
      return { code: "internal_error", status: 500, auditKind: "llm_processing_failed" }
  }
}
