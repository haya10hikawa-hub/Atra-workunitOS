/**
 * Shared AST source-dependency graph + route-handler analysis for the refactor
 * architecture safety gates (Refactor Program, umbrella #182).
 *
 * Test-only. Uses the repository's TypeScript compiler API (and the repository's
 * actual tsconfig for module resolution) so the gates reason about the REAL
 * dependency forms, REAL alias resolution, and REAL handler control flow rather
 * than regex / name / substring matching.
 *
 * Review map (see also the PR "review guide" section):
 *   §A config + module resolution   — loads tsconfig; ts.resolveModuleName
 *   §B dependency edges             — correct import/export type-only semantics
 *   §C reachability                 — value edges only (type-only excluded)
 *   §D layer policies               — exact value + type-only edge exceptions
 *   §E route model                  — canonical guard identity, effect sinks,
 *                                      unconditional-dominance, route coverage
 *   §F domain env authority         — AST `process` symbol detection
 */

import ts from "typescript"
import fs from "node:fs"
import path from "node:path"
import { builtinModules } from "node:module"
import { fileURLToPath } from "node:url"

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
export const appRoot = path.join(repoRoot, "app")

const SOURCE_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]
const NODE_BUILTINS = new Set(builtinModules)

export const rel = (p: string): string => path.relative(repoRoot, p).split(path.sep).join("/")
export const abs = (relPath: string): string => path.join(repoRoot, relPath)

// ═══ §A  configuration-derived module resolution ═════════════════

let _parsedConfig: ts.ParsedCommandLine | null = null
export function loadTsConfig(): ts.ParsedCommandLine {
  if (_parsedConfig) return _parsedConfig
  const configPath = path.join(repoRoot, "tsconfig.json")
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  if (read.error) throw new Error("failed to read tsconfig.json")
  _parsedConfig = ts.parseJsonConfigFileContent(read.config, ts.sys, repoRoot)
  return _parsedConfig
}

const _resolveCache = new Map<string, string | null>()
/** Resolve a specifier from a file to an absolute repo file using the ACTIVE
 *  tsconfig (baseUrl, paths, moduleResolution, extensions). Returns null when
 *  unresolved or resolved into node_modules. */
function configResolveFile(specifier: string, fromFile: string): string | null {
  const key = `${fromFile} ${specifier}`
  const cached = _resolveCache.get(key)
  if (cached !== undefined) return cached
  const result = ts.resolveModuleName(specifier, fromFile, loadTsConfig().options, ts.sys)
  const file = result.resolvedModule?.resolvedFileName ?? null
  _resolveCache.set(key, file)
  return file
}

export type TargetKind =
  | "relative"
  | "alias"
  | "bare-package"
  | "node-builtin"
  | "unresolved-internal"
  | "non-literal-dynamic"

export function resolveSpecifier(
  fromFile: string,
  specifier: string,
): { targetKind: TargetKind; resolvedTarget: string | null } {
  const head = specifier.startsWith("node:") ? "node:" : specifier.split("/")[0]
  if (specifier.startsWith("node:") || NODE_BUILTINS.has(head)) {
    return { targetKind: "node-builtin", resolvedTarget: null }
  }
  const resolved = configResolveFile(specifier, fromFile)
  if (resolved && resolved.includes(`${path.sep}node_modules${path.sep}`)) {
    return { targetKind: "bare-package", resolvedTarget: null }
  }
  if (resolved) {
    return { targetKind: specifier.startsWith(".") ? "relative" : "alias", resolvedTarget: resolved }
  }
  if (specifier.startsWith(".") || specifier.startsWith("@/")) {
    return { targetKind: "unresolved-internal", resolvedTarget: null }
  }
  return { targetKind: "bare-package", resolvedTarget: null } // uninstalled third-party
}

// ═══ §B  dependency edges (correct type-only semantics) ══════════

export type EdgeKind =
  | "static-import" // import x from "y"  (value)
  | "type-only-import" // import type ... from "y"
  | "side-effect-import" // import "y"
  | "export-from" // export { a } from "y"
  | "export-star" // export * from "y"
  | "dynamic-import" // import("y")  (literal)
  | "import-equals" // import x = require("y")
  | "require" // require("y")  (literal)
  | "non-literal-dynamic" // import(expr) / require(expr)

export interface DependencyEdge {
  readonly sourceFile: string // absolute
  readonly specifier: string | null // null only for non-literal dynamic
  readonly edgeKind: EdgeKind
  readonly targetKind: TargetKind
  readonly resolvedTarget: string | null // absolute path when resolvable to a repo file
  readonly isTypeOnly: boolean
  readonly isLiteral: boolean
}

