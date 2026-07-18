/**
 * Shared AST source-dependency graph + route-handler analysis for the refactor
 * architecture safety gates (Refactor Program, umbrella #182).
 *
 * Test-only. Uses the repository's TypeScript compiler API so the gates reason
 * about the REAL dependency forms and REAL handler calls instead of regex/name
 * matching. Every module dependency form is emitted as a normalized edge; an
 * unknown dependency form inside a protected layer is surfaced, never silently
 * dropped.
 */

import ts from "typescript"
import fs from "node:fs"
import path from "node:path"
import { builtinModules } from "node:module"
import { fileURLToPath } from "node:url"

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
export const appRoot = path.join(repoRoot, "app")

const SOURCE_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]
const RESOLVE_EXTS = [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx", ".mjs", ".cjs"]
// tsconfig: baseUrl ".", paths { "@/*": ["./app/*", "./*"] }
const ALIAS_ROOTS = ["app", ""]
const NODE_BUILTINS = new Set(builtinModules)

export type EdgeKind =
  | "static-import" // import x from "y"        (value)
  | "type-only-import" // import type x from "y"
  | "side-effect-import" // import "y"
  | "export-from" // export { a } from "y"
  | "export-star" // export * from "y"
  | "dynamic-import" // import("y")  (literal)
  | "import-equals" // import x = require("y")
  | "require" // require("y")  (literal)
  | "non-literal-dynamic" // import(expr) / require(expr)

export type TargetKind =
  | "relative"
  | "alias"
  | "bare-package"
  | "node-builtin"
  | "unresolved-internal"
  | "non-literal-dynamic"

export interface DependencyEdge {
  readonly sourceFile: string // absolute
  readonly specifier: string | null // null only for non-literal dynamic
  readonly edgeKind: EdgeKind
  readonly targetKind: TargetKind
  readonly resolvedTarget: string | null // absolute path when resolvable to a repo file
  readonly isTypeOnly: boolean
  readonly isLiteral: boolean
}

// Edge kinds that carry a runtime (value) dependency. type-only imports and
// type-only export-from are EXCLUDED — a module reached only through them is
// never loaded at runtime.
const RUNTIME_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "static-import",
  "side-effect-import",
  "export-from",
  "export-star",
  "dynamic-import",
  "import-equals",
  "require",
])

// ─── file discovery ─────────────────────────────────────────────

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

// ─── specifier resolution ───────────────────────────────────────

function resolveFileCandidate(base: string): string | null {
  const candidates = [base, ...RESOLVE_EXTS.map((e) => base + e), ...RESOLVE_EXTS.map((e) => path.join(base, "index" + e))]
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c } catch { /* keep looking */ }
  }
  return null
}

export function resolveSpecifier(
  fromFile: string,
  specifier: string,
): { targetKind: TargetKind; resolvedTarget: string | null } {
  if (specifier.startsWith(".")) {
    const resolved = resolveFileCandidate(path.resolve(path.dirname(fromFile), specifier))
    return { targetKind: resolved ? "relative" : "unresolved-internal", resolvedTarget: resolved }
  }
  if (specifier.startsWith("@/")) {
    const sub = specifier.slice(2)
    for (const aliasRoot of ALIAS_ROOTS) {
      const resolved = resolveFileCandidate(path.join(repoRoot, aliasRoot, sub))
      if (resolved) return { targetKind: "alias", resolvedTarget: resolved }
    }
    return { targetKind: "unresolved-internal", resolvedTarget: null }
  }
  const head = specifier.startsWith("node:") ? specifier : specifier.split("/")[0]
  if (specifier.startsWith("node:") || NODE_BUILTINS.has(head)) {
    return { targetKind: "node-builtin", resolvedTarget: null }
  }
  return { targetKind: "bare-package", resolvedTarget: null }
}

// ─── AST edge extraction ────────────────────────────────────────

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx") || file.endsWith(".jsx")) return ts.ScriptKind.TSX
  return ts.ScriptKind.TS
}

