import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { listFiles } from "../scripts/lib/typescriptModuleGraph.mjs"
import { NoopProductionAuthAdapter } from "../app/lib/application/auth/noopProductionAuthAdapter.ts"
import { resolveAuthAdapter } from "../app/lib/application/auth/resolveAuthAdapter.ts"
import type { AuthRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { POST as toolsPost } from "../app/api/workunit/tools/route.ts"
import { POST as previewPost } from "../app/api/workunit/[id]/action-preview/route.ts"
import { POST as approvalPost } from "../app/api/workunit/[id]/approval/route.ts"
import { POST as feedbackPost } from "../app/api/workunit/[id]/feedback/route.ts"
import { POST as dryRunPost } from "../app/api/workunit/[id]/execution/dry-run/route.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import nextConfig from "../next.config.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const contractPath = path.join(rootDir, "tests/fixtures/architecture/security-surface.v1.json")
const context = { params: Promise.resolve({ id: "wu-security-ratchet" }) }
const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"] as const
const SAFE_METHODS = new Set<HttpMethod>(["GET", "HEAD", "OPTIONS"])
const UNSAFE_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"])
const DEFAULT_NEXT_EXTENSIONS = ["js", "jsx", "ts", "tsx"] as const

type HttpMethod = typeof HTTP_METHODS[number]
type RouteSurface = {
  key: string
  file: string
  method: HttpMethod
  handlerHash: string
  routeHash: string
  callNames: string[]
}
type SecuritySurfaceContract = {
  sourceSha: string
  sourceShaRole: "refactor_base_only_not_tree_attestation"
  safeHandlers: Array<Pick<RouteSurface, "key" | "handlerHash" | "routeHash">>
  reviewedStateChangingSafeHandlers: Array<{ key: string; evidenceCalls: string[] }>
}
type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> }

const unsafeHandlers = [
  { key: "app/api/workunit/tools/route.ts#POST", method: "POST", url: "/api/workunit/tools", invoke: (request: Request) => toolsPost(request) },
  { key: "app/api/workunit/[id]/action-preview/route.ts#POST", method: "POST", url: "/api/workunit/wu-security-ratchet/action-preview", invoke: (request: Request) => previewPost(request, context) },
  { key: "app/api/workunit/[id]/approval/route.ts#POST", method: "POST", url: "/api/workunit/wu-security-ratchet/approval", invoke: (request: Request) => approvalPost(request, context) },
  { key: "app/api/workunit/[id]/feedback/route.ts#POST", method: "POST", url: "/api/workunit/wu-security-ratchet/feedback", invoke: (request: Request) => feedbackPost(request, context) },
  { key: "app/api/workunit/[id]/execution/dry-run/route.ts#POST", method: "POST", url: "/api/workunit/wu-security-ratchet/execution/dry-run", invoke: (request: Request) => dryRunPost(request, context) },
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

  const reviewedKeys = contract.reviewedStateChangingSafeHandlers.map((item) => item.key).sort()
  assert.deepEqual(reviewedKeys, [
    "app/api/integrations/status/route.ts#GET",
    "app/api/workunit/inbox/route.ts#GET",
  ])
  for (const exception of contract.reviewedStateChangingSafeHandlers) {
    const handler = safeHandlers.find((item) => item.key === exception.key)
    assert.ok(handler, `reviewed safe-method exception is missing: ${exception.key}`)
    for (const call of exception.evidenceCalls) assert.ok(handler.callNames.includes(call), `${exception.key}: missing ${call}`)
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

async function scanRouteSurface(): Promise<RouteSurface[]> {
  const files = (await listFiles(path.join(rootDir, "app/api"))).filter(isNextRouteFile)
  const surfaces = (await Promise.all(files.map(async (file) => {
    const relative = path.relative(rootDir, file).split(path.sep).join("/")
    return extractRouteExports(relative, await readFile(file, "utf8"))
  }))).flat().sort((left, right) => left.key.localeCompare(right.key))
  assert.equal(new Set(surfaces.map((item) => item.key)).size, surfaces.length, "duplicate HTTP method export")
  return surfaces
}

// AST discovery avoids declaration-spelling blind spots in the security inventory.
function extractRouteExports(file: string, source: string): RouteSurface[] {
  const sourceFile = parseSource(file, source)
  const routeHash = hash(source.replace(/\r\n/g, "\n"))
  const surfaces: RouteSurface[] = []
  const add = (name: string, node: ts.Node) => {
    const method = HTTP_METHODS.find((candidate) => candidate === name)
    if (!method) return
    surfaces.push({
      key: `${file}#${method}`,
      file,
      method,
      handlerHash: hash(ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, sourceFile)),
      routeHash,
      callNames: collectCallNames(node),
    })
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasExport(statement) && !hasDefault(statement) && statement.name) add(statement.name.text, statement)
    if (ts.isVariableStatement(statement) && hasExport(statement)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) add(declaration.name.text, statement)
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) throw new Error(`export * is forbidden in route handler: ${file}`)
      if (!statement.isTypeOnly && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) if (!element.isTypeOnly) add(element.name.text, statement)
      }
    }
    if (ts.isExportAssignment(statement) && statement.isExportEquals) throw new Error(`CommonJS route exports are forbidden: ${file}`)
    if (isCommonJsExport(statement, sourceFile)) throw new Error(`CommonJS route exports are forbidden: ${file}`)
  }
  return surfaces
}

function parseSource(file: string, source: string): ts.SourceFile {
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const diagnostics = (parsed as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  if (diagnostics.length > 0) {
    throw new Error(`Unable to parse ${file}: ${diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("; ")}`)
  }
  return parsed
}

function hasExport(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
}

function hasDefault(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false)
}

function isCommonJsExport(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression)) return false
  if (node.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false
  return /^(?:module\.)?exports(?:\.|\[|$)/.test(node.expression.left.getText(sourceFile))
}

function collectCallNames(node: ts.Node): string[] {
  const names = new Set<string>()
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) {
      if (ts.isIdentifier(child.expression)) names.add(child.expression.text)
      else if (ts.isPropertyAccessExpression(child.expression)) names.add(child.expression.name.text)
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return [...names].sort()
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
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: UNSAFE_METHODS.has(method) ? "{}" : undefined,
  })
}

function isNextRouteFile(file: string): boolean {
  const extensions = nextConfig.pageExtensions ?? DEFAULT_NEXT_EXTENSIONS
  return extensions.some((extension) => path.basename(file) === `route.${extension.replace(/^\./, "")}`)
}

function isCodeFile(file: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(file)
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function cloneHeaderRules(rules: readonly HeaderRule[]): HeaderRule[] {
  return rules.map((rule) => ({ source: rule.source, headers: rule.headers.map((header) => ({ ...header })) }))
}
