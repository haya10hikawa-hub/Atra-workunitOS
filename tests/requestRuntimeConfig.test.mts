import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveValidatedRequestRuntimeConfig,
  resolveRuntimeConfigFromRawEnv,
  projectRuntimeAuthorizationEnv,
  projectLlmEnv,
} from "../app/lib/runtime/requestRuntimeConfig.ts"
import { runWithInjectedRuntimeEnv } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { requireSession } from "../app/lib/composition/requestSession.ts"
import { resolveControlRepositories } from "../app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"
import { resolveLlmProvider, resolveLlmProviderConfig } from "../app/lib/llm/providerConfig.ts"
import { evaluateRuntimeAuthorizationDryRun } from "../app/lib/security/runtimeAuthorizationGate.ts"
import { resolveRuntimeAuthorizationEvidenceResolver } from "../app/lib/security/runtimeAuthorizationEvidenceResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"
import type { Session } from "../app/lib/security/session.ts"

const JWT_SECRET = "request-scoped-secret-of-at-least-32-bytes-long"
const JWT_ISSUER = "https://issuer.example.test"
const JWT_AUDIENCE = "workunit-os"

function cloudflareEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    CONTROL_DB: new FakeD1Database(),
    TENANT_DB_DEFAULT: new FakeD1Database(),
    PERSISTENCE_MODE: "d1",
    EXTERNAL_ACTIONS_ENABLED: "false",
    ALLOW_LEGACY_INGEST_FALLBACK: "false",
    // WU-02S: a Cloudflare production runtime REQUIRES a valid trusted-origin
    // list. Its absence is a fail-closed config error, so every production
    // fixture must supply one. Tests 14-16 cover the failure modes directly.
    ALLOWED_ORIGINS: "https://app.example.com",
    ...overrides,
  } as AppEnv
}

async function seedControlDb(db: FakeD1Database, opts: { provider: string; providerSubject: string; email: string; tenantStatus?: string }) {
  const repos = resolveControlRepositories({ d1Binding: db })
  if (!repos.ok) throw new Error("control repos failed")
  const now = new Date().toISOString()
  await repos.bundle.users.create(repos.bundle.ctx, { id: "user-1" as UserId, email: opts.email, createdAt: now, updatedAt: now })
  await repos.bundle.tenants.create(repos.bundle.ctx, { id: "tenant-1" as TenantId, name: "T", slug: "t", status: (opts.tenantStatus ?? "active") as "active" | "suspended" | "deleted", createdAt: now, updatedAt: now })
  await repos.bundle.memberships.create(repos.bundle.ctx, { id: "m-1", tenantId: "tenant-1" as TenantId, userId: "user-1" as UserId, role: "manager", status: "active", createdAt: now, updatedAt: now })
  await repos.bundle.authIdentities.create(repos.bundle.ctx, { id: "id-1", userId: "user-1" as UserId, provider: opts.provider, providerSubject: opts.providerSubject, email: opts.email, createdAt: now, updatedAt: now })
}

// ─── 1. AUTH_ADAPTER=jwt selects the JWT adapter ────────────────

test("1. request runtime config with AUTH_ADAPTER=jwt selects the JWT adapter", () => {
  runWithInjectedRuntimeEnv(cloudflareEnv({ AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: JWT_SECRET, JWT_AUTH_ISSUER: JWT_ISSUER, JWT_AUTH_AUDIENCE: JWT_AUDIENCE } as Partial<AppEnv>), () => {
    const result = resolveValidatedRequestRuntimeConfig()
    assert.ok(result.ok)
    if (result.ok) {
      assert.equal(result.runtime.auth.adapter, "jwt")
      assert.equal(result.runtime.auth.jwt?.secret, JWT_SECRET)
      assert.equal(result.runtime.source, "cloudflare")
    }
  })
})

// ─── 2. request-scoped JWT resolves a session against request-scoped CONTROL_DB ──

test("2. a valid request-scoped JWT resolves a session against the request-scoped CONTROL_DB", async () => {
  const db = new FakeD1Database()
  await seedControlDb(db, { provider: "jwt", providerSubject: "jwt-user", email: "u@example.local" })
  const token = await signHs256Jwt({ sub: "jwt-user", email: "u@example.local", iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET)
  const env = cloudflareEnv({ CONTROL_DB: db, AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: JWT_SECRET, JWT_AUTH_ISSUER: JWT_ISSUER, JWT_AUTH_AUDIENCE: JWT_AUDIENCE } as Partial<AppEnv>)
  await runWithInjectedRuntimeEnv(env, async () => {
    const result = await requireSession(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.session.tenantId, "tenant-1")
      assert.equal(result.session.role, "manager")
    }
  })
})

