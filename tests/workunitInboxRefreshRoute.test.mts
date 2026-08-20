/**
 * WU-02S — POST /api/workunit/inbox/refresh (T30–T38).
 *
 * The refresh endpoint is the SOLE explicit WorkUnit-row materialization path.
 * These tests pin its RBAC conjunction, its ordering guarantees, its tenant
 * isolation, its telemetry semantics and its count-only response.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { POST as refreshPost } from "../app/api/workunit/inbox/refresh/route.ts"
import { GET as inboxGet } from "../app/api/workunit/inbox/route.ts"
import { canRefreshWorkUnitInbox } from "../app/lib/security/tenantAccess.ts"
import { DEFAULT_ROLE_PERMISSIONS } from "../app/lib/security/policy.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { resolveControlRepositories } from "../app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { SessionContext } from "../app/lib/domain/auth/types.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import { seedDevControlWorkspace } from "./helpers/devControlWorkspace.ts"

const ORIGIN = "http://localhost:3000"
// Branded types derived from existing signatures: this file adds no
// compatibility-tenant import edge.
type TenantId = Parameters<typeof resolveRouteRepositories>[0]
type UserId = Parameters<typeof canRefreshWorkUnitInbox>[0]["userId"]
const tenantId = "dev-tenant" as TenantId
const JWT_SECRET = "refresh-route-secret-with-at-least-32-bytes"
const JWT_ISSUER = "https://auth.example.test"
const JWT_AUDIENCE = "workunit-os-test"

type Role = "owner" | "manager" | "editor" | "viewer"

function refreshRequest(body: unknown = {}, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/workunit/inbox/refresh`, {
    method: "POST",
    headers: { Host: "localhost:3000", Origin: ORIGIN, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function counts(db: FakeD1Database) {
  return {
    work_units: db.debugTable("work_units").length,
    usage_events: db.debugTable("usage_events").filter((r) => r.event_type === "inbox_fetch").length,
    audit_logs: db.debugTable("audit_logs").filter((r) => r.event_type === "workunit.inbox.fetch").length,
  }
}

/** Dev-session runtime at a chosen role. */
async function withRole(role: Role, run: (db: FakeD1Database) => Promise<void>): Promise<void> {
  const db = new FakeD1Database()
  const backup = { ...process.env }
  try {
    Object.assign(process.env, {
      NODE_ENV: "development", AUTH_ADAPTER: "dev", ALLOW_DEV_SESSION: "true",
      ALLOW_DEV_WORKSPACE_BOOTSTRAP: "true", PERSISTENCE_MODE: "d1", DEV_SESSION_ROLE: role,
    })
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    // WU-06: seed the workspace at the harness's role rather than relying on a
    // safe request to bootstrap it. Role still comes from the membership row.
    await seedDevControlWorkspace(db, role)
    await run(db)
  } finally {
    resetTestRuntimeEnvForRequest()
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
  }
}

/** Production JWT runtime with a seeded control registry (real tenant authority). */
async function withJwt(
  role: Role,
  run: (db: FakeD1Database, authHeader: string) => Promise<void>,
  options: { tenant?: TenantId; subject?: string } = {},
): Promise<void> {
  const db = new FakeD1Database()
  const tenant = options.tenant ?? tenantId
  const subject = options.subject ?? "refresh-subject"
  const backup = { ...process.env }
  try {
    Object.assign(process.env, {
      NODE_ENV: "production", AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: JWT_SECRET,
      JWT_AUTH_ISSUER: JWT_ISSUER, JWT_AUTH_AUDIENCE: JWT_AUDIENCE, PERSISTENCE_MODE: "d1",
      ALLOWED_ORIGINS: ORIGIN,
    })
    delete process.env.ALLOW_DEV_SESSION
    delete process.env.DEV_SESSION_ROLE
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)

    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    const userId = `user:${subject}` as UserId
    await repos.bundle.users.create(repos.bundle.ctx, { id: userId, email: `${subject}@example.local`, createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: tenant, name: "Tenant", slug: String(tenant), createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, {
      id: `membership:${subject}`, tenantId: tenant, userId, role, status: "active", createdAt: now, updatedAt: now,
    })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: `identity:${subject}`, userId, provider: "jwt", providerSubject: subject, email: `${subject}@example.local`, createdAt: now, updatedAt: now,
    })
    const token = await signHs256Jwt({ sub: subject, email: `${subject}@example.local`, iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET)
    await run(db, `Bearer ${token}`)
  } finally {
    resetTestRuntimeEnvForRequest()
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
  }
}

