import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../../../lib/security/session.ts"
import { safeError } from "../../../../../lib/security/safeErrors.ts"
import { writeAuditLog, type AuditEventKind } from "../../../../../lib/security/auditLog.ts"
import { resolveRouteReadRepositories } from "../../../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../../../lib/tenant/types.ts"
import { canCreatePreview } from "../../../../../lib/security/tenantAccess.ts"
import type { ApprovalRecordRow } from "../../../../../lib/persistence/types.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../../../lib/runtime/requestRuntimeConfig.ts"

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

// ─── Types ──────────────────────────────────────────────────────

type ApprovalStatusResponse = {
  workUnitId: string
  latestActionPreviewId: string | null
  status: "none" | "pending" | "approved" | "rejected" | "expired" | "used"
  approved: boolean
  rejected: boolean
  expired: boolean
  used: boolean
  createdAt: string | null
  expiresAt: string | null
  usedAt: string | null
}

// ─── GET /api/workunit/:id/approval/status ──────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workUnitId } = await params
  const requestId = `approval-status:${workUnitId}:${Date.now()}`

  audit("approval_status_requested", requestId, { workUnitId })

  // ── Request-scoped runtime config (resolved ONCE) ────────────
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) {
    audit("approval_status_failed", requestId, { reason: "runtime_config_invalid" })
    return errorResponse(requestId, "integration_missing", 503)
  }
  const runtime = runtimeResult.runtime

  // ── Session ──────────────────────────────────────────────────
  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    audit("approval_status_failed", requestId, { reason: "unauthorized" })
    return errorResponse(
      requestId,
      (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized",
      getSessionErrorStatus(sessionResult.reason),
    )
  }
  const session = sessionResult.session

  // ── RBAC ─────────────────────────────────────────────────────
  if (!canCreatePreview(session)) {
    audit("approval_status_failed", requestId, { reason: "rbac_denied" })
    return errorResponse(requestId, "forbidden", 403)
  }

  // ── Resolve repositories (same frozen runtime config) ───────
  const repoResult = await resolveRouteReadRepositories(session.tenantId as TenantId, runtime)
  if (!repoResult.ok) {
    return errorResponse(requestId, "integration_missing", 503)
  }
  const { approvalRecords, ctx } = repoResult.bundle

  // ── Query approvals ──────────────────────────────────────────
  const records = await approvalRecords.findByWorkUnitId(ctx, workUnitId)

  // ── Compute safe status ──────────────────────────────────────
  const status = computeApprovalStatus(workUnitId, records)

  audit("approval_status_returned", requestId, { workUnitId, status: status.status })

  return json(status, 200)
}

// ─── Status computation ─────────────────────────────────────────

function computeApprovalStatus(
  workUnitId: string,
  records: ApprovalRecordRow[],
): ApprovalStatusResponse {
  // No approvals at all
  if (records.length === 0) {
    return {
      workUnitId,
      latestActionPreviewId: null,
      status: "none",
      approved: false,
      rejected: false,
      expired: false,
      used: false,
      createdAt: null,
      expiresAt: null,
      usedAt: null,
    }
  }

  // Latest record by createdAt
  const latest = records[0]

  // Used takes precedence over everything
  if (latest.status === "used") {
    return {
      workUnitId,
      latestActionPreviewId: latest.actionPreviewId,
      status: "used",
      approved: true, // was approved before being used
      rejected: false,
      expired: false,
      used: true,
      createdAt: latest.createdAt,
      expiresAt: latest.expiresAt,
      usedAt: latest.usedAt ?? null,
    }
  }

  // Expired approved
  if (latest.status === "approved" && latest.expiresAt && new Date(latest.expiresAt) < new Date()) {
    return {
      workUnitId,
      latestActionPreviewId: latest.actionPreviewId,
      status: "expired",
      approved: false,
      rejected: false,
      expired: true,
      used: false,
      createdAt: latest.createdAt,
      expiresAt: latest.expiresAt,
      usedAt: null,
    }
  }

  // Explicitly rejected
  if (latest.status === "rejected") {
    return {
      workUnitId,
      latestActionPreviewId: latest.actionPreviewId,
      status: "rejected",
      approved: false,
      rejected: true,
      expired: false,
      used: false,
      createdAt: latest.createdAt,
      expiresAt: latest.expiresAt,
      usedAt: null,
    }
  }

  // Approved and still valid
  if (latest.status === "approved") {
    return {
      workUnitId,
      latestActionPreviewId: latest.actionPreviewId,
      status: "approved",
      approved: true,
      rejected: false,
      expired: false,
      used: false,
      createdAt: latest.createdAt,
      expiresAt: latest.expiresAt,
      usedAt: null,
    }
  }

  // Pending or any other status
  return {
    workUnitId,
    latestActionPreviewId: latest.actionPreviewId,
    status: "pending",
    approved: false,
    rejected: false,
    expired: false,
    used: false,
    createdAt: latest.createdAt,
    expiresAt: latest.expiresAt,
    usedAt: null,
  }
}
