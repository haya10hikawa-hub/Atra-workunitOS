import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../lib/security/session.ts"
import { safeError } from "../../../lib/security/safeErrors.ts"
import { resolveRouteReadRepositories } from "../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../lib/tenant/types.ts"
import { canViewIntegrationStatus } from "../../../lib/security/tenantAccess.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../lib/runtime/requestRuntimeConfig.ts"
import { canUseLocalPersistenceFallback } from "../../../lib/runtime/localFallbackAuthority.ts"

const ALL_PROVIDERS = ["github", "slack", "calendar"] as const

export async function GET(request: Request): Promise<NextResponse> {
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

  const repoResult = await resolveRouteReadRepositories(sessionResult.session.tenantId as TenantId, runtime)

  // If repos available, read persisted connections
  if (repoResult.ok) {
    const connections = await repoResult.bundle.integrationConnections.listByTenant(repoResult.bundle.ctx)
    const providers = ALL_PROVIDERS.map((provider) => {
      const conn = connections.find((c) => c.provider === provider)
      return conn ? safeProviderStatus(conn) : defaultStatus(provider)
    })
    // INV-SAFE-1: the pure read-metering `usage.recordEvent` that stood here was
    // deleted outright with no replacement. The response above is built entirely
    // before it and its result was discarded, so nothing observable changes; and
    // nothing downstream consumes it (`getCurrentUsage` / `getDailySummary` have
    // zero non-test callers). `usage` is now absent from the resolved bundle type.
    return NextResponse.json({ providers })
  }

  // Production (Cloudflare OR Node) NEVER returns "fake" default provider status
  // to mask a persistence failure. The default-status fallback is authorized ONLY
  // by the central helper (explicit non-production local development).
  if (canUseLocalPersistenceFallback(runtime)) {
    return NextResponse.json({
      providers: ALL_PROVIDERS.map(defaultStatus),
    })
  }

  return NextResponse.json(safeError("status-na", repoResult.error), { status: repoResult.status })
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
