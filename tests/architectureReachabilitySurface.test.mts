/**
 * WU-10 pre-cleanup reachability and non-import-reference instrument.
 *
 * The instrument measures. It authorises no deletion, changes no WU-10 gate
 * condition, and records no product disposition: a module classified
 * UNREACHABLE is evidence for human adjudication, not a cleanup target.
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { readDocumentationCommands, readWorkflowRunSteps } from "../scripts/lib/reachability/references.mjs"
import { isExecutableCommand, readCommandLine } from "../scripts/lib/reachability/commands.mjs"
import {
  canonicalJson,
  collectFailures,
  computeReachabilitySurface,
  driftFailures,
  machineIndependenceFailures,
  POSITIVE_CONTROLS,
  readContract,
} from "../scripts/lib/reachability/surface.mjs"

const execFileAsync = promisify(execFile)
const rootDir = fileURLToPath(new URL("../", import.meta.url))
const fixturePath = path.join(rootDir, "tests/fixtures/architecture/reachability-surface.v1.json")

const baseTsconfig = JSON.stringify({
  compilerOptions: {
    baseUrl: ".",
    module: "esnext",
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    allowJs: true,
    noEmit: true,
    jsx: "react-jsx",
    paths: { "@/*": ["./app/*", "./*"] },
  },
  include: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
  exclude: ["node_modules"],
})

/**
 * A real, minimal git repository. The instrument's inventory is `git ls-files`,
 * so exercising it through git is what proves the source-controlled boundary
 * rather than a stubbed listing.
 */
