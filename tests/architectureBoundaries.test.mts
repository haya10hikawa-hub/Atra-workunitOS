import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir, stat } from "node:fs/promises"
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
const DEBT_IDS: string[] = []
// Both recorded inversions are resolved, and in both cases the entry was removed only after the
// live edges disappeared — the record was never the mechanism of closure.
//
// `domain_tenant_hybrid_boundary` (WU-01A): both domain modules now consume the canonical
// declarations in app/lib/domain/tenant/types.ts directly.
// `infrastructure_application_signal_contract` (WU-02): the normalized signal family moved to the
// neutral port app/lib/ports/toolSignal/types.ts, so the three provider mappers depend downward.
//
// Reintroduction is not absorbed either way: `violatesDomainTarget` still forbids /app/lib/tenant/,
// `violatesExternalClientTarget` still forbids /app/lib/application/, and the declared set is now
// empty, so any returning edge reconciles as undeclared.
const RESOLVED_DEBT_IDS = ["domain_tenant_hybrid_boundary", "infrastructure_application_signal_contract"]
const SIGNAL_PORT = "app/lib/ports/toolSignal/types.ts"
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

// The ports layer is a neutral contract boundary, so its policy is a closed allowlist rather than
// a denylist: a target nobody anticipated — a package, a Node builtin, a future layer, an
// unresolvable specifier — is forbidden by default instead of silently permitted. React, Next,
// application, infrastructure, persistence, components and API routes are all excluded by it.
const PERMITTED_PORT_TARGET_PREFIXES = ["app/lib/ports/", "app/lib/domain/"]

function violatesPortTarget(edge: ModuleEdge): boolean {
  const normalized = edge.resolvedTarget.replace(/^\/+/, "")
  return !PERMITTED_PORT_TARGET_PREFIXES.some((prefix) => normalized.startsWith(prefix))
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
  // The relocated signal port is the intended target of the WU-02 closure and must not be
  // classified as a violation, or the closure would be unrepresentable.
  assert.equal(
    violatesExternalClientTarget(syntheticEdge("app/lib/infrastructure/external/github/toNormalizedToolSignal.ts", SIGNAL_PORT)),
    false,
  )
})

test("target port policy permits only ports and domain and rejects a positive control", () => {
  const portEdge = (specifier: string, resolvedTarget: string): ModuleEdge => ({
    file: "app/lib/ports/toolSignal/types.ts", kind: "import", specifier, resolvedTarget,
  })
  const forbidden: Array<[string, string]> = [
    ["next/server.js", "node_modules/next/server.d.ts"],
    ["react", "node_modules/@types/react/index.d.ts"],
    ["../../application/workunitInbox/types.ts", "app/lib/application/workunitInbox/types.ts"],
    ["../../infrastructure/external/github/types.ts", "app/lib/infrastructure/external/github/types.ts"],
    ["../../persistence/d1/types.ts", "app/lib/persistence/d1/types.ts"],
    ["../../../components/workunit-os/WorkUnitCard.tsx", "app/components/workunit-os/WorkUnitCard.tsx"],
    ["../../../api/workunit/inbox/route.ts", "app/api/workunit/inbox/route.ts"],
    ["node:fs", "node:fs"],
  ]
  for (const [specifier, resolvedTarget] of forbidden) {
    assert.equal(violatesPortTarget(portEdge(specifier, resolvedTarget)), true, `${resolvedTarget} must be forbidden`)
  }
  for (const permitted of [SIGNAL_PORT, "app/lib/ports/other/types.ts", "app/lib/domain/types.ts"]) {
    assert.equal(violatesPortTarget(portEdge("./x.ts", permitted)), false, `${permitted} must be permitted`)
  }
  // Prefix lookalikes are not the permitted layer: matching is on the path boundary, not the name.
  assert.equal(violatesPortTarget(portEdge("../portsLegacy/types.ts", "app/lib/portsLegacy/types.ts")), true)
})

test("port modules import only ports and domain, and the tool signal port is a graph leaf", async () => {
  // Non-vacuity: an empty scan proves nothing unless the scan root actually contains code.
  const portFiles = await collectCodeFiles(path.join(rootDir, "app/lib/ports"))
  assert.ok(portFiles.length > 0, "app/lib/ports must contain scanned code files")
  await assertNoForbiddenImports(["app/lib/ports"], "ports", violatesPortTarget)
  assert.deepEqual(await scanModuleGraph(rootDir, ["app/lib/ports"]), [],
    "the tool signal port must import nothing at all")
})