// Value (runtime) dependency: carries a real module load. A module reached only
// through these edges with isTypeOnly=false is loaded at runtime.
const VALUE_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "static-import", "side-effect-import", "export-from", "export-star",
  "dynamic-import", "import-equals", "require",
])
function isRuntimeEdge(edge: DependencyEdge): boolean {
  return VALUE_EDGE_KINDS.has(edge.edgeKind) && !edge.isTypeOnly
}

function scriptKindFor(file: string): ts.ScriptKind {
  return file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

export function parseSourceFile(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, /*setParentNodes*/ true, scriptKindFor(file))
}

/**
 * An ImportDeclaration is type-only ONLY when the entire import is type-only.
 * A default import OR a namespace import makes it a VALUE import regardless of
 * any `type` modifiers on named elements.
 */
function importIsTypeOnly(clause: ts.ImportClause): boolean {
  if (clause.isTypeOnly) return true // `import type ...`
  if (clause.name) return false // default binding is a value
  const nb = clause.namedBindings
  if (nb && ts.isNamespaceImport(nb)) return false // `import * as ns` is a value
  if (nb && ts.isNamedImports(nb) && nb.elements.length > 0) return nb.elements.every((e) => e.isTypeOnly)
  return false
}

/** An export-from/star is type-only only when the whole export is type-only. */
function exportIsTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true // `export type { X }` / `export type * from`
  const clause = node.exportClause
  if (clause && ts.isNamedExports(clause) && clause.elements.length > 0) return clause.elements.every((e) => e.isTypeOnly)
  return false // `export * from` and mixed `export { type X, valueY }` are value
}

export function parseModuleEdges(file: string): DependencyEdge[] {
  const sf = parseSourceFile(file)
  const edges: DependencyEdge[] = []

  const push = (specifier: string | null, edgeKind: EdgeKind, isTypeOnly: boolean) => {
    if (specifier === null) {
      edges.push({ sourceFile: file, specifier: null, edgeKind, targetKind: "non-literal-dynamic", resolvedTarget: null, isTypeOnly: false, isLiteral: false })
      return
    }
    const r = resolveSpecifier(file, specifier)
    edges.push({ sourceFile: file, specifier, edgeKind, targetKind: r.targetKind, resolvedTarget: r.resolvedTarget, isTypeOnly, isLiteral: true })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      if (!clause) push(node.moduleSpecifier.text, "side-effect-import", false)
      else {
        const typeOnly = importIsTypeOnly(clause)
        push(node.moduleSpecifier.text, typeOnly ? "type-only-import" : "static-import", typeOnly)
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = exportIsTypeOnly(node)
      push(node.moduleSpecifier.text, node.exportClause ? "export-from" : "export-star", typeOnly)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
      push(node.moduleReference.expression.text, "import-equals", node.isTypeOnly)
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0]
        if (arg && ts.isStringLiteral(arg)) push(arg.text, "dynamic-import", false)
        else push(null, "non-literal-dynamic", false)
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        const arg = node.arguments[0]
        if (arg && ts.isStringLiteral(arg)) push(arg.text, "require", false)
        else push(null, "non-literal-dynamic", false)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return edges
}

// ═══ §C  reachability ════════════════════════════════════════════

export function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listSourceFiles(p))
    else if (SOURCE_EXTS.some((e) => entry.name.endsWith(e))) out.push(p)
  }
  return out
}

const _edgeCache = new Map<string, DependencyEdge[]>()
function edgesOf(file: string): DependencyEdge[] {
  let e = _edgeCache.get(file)
  if (!e) { e = parseModuleEdges(file); _edgeCache.set(file, e) }
  return e
}

export interface ReachabilityOptions { readonly runtimeOnly?: boolean }

/** BFS over the AST graph. When runtimeOnly (default), follows only value edges;
 *  type-only import AND type-only export edges are excluded. */
export function reachableFrom(entries: string[], options: ReachabilityOptions = {}): Set<string> {
  const runtimeOnly = options.runtimeOnly ?? true
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    let edges: DependencyEdge[]
    try { edges = edgesOf(file) } catch { continue }
    for (const edge of edges) {
      if (runtimeOnly && !isRuntimeEdge(edge)) continue
      if (edge.resolvedTarget && !seen.has(edge.resolvedTarget)) queue.push(edge.resolvedTarget)
    }
  }
  return seen
}

export const KNOWN_RUNTIME_ENTRY_POINTS: readonly string[] = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/api/audit/recent/route.ts",
  "app/api/integrations/status/route.ts",
  "app/api/workunit/inbox/route.ts",
  "app/api/workunit/tools/route.ts",
  "app/api/workunit/[id]/action-preview/route.ts",
  "app/api/workunit/[id]/approval/route.ts",
  "app/api/workunit/[id]/approval/status/route.ts",
  "app/api/workunit/[id]/execution/dry-run/route.ts",
  "app/api/workunit/[id]/feedback/route.ts",
]

