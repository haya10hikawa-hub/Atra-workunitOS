import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { listFiles } from "../scripts/lib/typescriptModuleGraph.mjs"
// The single shared route/AST scanner. `safeMethodWriteInvariant` consumes the
// same module, so the two suites cannot silently disagree; each keeps its own
// positive controls so a helper defect is caught from either side.
import {
  DEFAULT_NEXT_EXTENSIONS,
  HTTP_METHODS,
  SAFE_METHODS,
  UNSAFE_METHODS,
  extractRouteExports,
  isNextRouteFile,
  parseSource,
  scanRouteExports,
  type HttpMethod,
  type RouteExport,
} from "./helpers/routeSurface.ts"
import { NoopProductionAuthAdapter } from "../app/lib/application/auth/noopProductionAuthAdapter.ts"
import { resolveAuthAdapter } from "../app/lib/application/auth/resolveAuthAdapter.ts"
import type { AuthRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { POST as toolsPost } from "../app/api/workunit/tools/route.ts"
import { POST as previewPost } from "../app/api/workunit/[id]/action-preview/route.ts"
import { POST as approvalPost } from "../app/api/workunit/[id]/approval/route.ts"
import { POST as feedbackPost } from "../app/api/workunit/[id]/feedback/route.ts"
import { POST as dryRunPost } from "../app/api/workunit/[id]/execution/dry-run/route.ts"
import { POST as inboxRefreshPost } from "../app/api/workunit/inbox/refresh/route.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import nextConfig from "../next.config.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const contractPath = path.join(rootDir, "tests/fixtures/architecture/security-surface.v1.json")
const context = { params: Promise.resolve({ id: "wu-security-ratchet" }) }
type SecuritySurfaceContract = {
  sourceSha: string
  sourceShaRole: "refactor_base_only_not_tree_attestation"
  safeHandlers: Array<Pick<RouteExport, "key" | "handlerHash" | "routeHash">>
  reviewedStateChangingSafeHandlers: Array<{ key: string; evidenceCalls: string[] }>
}
type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> }

const unsafeHandlers = [
  { key: "app/api/workunit/tools/route.ts#POST", method: "POST", url: "/api/workunit/tools", invoke: (request: Request) => toolsPost(request) },
  { key: "app/api/workunit/[id]/action-preview/route.ts#POST", method: "POST", url: "/api/workunit/wu-security-ratchet/action-preview", invoke: (request: Request) => previewPost(request, context) },
  { key: "app/api/workunit/[id]/approval/route.ts#POST", method: "POST", url: "/api/workunit/wu-security-ratchet/approval", invoke: (request: Request) => approvalPost(request, context) },
  { key: "app/api/workunit/[id]/feedback/route.ts#POST", method: "POST", url: "/api/workunit/wu-security-ratchet/feedback", invoke: (request: Request) => feedbackPost(request, context) },
  { key: "app/api/workunit/[id]/execution/dry-run/route.ts#POST", method: "POST", url: "/api/workunit/wu-security-ratchet/execution/dry-run", invoke: (request: Request) => dryRunPost(request, context) },
  { key: "app/api/workunit/inbox/refresh/route.ts#POST", method: "POST", url: "/api/workunit/inbox/refresh", invoke: (request: Request) => inboxRefreshPost(request) },
] as const

test("AST route discovery covers every supported export form and fails closed", () => {
  const source = [
    "export function POST() {}",
    "export const PUT = async () => {}",
    "const PATCH = () => {}; export { PATCH }",
    "export { remove as DELETE, read as HEAD } from './handlers'",
    "export async function GET() {}",
    "const OPTIONS = () => {}; export { OPTIONS }",
  ].join("\n")
  assert.deepEqual(extractRouteExports("virtual/route.ts", source).map((item) => item.method).sort(), [...HTTP_METHODS].sort())
  assert.throws(() => extractRouteExports("virtual/route.ts", "export * from './handlers'"), /export \* is forbidden/)
  assert.throws(() => extractRouteExports("virtual/route.ts", "export * as handlers from './handlers'"), /export \* is forbidden/)
  assert.throws(() => extractRouteExports("virtual/route.js", "module.exports = { POST() {} }"), /CommonJS route exports are forbidden/)
  for (const extension of DEFAULT_NEXT_EXTENSIONS) assert.equal(isNextRouteFile(`virtual/route.${extension}`), true)
  const before = extractRouteExports("virtual/route.ts", "export function GET() { return 1 }")[0]
  const after = extractRouteExports("virtual/route.ts", "export function GET() { return 2 }")[0]
  assert.notEqual(before.handlerHash, after.handlerHash)
})