// T1 — the domain layer now has zero live boundary violations, reconciled against an EMPTY
// declared set. This is strictly stronger than the previous form, which reconciled against the
// two declared tenant-hybrid edges. Nothing is allowlisted: the declared side is [].
test("live domain boundary violations are empty and no domain debt remains declared", async () => {
  const observed = (await scanModuleGraph(rootDir, ["app/lib/domain"])).filter(violatesDomainTarget)
  assert.deepEqual(
    observed.map((edge) => `${edge.file} -> ${edge.kind} ${edge.specifier}`),
    [],
    "app/lib/domain must have no target-policy violation",
  )

  const { undeclared, stale } = reconcile(observed, [])
  assert.deepEqual(undeclared, [], `undeclared domain boundary violation:\n${undeclared.join("\n")}`)
  assert.deepEqual(stale, [], `stale declared domain debt:\n${stale.join("\n")}`)

  // The record may only be absent because the edges are absent, never the other way round.
  const ledger = await readDebtLedger()
  for (const id of RESOLVED_DEBT_IDS) {
    assert.equal(
      ledger.debts.some((debt) => debt.id === id), false,
      `${id} was resolved and must not be re-declared`,
    )
  }
})

// The external-client counterpart of the domain test above: zero live violations, reconciled
// against an EMPTY declared set. Nothing is allowlisted — the declared side is [].
test("live external-client boundary violations are empty and no external-client debt remains declared", async () => {
  const observed = (await scanModuleGraph(rootDir, [
    "app/lib/infrastructure/external",
    "app/lib/workunitInbox/sources",
    "app/lib/integrations",
  ])).filter(violatesExternalClientTarget)
  assert.deepEqual(
    observed.map((edge) => `${edge.file} -> ${edge.kind} ${edge.specifier}`),
    [],
    "external source clients must have no target-policy violation",
  )

  const { undeclared, stale } = reconcile(observed, [])
  assert.deepEqual(undeclared, [], `undeclared external-client violation:\n${undeclared.join("\n")}`)
  assert.deepEqual(stale, [], `stale declared external-client debt:\n${stale.join("\n")}`)

  // The record may only be absent because the edges are absent, never the other way round.
  const ledger = await readDebtLedger()
  for (const id of RESOLVED_DEBT_IDS) {
    assert.equal(
      ledger.debts.some((debt) => debt.id === id), false,
      `${id} was resolved and must not be re-declared`,
    )
  }
})

