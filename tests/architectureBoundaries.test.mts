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
// WU-A enforcement baseline: the head at which the layer policies below were installed and at
// which their live violations were recorded. Kept distinct from the refactor base, because an
// entry whose source path did not exist at the refactor base must not claim that provenance.
const WU_A_BASELINE_SHA = "3a2bf3cbbffd304d7db4a0eb5a7d5058ae2d3402"
const DEBT_BASELINE_SHAS = [REFACTOR_BASE_SHA, WU_A_BASELINE_SHA]
// Closed origin vocabulary. A new origin requires a human edit here, exactly as DEBT_IDS does, so
// a ledger entry can never invent its own provenance string.
const DEBT_ORIGINS = ["pre_wu00_snapshot", "wu02s_route_to_application_relocation"]
// The declared set. Expanded by WU-A under the recorded PM decision
// ATRA_PM_ARCHITECTURE_DEBT_REGISTRY_EXPANSION_WU_A_RATIFIED, which permits recording violations
// that already exist and forbids approving them. WU-06 closed three of the four records — the
// session use case no longer composes itself — leaving ONE record over six exact edges, all of
// them the inbox provider selection WU-02 owns. Each is a live violation of a policy WU-A
// installed, never an exception granted to one.
const DEBT_IDS: string[] = [
  "application_inbox_provider_implementation_selection",
]
// Every previously recorded inversion is resolved, and in each case the entry was removed only
// after the live edges disappeared — the record was never the mechanism of closure.
//
// `domain_tenant_hybrid_boundary` (WU-01A): both domain modules now consume the canonical
// declarations in app/lib/domain/tenant/types.ts directly.
// `infrastructure_application_signal_contract` (WU-02): the normalized signal family moved to the
// neutral port app/lib/ports/toolSignal/types.ts, so the three provider mappers depend downward.
// `application_session_outward_value_composition` (WU-06): all three targets closed in ONE review,
// which is what the record's own removal gate required — the control repositories arrive through
// the ControlDirectory contract the use case declares, the runtime configuration is resolved by the
// composition root and projected onto DevSessionPolicy, and the role vocabulary now belongs to
// app/lib/domain/auth/roles.ts. A partial closure would have been split, not absorbed.
// `application_session_d1_driver_type_contract` (WU-06): the use case names no database driver type
// at all; the D1 binding stops at the composition root.
// `security_application_session_resolution_cycle` (WU-06): the security boundary no longer resolves
// sessions. Routes call the composition root directly, and both directions of the cycle are gone —
// neither half was closed on paper while the other stayed live.
//
// Reintroduction is not absorbed for any of them: `violatesDomainTarget` still forbids
// /app/lib/tenant/, `violatesExternalClientTarget` and `violatesSecurityTarget` still forbid
// /app/lib/application/, the application allowlist still forbids runtime, security and
// infrastructure targets, and no resolved id may reappear.
const RESOLVED_DEBT_IDS = [
  "domain_tenant_hybrid_boundary", "infrastructure_application_signal_contract",
  "application_session_outward_value_composition", "application_session_d1_driver_type_contract",
  "security_application_session_resolution_cycle",
]
const SIGNAL_PORT = "app/lib/ports/toolSignal/types.ts"
const EVIDENCE_PORT = "app/lib/ports/acquisitionEvidence/types.ts"
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

