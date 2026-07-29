import test from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import {
  extractModuleReferences,
  isCodeFilePath,
  resolveModuleTarget,
  scanModuleGraph,
  type ModuleEdge,
} from "../scripts/lib/typescriptModuleGraph.mjs"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

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
