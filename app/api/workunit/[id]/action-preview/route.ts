import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../../lib/security/session.ts"
import { safeError } from "../../../../lib/security/safeErrors.ts"
import { writeAuditLog, type AuditEventKind } from "../../../../lib/security/auditLog.ts"
import { hashActionTarget, hashActionPayload } from "../../../../lib/security/hash.ts"
import { resolveRouteRepositories } from "../../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../../lib/tenant/types.ts"
import type { ApprovalActionType } from "../../../../lib/domain/types.ts"
import { canCreatePreview } from "../../../../lib/security/tenantAccess.ts"
import { validateCsrfOrigin } from "../../../../lib/security/csrfProtection.ts"
import { readBoundedJsonObject } from "../../../../lib/security/requestBody.ts"
import { checkRateLimit, getTrustedClientIp } from "../../../../lib/security/rateLimitGate.ts"
import { hasClientOwnedFields, resolveRequestId } from "../../../../lib/security/routeGuards.ts"
import { recordAuditEvent } from "../../../../lib/security/auditPersistence.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../../lib/runtime/requestRuntimeConfig.ts"

// ─── Helpers ────────────────────────────────────────────────────

function audit(kind: AuditEventKind, requestId: string, extras?: Record<string, unknown>) {
  writeAuditLog({ kind, timestamp: new Date().toISOString(), requestId, ...extras })
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

function errorResponse(requestId: string, code: string, status: number): NextResponse {
  return json(safeError(requestId, code as Parameters<typeof safeError>[1]), status)
}

// ─── POST /api/workunit/:id/action-preview ─────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workUnitId } = await params
  const requestId = resolveRequestId(request)

  // ── Request-scoped runtime config (resolved ONCE, before CSRF) ─
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) {
    audit("action_preview_create_failed", requestId, { reason: "runtime_config_invalid" })
    return errorResponse(requestId, "integration_missing", 503)
  }
  const runtime = runtimeResult.runtime

  const csrf = validateCsrfOrigin(request, runtime.security.allowedOrigins)
  if (!csrf.ok) return errorResponse(requestId, csrf.reason, 403)

  audit("action_preview_create_requested", requestId, { workUnitId })

  // ── Session ──────────────────────────────────────────────────
  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    audit("action_preview_create_failed", requestId, { reason: "unauthorized" })
    return errorResponse(
      requestId,
      (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized",
      getSessionErrorStatus(sessionResult.reason),
    )
  }
  const session = sessionResult.session
  if (!checkRateLimit({ tenantId: session.tenantId, actorUserId: session.userId, clientIp: getTrustedClientIp(request), routeFamily: "action_preview" }).ok) {
    return errorResponse(requestId, "rate_limited", 429)
  }

  // ── Resolve repositories (same frozen runtime config) ───────
  const repoResult = await resolveRouteRepositories(session.tenantId as TenantId, runtime)
  if (!repoResult.ok) {
    audit("action_preview_create_failed", requestId, { reason: "persistence_not_available" })
    return errorResponse(requestId, "integration_missing", 503)
  }
  const { actionPreviews: repos, workUnits, auditLogs, ctx } = repoResult.bundle

  // ── Parse body ───────────────────────────────────────────────
  const bodyResult = await readBoundedJsonObject(request, { maxBytes: 32 * 1024, maxArrayLength: 50 })
  if (!bodyResult.ok) {
    audit("action_preview_create_failed", requestId, { reason: bodyResult.reason })
    return errorResponse(requestId, "invalid_request", bodyResult.reason === "payload_too_large" ? 413 : 400)
  }
  const body = bodyResult.value

  // ── Validate ─────────────────────────────────────────────────
  const actionType = body.actionType as ApprovalActionType | undefined
  if (!actionType || !["slack_reply", "gmail_reply", "github_issue", "calendar_event", "internal_task"].includes(actionType)) {
    return errorResponse(requestId, "invalid_request", 400)
  }

  if (hasClientOwnedFields(body)) {
    audit("action_preview_create_failed", requestId, { reason: "client_provided_context" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  const targetPreview = body.target ?? body.targetPreview
  const payloadPreview = body.payload ?? body.payloadPreview
  if (!isPlainRecord(targetPreview) || !isPlainRecord(payloadPreview) || containsForbiddenPreviewKey(targetPreview) || containsForbiddenPreviewKey(payloadPreview)) {
    audit("action_preview_create_failed", requestId, { reason: "unsafe_preview_shape" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  // ── RBAC ─────────────────────────────────────────────────────
  if (!canCreatePreview(session)) {
    audit("action_preview_create_failed", requestId, { reason: "rbac_denied" })
    return errorResponse(requestId, "forbidden", 403)
  }

  const workUnit = await workUnits.findById(ctx, workUnitId)
  if (!workUnit) {
    audit("action_preview_create_failed", requestId, { reason: "workunit_not_found" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  // ── Generate canonical hashes ────────────────────────────────
  const targetHash = hashActionTarget(targetPreview)
  const payloadHash = hashActionPayload(payloadPreview)

  // ── Build + store via repository ─────────────────────────────
  const previewId = `preview:${workUnitId}:${actionType}:${Date.now()}`
  const previewRow = {
    id: previewId,
    tenantId: session.tenantId,
    workUnitId,
    actionType,
    targetPreview: JSON.stringify(targetPreview),
    payloadPreview: JSON.stringify(payloadPreview),
    requiresApproval: 1,
    status: "preview",
    targetHash,
    payloadHash,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    // Security P1: creator is ALWAYS the server-side session user (never client-supplied).
    creatorUserId: session.userId,
  }

  await repos.create(ctx, previewRow)

  // ── Persist (tenant-scoped, fail-open, redacted) ─────────────
  await recordAuditEvent(auditLogs, ctx, {
    kind: "action_preview_created", timestamp: previewRow.createdAt, requestId,
    actorId: session.userId, workUnitId, metadata: { actionPreviewId: previewId, actionType },
  })

  audit("action_preview_created", requestId, {
    workUnitId, actionPreviewId: previewId, actionType, targetHash, payloadHash,
  })

  return json({
    ok: true,
    requestId,
    preview: {
      id: previewId,
      workUnitId,
      actionType,
      targetPreview,
      payloadPreview,
      requiresApproval: true,
      status: "preview",
      createdAt: previewRow.createdAt,
      expiresAt: previewRow.expiresAt,
    },
  }, 201)
}

const FORBIDDEN_PREVIEW_KEYS = new Set([
  "approvalid", "targethash", "payloadhash", "tenantid", "userid", "actoruserid", "approvedbyuserid",
  "approvedbypm", "role", "status", "usedat", "rawpayload", "rawbody", "providerpayload",
  "sendablebody", "approvedoutboundbody", "approvedoutboundpayload", "authorization", "cookie",
  "password", "secret", "token", "accesstoken", "refreshtoken", "apikey",
  // Security P1: creator/actor ownership keys must never appear in preview content.
  "creatoruserid", "createdbyuserid", "requestedbyuserid",
])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function containsForbiddenPreviewKey(root: Record<string, unknown>): boolean {
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }
    if (!isPlainRecord(current)) continue
    for (const [key, value] of Object.entries(current)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
      if (FORBIDDEN_PREVIEW_KEYS.has(normalized)) return true
      stack.push(value)
    }
  }
  return false
}