// ─── 3 & 4. process.env cannot override request-scoped auth ─────

test("3. process.env.AUTH_ADAPTER=none cannot override request-scoped jwt", () => {
  const backup = process.env.AUTH_ADAPTER
  try {
    ;(process.env as Record<string, string | undefined>).AUTH_ADAPTER = "none"
    runWithInjectedRuntimeEnv(cloudflareEnv({ AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: JWT_SECRET, JWT_AUTH_ISSUER: JWT_ISSUER, JWT_AUTH_AUDIENCE: JWT_AUDIENCE } as Partial<AppEnv>), () => {
      const result = resolveValidatedRequestRuntimeConfig()
      assert.ok(result.ok && result.runtime.auth.adapter === "jwt")
    })
  } finally {
    if (backup === undefined) delete (process.env as Record<string, string | undefined>).AUTH_ADAPTER
    else (process.env as Record<string, string>).AUTH_ADAPTER = backup
  }
})

test("4. process.env.JWT_AUTH_SECRET cannot replace the request-scoped secret", () => {
  const backup = process.env.JWT_AUTH_SECRET
  try {
    ;(process.env as Record<string, string | undefined>).JWT_AUTH_SECRET = "attacker-controlled-secret-value-32bytes"
    runWithInjectedRuntimeEnv(cloudflareEnv({ AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: JWT_SECRET, JWT_AUTH_ISSUER: JWT_ISSUER, JWT_AUTH_AUDIENCE: JWT_AUDIENCE } as Partial<AppEnv>), () => {
      const result = resolveValidatedRequestRuntimeConfig()
      assert.ok(result.ok && result.runtime.auth.jwt?.secret === JWT_SECRET)
    })
  } finally {
    if (backup === undefined) delete (process.env as Record<string, string | undefined>).JWT_AUTH_SECRET
    else (process.env as Record<string, string>).JWT_AUTH_SECRET = backup
  }
})

// ─── 5 & 6. missing / malformed JWT config fails closed ─────────

test("5. missing request-scoped auth config → no jwt config (adapter fails closed)", () => {
  runWithInjectedRuntimeEnv(cloudflareEnv({ AUTH_ADAPTER: "jwt" } as Partial<AppEnv>), () => {
    const result = resolveValidatedRequestRuntimeConfig()
    assert.ok(result.ok && result.runtime.auth.adapter === "jwt" && result.runtime.auth.jwt === undefined)
  })
})

test("6. malformed (too-short) JWT secret in production → no jwt config", () => {
  runWithInjectedRuntimeEnv(cloudflareEnv({ AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: "short", JWT_AUTH_ISSUER: JWT_ISSUER, JWT_AUTH_AUDIENCE: JWT_AUDIENCE } as Partial<AppEnv>), () => {
    const result = resolveValidatedRequestRuntimeConfig()
    assert.ok(result.ok && result.runtime.auth.jwt === undefined)
  })
})

// ─── 7 & 8. kill switch is request-scoped ───────────────────────

test("7. request-scoped EXTERNAL_ACTIONS_ENABLED=false blocks even when process.env says true", () => {
  const backup = process.env.EXTERNAL_ACTIONS_ENABLED
  try {
    ;(process.env as Record<string, string | undefined>).EXTERNAL_ACTIONS_ENABLED = "true"
    runWithInjectedRuntimeEnv(cloudflareEnv({ EXTERNAL_ACTIONS_ENABLED: "false" }), () => {
      const result = resolveValidatedRequestRuntimeConfig()
      assert.ok(result.ok && result.runtime.security.externalActionsEnabled === false)
      const projected = projectRuntimeAuthorizationEnv(result.ok ? result.runtime.security : { externalActionsEnabled: true } as never)
      assert.equal(projected.EXTERNAL_ACTIONS_ENABLED, "false")
    })
  } finally {
    if (backup === undefined) delete (process.env as Record<string, string | undefined>).EXTERNAL_ACTIONS_ENABLED
    else (process.env as Record<string, string>).EXTERNAL_ACTIONS_ENABLED = backup
  }
})

