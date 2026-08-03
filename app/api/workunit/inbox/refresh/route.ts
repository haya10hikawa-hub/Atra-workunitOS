import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../../lib/security/session.ts"
import { safeError } from "../../../../lib/security/safeErrors.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../../lib/runtime/requestRuntimeConfig.ts"
import { checkMutationRequestIntegrity, readGuardedJsonBody } from "../../../../lib/security/httpMutationGuard.ts"
import { checkRateLimit, getTrustedClientIp } from "../../../../lib/security/rateLimitGate.ts"
import { canRefreshWorkUnitInbox } from "../../../../lib/security/tenantAccess.ts"
import { hasClientOwnedFields, resolveRequestId } from "../../../../lib/security/routeGuards.ts"
import { resolveRouteRepositories } from "../../../../lib/persistence/routeRepositories.ts"
import { isInboxSource, refreshInbox, type InboxSource } from "../../../../lib/application/workunitInbox/inboxService.ts"

// ─── POST /api/workunit/inbox/refresh ───────────────────────────
//
// The SOLE explicit WorkUnit-row materialization path. `GET /api/workunit/inbox`
// is projection only (INV-SAFE-1), so a direct API caller that previously
// relied on the GET to materialize rows before
// `POST /api/workunit/[id]/action-preview` or `POST /api/workunit/[id]/feedback`
// must call this endpoint first. No UI caller is added by this WorkUnit.
//
// METHOD AUTHORITY (C4): this module exports `POST` ONLY. For an actual HTTP
// request with an unsupported method the Next.js App Router dispatcher returns
// 405 BEFORE this handler is entered, and that response is not the repository's
// safeError envelope. The guard's step-1 method check below is defense in depth
// for DIRECT handler invocation (internal calls, unit probes). It is not
// claimed that every unsupported network request executes the guard.
//
// EXECUTABLE ORDER — the steps are numbered inline and must not be reordered.

const REFRESH_BODY_LIMITS = { maxBytes: 2048, maxDepth: 2, maxNodes: 10 } as const

function errorResponse(requestId: string, code: Parameters<typeof safeError>[1], status: number): NextResponse {
  return NextResponse.json(safeError(requestId, code), { status })
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = resolveRequestId(request)

  // ── 0. Request-scoped runtime configuration ──────────────────
  // Reads no body, resolves no session, determines no tenant, performs no RBAC,
  // touches no repository. It must precede the guard because the guard's
  // trusted-origin policy IS a projection of this config — resolving it later
  // would make the guard unimplementable. A failure here is request-independent
  // and value-free, so it creates no authentication or tenant oracle even
  // though it now precedes the integrity checks.
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) return errorResponse(requestId, "integration_missing", 503)
  const runtime = runtimeResult.runtime

  // ── 1–6. Request integrity (header-only, synchronous) ────────
  // method → trusted target Host → Origin → Referer fallback →
  // Content-Length precheck → Content-Type/charset. No body is read and no
  // credential is consulted, so every integrity failure is indistinguishable
  // from the others regardless of credential validity.
  const integrity = checkMutationRequestIntegrity(request, {
    method: "POST",
    trustedOrigins: runtime.security.trustedOrigins,
    maxBytes: REFRESH_BODY_LIMITS.maxBytes,
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

  // ── 8. Tenant identity and active membership authority ───────
  // The tenant comes from the verified session and is validated against the
  // control registry by the resolver. It is NEVER read from the request body.
  // `session.tenantId` is already `TenantId`, so no cast and no direct import
  // of the compatibility tenant module are needed — this route deliberately
  // adds no new compatibility-tenant import edge.
  const repoResult = await resolveRouteRepositories(session.tenantId, runtime)
  if (!repoResult.ok) return errorResponse(requestId, repoResult.error, repoResult.status)

  // ── 9. Rate limit ────────────────────────────────────────────
  // After authentication and tenant authority (it keys on both), before route
  // RBAC and the body read.
  if (!checkRateLimit({
    tenantId: session.tenantId,
    actorUserId: session.userId,
    clientIp: getTrustedClientIp(request),
    routeFamily: "workunit_inbox_refresh",
  }).ok) {
    return errorResponse(requestId, "rate_limited", 429)
  }

  // ── 10. Route-specific RBAC ──────────────────────────────────
  // BEFORE the body read: the JSON parser is exposed to a strictly smaller
  // caller set than the authenticated population. A `viewer` sending an
  // oversized or malformed body therefore receives 403, not 413 or 400.
  if (!canRefreshWorkUnitInbox(session)) return errorResponse(requestId, "forbidden", 403)

  // ── 11–12. Body read and JSON parse ──────────────────────────
  const bodyResult = await readGuardedJsonBody(request, REFRESH_BODY_LIMITS)
  if (!bodyResult.ok) {
    return errorResponse(requestId, "invalid_request", bodyResult.reason === "payload_too_large" ? 413 : 400)
  }
  const body = bodyResult.value

  // ── 13. Domain validation ────────────────────────────────────
  // Server-owned fields (tenantId, userId, status, …) are rejected outright
  // rather than ignored, so a client can never supply tenant identity.
  if (hasClientOwnedFields(body)) return errorResponse(requestId, "invalid_request", 400)

  // The refresh schema is exactly `{ source?: InboxSource }`. Any other key is
  // rejected. This is a strict allowlist rather than a deny-list, so a
  // server-owned field the shared `hasClientOwnedFields` list does not happen
  // to name — `role` is one — still cannot be smuggled in.
  for (const key of Object.keys(body)) {
    if (key !== "source") return errorResponse(requestId, "invalid_request", 400)
  }

  // Absent → "mock", identical to the GET default. Any other value → 400,
  // identical to the GET's rejection. `mock` is a first-class member of the
  // vocabulary in both the request and the response, not a rejected value.
  const rawSource = body.source
  let source: InboxSource
  if (rawSource === undefined) {
    source = "mock"
  } else if (typeof rawSource === "string" && isInboxSource(rawSource)) {
    source = rawSource
  } else {
    return errorResponse(requestId, "invalid_request", 400)
  }

  // ── 14–17. Provider resolution → persistence → usage → audit ──
  const result = await refreshInbox({
    source,
    actorUserId: session.userId,
    requestId,
    bundle: repoResult.bundle,
  })
  if (!result.ok) return errorResponse(requestId, "integration_missing", 503)

  // ── 18. Response — COUNT ONLY ────────────────────────────────
  // Exactly { ok, requestId, refreshed, source }. No WorkUnit entities, no
  // tenant values, no repository rows, no provider-native objects, no provider
  // content and no internal errors. The caller uses GET to read the projection.
  return NextResponse.json({ ok: true, requestId, refreshed: result.refreshed, source })
}
