import test from "node:test"
import assert from "node:assert/strict"
import { GET as inboxGet } from "../app/api/workunit/inbox/route.ts"
import { POST as inboxRefreshPost } from "../app/api/workunit/inbox/refresh/route.ts"
import { POST as feedbackPost } from "../app/api/workunit/[id]/feedback/route.ts"
import { GET as integrationsStatusGet } from "../app/api/integrations/status/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { resolveControlRepositories } from "../app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"
import type { UserId } from "../app/lib/tenant/types.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"

const tenantId = "dev-tenant" as TenantId
const JWT_SECRET = "test-jwt-secret-with-at-least-32-bytes"
const JWT_ISSUER = "https://auth.example.test"
const JWT_AUDIENCE = "workunit-os-test"

async function withRoutePersistence(testFn: (db: FakeD1Database) => Promise<void>) {
  const db = new FakeD1Database()
  const envBackup = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_DEV_SESSION: process.env.ALLOW_DEV_SESSION,
    ALLOW_DEV_WORKSPACE_BOOTSTRAP: process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP,
    AUTH_ADAPTER: process.env.AUTH_ADAPTER,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
  }

  try {
    process.env.NODE_ENV = "development"
    process.env.AUTH_ADAPTER = "dev"
    process.env.ALLOW_DEV_SESSION = "true"
    process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"
    delete process.env.DEV_SESSION_ROLE
    process.env.PERSISTENCE_MODE = "d1"
    setTestRuntimeEnvForRequest({
      CONTROL_DB: db,
      TENANT_DB_DEFAULT: db,
    } as AppEnv)
    await testFn(db)
  } finally {
    restoreEnv(envBackup)
    delete process.env.DEV_SESSION_ROLE
    resetTestRuntimeEnvForRequest()
  }
}

async function withJwtRoutePersistence(
  role: "owner" | "manager" | "editor" | "viewer",
  testFn: (db: FakeD1Database, authHeader: string) => Promise<void>,
) {
  const db = new FakeD1Database()
  const envBackup = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_ADAPTER: process.env.AUTH_ADAPTER,
    JWT_AUTH_SECRET: process.env.JWT_AUTH_SECRET,
    JWT_AUTH_ISSUER: process.env.JWT_AUTH_ISSUER,
    JWT_AUTH_AUDIENCE: process.env.JWT_AUTH_AUDIENCE,
    ALLOW_DEV_SESSION: process.env.ALLOW_DEV_SESSION,
    ALLOW_DEV_WORKSPACE_BOOTSTRAP: process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP,
    DEV_SESSION_ROLE: process.env.DEV_SESSION_ROLE,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
  }

  try {
    process.env.NODE_ENV = "production"
    process.env.AUTH_ADAPTER = "jwt"
    process.env.JWT_AUTH_SECRET = JWT_SECRET
    process.env.JWT_AUTH_ISSUER = JWT_ISSUER
    process.env.JWT_AUTH_AUDIENCE = JWT_AUDIENCE
    delete process.env.ALLOW_DEV_SESSION
    delete process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP
    delete process.env.DEV_SESSION_ROLE
    process.env.PERSISTENCE_MODE = "d1"
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)

    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "jwt-route-user" as UserId, email: "jwt-route@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: tenantId, name: "Dev Tenant", slug: "dev-tenant", createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, {
      id: `membership:${role}`, tenantId, userId: "jwt-route-user" as UserId, role, status: "active", createdAt: now, updatedAt: now,
    })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity:jwt-route", userId: "jwt-route-user" as UserId, provider: "jwt", providerSubject: "jwt-route-subject", email: "jwt-route@example.local", createdAt: now, updatedAt: now,
    })
    const token = await signHs256Jwt({ sub: "jwt-route-subject", email: "jwt-route@example.local", tenantId: "evil-tenant", role: "owner", iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET)
    await testFn(db, `Bearer ${token}`)
  } finally {
    restoreEnv(envBackup)
    resetTestRuntimeEnvForRequest()
  }
}

function refreshRequest(source = "mock", headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/workunit/inbox/refresh", {
    method: "POST",
    headers: { Host: "localhost:3000", "Content-Type": "application/json", Origin: "http://localhost:3000", ...headers },
    body: JSON.stringify({ source }),
  })
}

function restoreEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test("inbox GET projects without writing; POST refresh persists, dedupes, records usage, and appends audit", async () => {
  await withRoutePersistence(async (db) => {
    const repoResult = await resolveRouteRepositories(tenantId)
    assert.equal(repoResult.ok, true)
    if (!repoResult.ok) return

    // WU-02S: the GET is projection-only. It returns the full projection and
    // writes nothing — no rows, no usage, no audit (INV-SAFE-1).
    const getResponse = await inboxGet(new Request("http://localhost:3000/api/workunit/inbox?source=mock"))
    assert.equal(getResponse.status, 200)
    assert.equal((await getResponse.json()).workUnits.length, 5)
    assert.equal((await repoResult.bundle.workUnits.listRecent(repoResult.bundle.ctx, 20)).length, 0)
    assert.equal(db.debugTable("usage_events").length, 0)
    assert.equal(db.debugTable("audit_logs").length, 0)

    // The refresh endpoint is the sole materialization path.
    const first = await inboxRefreshPost(refreshRequest())
    assert.equal(first.status, 200)
    assert.deepEqual(Object.keys(await first.json()).sort(), ["ok", "refreshed", "requestId", "source"])

    const firstRows = await repoResult.bundle.workUnits.listRecent(repoResult.bundle.ctx, 20)
    assert.equal(firstRows.length, 5)
    const persistedGitHub = firstRows.find((row) => row.repository === "acme/api" && row.sourceProvider === "github")
    assert.ok(persistedGitHub)
    assert.equal(persistedGitHub?.status, "open")
    assert.ok(persistedGitHub?.sourceUrl)

    // Deterministic ids → a second refresh converges rather than duplicating.
    assert.equal((await inboxRefreshPost(refreshRequest())).status, 200)
    assert.equal((await repoResult.bundle.workUnits.listRecent(repoResult.bundle.ctx, 20)).length, 5)

    // Telemetry is append-only: exactly one row per refresh, names preserved.
    const usageCount = await repoResult.bundle.usage.getCurrentUsage(repoResult.bundle.ctx, tenantId, "inbox_fetch")
    assert.equal(usageCount, 2)

    const auditRows = await repoResult.bundle.auditLogs.listRecent(repoResult.bundle.ctx, 10)
    const auditRow = auditRows.find((row) => row.eventKind === "workunit.inbox.fetch")
    assert.ok(auditRow)
    assert.deepEqual(JSON.parse(auditRow?.metadata ?? "{}"), { source: "mock", count: 5 })

    const usageRows = db.debugTable("usage_events")
    assert.equal(usageRows.filter((row) => row.event_type === "inbox_fetch").length, 2)
    assert.equal(JSON.stringify(usageRows).includes("token"), false)
    assert.equal(JSON.stringify(usageRows).includes("secret"), false)

    const otherTenantResult = await resolveRouteRepositories("other-tenant" as TenantId)
    assert.equal(otherTenantResult.ok, true)
    if (!otherTenantResult.ok) return
    assert.equal((await otherTenantResult.bundle.workUnits.listRecent(otherTenantResult.bundle.ctx, 20)).length, 0)
  })
})