test("every AST-discovered unsafe handler has an executable CSRF probe", async () => {
  const discovered = (await scanRouteSurface()).filter((item) => UNSAFE_METHODS.has(item.method))
  assert.deepEqual(discovered.map((item) => item.key).sort(), unsafeHandlers.map((handler) => handler.key).sort())

  for (const handler of unsafeHandlers) {
    assert.ok(handler.key.endsWith(`#${handler.method}`), `${handler.key}: execution-table method mismatch`)
    const crossSiteResponse = await handler.invoke(routeRequest(handler.url, handler.method, { Origin: "https://cross-site.invalid" }))
    assert.equal(crossSiteResponse.status, 403, `${handler.key}: cross-site`)
    assert.equal((await crossSiteResponse.json()).error, "invalid_origin", handler.key)

    const originLessResponse = await handler.invoke(routeRequest(handler.url, handler.method))
    assert.equal(originLessResponse.status, 403, `${handler.key}: origin-less`)
    assert.equal((await originLessResponse.json()).error, "csrf_failed", handler.key)
  }
})

test("safe-method AST surface and reviewed write exceptions match the pinned snapshot", async () => {
  // This freezes reviewed route/handler text; it does not infer transitive side effects.
  const contract = await readSecurityContract()
  const safeHandlers = (await scanRouteSurface()).filter((item) => SAFE_METHODS.has(item.method))
  const actual = safeHandlers.map(({ key, handlerHash, routeHash }) => ({ key, handlerHash, routeHash }))
  assert.deepEqual(actual, contract.safeHandlers)

  // INV-SAFE-1 (WU-02S): the reviewed-exception ledger is now a PROHIBITION,
  // not an allowance. No safe handler may be excused a durable write, so a
  // non-empty ledger is a failure rather than a documented exception.
  assert.deepEqual(contract.reviewedStateChangingSafeHandlers, [],
    "a state-changing safe handler was re-admitted; INV-SAFE-1 permits no exceptions")

  // And no safe handler may name a durable write call at all.
  const writeCalls = ["upsert", "create", "updateStatus", "markUsed", "claimForRuntime", "append", "recordEvent"]
  for (const handler of safeHandlers) {
    for (const call of writeCalls) {
      assert.equal(handler.callNames.includes(call), false, `${handler.key} names durable write ${call}`)
    }
  }
})

test("auth transport accepts signed Bearer JWT and rejects ambient cookie credentials", async () => {
  const secret = "security-ratchet-secret-at-least-32-bytes"
  const auth: AuthRuntimeConfig = {
    adapter: "jwt",
    isProduction: true,
    jwt: { secret, issuer: "https://issuer.test", audience: "atra-test" },
  }
  const token = await signHs256Jwt({ sub: "security-user", email: "security@example.test", iss: "https://issuer.test", aud: "atra-test" }, secret)
  assert.equal((await resolveAuthAdapter(auth).verify(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }))).ok, true)
  assert.deepEqual(
    await resolveAuthAdapter(auth).verify(new Request("http://localhost", { headers: { Cookie: `session=${token}` } })),
    { ok: false, reason: "missing_credentials" },
  )
  const cookieConfig = { adapter: "cookie", isProduction: true } as unknown as AuthRuntimeConfig
  assert.ok(resolveAuthAdapter(cookieConfig) instanceof NoopProductionAuthAdapter)
  assert.deepEqual(
    await resolveAuthAdapter(cookieConfig).verify(new Request("http://localhost", { headers: { Cookie: `session=${token}` } })),
    { ok: false, reason: "adapter_not_configured" },
  )

  const findings: string[] = []
  const authDir = path.join(rootDir, "app/lib/application/auth")
  for (const file of (await listFiles(authDir)).filter(isCodeFile)) {
    const source = await readFile(file, "utf8")
    findings.push(...findAmbientCookieReads(path.relative(rootDir, file), source))
  }
  assert.deepEqual(findings, [])
})