// T6 — reconcile() is a pure function; its unit test must not depend on the live ledger, or the
// stale-entry, new-importer and value-upgrade rejections would all vanish the moment the last
// domain debt was closed. The declared set is therefore a literal synthetic record with the exact
// shape the removed debt had, so every rejection below stays permanently exercised.
test("debt reconciliation rejects new, moved, upgraded and stale violations", async () => {
  // The declared set is derived from a synthetic ledger record rather than the live one, so
  // declaredDebtKeys() and debtById() — and every rejection below — stay permanently exercised
  // now that the live ledger is empty.
  const syntheticLedger: DebtLedger = {
    sourceSha: REFACTOR_BASE_SHA, sourceShaRole: "refactor_base_only_not_tree_attestation",
    notAnAllowlist: true,
    debts: [{
      id: "synthetic_reconciliation_control", status: "known_open", introduced_by: "pre_wu00_snapshot",
      source_sha: REFACTOR_BASE_SHA, edge_kind: "type-only", owner_workunit: "WU-01",
      exact_sources: ["app/lib/domain/types.ts"], exact_targets: ["app/lib/tenant/types.ts"],
      risk: "Synthetic control record. It exists only inside this test, so reconciliation stays exercised.",
      removal_gate: "Never removed: this record has no live edge and is not part of the shipped ledger.",
      production_change_allowed_in_wu00: false,
    }],
  }
  const declared = declaredDebtKeys(debtById(syntheticLedger, "synthetic_reconciliation_control"))
  assert.deepEqual(declared, ["app/lib/domain/types.ts | type-only | app/lib/tenant/types.ts"])
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

// ─── Domain tenant identity import direction (WU-01A closure) ────────────────────
//
// Permanent guards. Closing the debt removed a record; it must not remove the enforcement.
// Every test asserts on a RESOLVED target, never on specifier text: the same string
// "../tenant/types.ts" denotes the canonical module from app/lib/domain/auth/ and the
// compatibility module from app/lib/domain/. That is the likeliest misreading of this slice.

const CANONICAL_TENANT = "app/lib/domain/tenant/types.ts"
const COMPAT_TENANT = "app/lib/tenant/types.ts"
const PHASE6_TENANT_ALIAS = "app/lib/phase6/artifacts/types.ts"
const IDENTITY_SYMBOLS = ["Tenant", "TenantId", "UserId", "WorkUnitId"]
const COMPAT_EXPORTS = [...IDENTITY_SYMBOLS, "Actor", "TenantContext", "TenantBoundaryResult",
  "assertTenantBoundary", "requireTenantContext", "createAnonymousDevelopmentTenantContext"]

// T2 — the consumed identity is the canonical BRANDED declaration. A silent widening to the
// structurally different unbranded Phase 6 alias would not fail loudly everywhere.
test("domain tenant identity resolves to the canonical branded declarations", async () => {
  const canonical = await readFile(path.join(rootDir, CANONICAL_TENANT), "utf8")
  for (const brand of ["TenantId", "UserId", "WorkUnitId"]) {
    assert.ok(canonical.includes(`export type ${brand} = string & { readonly __brand: "${brand}" }`),
      `${CANONICAL_TENANT} must declare ${brand} as a branded type`)
  }

  const domainEdges = await scanModuleGraph(rootDir, ["app/lib/domain"])
  assert.deepEqual(domainEdges.filter((edge) => edge.resolvedTarget === PHASE6_TENANT_ALIAS), [],
    "no domain file may resolve an identity import to the unbranded Phase 6 alias")

  for (const file of ["app/lib/domain/types.ts", "app/lib/domain/workUnitLifecycle.ts"]) {
    const identity = domainEdges.filter((edge) =>
      edge.file === file && edge.resolvedTarget.endsWith("tenant/types.ts"))
    assert.deepEqual(identity.map((edge) => edge.resolvedTarget), [CANONICAL_TENANT],
      `${file} must consume canonical tenant identity directly`)
    assert.deepEqual(identity.map((edge) => edge.kind), ["import-type"],
      `${file} must keep its tenant identity import type-only`)
  }
})

// T3 — structural sweep over every reference kind the graph can express: a re-export, dynamic
// import, require or `import =` back to the compatibility module is equally a violation.
test("no domain file imports or re-exports the compatibility tenant module", async () => {
  const offenders = (await scanModuleGraph(rootDir, ["app/lib/domain"]))
    .filter((edge) => edge.resolvedTarget === COMPAT_TENANT)
    .map((edge) => `${edge.file} -> ${edge.kind} ${edge.specifier}`)
  assert.deepEqual(offenders, [], `app/lib/domain must not reach upward into ${COMPAT_TENANT}`)
})

// T4 — the compatibility module is NOT dead and NOT removable: it keeps a live value edge.
// Drift either way fails — silently migrating consumers is also an undeclared architecture change.
test("compatibility tenant module keeps its consumers and its full export surface", async () => {
  const edges = (await scanModuleGraph(rootDir, ["app", "tests", "scripts", "electron"]))
    .filter((edge) => edge.resolvedTarget === COMPAT_TENANT)
  const files = [...new Set(edges.map((edge) => edge.file))]

  assert.equal(files.length, 89, "compatibility importer file count drifted")
  assert.equal(edges.length, 91, "compatibility importer edge count drifted")
  assert.deepEqual(files.filter((file) => file.startsWith("app/lib/domain/")), [],
    "no domain file may appear among the compatibility consumers")
  assert.deepEqual(
    edges.filter((edge) => edgeKindClass(edge.kind) === "value").map((edge) => edge.file),
    ["tests/saasSecurity.test.mts"], "the single remaining value consumer must stay accounted for")

  const source = await readFile(path.join(rootDir, COMPAT_TENANT), "utf8")
  for (const symbol of COMPAT_EXPORTS) {
    assert.ok(source.includes(symbol), `${COMPAT_TENANT} must still export ${symbol}`)
  }
  // The identity types stay pure re-exports: the façade gains no canonical authority.
  assert.ok(source.includes(`export type { ${IDENTITY_SYMBOLS.join(", ")} } from "../domain/tenant/types.ts"`),
    "identity types must remain re-exports, never competing declarations")
})

// T5 — closure, not intactness. An empty ledger is only evidence if the edges it recorded are
// gone AND the replacement direction is the intended one, so both halves are asserted together:
// the record is absent, and each of the three mappers resolves the contract type-only to the port.
test("the infrastructure signal contract debt is closed at the port, not merely unrecorded", async () => {
  const ledger = await readDebtLedger()
  assert.deepEqual(ledger.debts, [], "the ledger must be empty once its last entry is closed")
  assert.deepEqual([...DEBT_IDS], [], "the source-controlled declared set must be empty too")
  assert.ok(RESOLVED_DEBT_IDS.includes("infrastructure_application_signal_contract"),
    "the closed id must be recorded as resolved so it cannot be re-declared")

  const mappers = (await scanModuleGraph(rootDir, ["app/lib/infrastructure/external"]))
    .filter((edge) => edge.file.endsWith("/toNormalizedToolSignal.ts")
      && (edge.resolvedTarget === SIGNAL_PORT || edge.resolvedTarget.includes("workunitInbox/types.ts")))
    .map((edge) => `${edge.file} | ${edgeKindClass(edge.kind)} | ${edge.resolvedTarget}`)
    .sort()
  assert.deepEqual(mappers, [
    `app/lib/infrastructure/external/calendar/toNormalizedToolSignal.ts | type-only | ${SIGNAL_PORT}`,
    `app/lib/infrastructure/external/github/toNormalizedToolSignal.ts | type-only | ${SIGNAL_PORT}`,
    `app/lib/infrastructure/external/slack/toNormalizedToolSignal.ts | type-only | ${SIGNAL_PORT}`,
  ], "all three provider mappers must consume the signal contract from the port, type-only")
})

// T7 — reintroduction fails closed: the policy is unweakened and the declared set is now empty,
// so a returning edge is both forbidden AND undeclared.
test("reintroducing a domain to compatibility tenant edge fails closed", () => {
  const returning = syntheticEdge("app/lib/domain/types.ts", COMPAT_TENANT)
  assert.equal(violatesDomainTarget(returning), true,
    "the forbidden-path policy must still reject the compatibility module")
  assert.deepEqual(reconcile([returning], []).undeclared,
    ["app/lib/domain/types.ts | type-only | app/lib/tenant/types.ts"],
    "with an empty declared set the edge must surface as undeclared, not be absorbed")
  assert.equal(violatesDomainTarget(syntheticEdge("app/lib/domain/new.ts", COMPAT_TENANT)), true)
})

// T8 — classification is by resolved path, not name similarity, and the same specifier text
// resolves differently by directory. app/lib/domain/auth/types.ts is already canonical.
test("tenant path lookalikes are classified by resolved target, not by name", () => {
  assert.equal(violatesDomainTarget(syntheticEdge("app/lib/domain/x.ts", COMPAT_TENANT)), true)
  for (const benign of [CANONICAL_TENANT, "app/lib/domain/tenantTypes.ts", PHASE6_TENANT_ALIAS]) {
    assert.equal(violatesDomainTarget(syntheticEdge("app/lib/domain/x.ts", benign)), false,
      `${benign} must not be treated as the forbidden compatibility module`)
  }
  assert.equal(
    resolveModuleTarget(rootDir, path.join(rootDir, "app/lib/domain/auth/types.ts"), "../tenant/types.ts"),
    CANONICAL_TENANT, "app/lib/domain/auth/types.ts is already canonical and must stay untouched")
  assert.equal(
    resolveModuleTarget(rootDir, path.join(rootDir, "app/lib/domain/types.ts"), "../tenant/types.ts"),
    COMPAT_TENANT, "from app/lib/domain/ the same string denotes the compatibility module")
})

// T9 — runtime neutrality made executable rather than asserted: `import type` is fully erased,
// so both specifier forms must emit byte-identical JavaScript.
test("the import direction change emits byte-identical JavaScript", async () => {
  const ts = (await import("typescript")).default
  const options = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2017, isolatedModules: true }
  const emit = (specifier: string): string => ts.transpileModule(
    `import type { TenantId } from "${specifier}"\nexport type X = { a: TenantId }\n`,
    { compilerOptions: options, fileName: "probe.ts" }).outputText

  assert.equal(emit("./tenant/types.ts"), emit("../tenant/types.ts"),
    "a type-only specifier change must not alter emitted JavaScript")
  assert.equal(emit("./tenant/types.ts").includes("tenant/types"), false,
    "the erased import must leave no runtime reference")
})

// ─── Governance boundaries (WU-00 scope, authority and evidence limits) ──────────
//
// These pins exist because each boundary below is a *claim about what WU-00 does not do*.
// Such claims decay silently: nothing fails when a reader starts assuming the opposite.
// Each test therefore pairs the recorded statement in the program document with a
// structural check, so the boundary cannot quietly become untrue.

const PROGRAM_DOC = "docs/architecture/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md"

const PROPOSED_CANONICAL_TYPES = [
  "CanonicalSourceRecordV1", "CorrelationGroupV1", "WorkUnitCandidateV1", "WorkUnitCorrectionV1",
  "WorkUnitReviewV1", "ReviewedWorkUnitV1", "ActionPreparationV1",
]

// WU-01B: the additive authorized-declaration registry. The seven names above stay forbidden;
// this literal records the one versioned record the owner ratified, and the exact path it may be
// declared at. Absence from the forbidden list is NOT permission — an unlisted `*RecordV1` under
// a fresh name is exactly how WU-00 Review 3 recorded `WU00_PR211_BOUNDARY_INCOMPLETE`, so the
// check below is a closed allowlist rather than an open denylist. Expanding it requires a human
// edit to this source-controlled literal in the same review, as `DEBT_IDS` does.
const AUTHORIZED_CANONICAL_RECORD_DECLARATIONS = [
  { name: "SourceRecordV1", path: "app/lib/domain/source/types.ts" },
]

// The record's sole validator is a function, not a record, but its name necessarily ends in a
// family suffix. It is listed separately so the allowlist stays honest about what each entry is,
// and just as narrowly: one name, one path, so a second validator anywhere else still fails.
const AUTHORIZED_RECORD_VALIDATOR_DECLARATIONS = [
  { name: "validateSourceRecordV1", path: "app/lib/domain/source/validateSourceRecord.ts" },
]

const VERSIONED_RECORD_FAMILY_SUFFIXES = [
  "RecordV1", "CandidateV1", "ReviewV1", "CorrectionV1", "GroupV1", "PreparationV1",
]

const WU10_GATE_CONDITIONS = [
  "legacy edge baseline = 0",
  "legacy file baseline = 0",
  "production entry-point reachability classified",
  "test-only reachability classified",
  "operator entry points classified",
  "non-import references checked",
  "remaining unreachable modules explicitly classified",
  "PM decisions recorded for dormant research and prototypes",
]

const GO_TOKEN = "WU00_EXACT_HEAD_INDEPENDENT_ARCHITECTURE_EVIDENCE_GO"

// Review chronology. Each state owns one section and one ratchet count; the counts are historical
// state labels, never one timeless result. Sections are located by heading, never by line number.
const REVIEW_STATES = [
  { heading: "Review 1 —", count: "228", must: ["`BLOCK`", "superseded"] },
  { heading: "Review 2 — exact head `37b9411d5279826ecdeaedcbab6bb20effb1d11e`", count: "234",
    must: [GO_TOKEN, "PM_REVIEW_ELIGIBLE_ONLY"] },
  { heading: "Review 3 — exact head `4c87ec0f90fa199883fe572de27e192728939a5a`", count: "240",
    must: ["WU00_CORRECTION_MUTATION_SURVIVOR", "WU00_PR211_BOUNDARY_INCOMPLETE",
      "e44fdc4f024fac189c9edc57fc1bf6e09b9873f9d1a9d1f1dee6e4069e80aff4"] },
  { heading: "Final governance-pin closure candidate", count: "242",
    must: ["has not received an independent GO", "requires a fresh exact-head independent review",
      "Ready, merge and WU-01 remain unauthorized"] },
]

const ACCEPTANCE_STATE_SEQUENCE = [
  "- **228** at the first reviewed WU-00 state (Review 1);",
  "- **234** at reviewed exact head `37b9411d` (Review 2);",
  "- **240** at reviewed exact head `4c87ec0f` (Review 3);",
  "- **242** at this final governance-pin closure candidate, which is not yet independently reviewed.",
]

// PR #211's exact family, plus every way it could return under a different name.
const PR211_FAMILY = [
  "app/lib/application/formation/findings.ts",
  "app/lib/application/formation/findingsTypes.ts",
  "tests/formationFindings.test.mts",
  "tests/fixtures/formation/findings/scenarios.json",
]

const PR211_DEPENDENCY_TOKENS = ["formation/findings", "formationFindings", "feat/f6-formation-findings"]

const PR211_REQUIRED = [
  "UNMERGED_NON_AUTHORITY_INPUT", "does not modify it", "does not consume it", "does not copy it",
  "does not authorize merging it", "is not an authority input", "F6A is not a WU-03 authority input",
]

// Lowercased promotions. Each is an affirmative grant, so none can appear inside a negation above.
const PR211_FORBIDDEN_PROMOTIONS = [
  "approved input", "approved wu-03", "wu-03 dependency", "consume f6",
  "copy findings", "copied into", "may be copied", "merge authorized",
]

async function readProgramDoc(): Promise<string> {
  return readFile(path.join(rootDir, PROGRAM_DOC), "utf8")
}

function documentSections(doc: string): Map<string, string> {
  const sections = new Map<string, string>()
  const parts = doc.split(/^(#{2,4} .+)$/m)
  for (let index = 1; index < parts.length; index += 2) {
    sections.set(parts[index].replace(/^#+\s*/, "").trim(), `${parts[index]}\n${parts[index + 1] ?? ""}`)
  }
  return sections
}

function programSection(sections: Map<string, string>, startsWith: string): string {
  const heading = [...sections.keys()].find((key) => key.startsWith(startsWith))
  if (heading === undefined) assert.fail(`program document must keep the section "${startsWith}"`)
  return sections.get(heading) ?? ""
}

function assertDocDeclares(doc: string, phrases: string[], label: string): void {
  const missing = phrases.filter((phrase) => !doc.includes(phrase))
  assert.deepEqual(missing, [], `${label} must stay declared in ${PROGRAM_DOC}:\n${missing.join("\n")}`)
}

async function collectCodeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectCodeFiles(full)))
    else if (isCodeFilePath(entry.name)) files.push(full)
  }
  return files
}

test("governance: proposed canonical records are proposal terminology, not runtime authority", async () => {
  assertDocDeclares(await readProgramDoc(), [
    "### Proposal terminology is not runtime authority",
    "They are not current runtime product-data authority.",
    "WU-00 does not implement runtime product-data authority.",
  ], "proposal terminology boundary")

  // Structural: no proposed canonical name is *declared* anywhere in shipped or operator code.
  // Naming a type "canonical" in a document does not make it authority; declaring it would be
  // the first step of WU-01, which this PR does not authorize.
  const declarations: string[] = []
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      const source = await readFile(file, "utf8")
      for (const name of PROPOSED_CANONICAL_TYPES) {
        if (new RegExp(`\\b(?:type|interface|class|enum|const|function)\\s+${name}\\b`).test(source)) {
          declarations.push(`${path.relative(rootDir, file)} declares ${name}`)
        }
      }
    }
  }
  assert.deepEqual(declarations, [], `proposal terminology must not become a runtime declaration:\n${declarations.join("\n")}`)
})

