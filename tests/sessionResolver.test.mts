import test from "node:test"
import assert from "node:assert/strict"
// After WS1-PR2 the pure resolver is injected; this suite exercises the full
// composition path through the route-facing facade (requireSession →
// composeRequestServices → control session-authority adapter → pure resolver).
import { requireSession as resolveSession } from "../app/lib/security/session.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { resolveControlRepositories } from "../app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"

const JWT_SECRET = "test-jwt-secret-with-at-least-32-bytes"
const JWT_ISSUER = "https://auth.example.test"
const JWT_AUDIENCE = "workunit-os-test"

async function withAuthEnv(fn: (db: FakeD1Database) => Promise<void>) {
  const db = new FakeD1Database()
  const backup = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_ADAPTER: process.env.AUTH_ADAPTER,
    ALLOW_DEV_SESSION: process.env.ALLOW_DEV_SESSION,
    ALLOW_DEV_WORKSPACE_BOOTSTRAP: process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP,
    DEV_SESSION_ROLE: process.env.DEV_SESSION_ROLE,
    JWT_AUTH_SECRET: process.env.JWT_AUTH_SECRET,
    JWT_AUTH_ISSUER: process.env.JWT_AUTH_ISSUER,
    JWT_AUTH_AUDIENCE: process.env.JWT_AUTH_AUDIENCE,
  }
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development"
    process.env.AUTH_ADAPTER = "dev"
    process.env.ALLOW_DEV_SESSION = "true"
    delete process.env.JWT_AUTH_SECRET
    delete process.env.JWT_AUTH_ISSUER
    delete process.env.JWT_AUTH_AUDIENCE
    setTestRuntimeEnvForRequest({ CONTROL_DB: db } as AppEnv)
    await fn(db)
  } finally {
    restoreEnv(backup)
    resetTestRuntimeEnvForRequest()
  }
}

async function withJwtAuthEnv(fn: (db: FakeD1Database) => Promise<void>) {
  const db = new FakeD1Database()
  const backup = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_ADAPTER: process.env.AUTH_ADAPTER,
    JWT_AUTH_SECRET: process.env.JWT_AUTH_SECRET,
    JWT_AUTH_ISSUER: process.env.JWT_AUTH_ISSUER,
    JWT_AUTH_AUDIENCE: process.env.JWT_AUTH_AUDIENCE,
  }
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production"
    process.env.AUTH_ADAPTER = "jwt"
    process.env.JWT_AUTH_SECRET = JWT_SECRET
    delete process.env.ALLOW_DEV_SESSION
    delete process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP
    delete process.env.DEV_SESSION_ROLE
    process.env.JWT_AUTH_ISSUER = JWT_ISSUER
    process.env.JWT_AUTH_AUDIENCE = JWT_AUDIENCE
    setTestRuntimeEnvForRequest({ CONTROL_DB: db } as AppEnv)
    await fn(db)
  } finally {
    restoreEnv(backup)
    resetTestRuntimeEnvForRequest()
  }
}

function restoreEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test("verified identity plus active membership resolves SessionContext", async () => {
  await withAuthEnv(async (db) => {
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "user-1" as UserId, email: "u@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: "tenant-1" as TenantId, name: "Tenant", slug: "tenant", createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, {
      id: "membership-1", tenantId: "tenant-1" as TenantId, userId: "user-1" as UserId, role: "manager", status: "active", createdAt: now, updatedAt: now,
    })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity-1", userId: "user-1" as UserId, provider: "dev", providerSubject: "dev-user", email: "dev@example.local", createdAt: now, updatedAt: now,
    })

    const result = await resolveSession(new Request("http://localhost"))
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.session.tenantId, "tenant-1")
      assert.equal(result.session.role, "manager")
      assert.equal(result.session.email, "dev@example.local")
    }
  })
})

test("active membership cannot authorize a suspended tenant", async () => {
  await withAuthEnv(async (db) => {
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "user-suspended-tenant" as UserId, email: "suspended@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: "tenant-suspended" as TenantId, name: "Suspended", slug: "suspended", status: "suspended", createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, {
      id: "membership-suspended-tenant", tenantId: "tenant-suspended" as TenantId, userId: "user-suspended-tenant" as UserId, role: "owner", status: "active", createdAt: now, updatedAt: now,
    })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity-suspended-tenant", userId: "user-suspended-tenant" as UserId, provider: "dev", providerSubject: "dev-user", email: "dev@example.local", createdAt: now, updatedAt: now,
    })

    const result = await resolveSession(new Request("http://localhost"))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "forbidden")
  })
})

test("no membership returns forbidden", async () => {
  await withAuthEnv(async (db) => {
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "user-2" as UserId, email: "u2@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity-2", userId: "user-2" as UserId, provider: "dev", providerSubject: "dev-user", email: "dev@example.local", createdAt: now, updatedAt: now,
    })
    const result = await resolveSession(new Request("http://localhost"))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "forbidden")
  })
})