test("ambient-cookie AST detector has executable positive controls", () => {
  assert.equal(findAmbientCookieReads("cookie.ts", 'request.headers.get("cookie")').length, 1)
  assert.equal(findAmbientCookieReads("cookie.ts", 'import { cookies } from "next/headers"; cookies()').length >= 1, true)
  assert.deepEqual(findAmbientCookieReads("bearer.ts", 'request.headers.get("authorization")'), [])
})

test("security headers apply globally and match the current hardening floor", async () => {
  assert.equal(nextConfig.poweredByHeader, false)
  const rules = (await nextConfig.headers?.()) ?? []
  assertGlobalHeaderFloor(rules as HeaderRule[])
})

test("header-floor checker rejects narrowed scope, broad script/connect sources, and missing permissions", async () => {
  const current = cloneHeaderRules(((await nextConfig.headers?.()) ?? []) as HeaderRule[])
  const narrowed = cloneHeaderRules(current)
  narrowed[0].source = "/admin/:path*"
  assert.throws(() => assertGlobalHeaderFloor(narrowed))

  const broad = cloneHeaderRules(current)
  const broadCsp = broad[0].headers.find((header) => header.key === "Content-Security-Policy")
  assert.ok(broadCsp)
  broadCsp.value = broadCsp.value.replace("script-src 'self' 'unsafe-inline'", "script-src https:").replace("connect-src 'self'", "connect-src https:")
  assert.throws(() => assertGlobalHeaderFloor(broad))

  const override = cloneHeaderRules(current)
  const overrideCsp = override[0].headers.find((header) => header.key === "Content-Security-Policy")
  assert.ok(overrideCsp)
  overrideCsp.value += "; script-src-elem https:"
  assert.throws(() => assertGlobalHeaderFloor(override))

  const missingPermissions = cloneHeaderRules(current)
  const permissions = missingPermissions[0].headers.find((header) => header.key === "Permissions-Policy")
  assert.ok(permissions)
  permissions.value = permissions.value.replace(", payment=(), usb=()", "")
  assert.throws(() => assertGlobalHeaderFloor(missingPermissions))
})

/** Route discovery, delegated to the single shared scanner. */
async function scanRouteSurface(): Promise<RouteExport[]> {
  return scanRouteExports(rootDir, nextConfig.pageExtensions ?? undefined)
}

function findAmbientCookieReads(file: string, source: string): string[] {
  const sourceFile = parseSource(file, source)
  const findings: string[] = []
  const report = (node: ts.Node, kind: string) => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    findings.push(`${file}:${position.line + 1}:${kind}`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === "cookies") report(node, "cookies-call")
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "get") {
        const argument = node.arguments[0]
        if (argument && ts.isStringLiteralLike(argument) && argument.text.toLowerCase() === "cookie") report(node, "cookie-header")
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "cookies") report(node, "cookies-property")
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) && /^(cookie|cookies)$/i.test(node.argumentExpression.text)) report(node, "cookies-element")
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "next/headers") {
      const importsCookies = node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
        && node.importClause.namedBindings.elements.some((element) => element.name.text === "cookies" || element.propertyName?.text === "cookies")
      if (importsCookies) report(node, "cookies-import")
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...new Set(findings)].sort()
}