// T15 — WU-01B. The guard above is a denylist, so a versioned record under an unlisted name would
// pass it silently. This pairs it with a closed allowlist over the whole versioned-record family:
// exactly the ratified declarations, at exactly the ratified paths, and nothing else.
test("governance: only ratified canonical record names are declared, at exactly one path each", async () => {
  assertDocDeclares(await readProgramDoc(), [
    "### WU-01B source record re-scope",
    "`SourceRecordV1` is the only authorized canonical record declaration",
    "The seven proposal names remain forbidden.",
  ], "WU-01B authorized declaration")

  const pattern = new RegExp(
    `\\b(?:type|interface|class|enum|const|function)\\s+(\\w*(?:${VERSIONED_RECORD_FAMILY_SUFFIXES.join("|")}))\\b`,
    "g")
  const declarations: string[] = []
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      const source = await readFile(file, "utf8")
      for (const found of source.matchAll(pattern)) {
        declarations.push(`${path.relative(rootDir, file)} declares ${found[1]}`)
      }
    }
  }
  const authorized = [
    ...AUTHORIZED_CANONICAL_RECORD_DECLARATIONS, ...AUTHORIZED_RECORD_VALIDATOR_DECLARATIONS,
  ].map((entry) => `${entry.path} declares ${entry.name}`)
  assert.deepEqual(declarations.sort(), authorized.sort(),
    `only ratified canonical record declarations may exist:\n${declarations.join("\n")}`)
})