test("8. request-scoped kill-switch state is honored by the Runtime Authorization gate", async () => {
  const session = { userId: "u", tenantId: "tenant-1", role: "owner", email: "e@x.local", isDevSession: false, sessionId: "s", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString() } as Session
  const killEnv = projectRuntimeAuthorizationEnv({ externalActionsEnabled: false, allowLegacyIngestFallback: false, allowDevSession: false, allowDevWorkspaceBootstrap: false, allowControlLessDevSession: false, trustedOrigins: [] })
  const outcome = await evaluateRuntimeAuthorizationDryRun({
    session,
    request: { tenantId: "tenant-1", workUnitId: "wu-1", actionPreviewId: "p-1", approvalId: "a-1", actionType: "slack_reply" },
    evidenceResolver: resolveRuntimeAuthorizationEvidenceResolver("tenant-1" as TenantId),
    env: killEnv,
  })
  assert.equal(outcome.disposition, "blocked")
})

// ─── 9. LLM resolution uses request-scoped config ───────────────

test("9. LLM provider/fallback resolution uses request-scoped config (no legacy fallback in prod)", () => {
  // Cloudflare production → disabled provider AND legacy fallback forced OFF.
  runWithInjectedRuntimeEnv(cloudflareEnv(), () => {
    const result = resolveValidatedRequestRuntimeConfig()
    assert.ok(result.ok)
    if (result.ok) {
      const llmEnv = projectLlmEnv(result.runtime.llm)
      assert.equal(resolveLlmProvider(llmEnv), null) // no real/mock provider in production
      assert.equal(resolveLlmProviderConfig(llmEnv).allowLegacyFallback, false)
      assert.equal(resolveLlmProviderConfig(llmEnv).allowMock, false)
      assert.equal(resolveLlmProviderConfig(llmEnv).isProduction, true)
    }
  })
})

test("9b. production ALLOW_LEGACY_INGEST_FALLBACK=true is rejected (fail-closed)", () => {
  const result = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ ALLOW_LEGACY_INGEST_FALLBACK: "true" }), production: true })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "forbidden_capability")
})

test("9c. every production ALLOW_* capability = true is rejected fail-closed", () => {
  const forbidden = {
    ALLOW_LEGACY_INGEST_FALLBACK: "forbidden_capability",
    ALLOW_MOCK_LLM: "forbidden_capability",
    ALLOW_IN_MEMORY_PERSISTENCE: "forbidden_capability",
    ALLOW_IN_MEMORY_APPROVAL_STORE: "forbidden_capability",
    ALLOW_DEV_SESSION: "dev_flag_forbidden",
    ALLOW_DEV_WORKSPACE_BOOTSTRAP: "dev_flag_forbidden",
    ALLOW_DEV_CONTROLLESS_SESSION: "dev_flag_forbidden",
  } as const
  for (const [key, expected] of Object.entries(forbidden)) {
    const trueResult = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ [key]: "true" } as never), production: true })
    assert.equal(trueResult.ok, false, `${key}=true must be rejected`)
    if (!trueResult.ok) assert.equal(trueResult.error, expected, `${key}=true → ${expected}`)
    // Malformed literal also fails closed; "false"/absent are accepted.
    const malformed = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ [key]: "1" } as never), production: true })
    assert.equal(malformed.ok, false, `${key}=1 must fail closed`)
    if (!malformed.ok) assert.equal(malformed.error, "malformed_var")
    assert.equal(resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ [key]: "false" } as never), production: true }).ok, true, `${key}=false accepted`)
  }
})

// ─── 10. cross-request isolation of all sections ────────────────

test("10. Request A and Request B cannot observe each other's auth/security/llm/D1", async () => {
  const envA = cloudflareEnv({ AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: "secret-A-of-at-least-thirty-two-bytes!!", JWT_AUTH_ISSUER: "iss-A", JWT_AUTH_AUDIENCE: "aud-A", EXTERNAL_ACTIONS_ENABLED: "false", LLM_PROVIDER: "provider-A" } as Partial<AppEnv>)
  const envB = cloudflareEnv({ AUTH_ADAPTER: "none", EXTERNAL_ACTIONS_ENABLED: "true", LLM_PROVIDER: "provider-B" } as Partial<AppEnv>)
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const run = (env: AppEnv, ms: number) => runWithInjectedRuntimeEnv(env, async () => {
    const before = resolveValidatedRequestRuntimeConfig()
    await delay(ms)
    const after = resolveValidatedRequestRuntimeConfig()
    return { before, after }
  })
  const [a, b] = await Promise.all([run(envA, 30), run(envB, 5)])
  assert.ok(a.after.ok && b.after.ok)
  if (a.after.ok && b.after.ok) {
    assert.equal(a.after.runtime.auth.jwt?.secret, "secret-A-of-at-least-thirty-two-bytes!!")
    assert.equal(a.after.runtime.security.externalActionsEnabled, false)
    assert.equal(a.after.runtime.llm.provider, "provider-A")
    assert.equal(b.after.runtime.auth.adapter, "none")
    assert.equal(b.after.runtime.auth.jwt, undefined)
    assert.equal(b.after.runtime.security.externalActionsEnabled, true)
    assert.equal(b.after.runtime.llm.provider, "provider-B")
    assert.equal(a.after.runtime.persistence.CONTROL_DB, envA.CONTROL_DB)
    assert.equal(b.after.runtime.persistence.CONTROL_DB, envB.CONTROL_DB)
  }
})

