import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  extractModuleReferences,
  findLegacyEdges,
  legacyEdgeKey,
  listFiles,
  multisetDifference,
  scanModuleGraph,
} from "../scripts/lib/typescriptModuleGraph.mjs"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const fixturePath = path.join(rootDir, "tests/fixtures/architecture/legacy-surface.v1.json")
const legacyRoots = [
  "app/lib/workunitInbox",
  "app/lib/actionField",
  "app/components/workunitInbox",
  "app/components/legacy/workunitInbox",
]
const INITIAL_LEGACY_EDGE_CEILING = 62

type LegacyContract = {
  sourceSha: string
  sourceShaRole: "refactor_base_only_not_tree_attestation"
  edgeCeiling: number
  legacyEdges: string[]
  legacyFiles: string[]
}

function violatesAdoptedDashboard(edge: { resolvedTarget: string }): boolean {
  return [
    "app/lib/persistence/d1/",
    "app/lib/infrastructure/persistence/",
    "app/lib/persistence/repositoryResolver",
    "app/lib/persistence/routeRepositories",
    "app/api/",
    "app/lib/infrastructure/external/",
    "app/lib/security/session",
  ].some((fragment) => edge.resolvedTarget.includes(fragment))
}

test("root page remains the canonical WorkUnitOSDashboard entry", async () => {
  const source = await readFile(path.join(rootDir, "app/page.tsx"), "utf8")
  assert.match(source, /WorkUnitOSDashboard/)
  assert.equal(source.includes("WorkUnitInbox"), false)
  assert.equal(source.includes("WorkUnitActionField"), false)
  assert.equal(source.includes("WorkUnitDetail"), false)
})

test("no editor swap artifacts exist under app", async () => {
  const artifacts = (await listFiles(path.join(rootDir, "app")))
    .map((file) => path.relative(rootDir, file))
    .filter((file) => /\.(swp|swo)$/.test(file) || /\/\.[^/]+\.(swp|swo)$/.test(file))
  assert.deepEqual(artifacts, [])
})

test("working-tree legacy module edges match the reviewed AST baseline", async () => {
  const contract = await readContract()
  const edges = findLegacyEdges(await scanModuleGraph(rootDir, ["app", "tests"]))
    .map(legacyEdgeKey)
    .sort()
  assert.equal(contract.sourceSha, "066a43c3df07f3da10a2fc93ff7d90157c732114")
  assert.equal(contract.sourceShaRole, "refactor_base_only_not_tree_attestation")
  assert.equal(contract.edgeCeiling, contract.legacyEdges.length)
  assert.ok(contract.edgeCeiling <= INITIAL_LEGACY_EDGE_CEILING)
  assert.deepEqual(edges, [...contract.legacyEdges].sort())
})

test("legacy file inventory matches the exact baseline", async () => {
  const contract = await readContract()
  const files = (await Promise.all(legacyRoots.map(async (root) => listFiles(path.join(rootDir, root)))))
    .flat()
    .map((file) => path.relative(rootDir, file).split(path.sep).join("/"))
    .sort()
  assert.deepEqual(files, [...contract.legacyFiles].sort())
})

test("adopted dashboard does not import server-only or infrastructure modules", async () => {
  const file = "app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx"
  await readFile(path.join(rootDir, file), "utf8")
  const edges = (await scanModuleGraph(rootDir, ["app/components/workunit-os/adopted"]))
    .filter((edge) => edge.file === file)
  const forbidden = edges.filter(violatesAdoptedDashboard)
  assert.deepEqual(forbidden, [])
})

test("legacy scanner sees import plus local compatibility exports", () => {
  const file = "app/lib/workunitInbox/wrapper.ts"
  const references = extractModuleReferences([
    'import { value } from "../application/value.ts"',
    "export { value }",
  ].join("\n"), file)
  assert.deepEqual(references, [
    { kind: "import", specifier: "../application/value.ts" },
    { kind: "export", specifier: "../application/value.ts" },
  ])
  const edges = references.map((reference) => ({
    ...reference, file, resolvedTarget: "app/lib/application/value.ts",
  }))
  assert.deepEqual(findLegacyEdges(edges).map((edge) => edge.category), [
    "legacy-surface", "legacy-surface",
  ])

  const aliasReferences = extractModuleReferences([
    'import { value } from "../application/value.ts"',
    "const alias = value",
    "export { alias }",
  ].join("\n"), file)
  const aliasEdges = aliasReferences.map((reference) => ({
    ...reference, file, resolvedTarget: "app/lib/application/value.ts",
  }))
  assert.equal(findLegacyEdges(aliasEdges).length, 1, "the compatibility import itself remains inventoried")
})

test("legacy report comparison preserves duplicate drift", () => {
  assert.deepEqual(multisetDifference(["edge", "edge"], ["edge"]), ["edge"])
  assert.deepEqual(multisetDifference(["edge"], ["edge", "edge"]), [])
})

test("adopted dashboard policy rejects a positive control", () => {
  assert.equal(violatesAdoptedDashboard({ resolvedTarget: "app/lib/security/session.ts" }), true)
  assert.equal(violatesAdoptedDashboard({ resolvedTarget: "app/lib/domain/workUnit.ts" }), false)
})

async function readContract(): Promise<LegacyContract> {
  const parsed: unknown = JSON.parse(await readFile(fixturePath, "utf8"))
  assert.ok(parsed && typeof parsed === "object")
  const contract = parsed as LegacyContract
  assert.equal(typeof contract.sourceSha, "string")
  assert.equal(contract.sourceShaRole, "refactor_base_only_not_tree_attestation")
  assert.equal(typeof contract.edgeCeiling, "number")
  assert.ok(Array.isArray(contract.legacyEdges) && contract.legacyEdges.every((item) => typeof item === "string"))
  assert.ok(Array.isArray(contract.legacyFiles) && contract.legacyFiles.every((item) => typeof item === "string"))
  assert.equal(new Set(contract.legacyEdges).size, contract.legacyEdges.length)
  assert.equal(new Set(contract.legacyFiles).size, contract.legacyFiles.length)
  return contract
}