test("governance: WU-01 is not authorized by WU-00 or by debt ownership", async () => {
  assertDocDeclares(await readProgramDoc(), [
    "### WU-01 is not authorized",
    "WU-00 does not start WU-01.",
    "Debt ownership records who *would* own the fix, not permission to begin.",
    "It does **not** authorize starting, implementing, or merging those WorkUnits.",
  ], "WU-01 non-authorization")

  // Structural: an owner_workunit field records a prospective owner, never progress or approval.
  // Every declared debt therefore stays open and stays barred from WU-00 production change.
  const ledger = await readDebtLedger()
  for (const debt of ledger.debts) {
    assert.equal(debt.status, "known_open", `${debt.id}: ownership must not imply the work started`)
    assert.equal(debt.production_change_allowed_in_wu00, false, `${debt.id}: WU-00 may not change production`)
  }
})

test("governance: PR #211 is unmerged non-authority input", async () => {
  assertDocDeclares(await readProgramDoc(), [
    "### PR #211 is `UNMERGED_NON_AUTHORITY_INPUT`",
    "does not reference it as authority, and does not authorize merging it",
  ], "PR #211 boundary")

  // Structural: PR #211's formation-findings module family must be absent at this head, so the
  // program cannot depend on blocked, unmerged work.
  const findings = await stat(path.join(rootDir, "app/lib/application/formation/findings.ts")).catch(() => null)
  assert.equal(findings, null, "PR #211 formation findings module must not exist in WU-00")
})