export function discoverRuntimeEntryPoints(): string[] {
  const entries: string[] = []
  for (const r of ["app/page.tsx", "app/layout.tsx"]) {
    const a = path.join(repoRoot, r)
    if (fs.existsSync(a)) entries.push(a)
  }
  entries.push(...discoverRouteFiles())
  return entries
}

/** Every API route module under app/api (route.ts / route.tsx). */
export function discoverRouteFiles(): string[] {
  const routes: string[] = []
  const apiRoot = path.join(appRoot, "api")
  if (!fs.existsSync(apiRoot)) return routes
  const stack = [apiRoot]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (entry.name === "route.ts" || entry.name === "route.tsx") routes.push(p)
    }
  }
  return routes.sort()
}

export function knownEntryPointsMissing(known: readonly string[]): string[] {
  return known.filter((r) => !fs.existsSync(path.join(repoRoot, r)))
}

// ═══ §D  layer dependency policies ═══════════════════════════════

export interface PolicyResult { readonly ok: boolean; readonly reason: string }
const OK: PolicyResult = { ok: true, reason: "" }
const deny = (reason: string): PolicyResult => ({ ok: false, reason })

function isOpaqueForm(edge: DependencyEdge): boolean {
  return edge.edgeKind === "require" || edge.edgeKind === "non-literal-dynamic"
}

/**
 * Domain policy: a domain module may depend ONLY on domain + tenant modules, by
 * any resolvable value/type edge. Bare packages, Node builtins, require(),
 * non-literal dynamic imports, unresolved internals, and every cross-layer edge
 * (even type-only) are violations. `process` access is checked separately (§F).
 */
export function classifyDomainEdge(edge: DependencyEdge): PolicyResult {
  if (isOpaqueForm(edge)) return deny(`opaque module form ${edge.edgeKind}`)
  if (edge.targetKind === "bare-package") return deny(`third-party package "${edge.specifier}"`)
  if (edge.targetKind === "node-builtin") return deny(`Node builtin "${edge.specifier}"`)
  if (edge.targetKind === "unresolved-internal") return deny(`unresolved internal import "${edge.specifier}"`)
  const t = edge.resolvedTarget ? rel(edge.resolvedTarget) : (edge.specifier ?? "")
  if (edge.resolvedTarget && (t.startsWith("app/lib/domain/") || t.startsWith("app/lib/tenant/"))) return OK
  return deny(`domain must not import ${t}`)
}

/** Exact edge exception. `edgeKind` and `typeOnly` pin the EXACT dependency form
 *  the exception tolerates; an edge that matches source+target but differs in
 *  edgeKind (e.g. a dynamic import where a static import was tolerated) is NOT
 *  covered and remains a violation. */
export interface EdgeException {
  readonly source: string // repo-relative
  readonly target: string // repo-relative
  readonly edgeKind: EdgeKind // EXACT dependency form tolerated
  readonly typeOnly: boolean // true = tolerated ONLY as a type-only edge
  readonly reason: string
  readonly removalIssue: string
}

// Roots an application module may depend on without an exception.
const APPLICATION_ALLOWED_ROOTS = ["app/lib/domain/", "app/lib/application/", "app/lib/tenant/"]

/**
 * Exact VALUE-edge exceptions. EMPTY as of WS1-PR2 (compose session authority
 * outside application): sessionResolver's three value edges to security/policy,
 * the infrastructure control resolver, and the runtime env authority were
 * removed by injecting an auth adapter + a domain session-authority port + a
 * composition root. The application layer now takes NO value dependency on
 * runtime/security/infrastructure/persistence. Do not re-add without a tracked
 * removal plan; the architecture test asserts this list is empty.
 */
export const APPLICATION_VALUE_EXCEPTIONS: readonly EdgeException[] = []

/** Exact TYPE-ONLY-edge exceptions (shared-contract type imports; must be type-only). */
export const APPLICATION_TYPEONLY_EXCEPTIONS: readonly EdgeException[] = [
  { source: "app/lib/application/auth/resolveAuthAdapter.ts", target: "app/lib/runtime/requestRuntimeConfig.ts", edgeKind: "type-only-import", typeOnly: true, reason: "AuthRuntimeConfig type contract", removalIssue: "#182 (ports extraction)" },
  { source: "app/lib/application/workunitInbox/persistenceMapping.ts", target: "app/lib/persistence/types.ts", edgeKind: "type-only-import", typeOnly: true, reason: "persistence row type contract", removalIssue: "#182 (ports extraction)" },
  { source: "app/lib/application/decomposition/types.ts", target: "app/lib/llm/types.ts", edgeKind: "type-only-import", typeOnly: true, reason: "LLM boundary type contract", removalIssue: "#182 (ports extraction)" },
  { source: "app/lib/application/actionField/errorState.ts", target: "app/lib/security/safeErrors.ts", edgeKind: "type-only-import", typeOnly: true, reason: "safe-error code type contract", removalIssue: "#182 (ports extraction)" },
]

