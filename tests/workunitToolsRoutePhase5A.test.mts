import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Import the route POST handler directly
import { POST } from "../app/api/workunit/tools/route.ts"

const SRC_ROUTE = readFileSync(join(import.meta.dirname!, "../app/api/workunit/tools/route.ts"), "utf-8")
const POST_ROUTE = SRC_ROUTE.slice(SRC_ROUTE.indexOf("export async function POST"))

// ─── CSRF / Origin route-level tests ─────────────────────────

test("cross-site Origin POST is rejected by the route", async () => {
  const req = new Request("http://localhost:3000/api/workunit/tools", {
    method: "POST",
    headers: { Origin: "https://evil.com", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "draft" }),
  })
  const res = await POST(req)
  assert.equal(res.status, 403)
  const body: Record<string, string> = await res.json()
  assert.ok(body.error === "invalid_origin" || body.error === "csrf_failed")
})

test("malformed Origin POST is rejected by the route", async () => {
  const req = new Request("http://localhost:3000/api/workunit/tools", {
    method: "POST",
    headers: { Origin: "!!not-valid!!", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "draft" }),
  })
  const res = await POST(req)
  assert.equal(res.status, 403)
})

test("missing Origin/Referer POST is rejected by the route", async () => {
  const req = new Request("http://localhost:3000/api/workunit/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "draft" }),
  })
  const res = await POST(req)
  assert.equal(res.status, 403)
})

// ─── Source scans on route ───────────────────────────────────

test("route imports CSRF protection", () => {
  assert.ok(SRC_ROUTE.includes("validateCsrfOrigin"))
})

test("route imports rate limit", () => {
  assert.ok(SRC_ROUTE.includes("checkRateLimit"))
})

test("route calls CSRF before session", () => {
  // Match call sites (with open paren), not import statements which appear earlier.
  const csrfIdx = POST_ROUTE.indexOf("validateCsrfOrigin(")
  const sessionIdx = POST_ROUTE.indexOf("requireSession(")
  assert.ok(csrfIdx > 0, "validateCsrfOrigin( call site must exist")
  assert.ok(sessionIdx > 0, "requireSession( call site must exist")
  assert.ok(csrfIdx < sessionIdx, "CSRF must run before session")
})

test("route calls rate limit before RBAC", () => {
  const rateIdx = POST_ROUTE.indexOf("checkRateLimit(")
  const rbacIdx = POST_ROUTE.indexOf("hasPermission(")
  assert.ok(rateIdx > 0 && rbacIdx > 0 && rateIdx < rbacIdx, "Rate limit must run before RBAC")
})

test("route does not trust client-provided tenantId in body", () => {
  assert.equal(SRC_ROUTE.includes("body.tenantId"), false)
})

test("route does not trust client-provided role in body", () => {
  assert.equal(SRC_ROUTE.includes("body.role"), false)
})

// ─── Safe error verification ─────────────────────────────────

test("safe errors in route do not include Authorization", () => {
  // Guard against leaking the HTTP Authorization header or secret material into
  // route logic. Domain identifiers such as `runtimeAuthorization*` (Issue #145)
  // legitimately contain the word "Authorization" as part of a camelCase name and
  // are NOT secrets, so the Authorization check matches the header key at an
  // identifier boundary (e.g. a quoted "Authorization" header) rather than any
  // occurrence embedded in a longer identifier.
  const checks: Array<{ label: string; test: (l: string) => boolean }> = [
    { label: "Authorization", test: (l) => /(?<![A-Za-z])Authorization/.test(l) },
    { label: "Bearer", test: (l) => l.includes("Bearer") },
    { label: "API_KEY", test: (l) => l.includes("API_KEY") },
    { label: "SECRET", test: (l) => l.includes("SECRET") },
    { label: "TOKEN", test: (l) => l.includes("TOKEN") },
    { label: "sk-", test: (l) => l.includes("sk-") },
  ]
  for (const check of checks) {
    const lines = SRC_ROUTE.split("\n").filter((l) => check.test(l) && !l.includes("//") && !l.includes("*"))
    assert.equal(lines.length, 0, `should not contain ${check.label} in route logic`)
  }
})

test("route has safe error responses for CSRF+rate limit", () => {
  // The route forwards csrf.reason (invalid_origin / csrf_failed) dynamically rather
  // than hard-coding the literal. The csrf reason literals live in csrfProtection.ts.
  assert.ok(SRC_ROUTE.includes("csrf.reason"), "route must forward csrf.reason")
  assert.ok(SRC_ROUTE.includes('"rate_limited"'), "route must return rate_limited")
})