// The port-layer edge set is pinned on the EXACT kind, not the type-only/value class: a
// `import-type-expression` is also type-only, and would otherwise slip into the approved slot.
function exactEdgeKey(edge: ModuleEdge): string {
  return `${edge.file} | ${edge.kind} | ${edge.resolvedTarget}`
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
    // Closed vocabularies, not free strings: an entry may only carry an origin and a baseline
    // this file already names, so recording a violation under an invented provenance fails.
    assert.ok(DEBT_ORIGINS.includes(debt.introduced_by), `${debt.id} introduced_by`)
    assert.ok(DEBT_BASELINE_SHAS.includes(debt.source_sha), `${debt.id} source_sha`)
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

test("port modules import only ports and domain, and the port layer has no outbound edge", async () => {
  // Non-vacuity: an empty scan proves nothing unless the scan root actually contains code — and
  // with the edge set expected to be empty, this census is the only control available.
  const portFiles = await collectCodeFiles(path.join(rootDir, "app/lib/ports"))
  assert.ok(portFiles.length > 0, "app/lib/ports must contain scanned code files")
  await assertNoForbiddenImports(["app/lib/ports"], "ports", violatesPortTarget)

  // The layer had zero outbound edges, then one reviewed port-to-port type edge while the
  // acquisition-evidence contract paired evidence with a NormalizedToolSignal, and now zero again:
  // that pairing was removed, because it left the integrity evidence with no subject other than the
  // Atra projection beside it. The scan stays whole-layer — narrowing it to the signal port alone
  // would stop observing every other port module, which is precisely the closed-world property that
  // makes an exact edge set meaningful.
  const portEdges = await scanModuleGraph(rootDir, ["app/lib/ports"])
  assert.deepEqual(portEdges.map(exactEdgeKey).sort(), [],
    "app/lib/ports must have no outbound edge: every port module is a graph leaf")
  assert.deepEqual(portEdges.filter((edge) => edgeKindClass(edge.kind) === "value"), [],
    "no port module may hold a value/runtime edge")

  // Independently preserved: NormalizedToolSignal remains the leaf declaration, asserted directly
  // so it survives any future re-cut of the layer-wide set above.
  assert.deepEqual(portEdges.filter((edge) => edge.file === SIGNAL_PORT), [],
    "the tool signal port must import nothing at all and stay a graph leaf")
  assert.deepEqual(portEdges.filter((edge) => edge.file === EVIDENCE_PORT), [],
    "the acquisition evidence port must import nothing at all and stay a graph leaf")
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

// T5 — closure, not intactness. An absent record is only evidence if the edges it recorded are
// gone AND the replacement direction is the intended one, so both halves are asserted together:
// the record is absent, and each of the three mappers resolves the contract type-only to the port.
//
// The absence assertion is scoped to THIS id rather than to an empty ledger. WU-A added unrelated
// records, and an emptiness check would have made this closure claim decay into a statement about
// the ledger's size — which was never the property it was proving.
test("the infrastructure signal contract debt is closed at the port, not merely unrecorded", async () => {
  const ledger = await readDebtLedger()
  assert.deepEqual(ledger.debts.filter((debt) => debt.id === "infrastructure_application_signal_contract"), [],
    "the closed entry must be absent from the ledger")
  assert.equal(DEBT_IDS.includes("infrastructure_application_signal_contract"), false,
    "the source-controlled declared set must not name the closed id either")
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

// `Candidate truth != attention state`. The record this constrains is not declared yet, so there
// are no fields to scan and a repository-wide search for `dismissed`/`seen` would prove nothing:
// those names are legitimate in a projection and are examples of the excluded class, not its
// definition. What is checkable now is where the boundary lives and what it did not add.
test("governance: canonical Candidate truth excludes attention state", async () => {
  const doc = await readProgramDoc()
  assertDocDeclares(doc, [
    "#### Candidate truth is not attention state",
    "`WorkUnitCandidateV1` contains work truth only.",
    "Attention, presentation, visibility, viewed/seen, snooze/defer and display-order state are not canonical Candidate truth.",
    "A UI, projection or future attention layer may read canonical Candidate truth. Presentation state must never mutate or redefine it.",
    "This is a semantic boundary, not a field-name rule.",
    "Any future attention or admission state lives outside the canonical Candidate record",
    "authorizes no admission, scheduling, queueing or attention-control implementation",
    "it does not authorize P1-3.",
  ], "candidate attention boundary")

  // Placement, not restatement: the exclusion sits inside the canonical-ownership row itself, so
  // the WorkUnitCandidateV1 required-properties list cannot be read without it. A boundary that
  // lives only in a section of its own is skippable by whoever declares the record at P1-3.
  const ownershipRow = doc.split("\n").find((line) => line.startsWith("| Candidate | `WorkUnitCandidateV1` |"))
  assert.ok(ownershipRow, "the canonical ownership table must keep its WorkUnitCandidateV1 row")
  assert.match(ownershipRow, /work truth only, never attention state/,
    "the Candidate ownership row must carry the attention-state exclusion in its required properties")

  // Structural: this boundary added no canonical concept. The ownership table is the doc-level
  // precursor to an allowlist expansion, so an `AttentionStateV1` or `AdmissionDecisionV1` row
  // would appear here first. The set is closed in both directions against the seven proposal
  // names, so neither a new record nor a quietly dropped one passes.
  const ownershipTable = doc.split("### Canonical ownership")[1]?.split("####")[0] ?? ""
  const named = [...new Set([...ownershipTable.matchAll(/`(\w+V\d+)`/g)].map((match) => match[1]))].sort()
  assert.deepEqual(named, [...PROPOSED_CANONICAL_TYPES].sort(),
    "the canonical ownership table names exactly the seven proposal records — this decision adds none")
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
    // The recorded decision itself, and the true current state. The reviewed head expanded the
    // ledger while this document still said the ledger was empty, and nothing failed — a green
    // suite proved reconciliation and said nothing at all about authority. Both are pinned now.
    "ATRA_PM_ARCHITECTURE_DEBT_REGISTRY_EXPANSION_WU_A_RATIFIED",
    "The declared debt is **not** empty.",
    "Recording an existing violation is not approving it as target architecture.",
  ], "debt registry classification")

  // And the document must not drift back to claiming an empty ledger while entries exist.
  assert.equal((await readProgramDoc()).includes("The current declared debt is empty"), false,
    "the authority must not claim an empty ledger while the registry holds entries")

  // Structural: the accepted debt ids are a source-controlled constant, not a fixture value, so a
  // fixture edit alone cannot expand the ledger — a reviewer must change this file too. That is
  // exactly the review gate; it is a human decision point, not a machine-closed guarantee.
  const ledger = await readDebtLedger()
  assert.deepEqual(ledger.debts.map((debt) => debt.id).sort(), [...DEBT_IDS].sort())
  // The declared set: what WU-A recorded under the PM decision that authorized the expansion, less
  // the three records WU-06 closed under their own removal gates. Pinning the literal set — rather
  // than a count, or a mere non-emptiness check — is what makes BOTH a new entry and a removal a
  // visible human edit here rather than a fixture-only change.
  assert.deepEqual([...DEBT_IDS].sort(), [
    "application_inbox_provider_implementation_selection",
  ], "expanding or contracting the declared set requires a PM/architecture decision recorded before the change")

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

// ─── WU-A: layer outbound policy coverage ───────────────────────────────────────
//
// Before WU-A the policed source layers were domain, ports, application, components, api,
// persistence/d1, infrastructure/external, integrations and workunitInbox/sources. Everything
// else under app/lib had no outbound policy at all, and the application policy rejected only
// React, Next, components and API routes. A new application module taking value edges to a D1
// repository, the Cloudflare runtime env, a security implementation and a provider client
// therefore passed the whole suite. These policies close that class.
//
// WU-A installs policy and records what the policy already catches. It removes no violation and
// approves none: every live violation below is a ledger entry, and the ledger is reconciled by
// exact set equality in both directions.

// Application VALUE edges get a CLOSED allowlist rather than a denylist, for the same reason the
// ports policy has one: a target nobody anticipated — an npm package, a Node builtin, a future
// layer, an unresolvable specifier — must fail by default instead of being silently permitted.
// This is affordable here and only here: at the WU-A baseline every application edge resolves
// inside app/, so the closed form costs exactly the violations already recorded and no more.
const PERMITTED_APPLICATION_VALUE_PREFIXES = ["app/lib/application/", "app/lib/domain/", "app/lib/ports/"]

function violatesApplicationValueTarget(edge: ModuleEdge): boolean {
  if (edgeKindClass(edge.kind) !== "value") return false
  const normalized = edge.resolvedTarget.replace(/^\/+/, "")
  return !PERMITTED_APPLICATION_VALUE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

// Application TYPE-ONLY edges are deliberately NOT held to that allowlist. `import type` is
// erased, and the repository contracts the layer consumes — TenantRepositoryBundle,
// WorkUnitReadRepository, TenantDbContext — are precisely what makes persistence injectable into
// refreshInbox and projectInbox today. Banning them before a repository port exists would push
// the next implementer toward a worse structure, not a better one, so the architectural meaning
// of the two edge classes is kept distinct instead of collapsed.
//
// What stays forbidden even when erased is a type dependency on an implementation-owning surface:
// a provider client's type, a D1 repository class, a route, a component. Inside app/lib/persistence
// no path rule can answer that — the directory is mixed and no prefix separates the D1DatabaseLike
// driver contract from the eight concrete repositories beside it — so the responsibility
// classification below answers it in CLOSED form: a persistence target is admissible only if its
// declared class says so, which rejects an unclassified module nobody ever wrote down.
function violatesApplicationTypeTarget(edge: ModuleEdge): boolean {
  if (edgeKindClass(edge.kind) !== "type-only") return false
  if (persistenceModuleOf(edge.resolvedTarget) !== undefined) {
    return persistenceResponsibilityOf(edge.resolvedTarget)?.applicationMayNameTypes !== true
  }
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, ["/app/api/", "/app/components/", "/app/lib/infrastructure/"])
}

// Security is an interface-adapter layer: consuming domain vocabulary, repository contracts and
// the phase-6 evidence kernel is its job. Three directions are architecturally wrong and are
// closed here — upward into the application layer, outward into provider clients, and downward
// into concrete D1 repositories — plus delivery outright. A denylist rather than an allowlist,
// because a closed form would demand a dozen records for dependencies the target architecture
// does not object to, which would launder the one that matters among them.
function violatesSecurityTarget(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, [
      "/app/api/", "/app/components/", "/app/lib/application/",
      "/app/lib/infrastructure/external/", "/app/lib/persistence/d1/",
    ])
}

// Runtime resolves one frozen, validated configuration snapshot per request. It may name the
// binding shapes it carries; it must never reach policy, security, adapters or delivery, or the
// configuration seam becomes a second composition point.
function violatesRuntimeTarget(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, [
      "/app/api/", "/app/components/", "/app/lib/application/",
      "/app/lib/security/", "/app/lib/infrastructure/", "/app/lib/domain/",
    ])
}

// Persistence may consume domain vocabulary and the runtime configuration projection it is
// selected by. It must never reach application use cases, provider clients or delivery.
function violatesPersistenceTarget(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, [
      "/app/api/", "/app/components/", "/app/lib/application/", "/app/lib/infrastructure/external/",
    ])
}

// app/lib/persistence is one directory holding several different things, and this policy does not
// pretend otherwise. What it no longer does is enumerate them by hand: the table below is
// reconciled against a recursive filesystem CENSUS by exact set equality, so a module nobody
// classified — a new root file, a new nested subtree, an `.mts` sibling — is UNCLASSIFIED, and both
// policies that read the table reject an unclassified target by construction. A new concrete
// repository fails because nobody said what it is, not because somebody listed its filename.
const PERSISTENCE_ROOT = "app/lib/persistence"

// ONE classification, five responsibilities, two consumers. `applicationMayNameTypes` is read by
// the application type-only policy and `contractMayDepend` by persistence contract purity; both
// read THIS table and nothing else, so the two can never drift into disagreeing about what a
// module is. Paths are relative to PERSISTENCE_ROOT, in the same shape the census produces.
type PersistenceResponsibility = {
  modules: string[]
  applicationMayNameTypes: boolean
  contractMayDepend: boolean
}
const PERSISTENCE_RESPONSIBILITIES: Record<string, PersistenceResponsibility> = {
  // CONTRACT: the repository interfaces and the storage-neutral row vocabulary. Inward-facing by
  // intent — this is what makes persistence injectable into refreshInbox and projectInbox today.
  contract: {
    modules: ["repositories.ts", "types.ts"],
    applicationMayNameTypes: true, contractMayDepend: true,
  },
  // IMPLEMENTATION: a repository body, a store adapter, or the driver/row plumbing they are written
  // against. Naming one of these types is naming a storage decision — the ownership the composition
  // root must be able to move. d1/ is listed file by file, so a tenth D1 module is unclassified.
  implementation: {
    modules: [
      "approvalStoreAdapter.ts", "inMemoryRepositories.ts", "relationshipEnforcedRepositories.ts",
      "sharedInMemoryStores.ts", "d1/actionPreviewRepository.ts", "d1/approvalRecordRepository.ts",
      "d1/auditLogRepository.ts", "d1/integrationConnectionRepository.ts", "d1/rowHelpers.ts",
      "d1/types.ts", "d1/usageRepository.ts", "d1/workUnitFeedbackRepository.ts",
      "d1/workUnitRepository.ts", "d1/writeGuards.ts",
    ],
    applicationMayNameTypes: false, contractMayDepend: false,
  },
  // COMPOSITION: selection, binding and configuration — which implementation runs for this request.
  composition: {
    modules: [
      "cloudflareBindings.ts", "persistenceConfig.ts", "routeRepositories.ts", "tenantDbResolver.ts",
    ],
    applicationMayNameTypes: false, contractMayDepend: false,
  },
  // MIXED, recorded as mixed rather than flattened into either half: repositoryResolver.ts composes
  // the concrete bundle AND declares the contracts the application legitimately consumes
  // (TenantRepositoryBundle and the read-repository family are its own exports). The application may
  // name those erased types; a contract still may not depend on an interface that knows its selector.
  compositionDeclaringContract: {
    modules: ["repositoryResolver.ts"],
    applicationMayNameTypes: true, contractMayDepend: false,
  },
  // NEUTRAL: pure row/domain translation and a committed constant. Neither declares a contract nor
  // decides a store, so a contract may use one — repositories.ts calls getCanonicalTenantSchemaVersion().
  // The application may not name them: what it is entitled to name is a contract, not a helper.
  neutral: {
    modules: ["mappers.ts", "tenantSchemaVersion.ts"],
    applicationMayNameTypes: false, contractMayDepend: true,
  },
}
const PERSISTENCE_CONTRACT_MODULES = PERSISTENCE_RESPONSIBILITIES.contract.modules
  .map((relative) => `${PERSISTENCE_ROOT}/${relative}`)

// Membership is a PATH-PREFIX question, not a substring one: app/lib/infrastructure/persistence is
// a different layer with its own policy, and app/lib/persistenceX would be a different directory.
function persistenceModuleOf(file: string): string | undefined {
  const normalized = file.replace(/^\/+/, "")
  return normalized.startsWith(`${PERSISTENCE_ROOT}/`) ? normalized.slice(PERSISTENCE_ROOT.length + 1) : undefined
}

// Undefined for an unclassified module, and every caller treats undefined as forbidden.
function persistenceResponsibilityOf(target: string): PersistenceResponsibility | undefined {
  const relative = persistenceModuleOf(target)
  if (relative === undefined) return undefined
  return Object.values(PERSISTENCE_RESPONSIBILITIES).find((entry) => entry.modules.includes(relative))
}

// A repository contract may depend on another contract and on a neutral helper. Everything else
// inside the directory is closed to it — implementation, composition, the mixed resolver, and any
// module that is merely unclassified — as is the runtime configuration layer outside it.
//
// The rule binds every module a contract is ALLOWED to reach, not only the contracts themselves,
// because otherwise NEUTRAL is a laundering route: a helper that value-imports a D1 repository
// hands every contract that uses it a transitive path to an implementation, and each hop looks
// legal on its own. `contractMayDepend` names exactly that transitively-trusted closure, so the
// neutral label is load-bearing rather than a description.
function violatesPersistenceContractTarget(edge: ModuleEdge): boolean {
  if (persistenceResponsibilityOf(edge.file)?.contractMayDepend !== true) return false
  if (persistenceModuleOf(edge.resolvedTarget) !== undefined) {
    return persistenceResponsibilityOf(edge.resolvedTarget)?.contractMayDepend !== true
  }
  return hasForbiddenResolvedPath(edge.resolvedTarget, ["/app/lib/runtime/"])
}

// The control-DB repositories are infrastructure. They may name the persistence row and driver
// contracts they implement against; they must not reach application, security or delivery, and
// must not couple the control side to provider clients.
function violatesControlPersistenceTarget(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, [
      "/app/api/", "/app/components/", "/app/lib/application/",
      "/app/lib/security/", "/app/lib/infrastructure/external/",
    ])
}

// Infrastructure is an outer adapter layer, and this policy covers the LAYER, not two of its
// subtrees. Before it, app/lib/infrastructure/external and .../persistence each had a policy and
// every sibling subtree had none, so app/lib/infrastructure/<anything-else>/ was unobserved while
// the layer registry called the layer POLICED. The scan root is now the layer itself, so a new
// subtree is covered the moment it exists and no registry edit is involved.
//
// The rule is the direction an adapter may never take: upward into delivery or into the
// application layer, and never React or Next. Deliberately no stricter than that. The stricter
// subtree policies survive unchanged on top of it — external/** additionally may not reach the
// application layer through the UI rule, and persistence/** additionally may not reach security or
// provider clients — while infrastructure -> ports, domain and the neutral persistence contracts
// stay legitimate, because that is what an adapter implementing a contract must do.
function violatesInfrastructureTarget(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, [
      "/app/api/", "/app/components/", "/app/lib/application/",
    ])
}