// ─── 11. no runtime secret leaks into serialized surfaces ───────

test("11. no runtime secret appears in a serialized config projection", () => {
  runWithInjectedRuntimeEnv(cloudflareEnv({ AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: JWT_SECRET, JWT_AUTH_ISSUER: JWT_ISSUER, JWT_AUTH_AUDIENCE: JWT_AUDIENCE, DEEPSEEK_API_KEY: "sk-secret-key" } as Partial<AppEnv>), () => {
    const result = resolveValidatedRequestRuntimeConfig()
    assert.ok(result.ok)
    if (result.ok) {
      // Kill-switch projection carries only the boolean literal, no secrets.
      const killJson = JSON.stringify(projectRuntimeAuthorizationEnv(result.runtime.security))
      assert.equal(killJson.includes(JWT_SECRET), false)
      assert.equal(killJson.includes("sk-secret-key"), false)
    }
  })
})

// ─── 12. local Node development is explicit and separate ────────

test("12. local Node development resolves from process.env (dev adapter allowed)", () => {
  const result = resolveValidatedRequestRuntimeConfig({
    processEnv: { NODE_ENV: "development", AUTH_ADAPTER: "dev", ALLOW_DEV_SESSION: "true" },
  })
  assert.ok(result.ok)
  if (result.ok) {
    assert.equal(result.runtime.source, "local")
    assert.equal(result.runtime.auth.adapter, "dev")
    assert.equal(result.runtime.security.allowDevSession, true)
  }
})

test("12b. a dev adapter is impossible in Cloudflare production (fails closed)", () => {
  const result = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ AUTH_ADAPTER: "dev" } as Partial<AppEnv>), production: true })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "dev_adapter_forbidden")
})

test("12c. ALLOW_DEV_* = true is rejected in Cloudflare production", () => {
  const result = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ ALLOW_DEV_SESSION: "true" } as Partial<AppEnv>), production: true })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "dev_flag_forbidden")
})

// ─── Config resolver: fail-closed validation ────────────────────

test("cloudflare config fails closed on missing D1 binding", () => {
  const env = cloudflareEnv()
  delete (env as Record<string, unknown>).TENANT_DB_DEFAULT
  const result = resolveValidatedRequestRuntimeConfig({ rawEnv: env, production: true })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "missing_tenant_db")
})

test("cloudflare config fails closed on a malformed boolean var", () => {
  const result = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ EXTERNAL_ACTIONS_ENABLED: "1" as "true" }), production: true })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "malformed_var")
})

test("validated runtime config sections are frozen", () => {
  const result = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv(), production: true })
  assert.ok(result.ok)
  if (result.ok) {
    assert.ok(Object.isFrozen(result.runtime))
    assert.ok(Object.isFrozen(result.runtime.security))
    assert.throws(() => { (result.runtime.security as { externalActionsEnabled: boolean }).externalActionsEnabled = true })
  }
})

// ─── Blocker 2: genuine Cloudflare context outranks test injection ──

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__")

test("a genuine Cloudflare context outranks a concurrent test injection", () => {
  const genuineControl = new FakeD1Database()
  const injectedControl = new FakeD1Database()
  const genuineEnv = cloudflareEnv({ CONTROL_DB: genuineControl } as Partial<AppEnv>)
  const injectedEnv = cloudflareEnv({ CONTROL_DB: injectedControl } as Partial<AppEnv>)

  // Install a genuine OpenNext request context on the global scope (what the
  // generated worker does per request).
  ;(globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT_SYMBOL] = { env: genuineEnv, cf: undefined, ctx: {} }
  try {
    // …while ALSO inside a test-injection scope. The genuine context must win.
    runWithInjectedRuntimeEnv(injectedEnv, () => {
      const result = resolveValidatedRequestRuntimeConfig()
      assert.ok(result.ok)
      if (result.ok) {
        assert.equal(result.runtime.persistence.CONTROL_DB, genuineControl)
        assert.notEqual(result.runtime.persistence.CONTROL_DB, injectedControl)
      }
    }, { production: true })
  } finally {
    delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT_SYMBOL]
  }
})

