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

/** Exact edge exception; `typeOnly` records the required edge modality. */
export interface EdgeException {
  readonly source: string // repo-relative
  readonly target: string // repo-relative
  readonly typeOnly: boolean // true = tolerated ONLY as a type-only edge
  readonly reason: string
  readonly removalIssue: string
}

// Roots an application module may depend on without an exception.
const APPLICATION_ALLOWED_ROOTS = ["app/lib/domain/", "app/lib/application/", "app/lib/tenant/"]

/** Exact VALUE-edge exceptions (each authorizes ONLY its one source→target pair). */
export const APPLICATION_VALUE_EXCEPTIONS: readonly EdgeException[] = [
  { source: "app/lib/application/auth/sessionResolver.ts", target: "app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts", typeOnly: false, reason: "sessionResolver constructs control repositories directly; invert behind a port", removalIssue: "#182 (refactor/tenant-security)" },
  { source: "app/lib/application/auth/sessionResolver.ts", target: "app/lib/runtime/requestRuntimeConfig.ts", typeOnly: false, reason: "sessionResolver reads the runtime env authority directly; thread from composition root", removalIssue: "#182 (refactor/tenant-security)" },
  { source: "app/lib/application/auth/sessionResolver.ts", target: "app/lib/security/policy.ts", typeOnly: false, reason: "sessionResolver uses RBAC role normalization; move behind an auth port", removalIssue: "#182 (refactor/tenant-security)" },
]

/** Exact TYPE-ONLY-edge exceptions (shared-contract type imports; must be type-only). */
export const APPLICATION_TYPEONLY_EXCEPTIONS: readonly EdgeException[] = [
  { source: "app/lib/application/auth/resolveAuthAdapter.ts", target: "app/lib/runtime/requestRuntimeConfig.ts", typeOnly: true, reason: "AuthRuntimeConfig type contract", removalIssue: "#182 (ports extraction)" },
  { source: "app/lib/application/auth/sessionResolver.ts", target: "app/lib/persistence/d1/types.ts", typeOnly: true, reason: "D1DatabaseLike type contract", removalIssue: "#182 (ports extraction)" },
  { source: "app/lib/application/workunitInbox/persistenceMapping.ts", target: "app/lib/persistence/types.ts", typeOnly: true, reason: "persistence row type contract", removalIssue: "#182 (ports extraction)" },
  { source: "app/lib/application/decomposition/types.ts", target: "app/lib/llm/types.ts", typeOnly: true, reason: "LLM boundary type contract", removalIssue: "#182 (ports extraction)" },
  { source: "app/lib/application/actionField/errorState.ts", target: "app/lib/security/safeErrors.ts", typeOnly: true, reason: "safe-error code type contract", removalIssue: "#182 (ports extraction)" },
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
  const src = rel(edge.sourceFile)
  if (edge.isTypeOnly) {
    if (typeExc.some((x) => x.source === src && x.target === targetRel && x.typeOnly)) return OK
    return deny(`application type-only import of non-contract module ${targetRel}`)
  }
  // value edge (incl. dynamic-import) into a non-allowed layer
  if (valueExc.some((x) => x.source === src && x.target === targetRel && !x.typeOnly)) return OK
  // dynamic import whose specifier names a forbidden layer but did not resolve (fixture)
  return deny(`application must not take a value dependency on ${targetRel || edge.specifier}`)
}

// ═══ §E  route model: canonical guards, effect sinks, dominance ══

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

// Exact effect sinks. Unambiguous write verbs are effects on any receiver;
// ambiguous verbs are effects only on a persistence/provider-shaped receiver.
const WRITE_VERBS = new Set(["upsert", "insert", "update", "updateStatus", "delete", "append", "recordEvent", "save", "put", "enqueue", "batch", "execute", "markApprovalUsed", "claimApprovalForRuntime"])
const AMBIGUOUS_VERBS = new Set(["create", "post", "send", "run"])
const EFFECT_RECEIVER = /^(repo|repository|repositories|store|approvalStore|provider|client|queue|db|database|usage|auditLogs|workUnits|previews|previewRepo|approvalRepo|approvalRecords|actionPreviews|feedback|bundle)$/i
// Distinctive bare effect functions (imported): treated as effects by name.
const BARE_EFFECT_FUNCS = new Set(["runToolBackendRequest", "authorizeRuntimeCommand"])

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

