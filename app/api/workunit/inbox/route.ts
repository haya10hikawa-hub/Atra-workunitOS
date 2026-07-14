import { NextResponse } from "next/server.js"
import { getSessionErrorStatus, requireSession } from "../../../lib/security/session.ts"
import { safeError } from "../../../lib/security/safeErrors.ts"
import { resolveValidatedRequestRuntimeConfig } from "../../../lib/runtime/requestRuntimeConfig.ts"
import { MOCK_SIGNALS } from "../../../lib/application/workunitInbox/mockSignals.ts"
import { transformSignalsToInboxWorkUnits } from "../../../lib/application/workunitInbox/transform.ts"
import { inboxWorkUnitToRow, workUnitRowToInboxWorkUnit } from "../../../lib/application/workunitInbox/persistenceMapping.ts"
import type { InboxWorkUnit, NormalizedToolSignal } from "../../../lib/application/workunitInbox/types.ts"
import { resolveGitHubClient } from "../../../lib/infrastructure/external/github/resolveGitHubSource.ts"
import { githubEventsToNormalizedToolSignals } from "../../../lib/infrastructure/external/github/toNormalizedToolSignal.ts"
import { fetchFakeSlackNormalizedEvents } from "../../../lib/infrastructure/external/slack/fakeSlackSource.ts"
import { slackEventsToNormalizedToolSignals } from "../../../lib/infrastructure/external/slack/toNormalizedToolSignal.ts"
import { fetchFakeCalendarNormalizedEvents } from "../../../lib/infrastructure/external/calendar/fakeCalendarSource.ts"
import { calendarEventsToNormalizedToolSignals } from "../../../lib/infrastructure/external/calendar/toNormalizedToolSignal.ts"
import { resolveRouteRepositories } from "../../../lib/persistence/routeRepositories.ts"
import type { WorkUnitRepository } from "../../../lib/persistence/repositories.ts"
import type { TenantId } from "../../../lib/tenant/types.ts"
import { canViewInbox } from "../../../lib/security/tenantAccess.ts"

const VALID_SOURCES = new Set(["mock", "github", "slack", "calendar", "all"])

// ─── GET /api/workunit/inbox ────────────────────────────────────

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
  const actorUserId = sessionResult.session.userId
  const { searchParams } = new URL(request.url)
  const source = searchParams.get("source") ?? "mock"

  if (!VALID_SOURCES.has(source)) {
    return NextResponse.json(
      safeError("inbox-na", "invalid_request" as Parameters<typeof safeError>[1]),
      { status: 400 },
    )
  }

  const signals = await resolveSignals(source, tenantId)
  const generatedWorkUnits = transformSignalsToInboxWorkUnits(signals)
  const repoResult = await resolveRouteRepositories(tenantId as TenantId, runtime)
  if (!repoResult.ok) {
    // Cloudflare production NEVER returns generated fallback data on a persistence
    // failure — surface the safe error. The local dev fallback is authorized only
    // by the explicit request runtime config (source === "local").
    if (runtime.source === "cloudflare") {
      return NextResponse.json(safeError(requestId, repoResult.error), { status: repoResult.status })
    }
    return NextResponse.json({ workUnits: generatedWorkUnits })
  }

  const { workUnits, usage, auditLogs, ctx } = repoResult.bundle
  const persistedWorkUnits = await persistWorkUnits(ctx.tenantId, generatedWorkUnits, workUnits)
  const now = new Date().toISOString()

  await usage.recordEvent(ctx, {
    id: `usage:${requestId}`,
    tenantId: ctx.tenantId,
    eventType: "inbox_fetch",
    quantity: 1,
    resourceType: "workunit_inbox",
    resourceId: source,
    metadataJson: JSON.stringify({ source }),
    createdAt: now,
  }).catch(() => {})

  await auditLogs.append(ctx, {
    id: `audit:${requestId}`,
    tenantId: ctx.tenantId,
    eventKind: "workunit.inbox.fetch",
    actorId: actorUserId,
    requestId,
    reason: source,
    metadata: JSON.stringify({ source, count: persistedWorkUnits.length }),
    occurredAt: now,
  }).catch(() => {})

  return NextResponse.json({ workUnits: persistedWorkUnits })
}

// ─── Signal Resolution ──────────────────────────────────────────

async function resolveSignals(
  source: string,
  tenantId: string,
): Promise<NormalizedToolSignal[]> {
  switch (source) {
    case "github": {
      const { client, token } = resolveGitHubClient()
      const events = await client.fetchNormalizedEvents({ tenantId, token })
      return githubEventsToNormalizedToolSignals(events)
    }
    case "slack": {
      const events = await fetchFakeSlackNormalizedEvents({ tenantId })
      return slackEventsToNormalizedToolSignals(events)
    }
    case "calendar": {
      const events = await fetchFakeCalendarNormalizedEvents({ tenantId })
      return calendarEventsToNormalizedToolSignals(events)
    }
    case "all": {
      const { client, token } = resolveGitHubClient()
      const [github, slack, cal] = await Promise.all([
        client.fetchNormalizedEvents({ tenantId, token }),
        fetchFakeSlackNormalizedEvents({ tenantId }),
        fetchFakeCalendarNormalizedEvents({ tenantId }),
      ])
      return [
        ...githubEventsToNormalizedToolSignals(github),
        ...slackEventsToNormalizedToolSignals(slack),
        ...calendarEventsToNormalizedToolSignals(cal),
      ]
    }
    case "mock":
    default: {
      return MOCK_SIGNALS.filter((s) => s.tenantId === tenantId)
    }
  }
}

async function persistWorkUnits(
  tenantId: string,
  generatedWorkUnits: InboxWorkUnit[],
  repository: WorkUnitRepository,
): Promise<InboxWorkUnit[]> {
  const ctx = { tenantId: tenantId as TenantId, db: null }
  const persisted: InboxWorkUnit[] = []

  for (const workUnit of generatedWorkUnits) {
    const existing = await repository.findById(ctx, workUnit.id)
    const nextRow = inboxWorkUnitToRow({
      ...workUnit,
      status: existing && existing.status !== "open" ? workUnitRowToInboxWorkUnit(existing).status : workUnit.status,
    })
    await repository.upsert(ctx, nextRow)
    persisted.push(workUnitRowToInboxWorkUnit(nextRow))
  }

  return persisted
}