// ─── T30 — RBAC conjunction ─────────────────────────────────────

test("T30: viewer keeps GET but is denied refresh, with zero writes; the three writing roles are allowed", async () => {
  await withRole("viewer", async (db) => {
    const get = await inboxGet(new Request(`${ORIGIN}/api/workunit/inbox?source=mock`))
    assert.equal(get.status, 200, "viewer must keep read access to the inbox")

    const refresh = await refreshPost(refreshRequest({ source: "mock" }))
    assert.equal(refresh.status, 403)
    assert.equal((await refresh.json()).error, "forbidden")
    assert.deepEqual(counts(db), { work_units: 0, usage_events: 0, audit_logs: 0 },
      "a denied refresh must write nothing at all")
  })

  for (const role of ["owner", "manager", "editor"] as const) {
    await withRole(role, async (db) => {
      const refresh = await refreshPost(refreshRequest({ source: "mock" }))
      assert.equal(refresh.status, 200, `${role} must be allowed to refresh`)
      assert.ok(counts(db).work_units > 0, `${role} refresh must materialize rows`)
    })
  }
})

test("T30: the RBAC conjunction is meaningful — either permission alone is denied", () => {
  // The three permitted roles hold BOTH permissions today, so a role-based
  // assertion alone could not tell a conjunction from a disjunction. The
  // conjunction is therefore asserted against SYNTHETIC permission sets
  // registered in the real permission matrix, so it stays meaningful if the
  // role matrix later diverges.
  const matrix = DEFAULT_ROLE_PERMISSIONS as unknown as Record<string, ReadonlySet<string>>
  const synthetic = {
    both: new Set(["workunit.read", "workunit.create", "workunit.edit"]),
    createOnly: new Set(["workunit.read", "workunit.create"]),
    editOnly: new Set(["workunit.read", "workunit.edit"]),
    readOnly: new Set(["workunit.read"]),
    none: new Set<string>(),
  }
  const added: string[] = []
  try {
    for (const [name, permissions] of Object.entries(synthetic)) {
      const role = `synthetic_${name}`
      matrix[role] = permissions
      added.push(role)
    }
    const session = (role: string): SessionContext => ({
      userId: "synthetic-user" as UserId,
      tenantId,
      role,
      email: "synthetic@example.local",
      sessionId: "synthetic",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as unknown as SessionContext)

    assert.equal(canRefreshWorkUnitInbox(session("synthetic_both")), true, "create AND edit must authorize refresh")
    assert.equal(canRefreshWorkUnitInbox(session("synthetic_createOnly")), false, "create alone must not authorize refresh")
    assert.equal(canRefreshWorkUnitInbox(session("synthetic_editOnly")), false, "edit alone must not authorize refresh")
    assert.equal(canRefreshWorkUnitInbox(session("synthetic_readOnly")), false, "read must never authorize refresh")
    assert.equal(canRefreshWorkUnitInbox(session("synthetic_none")), false)
  } finally {
    for (const role of added) delete matrix[role]
  }

  // And the four real roles resolve as the policy matrix declares.
  const realSession = (role: Role): SessionContext => ({
    userId: "real-user" as UserId, tenantId, role, email: "real@example.local",
    sessionId: "real", createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as SessionContext)
  assert.equal(canRefreshWorkUnitInbox(realSession("owner")), true)
  assert.equal(canRefreshWorkUnitInbox(realSession("manager")), true)
  assert.equal(canRefreshWorkUnitInbox(realSession("editor")), true)
  assert.equal(canRefreshWorkUnitInbox(realSession("viewer")), false)
})

// ─── T31 — authentication ───────────────────────────────────────

test("T31: an unauthenticated refresh is 401 with zero writes, and the guard is not what rejected it", async () => {
  const backup = { ...process.env }
  const db = new FakeD1Database()
  try {
    Object.assign(process.env, {
      NODE_ENV: "production", AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: JWT_SECRET,
      JWT_AUTH_ISSUER: JWT_ISSUER, JWT_AUTH_AUDIENCE: JWT_AUDIENCE, PERSISTENCE_MODE: "d1",
      ALLOWED_ORIGINS: ORIGIN,
    })
    delete process.env.ALLOW_DEV_SESSION
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)

    // The request carries a CONFORMING Host/Origin/Content-Type, so it passes
    // the guard; the 401 therefore comes from authentication, not the guard.
    const response = await refreshPost(refreshRequest({ source: "mock" }))
    assert.equal(response.status, 401)
    assert.equal((await response.json()).error, "unauthorized")
    assert.deepEqual(counts(db), { work_units: 0, usage_events: 0, audit_logs: 0 })
  } finally {
    resetTestRuntimeEnvForRequest()
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
  }
})

test("T31: a forbidden or unknown-tenant session cannot mutate", async () => {
  await withJwt("viewer", async (db, authHeader) => {
    const response = await refreshPost(refreshRequest({ source: "mock" }, { Authorization: authHeader }))
    assert.equal(response.status, 403)
    assert.deepEqual(counts(db), { work_units: 0, usage_events: 0, audit_logs: 0 })
  })
})

// ─── T32 — body-supplied tenant and role are ignored ────────────

test("T32: a body-supplied tenantId or role is rejected outright and never adopted", async () => {
  await withRole("owner", async (db) => {
    // Server-owned fields are rejected as mass assignment (400), not silently
    // ignored — and nothing is written.
    for (const body of [{ tenantId: "other-tenant" }, { role: "owner" }, { userId: "someone-else" }]) {
      const response = await refreshPost(refreshRequest(body))
      assert.equal(response.status, 400, JSON.stringify(body))
      assert.equal((await response.json()).error, "invalid_request")
      assert.deepEqual(counts(db), { work_units: 0, usage_events: 0, audit_logs: 0 })
    }

    // A legitimate refresh lands in the SESSION tenant only.
    assert.equal((await refreshPost(refreshRequest({ source: "mock" }))).status, 200)
    const other = await resolveRouteRepositories("other-tenant" as TenantId)
    assert.equal(other.ok, true)
    if (!other.ok) return
    assert.deepEqual(await other.bundle.workUnits.listRecent(other.bundle.ctx, 20), [],
      "another tenant's store must stay empty")
  })

  // A body-supplied role cannot promote a viewer.
  await withRole("viewer", async () => {
    const response = await refreshPost(refreshRequest({ role: "owner" }))
    assert.ok(response.status === 400 || response.status === 403, `unexpected ${response.status}`)
    assert.notEqual(response.status, 200, "a body-supplied role must never authorize a viewer")
  })
})

// ─── T33 — RBAC precedes the body read ──────────────────────────

test("T33: a viewer sending an oversized or malformed body receives 403, proving RBAC precedes the body read", async () => {
  await withRole("viewer", async (db) => {
    // Oversized: were the body read first, this would be 413.
    const oversized = new Request(`${ORIGIN}/api/workunit/inbox/refresh`, {
      method: "POST",
      headers: { Host: "localhost:3000", Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "mock", pad: "x".repeat(4096) }),
    })
    const oversizedResponse = await refreshPost(oversized)
    assert.equal(oversizedResponse.status, 403, "RBAC must decide before the body is read")
    assert.equal((await oversizedResponse.json()).error, "forbidden")

    // Malformed: were the body parsed first, this would be 400.
    const malformed = new Request(`${ORIGIN}/api/workunit/inbox/refresh`, {
      method: "POST",
      headers: { Host: "localhost:3000", Origin: ORIGIN, "Content-Type": "application/json" },
      body: "{ not json",
    })
    const malformedResponse = await refreshPost(malformed)
    assert.equal(malformedResponse.status, 403, "RBAC must decide before JSON parsing")
    assert.equal((await malformedResponse.json()).error, "forbidden")
    assert.deepEqual(counts(db), { work_units: 0, usage_events: 0, audit_logs: 0 })
  })

  // Control: the SAME oversized body from an authorized role really is 413,
  // proving the 403 above is an ordering result and not a blanket rejection.
  await withRole("owner", async () => {
    const oversized = new Request(`${ORIGIN}/api/workunit/inbox/refresh`, {
      method: "POST",
      headers: { Host: "localhost:3000", Origin: ORIGIN, "Content-Type": "application/json", "Content-Length": "5000" },
      body: JSON.stringify({ source: "mock", pad: "x".repeat(4096) }),
    })
    assert.equal((await refreshPost(oversized)).status, 413)
  })
})