test("feedback route records feedback usage, updates status for later, and appends audit", async () => {
  await withRoutePersistence(async (db) => {
    const repoResult = await resolveRouteRepositories(tenantId)
    assert.equal(repoResult.ok, true)
    if (!repoResult.ok) return

    const now = new Date().toISOString()
    await repoResult.bundle.workUnits.upsert(repoResult.bundle.ctx, {
      id: "wu-feedback",
      tenantId,
      sourceSignalId: "signal:feedback",
      title: "Feedback target",
      kind: "deadline",
      priority: "medium",
      sourceProvider: "calendar",
      reason: "Needs follow-up",
      evidence: "Quarterly review due",
      nextAction: "Reply later",
      status: "open",
      createdAt: now,
      updatedAt: now,
    })

    const response = await feedbackPost(
      new Request("http://localhost:3000/api/workunit/wu-feedback/feedback", {
        method: "POST",
        headers: { Host: "localhost:3000", "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ feedback: "later" }),
      }),
      { params: Promise.resolve({ id: "wu-feedback" }) },
    )

    assert.equal(response.status, 200)
    const updated = await repoResult.bundle.workUnits.findById(repoResult.bundle.ctx, "wu-feedback")
    assert.equal(updated?.status, "later")

    const feedbackRows = await repoResult.bundle.workUnitFeedback.findByWorkUnitId(repoResult.bundle.ctx, "wu-feedback")
    assert.equal(feedbackRows.length, 1)
    assert.equal(feedbackRows[0].feedback, "later")

    const usageCount = await repoResult.bundle.usage.getCurrentUsage(repoResult.bundle.ctx, tenantId, "feedback_create")
    assert.equal(usageCount, 1)

    const usageRows = db.debugTable("usage_events")
    const usageRow = usageRows.find((row) => row.event_type === "feedback_create")
    assert.ok(usageRow)
    assert.deepEqual(JSON.parse(String(usageRow?.metadata_json ?? "{}")), { feedback: "later" })
    assert.equal(JSON.stringify(usageRow).includes("token"), false)
    assert.equal(JSON.stringify(usageRow).includes("secret"), false)

    const auditRows = await repoResult.bundle.auditLogs.findByWorkUnitId(repoResult.bundle.ctx, "wu-feedback")
    assert.ok(auditRows.some((row) => row.eventKind === "workunit.feedback.create"))
  })
})

test("integration status route performs no usage write and returns persisted provider state", async () => {
  await withRoutePersistence(async (db) => {
    const repoResult = await resolveRouteRepositories(tenantId)
    assert.equal(repoResult.ok, true)
    if (!repoResult.ok) return

    const now = new Date().toISOString()
    await repoResult.bundle.integrationConnections.upsert(repoResult.bundle.ctx, {
      id: "conn-github",
      tenantId,
      provider: "github",
      status: "connected",
      mode: "real",
      scopesJson: JSON.stringify(["repo:read"]),
      createdAt: now,
      updatedAt: now,
    })

    const response = await integrationsStatusGet(new Request("http://localhost/api/integrations/status"))
    assert.equal(response.status, 200)
    const body = await response.json()
    const githubStatus = body.providers.find((provider: { provider: string }) => provider.provider === "github")
    assert.equal(githubStatus.status, "connected")

    // WU-02S / INV-SAFE-1: the pure read-metering usage write was deleted with
    // no replacement. The response above is unchanged; only the invisible write
    // disappeared.
    const usageCount = await repoResult.bundle.usage.getCurrentUsage(repoResult.bundle.ctx, tenantId, "integration_status_read")
    assert.equal(usageCount, 0)
    assert.equal(db.debugTable("usage_events").filter((row) => row.event_type === "integration_status_read").length, 0)
  })
})

test("inbox refresh ignores a client tenant override and persists only to the session tenant", async () => {
  await withRoutePersistence(async () => {
    // The GET query string can never cause a write at all…
    assert.equal((await inboxGet(new Request("http://localhost:3000/api/workunit/inbox?source=mock&tenantId=other-tenant"))).status, 200)
    // …and the refresh endpoint derives its tenant solely from the session.
    const response = await inboxRefreshPost(refreshRequest())
    assert.equal(response.status, 200)

    const ownTenant = await resolveRouteRepositories(tenantId)
    assert.equal(ownTenant.ok, true)
    if (!ownTenant.ok) return

    const otherTenant = await resolveRouteRepositories("other-tenant" as TenantId)
    assert.equal(otherTenant.ok, true)
    if (!otherTenant.ok) return

    const ownRows = await ownTenant.bundle.workUnits.listRecent(ownTenant.bundle.ctx, 20)
    const otherRows = await otherTenant.bundle.workUnits.listRecent(otherTenant.bundle.ctx, 20)
    assert.ok(ownRows.length > 0)
    assert.equal(otherRows.length, 0)
  })
})

test("feedback route ignores client actor and tenant overrides", async () => {
  await withRoutePersistence(async () => {
    const repoResult = await resolveRouteRepositories(tenantId)
    assert.equal(repoResult.ok, true)
    if (!repoResult.ok) return

    const now = new Date().toISOString()
    await repoResult.bundle.workUnits.upsert(repoResult.bundle.ctx, {
      id: "wu-feedback-override",
      tenantId,
      sourceSignalId: "signal:feedback-override",
      title: "Override target",
      kind: "deadline",
      priority: "medium",
      sourceProvider: "calendar",
      reason: "Needs follow-up",
      evidence: "Quarterly review due",
      nextAction: "Reply later",
      status: "open",
      createdAt: now,
      updatedAt: now,
    })

    const response = await feedbackPost(
      new Request("http://localhost:3000/api/workunit/wu-feedback-override/feedback", {
        method: "POST",
        headers: { Host: "localhost:3000", "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({
          feedback: "useful",
          actorUserId: "evil-user",
          tenantId: "evil-tenant",
        }),
      }),
      { params: Promise.resolve({ id: "wu-feedback-override" }) },
    )

    assert.equal(response.status, 200)

    const feedbackRows = await repoResult.bundle.workUnitFeedback.findByWorkUnitId(repoResult.bundle.ctx, "wu-feedback-override")
    assert.equal(feedbackRows.length, 1)
    assert.equal(feedbackRows[0].tenantId, tenantId)
    assert.equal(feedbackRows[0].actorUserId, "dev-user")
  })
})