test("governance: reachability evidence limit is pinned to static module syntax", async () => {
  assertDocDeclares(await readProgramDoc(), [
    "## Reachability Evidence Limit",
    "must **not** be read as `unreachable code = 0`",
    "A reachability and non-import-reference gate is required before WU-10 can complete.",
  ], "reachability evidence limit")

  // Executable proof of the limit rather than a restatement of it: a real existing file path used
  // as a string, a documented operator command, and a configuration-style reference all produce
  // no edge. The graph is therefore structurally incapable of speaking to these reference kinds.
  assert.deepEqual(extractModuleReferences([
    'const source = "app/lib/tenant/types.ts"',
    'await readFile("app/lib/domain/types.ts", "utf8")',
    'const command = "npm run test:canonical-pipeline-ratchets"',
    'const configured = { entry: "app/api/workunit/inbox/route.ts" }',
  ].join("\n"), "reachability-limit-control.mts"), [],
    "path-string, command and configuration references must stay invisible to the static graph")
})

test("governance: WU-10 baseline zero is necessary but not sufficient", async () => {
  const doc = await readProgramDoc()
  assertDocDeclares(doc, [
    "### WU-10 cleanup exit gate",
    "necessary but not sufficient",
    "A module is not eligible for deletion merely because it has no static importer.",
    "the legacy edge/file baseline alone is not sufficient",
  ], "WU-10 exit gate")

  // Every non-baseline condition must remain in the gate. Dropping one would silently reduce
  // WU-10 to the baseline measure the gate exists to reject.
  assertDocDeclares(doc, WU10_GATE_CONDITIONS, "WU-10 gate conditions")
})