// Exact global scope prevents later route-specific rules from silently dropping the floor.
function assertGlobalHeaderFloor(rules: readonly HeaderRule[]): void {
  assert.equal(rules.length, 1)
  assert.equal(rules[0]?.source, "/:path*")
  const headers = new Map<string, string>()
  for (const header of rules[0]?.headers ?? []) {
    assert.equal(headers.has(header.key), false, `duplicate security header: ${header.key}`)
    headers.set(header.key, header.value)
  }
  assert.equal(headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains")
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff")
  assert.equal(headers.get("X-Frame-Options"), "DENY")
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")
  assert.equal(headers.get("Cross-Origin-Opener-Policy"), "same-origin")
  assert.equal(headers.get("Cross-Origin-Resource-Policy"), "same-origin")

  const permissions = parsePermissionsPolicy(headers.get("Permissions-Policy") ?? "")
  for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) assert.equal(permissions.get(feature), "()")

  const csp = parseCsp(headers.get("Content-Security-Policy") ?? "")
  assert.deepEqual([...csp.keys()].sort(), [
    "base-uri", "connect-src", "default-src", "font-src", "form-action",
    "frame-ancestors", "img-src", "object-src", "script-src", "style-src", "worker-src",
  ].sort())
  for (const [name, expected] of [
    ["default-src", ["'self'"]], ["base-uri", ["'self'"]], ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]], ["form-action", ["'self'"]], ["connect-src", ["'self'"]],
    ["img-src", ["'self'", "data:", "blob:"]], ["font-src", ["'self'", "data:"]],
    ["style-src", ["'self'", "'unsafe-inline'"]], ["worker-src", ["'self'", "blob:"]],
  ] as const) assert.deepEqual(csp.get(name), expected)
  const scripts = csp.get("script-src") ?? []
  assert.ok(scripts.includes("'self'"), "script-src must retain self")
  for (const token of scripts) assert.ok(isAllowedScriptToken(token), `broad script-src token: ${token}`)
  assert.equal([...csp.values()].flat().includes("'unsafe-eval'"), false)
  assert.equal([...csp.values()].flat().some((token) => token.includes("*")), false)
}

function parseCsp(value: string): Map<string, string[]> {
  const parsed = new Map<string, string[]>()
  for (const raw of value.split(";")) {
    const segment = raw.trim()
    if (!segment) continue
    const [name, ...tokens] = segment.split(/\s+/)
    assert.equal(parsed.has(name), false, `duplicate policy directive: ${name}`)
    parsed.set(name, tokens)
  }
  return parsed
}

function parsePermissionsPolicy(value: string): Map<string, string> {
  const parsed = new Map<string, string>()
  for (const segment of value.split(",")) {
    const match = segment.trim().match(/^([a-z-]+)\s*=\s*(.+)$/i)
    assert.ok(match, `invalid permissions policy segment: ${segment}`)
    assert.equal(parsed.has(match[1]), false, `duplicate permissions policy directive: ${match[1]}`)
    parsed.set(match[1], match[2])
  }
  return parsed
}

function isAllowedScriptToken(token: string): boolean {
  return token === "'self'" || token === "'unsafe-inline'" || token === "'strict-dynamic'" || token === "'report-sample'"
    || /^'nonce-[A-Za-z0-9+/_-]+'$/.test(token) || /^'sha(?:256|384|512)-[A-Za-z0-9+/=_-]+'$/.test(token)
}

async function readSecurityContract(): Promise<SecuritySurfaceContract> {
  const contract = JSON.parse(await readFile(contractPath, "utf8")) as SecuritySurfaceContract
  assert.equal(contract.sourceSha, "066a43c3df07f3da10a2fc93ff7d90157c732114")
  assert.equal(contract.sourceShaRole, "refactor_base_only_not_tree_attestation")
  assert.ok(Array.isArray(contract.safeHandlers) && Array.isArray(contract.reviewedStateChangingSafeHandlers))
  assert.equal(new Set(contract.safeHandlers.map((item) => item.key)).size, contract.safeHandlers.length)
  assert.equal(new Set(contract.reviewedStateChangingSafeHandlers.map((item) => item.key)).size, contract.reviewedStateChangingSafeHandlers.length)
  for (const item of contract.safeHandlers) {
    assert.match(item.handlerHash, /^[a-f0-9]{64}$/)
    assert.match(item.routeHash, /^[a-f0-9]{64}$/)
  }
  return contract
}

