import test from "node:test"
import assert from "node:assert/strict"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  extractModuleReferences,
  isCodeFilePath,
  resolveModuleTarget,
  scanModuleGraph,
  type ModuleEdge,
} from "../scripts/lib/typescriptModuleGraph.mjs"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const REFACTOR_BASE_SHA = "066a43c3df07f3da10a2fc93ff7d90157c732114"
const DEBT_IDS = ["domain_tenant_hybrid_boundary", "infrastructure_application_signal_contract"]
const DEBT_FIELDS = [
  "id", "status", "introduced_by", "source_sha", "exact_sources", "exact_targets",
  "edge_kind", "risk", "owner_workunit", "removal_gate", "production_change_allowed_in_wu00",
]
const OWNER_WORKUNITS = ["WU-01", "WU-02", "WU-03", "WU-04", "WU-05", "WU-06", "WU-07", "WU-08", "WU-09", "WU-10"]

type DeclaredDebt = {
  id: string
  status: string
  introduced_by: string
  source_sha: string
  exact_sources: string[]
  exact_targets: string[]
  edge_kind: string
  risk: string
  owner_workunit: string
  removal_gate: string
  production_change_allowed_in_wu00: boolean
}

type DebtLedger = { sourceSha: string; sourceShaRole: string; notAnAllowlist: boolean; debts: DeclaredDebt[] }

async function readDebtLedger(): Promise<DebtLedger> {
  const file = path.join(rootDir, "tests/fixtures/architecture/declared-boundary-debt.v1.json")
  return JSON.parse(await readFile(file, "utf8")) as DebtLedger
}

function debtById(ledger: DebtLedger, id: string): DeclaredDebt {
  const debt = ledger.debts.find((entry) => entry.id === id)
  assert.ok(debt, `declared debt ${id} is missing`)
  return debt
}

// A type-only edge and a value edge are different debts. Upgrading one to the other must fail.
function edgeKindClass(kind: ModuleEdge["kind"]): "type-only" | "value" {
  return kind === "import-type" || kind === "import-type-expression" ? "type-only" : "value"
}

function observedDebtKey(edge: ModuleEdge): string {
  return `${edge.file} | ${edgeKindClass(edge.kind)} | ${edge.resolvedTarget}`
}

// Exact cross product of declared paths. Over-declaring is not tolerated: reconcile()
// compares sets in both directions, so a declared pair with no live edge surfaces as stale.
function declaredDebtKeys(debt: DeclaredDebt): string[] {
  return debt.exact_sources.flatMap((source) =>
    debt.exact_targets.map((target) => `${source} | ${debt.edge_kind} | ${target}`))
}

function reconcile(observed: ModuleEdge[], declared: string[]): { undeclared: string[]; stale: string[] } {
  const observedKeys = observed.map(observedDebtKey)
  return {
    undeclared: observedKeys.filter((key) => !declared.includes(key)).sort(),
    stale: declared.filter((key) => !observedKeys.includes(key)).sort(),
  }
}

// Target boundary policies: the intended future boundaries. The live scans below reconcile
// them against exact declared debt instead of relaxing the policy or allowlisting a directory.
function violatesDomainTarget(edge: ModuleEdge): boolean {
  return violatesDomain(edge)
    || hasForbiddenResolvedPath(edge.resolvedTarget, ["/app/lib/tenant/", "/app/lib/application/"])
}

function violatesExternalClientTarget(edge: ModuleEdge): boolean {
  return violatesUiDependency(edge)
    || hasForbiddenResolvedPath(edge.resolvedTarget, ["/app/lib/application/"])
}

function syntheticEdge(file: string, resolvedTarget: string, kind: ModuleEdge["kind"] = "import-type"): ModuleEdge {
  return { file, kind, specifier: `./${path.basename(resolvedTarget)}`, resolvedTarget }
}

function isBareModule(specifier: string, name: string): boolean {
  return specifier === name || specifier.startsWith(`${name}/`)
}

function hasForbiddenResolvedPath(resolvedTarget: string, fragments: string[]): boolean {
  const normalized = `/${resolvedTarget.replace(/^\/+/, "")}`
  return fragments.some((fragment) => normalized.includes(fragment))
}

function violatesDomain(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, [
      "/app/api/", "/app/components/", "/app/lib/persistence/d1/",
      "/app/lib/infrastructure/persistence/d1/", "/app/lib/workunitInbox/sources/",
      "/app/lib/infrastructure/external/",
    ])
}

function violatesApplication(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, ["/app/components/", "/app/api/"])
}

