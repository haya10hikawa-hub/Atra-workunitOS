import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../../../lib/security/session.ts"
import { safeError } from "../../../../../lib/security/safeErrors.ts"
import { writeAuditLog, type AuditEventKind } from "../../../../../lib/security/auditLog.ts"
import { resolveRouteRepositories } from "../../../../../lib/persistence/routeRepositories.ts"
import { areExternalActionsEnabled } from "../../../../../lib/security/externalActions.ts"
import type { TenantId } from "../../../../../lib/tenant/types.ts"
import { canCreatePreview } from "../../../../../lib/security/tenantAccess.ts"
import { canExecuteExternalAction } from "../../../../../lib/security/rbac.ts"
import { verifyApprovalPreviewBinding } from "../../../../../lib/security/approvalPreviewBinding.ts"
import { validateCsrfOrigin } from "../../../../../lib/security/csrfProtection.ts"
import { readBoundedJsonObject } from "../../../../../lib/security/requestBody.ts"
import { checkRateLimit, getTrustedClientIp } from "../../../../../lib/security/rateLimitGate.ts"

// ─── Types ──────────────────────────────────────────────────────

type DryRunResponse = {
  ok: true
  mode: "dry_run"
  status: "verified" | "blocked" | "not_ready"
  reason: string
  workUnitId: string
  actionCount: number
  requestedActionType: string | null
}

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

const FORBIDDEN_CLIENT_KEYS = [
  "approvalId", "targetHash", "payloadHash",
  "tenantId", "userId", "approvedByUserId", "approvedByPm",
  "role", "status", "usedAt",
  "tokens", "secret", "rawPayload", "rawBody",
]

function hasForbiddenClientKeys(body: Record<string, unknown>): boolean {
  return FORBIDDEN_CLIENT_KEYS.some((key) => key in body)
}