function effectForCall(call: ts.CallExpression): string | null {
  const e = call.expression
  if (ts.isPropertyAccessExpression(e)) {
    const method = e.name.text
    if (WRITE_VERBS.has(method)) return method
    if (AMBIGUOUS_VERBS.has(method)) {
      const recv = ts.isIdentifier(e.expression) ? e.expression.text : (ts.isPropertyAccessExpression(e.expression) ? e.expression.name.text : "")
      if (EFFECT_RECEIVER.test(recv)) return method
    }
    return null
  }
  if (ts.isIdentifier(e) && BARE_EFFECT_FUNCS.has(e.text)) return e.text
  return null
}

export interface HandlerReport {
  readonly method: string
  readonly policy: "GET" | "POST" | "unclassified"
  /** canonical guards called at depth-0 (unconditional) before the first direct effect */
  readonly dominatingGuards: ReadonlySet<string>
  /** first direct (non-inlined) effect position; Infinity if none */
  readonly firstEffectPos: number
  /** effect labels reachable following called local helpers (for #156) */
  readonly effectsReached: ReadonlySet<string>
}

function collectLocalFunctions(sf: ts.SourceFile): Map<string, ts.Node> {
  const fns = new Map<string, ts.Node>()
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) fns.set(stmt.name.text, stmt.body)
    else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) fns.set(d.name.text, d.initializer.body)
      }
    }
  }
  return fns
}

function isFunctionLike(n: ts.Node): boolean {
  return ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)
}

/**
 * Depth-0 dominance walk. A call is "depth-0" (unconditionally executed before
 * any later statement) when reached from the handler body without descending
 * through: an if/else/loop/switch/try BODY, a function/arrow/callback body, or
 * the conditional side of a ternary / `&&` / `||`. The TEST of an `if`/`while`
 * and the initializer/arguments of depth-0 expressions ARE depth-0.
 *
 * Guards are recorded (by canonical identity) only at depth-0. Effects are
 * recorded at any depth (they must all be dominated). Guard dominance holds when
 * every required guard has a depth-0 call before the first direct effect.
 */
function analyzeDominance(handlerBody: ts.Node, bindings: Map<string, ImportBinding>): {
  dominatingGuards: Set<string>
  firstEffectPos: number
} {
  const guardPos = new Map<string, number>() // guard → earliest depth-0 pos
  let firstEffectPos = Infinity
  const shadowed = collectLocalDeclarationNames(handlerBody)

  const walk = (node: ts.Node, depth0: boolean): void => {
    if (isFunctionLike(node)) { walkChildren(node, false); return }
    if (ts.isCallExpression(node)) {
      const g = guardForCall(node, bindings, shadowed)
      if (g && depth0) guardPos.set(g, Math.min(guardPos.get(g) ?? Infinity, node.getStart()))
      const eff = effectForCall(node)
      if (eff) firstEffectPos = Math.min(firstEffectPos, node.getStart())
      // callee object + arguments evaluate at the same conditionality as the call
      walk(node.expression, depth0)
      for (const arg of node.arguments) walk(arg, depth0)
      return
    }
    if (ts.isIfStatement(node)) {
      walk(node.expression, depth0) // test runs unconditionally
      walk(node.thenStatement, false)
      if (node.elseStatement) walk(node.elseStatement, false)
      return
    }
    if (ts.isConditionalExpression(node)) {
      walk(node.condition, depth0)
      walk(node.whenTrue, false)
      walk(node.whenFalse, false)
      return
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        walk(node.left, depth0)
        walk(node.right, false) // short-circuited
        return
      }
    }
    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isSwitchStatement(node) || ts.isTryStatement(node)) {
      walkChildren(node, false)
      return
    }
    walkChildren(node, depth0)
  }
  const walkChildren = (node: ts.Node, depth0: boolean): void => ts.forEachChild(node, (c) => walk(c, depth0))

  walk(handlerBody, true)
  const dominatingGuards = new Set<string>()
  for (const [g, pos] of guardPos) if (pos < firstEffectPos) dominatingGuards.add(g)
  return { dominatingGuards, firstEffectPos }
}

