import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../../lib/security/session.ts"
import { safeError } from "../../../../lib/security/safeErrors.ts"
import { resolveRouteRepositories } from "../../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../../lib/tenant/types.ts"
import type { AuditLogRow } from "../../../../lib/persistence/types.ts"
import { canCreateFeedback } from "../../../../lib/security/tenantAccess.ts"
import { checkMutationRequestIntegrity, readGuardedJsonBody } from "../../../../lib/security/httpMutationGuard.ts"
import { checkRateLimit, getTrustedClientIp } from "../../../../lib/security/rateLimitGate.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../../lib/runtime/requestRuntimeConfig.ts"

const VALID_FEEDBACK = new Set(["useful", "not_useful", "later", "done"])
const BODY_LIMITS = { maxBytes: 2 * 1024, maxDepth: 2, maxNodes: 10 } as const

function errorResponse(id: string, code: Parameters<typeof safeError>[1], status: number) {
  return NextResponse.json(safeError(id, code), { status })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workUnitId } = await params
  const requestId = `fb:${workUnitId}:${Date.now()}`

  // ── 0. Request-scoped runtime configuration ──────────────────
  // Resolved FIRST: the guard's trusted-origin policy is a projection of it.
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) return errorResponse(requestId, "integration_missing", 503)
  const runtime = runtimeResult.runtime

  // ── 1–6. Request integrity (header-only, synchronous) ────────
  const integrity = checkMutationRequestIntegrity(request, {
    method: "POST",
    trustedOrigins: runtime.security.trustedOrigins,
    maxBytes: BODY_LIMITS.maxBytes,
  })
  if (!integrity.ok) return errorResponse(requestId, integrity.error, integrity.status)

  // ── 7. Authentication ────────────────────────────────────────
  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    return errorResponse(
      requestId,
      (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized",
      getSessionErrorStatus(sessionResult.reason),
    )
  }
  const session = sessionResult.session
  const tenantId = session.tenantId as TenantId

  // ── 8. Tenant identity and active membership authority ───────
  const repoResult = await resolveRouteRepositories(tenantId, runtime)
  if (!repoResult.ok) return errorResponse(requestId, "integration_missing", 503)

  // ── 9. Rate limit — after authentication and tenant authority ──
  if (!checkRateLimit({ tenantId: session.tenantId, actorUserId: session.userId, clientIp: getTrustedClientIp(request), routeFamily: "workunit_feedback" }).ok) {
    return errorResponse(requestId, "rate_limited", 429)
  }

  // ── 10. Route-specific RBAC — before the body read ───────────
  if (!canCreateFeedback(session)) return errorResponse(requestId, "forbidden", 403)

  // ── 11–13. Body read, JSON parse, domain validation ──────────
  const bodyResult = await readGuardedJsonBody(request, BODY_LIMITS)
  if (!bodyResult.ok) return errorResponse(requestId, "invalid_request", bodyResult.reason === "payload_too_large" ? 413 : 400)
  const feedback = bodyResult.value.feedback as string | undefined
  if (!feedback || !VALID_FEEDBACK.has(feedback)) return errorResponse(requestId, "invalid_request", 400)

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