test("suspended or invited membership does not grant active access", async () => {
  await withAuthEnv(async (db) => {
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "user-3" as UserId, email: "u3@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: "tenant-3" as TenantId, name: "Tenant3", slug: "tenant-3", createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, {
      id: "membership-3", tenantId: "tenant-3" as TenantId, userId: "user-3" as UserId, role: "viewer", status: "invited", createdAt: now, updatedAt: now,
    })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity-3", userId: "user-3" as UserId, provider: "dev", providerSubject: "dev-user", email: "dev@example.local", createdAt: now, updatedAt: now,
    })
    const result = await resolveSession(new Request("http://localhost"))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "forbidden")
  })
})

test("dev bootstrap works only with explicit bootstrap flag", async () => {
  await withAuthEnv(async (db) => {
    process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"
    const result = await resolveSession(new Request("http://localhost"))
    assert.equal(result.ok, true)
    const memberships = db.debugTable("tenant_memberships")
    assert.equal(memberships.length, 1)
  })
})

test("dev bootstrap disabled means no auto-create", async () => {
  await withAuthEnv(async (db) => {
    delete process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP
    const result = await resolveSession(new Request("http://localhost"))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "unauthorized")
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (repos.ok) {
      const users = db.debugTable("users")
      assert.equal(users.length, 0)
    }
  })
})

test("jwt identity plus active membership resolves SessionContext from membership, not claims", async () => {
  await withJwtAuthEnv(async (db) => {
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "jwt-user-row" as UserId, email: "row@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: "tenant-jwt" as TenantId, name: "JWT Tenant", slug: "tenant-jwt", createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, {
      id: "membership-jwt", tenantId: "tenant-jwt" as TenantId, userId: "jwt-user-row" as UserId, role: "viewer", status: "active", createdAt: now, updatedAt: now,
    })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity-jwt", userId: "jwt-user-row" as UserId, provider: "jwt", providerSubject: "jwt-subject", email: "jwt@example.local", createdAt: now, updatedAt: now,
    })
    const token = await signHs256Jwt({ sub: "jwt-subject", email: "jwt@example.local", tenantId: "evil-tenant", role: "owner", iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET)
    const result = await resolveSession(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.session.tenantId, "tenant-jwt")
      assert.equal(result.session.role, "viewer")
      assert.equal(result.session.email, "jwt@example.local")
      assert.equal(result.session.isDevSession, false)
    }
  })
})

test("jwt identity without membership returns forbidden", async () => {
  await withJwtAuthEnv(async (db) => {
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "jwt-user-no-membership" as UserId, email: "jwt2@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity-jwt-no-membership", userId: "jwt-user-no-membership" as UserId, provider: "jwt", providerSubject: "jwt-no-membership", email: "jwt2@example.local", createdAt: now, updatedAt: now,
    })
    const token = await signHs256Jwt({ sub: "jwt-no-membership", email: "jwt2@example.local", iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET)
    const result = await resolveSession(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "forbidden")
  })
})

test("jwt identity with invited or suspended membership is rejected", async () => {
  await withJwtAuthEnv(async (db) => {
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "jwt-user-invited" as UserId, email: "jwt3@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: "tenant-jwt-invited" as TenantId, name: "JWT Invited", slug: "tenant-jwt-invited", createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, {
      id: "membership-jwt-invited", tenantId: "tenant-jwt-invited" as TenantId, userId: "jwt-user-invited" as UserId, role: "editor", status: "invited", createdAt: now, updatedAt: now,
    })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity-jwt-invited", userId: "jwt-user-invited" as UserId, provider: "jwt", providerSubject: "jwt-invited", email: "jwt3@example.local", createdAt: now, updatedAt: now,
    })
    const token = await signHs256Jwt({ sub: "jwt-invited", email: "jwt3@example.local", iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET)
    const result = await resolveSession(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "forbidden")
  })
})

test("jwt identity with suspended membership is rejected", async () => {
  await withJwtAuthEnv(async (db) => {
    const repos = resolveControlRepositories({ d1Binding: db })
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const now = new Date().toISOString()
    await repos.bundle.users.create(repos.bundle.ctx, { id: "jwt-user-suspended" as UserId, email: "jwt4@example.local", createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: "tenant-jwt-suspended" as TenantId, name: "JWT Suspended", slug: "tenant-jwt-suspended", createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, {
      id: "membership-jwt-suspended", tenantId: "tenant-jwt-suspended" as TenantId, userId: "jwt-user-suspended" as UserId, role: "editor", status: "suspended", createdAt: now, updatedAt: now,
    })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, {
      id: "identity-jwt-suspended", userId: "jwt-user-suspended" as UserId, provider: "jwt", providerSubject: "jwt-suspended", email: "jwt4@example.local", createdAt: now, updatedAt: now,
    })
    const token = await signHs256Jwt({ sub: "jwt-suspended", email: "jwt4@example.local", tenantId: "evil-tenant", role: "owner", iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET)
    const result = await resolveSession(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "forbidden")
  })
})