// Backward-compatible alias (value exceptions) retained for existing imports.
export const APPLICATION_EDGE_EXCEPTIONS = APPLICATION_VALUE_EXCEPTIONS

export interface ApplicationPolicyOptions {
  readonly valueExceptions?: readonly EdgeException[]
  readonly typeOnlyExceptions?: readonly EdgeException[]
}

/**
 * Application policy. Allowed only: domain/application/tenant roots, OR an EXACT
 * edge exception (value edges via valueExceptions, type-only edges via
 * typeOnlyExceptions). Everything else — bare packages, Node builtins, opaque
 * forms, ANY value OR type-only edge into a non-allowed layer (incl. persistence
 * implementations and infrastructure adapters) — is a violation. A filename
 * ending in `types.ts` is NOT auto-trusted; only exact type-only exceptions are.
 */
export function classifyApplicationEdge(edge: DependencyEdge, options: ApplicationPolicyOptions = {}): PolicyResult {
  const valueExc = options.valueExceptions ?? APPLICATION_VALUE_EXCEPTIONS
  const typeExc = options.typeOnlyExceptions ?? APPLICATION_TYPEONLY_EXCEPTIONS

  if (edge.targetKind === "bare-package") return deny(`third-party/provider package "${edge.specifier}"`)
  if (edge.targetKind === "node-builtin") return deny(`Node capability builtin "${edge.specifier}"`)
  if (isOpaqueForm(edge)) return deny(`opaque module form ${edge.edgeKind}`)

  const targetRel = edge.resolvedTarget ? rel(edge.resolvedTarget) : (edge.specifier ?? "")
  if (edge.resolvedTarget && APPLICATION_ALLOWED_ROOTS.some((p) => targetRel.startsWith(p))) return OK

  // Unresolved internal that is not one of the forbidden dynamic fixtures: still
  // a violation (an application module must resolve within allowed roots).
  // An exception must match source, target, EXACT edgeKind, and modality.
  const src = rel(edge.sourceFile)
  const matches = (x: EdgeException): boolean => x.source === src && x.target === targetRel && x.edgeKind === edge.edgeKind
  if (edge.isTypeOnly) {
    if (typeExc.some((x) => matches(x) && x.typeOnly)) return OK
    return deny(`application type-only import of non-contract module ${targetRel}`)
  }
  // value edge (incl. dynamic-import) into a non-allowed layer
  if (valueExc.some((x) => matches(x) && !x.typeOnly)) return OK
  // dynamic import whose specifier names a forbidden layer but did not resolve (fixture)
  return deny(`application must not take a value dependency on ${targetRel || edge.specifier}`)
}

// ═══ §E  route model: inventory + direct guard characterization ══
//
// SCOPE OF PROOF (deliberately narrow). These gates prove, per route MODULE:
//   - the set of exported HTTP methods and their export FORM;
//   - for statically analyzable forms (function declaration / function const),
//     whether each canonical guard is CALLED DIRECTLY in the handler body, by
//     canonical import identity.
// They do NOT prove runtime guard dominance across arbitrary control flow, nor
// that effects performed by IMPORTED application services are guarded, nor a
// general "effect" boundary by method/receiver name. Indeterminate export forms
// (aliased export, re-export, wrapper-assigned const) are reported and FAIL
// CLOSED — they are not claimed covered. Runtime enforcement is tracked in the
// canonical-secured-route Issue #185.

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])

/** Canonical guard export name → canonical module (absolute). A call counts as a
 *  guard ONLY when its callee is a bare identifier bound (possibly aliased) to
 *  exactly this export of exactly this module. */
const GUARD_CANONICAL: Readonly<Record<string, string>> = {
  requireSession: abs("app/lib/security/session.ts"),
  validateCsrfOrigin: abs("app/lib/security/csrfProtection.ts"),
  checkRateLimit: abs("app/lib/security/rateLimitGate.ts"),
  readBoundedJsonObject: abs("app/lib/security/requestBody.ts"),
  resolveValidatedRequestRuntimeConfig: abs("app/lib/runtime/requestRuntimeConfig.ts"),
}
export const REQUIRED_POST_GUARDS = ["requireSession", "validateCsrfOrigin", "checkRateLimit", "readBoundedJsonObject"] as const
export const REQUIRED_GET_GUARDS = ["requireSession", "resolveValidatedRequestRuntimeConfig"] as const

interface ImportBinding { readonly moduleFile: string | null; readonly exported: string }

