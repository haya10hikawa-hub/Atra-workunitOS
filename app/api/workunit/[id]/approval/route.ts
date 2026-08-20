import { NextResponse } from "next/server.js"
import { getSessionErrorStatus } from "../../../../lib/security/session.ts"
import { requireSession } from "../../../../lib/composition/requestSession.ts"
import { safeError } from "../../../../lib/security/safeErrors.ts"
import { writeAuditLog, type AuditEventKind } from "../../../../lib/security/auditLog.ts"
import { resolveRouteRepositories, resolveRouteReadRepositories } from "../../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../../lib/tenant/types.ts"
import { canApprovePreview, canCreatePreview } from "../../../../lib/security/tenantAccess.ts"
import { checkMutationRequestIntegrity, readGuardedJsonBody } from "../../../../lib/security/httpMutationGuard.ts"
import { checkRateLimit, getTrustedClientIp } from "../../../../lib/security/rateLimitGate.ts"
import { hasClientOwnedFields, isPreviewExpired, resolveRequestId } from "../../../../lib/security/routeGuards.ts"
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

const BODY_LIMITS = { maxBytes: 4 * 1024, maxDepth: 4, maxNodes: 30 } as const

// ─── POST /api/workunit/:id/approval ───────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workUnitId } = await params
  const requestId = resolveRequestId(request)

  // ── 0. Request-scoped runtime config (resolved ONCE, FIRST) ──
  // The guard's trusted-origin policy is a projection of this config, so it
  // must resolve before request integrity is evaluated.
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) {
    audit("approval_create_failed", requestId, { reason: "runtime_config_invalid" })
    return errorResponse(requestId, "integration_missing", 503)
  }
  const runtime = runtimeResult.runtime

  // ── 1–6. Request integrity (header-only, synchronous) ────────
  const integrity = checkMutationRequestIntegrity(request, {
    method: "POST",
    trustedOrigins: runtime.security.trustedOrigins,
    maxBytes: BODY_LIMITS.maxBytes,
  })
  if (!integrity.ok) return errorResponse(requestId, integrity.error, integrity.status)

  audit("approval_create_requested", requestId, { workUnitId })

  // ── 7. Authentication ────────────────────────────────────────
  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    audit("approval_create_failed", requestId, { reason: "unauthorized" })
    return errorResponse(
      requestId,
      (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized",
      getSessionErrorStatus(sessionResult.reason),
    )
  }
  const session = sessionResult.session

  // ── 8. Tenant identity and active membership authority ───────
  const repoResult = await resolveRouteRepositories(session.tenantId as TenantId, runtime)
  if (!repoResult.ok) {
    audit("approval_create_failed", requestId, { reason: "persistence_not_available" })
    return errorResponse(requestId, "integration_missing", 503)
  }
  const { actionPreviews: previewRepo, approvalRecords: approvalRepo, auditLogs, ctx } = repoResult.bundle

  // ── 9. Rate limit — after authentication and tenant authority ──
  if (!checkRateLimit({ tenantId: session.tenantId, actorUserId: session.userId, clientIp: getTrustedClientIp(request), routeFamily: "approval_decision" }).ok) {
    return errorResponse(requestId, "rate_limited", 429)
  }

  // ── 10. Route-specific RBAC — before the body read ───────────
  if (!canApprovePreview(session)) {
    audit("approval_create_failed", requestId, { reason: "rbac_denied" })
    return errorResponse(requestId, "forbidden", 403)
  }

  // ── 11–12. Body read and JSON parse ──────────────────────────
  const bodyResult = await readGuardedJsonBody(request, BODY_LIMITS)
  if (!bodyResult.ok) {
    audit("approval_create_failed", requestId, { reason: bodyResult.reason })
    return errorResponse(requestId, "invalid_request", bodyResult.reason === "payload_too_large" ? 413 : 400)
  }
  const body = bodyResult.value

  // ── 13. Domain validation ────────────────────────────────────
  const actionPreviewId = typeof body.actionPreviewId === "string" ? body.actionPreviewId : null
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null

  if (!actionPreviewId || !decision) {
    audit("approval_create_failed", requestId, { reason: "missing_fields" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  if (hasClientOwnedFields(body)) {
    audit("approval_create_failed", requestId, { reason: "client_provided_context" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  // ── Lookup stored preview via repository ────────────────────
  const preview = await previewRepo.findById(ctx, actionPreviewId)
  if (!preview) {
    audit("approval_lookup_failed", requestId, { actionPreviewId, reason: "not_found" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  if (preview.workUnitId !== workUnitId) {
    audit("approval_create_failed", requestId, { actionPreviewId, reason: "workunit_mismatch" })
    return errorResponse(requestId, "invalid_request", 400)
  }
  if (preview.status !== "preview" || !preview.expiresAt || Date.parse(preview.expiresAt) <= Date.now()) {
    audit("approval_create_failed", requestId, { actionPreviewId, reason: "preview_expired_or_inactive" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  // ── Four-eyes (Security P1): the approver must differ from the preview creator ──
  // Fail closed: a missing creator (pre-P1 / unknown) cannot prove distinct actors,
  // so it is rejected too. The creator is server-set, never client-supplied.
  if (!preview.creatorUserId || preview.creatorUserId === session.userId) {
    const reason = preview.creatorUserId ? "self_approval" : "missing_creator"
    audit("self_approval_forbidden", requestId, { actionPreviewId, reason })
    await recordAuditEvent(auditLogs, ctx, {
      kind: "self_approval_forbidden", timestamp: new Date().toISOString(), requestId,
      actorId: session.userId, workUnitId, reason, metadata: { actionPreviewId },
    })
    return errorResponse(requestId, "self_approval_forbidden", 403)
  }

  const existingDecision = await approvalRepo.findByPreviewId(ctx, actionPreviewId)
  if (existingDecision) {
    audit("approval_create_failed", requestId, { actionPreviewId, reason: "decision_already_exists" })
    return errorResponse(requestId, "conflict", 409)
  }

  // Reject approvals built on an expired preview (red-team B-1). Without this a
  // stale preview could mint a fresh 30-minute approval window.
  if (isPreviewExpired(preview.expiresAt)) {
    audit("approval_create_failed", requestId, { actionPreviewId, reason: "preview_expired" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  // ── Create approval (hashes from stored preview) ─────────────
  const now = new Date().toISOString()
  const approvalId = `approval:${actionPreviewId}`

  const approvalRow = {
    id: approvalId,
    tenantId: session.tenantId,
    workUnitId,
    actionPreviewId,
    actionType: preview.actionType,
    targetHash: preview.targetHash,
    payloadHash: preview.payloadHash,
    status: decision === "approve" ? "approved" as const : "rejected" as const,
    approvedByUserId: decision === "approve" ? session.userId : undefined,
    createdAt: now,
    approvedAt: decision === "approve" ? now : undefined,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  }

  await approvalRepo.create(ctx, approvalRow)

  // ── Persist (tenant-scoped, fail-open, redacted) ─────────────
  await recordAuditEvent(auditLogs, ctx, {
    kind: decision === "approve" ? "approval_created" : "approval_rejected",
    timestamp: now, requestId, actorId: session.userId, workUnitId,
    metadata: { actionPreviewId, approvalId, actionType: preview.actionType, decision },
  })

  // ── Audit ────────────────────────────────────────────────────
  audit(decision === "approve" ? "approval_created" : "approval_rejected", requestId, {
    workUnitId, actionPreviewId, approvalId,
    actionType: preview.actionType, targetHash: preview.targetHash,
    payloadHash: preview.payloadHash, actorId: session.userId,
  })

  return json({
    ok: true,
    requestId,
    approval: {
      id: approvalRow.id,
      workUnitId,
      actionPreviewId,
      actionType: preview.actionType,
      status: approvalRow.status,
      expiresAt: approvalRow.expiresAt,
      createdAt: approvalRow.createdAt,
    },
  }, 201)
}

// ─── GET ────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workUnitId } = await params

  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) {
    return NextResponse.json(safeError("na", "integration_missing" as Parameters<typeof safeError>[1]), { status: 503 })
  }
  const runtime = runtimeResult.runtime

  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    return NextResponse.json(
      safeError("na", (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized"),
      { status: getSessionErrorStatus(sessionResult.reason) },
    )
  }

  if (!canCreatePreview(sessionResult.session)) {
    return NextResponse.json(safeError("na", "forbidden" as Parameters<typeof safeError>[1]), { status: 403 })
  }

  const repoResult = await resolveRouteReadRepositories(sessionResult.session.tenantId as TenantId, runtime)
  if (!repoResult.ok) {
    return errorResponse("na", "integration_missing", 503)
  }
  const { actionPreviews: previewRepo, ctx } = repoResult.bundle
  const rows = await previewRepo.findByWorkUnitId(ctx, workUnitId)

  return NextResponse.json({
    ok: true,
    previews: rows.map((row) => ({
      id: row.id,
      workUnitId: row.workUnitId,
      actionType: row.actionType,
      targetPreview: row.targetPreview,
      payloadPreview: row.payloadPreview,
      requiresApproval: row.requiresApproval === 1,
      status: row.status,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? null,
    })),
  })
}
