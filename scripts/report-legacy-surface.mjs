#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  LEGACY_ROOT_IDENTITIES,
  findLegacyEdges,
  legacyEdgeKey,
  legacyEdgesTouchingRoot,
  multisetDifference,
  scanLegacyRoots,
  scanModuleGraph,
} from "./lib/typescriptModuleGraph.mjs"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const fixturePath = path.join(rootDir, "tests/fixtures/architecture/legacy-surface.v1.json")

const contract = JSON.parse(await readFile(fixturePath, "utf8"))
if (contract.sourceShaRole !== "refactor_base_only_not_tree_attestation"
  || !Array.isArray(contract.legacyEdges)
  || !Array.isArray(contract.legacyFiles)) {
  throw new Error(`Invalid legacy contract: ${fixturePath}`)
}

const edges = findLegacyEdges(await scanModuleGraph(rootDir, ["app", "tests"]))
const actualEdges = edges.map(legacyEdgeKey).sort()
const expectedEdges = [...contract.legacyEdges].sort()

// One entry per ratified identity, always. A root that holds no legacy files reports CLOSED and
// stays in the report; it is never dropped, because absence from the measurement is not closure.
const roots = await scanLegacyRoots(rootDir)
const actualFiles = roots.flatMap((root) => root.files).sort()

console.log(`Legacy module edges: ${actualEdges.length}`)
for (const [kind, count] of countBy(edges, (edge) => edge.kind)) console.log(`- ${kind}: ${count}`)
console.log(`- production: ${edges.filter((edge) => edge.file.startsWith("app/")).length}`)
console.log(`- tests: ${edges.filter((edge) => edge.file.startsWith("tests/")).length}`)
console.log(`Legacy files: ${actualFiles.length}`)

console.log(`Ratified legacy root identities: ${LEGACY_ROOT_IDENTITIES.length}`)
for (const root of roots) {
  const edgeCount = legacyEdgesTouchingRoot(edges, root.root).length
  const absent = root.present ? "" : ", directory absent"
  console.log(`- ${root.root}: status=${root.status}, edges=${edgeCount}, files=${root.files.length}${absent}`)
}
console.log(`Open roots: ${roots.filter((root) => root.status === "OPEN").length}`)
console.log(`Closed roots: ${roots.filter((root) => root.status === "CLOSED").length}`)
// Per-root edge counts overlap where one edge leaves one root and enters another, so they are a
// per-root view rather than a partition; the global total above stays the single baseline number.

const additions = multisetDifference(actualEdges, expectedEdges)
const removals = multisetDifference(expectedEdges, actualEdges)
const fileAdditions = multisetDifference(actualFiles, contract.legacyFiles)
const fileRemovals = multisetDifference(contract.legacyFiles, actualFiles)
printDiff("Edge additions", additions)
printDiff("Edge removals", removals)
printDiff("File additions", fileAdditions)
printDiff("File removals", fileRemovals)
if ([additions, removals, fileAdditions, fileRemovals].some((items) => items.length > 0)) process.exitCode = 1

function countBy(items, keyFor) {
  const counts = new Map()
  for (const item of items) counts.set(keyFor(item), (counts.get(keyFor(item)) ?? 0) + 1)
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function printDiff(label, items) {
  console.log(`${label}: ${items.length}`)
  for (const item of items) console.log(`- ${item}`)
}
