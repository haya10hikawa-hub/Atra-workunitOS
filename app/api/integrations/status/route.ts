import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../lib/security/session.ts"
import { safeError } from "../../../lib/security/safeErrors.ts"
import { resolveRouteRepositories } from "../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../lib/tenant/types.ts"
import { canViewIntegrationStatus } from "../../../lib/security/tenantAccess.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../lib/runtime/requestRuntimeConfig.ts"

const ALL_PROVIDERS = ["github", "slack", "calendar"] as const

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = `integration-status:${Date.now()}`
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) {
    return NextResponse.json(safeError("status-na", "integration_missing" as Parameters<typeof safeError>[1]), { status: 503 })
  }
  const runtime = runtimeResult.runtime
  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    return NextResponse.json(
      safeError("status-na", (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized"),
      { status: getSessionErrorStatus(sessionResult.reason) },
    )
  }
  if (!canViewIntegrationStatus(sessionResult.session)) {
    return NextResponse.json(safeError("status-na", "forbidden" as Parameters<typeof safeError>[1]), { status: 403 })
  }

  const repoResult = await resolveRouteRepositories(sessionResult.session.tenantId as TenantId, runtime)

  // If repos available, read persisted connections
  if (repoResult.ok) {
    const connections = await repoResult.bundle.integrationConnections.listByTenant(repoResult.bundle.ctx)
    const providers = ALL_PROVIDERS.map((provider) => {
      const conn = connections.find((c) => c.provider === provider)
      return conn ? safeProviderStatus(conn) : defaultStatus(provider)
    })
    await repoResult.bundle.usage.recordEvent(repoResult.bundle.ctx, {
      id: `usage:${requestId}`,
      tenantId: repoResult.bundle.ctx.tenantId,
      eventType: "integration_status_read",
      quantity: 1,
      resourceType: "integration_status",
      metadataJson: JSON.stringify({ count: providers.length }),
      createdAt: new Date().toISOString(),
    }).catch(() => {})
    return NextResponse.json({ providers })
  }

  // Cloudflare production NEVER returns "fake" default provider status to mask a
  // persistence failure — surface the safe error. Local dev fallback only.
  if (runtime.source === "cloudflare") {
    return NextResponse.json(safeError("status-na", repoResult.error), { status: repoResult.status })
  }

  // Local dev fallback: default statuses.
  return NextResponse.json({
    providers: ALL_PROVIDERS.map(defaultStatus),
  })
}

function safeProviderStatus(conn: { provider: string; status: string; mode: string; scopesJson?: string; lastSyncAt?: string; lastErrorCode?: string }) {
  return {
    provider: conn.provider,
    status: conn.status,
    mode: conn.mode,
    scopes: safeJsonParse(conn.scopesJson),
    lastSyncedAt: conn.lastSyncAt ?? null,
    lastErrorCode: conn.lastErrorCode ?? null,
  }
}

function defaultStatus(provider: string) {
  return { provider, status: "fake", mode: "fake", scopes: [], lastSyncedAt: null, lastErrorCode: null }
}

function safeJsonParse(val: string | undefined): unknown {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}