export function parseSourceFile(file: string): ts.SourceFile {
  const src = fs.readFileSync(file, "utf8")
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, /*setParentNodes*/ true, scriptKindFor(file))
}

function namedImportsAllTypeOnly(clause: ts.ImportClause): boolean {
  const nb = clause.namedBindings
  if (nb && ts.isNamedImports(nb) && nb.elements.length > 0) return nb.elements.every((e) => e.isTypeOnly)
  return false
}

export function parseModuleEdges(file: string): DependencyEdge[] {
  const sf = parseSourceFile(file)
  const edges: DependencyEdge[] = []

  const push = (specifier: string | null, edgeKind: EdgeKind, isTypeOnly: boolean, targetKindOverride?: TargetKind) => {
    if (specifier === null) {
      edges.push({ sourceFile: file, specifier: null, edgeKind, targetKind: "non-literal-dynamic", resolvedTarget: null, isTypeOnly: false, isLiteral: false })
      return
    }
    const r = targetKindOverride
      ? { targetKind: targetKindOverride, resolvedTarget: null as string | null }
      : resolveSpecifier(file, specifier)
    edges.push({ sourceFile: file, specifier, edgeKind, targetKind: r.targetKind, resolvedTarget: r.resolvedTarget, isTypeOnly, isLiteral: true })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      if (!clause) push(node.moduleSpecifier.text, "side-effect-import", false)
      else {
        const typeOnly = clause.isTypeOnly || namedImportsAllTypeOnly(clause)
        push(node.moduleSpecifier.text, typeOnly ? "type-only-import" : "static-import", typeOnly)
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const kind: EdgeKind = node.exportClause ? "export-from" : "export-star"
      push(node.moduleSpecifier.text, kind, node.isTypeOnly)
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

// ─── graph + reachability ───────────────────────────────────────

export function buildGraph(files: string[]): Map<string, DependencyEdge[]> {
  const graph = new Map<string, DependencyEdge[]>()
  for (const f of files) graph.set(f, parseModuleEdges(f))
  return graph
}

const edgeCache = new Map<string, DependencyEdge[]>()
function edgesOf(file: string): DependencyEdge[] {
  let e = edgeCache.get(file)
  if (!e) { e = parseModuleEdges(file); edgeCache.set(file, e) }
  return e
}

export interface ReachabilityOptions {
  /** Follow only runtime (value) edges. Type-only edges are excluded. Default true. */
  readonly runtimeOnly?: boolean
}

/** BFS over the AST graph from `entries` (absolute paths). Returns absolute paths. */
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
      if (runtimeOnly && !RUNTIME_EDGE_KINDS.has(edge.edgeKind)) continue
      if (edge.resolvedTarget && !seen.has(edge.resolvedTarget)) queue.push(edge.resolvedTarget)
    }
  }
  return seen
}

// ─── deterministic runtime entry inventory ──────────────────────

/**
 * The known runtime entry points on the program base: the App Router page +
 * layout and every API route. Listed explicitly (not just discovered) so that
 * DELETING a known route fails the reachability test. Discovery may find MORE
 * (new routes) but never fewer of these.
 */
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
  for (const rel of ["app/page.tsx", "app/layout.tsx"]) {
    const abs = path.join(repoRoot, rel)
    if (fs.existsSync(abs)) entries.push(abs)
  }
  const apiRoot = path.join(appRoot, "api")
  const stack = [apiRoot]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (entry.name === "route.ts" || entry.name === "route.tsx") entries.push(p)
    }
  }
  return entries
}

export const rel = (p: string): string => path.relative(repoRoot, p).split(path.sep).join("/")
export const abs = (relPath: string): string => path.join(repoRoot, relPath)

// ─── route handler call analysis ────────────────────────────────

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])

export interface HandlerAnalysis {
  readonly method: string
  /** Every function/method name actually invoked along the handler's call path
   *  (handler body + transitively-called LOCAL helpers), excluding dead code
   *  after an unconditional return/throw and excluding unused helpers. */
  readonly calledNames: ReadonlySet<string>
  /** Same calls in source-linear order (helpers inlined at their call site). */
  readonly orderedNames: readonly string[]
}

