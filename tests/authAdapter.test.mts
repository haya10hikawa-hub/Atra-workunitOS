import test from "node:test"
import assert from "node:assert/strict"
import { DevAuthAdapter } from "../app/lib/application/auth/devAuthAdapter.ts"
import { JwtAuthAdapter } from "../app/lib/application/auth/jwtAuthAdapter.ts"
import { NoopProductionAuthAdapter } from "../app/lib/application/auth/noopProductionAuthAdapter.ts"
import { resolveAuthAdapter } from "../app/lib/composition/authAdapterSelection.ts"
import type { AuthRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"

// Adapters and the resolver take EXPLICIT config — they never read process.env.

test("dev adapter returns identity only when enabled", async () => {
  const result = await new DevAuthAdapter({ enabled: true }).verify(new Request("http://localhost"))
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.identity.provider, "dev")
})

test("dev adapter rejects when disabled", async () => {
  const result = await new DevAuthAdapter({ enabled: false }).verify(new Request("http://localhost"))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "missing_credentials")
})

test("noop production adapter returns adapter_not_configured", async () => {
  const result = await new NoopProductionAuthAdapter().verify(new Request("http://localhost"))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "adapter_not_configured")
})

test("resolver never selects dev in production", async () => {
  const prodNone: AuthRuntimeConfig = { adapter: "none", isProduction: true }
  const result = await resolveAuthAdapter(prodNone).verify(new Request("http://localhost"))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "adapter_not_configured")
})

test("adapter=dev safe-fails in production even with allowDevSession", async () => {
  const prodDev: AuthRuntimeConfig = { adapter: "dev", isProduction: true }
  const result = await resolveAuthAdapter(prodDev, { allowDevSession: true }).verify(new Request("http://localhost"))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "adapter_not_configured")
})

test("resolver selects dev only when non-production and explicitly allowed", async () => {
  const devCfg: AuthRuntimeConfig = { adapter: "dev", isProduction: false }
  const allowed = await resolveAuthAdapter(devCfg, { allowDevSession: true }).verify(new Request("http://localhost"))
  assert.equal(allowed.ok, true)
  const notAllowed = await resolveAuthAdapter(devCfg, { allowDevSession: false }).verify(new Request("http://localhost"))
  assert.equal(notAllowed.ok, false)
})

test("jwt adapter returns verified identity for a valid token with injected secret", async () => {
  const token = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local", name: "JWT User" }, "jwt-secret")
  const result = await new JwtAuthAdapter({ secret: "jwt-secret" }).verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.identity, { provider: "jwt", providerSubject: "jwt-user", email: "jwt@example.local", displayName: "JWT User", avatarUrl: undefined })
})

test("jwt adapter handles missing, malformed, invalid, and expired tokens safely", async () => {
  const expired = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local", exp: Math.floor(Date.now() / 1000) - 60 }, "jwt-secret")
  const invalidSig = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local" }, "wrong-secret")
  const requests = [
    new Request("http://localhost"),
    new Request("http://localhost", { headers: { Authorization: "Bearer" } }),
    new Request("http://localhost", { headers: { Authorization: `Bearer ${invalidSig}` } }),
    new Request("http://localhost", { headers: { Authorization: `Bearer ${expired}` } }),
  ]
  for (const request of requests) {
    const result = await new JwtAuthAdapter({ secret: "jwt-secret" }).verify(request)
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.reason, /missing_credentials|invalid_credentials/)
    assert.equal(JSON.stringify(result).includes("Bearer"), false)
  }
})

test("jwt adapter rejects missing claims and missing config, and ignores tenant or role claims", async () => {
  const missingConfig = await new JwtAuthAdapter().verify(new Request("http://localhost"))
  assert.equal(missingConfig.ok, false)
  if (!missingConfig.ok) assert.equal(missingConfig.reason, "adapter_not_configured")

  const noSub = await signHs256Jwt({ email: "jwt@example.local" }, "jwt-secret")
  const noEmail = await signHs256Jwt({ sub: "jwt-user" }, "jwt-secret")
  const claimsToken = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local", tenantId: "evil-tenant", role: "owner" }, "jwt-secret")
  const adapter = new JwtAuthAdapter({ secret: "jwt-secret" })
  const noSubResult = await adapter.verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${noSub}` } }))
  const noEmailResult = await adapter.verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${noEmail}` } }))
  const claimsResult = await adapter.verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${claimsToken}` } }))
  assert.equal(noSubResult.ok, false)
  assert.equal(noEmailResult.ok, false)
  assert.equal(claimsResult.ok, true)
  if (claimsResult.ok) {
    assert.equal(claimsResult.identity.provider, "jwt")
    assert.equal(claimsResult.identity.providerSubject, "jwt-user")
    assert.equal(claimsResult.identity.email, "jwt@example.local")
    assert.equal("tenantId" in claimsResult.identity, false)
    assert.equal("role" in claimsResult.identity, false)
  }
})

test("resolver supports adapter=jwt only when jwt config is present", async () => {
  const jwtNoConfig: AuthRuntimeConfig = { adapter: "jwt", isProduction: true, jwt: undefined }
  const result = await resolveAuthAdapter(jwtNoConfig).verify(new Request("http://localhost"))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "adapter_not_configured")
})
