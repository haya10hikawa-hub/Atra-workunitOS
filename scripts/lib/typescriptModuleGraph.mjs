import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const ignoredDirs = new Set(["node_modules", ".next", ".open-next", "dist", "coverage"])
const codeFilePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/i
const nodeModuleSpecifiers = new Set(["module", "node:module"])
const legacyTargets = [
  "app/lib/workunitInbox/",
  "app/lib/actionField/",
  "app/components/workunitInbox/",
  "app/components/legacy/workunitInbox/",
]
const legacySurfaceRoots = legacyTargets

export async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    if (ignoredDirs.has(entry.name)) return []
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(fullPath)
    return [fullPath]
  }))
  return nested.flat().sort()
}

export function isCodeFilePath(filePath) {
  return codeFilePattern.test(filePath)
}

export function extractModuleReferences(source, filePath = "module.ts") {
  const scriptKind = scriptKindFor(filePath)
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind)
  if (sourceFile.parseDiagnostics.length > 0) {
    const detail = sourceFile.parseDiagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n")
    throw new Error(`Unable to parse ${filePath}:\n${detail}`)
  }

  const bindings = collectBindings(sourceFile)
  inferLoaderBindings(bindings)
  const references = []
  const add = (kind, node) => {
    if (!node || (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node))) {
      throw new Error(`Non-literal ${kind} is forbidden in ${filePath}`)
    }
    references.push({ kind, specifier: node.text })
  }
  const addLocalExports = (node) => {
    if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return
    const seen = new Set()
    for (const element of node.exportClause.elements) {
      const localName = (element.propertyName ?? element.name).text
      const binding = resolveBinding(bindings, localName, element.getStart(sourceFile))
      if (!binding?.exportSource || seen.has(binding.exportSource.text)) continue
      seen.add(binding.exportSource.text)
      add("export", binding.exportSource)
    }
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      add(node.importClause?.isTypeOnly ? "import-type" : "import", node.moduleSpecifier)
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add("export", node.moduleSpecifier)
      else addLocalExports(node)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add("import-equals", node.moduleReference.expression)
      if (hasExportModifier(node)) add("export", node.moduleReference.expression)
    } else if (ts.isExportAssignment(node)) {
      const expression = unwrapExpression(node.expression)
      if (ts.isIdentifier(expression)) {
        const binding = resolveBinding(bindings, expression.text, expression.getStart(sourceFile))
        if (binding?.exportSource) add("export", binding.exportSource)
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add("dynamic-import", node.arguments[0])
    } else if (ts.isCallExpression(node) && isRequireCall(node, bindings, sourceFile)) {
      add("require", node.arguments[0])
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add("import-type-expression", node.argument.literal)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return references
}

export async function scanModuleGraph(rootDir, scanRoots) {
  const compilerOptions = loadCompilerOptions(rootDir)
  const files = (await Promise.all(scanRoots.map(async (scanRoot) => {
    const rootPath = path.join(rootDir, scanRoot)
    return (await listFiles(rootPath)).filter(isCodeFilePath)
  }))).flat()

  const edges = []
  for (const filePath of files) {
    const source = await readFile(filePath, "utf8")
    for (const reference of extractModuleReferences(source, filePath)) {
      edges.push({
        file: normalize(path.relative(rootDir, filePath)),
        kind: reference.kind,
        specifier: reference.specifier,
        resolvedTarget: resolveTarget(rootDir, compilerOptions, filePath, reference.specifier),
      })
    }
  }
  return edges.sort(compareEdges)
}

export function legacyEdgeKey(edge) {
  return `${edge.kind} | ${edge.file} | ${edge.specifier} | ${edge.resolvedTarget}`
}

export function findLegacyEdges(edges) {
  return edges.flatMap((edge) => {
    const targetsLegacy = legacyTargets.some((prefix) => isWithin(edge.resolvedTarget, prefix))
    const originatesInLegacy = legacySurfaceRoots.some((prefix) => isWithin(edge.file, prefix))
    if (!targetsLegacy && !originatesInLegacy) return []
    return [{ ...edge, category: targetsLegacy ? "legacy-target" : "legacy-surface" }]
  })
}

export function multisetDifference(left, right) {
  const remaining = new Map()
  for (const item of right) remaining.set(item, (remaining.get(item) ?? 0) + 1)
  return left.filter((item) => {
    const count = remaining.get(item) ?? 0
    if (count === 0) return true
    remaining.set(item, count - 1)
    return false
  })
}

export function resolveModuleTarget(rootDir, filePath, specifier) {
  return resolveTarget(rootDir, loadCompilerOptions(rootDir), filePath, specifier)
}

function loadCompilerOptions(rootDir) {
  const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, "tsconfig.json")
  if (!configPath) throw new Error(`tsconfig.json not found under ${rootDir}`)
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile)
  if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"))
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath))
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"))
  }
  return parsed.options
}

