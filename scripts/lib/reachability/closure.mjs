import { readFile } from "node:fs/promises"
import path from "node:path"
import { createModuleTargetResolver, extractModuleReferences, isCodeFilePath } from "../typescriptModuleGraph.mjs"

export const CLASSIFICATIONS = [
  "PRODUCTION_REACHABLE",
  "OPERATOR_REACHABLE",
  "TEST_ONLY",
  "DOCUMENTATION_ONLY",
  "UNREACHABLE",
  "UNKNOWN",
]

// Deterministic precedence. A module reached from more than one entry class
// keeps every class it was reached from; the precedence only decides which name
// the single primary classification carries.
const classificationByEntryClass = new Map([
  ["PRODUCTION", "PRODUCTION_REACHABLE"],
  ["OPERATOR", "OPERATOR_REACHABLE"],
  ["TEST", "TEST_ONLY"],
  ["DOCUMENTATION", "DOCUMENTATION_ONLY"],
  ["UNKNOWN", "UNKNOWN"],
])
const entryClassPrecedence = ["PRODUCTION", "OPERATOR", "TEST", "DOCUMENTATION", "UNKNOWN"]

/**
 * Import edges over the source-controlled module inventory. Scanning the
 * inventory rather than the filesystem keeps the canonical output a function of
 * the tree alone: an untracked scratch module cannot change it.
 */
export async function scanTrackedModuleEdges(rootDir, inventory) {
  const resolve = createModuleTargetResolver(rootDir)
  const edges = []
  for (const file of inventory.modules) {
    const absolute = path.join(rootDir, file)
    const source = await readFile(absolute, "utf8")
    for (const reference of extractModuleReferences(source, absolute)) {
      edges.push({
        file,
        kind: reference.kind,
        specifier: reference.specifier,
        resolvedTarget: resolve(absolute, reference.specifier),
      })
    }
  }
  return edges.sort((a, b) =>
    a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind) || a.specifier.localeCompare(b.specifier))
}

// TypeScript resolves a specifier to the declaration file when one exists, so
// `./lib/typescriptModuleGraph.mjs` resolves to `typescriptModuleGraph.d.mts`.
// Both files are genuinely reached: the declaration by the type checker and the
// implementation by the runtime. Following only the declaration would report
// every `.mjs` library in `scripts/lib` as unreachable.
const declarationPattern = /^(.*)\.d\.[cm]?ts$/
const implementationExtensions = [".mts", ".ts", ".mjs", ".js", ".cts", ".cjs", ".tsx", ".jsx"]

export function runtimeCounterparts(inventory, target) {
  const match = declarationPattern.exec(target)
  if (match === null) return []
  return implementationExtensions
    .map((extension) => `${match[1]}${extension}`)
    .filter((candidate) => inventory.hasFile(candidate))
}

export function buildAdjacency(inventory, moduleEdges, nonImportReferences) {
  const adjacency = new Map()
  const link = (from, to) => {
    if (!inventory.hasFile(to) || !isCodeFilePath(to)) return
    if (!adjacency.has(from)) adjacency.set(from, new Set())
    adjacency.get(from).add(to)
    for (const counterpart of runtimeCounterparts(inventory, to)) adjacency.get(from).add(counterpart)
  }
  for (const edge of moduleEdges) link(edge.file, edge.resolvedTarget)
  // Configuration names modules the runtime loads, so a configuration reference
  // carries reachability. A path string does not: naming a module in a
  // source-reading contract test is evidence that the path is referenced, not
  // that the module executes.
  for (const reference of nonImportReferences) {
    if (reference.referenceType !== "CONFIG_REFERENCE") continue
    if (reference.resolution !== "resolved_file") continue
    link(reference.sourceFile, reference.normalizedTarget)
  }
  return adjacency
}

export function computeReachability(inventory, entrypoints, adjacency) {
  const reachedBy = new Map(inventory.modules.map((file) => [file, new Set()]))
  for (const entryClass of entryClassPrecedence) {
    const roots = entrypoints.filter((entry) => entry.entryClass === entryClass).map((entry) => entry.file)
    for (const file of traverse(roots, adjacency)) {
      reachedBy.get(file)?.add(entryClass)
    }
  }
  return [...reachedBy.entries()]
    .map(([file, classes]) => ({
      file,
      classification: classify(classes),
      reachedBy: entryClassPrecedence.filter((entryClass) => classes.has(entryClass)),
    }))
    .sort((a, b) => a.file.localeCompare(b.file))
}

function classify(classes) {
  const winner = entryClassPrecedence.find((entryClass) => classes.has(entryClass))
  return winner === undefined ? "UNREACHABLE" : classificationByEntryClass.get(winner)
}

function traverse(roots, adjacency) {
  const seen = new Set()
  const pending = [...roots]
  while (pending.length > 0) {
    const current = pending.pop()
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of adjacency.get(current) ?? []) pending.push(next)
  }
  return seen
}
