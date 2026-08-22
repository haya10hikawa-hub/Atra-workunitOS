import test from "node:test"
import assert from "node:assert/strict"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  LEGACY_ROOT_IDENTITIES,
  extractModuleReferences,
  findLegacyEdges,
  legacyEdgeKey,
  legacyEdgesTouchingRoot,
  listFiles,
  multisetDifference,
  scanLegacyRoot,
  scanLegacyRoots,
  scanModuleGraph,
} from "../scripts/lib/typescriptModuleGraph.mjs"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const fixturePath = path.join(rootDir, "tests/fixtures/architecture/legacy-surface.v1.json")

/**
 * Independent closed-vocabulary pin of the four ratified WU-10 root identities.
 *
 * This literal is deliberately a SECOND copy, not a re-export: the implementation list lives in
 * `scripts/lib/typescriptModuleGraph.mjs`, and the test below asserts exact set-and-order equality
 * between the two. Editing either side alone goes red, so shrinking the measured root list — the
 * one edit that would drive the WU-10 baseline to zero without removing any legacy code — cannot
 * be made in a single place.
 */
const EXPECTED_LEGACY_ROOT_IDENTITIES = [
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
  const roots = await scanLegacyRoots(rootDir)
  const files = roots.flatMap((root) => root.files).sort()
  assert.deepEqual(files, [...contract.legacyFiles].sort())
  // Every ratified identity is still measured, whatever its status.
  assert.deepEqual(roots.map((root) => root.root), EXPECTED_LEGACY_ROOT_IDENTITIES)
})

test("the four ratified legacy root identities are pinned in both directions", () => {
  assert.deepEqual([...LEGACY_ROOT_IDENTITIES], EXPECTED_LEGACY_ROOT_IDENTITIES,
    "implementation root list and the independent test pin must match exactly, in order")
  assert.equal(LEGACY_ROOT_IDENTITIES.length, 4)
  assert.equal(new Set(LEGACY_ROOT_IDENTITIES).size, 4)
  assert.throws(() => (LEGACY_ROOT_IDENTITIES as string[]).push("app/lib/somethingElse"),
    "the ratified identity list must not be extensible at runtime")
})

test("every ratified root currently reports OPEN with its exact file count", async () => {
  const roots = await scanLegacyRoots(rootDir)
  assert.deepEqual(roots.map((root) => root.status), ["OPEN", "OPEN", "OPEN", "OPEN"])
  assert.deepEqual(roots.map((root) => root.files.length), [19, 2, 3, 4])
  assert.equal(roots.reduce((total, root) => total + root.files.length, 0), 28)
})

test("a ratified root whose directory is absent reports CLOSED, not an error", async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "wu10-absent-"))
  try {
    // Nothing exists under `scratch`, so every ratified identity names a missing directory.
    const closed = await scanLegacyRoot(scratch, "app/lib/actionField")
    assert.equal(closed.status, "CLOSED")
    assert.equal(closed.present, false)
    assert.deepEqual(closed.files, [])
    assert.equal(closed.root, "app/lib/actionField")
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test("an existing but empty ratified root reports CLOSED", async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "wu10-empty-"))
  try {
    await mkdir(path.join(scratch, "app/lib/actionField"), { recursive: true })
    const closed = await scanLegacyRoot(scratch, "app/lib/actionField")
    assert.equal(closed.status, "CLOSED")
    assert.equal(closed.present, true)
    assert.deepEqual(closed.files, [])
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test("zero state: four identities retained, all CLOSED, zero files and zero edges", async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "wu10-zero-"))
  try {
    // Two roots emptied in place, two deleted outright — both are legitimate closed states.
    await mkdir(path.join(scratch, "app/lib/workunitInbox"), { recursive: true })
    await mkdir(path.join(scratch, "app/components/workunitInbox"), { recursive: true })
    // A surviving non-legacy module proves the tree is not simply empty.
    await mkdir(path.join(scratch, "app/lib/application"), { recursive: true })
    await writeFile(path.join(scratch, "app/lib/application/value.ts"), "export const value = 1\n")

    const roots = await scanLegacyRoots(scratch)

    // The measurement definition is intact: four identities, none removed.
    assert.equal(roots.length, 4)
    assert.deepEqual(roots.map((root) => root.root), EXPECTED_LEGACY_ROOT_IDENTITIES)
    assert.deepEqual(roots.map((root) => root.status), ["CLOSED", "CLOSED", "CLOSED", "CLOSED"])
    assert.deepEqual(roots.map((root) => root.present), [true, false, true, false])

    // legacy file baseline = 0, reached without shrinking the root list.
    assert.equal(roots.flatMap((root) => root.files).length, 0)

    // legacy edge baseline = 0: no edge touches any ratified root.
    const edges = findLegacyEdges([{
      kind: "import",
      file: "app/lib/application/value.ts",
      specifier: "./other.ts",
      resolvedTarget: "app/lib/application/other.ts",
    }])
    assert.deepEqual(edges, [])
    for (const identity of LEGACY_ROOT_IDENTITIES) {
      assert.deepEqual(legacyEdgesTouchingRoot(edges, identity), [])
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test("unexpected filesystem states fail closed instead of reporting CLOSED", async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "wu10-failclosed-"))
  try {
    // A ratified identity that resolves to a file, not a directory, is a broken measurement.
    await mkdir(path.join(scratch, "app/lib"), { recursive: true })
    await writeFile(path.join(scratch, "app/lib/actionField"), "not a directory\n")
    await assert.rejects(() => scanLegacyRoot(scratch, "app/lib/actionField"),
      /is not a directory/, "a non-directory ratified root must throw, never report CLOSED")

    // An unreadable nested directory must propagate, not be absorbed as a zero file count.
    await mkdir(path.join(scratch, "app/components/workunitInbox/nested"), { recursive: true })
    await writeFile(path.join(scratch, "app/components/workunitInbox/nested/a.ts"), "export {}\n")
    await chmod(path.join(scratch, "app/components/workunitInbox/nested"), 0o000)
    if (process.getuid?.() !== 0) {
      await assert.rejects(() => scanLegacyRoot(scratch, "app/components/workunitInbox"),
        (error: NodeJS.ErrnoException) => error.code === "EACCES",
        "an unreadable nested directory must fail closed")
    }
    await chmod(path.join(scratch, "app/components/workunitInbox/nested"), 0o755)

    // An unreadable PARENT makes the root's own stat() fail. That is not ENOENT, so it must
    // propagate: absorbing it would report a live root as CLOSED on a permissions fault.
    await mkdir(path.join(scratch, "app/components/legacy/workunitInbox"), { recursive: true })
    await writeFile(path.join(scratch, "app/components/legacy/workunitInbox/b.ts"), "export {}\n")
    await chmod(path.join(scratch, "app/components/legacy"), 0o000)
    if (process.getuid?.() !== 0) {
      await assert.rejects(() => scanLegacyRoot(scratch, "app/components/legacy/workunitInbox"),
        (error: NodeJS.ErrnoException) => error.code === "EACCES",
        "a stat() failure on the ratified root must fail closed, never report CLOSED")
    }
    await chmod(path.join(scratch, "app/components/legacy"), 0o755)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
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
