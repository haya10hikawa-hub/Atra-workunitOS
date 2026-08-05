/**
 * WU-02S — HTTP mutation guard (T18–T29).
 *
 * Unit-level coverage of the header-only request-integrity guard plus the two
 * request-scoped origin-authority properties. Every case constructs a real
 * `Request`; there is no test-only bypass in the guard and none is used here.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import {
  checkMutationRequestIntegrity,
  isAcceptedJsonContentType,
  resolveTrustedTargetHosts,
  type MutationGuardPolicy,
} from "../app/lib/security/httpMutationGuard.ts"
import { resolveValidatedRequestRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { listFiles } from "../scripts/lib/typescriptModuleGraph.mjs"
import type { AppEnv } from "../app/types/cloudflare-env.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const TRUSTED = ["http://localhost:3000"] as const
const POLICY: MutationGuardPolicy = { method: "POST", trustedOrigins: TRUSTED, maxBytes: 2048 }

function guardRequest(headers: Record<string, string | undefined> = {}, init: RequestInit = {}): Request {
  const merged: Record<string, string> = {
    Host: "localhost:3000",
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return new Request("http://localhost:3000/api/workunit/inbox/refresh", {
    method: "POST",
    headers: merged,
    body: "{}",
    ...init,
  })
}

/** A Request whose body stream records whether anything ever pulled from it. */
function recordingBodyRequest(headers: Record<string, string | undefined> = {}): { request: Request; wasRead: () => boolean } {
  let pulled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled = true
      controller.enqueue(new TextEncoder().encode("{}"))
      controller.close()
    },
  })
  const merged: Record<string, string> = {
    Host: "localhost:3000",
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  const request = new Request("http://localhost:3000/api/workunit/inbox/refresh", {
    method: "POST",
    headers: merged,
    body: stream,
    // @ts-expect-error duplex is required by undici for a stream body and is
    // absent from the DOM RequestInit lib type.
    duplex: "half",
  })
  return { request, wasRead: () => pulled || request.bodyUsed }
}

function expectReject(result: ReturnType<typeof checkMutationRequestIntegrity>, category: string, error: string, status: number, label: string) {
  assert.equal(result.ok, false, `${label}: expected rejection`)
  if (result.ok) return
  assert.equal(result.category, category, label)
  assert.equal(result.error, error, label)
  assert.equal(result.status, status, label)
}

// ─── T18 — method authority (C4) ────────────────────────────────

test("T18: the refresh route exports POST only, so the framework dispatcher owns unsupported-method rejection", async () => {
  const source = await readFile(path.join(rootDir, "app/api/workunit/inbox/refresh/route.ts"), "utf8")
  const parsed = ts.createSourceFile("refresh/route.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const exported: string[] = []
  for (const statement of parsed.statements) {
    const isExported = ts.canHaveModifiers(statement)
      && (ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false)
    if (!isExported) continue
    if (ts.isFunctionDeclaration(statement) && statement.name) exported.push(statement.name.text)
    if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name)) exported.push(d.name.text)
    }
  }
  const methodExports = exported.filter((name) => ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(name))
  // Non-vacuity: the scan really found the handler.
  assert.deepEqual(methodExports, ["POST"])
  // Therefore, for an ACTUAL HTTP request with an unsupported method, the Next.js
  // App Router dispatcher rejects with 405 BEFORE this handler is entered, and
  // that response is NOT the repository's safeError envelope. It is not claimed
  // that every unsupported network request executes the guard.
})

test("T18: DIRECT invocation of the handler with a non-POST Request is rejected 405 invalid_request by the guard (defense in depth)", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"] as const) {
    const body = method === "GET" || method === "HEAD" ? undefined : "{}"
    const request = new Request("http://localhost:3000/api/workunit/inbox/refresh", {
      method,
      headers: { Host: "localhost:3000", Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body,
    })
    expectReject(checkMutationRequestIntegrity(request, POLICY), "method_not_allowed", "invalid_request", 405, method)
  }
  // Positive control: POST passes phase 1.
  assert.equal(checkMutationRequestIntegrity(guardRequest(), POLICY).ok, true)
})

// ─── T19–T20 — Host policy ──────────────────────────────────────

