/**
 * Shared route-surface analysis for the security test suites.
 *
 * WHY THIS FILE EXISTS
 *   The ratified architecture rule is: reuse shared analysis machinery; do not
 *   ship a second generic scanner. `securityRefactorCriteriaRatchet` and
 *   `safeMethodWriteInvariant` both need AST route discovery, and duplicating it
 *   would mean two scanners that could silently disagree. This module is the
 *   single implementation both import.
 *
 * CONTRACT
 *   - Registers NO tests. Importing it must not add a test to any suite.
 *   - Holds no top-level mutable operational state; every export is a pure
 *     function or a frozen constant, so import order can never change a result.
 *   - Imported ONLY by test modules. No production module may import it, and it
 *     imports no production module (`isNextRouteFile` takes the page extensions
 *     as a parameter rather than reading `next.config.ts`).
 *   - Fails closed: parse diagnostics throw, unsupported export forms throw, and
 *     an unresolvable module-local callee throws. Nothing is silently skipped.
 *   - Route ordering is deterministic (`key` ascending), so both consumers see
 *     the same sequence.
 *
 * Both consuming suites keep their OWN positive controls, so a defect introduced
 * here is detectable independently from either side.
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { listFiles } from "../../scripts/lib/typescriptModuleGraph.mjs"

export const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"] as const
export type HttpMethod = typeof HTTP_METHODS[number]

export const SAFE_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>(["GET", "HEAD", "OPTIONS"])
export const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"])
export const DEFAULT_NEXT_EXTENSIONS = ["js", "jsx", "ts", "tsx"] as const

export type RouteExport = {
  readonly key: string
  readonly file: string
  readonly method: HttpMethod
  /** SHA-256 of the printed handler node. */
  readonly handlerHash: string
  /** SHA-256 of the whole module, newline-normalized. */
  readonly routeHash: string
  readonly callNames: string[]
  readonly node: ts.Node
  readonly sourceFile: ts.SourceFile
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/** Parse a module, throwing on ANY parse diagnostic rather than returning a partial tree. */
export function parseSource(file: string, source: string): ts.SourceFile {
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const diagnostics = (parsed as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  if (diagnostics.length > 0) {
    throw new Error(`Unable to parse ${file}: ${diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("; ")}`)
  }
  return parsed
}

export function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
}

export function isCommonJsExport(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression)) return false
  if (node.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false
  return /^(?:module\.)?exports(?:\.|\[|$)/.test(node.expression.left.getText(sourceFile))
}

/** Every called identifier and property name inside a subtree, sorted. */
export function collectCallNames(node: ts.Node): string[] {
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

/**
 * Discover exported HTTP handlers, covering every supported export spelling:
 * `export function`, `export const`, `export { x }` and named re-export.
 *
 * Throws on `export *`, `export * as ns`, `export =` and CommonJS — an exotic
 * form must fail the build, never yield an empty surface.
 */
export function extractRouteExports(file: string, source: string): RouteExport[] {
  const sourceFile = parseSource(file, source)
  const routeHash = hash(source.replace(/\r\n/g, "\n"))
  const surfaces: RouteExport[] = []
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
      node,
      sourceFile,
    })
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      && !hasModifier(statement, ts.SyntaxKind.DefaultKeyword) && statement.name) add(statement.name.text, statement)
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) add(declaration.name.text, statement)
      }
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) {
        throw new Error(`export * is forbidden in route handler: ${file}`)
      }
      if (!statement.isTypeOnly && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) if (!element.isTypeOnly) add(element.name.text, statement)
      }
    }
    if (ts.isExportAssignment(statement) && statement.isExportEquals) {
      throw new Error(`CommonJS route exports are forbidden: ${file}`)
    }
    if (isCommonJsExport(statement, sourceFile)) {
      throw new Error(`CommonJS route exports are forbidden: ${file}`)
    }
  }
  return surfaces
}

