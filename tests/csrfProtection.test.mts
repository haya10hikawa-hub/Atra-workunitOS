import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { validateCsrfOrigin } from "../app/lib/security/csrfProtection.ts"

const SRC = readFileSync(join(import.meta.dirname!, "../app/lib/security/csrfProtection.ts"), "utf-8")

// The trusted origin set is now an explicit PARAMETER. The module reads no
// environment of any kind, so a test supplies the allowlist the way a route
// does — from a validated runtime-config projection.
const TRUSTED = ["http://localhost:3000"] as const

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000", { headers })
}

// ─── Same-origin / allowed ────────────────────────────────────

test("same-origin request is allowed", () => {
  assert.equal(validateCsrfOrigin(request({ Origin: "http://localhost:3000" }), TRUSTED).ok, true)
})

test("a configured allowed origin is allowed", () => {
  const trusted = ["https://app.example.com", "http://localhost:3000"]
  assert.equal(validateCsrfOrigin(request({ Origin: "https://app.example.com" }), trusted).ok, true)
})

test("Referer fallback works when Origin missing", () => {
  assert.equal(validateCsrfOrigin(request({ Referer: "http://localhost:3000/api/workunit/tools" }), TRUSTED).ok, true)
})

// ─── Blocked ───────────────────────────────────────────────────

function expectBlocked(headers: Record<string, string>, reason: "csrf_failed" | "invalid_origin", label: string) {
  const result = validateCsrfOrigin(request(headers), TRUSTED)
  assert.equal(result.ok, false, label)
  if (!result.ok) assert.equal(result.reason, reason, label)
}

test("cross-site Origin is blocked", () => {
  expectBlocked({ Origin: "https://evil.com" }, "invalid_origin", "cross-site")
})

test("allowed-origin prefix and suffix confusion is blocked", () => {
  expectBlocked({ Origin: "http://localhost:3000.evil.test" }, "invalid_origin", "suffix lookalike")
  expectBlocked({ Origin: "http://evil-localhost:3000" }, "invalid_origin", "prefix lookalike")
})

test("a suffix lookalike that genuinely parses is blocked by exact equality, not containment", () => {
  // `http://localhost:3000.evil.test` does not parse (`:3000.evil.test` is not a
  // valid port), so it is rejected before any comparison. A PORT-FREE trusted
  // origin is required to exercise the comparison itself.
  const trusted = ["https://app.example.com"]
  assert.equal(validateCsrfOrigin(request({ Origin: "https://app.example.com" }), trusted).ok, true)
  for (const origin of ["https://app.example.com.evil.test", "https://app.example.com.evil.test:443", "https://notapp.example.com"]) {
    assert.notEqual((() => { try { return new URL(origin).origin } catch { return null } })(), null,
      `${origin} must actually parse, or it tests nothing`)
    const result = validateCsrfOrigin(request({ Origin: origin }), trusted)
    assert.equal(result.ok, false, origin)
    if (!result.ok) assert.equal(result.reason, "invalid_origin", origin)
  }
})

test("scheme and port mismatches are blocked", () => {
  expectBlocked({ Origin: "https://localhost:3000" }, "invalid_origin", "scheme mismatch")
  expectBlocked({ Origin: "http://localhost:8443" }, "invalid_origin", "port mismatch")
})

test("malformed Origin is blocked", () => {
  expectBlocked({ Origin: "not-a-url!!!" }, "invalid_origin", "malformed")
})

test("the opaque origin `null` is rejected explicitly, as policy", () => {
  // Previously this was right only by accident of a parse failure. It is now a
  // stated rule, checked before parsing.
  expectBlocked({ Origin: "null" }, "invalid_origin", "opaque origin")
  expectBlocked({ Origin: "NULL" }, "invalid_origin", "opaque origin, uppercase")
})

test("duplicate Origin headers are rejected", () => {
  // Headers.get joins repeated values with ", ", which cannot parse as an origin.
  expectBlocked({ Origin: "http://localhost:3000, http://localhost:3000" }, "invalid_origin", "duplicate Origin")
})

test("the userinfo form cannot impersonate a trusted origin", () => {
  // new URL("http://localhost:3000@evil.test").host === "evil.test"
  expectBlocked({ Origin: "http://localhost:3000@evil.test" }, "invalid_origin", "userinfo")
})

test("a present but invalid Origin is never rescued by a trusted Referer", () => {
  expectBlocked(
    { Origin: "https://evil.test", Referer: "http://localhost:3000/app" },
    "invalid_origin",
    "no Referer fallback when Origin is present",
  )
})

test("a cross-site Referer with no Origin is blocked", () => {
  expectBlocked({ Referer: "https://evil.test/app" }, "invalid_origin", "cross-site referer")
})

test("missing Origin and Referer is blocked", () => {
  expectBlocked({}, "csrf_failed", "both absent")
})

test("missing Origin and Referer is blocked even with a valid Bearer token", () => {
  // Owner decision D3: a non-browser client must send a conforming Origin.
  expectBlocked({ Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig" }, "csrf_failed", "bearer without Origin")
})

test("an empty trusted-origin set rejects everything (fail closed)", () => {
  const result = validateCsrfOrigin(request({ Origin: "http://localhost:3000" }), [])
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "invalid_origin")
})

test("a malformed entry in the trusted set never matches", () => {
  const result = validateCsrfOrigin(request({ Origin: "http://localhost:3000" }), ["::::not-a-url"])
  assert.equal(result.ok, false)
})

// ─── Source scans ─────────────────────────────────────────────

test("source has no fetch", () => { assert.equal(SRC.includes("fetch("), false) })

test("source reads no ambient environment at all", () => {
  // The module-scope allowlist that used to live here was the reason the guard
  // could not be configured in production under Cloudflare Workers. There must
  // now be ZERO ambient-environment reads — module-scope or per-call.
  assert.equal(/process\s*\.\s*env\s*[.[]/.test(SRC), false, "csrfProtection.ts must not read process.env")
  assert.equal(SRC.includes("NEXT_PUBLIC_APP_URL"), false, "NEXT_PUBLIC_APP_URL must not be a server authority")
})

test("trusted origins are a required parameter, not module state", () => {
  assert.equal(/export function validateCsrfOrigin\(\s*request: Request,\s*trustedOrigins: readonly string\[\],\s*\)/.test(SRC), true)
  assert.equal(/const ALLOWED_ORIGINS\s*=/.test(SRC), false, "no module-scope allowlist may exist")
})

test("no wildcard, suffix or prefix matching appears in the source", () => {
  for (const pattern of ["endsWith(", "startsWith(", ".includes(allowed", "'*'", '"*"']) {
    assert.equal(SRC.includes(pattern), false, `csrfProtection.ts must not use ${pattern}`)
  }
})

test("source has no API key patterns", () => {
  for (const p of ["sk-", "API_KEY", "TOKEN", "SECRET"]) assert.equal(SRC.includes(p), false)
})