function violatesComponents(edge: ModuleEdge): boolean {
  return hasForbiddenResolvedPath(edge.resolvedTarget, [
    "/app/lib/persistence/d1/", "/app/lib/infrastructure/persistence/d1/",
    "/app/lib/persistence/repositoryResolver.ts", "/app/lib/persistence/routeRepositories.ts",
    "/app/lib/workunitInbox/sources/", "/app/lib/infrastructure/external/",
  ])
}

function violatesUiDependency(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || hasForbiddenResolvedPath(edge.resolvedTarget, ["/app/components/", "/app/api/"])
}

function violatesApi(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || hasForbiddenResolvedPath(edge.resolvedTarget, ["/app/components/"])
}

async function assertNoForbiddenImports(
  scanRoots: string[],
  ruleName: string,
  forbidden: (edge: ModuleEdge) => boolean,
) {
  const violations = (await scanModuleGraph(rootDir, scanRoots))
    .filter(forbidden)
    .map((edge) => `${edge.file} -> ${edge.kind} ${edge.specifier}`)
  assert.deepEqual(violations, [], `${ruleName} violations:\n${violations.join("\n")}`)
}

test("architecture scanner covers every module-loading syntax", () => {
  const source = [
    'import type { A } from "./type.ts"',
    'import "./value.ts"',
    'export * from "./export.ts"',
    'const dynamic = import("./dynamic.ts")',
    'const required = require("./required.ts")',
    'type Lazy = import("./type-expression.ts").Lazy',
    'import Equal = require("./equals.ts")',
  ].join("\n")
  assert.deepEqual(extractModuleReferences(source, "control.mts"), [
    { kind: "import-type", specifier: "./type.ts" },
    { kind: "import", specifier: "./value.ts" },
    { kind: "export", specifier: "./export.ts" },
    { kind: "dynamic-import", specifier: "./dynamic.ts" },
    { kind: "require", specifier: "./required.ts" },
    { kind: "import-type-expression", specifier: "./type-expression.ts" },
    { kind: "import-equals", specifier: "./equals.ts" },
  ])
  assert.throws(
    () => extractModuleReferences('const path = "./x.ts"; import(path)', "nonliteral.mts"),
    /Non-literal dynamic-import is forbidden/,
  )
})

test("architecture scanner covers every supported source extension and ScriptKind", () => {
  for (const extension of ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]) {
    assert.equal(isCodeFilePath(`module.${extension}`), true, extension)
  }
  assert.equal(isCodeFilePath("module.json"), false)
  assert.deepEqual(extractModuleReferences("const view = <main />", "view.jsx"), [])
  assert.deepEqual(extractModuleReferences("const view: unknown = <main />", "view.tsx"), [])
})

test("architecture scanner follows createRequire aliases and ignores shadowed require", () => {
  const source = [
    'import { createRequire as makeRequire } from "node:module"',
    "const load = makeRequire(import.meta.url)",
    'load("./loaded.cjs")',
    "function local(require: (value: string) => void, value: string) { require(value) }",
  ].join("\n")
  assert.deepEqual(extractModuleReferences(source, "loader.mts"), [
    { kind: "import", specifier: "node:module" },
    { kind: "require", specifier: "./loaded.cjs" },
  ])
  assert.throws(
    () => extractModuleReferences(`${source}\nconst target = "./x.cjs"\nload(target)`, "nonliteral-loader.mts"),
    /Non-literal require is forbidden/,
  )
  const dynamicFactory = [
    'const { createRequire: factory } = await import("node:module")',
    "const localLoad = factory(import.meta.url)",
    'localLoad("./dynamic-loaded.cjs")',
  ].join("\n")
  assert.deepEqual(extractModuleReferences(dynamicFactory, "dynamic-loader.mts"), [
    { kind: "dynamic-import", specifier: "node:module" },
    { kind: "require", specifier: "./dynamic-loaded.cjs" },
  ])
})

test("architecture scanner fails closed and follows tsconfig aliases", async () => {
  await assert.rejects(() => scanModuleGraph(rootDir, ["missing-architecture-root"]), /ENOENT/)
  const importer = fileURLToPath(new URL("./architectureBoundaries.test.mts", import.meta.url))
  assert.equal(
    resolveModuleTarget(rootDir, importer, "@/scripts/lib/typescriptModuleGraph.mjs"),
    "scripts/lib/typescriptModuleGraph.d.mts",
  )
})