function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return null
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  return !!mods && mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
}

interface LocalFn { readonly name: string; readonly body: ts.Node }

function collectLocalFunctions(sf: ts.SourceFile): Map<string, ts.Node> {
  const fns = new Map<string, ts.Node>()
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      fns.set(stmt.name.text, stmt.body)
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
          fns.set(decl.name.text, decl.initializer.body)
        }
      }
    }
  }
  return fns
}

function collectExportedHandlers(sf: ts.SourceFile): LocalFn[] {
  const handlers: LocalFn[] = []
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body && HTTP_METHODS.has(stmt.name.text) && hasExportModifier(stmt)) {
      handlers.push({ name: stmt.name.text, body: stmt.body })
    } else if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && HTTP_METHODS.has(decl.name.text) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
          handlers.push({ name: decl.name.text, body: decl.initializer.body })
        }
      }
    }
  }
  return handlers
}

function isUnconditionalTerminator(stmt: ts.Statement): boolean {
  return ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)
}

/**
 * Analyze one exported handler: collect calls actually reachable along the
 * handler's execution, inlining LOCAL helper functions at their call site and
 * pruning statements after an unconditional return/throw in the same block.
 */
export function analyzeHandler(handlerBody: ts.Node, localFns: Map<string, ts.Node>, method: string): HandlerAnalysis {
  const ordered: string[] = []
  const inlineStack = new Set<string>()

  const walkNode = (node: ts.Node): void => {
    if (ts.isBlock(node)) {
      for (const stmt of node.statements) {
        walkNode(stmt)
        if (isUnconditionalTerminator(stmt)) break // subsequent siblings are dead code
      }
      return
    }
    if (ts.isCallExpression(node)) {
      // Evaluate arguments first (they run before/around the call in practice;
      // for our name-set + ordering purposes either order is acceptable, but we
      // record the callee at its lexical position after visiting the callee expr).
      const name = calleeName(node.expression)
      // Visit the callee's object side (e.g. obj in obj.method()) and arguments
      // so nested calls are captured in a stable order.
      ts.forEachChild(node.expression, walkNode)
      for (const arg of node.arguments) walkNode(arg)
      if (name) {
        ordered.push(name)
        const localBody = localFns.get(name)
        if (localBody && !inlineStack.has(name)) {
          inlineStack.add(name)
          walkNode(localBody)
          inlineStack.delete(name)
        }
      }
      return
    }
    ts.forEachChild(node, walkNode)
  }

  walkNode(handlerBody)
  return { method, calledNames: new Set(ordered), orderedNames: ordered }
}

/** Analyze every exported HTTP handler in a route module (by absolute path). */
export function analyzeRouteModule(absFile: string): HandlerAnalysis[] {
  const sf = parseSourceFile(absFile)
  const localFns = collectLocalFunctions(sf)
  return collectExportedHandlers(sf).map((h) => analyzeHandler(h.body, localFns, h.name))
}

/** Method names that mutate repository / provider state (used for #156 and ordering). */
export const STATE_CHANGING_CALLS: ReadonlySet<string> = new Set([
  "upsert", "create", "append", "recordEvent", "insert", "update", "updateStatus",
  "markApprovalUsed", "claimApprovalForRuntime", "runToolBackendRequest", "authorizeRuntimeCommand",
])

// ─── layer dependency policies (shared by real + adversarial tests) ──

export interface PolicyResult { readonly ok: boolean; readonly reason: string }
const OK: PolicyResult = { ok: true, reason: "" }
const deny = (reason: string): PolicyResult => ({ ok: false, reason })

/** Edge kinds that are opaque/deferred module loading — forbidden inside any
 *  protected layer regardless of where they point (they defeat static review). */
function isOpaqueForm(edge: DependencyEdge): boolean {
  return edge.edgeKind === "require" || edge.edgeKind === "non-literal-dynamic"
}