function buildImportBindings(sf: ts.SourceFile, file: string): Map<string, ImportBinding> {
  const map = new Map<string, ImportBinding>()
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const clause = stmt.importClause
    if (!clause || clause.isTypeOnly) continue // type-only imports cannot be called
    const moduleFile = configResolveFile(stmt.moduleSpecifier.text, file)
    if (clause.name) map.set(clause.name.text, { moduleFile, exported: "default" })
    const nb = clause.namedBindings
    if (nb && ts.isNamespaceImport(nb)) map.set(nb.name.text, { moduleFile, exported: "*" })
    if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) {
        if (el.isTypeOnly) continue
        map.set(el.name.text, { moduleFile, exported: (el.propertyName ?? el.name).text })
      }
    }
  }
  return map
}

function guardForCall(call: ts.CallExpression, bindings: Map<string, ImportBinding>, shadowed: ReadonlySet<string>): string | null {
  if (!ts.isIdentifier(call.expression)) return null // property access / other → never a guard
  const local = call.expression.text
  if (shadowed.has(local)) return null // a local binding of this name shadows the import
  const binding = bindings.get(local)
  if (!binding || !binding.moduleFile) return null
  for (const [guard, canonicalModule] of Object.entries(GUARD_CANONICAL)) {
    if (binding.moduleFile === canonicalModule && binding.exported === guard) return guard
  }
  return null
}

/** Names declared locally inside a handler (var/let/const/function/param/binding
 *  element). A guard call whose identifier is shadowed by one of these is NOT the
 *  imported canonical guard, so it must not count (fail closed on shadowing). */
function collectLocalDeclarationNames(handlerBody: ts.Node): Set<string> {
  const names = new Set<string>()
  const add = (n: ts.BindingName | undefined): void => {
    if (n && ts.isIdentifier(n)) names.add(n.text)
    else if (n && (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n))) {
      for (const el of n.elements) if (ts.isBindingElement(el)) add(el.name)
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) add(node.name)
    else if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text)
    else if (ts.isParameter(node)) add(node.name)
    ts.forEachChild(node, visit)
  }
  visit(handlerBody)
  return names
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return !!mods && mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
}

function isFunctionLike(n: ts.Node): boolean {
  return ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)
}

/** Canonical guards called DIRECTLY in a handler body (not inside a nested
 *  function/arrow), by canonical import identity. A source-presence
 *  characterization — NOT a runtime dominance/ordering proof. */
function directGuardCalls(handlerBody: ts.Node, bindings: Map<string, ImportBinding>): Set<string> {
  const shadowed = collectLocalDeclarationNames(handlerBody)
  const found = new Set<string>()
  const walk = (node: ts.Node, insideNested: boolean): void => {
    if (isFunctionLike(node)) { ts.forEachChild(node, (c) => walk(c, true)); return }
    if (!insideNested && ts.isCallExpression(node)) {
      const g = guardForCall(node, bindings, shadowed)
      if (g) found.add(g)
    }
    ts.forEachChild(node, (c) => walk(c, insideNested))
  }
  walk(handlerBody, false)
  return found
}

/** How an HTTP method is exported from a route module. Only the first two forms
 *  are statically analyzable; the rest bind the handler indirectly and are
 *  reported as INDETERMINATE (fail closed — not claimed covered). */
export type RouteExportForm =
  | "function-declaration" // export function POST() {}
  | "function-const" // export const POST = () => {} / function expr
  | "wrapper-const" // export const POST = wrapper(handler)
  | "aliased-export" // export { handler as POST }
  | "reexport" // export { POST } from "./x"

const ANALYZABLE_FORMS: ReadonlySet<RouteExportForm> = new Set<RouteExportForm>(["function-declaration", "function-const"])

export interface RouteMethodExport {
  readonly method: string
  readonly form: RouteExportForm
  readonly analyzable: boolean
  /** canonical guards called directly in the handler body (analyzable forms only). */
  readonly directGuards: ReadonlySet<string>
}

export interface RouteFileReport {
  readonly file: string // repo-relative
  readonly methodExports: readonly RouteMethodExport[]
  readonly recognizedMethods: readonly string[]
  readonly hasZeroRecognizedMethods: boolean
  /** export forms present that cannot be statically characterized (fail closed). */
  readonly indeterminateForms: readonly RouteExportForm[]
}

/**
 * Enumerate EVERY HTTP-method export of a route module and classify its form.
 * Detects (and fails closed on) aliased exports, re-exports, and wrapper-assigned
 * consts in addition to plain function/const handlers. Always returns a report,
 * including for a file with zero recognized HTTP exports.
 */