// The request composition root (WU-06). Assembly IS its purpose, so this is the one layer allowed
// to name the runtime configuration, an auth adapter implementation, a repository selector and an
// application use case in the same module — that concentration is the point, not a leak. Two
// directions stay wrong and are closed here: it may never reach delivery, because a composed
// dependency that imports a route is a cycle through the framework, and it may never carry React
// or Next, because nothing it assembles is a view.
//
// A denylist would be an escape hatch on its own, so it is not what makes this safe. What makes it
// safe is DIRECTION, asserted separately below: no inward layer may import app/lib/composition, so
// a forbidden edge cannot be laundered by routing it through here. The application, domain and
// ports policies are closed allowlists that already exclude this layer; the direction test covers
// the denylisted layers, which would otherwise not name it.
function violatesCompositionTarget(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, ["/app/api/", "/app/components/"])
}

// The escape hatch. Without this, any module policed above could be moved to app/lib/<name>.ts
// and keep every forbidden edge, because the loose root modules were scanned by nothing. Matching
// is on the ROOT files only; nested directories are covered by the layer registry below.
function isLibRootModule(file: string): boolean {
  return /^app\/lib\/[^/]+\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)
}

function violatesLibRootTarget(edge: ModuleEdge): boolean {
  return isBareModule(edge.specifier, "react")
    || isBareModule(edge.specifier, "next")
    || hasForbiddenResolvedPath(edge.resolvedTarget, [
      "/app/api/", "/app/components/", "/app/lib/application/",
      "/app/lib/infrastructure/", "/app/lib/persistence/",
    ])
}

