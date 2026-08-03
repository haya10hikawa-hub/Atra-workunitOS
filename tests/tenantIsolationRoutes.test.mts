/**
 * Route-level tenant DB routing tests (P0-PERSIST-014).
 *
 * Exercises the genuine Cloudflare production path: a JWT session is resolved
 * against the seeded control DB, then the tenant DB resolver validates the
 * registry before repositories are returned. Failures surface as SAFE errors
 * (no generated/fake fallback data, no registry disclosure).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { GET as inboxGet } from "../app/api/workunit/inbox/route.ts"
import { GET as auditGet } from "../app/api/audit/recent/route.ts"
import { GET as integrationsGet } from "../app/api/integrations/status/route.ts"
import { runWithInjectedRuntimeEnv } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { resolveControlRepositories } from "../app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { seedTenantDatabaseRow } from "./helpers/registrySeed.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"

const SECRET = "route-tenant-isolation-secret-at-least-32b"
const ISS = "https://iss.test"
const AUD = "workunit-os"
const SUB = "jwt-user"

async function seedSession(controlDb: FakeD1Database, tenantId: string, opts: { tenantStatus?: string; includeDbRow?: boolean } = {}) {
  const { tenantStatus = "active", includeDbRow = true } = opts
  const repos = resolveControlRepositories({ d1Binding: controlDb })
  if (!repos.ok) throw new Error("seed failed")
  const now = new Date().toISOString()
  await repos.bundle.users.create(repos.bundle.ctx, { id: "user-1" as UserId, email: "u@x.local", createdAt: now, updatedAt: now })
  await repos.bundle.tenants.create(repos.bundle.ctx, { id: tenantId as TenantId, name: "T", slug: `slug-${tenantId}`, status: tenantStatus as "active" | "suspended" | "deleted", createdAt: now, updatedAt: now })
  await repos.bundle.memberships.create(repos.bundle.ctx, { id: "m-1", tenantId: tenantId as TenantId, userId: "user-1" as UserId, role: "owner", status: "active", createdAt: now, updatedAt: now })
  await repos.bundle.authIdentities.create(repos.bundle.ctx, { id: "id-1", userId: "user-1" as UserId, provider: "jwt", providerSubject: SUB, email: "u@x.local", createdAt: now, updatedAt: now })
  if (includeDbRow) {
    // Complete, active registry record (Blocker 3) so a valid tenant validates.
    await seedTenantDatabaseRow(controlDb, tenantId, { status: "active" })
  }
}

function cloudflareEnv(controlDb: FakeD1Database, tenantDb: FakeD1Database): AppEnv {
  return {
    CONTROL_DB: controlDb, TENANT_DB_DEFAULT: tenantDb, PERSISTENCE_MODE: "d1",
    // WU-02S: a Cloudflare production runtime REQUIRES a validated
    // trusted-origin list; its absence is a fail-closed config error.
    ALLOWED_ORIGINS: "http://localhost:3000",
    EXTERNAL_ACTIONS_ENABLED: "false", AUTH_ADAPTER: "jwt",
    JWT_AUTH_SECRET: SECRET, JWT_AUTH_ISSUER: ISS, JWT_AUTH_AUDIENCE: AUD,
  } as AppEnv
}

async function bearerRequest(url: string): Promise<Request> {
  const token = await signHs256Jwt({ sub: SUB, email: "u@x.local", iss: ISS, aud: AUD }, SECRET)
  return new Request(url, { headers: { Authorization: `Bearer ${token}` } })
}

// ─── 1. active tenant + active registry row reaches repositories ──

test("1. active tenant + active registry row reaches the tenant repository bundle", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  await seedSession(control, "tenant-a", { includeDbRow: true })
  await runWithInjectedRuntimeEnv(cloudflareEnv(control, tenant), async () => {
    const res = await inboxGet(await bearerRequest("http://localhost/api/workunit/inbox?source=mock"))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(Array.isArray(body.workUnits))
  }, { production: true })
})

// ─── 2. suspended tenant cannot reach tenant repositories ────────

test("2. a suspended tenant cannot reach tenant repositories", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  await seedSession(control, "tenant-a", { tenantStatus: "suspended", includeDbRow: true })
  await runWithInjectedRuntimeEnv(cloudflareEnv(control, tenant), async () => {
    const res = await inboxGet(await bearerRequest("http://localhost/api/workunit/inbox?source=mock"))
    // Blocked before repositories (session rejects a non-active tenant).
    assert.ok(res.status === 403 || res.status === 401)
    const body = await res.json()
    assert.equal(body.workUnits, undefined) // no generated fallback
  }, { production: true })
})

// ─── 3, 6, 7, 8. missing registry row → safe 503 (no fallback) ──

const routeCases: Array<{ name: string; get: (r: Request) => Promise<Response>; url: string; leakField: string }> = [
  { name: "Inbox", get: inboxGet as never, url: "http://localhost/api/workunit/inbox?source=mock", leakField: "workUnits" },
  { name: "Audit Recent", get: auditGet as never, url: "http://localhost/api/audit/recent", leakField: "auditLogs" },
  { name: "Integration Status", get: integrationsGet as never, url: "http://localhost/api/integrations/status", leakField: "providers" },
]

for (const rc of routeCases) {
  test(`3/6/7/8. ${rc.name} returns 503 (no fallback data) when the registry row is missing in production`, async () => {
    const control = new FakeD1Database(), tenant = new FakeD1Database()
    await seedSession(control, "tenant-a", { includeDbRow: false }) // active tenant, NO tenant_databases row
    await runWithInjectedRuntimeEnv(cloudflareEnv(control, tenant), async () => {
      const res = await rc.get(await bearerRequest(rc.url))
      assert.equal(res.status, 503)
      const body = await res.json()
      // No generated / fake / empty-success fallback payload.
      assert.equal(body[rc.leakField], undefined)
      // No raw registry disclosure.
      const serialized = JSON.stringify(body)
      for (const leak of ["tenant_databases", "database_id", "SELECT", "TENANT_DB_DEFAULT", SECRET]) {
        assert.equal(serialized.includes(leak), false, `${rc.name} 503 must not leak ${leak}`)
      }
    }, { production: true })
  })
}

// ─── 9. local gated fallback remains available ──────────────────

test("9. local dev fallback remains available (Inbox returns generated data when persistence is off)", async () => {
  const keys = ["PERSISTENCE_MODE", "NODE_ENV", "ALLOW_DEV_SESSION", "ALLOW_DEV_CONTROLLESS_SESSION", "AUTH_ADAPTER"] as const
  const backup: Record<string, string | undefined> = {}
  for (const k of keys) backup[k] = process.env[k]
  try {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = "development"
    ;(process.env as Record<string, string | undefined>).AUTH_ADAPTER = "dev"
    ;(process.env as Record<string, string | undefined>).ALLOW_DEV_SESSION = "true"
    ;(process.env as Record<string, string | undefined>).ALLOW_DEV_CONTROLLESS_SESSION = "true"
    delete (process.env as Record<string, string | undefined>).PERSISTENCE_MODE // → persistence disabled locally
    // No injected runtime env → local source; control-less dev session; persistence disabled.
    const res = await inboxGet(new Request("http://localhost/api/workunit/inbox?source=mock"))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(Array.isArray(body.workUnits)) // generated fallback allowed locally
  } finally {
    for (const k of keys) {
      if (backup[k] === undefined) delete (process.env as Record<string, string | undefined>)[k]
      else (process.env as Record<string, string>)[k] = backup[k] as string
    }
  }
})