test("governance: declared debt ledger is a review-governed registry, not a machine-closed ratchet", async () => {
  assertDocDeclares(await readProgramDoc(), [
    "The declared-architecture-debt ledger is a `REVIEW_GOVERNED_DEBT_REGISTRY`.",
    "It is **not** a `MACHINE_CLOSED_RATCHET`.",
    "Ledger expansion requires a separate PM/architecture decision recorded before the change.",
    "it is never evidence that the expansion was authorized",
  ], "debt registry classification")

  // Structural: the accepted debt ids are a source-controlled constant, not a fixture value, so a
  // fixture edit alone cannot expand the ledger — a reviewer must change this file too. That is
  // exactly the review gate; it is a human decision point, not a machine-closed guarantee.
  const ledger = await readDebtLedger()
  assert.deepEqual(ledger.debts.map((debt) => debt.id).sort(), [...DEBT_IDS].sort())
  assert.deepEqual([...DEBT_IDS].sort(), [],
    "declared debt is empty: both recorded inversions are closed, and adding an entry requires a separate PM/architecture decision recorded before the change")

  // Contraction is governed the same way expansion is. A satisfied removal_gate is the only route
  // out of the ledger, and it requires this source-controlled literal to change too.
  const removed = RESOLVED_DEBT_IDS.filter((id) => ledger.debts.some((debt) => debt.id === id))
  assert.deepEqual(removed, [], "a resolved debt id must not reappear in the ledger")
})

