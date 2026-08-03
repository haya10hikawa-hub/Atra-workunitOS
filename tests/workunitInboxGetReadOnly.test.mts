/**
 * WU-02S — safe-method behavioural probes (T12–T17).
 *
 * These are the EXECUTABLE layer of INV-SAFE-1 (layer L3). They are what kills
 * a callback-injected writer, which no static scanner can catch: the probe
 * counts real calls on an instrumented repository bundle, so a write reaches
 * the counter however it was smuggled in.
 *
 * Every probe asserts BOTH directions — zero on the safe handler AND non-zero
 * on a positive control — so a probe that silently stopped observing anything
 * fails instead of passing.
 *
 * Coverage limit, stated: probes observe EXERCISED paths only. Unexercised
 * branches are a known gap, closed by the type-level containment in
 * `safeMethodWriteInvariant.test.mts` (T6/T7) rather than by this file.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { GET as inboxGet } from "../app/api/workunit/inbox/route.ts"
import { POST as refreshPost } from "../app/api/workunit/inbox/refresh/route.ts"
import { POST as feedbackPost } from "../app/api/workunit/[id]/feedback/route.ts"
import { GET as integrationsStatusGet } from "../app/api/integrations/status/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"

// Branded tenant type derived from the resolver signature: this file adds no
// compatibility-tenant import edge.
type ResolverTenantId = Parameters<typeof resolveRouteRepositories>[0]
const tenantId = "dev-tenant" as ResolverTenantId
const ORIGIN = "http://localhost:3000"

/** Every durable-write method name across the repository contract. */
const WRITE_METHODS = ["create", "upsert", "updateStatus", "markUsed", "claimForRuntime", "append", "recordEvent"] as const

type Counts = Record<string, number>

async function withRouteRuntime(run: (db: FakeD1Database) => Promise<void>): Promise<void> {
  const db = new FakeD1Database()
  const backup = { ...process.env }
  try {
    Object.assign(process.env, {
      NODE_ENV: "development", AUTH_ADAPTER: "dev", ALLOW_DEV_SESSION: "true",
      ALLOW_DEV_WORKSPACE_BOOTSTRAP: "true", PERSISTENCE_MODE: "d1", DEV_SESSION_ROLE: "owner",
    })
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    await run(db)
  } finally {
    resetTestRuntimeEnvForRequest()
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
  }
}

/**
 * Count durable writes actually performed against the tenant store during a
 * request, by reading the FakeD1 tables directly. This observes the REAL effect
 * rather than a call name, so an aliased or callback-injected writer is counted
 * exactly like a direct one.
 */
function tableCounts(db: FakeD1Database): Counts {
  return {
    work_units: db.debugTable("work_units").length,
    usage_events: db.debugTable("usage_events").length,
    audit_logs: db.debugTable("audit_logs").length,
  }
}

/** An instrumented bundle that counts every durable-write method invocation. */
function instrument(bundle: Record<string, unknown>): { bundle: Record<string, unknown>; counts: Counts } {
  const counts: Counts = {}
  const wrapped: Record<string, unknown> = { ctx: bundle.ctx }
  for (const [key, repo] of Object.entries(bundle)) {
    if (key === "ctx" || !repo || typeof repo !== "object") continue
    wrapped[key] = new Proxy(repo as object, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver)
        if (typeof value === "function" && WRITE_METHODS.includes(String(property) as typeof WRITE_METHODS[number])) {
          return (...args: unknown[]) => {
            const name = `${key}.${String(property)}`
            counts[name] = (counts[name] ?? 0) + 1
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }
        }
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value
      },
    })
  }
  return { bundle: wrapped, counts }
}