test("resolveRuntimeConfigFromRawEnv is a pure projection (no ambient reads)", () => {
  const env = cloudflareEnv()
  const cf = resolveRuntimeConfigFromRawEnv(env, "cloudflare")
  assert.ok(cf.ok && cf.runtime.source === "cloudflare")
  const local = resolveRuntimeConfigFromRawEnv(env, "local", { NODE_ENV: "development", PERSISTENCE_MODE: "d1" })
  assert.ok(local.ok && local.runtime.source === "local")
})

// ─── WU-02S: request-scoped trusted-origin authority ────────────

test("14. Cloudflare production requires a valid ALLOWED_ORIGINS and fails closed otherwise", () => {
  const db = { prepare: () => ({}) }
  const base = { CONTROL_DB: db, TENANT_DB_DEFAULT: db, PERSISTENCE_MODE: "d1", EXTERNAL_ACTIONS_ENABLED: "false" }

  for (const value of [undefined, "", "   ", ",,", "not-a-url", "https://x/path", "https://x/", "*", "https://*.example.com", "example.com", "https://a@b.example.com"]) {
    const raw = { ...base, ...(value === undefined ? {} : { ALLOWED_ORIGINS: value }) }
    const result = resolveValidatedRequestRuntimeConfig({ rawEnv: raw as never })
    assert.equal(result.ok, false, `ALLOWED_ORIGINS=${JSON.stringify(value)} must fail closed`)
    if (!result.ok) assert.equal(result.error, "malformed_trusted_origins", JSON.stringify(value))
  }

  const ok = resolveValidatedRequestRuntimeConfig({
    rawEnv: { ...base, ALLOWED_ORIGINS: "https://app.example.com, https://admin.example.com:8443 , https://app.example.com" } as never,
  })
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  // Validated, deduplicated, frozen — and order-preserving.
  assert.deepEqual([...ok.runtime.security.trustedOrigins], ["https://app.example.com", "https://admin.example.com:8443"])
  assert.equal(Object.isFrozen(ok.runtime.security.trustedOrigins), true)
  assert.throws(() => { (ok.runtime.security.trustedOrigins as string[]).push("https://evil.test") })
})

test("15. local development defaults trusted origins to localhost but still fails closed on a malformed value", () => {
  const empty = resolveValidatedRequestRuntimeConfig({ rawEnv: {} as never, production: false, processEnv: {} })
  assert.equal(empty.ok, true)
  if (empty.ok) assert.deepEqual([...empty.runtime.security.trustedOrigins], ["http://localhost:3000"])

  const explicit = resolveValidatedRequestRuntimeConfig({ rawEnv: {} as never, production: false, processEnv: { ALLOWED_ORIGINS: "http://localhost:4000" } })
  assert.equal(explicit.ok, true)
  if (explicit.ok) assert.deepEqual([...explicit.runtime.security.trustedOrigins], ["http://localhost:4000"])

  const malformed = resolveValidatedRequestRuntimeConfig({ rawEnv: {} as never, production: false, processEnv: { ALLOWED_ORIGINS: "http://localhost:4000/app" } })
  assert.equal(malformed.ok, false)
  if (!malformed.ok) assert.equal(malformed.error, "malformed_trusted_origins")
})

test("16. two requests with different ALLOWED_ORIGINS cannot observe each other's allowlist", () => {
  const db = { prepare: () => ({}) }
  const base = { CONTROL_DB: db, TENANT_DB_DEFAULT: db, PERSISTENCE_MODE: "d1", EXTERNAL_ACTIONS_ENABLED: "false" }
  const a = resolveValidatedRequestRuntimeConfig({ rawEnv: { ...base, ALLOWED_ORIGINS: "https://a.example.com" } as never })
  const b = resolveValidatedRequestRuntimeConfig({ rawEnv: { ...base, ALLOWED_ORIGINS: "https://b.example.com" } as never })
  assert.equal(a.ok && b.ok, true)
  if (!a.ok || !b.ok) return
  assert.deepEqual([...a.runtime.security.trustedOrigins], ["https://a.example.com"])
  assert.deepEqual([...b.runtime.security.trustedOrigins], ["https://b.example.com"])
})
