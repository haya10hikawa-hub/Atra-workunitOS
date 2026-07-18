import test from "node:test"
import assert from "node:assert/strict"
import {
  formatLocalJwtVerification,
  generateLocalJwt,
  verifyLocalJwt,
} from "../scripts/lib/localJwt.mjs"

const SECRET = "local-jwt-secret-with-at-least-32-bytes"
const BASE_ENV = Object.freeze({
  JWT_AUTH_SECRET: SECRET,
  JWT_AUTH_ISSUER: "workunit-os",
  JWT_AUTH_AUDIENCE: "workunit-os-api",
  CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: "cf-d1-bootstrap:test-subject",
  CF_D1_BOOTSTRAP_IDENTITY_EMAIL: "bootstrap@example.invalid",
})

function enc(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

async function tamperPayload(token: string, patch: Record<string, unknown>): Promise<string> {
  const [header, payload, signature] = token.split(".")
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>
  return `${header}.${enc({ ...claims, ...patch })}.${signature}`
}

test("local JWT generation emits HS256 JWT with required bootstrap claims and short expiry", async () => {
  const token = await generateLocalJwt(BASE_ENV, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })
  assert.equal(token.split(".").length, 3)
  const [headerSegment, payloadSegment] = token.split(".")
  const header = JSON.parse(Buffer.from(headerSegment, "base64url").toString("utf8"))
  const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"))
  assert.deepEqual(header, { alg: "HS256", typ: "JWT" })
  assert.equal(payload.sub, BASE_ENV.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT)
  assert.equal(payload.email, BASE_ENV.CF_D1_BOOTSTRAP_IDENTITY_EMAIL)
  assert.equal(payload.iss, BASE_ENV.JWT_AUTH_ISSUER)
  assert.equal(payload.aud, BASE_ENV.JWT_AUTH_AUDIENCE)
  assert.equal(payload.iat, 1_800_000_000)
  assert.equal(payload.exp, 1_800_003_600)
})

test("local JWT verification accepts only matching HS256 bootstrap claims", async () => {
  const token = await generateLocalJwt(BASE_ENV, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })
  const result = await verifyLocalJwt(token, BASE_ENV, { nowSeconds: 1_800_000_100 })
  assert.equal(result.ok, true)
  assert.equal(result.algorithm, "HS256")
  assert.equal(result.subject, BASE_ENV.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT)
  assert.equal(result.emailPresent, true)
  assert.equal(result.issuerMatch, true)
  assert.equal(result.audienceMatch, true)
  assert.equal(result.signatureValid, true)
})

test("local JWT verification rejects unsafe or mismatched tokens", async () => {
  const token = await generateLocalJwt(BASE_ENV, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })
  const [goodHeader, goodPayload, goodSignature] = token.split(".")
  const cases: Array<[string, string]> = [
    ["rs256_header", `${enc({ alg: "RS256", typ: "JWT" })}.${goodPayload}.${goodSignature}`],
    ["email_missing", await tamperPayload(token, { email: undefined })],
    ["expired", await generateLocalJwt(BASE_ENV, { nowSeconds: 1_800_000_000, ttlSeconds: 1 })],
    ["issuer_mismatch", await generateLocalJwt({ ...BASE_ENV, JWT_AUTH_ISSUER: "other-issuer" }, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })],
    ["audience_mismatch", await generateLocalJwt({ ...BASE_ENV, JWT_AUTH_AUDIENCE: "other-audience" }, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })],
    ["signature_mismatch", `${goodHeader}.${goodPayload}.bad-signature`],
    ["subject_mismatch", await generateLocalJwt({ ...BASE_ENV, CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: "other-subject" }, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })],
    ["email_mismatch", await generateLocalJwt({ ...BASE_ENV, CF_D1_BOOTSTRAP_IDENTITY_EMAIL: "other@example.invalid" }, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })],
  ]
  for (const [reason, candidate] of cases) {
    const result = await verifyLocalJwt(candidate, BASE_ENV, { nowSeconds: reason === "expired" ? 1_800_000_002 : 1_800_000_100 })
    assert.equal(result.ok, false, reason)
    assert.equal(JSON.stringify(result).includes(candidate), false, reason)
    assert.equal(JSON.stringify(result).includes(SECRET), false, reason)
  }
})

test("local JWT verification diagnostics do not print token, secret, or email value", async () => {
  const token = await generateLocalJwt(BASE_ENV, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })
  const output = formatLocalJwtVerification(await verifyLocalJwt(token, BASE_ENV, { nowSeconds: 1_800_000_100 }))
  assert.match(output, /algorithm=HS256/)
  assert.match(output, /emailPresent=true/)
  assert.match(output, /signatureValid=true/)
  assert.equal(output.includes(token), false)
  assert.equal(output.includes(SECRET), false)
  assert.equal(output.includes(BASE_ENV.CF_D1_BOOTSTRAP_IDENTITY_EMAIL), false)
})

test("local JWT generation validates required env and TTL fail-closed", async () => {
  await assert.rejects(() => generateLocalJwt({ ...BASE_ENV, JWT_AUTH_SECRET: "short" }, { ttlSeconds: 3600 }), /JWT_AUTH_SECRET/)
  await assert.rejects(() => generateLocalJwt({ ...BASE_ENV, CF_D1_BOOTSTRAP_IDENTITY_EMAIL: "" }, { ttlSeconds: 3600 }), /CF_D1_BOOTSTRAP_IDENTITY_EMAIL/)
  await assert.rejects(() => generateLocalJwt(BASE_ENV, { ttlSeconds: 0 }), /LOCAL_JWT_TTL_SECONDS/)
  await assert.rejects(() => generateLocalJwt(BASE_ENV, { ttlSeconds: 90_000 }), /LOCAL_JWT_TTL_SECONDS/)
})