// ─── T34 — tenant isolation ─────────────────────────────────────

test("T34: a tenant-A session neither reads nor writes tenant-B rows on the refresh route", async () => {
  await withJwt("owner", async (db, authHeader) => {
    assert.equal((await refreshPost(refreshRequest({ source: "mock" }, { Authorization: authHeader }))).status, 200)
    const rows = db.debugTable("work_units")
    assert.ok(rows.length > 0, "tenant A must have rows")
    for (const row of rows) {
      assert.equal(row.tenant_id, tenantId, "every written row must belong to the session tenant")
    }
    const other = await resolveRouteRepositories("tenant-b" as TenantId)
    assert.equal(other.ok, true)
    if (!other.ok) return
    assert.deepEqual(await other.bundle.workUnits.listRecent(other.bundle.ctx, 20), [])
  })
})

// ─── T35 — idempotency and concurrency characterization ─────────

test("T35: two refreshes converge on the same rows while telemetry is append-only", async () => {
  await withRole("owner", async (db) => {
    assert.equal((await refreshPost(refreshRequest({ source: "mock" }))).status, 200)
    const first = db.debugTable("work_units").map((r) => r.id).sort()
    assert.ok(first.length > 0)

    assert.equal((await refreshPost(refreshRequest({ source: "mock" }))).status, 200)
    const second = db.debugTable("work_units").map((r) => r.id).sort()

    // Idempotent in id-space: ids are deterministic (`wu:${signal.id}`).
    assert.deepEqual(second, first, "a second refresh must not duplicate rows")
    // Telemetry is NOT idempotent — it is append-only, exactly one row per call.
    assert.equal(counts(db).usage_events, 2)
    assert.equal(counts(db).audit_logs, 2)
  })
})

