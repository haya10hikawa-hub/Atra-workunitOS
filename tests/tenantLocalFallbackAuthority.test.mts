/**
 * Blocker 2 (P0-PERSIST-014): local persistence fallback authority.
 *
 * The central helper `canUseLocalPersistenceFallback` is the ONLY authority for
 * substituting generated / empty / default data on a persistence failure. It is
 * proven here at the unit level (all five conditions incl. Node production) and
 * at the route level (Cloudflare production 503, Node-production-local 503,
 * local-without-dev-capability 503, and explicitly authorized local fallback).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { canUseLocalPersistenceFallback } from "../app/lib/runtime/localFallbackAuthority.ts"
import type { ValidatedRequestRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { GET as inboxGet } from "../app/api/workunit/inbox/route.ts"
import { GET as auditGet } from "../app/api/audit/recent/route.ts"
import { GET as integrationsGet } from "../app/api/integrations/status/route.ts"
import { runWithInjectedRuntimeEnv } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { resolveControlRepositories } from "../app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"

// ─── Unit: the five authority conditions ────────────────────────

function runtime(over: {
  source?: "local" | "cloudflare"
  isProduction?: boolean
  adapter?: "none" | "jwt" | "dev"
  allowDevSession?: boolean
}): ValidatedRequestRuntimeConfig {
  return {
    source: over.source ?? "local",
    persistence: { mode: "disabled" },
    auth: { adapter: over.adapter ?? "dev", isProduction: over.isProduction ?? false },
    security: {
      externalActionsEnabled: false,
      allowLegacyIngestFallback: false,
      allowDevSession: over.allowDevSession ?? true,
      allowDevWorkspaceBootstrap: false,
      allowControlLessDevSession: false,
    },
    llm: { allowMock: false, allowLegacyFallback: false, isProduction: over.isProduction ?? false },
  }
}

test("unit: authorized local development allows fallback", () => {
  assert.equal(canUseLocalPersistenceFallback(runtime({})), true)
})

test("unit: Cloudflare source is NEVER allowed", () => {
  assert.equal(canUseLocalPersistenceFallback(runtime({ source: "cloudflare" })), false)
})

test("unit: Node production (local source but isProduction) is NEVER allowed", () => {
  assert.equal(canUseLocalPersistenceFallback(runtime({ isProduction: true })), false)
})

test("unit: a non-dev auth adapter is NOT allowed (even in local dev)", () => {
  assert.equal(canUseLocalPersistenceFallback(runtime({ adapter: "jwt" })), false)
  assert.equal(canUseLocalPersistenceFallback(runtime({ adapter: "none" })), false)
})

test("unit: missing the explicit dev capability is NOT allowed", () => {
  assert.equal(canUseLocalPersistenceFallback(runtime({ allowDevSession: false })), false)
})

// ─── Route integration ──────────────────────────────────────────

const SECRET = "local-fallback-authority-secret-at-least-32b"
const ISS = "https://iss.test"
const AUD = "workunit-os"
const SUB = "jwt-user"

async function seedSession(controlDb: FakeD1Database, tenantId: string) {
  const repos = resolveControlRepositories({ d1Binding: controlDb })
  if (!repos.ok) throw new Error("seed failed")
  const now = new Date().toISOString()
  await repos.bundle.users.create(repos.bundle.ctx, { id: "user-1" as UserId, email: "u@x.local", createdAt: now, updatedAt: now })
  await repos.bundle.tenants.create(repos.bundle.ctx, { id: tenantId as TenantId, name: "T", slug: `slug-${tenantId}`, status: "active", createdAt: now, updatedAt: now })
  await repos.bundle.memberships.create(repos.bundle.ctx, { id: "m-1", tenantId: tenantId as TenantId, userId: "user-1" as UserId, role: "owner", status: "active", createdAt: now, updatedAt: now })
  await repos.bundle.authIdentities.create(repos.bundle.ctx, { id: "id-1", userId: "user-1" as UserId, provider: "jwt", providerSubject: SUB, email: "u@x.local", createdAt: now, updatedAt: now })
}

async function bearer(url: string): Promise<Request> {
  const token = await signHs256Jwt({ sub: SUB, email: "u@x.local", iss: ISS, aud: AUD }, SECRET)
  return new Request(url, { headers: { Authorization: `Bearer ${token}` } })
}

const ENV_KEYS = ["NODE_ENV", "AUTH_ADAPTER", "JWT_AUTH_SECRET", "JWT_AUTH_ISSUER", "JWT_AUTH_AUDIENCE", "ALLOW_DEV_SESSION", "ALLOW_DEV_CONTROLLESS_SESSION", "PERSISTENCE_MODE"] as const

function withEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => Promise<void>): Promise<void> {
  const backup: Record<string, string | undefined> = {}
  for (const k of ENV_KEYS) backup[k] = process.env[k]
  const setEnv = (k: string, v: string | undefined) => {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else (process.env as Record<string, string>)[k] = v
  }
  for (const k of ENV_KEYS) setEnv(k, undefined)
  for (const [k, v] of Object.entries(vars)) setEnv(k, v)
  return (async () => {
    try { await fn() } finally { for (const k of ENV_KEYS) setEnv(k, backup[k]) }
  })()
}

const routeCases: Array<{ name: string; get: (r: Request) => Promise<Response>; url: string; fallbackField: string }> = [
  { name: "Inbox", get: inboxGet as never, url: "http://localhost/api/workunit/inbox?source=mock", fallbackField: "workUnits" },
  { name: "Audit", get: auditGet as never, url: "http://localhost/api/audit/recent", fallbackField: "auditLogs" },
  { name: "Integrations", get: integrationsGet as never, url: "http://localhost/api/integrations/status", fallbackField: "providers" },
]

// 1. Cloudflare production repository failure → safe 503 (no fallback data).
for (const rc of routeCases) {
  test(`1. Cloudflare production ${rc.name} persistence failure → safe 503, no fallback`, async () => {
    const control = new FakeD1Database(), tenant = new FakeD1Database()
    await seedSession(control, "tenant-a") // active tenant/session but NO tenant_databases record
    const env = { CONTROL_DB: control, TENANT_DB_DEFAULT: tenant, PERSISTENCE_MODE: "d1", EXTERNAL_ACTIONS_ENABLED: "false", AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: SECRET, JWT_AUTH_ISSUER: ISS, JWT_AUTH_AUDIENCE: AUD } as AppEnv
    await runWithInjectedRuntimeEnv(env, async () => {
      const res = await rc.get(await bearer(rc.url))
      assert.equal(res.status, 503)
      assert.equal((await res.json())[rc.fallbackField], undefined)
    }, { production: true })
  })
}

// 2. Node production (source local, isProduction true) failure → safe 503.
for (const rc of routeCases) {
  test(`2. Node production (local source) ${rc.name} persistence failure → safe 503, no fallback`, async () => {
    const control = new FakeD1Database()
    await seedSession(control, "tenant-a")
    await withEnv({ NODE_ENV: "production", AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: SECRET, JWT_AUTH_ISSUER: ISS, JWT_AUTH_AUDIENCE: AUD }, async () => {
      // production:false → local source; NODE_ENV=production → auth.isProduction true.
      // No PERSISTENCE_MODE → persistence disabled → repo resolution fails.
      await runWithInjectedRuntimeEnv({ CONTROL_DB: control } as AppEnv, async () => {
        const res = await rc.get(await bearer(rc.url))
        assert.equal(res.status, 503)
        assert.equal((await res.json())[rc.fallbackField], undefined)
      }, { production: false })
    })
  })
}

// 3. Local development WITHOUT the explicit dev capability (jwt adapter) → safe 503.
for (const rc of routeCases) {
  test(`3. local dev without dev capability ${rc.name} → safe 503, no fallback`, async () => {
    const control = new FakeD1Database()
    await seedSession(control, "tenant-a")
    await withEnv({ NODE_ENV: "development", AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: SECRET, JWT_AUTH_ISSUER: ISS, JWT_AUTH_AUDIENCE: AUD }, async () => {
      await runWithInjectedRuntimeEnv({ CONTROL_DB: control } as AppEnv, async () => {
        const res = await rc.get(await bearer(rc.url))
        assert.equal(res.status, 503)
        assert.equal((await res.json())[rc.fallbackField], undefined)
      }, { production: false })
    })
  })
}

// 4. Explicitly authorized local development → fallback allowed.
test("4. authorized local development (dev adapter + capability) → generated fallback allowed", async () => {
  await withEnv({ NODE_ENV: "development", AUTH_ADAPTER: "dev", ALLOW_DEV_SESSION: "true", ALLOW_DEV_CONTROLLESS_SESSION: "true" }, async () => {
    // No injected runtime env → local source; controlless dev session; persistence disabled.
    const res = await inboxGet(new Request("http://localhost/api/workunit/inbox?source=mock"))
    assert.equal(res.status, 200)
    assert.ok(Array.isArray((await res.json()).workUnits))
  })
})