test("T19: Host binding is exact — missing, untrusted, lookalike, port-mismatched, trailing-dot, duplicate and malformed all reject", () => {
  expectReject(checkMutationRequestIntegrity(guardRequest({ Host: undefined }), POLICY), "host_missing", "csrf_failed", 403, "missing")
  for (const host of [
    "evil.test",
    "localhost:3000.evil.test",
    "evil-localhost:3000",
    "localhost:8443",
    "localhost",
    "localhost:3000.",
    "localhost:3000, localhost:3000",
    "loc alhost:3000",
    "user@localhost:3000",
    "localhost:3000/path",
  ]) {
    const result = checkMutationRequestIntegrity(guardRequest({ Host: host }), POLICY)
    assert.equal(result.ok, false, `Host "${host}" must reject`)
    if (!result.ok) {
      assert.ok(result.category === "host_missing" || result.category === "host_untrusted", `Host "${host}": ${result.category}`)
      assert.equal(result.status, 403, `Host "${host}"`)
      assert.equal(result.error, "csrf_failed", `Host "${host}"`)
    }
  }
  // Positive control: the trusted host passes.
  assert.equal(checkMutationRequestIntegrity(guardRequest({ Host: "localhost:3000" }), POLICY).ok, true)
  // The trusted host set derives from the SAME trustedOrigins policy.
  assert.deepEqual([...resolveTrustedTargetHosts(TRUSTED)], ["localhost:3000"])
})

