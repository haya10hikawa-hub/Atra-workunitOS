/**
 * Adversarial soundness tests for the architecture safety gates
 * (Refactor Program, umbrella #182).
 *
 * Proves the shared AST graph + policies + route model actually DETECT the
 * bypasses they claim to. Every fixture is a throwaway module in an OS temp
 * directory (guards import the REAL canonical modules via the `@/` alias, which
 * resolves through the loaded tsconfig regardless of fixture location). No
 * committed product file is mutated.
 *
 * The sixteen numbered cases map 1:1 to the round-2 audit checklist.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  parseModuleEdges,
  resolveSpecifier,
  reachableFrom,
  classifyDomainEdge,
  classifyApplicationEdge,
  analyzeRoute,
  routePolicyCoverage,
  processSymbolReferences,
  loadTsConfig,
  abs,
  APPLICATION_VALUE_EXCEPTIONS,
  APPLICATION_TYPEONLY_EXCEPTIONS,
  type DependencyEdge,
} from "./helpers/refactorSourceGraph.mts"

function withFixtureDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refactor-adv-"))
  try { return fn(dir) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}
function write(dir: string, name: string, src: string): string {
  const p = path.join(dir, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, src)
  return p
}
function firstEdge(file: string, spec: string): DependencyEdge {
  const e = parseModuleEdges(file).find((x) => x.specifier === spec)
  assert.ok(e, `no edge for ${spec}`)
  return e
}
function post(file: string) {
  const r = analyzeRoute(file).find((h) => h.method === "POST")
  assert.ok(r, "fixture has no POST handler")
  return r
}
// A canonical guard import so fixtures' guard calls resolve to the real module.
const IMPORT_SESSION = `import { requireSession } from "@/lib/security/session"`

// ─── 1. default value + named type-only import is a VALUE import ─

test("case 1: `import Default, { type X }` is a VALUE import and is followed by runtime reachability", () => {
  withFixtureDir((dir) => {
    const dep = write(dir, "dep.mts", `const d = 1\nexport default d\nexport type X = number\n`)
    const entry = write(dir, "entry.mts", `import Dep, { type X } from "./dep.mts"\nexport const v = Dep\n`)
    const edge = firstEdge(entry, "./dep.mts")
    assert.equal(edge.edgeKind, "static-import")
    assert.equal(edge.isTypeOnly, false)
    assert.ok(reachableFrom([entry], { runtimeOnly: true }).has(dep), "value edge not followed by runtime reachability")
  })
})

// ─── 2. named type-only export is type-only (excluded from runtime) ─

test("case 2: `export type { X } from` is type-only and NOT runtime-reachable", () => {
  withFixtureDir((dir) => {
    const dep = write(dir, "dep.mts", `export type X = number\n`)
    const mod = write(dir, "mod.mts", `export type { X } from "./dep.mts"\n`)
    const edge = firstEdge(mod, "./dep.mts")
    assert.equal(edge.isTypeOnly, true)
    assert.equal(reachableFrom([mod], { runtimeOnly: true }).has(dep), false)
  })
})

// ─── 3. mixed value/type export is a VALUE export ────────────────

test("case 3: `export { type X, valueY } from` is a VALUE export and IS runtime-reachable", () => {
  withFixtureDir((dir) => {
    const dep = write(dir, "dep.mts", `export const valueY = 1\nexport type X = number\n`)
    const mod = write(dir, "mod.mts", `export { type X, valueY } from "./dep.mts"\n`)
    const edge = firstEdge(mod, "./dep.mts")
    assert.equal(edge.isTypeOnly, false)
    assert.ok(reachableFrom([mod], { runtimeOnly: true }).has(dep))
  })
})

// ─── 4. type-only import from a forbidden implementation fails ───

test("case 4: type-only import of a persistence/infrastructure IMPLEMENTATION is rejected", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "svc.ts", [
      `import type { D1WorkUnitRepository } from "@/lib/persistence/d1/workUnitRepository"`,
      `import type { RealGitHubClient } from "@/lib/infrastructure/external/github/realGitHubClient"`,
      `export type Z = D1WorkUnitRepository | RealGitHubClient`,
    ].join("\n") + "\n")
    for (const spec of ["@/lib/persistence/d1/workUnitRepository", "@/lib/infrastructure/external/github/realGitHubClient"]) {
      const edge = firstEdge(f, spec)
      assert.equal(edge.isTypeOnly, true, `${spec} should parse as type-only`)
      assert.ok(edge.resolvedTarget, `${spec} should resolve via tsconfig`)
      const v = classifyApplicationEdge(edge)
      assert.equal(v.ok, false, `type-only import of implementation ${spec} must be rejected`)
    }
    // Control: a legitimate exact type-only exception IS allowed.
    const allowed = firstEdge(
      write(dir, "ok.ts", `import type { D1DatabaseLike } from "@/lib/persistence/d1/types"\nexport type Q = D1DatabaseLike\n`),
      "@/lib/persistence/d1/types",
    )
    const okEdge: DependencyEdge = { ...allowed, sourceFile: abs("app/lib/application/auth/sessionResolver.ts") }
    assert.equal(classifyApplicationEdge(okEdge).ok, true, "exact type-only contract exception should be allowed")
  })
})

// ─── 5. configured alias resolution comes from the loaded tsconfig ─

test("case 5: `@/` alias is resolved through the loaded tsconfig paths", () => {
  const paths = loadTsConfig().options.paths
  assert.ok(paths && paths["@/*"], "tsconfig must define the @/* path mapping")
  const r = resolveSpecifier(abs("app/page.tsx"), "@/lib/security/session")
  assert.equal(r.targetKind, "alias")
  assert.equal(r.resolvedTarget, abs("app/lib/security/session.ts"))
  // A deep alias only resolvable via the configured mapping.
  assert.equal(
    resolveSpecifier(abs("app/api/workunit/inbox/route.ts"), "@/lib/persistence/types").resolvedTarget,
    abs("app/lib/persistence/types.ts"),
  )
})

// ─── 6-10. guard identity & dominance cannot be fooled ───────────

test("case 6: a CONDITIONAL guard does not dominate the effect", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "route.ts", `${IMPORT_SESSION}\nexport async function POST(request){\n  if (request) requireSession(request)\n  store.put(request)\n  return new Response()\n}\n`)
    assert.equal(post(f).dominatingGuards.has("requireSession"), false)
  })
})

test("case 7: a guard in an UNINVOKED nested function does not dominate", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "route.ts", `${IMPORT_SESSION}\nexport async function POST(request){\n  function helper(){ requireSession(request) }\n  store.put(request)\n  return new Response()\n}\n`)
    assert.equal(post(f).dominatingGuards.has("requireSession"), false)
  })
})

test("case 8: a guard in a DELAYED callback does not dominate", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "route.ts", `${IMPORT_SESSION}\nexport async function POST(request){\n  setTimeout(() => requireSession(request), 0)\n  store.put(request)\n  return new Response()\n}\n`)
    assert.equal(post(f).dominatingGuards.has("requireSession"), false)
  })
})

test("case 9: a PROPERTY-NAME guard spoof (logger.requireSession) is not a guard", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "route.ts", `${IMPORT_SESSION}\nexport async function POST(request){\n  logger.requireSession(request)\n  return new Response()\n}\n`)
    assert.equal(post(f).dominatingGuards.has("requireSession"), false)
  })
})

test("case 10: a LOCALLY SHADOWED guard function is not the canonical guard", () => {
  withFixtureDir((dir) => {
    // Imports the real guard AND shadows it with a local of the same name.
    const f = write(dir, "route.ts", `${IMPORT_SESSION}\nexport async function POST(request){\n  const requireSession = () => true\n  requireSession(request)\n  store.put(request)\n  return new Response()\n}\n`)
    assert.equal(post(f).dominatingGuards.has("requireSession"), false)
    // A pure local (no import at all) is likewise not counted.
    const g = write(dir, "route2.ts", `export async function POST(request){\n  const requireSession = () => true\n  requireSession(request)\n  return new Response()\n}\n`)
    assert.equal(post(g).dominatingGuards.has("requireSession"), false)
  })
})

// ─── 11. newly discovered unclassified route fails closed ────────

test("case 11: a discovered route with an unclassified HTTP method fails coverage", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "route.ts", `export async function PUT(request){ return new Response() }\n`)
    const coverage = routePolicyCoverage([f])
    const put = coverage.find((c) => c.method === "PUT")
    assert.ok(put, "PUT handler not discovered")
    assert.equal(put.policy, "unclassified")
    assert.equal(put.ok, false)
  })
})

// ─── 12. state-changing sinks are recognized and must be dominated ─

test("case 12: unregistered/effect-capable sinks are detected and require dominance", () => {
  withFixtureDir((dir) => {
    // Each Phase-7 sink verb is detected as an effect.
    const sinks: Array<[string, string]> = [
      ["repository.save(x)", "save"],
      ["store.put(x)", "put"],
      ["provider.send(x)", "send"],
      ["client.post(x)", "post"],
      ["queue.enqueue(x)", "enqueue"],
      ["db.batch(x)", "batch"],
    ]
    for (const [call, label] of sinks) {
      const f = write(dir, `s_${label}.ts`, `export async function POST(x){ ${call}\n return new Response() }\n`)
      assert.ok(post(f).effectsReached.has(label), `sink ${call} not detected as effect`)
    }
    // And an effect placed BEFORE the guard breaks dominance.
    const g = write(dir, "order.ts", `${IMPORT_SESSION}\nexport async function POST(request){\n  store.put(request)\n  requireSession(request)\n  return new Response()\n}\n`)
    assert.equal(post(g).dominatingGuards.has("requireSession"), false, "guard after an effect must not be counted as dominant")
  })
})

// ─── 13. a harmless same-name method is NOT an effect ────────────

test("case 13: an unrelated object's create() is NOT classified as a repository effect", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "route.ts", `export async function POST(x){ const b = builder.create(x); const u = new URL("x"); return b }\n`)
    const r = post(f)
    assert.equal(r.effectsReached.has("create"), false, "harmless builder.create() must not be an effect")
  })
})

// ─── 14-16. domain env-authority AST detection ───────────────────

test("case 14: process[\"env\"] element access is detected (not just process.env)", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "d.ts", `export const x = process["env"].SECRET\n`)
    assert.ok(processSymbolReferences(f) > 0)
  })
})

test("case 15: destructured and aliased process access is detected", () => {
  withFixtureDir((dir) => {
    const destructured = write(dir, "d1.ts", `const { env } = process\nexport const x = env.SECRET\n`)
    assert.ok(processSymbolReferences(destructured) > 0, "destructured process not detected")
    const aliased = write(dir, "d2.ts", `const p = process\nexport const x = p.env.SECRET\n`)
    assert.ok(processSymbolReferences(aliased) > 0, "aliased process not detected")
  })
})

test("case 16: process.env inside a comment or string produces NO false positive", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "d.ts", `// process.env.FOO is only mentioned here\n/* process.env.BAR */\nexport const note = "reads process.env at runtime"\nexport const z = 1\n`)
    assert.equal(processSymbolReferences(f), 0)
  })
})

// ─── supporting soundness (retained from round 1) ────────────────

test("bare provider packages, Node builtins, require, and dynamic infra imports are rejected in application", () => {
  withFixtureDir((dir) => {
    const provider = firstEdge(write(dir, "a.ts", `import { WebClient } from "@slack/web-api"\nexport const c = WebClient\n`), "@slack/web-api")
    assert.equal(classifyApplicationEdge(provider).ok, false)
    const builtin = firstEdge(write(dir, "b.ts", `import fs from "node:fs"\nexport const x = fs\n`), "node:fs")
    assert.equal(classifyApplicationEdge(builtin).ok, false)
    const sideEffect = firstEdge(write(dir, "c.ts", `import "@slack/web-api"\nexport const x = 1\n`), "@slack/web-api")
    assert.equal(sideEffect.edgeKind, "side-effect-import")
    assert.equal(classifyApplicationEdge(sideEffect).ok, false)
    const req = firstEdge(write(dir, "d.ts", `const r = require("../../infrastructure/x")\nexport const x = r\n`), "../../infrastructure/x")
    assert.equal(req.edgeKind, "require")
    assert.equal(classifyApplicationEdge(req).ok, false)
    const dyn = firstEdge(write(dir, "e.ts", `export async function f(){ return import("../../infrastructure/external/github/realGitHubClient") }\n`), "../../infrastructure/external/github/realGitHubClient")
    assert.equal(dyn.edgeKind, "dynamic-import")
    assert.equal(classifyApplicationEdge(dyn).ok, false)
  })
})

test("an exact exception authorizes ONLY its own source→target pair", () => {
  const source = "app/lib/application/auth/sessionResolver.ts"
  const otherInfra = "app/lib/infrastructure/external/github/realGitHubClient.ts"
  const forged: DependencyEdge = {
    sourceFile: abs(source), specifier: "@/lib/infrastructure/external/github/realGitHubClient",
    edgeKind: "static-import", targetKind: "alias", resolvedTarget: abs(otherInfra), isTypeOnly: false, isLiteral: true,
  }
  assert.equal(classifyApplicationEdge(forged).ok, false, "a new forbidden import from the allowlisted source must be rejected")
  for (const exc of APPLICATION_VALUE_EXCEPTIONS) {
    const okEdge: DependencyEdge = { sourceFile: abs(exc.source), specifier: "x", edgeKind: "static-import", targetKind: "relative", resolvedTarget: abs(exc.target), isTypeOnly: false, isLiteral: true }
    assert.equal(classifyApplicationEdge(okEdge).ok, true)
  }
})

test("domain policy detects provider/builtin/require/cross-layer edges", () => {
  withFixtureDir((dir) => {
    const cases: Array<[string, string]> = [
      [`import { WebClient } from "@slack/web-api"\nexport const x=WebClient`, "@slack/web-api"],
      [`import fs from "node:fs"\nexport const x=fs`, "node:fs"],
      [`const p = require("../persistence/x")\nexport const x=p`, "../persistence/x"],
    ]
    for (const [src, spec] of cases) {
      const edge = firstEdge(write(dir, `${spec.replace(/\W/g, "_")}.ts`, src + "\n"), spec)
      assert.equal(classifyDomainEdge(edge).ok, false, `domain should reject ${spec}`)
    }
    const crossLayer: DependencyEdge = { sourceFile: abs("app/lib/domain/types.ts"), specifier: "@/lib/persistence/types", edgeKind: "static-import", targetKind: "alias", resolvedTarget: abs("app/lib/persistence/types.ts"), isTypeOnly: false, isLiteral: true }
    assert.equal(classifyDomainEdge(crossLayer).ok, false)
  })
})

test("all required dependency forms are parsed", () => {
  withFixtureDir((dir) => {
    write(dir, "dep.ts", `export const a = 1\n`)
    const f = write(dir, "forms.ts", [
      `import a from "./dep"`,
      `import type { T } from "./dep"`,
      `import "./dep"`,
      `export { a } from "./dep"`,
      `export * from "./dep"`,
      `import eq = require("./dep")`,
      `const r = require("./dep")`,
      `export async function f(){ await import("./dep"); await import(a as never) }`,
    ].join("\n") + "\n")
    const kinds = new Set(parseModuleEdges(f).map((e) => e.edgeKind))
    for (const required of ["static-import", "type-only-import", "side-effect-import", "export-from", "export-star", "import-equals", "require", "dynamic-import", "non-literal-dynamic"]) {
      assert.ok(kinds.has(required as never), `dependency form not parsed: ${required}`)
    }
  })
})

test("target kinds are classified via the config resolver", () => {
  assert.equal(resolveSpecifier(abs("app/api/workunit/inbox/route.ts"), "../../../lib/security/session.ts").targetKind, "relative")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "@/components/workunit-os/WorkUnitOSDashboard").targetKind, "alias")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "react").targetKind, "bare-package")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "node:fs").targetKind, "node-builtin")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "./does-not-exist-xyz").targetKind, "unresolved-internal")
})

test("type-only exception list is well-formed (all typeOnly=true, exact)", () => {
  for (const exc of APPLICATION_TYPEONLY_EXCEPTIONS) {
    assert.equal(exc.typeOnly, true)
    assert.ok(fs.existsSync(abs(exc.source)) && fs.existsSync(abs(exc.target)))
  }
})