// ─── POST /api/workunit/:id/execution/dry-run ──────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workUnitId } = await params
  const requestId = `dry-run:${workUnitId}:${Date.now()}`

  const csrf = validateCsrfOrigin(request)
  if (!csrf.ok) return errorResponse(requestId, csrf.reason, 403)

  audit("execution_dry_run_requested", requestId, { workUnitId })

  // ── 1. Session ───────────────────────────────────────────────
  const sessionResult = await requireSession(request)
  if (!sessionResult.ok) {
    audit("execution_dry_run_failed", requestId, { reason: "unauthorized" })
    return errorResponse(
      requestId,
      (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized",
      getSessionErrorStatus(sessionResult.reason),
    )
  }
  const session = sessionResult.session
  if (!checkRateLimit({ tenantId: session.tenantId, actorUserId: session.userId, clientIp: getTrustedClientIp(request), routeFamily: "execution_dry_run" }).ok) {
    return errorResponse(requestId, "rate_limited", 429)
  }

  // ── 2. Parse body ────────────────────────────────────────────
  const bodyResult = await readBoundedJsonObject(request, { maxBytes: 16 * 1024, maxArrayLength: 20, maxNodes: 200 })
  if (!bodyResult.ok) {
    audit("execution_dry_run_failed", requestId, { reason: bodyResult.reason })
    return errorResponse(requestId, "invalid_request", bodyResult.reason === "payload_too_large" ? 413 : 400)
  }
  const body = bodyResult.value

  // ── 3. Validate shape ────────────────────────────────────────
  if (typeof body.workUnitId !== "string" || body.workUnitId !== workUnitId) {
    audit("execution_dry_run_failed", requestId, { reason: "workunit_mismatch" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  if (hasForbiddenClientKeys(body)) {
    audit("execution_dry_run_failed", requestId, { reason: "client_provided_context" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  if (!Array.isArray(body.previewRefs) || body.previewRefs.length > 20 || !body.previewRefs.every(isValidPreviewRef)) {
    audit("execution_dry_run_failed", requestId, { reason: "invalid_preview_refs" })
    return errorResponse(requestId, "invalid_request", 400)
  }
  const previewRefs = body.previewRefs as Array<{ actionId: string; previewId: string }>
  const previewIds = previewRefs.map((ref) => ref.previewId)
  const actionIds = previewRefs.map((ref) => ref.actionId)
  if (new Set(previewIds).size !== previewIds.length || new Set(actionIds).size !== actionIds.length) {
    audit("execution_dry_run_failed", requestId, { reason: "duplicate_preview_refs" })
    return errorResponse(requestId, "invalid_request", 400)
  }

  const requestedActionType: string | null =
    typeof body.requestedActionType === "string" ? body.requestedActionType : null

  // ── 4. RBAC ──────────────────────────────────────────────────
  // Issue #145: a dry-run that reports "would be allowed" is a preview of the
  // REAL execution decision, so it must require the real execute permission
  // (`workunit.execute_external_action`) — never preview-creation permission as
  // a substitute. A "verified" dry-run means only that all current evidence and
  // policy would permit ATTEMPTING the atomic claim now; no authorization is
  // created and no Approval or Linkage state is consumed.
  if (!canExecuteExternalAction(session) || !canCreatePreview(session)) {
    audit("execution_dry_run_failed", requestId, { reason: "rbac_denied" })
    return errorResponse(requestId, "forbidden", 403)
  }

  // ── 5. Resolve repositories ──────────────────────────────────
  const repoResult = await resolveRouteRepositories(session.tenantId as TenantId)
  if (!repoResult.ok) {
    audit("execution_dry_run_failed", requestId, { reason: "persistence_not_available" })
    return errorResponse(requestId, "integration_missing", 503)
  }
  const {
    actionPreviews: previewRepo,
    approvalRecords: approvalRepo,
    ctx,
  } = repoResult.bundle

  // ── 6. Load stored previews + approvals ──────────────────────
  if (previewIds.length === 0) {
    audit("execution_dry_run_blocked", requestId, { reason: "preview_ref_required" })
    return successResponse(workUnitId, previewRefs.length, requestedActionType, "not_ready", "A stored preview reference is required before dry-run verification.", requestId)
  }

  // ── 7. Explicit approval ↔ preview binding (Phase 5C) ────────
  // No latest/workUnit-only approval lookup. For each referenced preview, resolve
  // the approval bound to THAT exact preview (by actionPreviewId, tenant-scoped)
  // and verify the pair. The request is ready only if some referenced preview has
  // a fully-bound, valid approval.
  let allVerified = true
  let firstFailure: ReturnType<typeof verifyApprovalPreviewBinding> | null = null
  const now = new Date().toISOString()

  for (const previewId of previewIds) {
    const [approval, preview] = await Promise.all([
      approvalRepo.findByPreviewId(ctx, previewId),
      previewRepo.findById(ctx, previewId),
    ])
    const outcome = verifyApprovalPreviewBinding(
      { tenantId: session.tenantId as TenantId, workUnitId, actionPreviewId: previewId, requestedActionType, now },
      approval,
      preview,
    )
    if (outcome.ok) {
      continue
    }
    allVerified = false
    if (!firstFailure) firstFailure = outcome
  }

  if (!allVerified) {
    const failure = firstFailure ?? { ok: false as const, disposition: "not_ready" as const, reason: "No approval found for this preview." }
    if (failure.ok === false && failure.disposition === "forbidden") {
      audit("execution_dry_run_failed", requestId, { reason: "tenant_mismatch" })
      return errorResponse(requestId, "forbidden", 403)
    }
    if (failure.ok === false && failure.disposition === "invalid_request") {
      audit("execution_dry_run_failed", requestId, { reason: "binding_mismatch" })
      return errorResponse(requestId, "invalid_request", 400)
    }
    const reason = failure.ok === false && failure.disposition === "not_ready" ? failure.reason : "Not ready."
    audit("execution_dry_run_blocked", requestId, { reason: "binding_not_ready" })
    return successResponse(workUnitId, previewRefs.length, requestedActionType, "not_ready", reason, requestId)
  }

  // ── 8. Check kill switch ─────────────────────────────────────
  if (!areExternalActionsEnabled()) {
    audit("execution_dry_run_blocked", requestId, { reason: "kill_switch_active" })
    return successResponse(workUnitId, previewRefs.length, requestedActionType, "blocked", "External execution is disabled by kill switch.", requestId)
  }

  // ── 9. Verified ──────────────────────────────────────────────
  // IMPORTANT: dry-run NEVER marks approval as used
  // Approval remains available for real execution if/when enabled
  audit("execution_dry_run_verified", requestId, {
    workUnitId,
    actionCount: previewRefs.length,
    actionType: requestedActionType,
  })

  return successResponse(workUnitId, previewRefs.length, requestedActionType, "verified", "Execution would be allowed.", requestId)
}

function isValidPreviewRef(value: unknown): value is { actionId: string; previewId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const ref = value as Record<string, unknown>
  return typeof ref.actionId === "string" && ref.actionId.length > 0 && ref.actionId.length <= 256
    && typeof ref.previewId === "string" && ref.previewId.length > 0 && ref.previewId.length <= 256
}

// ─── Response builder ──────────────────────────────────────────

function successResponse(
  workUnitId: string,
  actionCount: number,
  requestedActionType: string | null,
  status: DryRunResponse["status"],
  reason: string,
  requestId: string,
): NextResponse {
  const body: DryRunResponse = {
    ok: true,
    mode: "dry_run",
    status,
    reason,
    workUnitId,
    actionCount,
    requestedActionType,
  }
  return json({ ...body, requestId }, 200)
}