function routeRequest(url: string, method: HttpMethod, headers: Record<string, string> = {}): Request {
  // `Host` is supplied explicitly: the mutation guard binds the target host, and
  // Node's `Request` does not populate `Host` from the URL the way a real HTTP
  // server does. A missing Host is itself a rejection (fail closed), so it must
  // be set deliberately whenever the probe is testing something else.
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { host: "localhost:3000", "content-type": "application/json", ...headers },
    body: UNSAFE_METHODS.has(method) ? "{}" : undefined,
  })
}


function isCodeFile(file: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(file)
}


function cloneHeaderRules(rules: readonly HeaderRule[]): HeaderRule[] {
  return rules.map((rule) => ({ source: rule.source, headers: rule.headers.map((header) => ({ ...header })) }))
}

// ─── WU-02S §5: five-route semantic ordering assertion ──────────
//
// This is a SEMANTIC assertion, not a digest pin. It proves the executable
// order actually holds in the source of every pre-existing mutation route,
// which is what makes re-pinning the two route digests elsewhere safe: a digest
// says "these bytes"; this says "these bytes still enforce this order".

type OrderedStep = { readonly label: string; readonly match: RegExp }

const MUTATION_ROUTES = [
  { key: "action-preview", file: "app/api/workunit/[id]/action-preview/route.ts" },
  { key: "approval", file: "app/api/workunit/[id]/approval/route.ts" },
  { key: "feedback", file: "app/api/workunit/[id]/feedback/route.ts" },
  { key: "execution/dry-run", file: "app/api/workunit/[id]/execution/dry-run/route.ts" },
  { key: "tools", file: "app/api/workunit/tools/route.ts" },
] as const

/**
 * `tools` derives its required permission from the request body
 * (`OPERATION_PERMISSION[validated.operation]`), so RBAC there cannot precede
 * the body read. That is a documented, structural exception; the rate limit
 * still precedes both. Every other route must place RBAC before the body read.
 */
const RBAC_BEFORE_BODY_EXEMPT = new Set<string>(["tools"])