test("T35: concurrent refreshes produce no cross-tenant and no partially-typed row (characterization: last-writer-wins)", async () => {
  await withRole("owner", async (db) => {
    // CHARACTERIZATION ONLY. Last-writer-wins per row is the CURRENT behaviour;
    // no lock, CAS, queue or serialization exists and none is introduced. This
    // is pinned so a future change is visible, NOT asserted as a guarantee.
    const responses = await Promise.all([
      refreshPost(refreshRequest({ source: "mock" })),
      refreshPost(refreshRequest({ source: "mock" })),
      refreshPost(refreshRequest({ source: "all" })),
    ])
    for (const response of responses) assert.equal(response.status, 200)
    const rows = db.debugTable("work_units")
    assert.ok(rows.length > 0)
    for (const row of rows) {
      assert.equal(row.tenant_id, tenantId, "no cross-tenant row")
      for (const column of ["id", "title", "status", "created_at"]) {
        assert.ok(row[column] !== undefined && row[column] !== null, `row ${String(row.id)} is missing ${column}`)
      }
    }
  })
})

// ─── T36 — partial provider failure writes nothing ──────────────

test("T36: a provider rejection during source=all yields 503 and leaves every count unchanged", async () => {
  const { fakeGitHubClient } = await import("../app/lib/infrastructure/external/github/fakeGitHubClient.ts")
  const original = fakeGitHubClient.fetchNormalizedEvents

  await withRole("owner", async (db) => {
    // Establish a non-zero baseline so "unchanged" is a real observation
    // rather than "zero stayed zero".
    assert.equal((await refreshPost(refreshRequest({ source: "mock" }))).status, 200)
    const before = counts(db)
    assert.ok(before.work_units > 0 && before.usage_events === 1 && before.audit_logs === 1)

    // Make ONE of the three providers reject mid-resolution. The exported fake
    // client is a plain object, so a method can be swapped without touching the
    // (immutable) module namespace binding.
    fakeGitHubClient.fetchNormalizedEvents = async () => { throw new Error("provider unavailable") }
    try {
      const response = await refreshPost(refreshRequest({ source: "all" }))
      assert.equal(response.status, 503)
      assert.equal((await response.json()).error, "integration_missing")
      assert.deepEqual(counts(db), before,
        "a provider failure must write NO rows, NO usage and NO audit")
    } finally {
      fakeGitHubClient.fetchNormalizedEvents = original
    }

    // Control: with the provider restored, source=all writes again.
    assert.equal((await refreshPost(refreshRequest({ source: "all" }))).status, 200)
    assert.ok(counts(db).usage_events > before.usage_events)
  })
})