function resolveTarget(rootDir, compilerOptions, filePath, specifier) {
  const resolved = ts.resolveModuleName(specifier, filePath, compilerOptions, ts.sys).resolvedModule?.resolvedFileName
  if (resolved) return normalize(path.relative(rootDir, resolved))
  if (specifier.startsWith(".")) return normalize(path.relative(rootDir, path.resolve(path.dirname(filePath), specifier)))
  if (specifier.startsWith("@/")) {
    const aliasPath = specifier.slice(2)
    return normalize(aliasPath.startsWith("app/") ? aliasPath : path.join("app", aliasPath))
  }
  return specifier
}

function scriptKindFor(filePath) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (/\.(?:cjs|mjs|js)$/.test(lower)) return ts.ScriptKind.JS
  if (/\.(?:cts|mts|ts)$/.test(lower)) return ts.ScriptKind.TS
  throw new Error(`Unsupported code file: ${filePath}`)
}

function collectBindings(sourceFile) {
  const bindings = []
  const addBinding = (name, declaration, scope, role = "other", exportSource = undefined, initializer = undefined, boundProperty = undefined) => {
    if (!name || !scope) return
    bindings.push({
      name,
      role,
      exportSource,
      initializer,
      boundProperty,
      declarationStart: declaration.getStart(sourceFile),
      scopeStart: scope.getFullStart(),
      scopeEnd: scope.end,
      scopeDepth: depthOf(scope),
    })
  }
  const addNames = (name, declaration, scope, role = "other", exportSource = undefined, initializer = undefined, boundProperty = undefined) => {
    if (ts.isIdentifier(name)) {
      addBinding(name.text, declaration, scope, role, exportSource, initializer, boundProperty)
      return
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) {
        const property = ts.isIdentifier(element.propertyName ?? element.name)
          ? (element.propertyName ?? element.name).text
          : undefined
        addNames(element.name, declaration, scope, role, exportSource, initializer, property)
      }
    }
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const source = node.moduleSpecifier
      const sourceName = ts.isStringLiteralLike(source) ? source.text : ""
      const scope = sourceFile
      if (node.importClause.name) {
        addBinding(node.importClause.name.text, node, scope, nodeModuleSpecifiers.has(sourceName) ? "module-namespace" : "other", source)
      }
      const named = node.importClause.namedBindings
      if (named && ts.isNamespaceImport(named)) {
        addBinding(named.name.text, named, scope, nodeModuleSpecifiers.has(sourceName) ? "module-namespace" : "other", source)
      } else if (named) {
        for (const element of named.elements) {
          const importedName = (element.propertyName ?? element.name).text
          const role = nodeModuleSpecifiers.has(sourceName) && importedName === "createRequire" ? "require-factory" : "other"
          addBinding(element.name.text, element, scope, role, source)
        }
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const source = ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression : undefined
      addBinding(node.name.text, node, nearestScope(node, false), "other", source)
    } else if (ts.isVariableDeclaration(node)) {
      const blockScoped = ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.BlockScoped) !== 0
      addNames(node.name, node, nearestScope(node, blockScoped), "other", undefined, node.initializer)
    } else if (ts.isParameter(node)) {
      addNames(node.name, node, nearestFunction(node))
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      addBinding(node.name.text, node, nearestScope(node, true))
    } else if (ts.isFunctionExpression(node) && node.name) {
      addBinding(node.name.text, node, node)
    } else if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) {
      addBinding(node.name.text, node, ts.isClassExpression(node) ? node : nearestScope(node, true))
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      addNames(node.variableDeclaration.name, node.variableDeclaration, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return bindings
}

function inferLoaderBindings(bindings) {
  for (let changed = true; changed;) {
    changed = false
    for (const binding of bindings) {
      if (!binding.initializer || binding.role !== "other") continue
      const role = roleForInitializer(binding.initializer, bindings, binding.boundProperty)
      if (!role) continue
      binding.role = role
      changed = true
    }
  }
}

function roleForInitializer(initializer, bindings, boundProperty) {
  const expression = unwrapExpression(initializer)
  if (isNodeModuleImport(expression) || isNodeModuleRequire(expression, bindings)) {
    return boundProperty === "createRequire" ? "require-factory" : boundProperty ? undefined : "module-namespace"
  }
  if (ts.isIdentifier(expression)) {
    const binding = resolveBinding(bindings, expression.text, expression.getStart())
    if (binding?.role === "module-namespace" && boundProperty === "createRequire") return "require-factory"
    if (binding?.role === "loader" || binding?.role === "require-factory" || binding?.role === "module-namespace") return binding.role
    if (expression.text === "require" && !binding) return "loader"
  }
  if (ts.isCallExpression(expression) && isCreateRequireFactory(expression.expression, bindings, expression.getStart())) return "loader"
  return undefined
}

function isNodeModuleImport(expression) {
  return ts.isCallExpression(expression)
    && expression.expression.kind === ts.SyntaxKind.ImportKeyword
    && expression.arguments.length === 1
    && ts.isStringLiteralLike(expression.arguments[0])
    && nodeModuleSpecifiers.has(expression.arguments[0].text)
}

function isNodeModuleRequire(expression, bindings) {
  if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) return false
  const callee = unwrapExpression(expression.expression)
  const isLoader = ts.isIdentifier(callee)
    && (resolveBinding(bindings, callee.text, callee.getStart())?.role === "loader"
      || (callee.text === "require" && !resolveBinding(bindings, callee.text, callee.getStart())))
  return isLoader && ts.isStringLiteralLike(expression.arguments[0])
    && nodeModuleSpecifiers.has(expression.arguments[0].text)
}

