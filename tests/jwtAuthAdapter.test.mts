import test from "node:test"
import assert from "node:assert/strict"
import { JwtAuthAdapter } from "../app/lib/application/auth/jwtAuthAdapter.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"

// The adapter takes its secret/issuer/audience via the constructor — it never
// reads process.env. Production strong-secret/issuer/audience enforcement lives
// in the request runtime config resolver (see requestRuntimeConfig tests).

const SECRET = "test-secret"
const adapter = () => new JwtAuthAdapter({ secret: SECRET })

test("valid JWT returns VerifiedAuthIdentity", async () => {
  const token = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local", name: "JWT User" }, SECRET)
  const result = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.identity, {
    provider: "jwt",
    providerSubject: "jwt-user",
    email: "jwt@example.local",
    displayName: "JWT User",
    avatarUrl: undefined,
  })
})

test("missing token returns missing_credentials", async () => {
  const result = await adapter().verify(new Request("http://localhost"))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "missing_credentials")
})

test("malformed Bearer header returns invalid_credentials", async () => {
  const result = await adapter().verify(new Request("http://localhost", { headers: { Authorization: "Token abc" } }))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "invalid_credentials")
})

test("invalid signature returns invalid_credentials", async () => {
  const token = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local" }, "wrong-secret")
  const result = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "invalid_credentials")
})

test("expired token returns invalid_credentials", async () => {
  const token = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local", exp: Math.floor(Date.now() / 1000) - 60 }, SECRET)
  const result = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "invalid_credentials")
})

test("token without exp returns invalid_credentials", async () => {
  const token = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local" }, SECRET, false)
  const result = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "invalid_credentials")
})

test("missing sub or email returns invalid_credentials", async () => {
  const missingSub = await signHs256Jwt({ email: "jwt@example.local" }, SECRET)
  const missingEmail = await signHs256Jwt({ sub: "jwt-user" }, SECRET)
  const subResult = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${missingSub}` } }))
  const emailResult = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${missingEmail}` } }))
  assert.equal(subResult.ok, false)
  assert.equal(emailResult.ok, false)
  if (!subResult.ok) assert.equal(subResult.reason, "invalid_credentials")
  if (!emailResult.ok) assert.equal(emailResult.reason, "invalid_credentials")
})

test("missing injected config returns adapter_not_configured", async () => {
  const result = await new JwtAuthAdapter().verify(new Request("http://localhost", { headers: { Authorization: "Bearer abc.def.ghi" } }))
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "adapter_not_configured")
})

test("tenantId and role claims are ignored", async () => {
  const token = await signHs256Jwt({ sub: "jwt-user", email: "jwt@example.local", tenantId: "evil-tenant", role: "owner" }, SECRET)
  const result = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
  assert.equal(result.ok, true)
  assert.equal(JSON.stringify(result).includes("evil-tenant"), false)
  assert.equal(JSON.stringify(result).includes("\"role\""), false)
})

test("token is not included in error output", async () => {
  const token = "not-a-real-token"
  const result = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
  assert.equal(result.ok, false)
  assert.equal(JSON.stringify(result).includes(token), false)
})

test("invalid base64 and oversized bearer tokens fail closed without throwing", async () => {
  for (const token of ["abc.%.sig", "eyJhbGciOiJIUzI1NiJ9.!!!!.x", `${"a".repeat(20_000)}.e30.x`]) {
    const result = await adapter().verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "invalid_credentials")
  }
})

test("issuer and audience mismatches are rejected", async () => {
  const scoped = new JwtAuthAdapter({ secret: SECRET, issuer: "https://iss.test", audience: "aud-1" })
  const wrongIss = await signHs256Jwt({ sub: "u", email: "e@x.local", iss: "https://evil.test", aud: "aud-1" }, SECRET)
  const wrongAud = await signHs256Jwt({ sub: "u", email: "e@x.local", iss: "https://iss.test", aud: "aud-2" }, SECRET)
  const good = await signHs256Jwt({ sub: "u", email: "e@x.local", iss: "https://iss.test", aud: "aud-1" }, SECRET)
  assert.equal((await scoped.verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${wrongIss}` } }))).ok, false)
  assert.equal((await scoped.verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${wrongAud}` } }))).ok, false)
  assert.equal((await scoped.verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${good}` } }))).ok, true)
})