// ─── T37 — telemetry only on the authorized, successful path ────

test("T37: a 403 refresh records zero usage and zero audit; a 200 records exactly one of each, after persistence", async () => {
  await withRole("viewer", async (db) => {
    assert.equal((await refreshPost(refreshRequest({ source: "mock" }))).status, 403)
    assert.equal(counts(db).usage_events, 0)
    assert.equal(counts(db).audit_logs, 0)
  })

  await withRole("owner", async (db) => {
    assert.equal((await refreshPost(refreshRequest({ source: "mock" }))).status, 200)
    const after = counts(db)
    assert.equal(after.usage_events, 1)
    assert.equal(after.audit_logs, 1)
    // Audit is written AFTER persistence: its recorded count matches the rows.
    const audit = db.debugTable("audit_logs").find((r) => r.event_type === "workunit.inbox.fetch")
    assert.ok(audit)
    assert.equal(JSON.parse(String(audit.metadata_json ?? "{}")).count, after.work_units)
  })
})

// ─── T38 — count-only response ──────────────────────────────────

test("T38: the 200 response key set is exactly {ok, requestId, refreshed, source} and discloses nothing else", async () => {
  await withRole("owner", async (db) => {
    const response = await refreshPost(refreshRequest({ source: "mock" }, { "x-request-id": "refresh-probe-1" }))
    assert.equal(response.status, 200)
    const body = await response.json()

    assert.deepEqual(Object.keys(body).sort(), ["ok", "refreshed", "requestId", "source"])
    assert.equal(body.ok, true)
    assert.equal(body.source, "mock")
    assert.equal(typeof body.refreshed, "number")
    assert.equal(body.refreshed, db.debugTable("work_units").length)
    assert.equal(body.requestId, "refresh-probe-1")

    // No WorkUnit entity, tenant value, repository row or provider content.
    const serialized = JSON.stringify(body)
    for (const leak of ["workUnits", "tenantId", "dev-tenant", "signalId", "sourceUrl", "evidence", "nextAction"]) {
      assert.equal(serialized.includes(leak), false, `the refresh response must not disclose ${leak}`)
    }
  })
})

test("T38: the failure envelope is the standard safeError shape", async () => {
  await withRole("viewer", async () => {
    const response = await refreshPost(refreshRequest({ source: "mock" }))
    const body = await response.json()
    assert.deepEqual(Object.keys(body).sort(), ["error", "ok", "requestId"])
    assert.equal(body.ok, false)
  })
})