test("every architecture policy rejects a positive control", () => {
  const edge = (specifier: string, resolvedTarget: string): ModuleEdge => ({
    file: "control.ts", kind: "import", specifier, resolvedTarget,
  })
  const controls: Array<[(value: ModuleEdge) => boolean, ModuleEdge]> = [
    [violatesDomain, edge("react", "node_modules/@types/react/index.d.ts")],
    [violatesApplication, edge("next/server", "node_modules/next/server.d.ts")],
    [violatesComponents, edge("@/lib/persistence/d1/types", "app/lib/persistence/d1/types.ts")],
    [violatesApi, edge("@/components/x", "app/components/x.tsx")],
    [violatesUiDependency, edge("@/components/x", "app/components/x.tsx")],
  ]
  for (const [policy, forbidden] of controls) {
    assert.equal(policy(forbidden), true)
    assert.equal(policy(edge("@/lib/domain/types", "app/lib/domain/types.ts")), false)
  }
})

test("domain modules do not import UI, routes, Next/React, D1 implementations, or raw external clients", async () => {
  await assertNoForbiddenImports(["app/lib/domain"], "domain", violatesDomain)
})

test("application auth modules do not import React, components, or API routes", async () => {
  await assertNoForbiddenImports(["app/lib/application/auth"], "application-auth", violatesApplication)
})

test("application modules do not import React, components, or API routes", async () => {
  await assertNoForbiddenImports(["app/lib/application"], "application", violatesApplication)
})

test("components do not import D1 implementations, raw external clients, or server-only repository resolvers", async () => {
  await assertNoForbiddenImports(["app/components"], "components", violatesComponents)
})

test("API routes do not import React components", async () => {
  await assertNoForbiddenImports(["app/api"], "api", violatesApi)
})

test("D1 repositories do not import React, components, or API routes", async () => {
  await assertNoForbiddenImports(["app/lib/persistence/d1"], "d1", violatesUiDependency)
})

test("external source clients do not import React, components, or API routes", async () => {
  await assertNoForbiddenImports([
    "app/lib/workunitInbox/sources",
    "app/lib/infrastructure/external",
    "app/lib/integrations",
  ], "external-clients", violatesUiDependency)
})

// ─── Declared architecture-debt ledger (WU-00 records; it does not fix) ──────────

test("declared architecture-debt ledger is exact, complete and not an allowlist", async () => {
  const ledger = await readDebtLedger()
  assert.equal(ledger.sourceSha, REFACTOR_BASE_SHA)
  assert.equal(ledger.sourceShaRole, "refactor_base_only_not_tree_attestation")
  assert.equal(ledger.notAnAllowlist, true)
  assert.deepEqual(ledger.debts.map((debt) => debt.id).sort(), [...DEBT_IDS].sort())

  for (const debt of ledger.debts) {
    assert.deepEqual(Object.keys(debt).sort(), [...DEBT_FIELDS].sort(), `${debt.id} field set`)
    assert.equal(debt.status, "known_open", `${debt.id} status`)
    assert.equal(debt.introduced_by, "pre_wu00_snapshot", `${debt.id} introduced_by`)
    assert.equal(debt.source_sha, REFACTOR_BASE_SHA, `${debt.id} source_sha`)
    assert.equal(debt.production_change_allowed_in_wu00, false, `${debt.id} wu00 authority`)
    assert.ok(["type-only", "value"].includes(debt.edge_kind), `${debt.id} edge_kind`)
    assert.ok(OWNER_WORKUNITS.includes(debt.owner_workunit), `${debt.id} owner_workunit`)
    assert.ok(debt.risk.length > 40 && debt.removal_gate.length > 40, `${debt.id} needs risk and removal gate`)
    assert.ok(debt.exact_sources.length > 0 && debt.exact_targets.length > 0, `${debt.id} needs exact paths`)

    // Exact concrete file paths only: no glob, no directory prefix, no basename matching,
    // and every path must still exist so a stale entry fails instead of lingering.
    for (const target of [...debt.exact_sources, ...debt.exact_targets]) {
      assert.ok(!/[*?]|\*\*/.test(target), `${debt.id} path must not be a pattern: ${target}`)
      assert.ok(!target.endsWith("/"), `${debt.id} path must not be a directory: ${target}`)
      assert.ok(isCodeFilePath(target), `${debt.id} path must be a code file: ${target}`)
      const stats = await stat(path.join(rootDir, target)).catch(() => null)
      assert.ok(stats?.isFile(), `${debt.id} declares a path that no longer exists: ${target}`)
    }
  }
})

test("target domain policy forbids the tenant hybrid and application layer", () => {
  assert.equal(
    violatesDomainTarget(syntheticEdge("app/lib/domain/example.ts", "app/lib/tenant/types.ts")),
    true,
    "domain -> app/lib/tenant must be forbidden",
  )
  assert.equal(
    violatesDomainTarget(syntheticEdge("app/lib/domain/example.ts", "app/lib/application/example.ts")),
    true,
    "domain -> app/lib/application must be forbidden",
  )
  // Legitimate domain-internal dependencies stay accepted, including canonical tenant types.
  assert.equal(violatesDomainTarget(syntheticEdge("app/lib/domain/example.ts", "app/lib/domain/types.ts")), false)
  assert.equal(violatesDomainTarget(syntheticEdge("app/lib/domain/example.ts", "app/lib/domain/tenant/types.ts")), false)
  // Basename similarity must not be treated as a match for the forbidden tenant path.
  assert.equal(violatesDomainTarget(syntheticEdge("app/lib/domain/example.ts", "app/lib/domain/tenantTypes.ts")), false)
})

