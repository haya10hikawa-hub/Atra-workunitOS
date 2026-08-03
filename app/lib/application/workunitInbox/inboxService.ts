/**
 * Inbox application service.
 *
 * Owns signal resolution and the Inbox WorkUnit projection for BOTH
 * `GET /api/workunit/inbox` (projection only) and
 * `POST /api/workunit/inbox/refresh` (the sole explicit persistence path).
 * Because both routes call into this one module, the two paths cannot drift
 * without editing shared code, and the route layer holds no duplicated
 * orchestration.
 *
 * PROVIDER NOTE: every provider here is a fake. `resolveGitHubClient()` returns
 * `fakeGitHubClient` on every branch, and Slack/Calendar resolve to
 * `fetchFake*`. The latency, failure and idempotency characteristics of these
 * functions are measured against in-process fakes and must NOT be cited as
 * evidence that the same shape is safe once a real provider is activated.
 */

import { MOCK_SIGNALS } from "./mockSignals.ts"
import { transformSignalsToInboxWorkUnits } from "./transform.ts"
import { inboxWorkUnitToRow, workUnitRowToInboxWorkUnit } from "./persistenceMapping.ts"
import type { InboxWorkUnit, NormalizedToolSignal } from "./types.ts"
import { resolveGitHubClient } from "../../infrastructure/external/github/resolveGitHubSource.ts"
import { githubEventsToNormalizedToolSignals } from "../../infrastructure/external/github/toNormalizedToolSignal.ts"
import { fetchFakeSlackNormalizedEvents } from "../../infrastructure/external/slack/fakeSlackSource.ts"
import { slackEventsToNormalizedToolSignals } from "../../infrastructure/external/slack/toNormalizedToolSignal.ts"
import { fetchFakeCalendarNormalizedEvents } from "../../infrastructure/external/calendar/fakeCalendarSource.ts"
import { calendarEventsToNormalizedToolSignals } from "../../infrastructure/external/calendar/toNormalizedToolSignal.ts"
import type { AuditLogRow, TenantDbContext } from "../../persistence/types.ts"
import type { TenantRepositoryBundle, WorkUnitReadRepository } from "../../persistence/repositoryResolver.ts"

// ─── Source vocabulary ──────────────────────────────────────────

export type InboxSource = "mock" | "github" | "slack" | "calendar" | "all"

/** Preserved verbatim from the GET contract. `mock` is the absent-value default. */
export const INBOX_SOURCES: readonly InboxSource[] = Object.freeze([
  "mock",
  "github",
  "slack",
  "calendar",
  "all",
])

export function isInboxSource(value: string): value is InboxSource {
  return (INBOX_SOURCES as readonly string[]).includes(value)
}

// ─── Signal resolution ──────────────────────────────────────────

/**
 * Resolve every signal for the requested source. Moved verbatim from the Inbox
 * GET route so both routes share one implementation.
 *
 * For `all`, `Promise.all` means a rejection from ANY provider rejects the
 * whole call before a single row is written. That is what makes the refresh
 * endpoint's "no write unless every provider resolved" property true.
 */
