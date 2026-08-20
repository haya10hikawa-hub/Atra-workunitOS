import { NextResponse } from "next/server.js"
import { getSessionErrorStatus } from "../../../lib/security/session.ts"
import { requireSession } from "../../../lib/composition/requestSession.ts"
import { safeError } from "../../../lib/security/safeErrors.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../lib/runtime/requestRuntimeConfig.ts"
import {
  isInboxSource,
  projectInbox,
  projectInboxWithoutPersistence,
  resolveInboxSignals,
} from "../../../lib/application/workunitInbox/inboxService.ts"
import { resolveRouteReadRepositories } from "../../../lib/persistence/routeRepositories.ts"
import type { TenantId } from "../../../lib/tenant/types.ts"
import { canViewInbox } from "../../../lib/security/tenantAccess.ts"
import { canUseLocalPersistenceFallback } from "../../../lib/runtime/localFallbackAuthority.ts"

// ─── GET /api/workunit/inbox ────────────────────────────────────
//
// INV-SAFE-1: this handler is PROJECTION ONLY. It performs no repository
// insert/update/upsert/delete, no usage mutation and no durable audit
// mutation. Materializing WorkUnit rows is the sole responsibility of
// `POST /api/workunit/inbox/refresh`.
//
// The response is byte-identical to the pre-WU-02S GET: the previous code
// pushed `nextRow`, computed BEFORE the `upsert`, and discarded the `upsert`'s
// return value. The persisted non-`open` status overlay is preserved because
// the `findById` READ is retained — only the write is gone.
//
// It resolves repositories through `resolveRouteReadRepositories`, so `usage`
// is absent from the bundle type entirely and no write member is reachable.

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = `inbox:${Date.now()}`
  const runtimeResult = resolveValidatedRequestRuntimeConfig()
  if (!runtimeResult.ok) {
    return NextResponse.json(safeError("inbox-na", "integration_missing" as Parameters<typeof safeError>[1]), { status: 503 })
  }
  const runtime = runtimeResult.runtime
  const sessionResult = await requireSession(request, runtime)
  if (!sessionResult.ok) {
    return NextResponse.json(
      safeError("inbox-na", (sessionResult.reason === "forbidden" || sessionResult.reason === "invalid_tenant") ? "forbidden" : "unauthorized"),
      { status: getSessionErrorStatus(sessionResult.reason) },
    )
  }

  if (!canViewInbox(sessionResult.session)) {
    return NextResponse.json(
      safeError("inbox-na", "forbidden" as Parameters<typeof safeError>[1]),
      { status: 403 },
    )
  }

  const tenantId = sessionResult.session.tenantId
  const { searchParams } = new URL(request.url)
  const source = searchParams.get("source") ?? "mock"

  if (!isInboxSource(source)) {
    return NextResponse.json(
      safeError("inbox-na", "invalid_request" as Parameters<typeof safeError>[1]),
      { status: 400 },
    )
  }

  const repoResult = await resolveRouteReadRepositories(tenantId as TenantId, runtime)
  if (!repoResult.ok) {
    // Production (Cloudflare OR Node) NEVER returns generated fallback data on a
    // persistence failure. The generated fallback is authorized ONLY by the
    // central helper (explicit non-production local development).
    if (canUseLocalPersistenceFallback(runtime)) {
      const signals = await resolveInboxSignals(source, tenantId)
      return NextResponse.json({ workUnits: projectInboxWithoutPersistence(signals) })
    }
    return NextResponse.json(safeError(requestId, repoResult.error), { status: repoResult.status })
  }

  const { workUnits, ctx } = repoResult.bundle
  const projected = await projectInbox({ source, tenantId: ctx.tenantId, workUnits, ctx })

  return NextResponse.json({ workUnits: projected })
}