export function analyzeRouteFile(absFile: string): RouteFileReport {
  const sf = parseSourceFile(absFile)
  const bindings = buildImportBindings(sf, absFile)
  const methodExports: RouteMethodExport[] = []

  const pushExport = (method: string, form: RouteExportForm, body: ts.Node | null): void => {
    const analyzable = ANALYZABLE_FORMS.has(form) && body !== null
    methodExports.push({ method, form, analyzable, directGuards: analyzable && body ? directGuardCalls(body, bindings) : new Set() })
  }

  for (const stmt of sf.statements) {
    // export function POST() {}
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body && HTTP_METHODS.has(stmt.name.text) && hasExportModifier(stmt)) {
      pushExport(stmt.name.text, "function-declaration", stmt.body)
      continue
    }
    // export const POST = <arrow|funcExpr> | wrapper(handler)
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !HTTP_METHODS.has(d.name.text)) continue
        if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          pushExport(d.name.text, "function-const", d.initializer.body)
        } else {
          pushExport(d.name.text, "wrapper-const", null) // non-function initializer: indeterminate
        }
      }
      continue
    }
    // export { handler as POST }  and  export { POST } from "./x"
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      const isReexport = !!stmt.moduleSpecifier
      for (const el of stmt.exportClause.elements) {
        const exportedName = el.name.text // the name seen by the router
        if (!HTTP_METHODS.has(exportedName)) continue
        pushExport(exportedName, isReexport ? "reexport" : "aliased-export", null)
      }
    }
  }

  const recognizedMethods = [...new Set(methodExports.map((m) => m.method))].sort()
  const indeterminateForms = [...new Set(methodExports.filter((m) => !m.analyzable).map((m) => m.form))]
  return {
    file: rel(absFile),
    methodExports,
    recognizedMethods,
    hasZeroRecognizedMethods: recognizedMethods.length === 0,
    indeterminateForms,
  }
}

/** One report per route FILE (including files with zero recognized methods). */
export function routeInventory(routeFiles: readonly string[]): RouteFileReport[] {
  return routeFiles.map(analyzeRouteFile)
}

// ── #156 EXACT current-inbox write-path characterization ─────────
//
// Pins the EXACT current structure of app/api/workunit/inbox/route.ts — not a
// general effect boundary. When #156 removes the write from the GET handler,
// these booleans flip and the pin fails, forcing the pin to be updated.

function bodyCallsBareIdentifier(node: ts.Node, name: string): boolean {
  let found = false
  const walk = (n: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) { found = true; return }
    ts.forEachChild(n, walk)
  }
  walk(node)
  return found
}

/** True iff the subtree contains an EXACT `receiver.method(...)` call where the
 *  receiver is a bare identifier named `receiver`. `cache.upsert(...)` does NOT
 *  satisfy `repository.upsert`; `metrics.recordEvent(...)` does NOT satisfy
 *  `usage.recordEvent`. */
function bodyCallsReceiverMethod(node: ts.Node, receiver: string, method: string): boolean {
  let found = false
  const walk = (n: ts.Node): void => {
    if (found) return
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === method &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === receiver
    ) { found = true; return }
    ts.forEachChild(n, walk)
  }
  walk(node)
  return found
}

export interface InboxWritePath {
  readonly getCallsPersistWorkUnits: boolean
  readonly persistWorkUnitsCallsRepositoryUpsert: boolean
  readonly getCallsUsageRecordEvent: boolean
  readonly getCallsAuditLogsAppend: boolean
}

/**
 * Characterize the EXACT current inbox GET write path (Issue #156) with exact
 * receiver+method matching — not a general effect boundary:
 *   GET             → calls bare `persistWorkUnits`
 *   persistWorkUnits→ calls `repository.upsert(...)`
 *   GET             → calls `usage.recordEvent(...)`
 *   GET             → calls `auditLogs.append(...)`
 * The #156 fix (removing the write from GET) flips these and must update the pin.
 */
export function inboxWritePath(absFile = abs("app/api/workunit/inbox/route.ts")): InboxWritePath {
  const sf = parseSourceFile(absFile)
  let getBody: ts.Node | null = null
  let persistBody: ts.Node | null = null
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body && hasExportModifier(stmt) && stmt.name.text === "GET") getBody = stmt.body
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body && stmt.name.text === "persistWorkUnits") persistBody = stmt.body
  }
  return {
    getCallsPersistWorkUnits: getBody ? bodyCallsBareIdentifier(getBody, "persistWorkUnits") : false,
    persistWorkUnitsCallsRepositoryUpsert: persistBody ? bodyCallsReceiverMethod(persistBody, "repository", "upsert") : false,
    getCallsUsageRecordEvent: getBody ? bodyCallsReceiverMethod(getBody, "usage", "recordEvent") : false,
    getCallsAuditLogsAppend: getBody ? bodyCallsReceiverMethod(getBody, "auditLogs", "append") : false,
  }
}

// ═══ §F  domain environment-authority (AST, not substring) ═══════

const PROCESS = "process"

/** Collect binding identifiers named `process` from a BindingName (handles
 *  destructuring). */
function bindingDeclaresProcess(name: ts.BindingName | undefined): boolean {
  if (!name) return false
  if (ts.isIdentifier(name)) return name.text === PROCESS
  for (const el of name.elements) {
    if (ts.isBindingElement(el) && bindingDeclaresProcess(el.name)) return true
  }
  return false
}