// Every direct child of app/lib, with its disposition. POLICED means an outbound policy scans it;
// DEFERRED names the WorkUnit that owns deciding its boundary, from the program's own table. The
// set is asserted for equality against the live directory, so a NEW app/lib layer cannot appear
// without a human classifying it here — which is the general form of the escape hatch above.
// Deferral is a recorded decision, not an omission: none of these layers is silently unscanned.
// POLICED is a DERIVED claim, not a label. A layer may only be marked POLICED if it appears here,
// and every entry here is scanned at its layer ROOT below. That is what makes the word true for
// subtrees that do not exist yet: nothing under a policed layer can be added outside the scan.
const POLICED_LAYER_POLICIES: Record<string, (edge: ModuleEdge) => boolean> = {
  application: (edge) => violatesApplicationValueTarget(edge) || violatesApplicationTypeTarget(edge),
  composition: violatesCompositionTarget,
  domain: violatesDomainTarget,
  ports: violatesPortTarget,
  security: violatesSecurityTarget,
  runtime: violatesRuntimeTarget,
  persistence: (edge) => violatesPersistenceTarget(edge) || violatesPersistenceContractTarget(edge),
  infrastructure: violatesInfrastructureTarget,
  integrations: violatesExternalClientTarget,
}

// A layer policed only in part names the exact subtrees that are scanned, so the registry never
// reads as whole-layer coverage it does not have. Each named subtree must exist and be scanned.
const PARTIALLY_POLICED_SUBTREES: Record<string, string[]> = {
  workunitInbox: ["app/lib/workunitInbox/sources"],
}

// Closed disposition vocabulary:
//   POLICED                    — the whole layer root is scanned by POLICED_LAYER_POLICIES
//   PARTIALLY_POLICED:<owner>  — the subtrees named above are scanned; the rest is the owner's call
//   DEFERRED:<WU-nn>           — unscanned, and the program document names that WorkUnit as owner
//   DEFERRED:UNOWNED           — unscanned, and no WorkUnit the authority names owns it yet
//   NO-CODE                    — holds no module at all, asserted by census
//
// DEFERRED:UNOWNED exists because the previous vocabulary had no way to say "nobody owns this
// yet", so an unowned layer had to borrow the closest-sounding WorkUnit. A borrowed owner is a
// false statement about authority, and this registry is read as a map of who decides what.
const APP_LIB_LAYER_DISPOSITION: Record<string, string> = {
  application: "POLICED",
  // WU-06. Introduced as POLICED at its own root on the day it was created, so nothing can be
  // added under it outside the scan — the registry never records it as an unowned new layer.
  composition: "POLICED",
  domain: "POLICED",
  ports: "POLICED",
  security: "POLICED",
  runtime: "POLICED",
  persistence: "POLICED",
  infrastructure: "POLICED",
  integrations: "POLICED",
  // Compatibility surface whose removal is gated by the WU-10 cleanup exit gate, and one of the
  // four legacy roots that gate names. Policing its outbound edges now would ratchet a surface
  // whose target state is deletion.
  actionField: "DEFERRED:WU-10",
  // Same gate, but its sources/ subtree already carries the external-client policy, so the layer
  // is partly scanned and the disposition says so instead of implying the whole layer is open.
  workunitInbox: "PARTIALLY_POLICED:WU-10",
  // The tenant hybrid. The program states that relocating its six remaining symbols "remains open,
  // unowned and deferred", so naming a WorkUnit here would contradict the authority outright.
  tenant: "DEFERRED:UNOWNED",
  // LLM result adapters. The WU-04 row names "adapters for current Inbox/Launcher/LLM results",
  // which is this layer; the owner is read from the table rather than inferred from the name.
  llm: "DEFERRED:WU-04",
  // Evidence/artifact kernel consumed by the runtime-authorization gate. WU-09 is a plausible
  // owner and nothing in the program says so, so it is recorded as unowned rather than inferred.
  phase6: "DEFERRED:UNOWNED",
  // Dormant formation research with no live route consumer. WU-03 owns the formation core, but
  // the program never assigns this layer to it, and an inference is not an owner.
  subagents: "DEFERRED:UNOWNED",
  // Documentation only. The census below proves it holds no module, so it cannot hide an edge.
  config: "NO-CODE",
}

async function censusOf(dir: string): Promise<number> {
  return (await collectCodeFiles(path.join(rootDir, dir))).length
}

function edgeLines(edges: ModuleEdge[]): string[] {
  return edges.map((edge) => `${edge.file} -> ${edge.kind} ${edge.specifier}`).sort()
}

// Live scan + census in one helper: a green policy over an empty directory proves nothing, so no
// WU-A layer test is allowed to pass without first showing its scan root actually holds modules.
async function scanPolicedLayer(
  root: string,
  policy: (edge: ModuleEdge) => boolean,
  minimumFiles: number,
): Promise<ModuleEdge[]> {
  assert.ok(await censusOf(root) >= minimumFiles,
    `${root} must contain at least ${minimumFiles} scanned code files, or its policy is vacuous`)
  return (await scanModuleGraph(rootDir, [root])).filter(policy)
}

test("WU-A: application value edges reach only application, domain and ports", async () => {
  const observed = await scanPolicedLayer("app/lib/application", violatesApplicationValueTarget, 80)
  const ledger = await readDebtLedger()
  const declared = declaredDebtKeys(debtById(ledger, "application_inbox_provider_implementation_selection"))
  const { undeclared, stale } = reconcile(observed, declared)
  assert.deepEqual(undeclared, [], `undeclared application value violation:\n${undeclared.join("\n")}`)
  assert.deepEqual(stale, [], `stale declared application value debt:\n${stale.join("\n")}`)
  // Was nine edges in two modules; WU-06 closed the session module's three, so the recorded set is
  // exactly six edges in ONE module. Pinning the count as well as the set means a record that grows
  // a target without a matching live edge cannot pass by symmetry.
  assert.equal(observed.length, 6, `application value violations drifted:\n${edgeLines(observed).join("\n")}`)
  assert.deepEqual([...new Set(observed.map((edge) => edge.file))],
    ["app/lib/application/workunitInbox/inboxService.ts"],
    "the only application module still selecting an implementation is the WU-02 inbox use case")
})

test("WU-A: application type-only edges never name an implementation-owning surface", async () => {
  // WU-06 closed the single record here: the session use case named the D1 driver shape in its own
  // public options type, and now names a ControlDirectory contract it declares itself. The scan is
  // reconciled against an EMPTY declared set, so this is the strongest form the assertion has —
  // any type-only reach into an implementation-owning surface is undeclared and fails.
  const observed = await scanPolicedLayer("app/lib/application", violatesApplicationTypeTarget, 80)
  const { undeclared, stale } = reconcile(observed, [])
  assert.deepEqual(undeclared, [], `undeclared application type-only violation:\n${undeclared.join("\n")}`)
  assert.deepEqual(stale, [], `stale declared application type-only debt:\n${stale.join("\n")}`)
  assert.equal(observed.length, 0, `application type-only violations drifted:\n${edgeLines(observed).join("\n")}`)
})