/** Effects reachable following CALLED local helpers (for #156 write-path proof). */
function collectEffectsReached(handlerBody: ts.Node, localFns: Map<string, ts.Node>): Set<string> {
  const effects = new Set<string>()
  const inlined = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const eff = effectForCall(node)
      if (eff) effects.add(eff)
      if (ts.isIdentifier(node.expression)) {
        const body = localFns.get(node.expression.text)
        if (body && !inlined.has(node.expression.text)) { inlined.add(node.expression.text); walk(body) }
      }
      walk(node.expression)
      for (const a of node.arguments) walk(a)
      return
    }
    ts.forEachChild(node, walk)
  }
  walk(handlerBody)
  return effects
}

function policyFor(method: string): "GET" | "POST" | "unclassified" {
  if (method === "GET") return "GET"
  if (method === "POST") return "POST"
  return "unclassified"
}

export function analyzeRoute(absFile: string): HandlerReport[] {
  const sf = parseSourceFile(absFile)
  const bindings = buildImportBindings(sf, absFile)
  const localFns = collectLocalFunctions(sf)
  const reports: HandlerReport[] = []
  for (const stmt of sf.statements) {
    let name: string | undefined
    let body: ts.Node | undefined
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body && hasExportModifier(stmt)) { name = stmt.name.text; body = stmt.body }
    else if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) { name = d.name.text; body = d.initializer.body }
      }
    }
    if (!name || !body || !HTTP_METHODS.has(name)) continue
    const { dominatingGuards, firstEffectPos } = analyzeDominance(body, bindings)
    reports.push({
      method: name,
      policy: policyFor(name),
      dominatingGuards,
      firstEffectPos,
      effectsReached: collectEffectsReached(body, localFns),
    })
  }
  return reports
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return !!mods && mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
}

export interface GuardPolicyResult { readonly ok: boolean; readonly missing: readonly string[]; readonly reason: string }

/** Evaluate guard dominance for one handler under its method policy. */
export function evaluateGuardPolicy(report: HandlerReport): GuardPolicyResult {
  if (report.policy === "unclassified") return { ok: false, missing: [], reason: `unclassified HTTP method ${report.method} — no guard policy defined` }
  const required = report.policy === "POST" ? REQUIRED_POST_GUARDS : REQUIRED_GET_GUARDS
  const missing = required.filter((g) => !report.dominatingGuards.has(g))
  return { ok: missing.length === 0, missing, reason: missing.length ? `guards not proven to dominate: ${missing.join(", ")}` : "" }
}

export interface RouteCoverageEntry {
  readonly file: string // repo-relative
  readonly method: string
  readonly policy: "GET" | "POST" | "unclassified"
  readonly ok: boolean
  readonly missing: readonly string[]
  readonly reason: string
}

/** Exhaustive coverage: every exported HTTP method of every given route file is
 *  classified and evaluated. Unclassified methods fail closed. */
export function routePolicyCoverage(routeFiles: readonly string[]): RouteCoverageEntry[] {
  const entries: RouteCoverageEntry[] = []
  for (const file of routeFiles) {
    for (const report of analyzeRoute(file)) {
      const verdict = evaluateGuardPolicy(report)
      entries.push({ file: rel(file), method: report.method, policy: report.policy, ok: verdict.ok, missing: verdict.missing, reason: verdict.reason })
    }
  }
  return entries
}

// ═══ §F  domain environment-authority (AST, not substring) ═══════

/**
 * Detect references to the Node global `process` symbol in a source file (any
 * value use: `process.env`, `process["env"]`, `const {env} = process`,
 * `const p = process`). Comments and strings never produce an Identifier node,
 * so they cannot trigger. A local binding that shadows `process` is ignored
 * (its own declaration name is not a global reference).
 */
export function processSymbolReferences(file: string): number {
  const sf = parseSourceFile(file)
  let count = 0
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === "process") {
      const parent = node.parent
      const isPropName = parent && ts.isPropertyAccessExpression(parent) && parent.name === node
      const isDeclName = parent && (
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isParameter(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node)
      )
      const isImportName = parent && (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent))
      if (!isPropName && !isDeclName && !isImportName) count += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return count
}