test("T20: forwarded host headers are never trusted, and no source file under app/ reads one", async () => {
  // An attacker-supplied forwarded header cannot rescue an untrusted Host.
  expectReject(
    checkMutationRequestIntegrity(guardRequest({ Host: "evil.test", "X-Forwarded-Host": "localhost:3000" }), POLICY),
    "host_untrusted", "csrf_failed", 403, "x-forwarded-host",
  )
  expectReject(
    checkMutationRequestIntegrity(guardRequest({ Host: "evil.test", Forwarded: "host=localhost:3000" }), POLICY),
    "host_untrusted", "csrf_failed", 403, "forwarded",
  )

  const forbidden = ["x-forwarded-host", "forwarded", "x-forwarded-server"]
  const files = (await listFiles(path.join(rootDir, "app"))).filter((f: string) => /\.[cm]?[jt]sx?$/.test(f))
  assert.ok(files.length > 0, "app/ source scan must not be vacuous")
  const offenders: string[] = []
  for (const file of files) {
    const source = (await readFile(file, "utf8")).toLowerCase()
    for (const header of forbidden) {
      if (source.includes(`"${header}"`) || source.includes(`'${header}'`)) {
        offenders.push(`${path.relative(rootDir, file)}:${header}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})

// ─── T21–T23 — Origin / Referer policy ──────────────────────────

test("T21: a suffix lookalike that genuinely PARSES is rejected — exact equality, never containment", () => {
  // A port-bearing trusted origin cannot express this case: appending a suffix
  // to `http://localhost:3000` produces `:3000.evil.test`, which is not a valid
  // port, so `new URL` throws and the vector is rejected by PARSE FAILURE
  // rather than by the comparison. These vectors use a port-free trusted origin
  // so the comparison itself is what does the work.
  const trusted = ["https://app.example.com"] as const
  const policy: MutationGuardPolicy = { method: "POST", trustedOrigins: trusted, maxBytes: 2048 }
  const req = (origin: string) => new Request("https://app.example.com/api/x", {
    method: "POST",
    headers: { Host: "app.example.com", Origin: origin, "Content-Type": "application/json" },
    body: "{}",
  })
  // Control: the exact origin passes, so the policy is not rejecting everything.
  assert.equal(checkMutationRequestIntegrity(req("https://app.example.com"), policy).ok, true)

  for (const origin of [
    "https://app.example.com.evil.test",   // suffix — `includes` would ACCEPT this
    "https://app.example.com.evil.test:443",
    "https://evil.test",
    "https://notapp.example.com",
    "http://app.example.com",              // scheme mismatch
  ]) {
    const parsed = (() => { try { return new URL(origin).origin } catch { return null } })()
    assert.notEqual(parsed, null, `${origin} must actually parse, or it tests nothing`)
    expectReject(checkMutationRequestIntegrity(req(origin), policy), "origin_untrusted", "invalid_origin", 403, origin)
  }
})

test("T21: Origin comparison is exact — cross-site, suffix, prefix, port, opaque, duplicate and userinfo forms all reject invalid_origin", () => {
  for (const origin of [
    "https://evil.test",
    "http://localhost:3000.evil.test",
    "http://evil-localhost:3000",
    "http://localhost:8443",
    "https://localhost:3000",
    "null",
    "http://localhost:3000, http://localhost:3000",
    "http://localhost:3000@evil.test",
    "not-a-url!!!",
  ]) {
    expectReject(checkMutationRequestIntegrity(guardRequest({ Origin: origin }), POLICY), "origin_untrusted", "invalid_origin", 403, origin)
  }
  assert.equal(checkMutationRequestIntegrity(guardRequest({ Origin: "http://localhost:3000" }), POLICY).ok, true)
})

test("T22: Referer is a fallback only when Origin is absent, and never rescues a present-but-invalid Origin", () => {
  assert.equal(
    checkMutationRequestIntegrity(guardRequest({ Origin: undefined, Referer: "http://localhost:3000/app" }), POLICY).ok,
    true, "absent Origin + same-origin Referer",
  )
  expectReject(
    checkMutationRequestIntegrity(guardRequest({ Origin: undefined, Referer: "https://evil.test/app" }), POLICY),
    "origin_untrusted", "invalid_origin", 403, "absent Origin + cross-site Referer",
  )
  assert.equal(
    checkMutationRequestIntegrity(guardRequest({ Origin: "http://localhost:3000", Referer: "https://evil.test/app" }), POLICY).ok,
    true, "valid Origin wins; Referer ignored",
  )
  expectReject(
    checkMutationRequestIntegrity(guardRequest({ Origin: "https://evil.test", Referer: "http://localhost:3000/app" }), POLICY),
    "origin_untrusted", "invalid_origin", 403, "invalid Origin is NOT rescued by a trusted Referer",
  )
})

test("T23: Origin and Referer both absent reject 403 csrf_failed even with a valid Bearer token", () => {
  const bearer = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"
  expectReject(
    checkMutationRequestIntegrity(guardRequest({ Origin: undefined, Referer: undefined, Authorization: bearer }), POLICY),
    "origin_missing", "csrf_failed", 403, "bearer without Origin",
  )
  // Control: the same Bearer WITH a conforming Origin passes phase 1, proving
  // the rejection is about the Origin and not about the credential.
  assert.equal(checkMutationRequestIntegrity(guardRequest({ Authorization: bearer }), POLICY).ok, true)
})

// ─── T24 — Content-Type policy ──────────────────────────────────

test("T24: only application/json with an optional utf-8 charset is accepted", () => {
  for (const value of ["application/json", "application/json; charset=utf-8", "application/json; charset=UTF-8", "APPLICATION/JSON"]) {
    assert.equal(isAcceptedJsonContentType(value), true, value)
  }
  for (const value of [
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "application/json+x",
    "x/json",
    "application/json; charset=utf-16",
    "application/json; boundary=x",
    "application/json, application/json",
  ]) {
    assert.equal(isAcceptedJsonContentType(value), false, value)
    expectReject(checkMutationRequestIntegrity(guardRequest({ "Content-Type": value }), POLICY), "content_type_invalid", "invalid_request", 400, value)
  }
  assert.equal(isAcceptedJsonContentType(null), false, "missing header")
  expectReject(checkMutationRequestIntegrity(guardRequest({ "Content-Type": undefined }), POLICY), "content_type_invalid", "invalid_request", 400, "missing")

  // `text/plain` is the security-relevant case: it is a CORS-SIMPLE type, so a
  // cross-origin form or fetch can send it with no preflight.
  const plainJson = guardRequest({ "Content-Type": "text/plain" })
  expectReject(checkMutationRequestIntegrity(plainJson, POLICY), "content_type_invalid", "invalid_request", 400, "text/plain carrying valid JSON")
})

// ─── T25 — body-size precheck ───────────────────────────────────

test("T25: an oversized Content-Length is rejected 413 without the body ever being read", () => {
  const probe = recordingBodyRequest({ "Content-Length": String(POLICY.maxBytes + 1) })
  expectReject(checkMutationRequestIntegrity(probe.request, POLICY), "body_size_precheck", "invalid_request", 413, "oversized")
  assert.equal(probe.wasRead(), false, "the body stream must never be consumed by the guard")

  // In-limit passes.
  assert.equal(checkMutationRequestIntegrity(guardRequest({ "Content-Length": "2" }), POLICY).ok, true)
  // Absent Content-Length (chunked) passes phase 1; the streaming cap inside
  // readBoundedJsonObject remains the enforcement.
  assert.equal(checkMutationRequestIntegrity(guardRequest(), POLICY).ok, true)
  // A non-numeric Content-Length is not treated as a size.
  assert.equal(checkMutationRequestIntegrity(guardRequest({ "Content-Length": "abc" }), POLICY).ok, true)
})

// ─── T26 — value-free failures ──────────────────────────────────

test("T26: no guard failure value carries the Origin, Host, body, tenant or category into anything serializable", () => {
  const secret = "s3cr3t-body-fragment"
  const request = new Request("http://localhost:3000/api/workunit/inbox/refresh", {
    method: "POST",
    headers: { Host: "attacker.example", Origin: "https://evil.test", "Content-Type": "application/json", "X-Tenant": "tenant-secret" },
    body: JSON.stringify({ leak: secret }),
  })
  const result = checkMutationRequestIntegrity(request, POLICY)
  assert.equal(result.ok, false)
  if (result.ok) return
  // The wire body is built by safeError(requestId, result.error) — only the code
  // travels. Prove the code carries nothing else.
  const wire = JSON.stringify({ ok: false, requestId: "req:test", error: result.error })
  for (const leak of [secret, "evil.test", "attacker.example", "tenant-secret", result.category]) {
    assert.equal(wire.includes(leak), false, `guard response must not contain ${leak}`)
  }
  assert.deepEqual(Object.keys(JSON.parse(wire)).sort(), ["error", "ok", "requestId"])
})

// ─── T27 — ordering ─────────────────────────────────────────────

test("T27: on any method, Host, Origin or Content-Type failure the request body is never read", () => {
  const cases: Array<[string, Record<string, string | undefined>]> = [
    ["host", { Host: "evil.test" }],
    ["origin", { Origin: "https://evil.test" }],
    ["content-type", { "Content-Type": "text/plain" }],
  ]
  for (const [label, headers] of cases) {
    const probe = recordingBodyRequest(headers)
    assert.equal(checkMutationRequestIntegrity(probe.request, POLICY).ok, false, label)
    assert.equal(probe.wasRead(), false, `${label}: body must not be read`)
  }
  // The guard is synchronous, so it structurally cannot await a body.
  assert.equal(checkMutationRequestIntegrity(guardRequest(), POLICY) instanceof Promise, false)
})

// ─── T28–T29 — request-scoped origin authority ──────────────────

function cloudflareEnv(overrides: Record<string, unknown> = {}): AppEnv {
  const db = { prepare: () => ({}) }
  return {
    CONTROL_DB: db, TENANT_DB_DEFAULT: db,
    PERSISTENCE_MODE: "d1", EXTERNAL_ACTIONS_ENABLED: "false",
    ALLOWED_ORIGINS: "https://app.example.com",
    ...overrides,
  } as unknown as AppEnv
}

test("T28: trusted origins are request-scoped, and neither guard nor CSRF module reads process.env", async () => {
  // Two successive requests carrying DIFFERENT env values see different
  // allowlists within the same module instance.
  const a = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ ALLOWED_ORIGINS: "https://a.example.com" }) })
  const b = resolveValidatedRequestRuntimeConfig({ rawEnv: cloudflareEnv({ ALLOWED_ORIGINS: "https://b.example.com" }) })
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (!a.ok || !b.ok) return
  assert.deepEqual([...a.runtime.security.trustedOrigins], ["https://a.example.com"])
  assert.deepEqual([...b.runtime.security.trustedOrigins], ["https://b.example.com"])

  // The same request is accepted under one allowlist and rejected under the other.
  const request = () => new Request("https://a.example.com/api/workunit/inbox/refresh", {
    method: "POST",
    headers: { Host: "a.example.com", Origin: "https://a.example.com", "Content-Type": "application/json" },
    body: "{}",
  })
  assert.equal(checkMutationRequestIntegrity(request(), { method: "POST", trustedOrigins: a.runtime.security.trustedOrigins, maxBytes: 2048 }).ok, true)
  assert.equal(checkMutationRequestIntegrity(request(), { method: "POST", trustedOrigins: b.runtime.security.trustedOrigins, maxBytes: 2048 }).ok, false)

  // Neither module may read the ambient environment — module-scope OR per-call.
  // This is an AST assertion, not a text scan: per DEV-D a literal-text scan
  // would flag prose in a comment and could not tell a real property access
  // from documentation. Non-vacuity is proved by a positive control below.
  for (const relative of ["app/lib/security/httpMutationGuard.ts", "app/lib/security/csrfProtection.ts"]) {
    const source = await readFile(path.join(rootDir, relative), "utf8")
    assert.ok(source.length > 0, `${relative}: source scan must not be vacuous`)
    assert.deepEqual(findAmbientEnvReads(relative, source), [], `${relative} must contain no ambient env read`)
  }
  // Positive controls: the detector really detects, in both spellings.
  assert.equal(findAmbientEnvReads("probe.ts", "const a = process.env.ALLOWED_ORIGINS").length, 1)
  assert.equal(findAmbientEnvReads("probe.ts", 'const b = process.env["ALLOWED_ORIGINS"]').length, 1)
  // …and does not fire on prose that merely names it.
  assert.deepEqual(findAmbientEnvReads("probe.ts", "// never read process.env here"), [])
})

