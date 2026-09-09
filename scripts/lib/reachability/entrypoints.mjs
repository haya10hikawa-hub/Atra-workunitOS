import { isCodeFilePath } from "../typescriptModuleGraph.mjs"

export const ENTRY_CLASSES = ["PRODUCTION", "OPERATOR", "TEST", "DOCUMENTATION", "UNKNOWN"]

// Next.js reserved file names. A file under `app/` is an entry point only when
// it is one of these: the framework routes on the file name, not on the
// directory, so "everything under app/ is an entry point" would be wrong.
const nextReservedBasenames = new Set([
  "page", "layout", "route", "template", "loading", "error", "not-found", "default", "global-error",
])
const nextEntryPattern = /^app\/(?:.*\/)?([^/]+)\.(?:[jt]sx?)$/
const rootRuntimeEntrypoints = new Set(["middleware", "instrumentation", "instrumentation-client"])
const productionConfigModules = new Set(["next.config", "open-next.config", "postcss.config"])
const operatorConfigModules = new Set(["eslint.config"])
const testFilePattern = /^tests\/(?:.*\/)?[^/]+\.test\.[cm]?[jt]sx?$/
const implementationExtensions = [".mts", ".ts", ".mjs", ".js", ".cts", ".cjs", ".tsx", ".jsx"]

/**
 * Where a file sits decides its entry class when the location is class-bearing.
 * This is what keeps `npm test` from reclassifying every test file as operator
 * reachability, and keeps `npm run electron:dev` from reclassifying the Electron
 * runtime entry point as tooling.
 */
export function locationEntryClass(file) {
  if (file.startsWith("tests/")) return "TEST"
  if (isNextEntrypoint(file)) return "PRODUCTION"
  if (file.startsWith("electron/") && isCodeFilePath(file)) return "PRODUCTION"
  const rootModule = rootModuleName(file)
  if (rootModule !== undefined) {
    if (productionConfigModules.has(rootModule)) return "PRODUCTION"
    if (operatorConfigModules.has(rootModule)) return "OPERATOR"
    if (rootRuntimeEntrypoints.has(rootModule)) return "PRODUCTION"
  }
  if (file.startsWith("scripts/") || file.startsWith("tools/")) return "OPERATOR"
  return undefined
}

/** Entry class implied by how a root was discovered, used only as a fallback. */
export function discoveryEntryClass(discoveredVia) {
  if (discoveredVia === "next_convention" || discoveredVia === "runtime_config" || discoveredVia === "CONFIG_REFERENCE") return "PRODUCTION"
  if (discoveredVia === "PACKAGE_SCRIPT" || discoveredVia === "OPERATOR_COMMAND") return "OPERATOR"
  if (discoveredVia === "DOCUMENTATION_COMMAND") return "DOCUMENTATION"
  return undefined
}

export function isNextEntrypoint(file) {
  const match = nextEntryPattern.exec(file)
  return match !== null && nextReservedBasenames.has(match[1])
}

export function isTestEntrypoint(file) {
  return testFilePattern.test(file)
}

/**
 * A declaration file with no implementation beside it is ambient: the compiler
 * consumes it through the project configuration, never through an import edge.
 * Reporting it unreachable would mark a file whose deletion breaks type
 * checking as a deletion candidate.
 */
export function isAmbientDeclaration(inventory, file) {
  if (!isDeclarationFile(file)) return false
  const base = /^(.*)\.d\.[cm]?ts$/.exec(file)[1]
  return !implementationExtensions.some((extension) => inventory.hasFile(`${base}${extension}`))
}

export function isDeclarationFile(file) {
  return /\.d\.[cm]?ts$/.test(file)
}

function rootModuleName(file) {
  const match = /^([^/]+)\.[cm]?[jt]sx?$/.exec(file)
  return match === null ? undefined : match[1]
}

/**
 * Discover every source-controlled entry root. Convention-based production
 * entry points are found from the inventory rather than from a hardcoded list,
 * so a new route or layout is discovered rather than escaping analysis.
 */
export function discoverEntrypoints(inventory, references) {
  const discovered = new Map()
  const record = (file, discoveredVia) => {
    if (!inventory.hasFile(file) || !isCodeFilePath(file)) return
    const existing = discovered.get(file)
    if (existing) {
      if (!existing.discoveredVia.includes(discoveredVia)) existing.discoveredVia.push(discoveredVia)
      return
    }
    discovered.set(file, { file, discoveredVia: [discoveredVia] })
  }

  for (const file of inventory.modules) {
    if (isNextEntrypoint(file)) record(file, "next_convention")
    else if (isTestEntrypoint(file)) record(file, "test_convention")
    else if (rootModuleName(file) !== undefined && locationEntryClass(file) !== undefined) record(file, "runtime_config")
    else if (file.startsWith("electron/") && !isDeclarationFile(file)) record(file, "runtime_config")
    else if (isAmbientDeclaration(inventory, file)) record(file, "ambient_declaration")
  }

  for (const reference of references) {
    if (reference.resolution !== "resolved_file") continue
    if (reference.referenceType === "PATH_STRING") continue
    record(reference.normalizedTarget, reference.referenceType)
  }

  return [...discovered.values()]
    .map((entry) => {
      const discoveredVia = [...entry.discoveredVia].sort()
      const entryClass = locationEntryClass(entry.file)
        ?? discoveredVia.map(discoveryEntryClass).find((candidate) => candidate !== undefined)
        ?? "UNKNOWN"
      return { file: entry.file, entryClass, discoveredVia }
    })
    .sort((a, b) => a.file.localeCompare(b.file))
}
