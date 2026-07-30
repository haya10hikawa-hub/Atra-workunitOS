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
  assert.deepEqual([...DEBT_IDS].sort(), [
    "domain_tenant_hybrid_boundary",
    "infrastructure_application_signal_contract",
  ], "declared debt is exactly two entries pending a separate PM/architecture decision")
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