async function withSyntheticRepo(files: Record<string, string>, body: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "reachability-"))
  try {
    const all = { "tsconfig.json": baseTsconfig, ...files }
    for (const [relative, contents] of Object.entries(all)) {
      const target = path.join(root, relative)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, contents)
    }
    await execFileAsync("git", ["-C", root, "init", "-q"])
    await execFileAsync("git", ["-C", root, "add", "-A"])
    await body(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const surfaceOf = async (root: string) => (await computeReachabilitySurface(root)).report
const classificationOf = (report: Awaited<ReturnType<typeof surfaceOf>>, file: string) =>
  report.classifications[file]?.classification

test("production entry points are discovered by convention and their closure is production-reachable", async () => {
  await withSyntheticRepo({
    "app/page.tsx": `import { render } from "./lib/render.ts"\nexport default function Page() { return render() }\n`,
    "app/lib/render.ts": `import { helper } from "./helper.ts"\nexport const render = () => helper()\n`,
    "app/lib/helper.ts": `export const helper = () => "ok"\n`,
    "app/lib/orphan.ts": `export const orphan = () => "unused"\n`,
    "app/components/Widget.tsx": `export const Widget = () => null\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.deepEqual(report.entrypoints.map((entry) => entry.file), ["app/page.tsx"])
    assert.equal(report.entrypoints[0].entryClass, "PRODUCTION")
    assert.equal(classificationOf(report, "app/lib/render.ts"), "PRODUCTION_REACHABLE")
    assert.equal(classificationOf(report, "app/lib/helper.ts"), "PRODUCTION_REACHABLE")
    assert.equal(classificationOf(report, "app/lib/orphan.ts"), "UNREACHABLE")
    assert.equal(classificationOf(report, "app/components/Widget.tsx"), "UNREACHABLE")
  })
})

test("a file under app/ is not an entry point merely because of its directory", async () => {
  await withSyntheticRepo({
    "app/api/thing/route.ts": `export const GET = () => new Response("ok")\n`,
    "app/api/thing/handler.ts": `export const handler = () => null\n`,
    "app/api/thing/notAnEntrypoint.ts": `export const nope = () => null\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.deepEqual(report.entrypoints.map((entry) => entry.file), ["app/api/thing/route.ts"])
    assert.equal(classificationOf(report, "app/api/thing/notAnEntrypoint.ts"), "UNREACHABLE")
  })
})

test("test files are test roots and their private closure is TEST_ONLY", async () => {
  await withSyntheticRepo({
    "app/page.tsx": `import { shared } from "./lib/shared.ts"\nexport default function Page() { return shared() }\n`,
    "app/lib/shared.ts": `export const shared = () => "shared"\n`,
    "tests/thing.test.mts": `import { shared } from "../app/lib/shared.ts"\nimport { fixture } from "./helpers/fixture.mts"\nshared(); fixture()\n`,
    "tests/helpers/fixture.mts": `export const fixture = () => "fixture"\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.equal(classificationOf(report, "tests/helpers/fixture.mts"), "TEST_ONLY")
    assert.equal(classificationOf(report, "tests/thing.test.mts"), "TEST_ONLY")
  })
})

test("a module reached from both production and tests is production-reachable and keeps both classes", async () => {
  await withSyntheticRepo({
    "app/page.tsx": `import { shared } from "./lib/shared.ts"\nexport default function Page() { return shared() }\n`,
    "app/lib/shared.ts": `export const shared = () => "shared"\n`,
    "tests/thing.test.mts": `import { shared } from "../app/lib/shared.ts"\nshared()\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.equal(classificationOf(report, "app/lib/shared.ts"), "PRODUCTION_REACHABLE")
    assert.deepEqual(report.classifications["app/lib/shared.ts"].reachedBy, ["PRODUCTION", "TEST"])
  })
})

test("dynamic import edges are followed", async () => {
  await withSyntheticRepo({
    "app/page.tsx": `export default async function Page() { const m = await import("./lib/lazy.ts"); return m.lazy() }\n`,
    "app/lib/lazy.ts": `export const lazy = () => "lazy"\n`,
  }, async (root) => {
    assert.equal(classificationOf(await surfaceOf(root), "app/lib/lazy.ts"), "PRODUCTION_REACHABLE")
  })
})

test("require and createRequire edges are followed", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: { operate: "node scripts/operate.mjs" } }),
    "scripts/operate.mjs": `const direct = require("./direct.mjs")\nimport { createRequire } from "node:module"\nconst load = createRequire(import.meta.url)\nconst viaFactory = load("./viaFactory.mjs")\nconsole.log(direct, viaFactory)\n`,
    "scripts/direct.mjs": `module.exports = { direct: true }\n`,
    "scripts/viaFactory.mjs": `module.exports = { viaFactory: true }\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.equal(classificationOf(report, "scripts/direct.mjs"), "OPERATOR_REACHABLE")
    assert.equal(classificationOf(report, "scripts/viaFactory.mjs"), "OPERATOR_REACHABLE")
  })
})

test("package scripts make their target modules operator-reachable", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: { gate: "node scripts/gate.mjs", chained: "npm run gate" } }),
    "scripts/gate.mjs": `import "./gateLib.mjs"\n`,
    "scripts/gateLib.mjs": `export const gate = true\n`,
    "scripts/unused.mjs": `export const unused = true\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    const gate = report.entrypoints.find((entry) => entry.file === "scripts/gate.mjs")
    assert.equal(gate?.entryClass, "OPERATOR")
    assert.ok(gate?.discoveredVia.includes("PACKAGE_SCRIPT"))
    assert.equal(classificationOf(report, "scripts/gateLib.mjs"), "OPERATOR_REACHABLE")
    assert.ok((report.counts.referencesByType.PACKAGE_SCRIPT ?? 0) > 0)
  })
})

test("workflow run steps are operator commands", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: {} }),
    ".github/workflows/ci.yml": `jobs:\n  build:\n    steps:\n      - name: Gate\n        run: node scripts/ciGate.mjs\n      - name: Block\n        run: |\n          node scripts/ciBlock.mjs\n`,
    "scripts/ciGate.mjs": `export const gate = true\n`,
    "scripts/ciBlock.mjs": `export const block = true\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    const operatorTargets = Object.entries(report.moduleReferences)
      .filter(([, entries]) => entries.some((entry) => entry.startsWith("OPERATOR_COMMAND ")))
      .map(([target]) => target)
    assert.deepEqual(operatorTargets, ["scripts/ciBlock.mjs", "scripts/ciGate.mjs"])
    assert.equal(classificationOf(report, "scripts/ciGate.mjs"), "OPERATOR_REACHABLE")
    assert.equal(classificationOf(report, "scripts/ciBlock.mjs"), "OPERATOR_REACHABLE")
  })
})

test("a configuration reference is recorded and carries reachability", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: {} }),
    "wrangler.json": JSON.stringify({ name: "w", main: "app/worker/entry.ts" }),
    "app/worker/entry.ts": `import { work } from "./work.ts"\nexport default { fetch: work }\n`,
    "app/worker/work.ts": `export const work = () => new Response("ok")\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.deepEqual(report.moduleReferences["app/worker/entry.ts"], ["CONFIG_REFERENCE wrangler.json"])
    assert.equal(classificationOf(report, "app/worker/entry.ts"), "PRODUCTION_REACHABLE")
    assert.equal(classificationOf(report, "app/worker/work.ts"), "PRODUCTION_REACHABLE")
  })
})

