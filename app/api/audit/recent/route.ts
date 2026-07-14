import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../lib/security/session.ts"
import { safeError } from "../../../lib/security/safeErrors.ts"
import { resolveRouteRepositories } from "../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../lib/tenant/types.ts"
import { canViewAudit } from "../../../lib/security/tenantAccess.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../lib/runtime/requestRuntimeConfig.ts"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const SENSITIVE_KEYS = new Set(["token", "accesstoken", "refreshtoken", "secret", "authorization", "cookie", "rawpayload", "rawbody", "password"])

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = `audit-recent:${Date.now()}`
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) return NextResponse.json(safeError("audit-na", "integration_missing"), { status: 503 })
  const runtime = runtimeResult.runtime
  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    return NextResponse.json(safeError("audit-na", sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant" ? "forbidden" : "unauthorized"), { status: getSessionErrorStatus(sessionResult.reason) })
  }
  if (!canViewAudit(sessionResult.session)) return NextResponse.json(safeError("audit-na", "forbidden"), { status: 403 })

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"))
  if (limit === null) return NextResponse.json(safeError(requestId, "invalid_request"), { status: 400 })

  const repoResult = await resolveRouteRepositories(sessionResult.session.tenantId as TenantId, runtime)
  if (!repoResult.ok) {
    if (process.env.NODE_ENV === "production") return NextResponse.json(safeError(requestId, repoResult.error), { status: repoResult.status })
    return NextResponse.json({ auditLogs: [] })
  }

  const auditLogs = (await repoResult.bundle.auditLogs.listRecent(repoResult.bundle.ctx, limit)).map((row) => ({
    id: row.id,
    eventKind: row.eventKind,
    targetType: row.workUnitId ? "work_unit" : row.requestId ? "request" : undefined,
    targetId: row.workUnitId ?? row.requestId,
    actorUserId: row.actorId,
    createdAt: row.occurredAt,
    metadata: sanitizeAuditMetadata(row.metadata),
  }))
  return NextResponse.json({ auditLogs })
}

function parseLimit(value: string | null): number | null {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return null
  return Math.min(parsed, MAX_LIMIT)
}

function sanitizeAuditMetadata(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    return sanitizeValue(JSON.parse(raw)) as Record<string, unknown>
  } catch {
    return {}
  }
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => isSensitiveKey(key) ? [] : [[key, sanitizeValue(entry)]]),
  )
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return SENSITIVE_KEYS.has(normalized) || normalized.endsWith("hash")
}
