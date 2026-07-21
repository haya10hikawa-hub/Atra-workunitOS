/**
 * CSRF origin authority — request-scoped, injected (Issue #176).
 *
 * Replaces the old module-load defect pin. `validateCsrfOrigin` now reads NO
 * environment variable and holds NO module-scope configuration; the allowlist is
 * injected per call from the request-scoped validated runtime config. The route
 * table proves the five POST routes enforce the request-scoped allowlist and that
 * two request-scoped environments cannot observe each other's allowlist.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { validateCsrfOrigin } from "../app/lib/security/csrfProtection.ts"
import { runWithInjectedRuntimeEnv } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import { POST as toolsPost } from "../app/api/workunit/tools/route.ts"
import { POST as previewPost } from "../app/api/workunit/[id]/action-preview/route.ts"
import { POST as approvalPost } from "../app/api/workunit/[id]/approval/route.ts"
import { POST as dryRunPost } from "../app/api/workunit/[id]/execution/dry-run/route.ts"
import { POST as feedbackPost } from "../app/api/workunit/[id]/feedback/route.ts"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ALLOWED = ["https://app.example.com"]

function post(origin: string | null): Request {
  return new Request("http://worker/api", { method: "POST", headers: origin ? { Origin: origin } : {} })
}

// ─── 1. csrfProtection.ts reads no environment ──────────────────
test("csrfProtection.ts contains no process.env / env origin source", () => {
  const src = fs.readFileSync(path.join(repoRoot, "app/lib/security/csrfProtection.ts"), "utf8")
  assert.doesNotMatch(src, /process\.env/)
  assert.doesNotMatch(src, /ALLOWED_ORIGINS/)
  assert.doesNotMatch(src, /NEXT_PUBLIC_APP_URL/)
})

// Source-level: no runtime file under app/lib/security/** reads process.env for
// CSRF origin configuration.
test("no app/lib/security/** file reads process.env for CSRF origin configuration", () => {
  const dir = path.join(repoRoot, "app/lib/security")
  const offenders: string[] = []
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name)
      if (entry.isDirectory()) { walk(p); continue }
      if (!entry.name.endsWith(".ts")) continue
      const src = fs.readFileSync(p, "utf8")
      if (/process\.env[.[]\s*["']?(ALLOWED_ORIGINS|NEXT_PUBLIC_APP_URL)/.test(src)) offenders.push(path.relative(repoRoot, p))
    }
  }
  walk(dir)
  assert.deepEqual(offenders, [])
})

// ─── 2 & 3. one imported module, different injected allowlists ──
test("one imported validator checks different requests against different injected allowlists", () => {
  const a = validateCsrfOrigin(post("https://a.example.com"), ["https://a.example.com"])
  const b = validateCsrfOrigin(post("https://a.example.com"), ["https://b.example.com"])
  assert.equal(a.ok, true)
  assert.equal(b.ok, false)
})

test("configuration is not frozen at module load (later calls see later allowlists)", () => {
  const first = validateCsrfOrigin(post("https://later.example.com"), [])
  assert.equal(first.ok, false)
  const second = validateCsrfOrigin(post("https://later.example.com"), ["https://later.example.com"])
  assert.equal(second.ok, true)
})

// ─── 4-10. validator behavior ───────────────────────────────────
test("allowed origin succeeds", () => { assert.equal(validateCsrfOrigin(post("https://app.example.com"), ALLOWED).ok, true) })
test("disallowed origin fails", () => {
  const r = validateCsrfOrigin(post("https://evil.example.com"), ALLOWED)
  assert.deepEqual(r, { ok: false, reason: "invalid_origin" })
})
test("port mismatch fails (ports are significant)", () => {
  assert.equal(validateCsrfOrigin(post("https://app.example.com:8443"), ALLOWED).ok, false)
})
test("malformed origin fails", () => {
  assert.deepEqual(validateCsrfOrigin(post("not a url"), ALLOWED), { ok: false, reason: "invalid_origin" })
})
test("missing Origin and Referer fails", () => {
  assert.deepEqual(validateCsrfOrigin(post(null), ALLOWED), { ok: false, reason: "csrf_failed" })
})
test("allowed Referer with a path succeeds", () => {
  const req = new Request("http://worker/api", { method: "POST", headers: { Referer: "https://app.example.com/deep/path?x=1" } })
  assert.equal(validateCsrfOrigin(req, ALLOWED).ok, true)
})
test("empty allowlist fails closed", () => {
  assert.deepEqual(validateCsrfOrigin(post("https://app.example.com"), []), { ok: false, reason: "invalid_origin" })
})

// ─── route table: five POST routes enforce the request-scoped allowlist ──

const fakeDb = { prepare: () => ({}) } as unknown
function cloudflareEnv(allowedOrigins: string): AppEnv {
  return {
    CONTROL_DB: fakeDb, TENANT_DB_DEFAULT: fakeDb,
    EXTERNAL_ACTIONS_ENABLED: "false", ALLOW_LEGACY_INGEST_FALLBACK: "false",
    ALLOWED_ORIGINS: allowedOrigins,
  } as unknown as AppEnv
}
function routePost(handler: unknown): (req: Request) => Promise<Response> {
  // Both handler shapes: (request) and (request, { params }).
  return (req: Request) => (handler as (r: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>)(req, { params: Promise.resolve({ id: "wu-1" }) })
}
const ROUTES: Array<[string, (req: Request) => Promise<Response>]> = [
  ["tools", routePost(toolsPost)],
  ["action-preview", routePost(previewPost)],
  ["approval", routePost(approvalPost)],
  ["execution/dry-run", routePost(dryRunPost)],
  ["feedback", routePost(feedbackPost)],
]

test("each POST route rejects a disallowed origin and lets an allowed origin past the CSRF gate", async () => {
  const env = cloudflareEnv("https://allowed.example.com")
  for (const [name, handler] of ROUTES) {
    const disallowed = await runWithInjectedRuntimeEnv(env, () => handler(post("https://evil.example.com")), { production: true })
    assert.equal(disallowed.status, 403, `${name}: disallowed origin must be 403`)
    const disallowedBody = await disallowed.json() as { error?: string }
    assert.equal(disallowedBody.error, "invalid_origin", `${name}: disallowed origin must be invalid_origin`)

    const allowed = await runWithInjectedRuntimeEnv(env, () => handler(post("https://allowed.example.com")), { production: true })
    // Allowed origin must PASS CSRF and reach the next guard (session → 401 with
    // no auth adapter configured). It must NOT be a CSRF invalid_origin.
    assert.notEqual(allowed.status, 403, `${name}: allowed origin must pass CSRF`)
    const allowedBody = await allowed.json().catch(() => ({})) as { error?: string }
    assert.notEqual(allowedBody.error, "invalid_origin", `${name}: allowed origin must not be invalid_origin`)
  }
})

test("two request-scoped environments cannot observe each other's allowlists", async () => {
  const envA = cloudflareEnv("https://a.example.com")
  const envB = cloudflareEnv("https://b.example.com")
  const handler = routePost(toolsPost)
  // Concurrent, isolated request scopes: origin-a is allowed only in env A.
  const [aInA, aInB] = await Promise.all([
    runWithInjectedRuntimeEnv(envA, () => handler(post("https://a.example.com")), { production: true }),
    runWithInjectedRuntimeEnv(envB, () => handler(post("https://a.example.com")), { production: true }),
  ])
  assert.notEqual(aInA.status, 403, "origin-a must pass CSRF in env A")
  assert.equal(aInB.status, 403, "origin-a must be rejected in env B")
})