test("target external-client policy forbids the application layer", () => {
  assert.equal(
    violatesExternalClientTarget(syntheticEdge("app/lib/infrastructure/external/example.ts", "app/lib/application/example.ts")),
    true,
    "infrastructure/external -> app/lib/application must be forbidden",
  )
  // Intended infrastructure dependencies remain accepted.
  assert.equal(
    violatesExternalClientTarget(syntheticEdge("app/lib/infrastructure/external/example.ts", "app/lib/domain/types.ts")),
    false,
  )
  assert.equal(
    violatesExternalClientTarget(syntheticEdge("app/lib/infrastructure/external/github/client.ts", "app/lib/infrastructure/external/github/types.ts")),
    false,
  )
})

test("live domain boundary violations are exactly the declared tenant-hybrid debt", async () => {
  const ledger = await readDebtLedger()
  const observed = (await scanModuleGraph(rootDir, ["app/lib/domain"])).filter(violatesDomainTarget)
  const { undeclared, stale } = reconcile(observed, declaredDebtKeys(debtById(ledger, "domain_tenant_hybrid_boundary")))
  assert.deepEqual(undeclared, [], `undeclared domain boundary violation:\n${undeclared.join("\n")}`)
  assert.deepEqual(stale, [], `declared domain debt no longer observed:\n${stale.join("\n")}`)
})

test("live external-client boundary violations are exactly the declared signal-contract debt", async () => {
  const ledger = await readDebtLedger()
  const observed = (await scanModuleGraph(rootDir, [
    "app/lib/infrastructure/external",
    "app/lib/workunitInbox/sources",
    "app/lib/integrations",
  ])).filter(violatesExternalClientTarget)
  const declared = declaredDebtKeys(debtById(ledger, "infrastructure_application_signal_contract"))
  const { undeclared, stale } = reconcile(observed, declared)
  assert.deepEqual(undeclared, [], `undeclared external-client violation:\n${undeclared.join("\n")}`)
  assert.deepEqual(stale, [], `declared external-client debt no longer observed:\n${stale.join("\n")}`)
})

test("debt reconciliation rejects new, moved, upgraded and stale violations", async () => {
  const ledger = await readDebtLedger()
  const declared = declaredDebtKeys(debtById(ledger, "domain_tenant_hybrid_boundary"))
  const live = syntheticEdge("app/lib/domain/types.ts", "app/lib/tenant/types.ts")
  assert.deepEqual(reconcile([live], declared).undeclared, [], "declared edge must reconcile cleanly")

  // A new importer of the same debt target is not silently absorbed.
  const newImporter = syntheticEdge("app/lib/domain/newModule.ts", "app/lib/tenant/types.ts")
  assert.deepEqual(
    reconcile([live, newImporter], declared).undeclared,
    ["app/lib/domain/newModule.ts | type-only | app/lib/tenant/types.ts"],
  )

  // A different target path is not covered by an existing record.
  const movedTarget = syntheticEdge("app/lib/domain/types.ts", "app/lib/application/workunitInbox/types.ts")
  assert.deepEqual(
    reconcile([live, movedTarget], declared).undeclared,
    ["app/lib/domain/types.ts | type-only | app/lib/application/workunitInbox/types.ts"],
  )

  // Upgrading a declared type-only debt into a value edge fails.
  const upgraded = syntheticEdge("app/lib/domain/types.ts", "app/lib/tenant/types.ts", "import")
  const upgradedResult = reconcile([upgraded], declared)
  assert.deepEqual(upgradedResult.undeclared, ["app/lib/domain/types.ts | value | app/lib/tenant/types.ts"])
  assert.ok(
    upgradedResult.stale.includes("app/lib/domain/types.ts | type-only | app/lib/tenant/types.ts"),
    "the superseded type-only record must surface as unmatched",
  )

  // A declared debt whose live edge disappeared surfaces as stale rather than passing.
  assert.deepEqual(
    reconcile([], declared).stale.length,
    declared.length,
  )

  // An undeclared equivalent violation in another layer is not covered by this record.
  const otherLayer = syntheticEdge("app/lib/infrastructure/external/slack/other.ts", "app/lib/application/example.ts")
  assert.equal(reconcile([otherLayer], declared).undeclared.length, 1)
})