/**
 * Names DIRECTLY introduced by a scope node — NOT descending into nested scopes.
 * Scopes: SourceFile, function-like, Block, CatchClause, for-statements.
 *   - function-like: parameters;
 *   - CatchClause: the catch variable;
 *   - for-statements: loop-variable declarations;
 *   - Block / SourceFile: the direct statement-level declarations
 *     (var/let/const, function, class, import) — hoisting is treated
 *     block-locally, which only ever OVER-flags (never hides) a global.
 * Returns whether this scope binds `process`.
 */
function scopeBindsProcess(scope: ts.Node): boolean {
  if (ts.isFunctionDeclaration(scope) || ts.isFunctionExpression(scope) || ts.isArrowFunction(scope) ||
      ts.isMethodDeclaration(scope) || ts.isConstructorDeclaration(scope) || ts.isGetAccessorDeclaration(scope) || ts.isSetAccessorDeclaration(scope)) {
    return scope.parameters.some((p) => bindingDeclaresProcess(p.name))
  }
  if (ts.isCatchClause(scope)) {
    return !!scope.variableDeclaration && bindingDeclaresProcess(scope.variableDeclaration.name)
  }
  if (ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) {
    const init = scope.initializer
    if (init && ts.isVariableDeclarationList(init)) return init.declarations.some((d) => bindingDeclaresProcess(d.name))
    return false
  }
  if (ts.isSourceFile(scope) || ts.isBlock(scope)) {
    for (const stmt of scope.statements) {
      if (ts.isVariableStatement(stmt) && stmt.declarationList.declarations.some((d) => bindingDeclaresProcess(d.name))) return true
      if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === PROCESS) return true
      if (ts.isClassDeclaration(stmt) && stmt.name?.text === PROCESS) return true
      if (ts.isImportDeclaration(stmt) && stmt.importClause) {
        const c = stmt.importClause
        if (c.name?.text === PROCESS) return true
        const nb = c.namedBindings
        if (nb && ts.isNamespaceImport(nb) && nb.name.text === PROCESS) return true
        if (nb && ts.isNamedImports(nb) && nb.elements.some((e) => e.name.text === PROCESS)) return true
      }
    }
    return false
  }
  return false
}

function isScopeNode(n: ts.Node): boolean {
  return ts.isSourceFile(n) || ts.isBlock(n) || ts.isCatchClause(n) ||
    ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
    ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)
}

/**
 * Detect references to the Node global `process` symbol in a source file, using
 * PER-REFERENCE LEXICAL scope resolution (AST, not substring, not file-wide).
 * A bare `process` value reference is the Node global unless SOME enclosing
 * lexical scope binds `process`; a local binding in a nested/sibling/block scope
 * therefore does NOT hide a `process.env` reference elsewhere.
 *   - `globalThis.process` / `globalThis["process"]` are ALWAYS the global, even
 *     when a local `process` is in scope.
 *   - Comments and strings never produce Identifier nodes, so they never trigger.
 */
export function processSymbolReferences(file: string): number {
  const sf = parseSourceFile(file)
  let count = 0

  const walk = (node: ts.Node, scopeBindsStack: readonly boolean[]): void => {
    // globalThis.process — always the global
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "globalThis" && node.name.text === PROCESS) {
      count += 1
    }
    // globalThis["process"] — always the global
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "globalThis" && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === PROCESS) {
      count += 1
    }
    // bare `process` value reference — global unless a lexical scope binds it
    if (ts.isIdentifier(node) && node.text === PROCESS) {
      const parent = node.parent
      const isPropName = parent && ts.isPropertyAccessExpression(parent) && parent.name === node
      const isDeclName = parent && (
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isParameter(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node) ||
        (ts.isFunctionDeclaration(parent) && parent.name === node) ||
        (ts.isClassDeclaration(parent) && parent.name === node)
      )
      const isImportOrExportName = parent && (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent))
      const isValueReference = !isPropName && !isDeclName && !isImportOrExportName
      if (isValueReference && !scopeBindsStack.some((b) => b)) count += 1
    }

    const nextStack = isScopeNode(node) ? [...scopeBindsStack, scopeBindsProcess(node)] : scopeBindsStack
    ts.forEachChild(node, (c) => walk(c, nextStack))
  }

  walk(sf, [])
  return count
}

// ═══ §G  exact type-contract module exemption (reachability ratchet) ══
//
// A PURE type-contract module (an `interface`/`type` port with NO runtime
// footprint) emits nothing, so it is inherently orphaned by the value-edge
// reachability metric even though it is a legitimate, used dependency. Rather
// than RAISE the global 203/88 ceilings (which would also silently tolerate real
// dead runtime code), the ratchet exempts EXACTLY such modules — and ONLY after
// PROVING, per exact path, that the module truly is a pure type contract with a
// live type-only consumer. A stale entry (file gone / no type-only importer) or a
// module converted into runtime code (value import/export, runtime declaration,
// side effect) FAILS validation, so the exemption cannot mask a regression.