test("WU-A: security does not reach application, provider clients, D1 repositories or delivery", async () => {
  // The repository's only layer cycle is gone. It was security/session.ts -> the session use case
  // -> security/policy.ts, and WU-06 cut BOTH directions in one review: routes call the composition
  // root for session assembly, and the role vocabulary the use case consumes moved to the domain.
  // Reconciled against an EMPTY declared set, so a new reach upward is undeclared and fails.
  const observed = await scanPolicedLayer("app/lib/security", violatesSecurityTarget, 20)
  const { undeclared, stale } = reconcile(observed, [])
  assert.deepEqual(undeclared, [], `undeclared security violation:\n${undeclared.join("\n")}`)
  assert.deepEqual(stale, [], `stale declared security debt:\n${stale.join("\n")}`)
  assert.deepEqual(edgeLines(observed), [])
})

test("WU-A: runtime configuration reaches no policy, security, adapter or delivery module", async () => {
  const observed = await scanPolicedLayer("app/lib/runtime", violatesRuntimeTarget, 5)
  assert.deepEqual(edgeLines(observed), [], "app/lib/runtime must have no target-policy violation")
})

test("WU-A: persistence reaches no application, provider client or delivery module", async () => {
  const observed = await scanPolicedLayer("app/lib/persistence", violatesPersistenceTarget, 20)
  assert.deepEqual(edgeLines(observed), [], "app/lib/persistence must have no target-policy violation")
})

test("WU-A: persistence contracts do not depend on implementations or on the selector", async () => {
  // Non-vacuity is per-module here, not per-directory: the policy is keyed on the exact modules a
  // contract may reach, so their existence is the only thing that makes the scan meaningful.
  for (const contract of PERSISTENCE_CONTRACT_MODULES) {
    const stats = await stat(path.join(rootDir, contract)).catch(() => null)
    assert.ok(stats?.isFile(), `${contract} must exist, or the contract policy scans nothing`)
  }
  const observed = (await scanModuleGraph(rootDir, ["app/lib/persistence"])).filter(violatesPersistenceContractTarget)
  assert.deepEqual(edgeLines(observed), [],
    "a repository contract must not know its implementations or the resolver that selects one")
})

test("WU-A: every persistence module declares exactly one responsibility", async () => {
  // The census. Membership is taken from DISK, recursively, through the same code-file predicate
  // the module scanner uses — so a new root module, a new nested subtree and an .mts/.cts/.mjs/.cjs
  // sibling all appear here with no registry edit; what an edit is required for is saying what the
  // module IS. Without it the classification was enumerative and unbacked, and
  // app/lib/persistence/postgresRepositories.ts could exist in no category with the suite green.
  const censusRoot = path.join(rootDir, PERSISTENCE_ROOT)
  const discovered = (await collectCodeFiles(censusRoot))
    .map((file) => path.relative(censusRoot, file).split(path.sep).join("/")).sort()
  assert.ok(discovered.length >= 20,
    `the persistence census found ${discovered.length} modules; the classification would be vacuous`)

  // Exactly one class each: a module claimed twice is caught by name, not merely by a length
  // mismatch, so the failure says which module and not just that the totals disagree.
  const classified = Object.values(PERSISTENCE_RESPONSIBILITIES).flatMap((entry) => entry.modules)
  const duplicates = [...new Set(classified.filter((item, index) => classified.indexOf(item) !== index))]
  assert.deepEqual(duplicates.sort(), [],
    `a persistence module claims more than one responsibility:\n${duplicates.join("\n")}`)

  // Exact set equality, both directions at once: an unclassified file on disk and a classified path
  // that no longer exists are each a failure, and neither can be absorbed by the other.
  assert.deepEqual([...classified].sort(), discovered,
    "every persistence module on disk must be classified, and every classified path must exist")
})

test("WU-A: control-DB repositories do not reach application, security or delivery", async () => {
  const observed = await scanPolicedLayer("app/lib/infrastructure/persistence", violatesControlPersistenceTarget, 5)
  assert.deepEqual(edgeLines(observed), [],
    "app/lib/infrastructure/persistence must have no target-policy violation")
})

test("WU-A: app/lib root modules are not an unscanned escape hatch", async () => {
  const rootModules = (await readdir(path.join(rootDir, "app/lib"), { withFileTypes: true }))
    .filter((entry) => !entry.isDirectory() && isCodeFilePath(entry.name))
  assert.ok(rootModules.length > 0, "app/lib must contain scanned root modules, or this policy is vacuous")

  const observed = (await scanModuleGraph(rootDir, ["app/lib"]))
    .filter((edge) => isLibRootModule(edge.file))
    .filter(violatesLibRootTarget)
  assert.deepEqual(edgeLines(observed), [],
    "a loose app/lib root module must not hold an edge the layer policies forbid")
})

test("WU-A: the infrastructure layer is policed at its root, so a new subtree cannot be unobserved", async () => {
  // The reviewed head scanned app/lib/infrastructure/external and .../persistence and nothing
  // else, while the registry called the layer POLICED. app/lib/infrastructure/messaging/client.ts
  // could import React, an application use case and a component with the whole suite green.
  const observed = await scanPolicedLayer("app/lib/infrastructure", violatesInfrastructureTarget, 10)
  assert.deepEqual(edgeLines(observed), [],
    "app/lib/infrastructure must have no target-policy violation at any depth")

  // Coverage is proven by construction rather than by naming today's subtrees: every scanned file
  // under the layer belongs to this one scan, whichever subtree it happens to sit in.
  const scanned = await collectCodeFiles(path.join(rootDir, "app/lib/infrastructure"))
  const subtrees = new Set(scanned.map((file) =>
    path.relative(path.join(rootDir, "app/lib/infrastructure"), file).split(path.sep)[0]))
  assert.ok(subtrees.size >= 2, "the infrastructure census must span more than one subtree")
})

test("WU-A: POLICED is a derived claim — every policed layer is scanned at its own root", async () => {
  // The defect this closes is a label that outran its scan. POLICED may only be written for a
  // layer present in POLICED_LAYER_POLICIES, and every entry there is scanned here at the LAYER
  // ROOT, so a future subtree is covered without any registry edit.
  const labelled = Object.entries(APP_LIB_LAYER_DISPOSITION)
    .filter(([, disposition]) => disposition === "POLICED").map(([layer]) => layer).sort()
  assert.deepEqual(labelled, Object.keys(POLICED_LAYER_POLICIES).sort(),
    "a layer may be labelled POLICED only if a whole-root policy exists for it, and vice versa")

  const declared = (await readDebtLedger()).debts.flatMap(declaredDebtKeys)
  for (const [layer, policy] of Object.entries(POLICED_LAYER_POLICIES)) {
    const root = `app/lib/${layer}`
    assert.ok(await censusOf(root) > 0, `${root} is policed but holds no scanned module`)
    const { undeclared } = reconcile((await scanModuleGraph(rootDir, [root])).filter(policy), declared)
    assert.deepEqual(undeclared, [], `undeclared violation in policed layer ${layer}:\n${undeclared.join("\n")}`)
  }
})