test("a configuration glob is recorded as a pattern and carries no reachability", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: {} }),
    "app/page.tsx": `export default function Page() { return null }\n`,
    "app/lib/orphan.ts": `export const orphan = true\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    // `tsconfig.json` includes `**/*.ts`. Expanding it would make every module
    // production-reachable and the measurement vacuous.
    assert.ok((report.counts.referencesByResolution.glob_pattern ?? 0) > 0)
    assert.equal(classificationOf(report, "app/lib/orphan.ts"), "UNREACHABLE")
  })
})

test("a path string is recorded as evidence and does not confer reachability", async () => {
  await withSyntheticRepo({
    "app/page.tsx": `export default function Page() { return null }\n`,
    "app/components/Panel.tsx": `export const Panel = () => null\n`,
    "tests/panel.test.mts": `import { readFileSync } from "node:fs"\nreadFileSync("app/components/Panel.tsx", "utf8")\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.deepEqual(report.moduleReferences["app/components/Panel.tsx"], ["PATH_STRING tests/panel.test.mts"])
    // Reading a module's source is not executing it, so the module stays
    // unreachable while the reference remains visible against it.
    assert.equal(classificationOf(report, "app/components/Panel.tsx"), "UNREACHABLE")
  })
})

test("a documentation command makes its target documentation-only", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: {} }),
    "prototypes/demo/README.md": "# Demo\n\n```bash\nnode --experimental-strip-types prototypes/demo/loop.mts\n```\n\nThe input is `mockEvents.mts`.\n",
    "prototypes/demo/loop.mts": `import { engine } from "./engine.mts"\nengine()\n`,
    "prototypes/demo/engine.mts": `export const engine = () => "engine"\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.equal(classificationOf(report, "prototypes/demo/loop.mts"), "DOCUMENTATION_ONLY")
    assert.equal(classificationOf(report, "prototypes/demo/engine.mts"), "DOCUMENTATION_ONLY")
    assert.deepEqual(report.moduleReferences["prototypes/demo/loop.mts"], ["DOCUMENTATION_COMMAND prototypes/demo/README.md"])
  })
})

test("prose naming a module is not a documentation command", () => {
  const read = readDocumentationCommands("The input is `mockEvents.mts` and it matters.\n")
  assert.deepEqual(read.commands, [])
  assert.deepEqual(read.anomalies, [])
  assert.equal(isExecutableCommand("mockEvents.mts"), false)
  assert.equal(isExecutableCommand("node prototypes/demo/loop.mts"), true)
})

test("an unterminated code fence is reported rather than skipped", () => {
  const read = readDocumentationCommands("```\nnot closed\n", "docs/x.md")
  assert.deepEqual(read.anomalies, [{ file: "docs/x.md", anomaly: "unterminated_code_fence", line: 1 }])
})

test("workflow run steps are read in both scalar and block form", () => {
  const steps = readWorkflowRunSteps("jobs:\n  a:\n    steps:\n      - run: npm ci\n      - run: |\n          npm test\n          npm run lint\n")
  assert.deepEqual(steps.map((step) => step.command), ["npm ci", "npm test\nnpm run lint"])
})

test("environment assignments and flags are stripped from command operands", () => {
  assert.deepEqual(
    readCommandLine("ROI_THRESHOLD=80 node --experimental-strip-types prototypes/demo/loop.mts"),
    [{ executable: "node", operands: ["prototypes/demo/loop.mts"] }],
  )
})

test("an unresolved reference stays visible, and an unresolved executable reference is fatal", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: { broken: "node scripts/missing.mjs" } }),
    "scripts/present.mjs": `export const present = true\n`,
    "tests/probe.test.mts": `import { readFileSync } from "node:fs"\ntry { readFileSync("app/does/not/exist.ts") } catch {}\n`,
    "app/page.tsx": `export default function Page() { return null }\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    const values = report.unresolvedReferences.map((reference) => reference.referencedValue)
    assert.ok(values.includes("scripts/missing.mjs"), "operator reference must stay visible")
    assert.ok(values.includes("app/does/not/exist.ts"), "path-string reference must stay visible")
    const failures = collectFailures(report)
    assert.ok(
      failures.some((failure) => failure.includes("Executable reference does not resolve") && failure.includes("scripts/missing.mjs")),
      `expected a fatal executable reference, got: ${failures.join(" / ")}`,
    )
    assert.ok(
      !failures.some((failure) => failure.includes("app/does/not/exist.ts")),
      "a path-string reference is evidence, not an executable failure",
    )
  })
})

test("an entry point that cannot be classified fails closed and propagates UNKNOWN", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: {} }),
    // An ambient declaration outside every class-bearing location: the
    // instrument must refuse to guess rather than assume it is dead.
    "surfaces/ambient.d.ts": `import "./consumed.ts"\ndeclare global { const marker: string }\n`,
    "surfaces/consumed.ts": `export const consumed = true\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    const ambient = report.entrypoints.find((entry) => entry.file === "surfaces/ambient.d.ts")
    assert.equal(ambient?.entryClass, "UNKNOWN")
    assert.equal(classificationOf(report, "surfaces/ambient.d.ts"), "UNKNOWN")
    assert.equal(classificationOf(report, "surfaces/consumed.ts"), "UNKNOWN")
    const failures = collectFailures(report)
    assert.ok(failures.some((failure) => failure.startsWith("Entry point could not be classified")))
    assert.ok(failures.some((failure) => failure.startsWith("Module classification is UNKNOWN")))
  })
})

test("an ambient declaration in a class-bearing location is a compiler root, not dead code", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: {} }),
    "electron/main.ts": `export const main = () => null\n`,
    "electron/types.d.ts": `declare global { const bridge: string }\nexport {}\n`,
    "tests/helpers/ambient.d.ts": `declare module "node:probe" { export const probe: string }\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.equal(classificationOf(report, "electron/types.d.ts"), "PRODUCTION_REACHABLE")
    assert.equal(classificationOf(report, "tests/helpers/ambient.d.ts"), "TEST_ONLY")
    assert.deepEqual(collectFailures(report), [])
  })
})

test("a declaration file resolves through to its runtime implementation", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: { gate: "node scripts/gate.mjs" } }),
    "scripts/gate.mjs": `import { helper } from "./lib/helper.mjs"\nhelper()\n`,
    "scripts/lib/helper.mjs": `export const helper = () => "helper"\n`,
    "scripts/lib/helper.d.mts": `export function helper(): string\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    // TypeScript resolves the specifier to the declaration file; following only
    // that would report every `.mjs` library as unreachable.
    assert.equal(classificationOf(report, "scripts/lib/helper.mjs"), "OPERATOR_REACHABLE")
    assert.equal(classificationOf(report, "scripts/lib/helper.d.mts"), "OPERATOR_REACHABLE")
  })
})

test("a malformed tracked source file fails closed instead of being skipped", async () => {
  await withSyntheticRepo({
    "app/page.tsx": `export default function Page() { return null }\n`,
    "app/lib/broken.ts": `export const broken = (\n`,
  }, async (root) => {
    await assert.rejects(() => surfaceOf(root), /Unable to parse/)
  })
})

test("canonical output is byte-identical across runs and free of machine-dependent values", async () => {
  await withSyntheticRepo({
    "package.json": JSON.stringify({ name: "s", scripts: { gate: "node scripts/gate.mjs" } }),
    "app/page.tsx": `import { shared } from "./lib/shared.ts"\nexport default function Page() { return shared() }\n`,
    "app/lib/shared.ts": `export const shared = () => "shared"\n`,
    "scripts/gate.mjs": `export const gate = true\n`,
    "tests/thing.test.mts": `import { shared } from "../app/lib/shared.ts"\nshared()\n`,
  }, async (root) => {
    const first = canonicalJson(await surfaceOf(root))
    const second = canonicalJson(await surfaceOf(root))
    assert.equal(first, second)
    assert.ok(!first.includes(root), "the temporary root must not appear in canonical output")
    assert.ok(!first.includes(tmpdir()), "no machine path may appear in canonical output")
    assert.deepEqual(machineIndependenceFailures(await surfaceOf(root)), [])
  })
})

test("an absolute path in the canonical output is a failure", () => {
  const failures = machineIndependenceFailures({
    version: 1,
    classifications: {},
    entrypoints: [{ file: "/Users/someone/repo/app/page.tsx", entryClass: "PRODUCTION", discoveredVia: [] }],
  } as never)
  assert.ok(failures.some((failure) => failure.includes("machine-dependent")))
})

test("fixture drift is detected in both directions", async () => {
  await withSyntheticRepo({
    "app/page.tsx": `export default function Page() { return null }\n`,
    "app/lib/orphan.ts": `export const orphan = true\n`,
  }, async (root) => {
    const report = await surfaceOf(root)
    assert.deepEqual(driftFailures(report, JSON.parse(canonicalJson(report))), [])

    const withAddedModule = JSON.parse(canonicalJson(report))
    delete withAddedModule.classifications["app/lib/orphan.ts"]
    assert.ok(driftFailures(report, withAddedModule).some((failure) => failure.startsWith("Classification added:")))

    const withRemovedModule = JSON.parse(canonicalJson(report))
    withRemovedModule.classifications["app/lib/ghost.ts"] = { classification: "UNREACHABLE", reachedBy: [] }
    assert.ok(driftFailures(report, withRemovedModule).some((failure) => failure.startsWith("Classification removed:")))

    const withChangedClass = JSON.parse(canonicalJson(report))
    withChangedClass.classifications["app/lib/orphan.ts"].classification = "PRODUCTION_REACHABLE"
    assert.ok(driftFailures(report, withChangedClass).some((failure) => failure.includes("orphan.ts")))

    const withChangedCounts = JSON.parse(canonicalJson(report))
    withChangedCounts.counts.modules += 1
    assert.deepEqual(driftFailures(report, withChangedCounts), ["Reconciliation artifact counts drifted from the live scan"])
  })
})

test("the checked-in artifact reconciles against a live scan of this tree", async () => {
  const { report } = await computeReachabilitySurface(rootDir)
  const contract = await readContract(fixturePath)
  assert.deepEqual(collectFailures(report, contract, { enforcePositiveControls: true }), [])
  assert.equal(canonicalJson(report), await readFile(fixturePath, "utf8"))
})

test("this tree has no unclassifiable entry point and no UNKNOWN module", async () => {
  const contract = await readContract(fixturePath)
  assert.deepEqual(contract.entrypoints.filter((entry: { entryClass: string }) => entry.entryClass === "UNKNOWN"), [])
  const unknown = Object.entries(contract.classifications as Record<string, { classification: string }>)
    .filter(([, entry]) => entry.classification === "UNKNOWN")
  assert.deepEqual(unknown, [])
  assert.equal(contract.counts.classificationsByKind.UNKNOWN, undefined)
})

test("every executable reference in this tree resolves", async () => {
  const contract = await readContract(fixturePath)
  const executable = contract.unresolvedReferences
    .filter((reference: { referenceType: string }) => reference.referenceType !== "PATH_STRING")
  assert.deepEqual(executable, [])
})

test("known current references are still detected", async () => {
  const contract = await readContract(fixturePath)
  for (const target of POSITIVE_CONTROLS.pathStringTargets) {
    assert.ok(
      contract.positiveControls.pathStringTargets[target] > 0,
      `path-string references to ${target} must still be detected`,
    )
  }
  for (const target of POSITIVE_CONTROLS.documentationCommandTargets) {
    assert.ok(
      contract.positiveControls.documentationCommandTargets[target] > 0,
      `the documented command for ${target} must still be detected`,
    )
  }
  // The four legacy roots are named by the legacy measurement instruments.
  // These are positive controls, not deletion candidates.
  assert.ok(contract.moduleReferences["scripts/lib/typescriptModuleGraph.mjs"] !== undefined)
})

test("production entry-point discovery covers every Next route and layout in this tree", async () => {
  const contract = await readContract(fixturePath)
  const production = contract.entrypoints
    .filter((entry: { entryClass: string }) => entry.entryClass === "PRODUCTION")
    .map((entry: { file: string }) => entry.file)
  const { stdout } = await execFileAsync("git", ["-C", rootDir, "ls-files", "-z", "app"])
  const conventional = stdout
    .split("\0")
    .filter((file) => /^app\/(?:.*\/)?(?:page|layout|route|template|loading|error|not-found|default|global-error)\.[jt]sx?$/.test(file))
    .sort()
  assert.ok(conventional.length > 0, "the discovery control must not be vacuous")
  for (const file of conventional) {
    assert.ok(production.includes(file), `${file} must be a discovered production entry point`)
  }
})