function isExistingFile(absPath: string): boolean {
  try { return fs.statSync(absPath).isFile() } catch { return false }
}

/** A top-level statement that emits NO runtime code: `import type`, `interface`,
 *  `type` alias, or a type-only `export {…}`/`export type * from`. */
function statementIsTypeOnly(stmt: ts.Statement): boolean {
  if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) return true
  if (ts.isImportDeclaration(stmt)) return stmt.importClause ? importIsTypeOnly(stmt.importClause) : false
  if (ts.isExportDeclaration(stmt)) return exportIsTypeOnly(stmt)
  return false
}

export type TypeContractViolationCode =
  | "not_a_file" // exact path is missing or not a regular file
  | "value_import" // an outbound value/side-effect import (runtime load)
  | "value_export" // a runtime-emitting export (value binding / value re-export)
  | "runtime_declaration" // a runtime-emittable top-level declaration or side effect
  | "stale_no_type_only_importer" // no production module imports it via a type-only edge

export interface TypeContractViolation { readonly code: TypeContractViolationCode; readonly detail: string }

/**
 * SELF analysis (module's own AST only — resolvable on a throwaway fixture): the
 * module must contain NO value import (incl. side-effect import), NO value
 * export, and NO runtime-emittable top-level declaration or side effect.
 */
export function typeContractSelfViolations(absFile: string): TypeContractViolation[] {
  if (!isExistingFile(absFile)) return [{ code: "not_a_file", detail: rel(absFile) }]
  const v: TypeContractViolation[] = []
  for (const edge of parseModuleEdges(absFile)) {
    if (isRuntimeEdge(edge)) v.push({ code: "value_import", detail: `${edge.edgeKind} "${edge.specifier ?? "<dynamic>"}"` })
  }
  for (const stmt of parseSourceFile(absFile).statements) {
    if (ts.isImportDeclaration(stmt) || ts.isImportEqualsDeclaration(stmt)) continue // imports scored via edges
    if (statementIsTypeOnly(stmt)) continue
    const isExport = hasExportModifier(stmt) || ts.isExportDeclaration(stmt) || ts.isExportAssignment(stmt)
    v.push({ code: isExport ? "value_export" : "runtime_declaration", detail: ts.SyntaxKind[stmt.kind] })
  }
  return v
}

/** Production (app/**, non-test) modules that import `absModuleFile` through a
 *  type-only edge. Empty ⇒ the exemption is stale. */
export function productionTypeOnlyImporters(absModuleFile: string): string[] {
  const importers: string[] = []
  for (const f of listSourceFiles(appRoot)) {
    if (f === absModuleFile) continue
    if (parseModuleEdges(f).some((e) => e.resolvedTarget === absModuleFile && e.isTypeOnly)) importers.push(rel(f))
  }
  return importers
}

export interface TypeContractClassification { readonly ok: boolean; readonly reasons: readonly string[] }

/** Classify ONE absolute path as an exact pure type-contract exemption. Fails
 *  closed: any self violation OR a stale (no type-only importer) module → not ok. */
export function classifyTypeContractModule(absFile: string): TypeContractClassification {
  if (!isExistingFile(absFile)) return { ok: false, reasons: ["not_a_file: exact file path required (no directory or glob)"] }
  const reasons = typeContractSelfViolations(absFile).map((s) => `${s.code}: ${s.detail}`)
  if (productionTypeOnlyImporters(absFile).length === 0) reasons.push("stale_no_type_only_importer: no production module imports it via a type-only edge")
  return { ok: reasons.length === 0, reasons }
}

export interface TypeContractValidation {
  readonly validated: ReadonlySet<string> // absolute paths that passed EVERY check
  readonly rejections: readonly { readonly module: string; readonly reasons: readonly string[] }[]
}

/**
 * Validate EXACT repo-relative type-contract exemptions. Each entry is resolved by
 * EXACT path (a directory or `**` glob does not resolve to a file and is rejected)
 * and must pass `classifyTypeContractModule`. Only fully-validated modules are
 * exempted from the reachability counts; every rejection is reported so a stale or
 * converted exemption makes the ratchet fail rather than silently pass.
 */
export function validateTypeContractExemptions(exactRelPaths: readonly string[]): TypeContractValidation {
  const validated = new Set<string>()
  const rejections: { module: string; reasons: readonly string[] }[] = []
  for (const relPath of exactRelPaths) {
    const absPath = path.join(repoRoot, relPath)
    const result = classifyTypeContractModule(absPath)
    if (result.ok) validated.add(absPath)
    else rejections.push({ module: relPath, reasons: result.reasons })
  }
  return { validated, rejections }
}