export async function resolveInboxSignals(
  source: InboxSource,
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

// ─── Projection (safe methods) ──────────────────────────────────

/**
 * Non-production local-fallback path: the generated projection with no
 * repository access at all.
 */
export function projectInboxWithoutPersistence(
  signals: NormalizedToolSignal[],
): InboxWorkUnit[] {
  return transformSignalsToInboxWorkUnits(signals)
}

/**
 * PURE projection. Reads the persisted status overlay through `findById` and
 * performs NO write.
 *
 * Its repository parameter is the READ-ONLY type, so this function is
 * structurally incapable of writing — including via a caller-injected callback.
 * The response value is computed exactly as the pre-WU-02S GET computed it: the
 * row is built before any persistence call and the persisted non-`open` status
 * wins. The GET response was already independent of the `upsert` RETURN VALUE
 * (which was discarded); it is NOT independent of the `findById` READ, which is
 * retained here.
 */
export async function projectInbox(input: {
  readonly source: InboxSource
  readonly tenantId: string
  readonly workUnits: WorkUnitReadRepository
  readonly ctx: TenantDbContext
}): Promise<InboxWorkUnit[]> {
  const signals = await resolveInboxSignals(input.source, input.tenantId)
  const generated = transformSignalsToInboxWorkUnits(signals)
  return projectAgainstPersistedStatus(generated, input.workUnits, input.ctx)
}

/**
 * Shared status-overlay projection. Read-only by type: the repository
 * parameter exposes `findById` and `listRecent` only.
 */
async function projectAgainstPersistedStatus(
  generated: InboxWorkUnit[],
  workUnits: WorkUnitReadRepository,
  ctx: TenantDbContext,
): Promise<InboxWorkUnit[]> {
  const projected: InboxWorkUnit[] = []
  for (const workUnit of generated) {
    const existing = await workUnits.findById(ctx, workUnit.id)
    const nextRow = inboxWorkUnitToRow({
      ...workUnit,
      status: existing && existing.status !== "open" ? workUnitRowToInboxWorkUnit(existing).status : workUnit.status,
    })
    projected.push(workUnitRowToInboxWorkUnit(nextRow))
  }
  return projected
}

// ─── Refresh (the sole explicit persistence path) ───────────────

export type RefreshInboxResult =
  | { readonly ok: true; readonly refreshed: number }
  | { readonly ok: false; readonly reason: "signal_resolution_failed" }

/**
 * Materialize Inbox WorkUnit rows for the authenticated tenant.
 *
 * ALL signals resolve BEFORE the first repository write, so a provider failure
 * writes nothing and returns `signal_resolution_failed` (the route maps that to
 * 503 `integration_missing` with zero rows, zero usage and zero audit). That is
 * a strengthening over the pre-WU-02S GET, where a provider rejection escaped
 * mid-request after rows had already been written.
 *
 * TRANSACTION SEMANTICS — stated exactly, not overclaimed. `WorkUnitRepository`
 * exposes no transaction method, so there is no rollback to invoke and none is
 * introduced. Once the write loop begins, a failure part-way through leaves a
 * PARTIAL ROW SET: every written row authorized, same-tenant and drawn from the
 * same projection, but fewer rows than the projection contains. Transaction-level
 * all-or-nothing is NOT claimed. What is guaranteed is narrower and exact:
 * no write occurs unless every provider resolved.
 *
 * Tenant derives from `bundle.ctx.tenantId` — the resolver's real context, never
 * a route-authored `{ tenantId, db: null }`.
 */
export async function refreshInbox(input: {
  readonly source: InboxSource
  readonly actorUserId: string
  readonly requestId: string
  readonly bundle: TenantRepositoryBundle
}): Promise<RefreshInboxResult> {
  const { bundle, source, requestId, actorUserId } = input
  const { workUnits, usage, auditLogs, ctx } = bundle

  // ── 14. Provider / fake-source resolution — ALL sources first ──
  let signals: NormalizedToolSignal[]
  try {
    signals = await resolveInboxSignals(source, ctx.tenantId)
  } catch {
    return { ok: false, reason: "signal_resolution_failed" }
  }

  const generated = transformSignalsToInboxWorkUnits(signals)

  // ── 15. Persistence — per-row upsert over the resolved projection ──
  let refreshed = 0
  for (const workUnit of generated) {
    const existing = await workUnits.findById(ctx, workUnit.id)
    const nextRow = inboxWorkUnitToRow({
      ...workUnit,
      status: existing && existing.status !== "open" ? workUnitRowToInboxWorkUnit(existing).status : workUnit.status,
    })
    await workUnits.upsert(ctx, nextRow)
    refreshed += 1
  }

  const now = new Date().toISOString()

  // ── 16. Usage — fail-open, AFTER persistence, AFTER authorization ──
  // Event names preserved VERBATIM so existing dashboards and the audit/recent
  // projection keep working; only the triggering method changes GET → POST.
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

  // ── 17. Audit — fail-open, AFTER persistence, AFTER authorization ──
  await auditLogs.append(ctx, {
    id: `audit:${requestId}`,
    tenantId: ctx.tenantId,
    eventKind: "workunit.inbox.fetch",
    actorId: actorUserId as AuditLogRow["actorId"],
    requestId,
    reason: source,
    metadata: JSON.stringify({ source, count: refreshed }),
    occurredAt: now,
  }).catch(() => {})

  return { ok: true, refreshed }
}