function isRequireCall(node, bindings, sourceFile) {
  const expression = unwrapExpression(node.expression)
  if (ts.isIdentifier(expression)) {
    const binding = resolveBinding(bindings, expression.text, expression.getStart(sourceFile))
    return binding?.role === "loader" || (expression.text === "require" && !binding)
  }
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === "require") {
    const owner = unwrapExpression(expression.expression)
    return ts.isIdentifier(owner) && owner.text === "module" && !resolveBinding(bindings, owner.text, owner.getStart(sourceFile))
  }
  return ts.isCallExpression(expression) && isCreateRequireFactory(expression.expression, bindings, expression.getStart(sourceFile))
}

function isCreateRequireFactory(expression, bindings, position) {
  const target = unwrapExpression(expression)
  if (ts.isIdentifier(target)) return resolveBinding(bindings, target.text, position)?.role === "require-factory"
  if (!ts.isPropertyAccessExpression(target) || target.name.text !== "createRequire") return false
  const owner = unwrapExpression(target.expression)
  return ts.isIdentifier(owner) && resolveBinding(bindings, owner.text, position)?.role === "module-namespace"
}

function resolveBinding(bindings, name, position) {
  return bindings
    .filter((binding) => binding.name === name && binding.scopeStart <= position && position < binding.scopeEnd)
    .sort((a, b) => b.scopeDepth - a.scopeDepth || b.declarationStart - a.declarationStart)[0]
}

function nearestFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) return current
  }
  return undefined
}

function nearestScope(node, blockScoped) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isSourceFile(current) || ts.isFunctionLike(current)) return current
    if (blockScoped && (ts.isBlock(current) || ts.isCaseBlock(current) || ts.isCatchClause(current))) return current
  }
  return undefined
}

function unwrapExpression(node) {
  let current = node
  while (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isAwaitExpression(current)) current = current.expression
  return current
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function depthOf(node) {
  let depth = 0
  for (let current = node.parent; current; current = current.parent) depth += 1
  return depth
}

function isWithin(value, prefix) {
  return value === prefix.slice(0, -1) || value.startsWith(prefix)
}

function compareEdges(a, b) {
  return a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind) || a.specifier.localeCompare(b.specifier)
}

function normalize(value) {
  return value.split(path.sep).join("/")
}