test("governance: review chronology and exact-head assurance remain bound", async () => {
  const doc = await readProgramDoc()
  const sections = documentSections(doc)

  // Every state keeps its own section, and no state may present another state's count as its own.
  for (const state of REVIEW_STATES) {
    const body = programSection(sections, state.heading)
    assertDocDeclares(body, [...state.must, `**${state.count}`], `${state.heading} record`)
    const borrowed = REVIEW_STATES
      .filter((other) => other.count !== state.count && body.includes(`**${other.count}`))
      .map((other) => other.count)
    assert.deepEqual(borrowed, [], `${state.heading} must not present ${borrowed.join("/")} as its own count`)
  }

  // A GO binds to one exact head: it occurs once, inside Review 2, and never reaches a later state.
  assert.equal(doc.split(GO_TOKEN).length - 1, 1, "the GO token must appear exactly once")
  assert.ok(programSection(sections, "Review 2 — exact head").includes(GO_TOKEN),
    "the single GO token must stay inside the Review 2 record")
  const candidate = programSection(sections, "Final governance-pin closure candidate")
  const inherited = [GO_TOKEN, "independently approved"].filter((claim) => candidate.includes(claim))
  assert.deepEqual(inherited, [], `the closure candidate must not claim: ${inherited.join(", ")}`)
  assertDocDeclares(doc, [
    "A GO is bound to the exact head it names. It must not be carried forward to a later head.",
  ], "assurance binding")

  // The acceptance record keeps the exact state sequence 228 -> 234 -> 240 -> 242.
  assertDocDeclares(doc, ACCEPTANCE_STATE_SEQUENCE, "ratchet count state sequence")
})

test("governance: PR #211 family and authority remain isolated", async () => {
  // The exact four-file family stays absent, as does the directory an alternate member would need.
  for (const relative of [...PR211_FAMILY, "app/lib/application/formation"]) {
    assert.equal(await stat(path.join(rootDir, relative)).catch(() => null), null,
      `PR #211 must not be reintroduced at ${relative}`)
  }

  // No tracked runtime, operator, configuration or test module may reference the family by import,
  // export, dynamic import, require or path string. This file names the tokens, so it is excluded.
  const selfPath = path.join(rootDir, "tests/architectureBoundaries.test.mts")
  const dependencies: string[] = []
  for (const root of ["app", "scripts", "tests", "electron", "prototypes", "contracts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      if (file === selfPath) continue
      const source = await readFile(file, "utf8")
      for (const token of PR211_DEPENDENCY_TOKENS) {
        if (source.includes(token)) dependencies.push(`${path.relative(rootDir, file)} references ${token}`)
      }
    }
  }
  assert.deepEqual(dependencies, [], `PR #211 must stay unmerged non-authority input:\n${dependencies.join("\n")}`)

  // The recorded boundary keeps every non-authority statement and admits no promotion to authority.
  const section = programSection(documentSections(await readProgramDoc()), "PR #211 is")
  assertDocDeclares(section, PR211_REQUIRED, "PR #211 boundary")
  const promotions = PR211_FORBIDDEN_PROMOTIONS.filter((phrase) => section.toLowerCase().includes(phrase))
  assert.deepEqual(promotions, [], `PR #211 section must not promote it to authority: ${promotions.join(", ")}`)
})