test("WU-A: every app/lib layer carries an accurate, closed-vocabulary disposition", async () => {
  const entries = await readdir(path.join(rootDir, "app/lib"), { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()

  // Set equality in both directions. A new app/lib/<layer>/ fails as unclassified; a removed one
  // fails as a stale disposition. Either way a human decides, and neither is silently absorbed.
  assert.deepEqual(directories, Object.keys(APP_LIB_LAYER_DISPOSITION).sort(),
    "every app/lib layer must carry a disposition, and every disposition must name a live layer")

  for (const [layer, disposition] of Object.entries(APP_LIB_LAYER_DISPOSITION)) {
    if (disposition === "POLICED") continue // proven by the derived-claim test above
    const census = await censusOf(`app/lib/${layer}`)

    if (disposition === "NO-CODE") {
      assert.equal(census, 0,
        `${layer} is recorded as holding no code, but it now contains modules and needs a real disposition`)
      continue
    }

    const [form, owner] = disposition.split(":")
    assert.ok(["PARTIALLY_POLICED", "DEFERRED"].includes(form),
      `${layer}: disposition must be POLICED, PARTIALLY_POLICED:<owner>, DEFERRED:<owner>, DEFERRED:UNOWNED or NO-CODE`)
    // An owner is either a WorkUnit the program's table names, or the explicit admission that no
    // WorkUnit owns this yet. UNOWNED is a real classification, not a missing value: it is what
    // stops the registry borrowing the closest-sounding WorkUnit and stating it as authority.
    assert.ok(OWNER_WORKUNITS.includes(owner) || owner === "UNOWNED",
      `${layer}: unknown owner ${owner}; use a WorkUnit from the program table or UNOWNED`)
    assert.ok(census > 0, `${layer} is ${disposition} but holds no code; the disposition is stale`)

    if (form === "PARTIALLY_POLICED") {
      // "Part of this layer is scanned" has to name the part, and the part has to exist and
      // actually be scanned — otherwise it is a softer way of saying nothing at all.
      const subtrees = PARTIALLY_POLICED_SUBTREES[layer]
      assert.ok(subtrees?.length, `${layer} is PARTIALLY_POLICED but names no policed subtree`)
      for (const subtree of subtrees) {
        assert.ok(await censusOf(subtree) > 0, `${layer}: policed subtree ${subtree} holds no code`)
        const live = (await scanModuleGraph(rootDir, [subtree])).filter(violatesExternalClientTarget)
        assert.deepEqual(edgeLines(live), [], `${layer}: policed subtree ${subtree} has a live violation`)
      }
    } else {
      assert.equal(PARTIALLY_POLICED_SUBTREES[layer], undefined,
        `${layer} is ${disposition} but names policed subtrees; use PARTIALLY_POLICED`)
    }
  }

  // The one owner claim the program contradicts if it is inferred: the authority states the tenant
  // relocation is unowned, so this layer may never carry a WorkUnit owner while that stands.
  assert.equal(APP_LIB_LAYER_DISPOSITION.tenant, "DEFERRED:UNOWNED",
    "the program records the tenant relocation as open, unowned and deferred")
  assertDocDeclares(await readProgramDoc(), ["remains open, unowned and deferred"], "tenant ownership")
})

test("WU-A: every new layer policy rejects a positive control and accepts its intended dependency", () => {
  const value = (file: string, target: string): ModuleEdge =>
    ({ file, kind: "import", specifier: `./${path.basename(target)}`, resolvedTarget: target })

  const controls: Array<[string, (edge: ModuleEdge) => boolean, ModuleEdge, ModuleEdge]> = [
    ["application-value", violatesApplicationValueTarget,
      value("app/lib/application/x.ts", "app/lib/persistence/d1/workUnitRepository.ts"),
      value("app/lib/application/x.ts", "app/lib/ports/toolSignal/types.ts")],
    ["application-type", violatesApplicationTypeTarget,
      syntheticEdge("app/lib/application/x.ts", "app/lib/infrastructure/external/github/client.ts"),
      syntheticEdge("app/lib/application/x.ts", "app/lib/persistence/types.ts")],
    ["security", violatesSecurityTarget,
      value("app/lib/security/x.ts", "app/lib/application/auth/authAdapter.ts"),
      value("app/lib/security/x.ts", "app/lib/domain/auth/types.ts")],
    ["runtime", violatesRuntimeTarget,
      value("app/lib/runtime/x.ts", "app/lib/security/session.ts"),
      value("app/lib/runtime/x.ts", "app/lib/persistence/d1/types.ts")],
    ["persistence", violatesPersistenceTarget,
      value("app/lib/persistence/x.ts", "app/lib/application/workunitInbox/inboxService.ts"),
      value("app/lib/persistence/x.ts", "app/lib/domain/types.ts")],
    ["persistence-contract", violatesPersistenceContractTarget,
      value("app/lib/persistence/repositories.ts", "app/lib/persistence/repositoryResolver.ts"),
      value("app/lib/persistence/repositories.ts", "app/lib/persistence/tenantSchemaVersion.ts")],
    ["control-persistence", violatesControlPersistenceTarget,
      value("app/lib/infrastructure/persistence/control/x.ts", "app/lib/security/session.ts"),
      value("app/lib/infrastructure/persistence/control/x.ts", "app/lib/persistence/types.ts")],
    ["infrastructure", violatesInfrastructureTarget,
      value("app/lib/infrastructure/messaging/client.ts", "app/lib/application/auth/sessionResolver.ts"),
      value("app/lib/infrastructure/messaging/client.ts", "app/lib/ports/toolSignal/types.ts")],
    ["lib-root", violatesLibRootTarget,
      value("app/lib/x.ts", "app/lib/infrastructure/external/github/fakeGitHubClient.ts"),
      value("app/lib/x.ts", "app/lib/domain/types.ts")],
    // The composition root may hold the very edge every other layer is forbidden — that is what it
    // is for — but not a reach back into delivery.
    ["composition", violatesCompositionTarget,
      value("app/lib/composition/x.ts", "app/api/workunit/inbox/route.ts"),
      value("app/lib/composition/x.ts", "app/lib/application/auth/sessionResolver.ts")],
  ]
  for (const [name, policy, forbidden, permitted] of controls) {
    assert.equal(policy(forbidden), true, `${name}: must reject ${forbidden.resolvedTarget}`)
    assert.equal(policy(permitted), false, `${name}: must accept ${permitted.resolvedTarget}`)
  }

  // Classification is by resolved target, never by name similarity — the same trap T8 pins for
  // the domain policy. A sibling that merely starts with a permitted layer's name is not it.
  assert.equal(violatesApplicationValueTarget(
    value("app/lib/application/x.ts", "app/lib/applicationLegacy/y.ts")), true)
  assert.equal(violatesLibRootTarget(
    value("app/lib/x.ts", "app/lib/persistenceHelpers.ts")), false)
  // Root-module matching is anchored: a nested module is not a root module.
  assert.equal(isLibRootModule("app/lib/toolBackend.ts"), true)
  assert.equal(isLibRootModule("app/lib/application/auth/sessionResolver.ts"), false)
})

test("WU-A: the application value allowlist is closed, not a denylist", () => {
  const value = (target: string): ModuleEdge =>
    ({ file: "app/lib/application/x.ts", kind: "import", specifier: "./x", resolvedTarget: target })

  // The whole point of the closed form: none of these targets is named by any denylist, and every
  // one of them must still fail. An unresolvable specifier included — failing to resolve must not
  // become a way to pass.
  for (const target of [
    "node_modules/next/server.d.ts", "node_modules/@types/react/index.d.ts",
    "node:crypto", "crypto", "app/lib/llm/processWorkSignal.ts", "app/lib/tenant/types.ts",
    "app/lib/phase6/runtimeAuthorization/index.ts", "app/lib/subagents/contextMergeAgent.ts",
    "scripts/lib/typescriptModuleGraph.mjs", "some-unresolved-specifier",
  ]) {
    assert.equal(violatesApplicationValueTarget(value(target)), true, `${target} must be forbidden`)
  }
  for (const target of [
    "app/lib/application/auth/authAdapter.ts", "app/lib/domain/source/index.ts",
    "app/lib/ports/acquisitionEvidence/types.ts",
  ]) {
    assert.equal(violatesApplicationValueTarget(value(target)), false, `${target} must be permitted`)
  }

  // Edge class is part of the rule, not a detail: the SAME target is a violation as a value edge
  // and not one as a type-only edge, so an `import type` upgraded to a value import is caught by
  // the value policy even though the resolved path never changed.
  const target = "app/lib/persistence/repositoryResolver.ts"
  assert.equal(violatesApplicationValueTarget(value(target)), true)
  assert.equal(violatesApplicationValueTarget(syntheticEdge("app/lib/application/x.ts", target)), false)
  assert.equal(violatesApplicationTypeTarget(syntheticEdge("app/lib/application/x.ts", target)), false)
})

test("WU-A: an erased application type edge may name a persistence contract, never an implementation", () => {
  // The reviewed head forbade only persistence/d1/, so `import type` from a concrete repository
  // body — inMemoryRepositories and its three siblings — entered the application layer with the
  // whole suite green. Erasure is not the question: naming one of those types is naming a storage
  // decision, which is exactly the ownership the composition root has to be able to move.
  const typeEdge = (target: string): ModuleEdge => syntheticEdge("app/lib/application/x.ts", target)

  for (const implementation of [
    "app/lib/persistence/inMemoryRepositories.ts",
    "app/lib/persistence/relationshipEnforcedRepositories.ts",
    "app/lib/persistence/approvalStoreAdapter.ts",
    "app/lib/persistence/sharedInMemoryStores.ts",
    "app/lib/persistence/d1/workUnitRepository.ts",
    "app/lib/persistence/d1/types.ts",
  ]) {
    assert.equal(violatesApplicationTypeTarget(typeEdge(implementation)), true,
      `${implementation} is an implementation and must not be named type-only by the application layer`)
  }

  // The neutral contracts stay reachable, and so does the module that DECLARES the repository
  // contracts the layer consumes. Forbidding those would push the next implementer away from
  // injection rather than toward it: the distinction is responsibility, not directory or filename.
  for (const contract of [
    "app/lib/persistence/repositories.ts",
    "app/lib/persistence/types.ts",
    "app/lib/persistence/repositoryResolver.ts",
  ]) {
    assert.equal(violatesApplicationTypeTarget(typeEdge(contract)), false,
      `${contract} is a contract surface and must stay consumable type-only`)
  }

  // ONE classification, two consumers. Both verdicts are read off the same table for EVERY
  // classified module, so the application policy and contract purity cannot drift into disagreeing
  // about what a module is — the drift a second hand-maintained list would have allowed.
  for (const [name, responsibility] of Object.entries(PERSISTENCE_RESPONSIBILITIES)) {
    for (const relative of responsibility.modules) {
      const target = `${PERSISTENCE_ROOT}/${relative}`
      assert.equal(violatesApplicationTypeTarget(typeEdge(target)), !responsibility.applicationMayNameTypes,
        `${target}: the application type verdict must follow its declared responsibility (${name})`)
      assert.equal(
        violatesPersistenceContractTarget(syntheticEdge("app/lib/persistence/repositories.ts", target)),
        !responsibility.contractMayDepend,
        `${target}: the contract-purity verdict must follow its declared responsibility (${name})`)
    }
  }

  // The defect this closes. A persistence module nobody classified — at the root, in a new nested
  // subtree, or under any code extension — is rejected by BOTH policies with no denylist edit and
  // no registry edit of any kind. Previously each of these was invisible to both until someone
  // remembered the filename, so a new concrete repository entered the application layer green.
  for (const unclassified of [
    "app/lib/persistence/postgresRepositories.ts", "app/lib/persistence/postgres/repository.ts",
    "app/lib/persistence/postgres/index.ts", "app/lib/persistence/helper.mts",
  ]) {
    assert.equal(violatesApplicationTypeTarget(typeEdge(unclassified)), true,
      `${unclassified} is unclassified and must not be nameable type-only by the application layer`)
    assert.equal(
      violatesPersistenceContractTarget(syntheticEdge("app/lib/persistence/repositories.ts", unclassified)),
      true, `${unclassified} is unclassified and must stay forbidden to a repository contract`)
  }

  // Legitimate downward type dependencies are untouched by the tightening.
  assert.equal(violatesApplicationTypeTarget(typeEdge("app/lib/domain/types.ts")), false)
  assert.equal(violatesApplicationTypeTarget(typeEdge("app/lib/ports/toolSignal/types.ts")), false)
})

// ─── WU-06: one request composition root ────────────────────────────────────────
//
// The layer policies above say where an edge may point. These say who is allowed to CHOOSE an
// implementation, which is the question WU-06 exists to answer. A composition root that merely
// exists proves nothing: what proves it is that the old selectors are gone from every other layer
// and that nothing inward can reach the new one.

const COMPOSITION_ROOT = "app/lib/composition/"
const AUTH_ADAPTER_IMPLEMENTATIONS = [
  "app/lib/application/auth/devAuthAdapter.ts",
  "app/lib/application/auth/jwtAuthAdapter.ts",
  "app/lib/application/auth/noopProductionAuthAdapter.ts",
]

function importersOf(edges: ModuleEdge[], predicate: (target: string) => boolean): string[] {
  return [...new Set(edges
    .filter((edge) => predicate(edge.resolvedTarget.replace(/^\/+/, "")))
    .map((edge) => edge.file))].sort()
}

test("WU-06: the composition root is reachable only from delivery, never from an inward layer", async () => {
  // This is what stops the new layer from being an escape hatch. Its own outbound policy is a
  // denylist, which on its own would let any module launder a forbidden edge by importing it from
  // here. Direction closes that: if no inward layer may import app/lib/composition, there is
  // nothing to launder THROUGH. Scanned over the whole of app/, so a future module anywhere under
  // it is covered without a registry edit.
  const edges = await scanModuleGraph(rootDir, ["app"])
  const importers = importersOf(edges, (target) => target.startsWith(COMPOSITION_ROOT))
  assert.ok(importers.length > 0, "the composition root must have live importers, or this scan is vacuous")

  const inward = importers.filter((file) => !file.startsWith("app/api/") && !file.startsWith(COMPOSITION_ROOT))
  assert.deepEqual(inward, [],
    `only API routes may import the composition root; found:\n${inward.join("\n")}`)
  // And the delivery side is real: every authenticated route reaches it.
  assert.equal(importers.filter((file) => file.startsWith("app/api/")).length, 10,
    "all ten API routes must consume the composition root")
})

test("WU-06: an auth adapter implementation is selected only by the composition root", async () => {
  // Before WU-06 the application layer picked its own adapter through a selector that lived beside
  // the use case. Moving the selector is the whole point, so the assertion is on the VALUE edge:
  // whoever constructs one of these classes is choosing an implementation.
  const edges = await scanModuleGraph(rootDir, ["app"])
  const constructors = importersOf(
    edges.filter((edge) => edgeKindClass(edge.kind) === "value"),
    (target) => AUTH_ADAPTER_IMPLEMENTATIONS.includes(target))
  assert.deepEqual(constructors, ["app/lib/composition/authAdapterSelection.ts"],
    "an auth adapter implementation may be constructed only by the composition root")
})

test("WU-06: no route rebuilds the old session dependency path", async () => {
  // The failure this closes is a SECOND composition path: a route that keeps calling the use case
  // directly, or resolves the control repositories itself, while the composition root sits beside
  // it looking authoritative. Delivery may name the root and nothing else on this path.
  const forbiddenFromDelivery = [
    "app/lib/application/auth/sessionResolver.ts",
    "app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts",
    ...AUTH_ADAPTER_IMPLEMENTATIONS,
  ]
  const edges = await scanModuleGraph(rootDir, ["app/api"])
  assert.ok(edges.length > 0, "app/api must contain scanned code files")
  const offenders = edges
    .filter((edge) => forbiddenFromDelivery.includes(edge.resolvedTarget.replace(/^\/+/, "")))
    .map((edge) => `${edge.file} -> ${edge.specifier}`).sort()
  assert.deepEqual(offenders, [],
    `a route must assemble its session through the composition root:\n${offenders.join("\n")}`)
})

test("WU-06: the session use case declares its own capabilities and selects none of them", async () => {
  const source = await readFile(path.join(rootDir, "app/lib/application/auth/sessionResolver.ts"), "utf8")

  // Not a path rule but a signature rule: `resolveSession` takes a REQUIRED dependency object. A
  // defaulted one (`dependencies: SessionDependencies = {...}`) would let the use case supply its
  // own capabilities again while every import policy above stayed green.
  assert.match(source, /export async function resolveSession\(\s*request: Request,\s*dependencies: SessionDependencies,\s*\)/,
    "resolveSession must take a required dependency object, never a defaulted one")

  // The vocabulary of the four things it must no longer name at all. Checked as text, because the
  // point is that these words cannot appear even in a comment-free identifier position.
  for (const forbidden of ["D1DatabaseLike", "resolveControlRepositories", "ControlRepositoryBundle",
    "resolveAuthAdapter", "resolveValidatedRequestRuntimeConfig", "SecurityRuntimeConfig"]) {
    assert.equal(source.includes(forbidden), false,
      `the session use case must not name ${forbidden}: that is a composition-root decision`)
  }
})

test("WU-06: the D1 driver type cannot be laundered through a contract-declaring module", async () => {
  // W16. The application type policy admits a persistence target by its declared RESPONSIBILITY,
  // and repositoryResolver.ts is classified compositionDeclaringContract — the application MAY name
  // its erased types, because that is where TenantRepositoryBundle is declared. That admission is
  // correct and stays. What it must not become is a re-export seam: one added
  // `export type { D1DatabaseLike }` there would hand every application module the driver type back
  // through a module the policy already trusts, and no path rule would see it.
  //
  // So the driver contract is pinned to its own declaration site. This does NOT separate the mixed
  // resolver — WU-06 defers that, because the composition root never names it — it only closes the
  // one laundering route that would undo the type-contract closure above.
  const driverHome = "app/lib/persistence/d1/types.ts"
  const files = await collectCodeFiles(path.join(rootDir, "app/lib/persistence"))
  assert.ok(files.length > 0, "app/lib/persistence must contain scanned code files")
  const reexporters: string[] = []
  for (const file of files) {
    const relative = path.relative(rootDir, file).split(path.sep).join("/")
    if (relative === driverHome) continue
    const source = await readFile(file, "utf8")
    if (/export\s+(?:type\s+)?\{[^}]*\bD1DatabaseLike\b[^}]*\}/.test(source)) reexporters.push(relative)
  }
  assert.deepEqual(reexporters, [],
    `the D1 driver contract must be named only at ${driverHome}, never re-exported:\n${reexporters.join("\n")}`)
})