/** AST detector for `process.env` reads, in dotted and indexed spellings. */
function findAmbientEnvReads(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const findings: string[] = []
  const isProcessEnv = (node: ts.Node): boolean =>
    (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "process" && node.name.text === "env")
    || (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "process"
        && !!node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "env")
  const visit = (node: ts.Node) => {
    if (isProcessEnv(node)) {
      findings.push(`${file}:${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return findings
}

test("T29: production trusted origins fail closed; only local defaults to http://localhost:3000", () => {
  for (const value of [undefined, "", "   ", ",,", "not-a-url", "https://x/path", "https://x/", "*", "https://*.example.com", "example.com"]) {
    const result = resolveValidatedRequestRuntimeConfig({
      rawEnv: cloudflareEnv(value === undefined ? { ALLOWED_ORIGINS: undefined } : { ALLOWED_ORIGINS: value }),
    })
    assert.equal(result.ok, false, `cloudflare ALLOWED_ORIGINS=${JSON.stringify(value)} must fail closed`)
    if (!result.ok) assert.equal(result.error, "malformed_trusted_origins", JSON.stringify(value))
  }
  // Positive control: a well-formed production list resolves, deduplicated and frozen.
  const ok = resolveValidatedRequestRuntimeConfig({
    rawEnv: cloudflareEnv({ ALLOWED_ORIGINS: "https://app.example.com, https://admin.example.com , https://app.example.com" }),
  })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.deepEqual([...ok.runtime.security.trustedOrigins], ["https://app.example.com", "https://admin.example.com"])
    assert.equal(Object.isFrozen(ok.runtime.security.trustedOrigins), true)
  }

  // Local: absent defaults to localhost:3000, malformed still fails closed.
  const localDefault = resolveValidatedRequestRuntimeConfig({ rawEnv: {} as AppEnv, production: false, processEnv: {} })
  assert.equal(localDefault.ok, true)
  if (localDefault.ok) assert.deepEqual([...localDefault.runtime.security.trustedOrigins], ["http://localhost:3000"])
  const localMalformed = resolveValidatedRequestRuntimeConfig({ rawEnv: {} as AppEnv, production: false, processEnv: { ALLOWED_ORIGINS: "not-a-url" } })
  assert.equal(localMalformed.ok, false)
  if (!localMalformed.ok) assert.equal(localMalformed.error, "malformed_trusted_origins")
})