const APPLICATION_FORBIDDEN_INTERNAL = [
  "app/lib/infrastructure/",
  "app/lib/persistence/",
  "app/lib/workunitInbox/sources/",
]
const RUNTIME_ENV_AUTHORITY = "app/lib/runtime/requestRuntimeConfig.ts"

/**
 * Domain policy: a domain module may depend ONLY on domain + tenant modules,
 * by any resolvable value/type edge. Everything else is a violation, including
 * bare packages, Node builtins, require(), non-literal dynamic imports, and any
 * cross-layer edge (even type-only). process.env is checked separately from text.
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

/** An exact, edge-level exception: source+target VALUE edge tolerated pending a
 *  tracked removal. It authorizes ONLY that one source→target pair. */
export interface EdgeException {
  readonly source: string // repo-relative
  readonly target: string // repo-relative
  readonly reason: string
  readonly removalIssue: string
}

/**
 * EXACT edge-level exceptions for the application layer. Each is a pre-existing
 * VALUE edge tracked for removal; an exception authorizes ONLY its one
 * source→target pair (it does NOT license any other import from that source).
 * Replaces the previous file-level exception. Shrink-only.
 */
export const APPLICATION_EDGE_EXCEPTIONS: readonly EdgeException[] = [
  {
    source: "app/lib/application/auth/sessionResolver.ts",
    target: "app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts",
    reason: "sessionResolver constructs control repositories directly; to be inverted behind a port",
    removalIssue: "#182 (workstream refactor/tenant-security)",
  },
  {
    source: "app/lib/application/auth/sessionResolver.ts",
    target: "app/lib/runtime/requestRuntimeConfig.ts",
    reason: "sessionResolver reads the runtime env authority directly; to be threaded from the composition root",
    removalIssue: "#182 (workstream refactor/tenant-security)",
  },
]

/**
 * Application policy. Violations:
 *  - any bare-package or Node-builtin edge (incl. type-only) — application must
 *    hold no third-party/runtime-capability references;
 *  - require() / non-literal dynamic import — opaque forms;
 *  - a VALUE (non-type-only) edge into infrastructure, persistence, provider
 *    sources, or the runtime env authority — unless an EXACT edge exception
 *    matches (source AND target). Type-only edges to internal type modules are
 *    allowed (shared contracts, no runtime coupling).
 * The exact exception for one source does NOT authorize its other imports.
 */
export function classifyApplicationEdge(edge: DependencyEdge, exceptions: readonly EdgeException[]): PolicyResult {
  if (edge.targetKind === "bare-package") return deny(`third-party/provider package "${edge.specifier}"`)
  if (edge.targetKind === "node-builtin") return deny(`Node capability builtin "${edge.specifier}"`)
  if (isOpaqueForm(edge)) return deny(`opaque module form ${edge.edgeKind}`)

  const targetRel = edge.resolvedTarget ? rel(edge.resolvedTarget) : (edge.specifier ?? "")
  const resolvedForbidden = !!edge.resolvedTarget &&
    (APPLICATION_FORBIDDEN_INTERNAL.some((p) => targetRel.startsWith(p)) || targetRel === RUNTIME_ENV_AUTHORITY)
  // A literal dynamic import may not resolve in a fixture; match its specifier too.
  const dynamicForbidden = edge.edgeKind === "dynamic-import" &&
    /(^|\/)infrastructure\/|(^|\/)persistence\/|workunitInbox\/sources\/|runtime\/requestRuntimeConfig/.test(edge.specifier ?? "")

  if ((resolvedForbidden || dynamicForbidden) && !edge.isTypeOnly) {
    const src = rel(edge.sourceFile)
    const tgt = edge.resolvedTarget ? rel(edge.resolvedTarget) : (edge.specifier ?? "")
    if (exceptions.some((x) => x.source === src && x.target === tgt)) return OK
    return deny(`application must not take a value dependency on ${tgt}`)
  }
  return OK
}

/** Repo-relative known entry points that are missing from disk (route deletion detector). */
export function knownEntryPointsMissing(known: readonly string[]): string[] {
  return known.filter((r) => !fs.existsSync(path.join(repoRoot, r)))
}