test("WU-02S: every pre-existing mutation route enforces the executable order", async () => {
  assert.equal(MUTATION_ROUTES.length, 5, "all five pre-existing mutation routes must be covered")

  for (const route of MUTATION_ROUTES) {
    const absolute = path.join(rootDir, route.file)
    let source: string
    try {
      source = await readFile(absolute, "utf8")
    } catch {
      assert.fail(`${route.key}: route module is missing (${route.file})`)
    }

    const post = extractPostBody(route.key, source)

    const steps: OrderedStep[] = [
      { label: "0 runtime config", match: /resolveValidatedRequestRuntimeConfig\s*\(/ },
      { label: "1-6 request-integrity guard", match: /checkMutationRequestIntegrity\s*\(/ },
      { label: "7 authentication", match: /requireSession\s*\(/ },
      { label: "9 rate limit", match: /checkRateLimit\s*\(/ },
      { label: "11 body read", match: /readGuardedJsonBody\s*\(/ },
    ]

    const positions = new Map<string, number>()
    for (const step of steps) {
      const index = post.search(step.match)
      // FAIL CLOSED: an expected call that cannot be resolved is a failure, not
      // a skipped assertion.
      assert.notEqual(index, -1, `${route.key}: cannot resolve step "${step.label}"`)
      positions.set(step.label, index)
    }

    const ordered = steps.map((s) => s.label)
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1]
      const current = ordered[i]
      assert.ok(
        positions.get(previous)! < positions.get(current)!,
        `${route.key}: "${previous}" must precede "${current}"`,
      )
    }

    // 8 tenant authority precedes 9 rate limit, wherever the route resolves it.
    // `tools` resolves repositories lazily on the paths that need them, so its
    // tenant authority IS the verified session; the session check above covers it.
    const tenantIndex = post.search(/resolveRouteRepositories\s*\(/)
    if (tenantIndex !== -1 && route.key !== "tools") {
      assert.ok(tenantIndex < positions.get("9 rate limit")!,
        `${route.key}: tenant authority must precede rate limiting`)
    }

    // 10 RBAC precedes 11 body read (except the documented `tools` exception).
    const rbacIndex = findRbacIndex(post)
    assert.notEqual(rbacIndex, -1, `${route.key}: cannot resolve the route RBAC check`)
    assert.ok(positions.get("9 rate limit")! < rbacIndex, `${route.key}: rate limiting must precede route RBAC`)
    if (!RBAC_BEFORE_BODY_EXEMPT.has(route.key)) {
      assert.ok(rbacIndex < positions.get("11 body read")!,
        `${route.key}: route RBAC must precede the body read`)
    }

    // No repository mutation, provider operation or external action may appear
    // before integrity, authentication, tenant authority and RBAC have passed.
    const gateEnd = Math.max(positions.get("1-6 request-integrity guard")!, positions.get("7 authentication")!, rbacIndex)
    const beforeGates = post.slice(0, gateEnd)
    for (const forbidden of [
      /\.\s*upsert\s*\(/, /\.\s*create\s*\(/, /\.\s*updateStatus\s*\(/, /\.\s*markUsed\s*\(/,
      /\.\s*claimForRuntime\s*\(/, /\.\s*append\s*\(/, /\.\s*recordEvent\s*\(/,
      /\bfetch\s*\(/, /runToolBackendRequest\s*\(/, /authorizeRuntimeCommand\s*\(/,
    ]) {
      assert.equal(forbidden.test(beforeGates), false,
        `${route.key}: ${forbidden} occurs before the authorization gates complete`)
    }
  }
})

test("WU-02S: the ordering assertion is non-vacuous — a reversed pair is detected", () => {
  // Positive controls for the machinery the ordering test relies on. A reversed
  // guard/session pair must be observable, and a missing call must fail closed.
  const reversed = [
    "export async function POST(request: Request) {",
    "  const s = await requireSession(request, runtime)",
    "  const g = checkMutationRequestIntegrity(request, policy)",
    "  return s && g",
    "}",
  ].join("\n")
  const body = extractPostBody("virtual", reversed)
  assert.ok(body.search(/requireSession\s*\(/) < body.search(/checkMutationRequestIntegrity\s*\(/),
    "the probe must be able to observe a reversed pair")

  const missing = extractPostBody("virtual", "export async function POST() { return 1 }")
  assert.equal(missing.search(/checkMutationRequestIntegrity\s*\(/), -1,
    "an absent call must be reported as unresolved, never silently skipped")

  assert.notEqual(findRbacIndex("if (!canCreatePreview(session)) return x"), -1)
  assert.equal(findRbacIndex("return 1"), -1)
})

/** Extract the POST handler body; throws when it cannot be located. */
function extractPostBody(label: string, source: string): string {
  const start = source.search(/export\s+(?:async\s+)?function\s+POST\s*\(/)
  assert.notEqual(start, -1, `${label}: no exported POST handler found`)
  return source.slice(start)
}

/** Locate the route-specific RBAC check, whichever helper the route uses. */
function findRbacIndex(body: string): number {
  const patterns = [
    /!\s*canCreatePreview\s*\(/, /!\s*canApprovePreview\s*\(/, /!\s*canCreateFeedback\s*\(/,
    /!\s*canRefreshWorkUnitInbox\s*\(/, /!\s*canExecuteExternalAction\s*\(/,
    /!\s*hasPermission\s*\(\s*session\s*,\s*requiredPermission\s*\)/,
  ]
  const found = patterns.map((p) => body.search(p)).filter((i) => i !== -1)
  return found.length === 0 ? -1 : Math.min(...found)
}
