import { readFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { isCodeFilePath } from "../typescriptModuleGraph.mjs"
import { isExecutableCommand, packageScriptReference, readCommandLine } from "./commands.mjs"
import { resolveReferenceTarget } from "./targets.mjs"

export const REFERENCE_TYPES = [
  "PATH_STRING",
  "CONFIG_REFERENCE",
  "PACKAGE_SCRIPT",
  "OPERATOR_COMMAND",
  "DOCUMENTATION_COMMAND",
]

// Source-controlled configuration whose string values name repository paths.
const configFiles = [
  "package.json",
  "tsconfig.json",
  "wrangler.json",
  "next.config.ts",
  "open-next.config.ts",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "electron/package.json",
]
const configFilePattern = /^(?:tsconfig\..+\.json|wrangler\..+\.json|next\.config\.[cm]?[jt]s|open-next\.config\.[cm]?[jt]s)$/
const workflowPattern = /^\.github\/(?:workflows\/.+\.ya?ml|.+\.ya?ml)$/
const documentationPattern = /^docs\/.+\.md$|(?:^|\/)README\.md$/
const shellScriptPattern = /\.sh$/

export function isConfigFile(file) {
  return configFiles.includes(file) || configFilePattern.test(file)
}

export function isDocumentationFile(file) {
  return documentationPattern.test(file)
}

/**
 * Scan every source-controlled file for references that the TypeScript module
 * graph cannot see. Each reference keeps its class, so a documented command is
 * never conflated with an English mention of a filename.
 */
export async function scanNonImportReferences(rootDir, inventory) {
  const references = []
  const anomalies = []
  for (const file of inventory.files) {
    const absolute = path.join(rootDir, file)
    if (file === "package.json") {
      references.push(...await scanPackageJson(inventory, absolute, file))
    } else if (isConfigFile(file)) {
      references.push(...await scanConfigFile(inventory, absolute, file))
    } else if (workflowPattern.test(file)) {
      references.push(...await scanWorkflow(inventory, absolute, file))
    } else if (shellScriptPattern.test(file)) {
      references.push(...await scanShellScript(inventory, absolute, file))
    } else if (isDocumentationFile(file)) {
      references.push(...await scanDocumentation(inventory, absolute, file, anomalies))
    } else if (isCodeFilePath(file)) {
      references.push(...await scanCodePathStrings(inventory, absolute, file))
    }
  }
  return {
    references: dedupe(references),
    documentationAnomalies: anomalies.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
  }
}

async function scanPackageJson(inventory, absolute, file) {
  const manifest = JSON.parse(await readFile(absolute, "utf8"))
  const references = []
  const scripts = manifest.scripts ?? {}
  for (const scriptName of Object.keys(scripts).sort()) {
    references.push(...commandReferences(inventory, file, scripts[scriptName], "PACKAGE_SCRIPT", `scripts.${scriptName}`))
  }
  const withoutScripts = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== "scripts"))
  for (const value of collectJsonStrings(withoutScripts)) {
    references.push(...targetReferences(inventory, file, value, "CONFIG_REFERENCE", undefined))
  }
  return references
}

async function scanConfigFile(inventory, absolute, file) {
  const values = file.endsWith(".json")
    ? collectJsonStrings(JSON.parse(await readFile(absolute, "utf8")))
    : collectSourceStringLiterals(await readFile(absolute, "utf8"), absolute)
  return values.flatMap((value) => targetReferences(inventory, file, value, "CONFIG_REFERENCE", undefined))
}

async function scanCodePathStrings(inventory, absolute, file) {
  const values = collectSourceStringLiterals(await readFile(absolute, "utf8"), absolute)
  return values.flatMap((value) => targetReferences(inventory, file, value, "PATH_STRING", undefined))
}

async function scanWorkflow(inventory, absolute, file) {
  const source = await readFile(absolute, "utf8")
  return readWorkflowRunSteps(source, file).flatMap((step) =>
    commandReferences(inventory, file, step.command, "OPERATOR_COMMAND", step.location))
}

async function scanShellScript(inventory, absolute, file) {
  const source = await readFile(absolute, "utf8")
  return source
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.length > 0 && isExecutableCommand(line))
    .flatMap((line) => commandReferences(inventory, file, line, "OPERATOR_COMMAND", undefined))
}

async function scanDocumentation(inventory, absolute, file, anomalies) {
  const source = await readFile(absolute, "utf8")
  const read = readDocumentationCommands(source, file)
  anomalies.push(...read.anomalies)
  return read.commands
    .flatMap((command) => commandReferences(inventory, file, command, "DOCUMENTATION_COMMAND", undefined))
}

/**
 * Fenced shell blocks and inline code spans. An inline span only counts when it
 * parses as an executable command, which is what separates a documented
 * operator step from prose naming a module.
 *
 * Fence handling follows CommonMark: a fence left open at end of document runs
 * to the end of the document. Markdown has no strict grammar, so an imbalance
 * is not a parse failure — but it does suppress inline-span reading for the
 * remainder of the file, so it is reported as an anomaly and reconciled rather
 * than passed over in silence.
 */
