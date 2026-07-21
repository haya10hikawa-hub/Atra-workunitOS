import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../../lib/security/session.ts"
import { safeError } from "../../../../lib/security/safeErrors.ts"
import { resolveRouteRepositories } from "../../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../../lib/tenant/types.ts"
import type { AuditLogRow } from "../../../../lib/persistence/types.ts"
import { canCreateFeedback } from "../../../../lib/security/tenantAccess.ts"
import { validateCsrfOrigin } from "../../../../lib/security/csrfProtection.ts"
import { readBoundedJsonObject } from "../../../../lib/security/requestBody.ts"
import { checkRateLimit, getTrustedClientIp } from "../../../../lib/security/rateLimitGate.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../../lib/runtime/requestRuntimeConfig.ts"

const VALID_FEEDBACK = new Set(["useful", "not_useful", "later", "done"])

function errorResponse(id: string, code: Parameters<typeof safeError>[1], status: number) {
  return NextResponse.json(safeError(id, code), { status })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workUnitId } = await params
  const requestId = `fb:${workUnitId}:${Date.now()}`

  // Runtime config resolved ONCE, before CSRF (origin allowlist source).
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) return errorResponse(requestId, "integration_missing", 503)
  const runtime = runtimeResult.runtime

  const csrf = validateCsrfOrigin(request, runtime.security.allowedOrigins)
  if (!csrf.ok) return errorResponse(requestId, csrf.reason, 403)

  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    return errorResponse(
      requestId,
      (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized",
      getSessionErrorStatus(sessionResult.reason),
    )
  }
  const session = sessionResult.session
  if (!canCreateFeedback(session)) return errorResponse(requestId, "forbidden", 403)
  if (!checkRateLimit({ tenantId: session.tenantId, actorUserId: session.userId, clientIp: getTrustedClientIp(request), routeFamily: "workunit_feedback" }).ok) {
    return errorResponse(requestId, "rate_limited", 429)
  }
  const tenantId = session.tenantId as TenantId

  const bodyResult = await readBoundedJsonObject(request, { maxBytes: 2 * 1024, maxDepth: 2, maxNodes: 10 })
  if (!bodyResult.ok) return errorResponse(requestId, "invalid_request", bodyResult.reason === "payload_too_large" ? 413 : 400)
  const feedback = bodyResult.value.feedback as string | undefined
  if (!feedback || !VALID_FEEDBACK.has(feedback)) return errorResponse(requestId, "invalid_request", 400)

  const repoResult = await resolveRouteRepositories(tenantId, runtime)
  if (!repoResult.ok) return errorResponse(requestId, "integration_missing", 503)

  const { workUnitFeedback: fbRepo, workUnits: wuRepo, auditLogs: auditRepo, usage, ctx } = repoResult.bundle
  const now = new Date().toISOString()

  if (!await wuRepo.findById(ctx, workUnitId)) return errorResponse(requestId, "invalid_request", 400)

  await fbRepo.create(ctx, {
    id: `fb:${workUnitId}:${Date.now()}`,
    tenantId,
    workUnitId,
    feedback,
    actorUserId: session.userId,
    createdAt: now,
  })

  if (feedback === "later" || feedback === "done") {
    await wuRepo.updateStatus(ctx, workUnitId, feedback).catch(() => {})
  }

  await auditRepo.append(ctx, {
    id: `audit:${requestId}`,
    tenantId,
    eventKind: "workunit.feedback.create",
    actorId: session.userId as AuditLogRow["actorId"],
    workUnitId,
    requestId,
    reason: feedback,
    metadata: JSON.stringify({ feedback }),
    occurredAt: now,
  })

  await usage.recordEvent(ctx, {
    id: `usage:${requestId}`,
    tenantId,
    eventType: "feedback_create",
    quantity: 1,
    resourceType: "work_unit",
    resourceId: workUnitId,
    metadataJson: JSON.stringify({ feedback }),
    createdAt: now,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