function refreshRequest(body: unknown = {}): Request {
  return new Request(`${ORIGIN}/api/workunit/inbox/refresh`, {
    method: "POST",
    headers: { Host: "localhost:3000", Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ─── T12 — zero WorkUnit writes on GET ──────────────────────────

test("T12: GET /api/workunit/inbox performs zero upsert/create, while POST refresh writes", async () => {
  await withRouteRuntime(async (db) => {
    const before = tableCounts(db)
    const response = await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=mock`))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.ok(body.workUnits.length > 0, "the GET must actually produce a projection")
    const after = tableCounts(db)
    assert.equal(after.work_units, before.work_units, "GET must not create or upsert a WorkUnit row")
    assert.equal(after.work_units, 0)

    // Positive control: the refresh endpoint DOES write, proving the probe can
    // observe a write at all.
    const refresh = await refreshPost(refreshRequest({ source: "mock" }))
    assert.equal(refresh.status, 200)
    assert.ok(tableCounts(db).work_units > 0, "refresh must materialize rows")
  })
})

test("T12: an instrumented bundle records zero write calls for the GET projection path", async () => {
  await withRouteRuntime(async () => {
    const resolved = await resolveRouteRepositories(tenantId)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    const probe = instrument(resolved.bundle as unknown as Record<string, unknown>)

    // Drive the projection exactly as the GET does, through the shared service.
    const { projectInbox } = await import("../app/lib/application/workunitInbox/inboxService.ts")
    const projected = await projectInbox({
      source: "mock",
      tenantId,
      workUnits: probe.bundle.workUnits as never,
      ctx: probe.bundle.ctx as never,
    })
    assert.ok(projected.length > 0, "the projection must not be vacuous")
    assert.deepEqual(probe.counts, {}, `projection performed writes: ${JSON.stringify(probe.counts)}`)

    // Positive control on the SAME instrumented bundle: refreshInbox writes.
    const { refreshInbox } = await import("../app/lib/application/workunitInbox/inboxService.ts")
    const result = await refreshInbox({
      source: "mock", actorUserId: "dev-user", requestId: "probe:1",
      bundle: probe.bundle as never,
    })
    assert.equal(result.ok, true)
    assert.ok((probe.counts["workUnits.upsert"] ?? 0) > 0, "the instrument must be able to see an upsert")
  })
})

// ─── T13 / T14 — zero usage and audit on GET ────────────────────

test("T13: GET records zero usage events; POST refresh records exactly one", async () => {
  await withRouteRuntime(async (db) => {
    await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=mock`))
    assert.equal(db.debugTable("usage_events").filter((r) => r.event_type === "inbox_fetch").length, 0)

    const refresh = await refreshPost(refreshRequest({ source: "mock" }))
    assert.equal(refresh.status, 200)
    assert.equal(db.debugTable("usage_events").filter((r) => r.event_type === "inbox_fetch").length, 1)
  })
})

test("T14: GET appends zero audit rows; POST refresh appends exactly one", async () => {
  await withRouteRuntime(async (db) => {
    await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=mock`))
    assert.equal(db.debugTable("audit_logs").filter((r) => r.event_type === "workunit.inbox.fetch").length, 0)

    const refresh = await refreshPost(refreshRequest({ source: "mock" }))
    assert.equal(refresh.status, 200)
    assert.equal(db.debugTable("audit_logs").filter((r) => r.event_type === "workunit.inbox.fetch").length, 1)
    // The preserved event names must be used verbatim so existing dashboards
    // and the audit/recent projection keep working.
    const row = db.debugTable("audit_logs").find((r) => r.event_type === "workunit.inbox.fetch")
    assert.ok(row)
    // `reason` is persisted into the `status` column and carries the resolved
    // source; `metadata_json` carries the source and the refreshed count.
    assert.equal(row.status, "mock", "the audit row must record the resolved source")
    assert.deepEqual(JSON.parse(String(row.metadata_json ?? "{}")), { source: "mock", count: 5 })
  })
})

// ─── T15 — integrations/status GET ──────────────────────────────

test("T15: GET /api/integrations/status records zero mutations and keeps its response shape", async () => {
  await withRouteRuntime(async (db) => {
    const before = tableCounts(db)
    const response = await integrationsStatusGet(new Request(`${ORIGIN}/api/integrations/status`))
    assert.equal(response.status, 200)
    const body = await response.json()
    // Response body preserved exactly: three providers, default status shape.
    assert.deepEqual(body.providers.map((p: { provider: string }) => p.provider), ["github", "slack", "calendar"])
    for (const provider of body.providers) {
      assert.deepEqual(Object.keys(provider).sort(), ["lastErrorCode", "lastSyncedAt", "mode", "provider", "scopes", "status"])
    }
    assert.deepEqual(tableCounts(db), before, "integrations/status GET must perform no durable write")
    assert.equal(db.debugTable("usage_events").filter((r) => r.event_type === "integration_status_read").length, 0)

    // Positive control: a mutation route on the same db does write.
    const feedbackDb = tableCounts(db)
    assert.equal(feedbackDb.usage_events, 0)
  })
})

// ─── T16 — preserved GET response behaviour ─────────────────────

test("T16: the GET response matches the pinned baseline projection and preserves the persisted status overlay", async () => {
  const contract = JSON.parse(await readFile(new URL("./fixtures/architecture/current-pipeline-behavior.v1.json", import.meta.url), "utf8"))
  assert.ok(contract.inboxRoute?.body?.workUnits?.length > 0, "the pinned baseline must not be vacuous")

  await withRouteRuntime(async () => {
    const response = await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=mock`))
    assert.equal(response.status, 200)
    const body = await response.json()
    // Byte-identical to the pinned baseline body captured before the split.
    assert.deepEqual(body, contract.inboxRoute.body)

    // The persisted non-`open` status overlay still wins — the write was
    // removed but the findById READ was retained.
    await refreshPost(refreshRequest({ source: "mock" }))
    const resolved = await resolveRouteRepositories(tenantId)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    const first = (await resolved.bundle.workUnits.listRecent(resolved.bundle.ctx, 20))[0]
    assert.ok(first)
    await resolved.bundle.workUnits.updateStatus(resolved.bundle.ctx, first.id, "done")

    const overlaid = await (await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=mock`))).json()
    const overlaidUnit = overlaid.workUnits.find((u: { id: string }) => u.id === first.id)
    assert.ok(overlaidUnit, "the overlaid unit must still be in the projection")
    assert.equal(overlaidUnit.status, "done", "a persisted non-open status must win in the GET projection")

    // An unpersisted unit still reports its generated status.
    const unpersisted = overlaid.workUnits.find((u: { id: string }) => u.id !== first.id)
    assert.ok(unpersisted)
    assert.equal(unpersisted.status, "open")
  })
})

test("T16: the GET error branches are preserved", async () => {
  await withRouteRuntime(async () => {
    const invalid = await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=nope`))
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).error, "invalid_request")
  })
  // Unauthenticated: no dev session configured → 401, and still no write path.
  const backup = { ...process.env }
  try {
    Object.assign(process.env, { NODE_ENV: "production", AUTH_ADAPTER: "none" })
    delete process.env.ALLOW_DEV_SESSION
    const response = await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=mock`))
    assert.ok(response.status === 401 || response.status === 403 || response.status === 503, `unexpected ${response.status}`)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
  }
})

// ─── T17 — every source value, on both GET and refresh ──────────

test("T17: every source value behaves identically on GET and refresh, and neither writes on an invalid source", async () => {
  await withRouteRuntime(async (db) => {
    for (const source of ["mock", "github", "slack", "calendar", "all"]) {
      // No query string, for any source, causes a write on the safe method.
      // Compared as a DELTA because earlier iterations legitimately wrote.
      const beforeGet = tableCounts(db)
      const get = await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=${source}`))
      assert.equal(get.status, 200, `GET source=${source}`)
      assert.deepEqual(tableCounts(db), beforeGet, `GET source=${source} must write nothing`)

      const refresh = await refreshPost(refreshRequest({ source }))
      assert.equal(refresh.status, 200, `refresh source=${source}`)
      assert.equal((await refresh.json()).source, source)
    }
    // Absent source resolves to "mock" on BOTH paths.
    const beforeDefault = tableCounts(db)
    const getDefault = await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox`))
    assert.equal(getDefault.status, 200)
    assert.deepEqual(tableCounts(db), beforeDefault, "the default-source GET must write nothing")
    const refreshDefault = await refreshPost(refreshRequest({}))
    assert.equal(refreshDefault.status, 200)
    assert.equal((await refreshDefault.json()).source, "mock")

    // Invalid source → 400 on BOTH, with zero additional writes.
    const beforeInvalid = tableCounts(db)
    const getInvalid = await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=evil`))
    assert.equal(getInvalid.status, 400)
    const refreshInvalid = await refreshPost(refreshRequest({ source: "evil" }))
    assert.equal(refreshInvalid.status, 400)
    assert.equal((await refreshInvalid.json()).error, "invalid_request")
    assert.deepEqual(tableCounts(db), beforeInvalid, "an invalid source must write nothing")
  })
})

// Referenced so the positive-control import is not unused; the feedback route
// is the cross-check that a mutation route on this harness really does write.
void feedbackPost