export function isNextRouteFile(file: string, extensions: readonly string[] = DEFAULT_NEXT_EXTENSIONS): boolean {
  return extensions.some((extension) => path.basename(file) === `route.${extension.replace(/^\./, "")}`)
}

/**
 * Scan every route module under `<rootDir>/app/api`, sorted by key.
 * Throws when two modules export the same method key.
 */
export async function scanRouteExports(
  rootDir: string,
  extensions: readonly string[] = DEFAULT_NEXT_EXTENSIONS,
): Promise<RouteExport[]> {
  const files = (await listFiles(path.join(rootDir, "app/api"))).filter((file: string) => isNextRouteFile(file, extensions))
  if (files.length === 0) throw new Error("route discovery found no route modules")
  const surfaces = (await Promise.all(files.map(async (file: string) => {
    const relative = path.relative(rootDir, file).split(path.sep).join("/")
    return extractRouteExports(relative, await readFile(file, "utf8"))
  }))).flat().sort((left, right) => left.key.localeCompare(right.key))
  if (new Set(surfaces.map((item) => item.key)).size !== surfaces.length) {
    throw new Error("duplicate HTTP method export across route modules")
  }
  return surfaces
}

/** Globals a route may call without a module-local declaration or import. */
export function isAmbient(name: string): boolean {
  return AMBIENT_NAMES.has(name)
}

const AMBIENT_NAMES: ReadonlySet<string> = new Set([
  "require", "fetch", "structuredClone", "queueMicrotask", "setTimeout", "clearTimeout",
  "parseInt", "parseFloat", "isNaN", "encodeURIComponent", "decodeURIComponent", "String",
  "Number", "Boolean", "Array", "Object", "Error", "Promise", "Symbol", "BigInt", "Date",
  "Map", "Set", "WeakMap", "WeakSet", "JSON", "Math", "RegExp", "URL", "URLSearchParams",
  "Request", "Response", "Headers", "TextEncoder", "TextDecoder", "AbortController",
  "ReadableStream", "Uint8Array", "atob", "btoa", "crypto", "console",
])

/**
 * Call names reachable from a handler through MODULE-LOCAL helpers, to fixpoint.
 *
 * FAIL-CLOSED: a bare-identifier callee that resolves to neither a module-local
 * declaration, an import, nor a known ambient global THROWS. It is never
 * skipped — a silently dropped edge is exactly how a renamed writer would hide.
 */
export function closureCallNames(handler: RouteExport): string[] {
  const sourceFile = handler.sourceFile
  const localFunctions = new Map<string, ts.Node>()
  const importedNames = new Set<string>()
  const localValues = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) localFunctions.set(statement.name.text, statement)
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        localValues.add(declaration.name.text)
        if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
          localFunctions.set(declaration.name.text, declaration.initializer)
        }
      }
    }
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const clause = statement.importClause
      if (clause.name) importedNames.add(clause.name.text)
      if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) importedNames.add(element.name.text)
        } else importedNames.add(clause.namedBindings.name.text)
      }
    }
    if (ts.isClassDeclaration(statement) && statement.name) localValues.add(statement.name.text)
  }

  const collected = new Set<string>()
  const visited = new Set<ts.Node>()
  const walk = (node: ts.Node) => {
    if (visited.has(node)) return
    visited.add(node)
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child)) {
        if (ts.isPropertyAccessExpression(child.expression)) {
          collected.add(child.expression.name.text)
        } else if (ts.isIdentifier(child.expression)) {
          const name = child.expression.text
          collected.add(name)
          const local = localFunctions.get(name)
          if (local) walk(local)
          else if (!importedNames.has(name) && !localValues.has(name) && !isAmbient(name)) {
            throw new Error(`unresolved module-local callee: ${name}`)
          }
        }
      }
      ts.forEachChild(child, visit)
    }
    ts.forEachChild(node, visit)
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) visit(node)
  }
  walk(handler.node)
  return [...collected].sort()
}