export function readDocumentationCommands(source, file = "document.md") {
  const commands = []
  const anomalies = []
  const lines = source.split("\n")
  let fenceMarker
  let fenceIsShell = false
  let fenceStartLine = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence && !fenceMarker) {
      fenceMarker = fence[1][0].repeat(3)
      fenceIsShell = /^(?:bash|sh|shell|zsh|console|shellsession)\b/i.test(fence[2].trim())
      fenceStartLine = index + 1
      continue
    }
    if (fence && fenceMarker && fence[1].startsWith(fenceMarker) && fence[2].trim().length === 0) {
      fenceMarker = undefined
      fenceIsShell = false
      continue
    }
    if (fenceMarker) {
      if (fenceIsShell) {
        const command = line.replace(/^\s*\$\s+/, "").trim()
        if (command.length > 0 && !command.startsWith("#") && isExecutableCommand(command)) commands.push(command)
      }
      continue
    }
    for (const span of line.matchAll(/`([^`]+)`/g)) {
      if (isExecutableCommand(span[1])) commands.push(span[1].trim())
    }
  }
  if (fenceMarker) anomalies.push({ file, anomaly: "unterminated_code_fence", line: fenceStartLine })
  return { commands, anomalies }
}

/**
 * Read `run:` steps out of a workflow without a YAML dependency: plain scalars
 * and `|`/`>` block scalars are both supported, and anything else throws rather
 * than being skipped.
 */
export function readWorkflowRunSteps(source, file = "workflow.yml") {
  const steps = []
  const lines = source.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)-?\s*run:\s*(.*)$/.exec(lines[index])
    if (!match) continue
    const [, indent, inline] = match
    const location = `${file}:${index + 1}`
    const trimmedInline = inline.trim()
    if (trimmedInline.length > 0 && trimmedInline !== "|" && trimmedInline !== ">" && trimmedInline !== "|-" && trimmedInline !== ">-") {
      steps.push({ command: stripScalarQuotes(trimmedInline), location })
      continue
    }
    if (trimmedInline.length > 0 && !["|", ">", "|-", ">-"].includes(trimmedInline)) {
      throw new Error(`Unreadable run step at ${location}`)
    }
    const body = []
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor]
      if (candidate.trim().length === 0) {
        body.push("")
        continue
      }
      const candidateIndent = /^(\s*)/.exec(candidate)[1]
      if (candidateIndent.length <= indent.length) break
      body.push(candidate.trim())
      index = cursor
    }
    const command = body.join("\n").trim()
    if (command.length === 0) throw new Error(`Empty run block at ${location}`)
    steps.push({ command, location })
  }
  return steps
}

function commandReferences(inventory, file, commandLine, referenceType, location) {
  const references = []
  for (const command of readCommandLine(commandLine)) {
    const scriptName = packageScriptReference(command)
    if (scriptName !== undefined) {
      references.push({
        sourceFile: file,
        referenceType,
        referencedValue: `npm:${scriptName}`,
        normalizedTarget: `package.json#scripts.${scriptName}`,
        resolution: "package_script",
        location,
      })
    }
    for (const operand of command.operands) {
      references.push(...targetReferences(inventory, file, operand, referenceType, location, { executableOperand: true, expandGlobs: true }))
    }
  }
  return references
}

function targetReferences(inventory, file, rawValue, referenceType, location, options = {}) {
  return resolveReferenceTarget(inventory, rawValue, options)
    .filter((resolved) => resolved.resolution !== "external")
    .map((resolved) => ({
      sourceFile: file,
      referenceType,
      referencedValue: rawValue.trim(),
      normalizedTarget: resolved.normalizedTarget,
      resolution: resolved.resolution,
      location,
    }))
}

function collectJsonStrings(value) {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(collectJsonStrings)
  if (value && typeof value === "object") {
    return Object.keys(value).sort().flatMap((key) => collectJsonStrings(value[key]))
  }
  return []
}

/**
 * String literals that are not module specifiers. Specifiers are already edges
 * in the TypeScript module graph; re-reporting them as path strings would
 * double-count the import surface.
 */
export function collectSourceStringLiterals(source, filePath = "module.ts") {
  const scriptKind = scriptKindFor(filePath)
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind)
  if (sourceFile.parseDiagnostics.length > 0) {
    const detail = sourceFile.parseDiagnostics
      .map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n"))
      .join("\n")
    throw new Error(`Unable to parse ${filePath}:\n${detail}`)
  }
  const specifierPositions = new Set()
  const markSpecifier = (node) => {
    if (node) specifierPositions.add(node.getStart(sourceFile))
  }
  const values = []
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) markSpecifier(node.moduleSpecifier)
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) markSpecifier(node.moduleReference.expression)
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) markSpecifier(node.argument.literal)
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequireLike(node))) markSpecifier(node.arguments[0])
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!specifierPositions.has(node.getStart(sourceFile))) values.push(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

function isRequireLike(node) {
  const callee = node.expression
  if (ts.isIdentifier(callee) && callee.text === "require") return true
  return ts.isPropertyAccessExpression(callee) && callee.name.text === "require"
}

function scriptKindFor(filePath) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (/\.(?:cjs|mjs|js)$/.test(lower)) return ts.ScriptKind.JS
  if (/\.(?:cts|mts|ts)$/.test(lower)) return ts.ScriptKind.TS
  throw new Error(`Unsupported code file: ${filePath}`)
}

function stripScalarQuotes(value) {
  const match = /^(['"])([\s\S]*)\1$/.exec(value)
  return match ? match[2] : value
}

function dedupe(references) {
  const seen = new Map()
  for (const reference of references) {
    seen.set(referenceKey(reference), reference)
  }
  return [...seen.values()].sort((a, b) =>
    a.sourceFile.localeCompare(b.sourceFile)
    || a.referenceType.localeCompare(b.referenceType)
    || a.referencedValue.localeCompare(b.referencedValue)
    || (a.normalizedTarget ?? "").localeCompare(b.normalizedTarget ?? ""))
}

export function referenceKey(reference) {
  return [
    reference.sourceFile,
    reference.referenceType,
    reference.referencedValue,
    reference.normalizedTarget ?? "",
    reference.resolution,
  ].join(" | ")
}