test("WU-06: the composition root widens no safe-method repository capability", async () => {
  // WU-02S established that a safe handler receives a READ-only tenant bundle. The composition
  // root is exactly the place a future edit could quietly hand a GET the writable bundle instead,
  // so it is pinned as naming no tenant repository surface at all: session assembly is the control
  // directory and nothing else. Tenant repository selection stays where WU-02S left it.
  const compositionFiles = await collectCodeFiles(path.join(rootDir, "app/lib/composition"))
  assert.ok(compositionFiles.length > 0, "app/lib/composition must contain scanned code files")
  for (const file of compositionFiles) {
    const relative = path.relative(rootDir, file).split(path.sep).join("/")
    const source = await readFile(file, "utf8")
    for (const forbidden of ["TenantRepositoryBundle", "TenantReadRepositoryBundle",
      "resolveRouteRepositories", "resolveRouteReadRepositories"]) {
      assert.equal(source.includes(forbidden), false,
        `${relative} must not name ${forbidden}: the safe-method capability boundary is not this slice's to move`)
    }
  }
})

test("WU-A: the recorded ledger reconciles against every WU-A policy at once", async () => {
  // Per-layer tests reconcile their own slice; this one reconciles the UNION against the WHOLE
  // declared set. Without it, a record could be moved between layers — or an edge could migrate
  // from the application scan to the security scan — and both slices would still look balanced.
  const observed = [
    ...(await scanModuleGraph(rootDir, ["app/lib/application"]))
      .filter((edge) => violatesApplicationValueTarget(edge) || violatesApplicationTypeTarget(edge)),
    ...(await scanModuleGraph(rootDir, ["app/lib/security"])).filter(violatesSecurityTarget),
    ...(await scanModuleGraph(rootDir, ["app/lib/runtime"])).filter(violatesRuntimeTarget),
    ...(await scanModuleGraph(rootDir, ["app/lib/persistence"]))
      .filter((edge) => violatesPersistenceTarget(edge) || violatesPersistenceContractTarget(edge)),
    // Whole-layer first, then the stricter control-DB policy on its own subtree only — that
    // policy forbids infrastructure/external, so running it layer-wide would misread every
    // adapter-internal edge. Edges the layer policy already caught are not counted twice.
    ...(await scanModuleGraph(rootDir, ["app/lib/infrastructure"])).filter(violatesInfrastructureTarget),
    ...(await scanModuleGraph(rootDir, ["app/lib/infrastructure/persistence"]))
      .filter((edge) => violatesControlPersistenceTarget(edge) && !violatesInfrastructureTarget(edge)),
    ...(await scanModuleGraph(rootDir, ["app/lib"]))
      .filter((edge) => isLibRootModule(edge.file)).filter(violatesLibRootTarget),
  ]

  const ledger = await readDebtLedger()
  const declared = ledger.debts.flatMap(declaredDebtKeys)
  const { undeclared, stale } = reconcile(observed, declared)
  assert.deepEqual(undeclared, [], `undeclared WU-A boundary violation:\n${undeclared.join("\n")}`)
  assert.deepEqual(stale, [], `stale declared WU-A debt:\n${stale.join("\n")}`)
  // Eleven at the WU-A baseline; six after WU-06 closed the five session/composition edges.
  assert.equal(observed.length, 6, "the WU-A declared set covers exactly six live edges")

  // Every declared record must belong to a WU-A policy. A record whose source layer no longer has
  // a policy would reconcile trivially against an empty observed slice and become permission.
  const policedSources = ["app/lib/application/", "app/lib/security/", "app/lib/runtime/",
    "app/lib/persistence/", "app/lib/infrastructure/persistence/"]
  for (const debt of ledger.debts) {
    for (const source of debt.exact_sources) {
      assert.ok(policedSources.some((prefix) => source.startsWith(prefix)) || isLibRootModule(source),
        `${debt.id} declares ${source}, which no WU-A policy scans`)
    }
  }
})