test("feedback route rejects viewer role even in explicit dev session", async () => {
  await withRoutePersistence(async () => {
    process.env.DEV_SESSION_ROLE = "viewer"
    const response = await feedbackPost(
      new Request("http://localhost:3000/api/workunit/wu-viewer/feedback", {
        method: "POST",
        headers: { Host: "localhost:3000", "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ feedback: "useful" }),
      }),
      { params: Promise.resolve({ id: "wu-viewer" }) },
    )
    assert.equal(response.status, 403)
  })
})

test("integration status route allows viewer role in explicit dev session", async () => {
  await withRoutePersistence(async () => {
    process.env.DEV_SESSION_ROLE = "viewer"
    const response = await integrationsStatusGet(new Request("http://localhost/api/integrations/status"))
    assert.equal(response.status, 200)
  })
})

test("inbox route works with jwt auth and seeded membership", async () => {
  await withJwtRoutePersistence("viewer", async (_db, authHeader) => {
    // A viewer keeps read access to the projection. The GET writes nothing, so
    // the tenant-isolation assertions below hold on an empty store — which is
    // itself the INV-SAFE-1 guarantee for this path.
    const response = await inboxGet(new Request("http://localhost:3000/api/workunit/inbox?source=mock", { headers: { Authorization: authHeader } }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.workUnits.length, 5)

    const ownTenant = await resolveRouteRepositories(tenantId)
    assert.equal(ownTenant.ok, true)
    if (!ownTenant.ok) return
    const otherTenant = await resolveRouteRepositories("evil-tenant" as TenantId)
    assert.equal(otherTenant.ok, true)
    if (!otherTenant.ok) return
    // The forged `tenantId: "evil-tenant"` JWT claim is ignored: the session
    // resolves to the seeded membership tenant, so the projection contains
    // dev-tenant's five mock signals and not the claimed tenant's.
    assert.equal(body.workUnits.every((unit: { tenantId: string }) => unit.tenantId === tenantId), true)
    // And post-WU-02S the GET writes nothing, so BOTH stores stay empty — which
    // is strictly stronger than the previous "own tenant has 5 rows" assertion.
    assert.equal((await ownTenant.bundle.workUnits.listRecent(ownTenant.bundle.ctx, 20)).length, 0)
    assert.equal((await otherTenant.bundle.workUnits.listRecent(otherTenant.bundle.ctx, 20)).length, 0)
  })
})

test("feedback route works with jwt auth and sufficient role, but viewer is rejected", async () => {
  await withJwtRoutePersistence("editor", async (_db, authHeader) => {
    const repoResult = await resolveRouteRepositories(tenantId)
    assert.equal(repoResult.ok, true)
    if (!repoResult.ok) return
    const now = new Date().toISOString()
    await repoResult.bundle.workUnits.upsert(repoResult.bundle.ctx, {
      id: "wu-jwt-feedback", tenantId, sourceSignalId: "signal:jwt-feedback", title: "JWT Feedback", kind: "deadline", priority: "medium",
      sourceProvider: "calendar", reason: "Needs follow-up", evidence: "Quarterly review due", nextAction: "Reply later", status: "open", createdAt: now, updatedAt: now,
    })
    const response = await feedbackPost(new Request("http://localhost:3000/api/workunit/wu-jwt-feedback/feedback", {
      method: "POST", headers: { Host: "localhost:3000", "Content-Type": "application/json", Origin: "http://localhost:3000", Authorization: authHeader }, body: JSON.stringify({ feedback: "useful", actorUserId: "evil-user", tenantId: "evil-tenant" }),
    }), { params: Promise.resolve({ id: "wu-jwt-feedback" }) })
    assert.equal(response.status, 200)
    const feedbackRows = await repoResult.bundle.workUnitFeedback.findByWorkUnitId(repoResult.bundle.ctx, "wu-jwt-feedback")
    assert.equal(feedbackRows[0]?.actorUserId, "jwt-route-user")
    assert.equal(feedbackRows[0]?.tenantId, tenantId)
  })
  await withJwtRoutePersistence("viewer", async (_db, authHeader) => {
    const response = await feedbackPost(new Request("http://localhost:3000/api/workunit/wu-jwt-feedback-viewer/feedback", {
      method: "POST", headers: { Host: "localhost:3000", "Content-Type": "application/json", Origin: "http://localhost:3000", Authorization: authHeader }, body: JSON.stringify({ feedback: "useful" }),
    }), { params: Promise.resolve({ id: "wu-jwt-feedback-viewer" }) })
    assert.equal(response.status, 403)
  })
})

test("integration status route works with jwt auth for allowed roles", async () => {
  await withJwtRoutePersistence("manager", async (_db, authHeader) => {
    const repoResult = await resolveRouteRepositories(tenantId)
    assert.equal(repoResult.ok, true)
    if (!repoResult.ok) return
    const now = new Date().toISOString()
    await repoResult.bundle.integrationConnections.upsert(repoResult.bundle.ctx, {
      id: "conn-jwt-github", tenantId, provider: "github", status: "connected", mode: "real", scopesJson: JSON.stringify(["repo:read"]), createdAt: now, updatedAt: now,
    })
    const response = await integrationsStatusGet(new Request("http://localhost/api/integrations/status", { headers: { Authorization: authHeader } }))
    assert.equal(response.status, 200)
  })
})

test("production-like mode rejects anonymous inbox access by default", async () => {
  const envBackup = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_DEV_SESSION: process.env.ALLOW_DEV_SESSION,
  }

  try {
    process.env.NODE_ENV = "production"
    delete process.env.ALLOW_DEV_SESSION
    const response = await inboxGet(new Request("http://localhost:3000/api/workunit/inbox?source=mock"))
    assert.equal(response.status, 401)
  } finally {
    process.env.NODE_ENV = envBackup.NODE_ENV
    process.env.ALLOW_DEV_SESSION = envBackup.ALLOW_DEV_SESSION
  }
})

test("inbox route works with AUTH_ADAPTER=jwt and seeded membership", async () => {
  await withJwtRoutePersistence("viewer", async (_db, authHeader) => {
    const response = await inboxGet(new Request("http://localhost:3000/api/workunit/inbox?source=mock", {
      headers: { Authorization: authHeader },
    }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.workUnits.length, 5)
  })
})

test("feedback route works with jwt identity and editor role, but viewer cannot mutate", async () => {
  await withJwtRoutePersistence("editor", async (_db, authHeader) => {
    const repoResult = await resolveRouteRepositories(tenantId)
    assert.equal(repoResult.ok, true)
    if (!repoResult.ok) return
    const now = new Date().toISOString()
    await repoResult.bundle.workUnits.upsert(repoResult.bundle.ctx, {
      id: "wu-jwt-feedback",
      tenantId,
      sourceSignalId: "signal:jwt-feedback",
      title: "JWT Feedback",
      kind: "deadline",
      priority: "medium",
      sourceProvider: "calendar",
      reason: "Needs follow-up",
      evidence: "Quarterly review due",
      nextAction: "Reply later",
      status: "open",
      createdAt: now,
      updatedAt: now,
    })
    const response = await feedbackPost(new Request("http://localhost:3000/api/workunit/wu-jwt-feedback/feedback", {
      method: "POST",
      headers: { Host: "localhost:3000", "Content-Type": "application/json", Origin: "http://localhost:3000", Authorization: authHeader },
      body: JSON.stringify({ feedback: "useful" }),
    }), { params: Promise.resolve({ id: "wu-jwt-feedback" }) })
    assert.equal(response.status, 200)
  })

  await withJwtRoutePersistence("viewer", async (_db, authHeader) => {
    const response = await feedbackPost(new Request("http://localhost:3000/api/workunit/wu-jwt-viewer/feedback", {
      method: "POST",
      headers: { Host: "localhost:3000", "Content-Type": "application/json", Origin: "http://localhost:3000", Authorization: authHeader },
      body: JSON.stringify({ feedback: "useful" }),
    }), { params: Promise.resolve({ id: "wu-jwt-viewer" }) })
    assert.equal(response.status, 403)
  })
})

test("integration status works with jwt identity and allowed role", async () => {
  await withJwtRoutePersistence("viewer", async (_db, authHeader) => {
    const response = await integrationsStatusGet(new Request("http://localhost/api/integrations/status", {
      headers: { Authorization: authHeader },
    }))
    assert.equal(response.status, 200)
  })
})
