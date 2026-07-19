/**
 * Adversarial soundness tests for the architecture safety gates
 * (Refactor Program, umbrella #182).
 *
 * Proves the shared AST graph + policies + route inventory actually DETECT the
 * bypasses they claim to, AND that the narrowed scope fails closed where static
 * analysis cannot prove a property. Fixtures are throwaway modules in an OS temp
 * directory; no committed product file is mutated.
 *
 * Two groups:
 *   A. narrowing-scope cases (this round): edge-kind mismatch, globalThis
 *      process, shadowed process, aliased/reexport/wrapper HTTP export, zero
 *      recognized methods, aggregate-count masking.
 *   B. retained soundness cases: import/export type semantics, type-only import
 *      of an implementation, configured alias, guard-identity spoof/shadow,
 *      bare/builtin/require/dynamic rejection, exact exception scoping,
 *      dependency-form coverage, target-kind classification, domain policy.
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
  analyzeRouteFile,
  inboxWritePath,
  processSymbolReferences,
  loadTsConfig,
  abs,
  APPLICATION_VALUE_EXCEPTIONS,
  APPLICATION_TYPEONLY_EXCEPTIONS,
  classifyTypeContractModule,
  typeContractSelfViolations,
  productionTypeOnlyImporters,
  validateTypeContractExemptions,
  type DependencyEdge,
} from "./helpers/refactorSourceGraph.mts"

const SESSION_AUTHORITY_PORT = "app/lib/domain/ports/sessionAuthority.ts"

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
const IMPORT_SESSION = `import { requireSession } from "@/lib/security/session"`

// ═══ A. narrowing-scope adversarial cases ════════════════════════

test("A1: an exception with a matching source/target but a DIFFERENT edge-kind does not apply", () => {
  // Real APPLICATION_VALUE_EXCEPTIONS is empty (WS1-PR2), so use a synthetic
  // value exception to exercise the exact edge-kind check.
  const synthetic = { source: "app/lib/application/synthetic.ts", target: "app/lib/runtime/requestRuntimeConfig.ts", edgeKind: "static-import" as const, typeOnly: false, reason: "test", removalIssue: "test" }
  const opts = { valueExceptions: [synthetic], typeOnlyExceptions: [] }
  const mismatched: DependencyEdge = {
    sourceFile: abs(synthetic.source), specifier: "@/lib/runtime/requestRuntimeConfig",
    edgeKind: "dynamic-import", targetKind: "alias", resolvedTarget: abs(synthetic.target), isTypeOnly: false, isLiteral: true,
  }
  assert.equal(classifyApplicationEdge(mismatched, opts).ok, false, "edge-kind mismatch must not be covered by the exception")
  const exact: DependencyEdge = { ...mismatched, edgeKind: "static-import" }
  assert.equal(classifyApplicationEdge(exact, opts).ok, true, "the exact tolerated edge-kind IS covered")
})

test("A2: globalThis.process is detected", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "d.ts", `export const x = globalThis.process.env.SECRET\n`)
    assert.ok(processSymbolReferences(f) > 0)
  })
})

test("A3: globalThis[\"process\"] is detected", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "d.ts", `export const x = globalThis["process"].env.SECRET\n`)
    assert.ok(processSymbolReferences(f) > 0)
  })
})

test("A4: a locally shadowed `process` is ALLOWED (no false positive), but globalThis.process still fails", () => {
  withFixtureDir((dir) => {
    const shadowed = write(dir, "s.ts", `const process = { env: {} as Record<string, string> }\nexport const x = process.env.X\n`)
    assert.equal(processSymbolReferences(shadowed), 0, "a locally shadowed process must not be flagged")
    const both = write(dir, "b.ts", `const process = { env: {} as Record<string, string> }\nexport const x = process.env.X\nexport const y = globalThis.process.env.Z\n`)
    assert.ok(processSymbolReferences(both) > 0, "globalThis.process must be flagged even when a local process is shadowed")
  })
})

test("A5: an aliased export and a re-exported HTTP handler are reported and fail closed", () => {
  withFixtureDir((dir) => {
    const aliased = analyzeRouteFile(write(dir, "route.ts", `function h(request){ return new Response() }\nexport { h as POST }\n`))
    assert.deepEqual(aliased.recognizedMethods, ["POST"])
    const aliasedExport = aliased.methodExports.find((m) => m.method === "POST")
    assert.equal(aliasedExport?.form, "aliased-export")
    assert.equal(aliasedExport?.analyzable, false)
    assert.ok(aliased.indeterminateForms.includes("aliased-export"))

    const reexport = analyzeRouteFile(write(dir, "route2.ts", `export { POST } from "./other-handler"\n`))
    assert.deepEqual(reexport.recognizedMethods, ["POST"])
    assert.equal(reexport.methodExports.find((m) => m.method === "POST")?.form, "reexport")
    assert.ok(reexport.indeterminateForms.includes("reexport"))
  })
})

test("A6: a wrapper-assigned POST is reported and fails closed", () => {
  withFixtureDir((dir) => {
    const report = analyzeRouteFile(write(dir, "route.ts", `import { withSecuredRoute } from "@/lib/security/session"\nfunction inner(request){ return new Response() }\nexport const POST = withSecuredRoute(inner)\n`))
    assert.deepEqual(report.recognizedMethods, ["POST"])
    const wrapped = report.methodExports.find((m) => m.method === "POST")
    assert.equal(wrapped?.form, "wrapper-const")
    assert.equal(wrapped?.analyzable, false)
    assert.ok(report.indeterminateForms.includes("wrapper-const"))
  })
})

test("A7: a route file with zero recognized HTTP methods produces an explicit result", () => {
  withFixtureDir((dir) => {
    const report = analyzeRouteFile(write(dir, "route.ts", `export const config = { runtime: "edge" }\nfunction helper(){ return 1 }\n`))
    assert.equal(report.hasZeroRecognizedMethods, true)
    assert.deepEqual(report.recognizedMethods, [])
    assert.deepEqual(report.methodExports, [])
  })
})

test("A8: aggregate method-count equality MASKS a per-route regression; per-route comparison catches it", () => {
  // Two inventories with identical TOTAL method counts but a per-route swap.
  const pinned: Record<string, string[]> = { routeA: ["GET", "POST"], routeB: ["GET"] }
  const regressed: Record<string, string[]> = { routeA: ["GET"], routeB: ["GET", "POST"] }
  const total = (inv: Record<string, string[]>) => Object.values(inv).reduce((n, m) => n + m.length, 0)
  // An aggregate-count gate would PASS (masking the regression):
  assert.equal(total(pinned), total(regressed))
  // A per-route comparison DETECTS it (this is why the route test pins per-file):
  assert.notDeepEqual(regressed.routeA, pinned.routeA)
})

// ═══ A′. lexical process resolution + receiver-exact #156 ════════

test("A9: a nested parameter `process` does NOT hide a top-level global process.env", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "d.ts", `export const leaked = process.env.SECRET\nfunction local(process: unknown) { return (process as { env: unknown }).env }\n`)
    assert.equal(processSymbolReferences(f), 1, "top-level global process.env must be reported despite the nested parameter shadow")
  })
})

test("A10: a block-local `process` does NOT hide a sibling/top-level global reference", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "d.ts", `{\n  const process = {} as { env: Record<string, string> }\n  void process.env\n}\nexport const leaked = process.env.SECRET\n`)
    assert.equal(processSymbolReferences(f), 1, "block-local process must not hide the later top-level global")
    // sibling functions: one shadows, the other leaks
    const g = write(dir, "e.ts", `function f(process: unknown){ return (process as { env: unknown }).env }\nfunction h(){ return process.env.Y }\n`)
    assert.equal(processSymbolReferences(g), 1, "a sibling function's parameter must not hide another function's global reference")
  })
})

test("A11: a fully local `process` reference is allowed (0)", () => {
  withFixtureDir((dir) => {
    assert.equal(processSymbolReferences(write(dir, "p.ts", `function local(process: unknown) { return (process as { env: unknown }).env }\n`)), 0)
    assert.equal(processSymbolReferences(write(dir, "t.ts", `const process = {} as { env: Record<string, string> }\nexport const x = process.env.X\n`)), 0)
  })
})

test("A12: globalThis.process still fails when a local `process` exists", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "d.ts", `const process = {} as { env: Record<string, string> }\nexport const x = process.env.X\nexport const y = globalThis.process.env.Z\n`)
    assert.ok(processSymbolReferences(f) >= 1, "globalThis.process must be reported even with a local process in scope")
  })
})

test("A13: `cache.upsert` does not satisfy the `repository.upsert` inbox pin", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "route.ts", `export async function GET(){ return persistWorkUnits() }\nfunction persistWorkUnits(){ cache.upsert(1) }\n`)
    const wp = inboxWritePath(f)
    assert.equal(wp.getCallsPersistWorkUnits, true)
    assert.equal(wp.persistWorkUnitsCallsRepositoryUpsert, false, "cache.upsert must NOT satisfy repository.upsert")
  })
})

test("A14: `metrics.recordEvent` does not satisfy the `usage.recordEvent` inbox pin", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "route.ts", `export async function GET(){ metrics.recordEvent(1); other.append(1); return 1 }\n`)
    const wp = inboxWritePath(f)
    assert.equal(wp.getCallsUsageRecordEvent, false, "metrics.recordEvent must NOT satisfy usage.recordEvent")
    assert.equal(wp.getCallsAuditLogsAppend, false, "other.append must NOT satisfy auditLogs.append")
  })
})

// ═══ B. retained soundness cases ═════════════════════════════════

test("B1: `import Default, { type X }` is a VALUE import and is runtime-reachable", () => {
  withFixtureDir((dir) => {
    const dep = write(dir, "dep.mts", `const d = 1\nexport default d\nexport type X = number\n`)
    const entry = write(dir, "entry.mts", `import Dep, { type X } from "./dep.mts"\nexport const v = Dep\n`)
    const edge = firstEdge(entry, "./dep.mts")
    assert.equal(edge.edgeKind, "static-import")
    assert.equal(edge.isTypeOnly, false)
    assert.ok(reachableFrom([entry]).has(dep))
  })
})

test("B2: `export type { X } from` is type-only and NOT runtime-reachable", () => {
  withFixtureDir((dir) => {
    const dep = write(dir, "dep.mts", `export type X = number\n`)
    const mod = write(dir, "mod.mts", `export type { X } from "./dep.mts"\n`)
    assert.equal(firstEdge(mod, "./dep.mts").isTypeOnly, true)
    assert.equal(reachableFrom([mod]).has(dep), false)
  })
})

test("B3: `export { type X, valueY } from` is a VALUE export and IS runtime-reachable", () => {
  withFixtureDir((dir) => {
    const dep = write(dir, "dep.mts", `export const valueY = 1\nexport type X = number\n`)
    const mod = write(dir, "mod.mts", `export { type X, valueY } from "./dep.mts"\n`)
    assert.equal(firstEdge(mod, "./dep.mts").isTypeOnly, false)
    assert.ok(reachableFrom([mod]).has(dep))
  })
})

test("B4: `import Default, { type X }` from an infrastructure impl is a rejected VALUE dependency", () => {
  withFixtureDir((dir) => {
    const f = write(dir, "svc.ts", `import RealClient, { type GitHubApiClient } from "@/lib/infrastructure/external/github/realGitHubClient"\nexport const c = RealClient\nexport type T = GitHubApiClient\n`)
    const edge = firstEdge(f, "@/lib/infrastructure/external/github/realGitHubClient")
    assert.equal(edge.edgeKind, "static-import", "default+named-type must be a VALUE import")
    assert.equal(edge.isTypeOnly, false)
    assert.equal(classifyApplicationEdge(edge).ok, false)
  })
})

test("B5: a pure type-only import of a persistence/infra implementation is rejected", () => {
  withFixtureDir((dir) => {
    for (const spec of ["@/lib/persistence/d1/workUnitRepository", "@/lib/infrastructure/external/github/realGitHubClient"]) {
      const f = write(dir, `t_${spec.replace(/\W/g, "_")}.ts`, `import type { X } from "${spec}"\nexport type Z = X\n`)
      const edge = firstEdge(f, spec)
      assert.equal(edge.isTypeOnly, true)
      assert.ok(edge.resolvedTarget)
      assert.equal(classifyApplicationEdge(edge).ok, false, `${spec} type-only import must be rejected`)
    }
  })
})

test("B6: `@/` alias resolves through the loaded tsconfig paths", () => {
  const paths = loadTsConfig().options.paths
  assert.ok(paths && paths["@/*"], "tsconfig must define @/*")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "@/lib/security/session").resolvedTarget, abs("app/lib/security/session.ts"))
  assert.equal(resolveSpecifier(abs("app/api/workunit/inbox/route.ts"), "@/lib/persistence/types").resolvedTarget, abs("app/lib/persistence/types.ts"))
})

test("B7: a property-name guard spoof and a locally shadowed guard are not counted as direct guards", () => {
  withFixtureDir((dir) => {
    const spoof = analyzeRouteFile(write(dir, "r1.ts", `${IMPORT_SESSION}\nexport async function POST(request){ logger.requireSession(request); return new Response() }\n`))
    assert.equal(spoof.methodExports[0].directGuards.has("requireSession"), false)
    const shadow = analyzeRouteFile(write(dir, "r2.ts", `${IMPORT_SESSION}\nexport async function POST(request){ const requireSession = () => true; requireSession(request); return new Response() }\n`))
    assert.equal(shadow.methodExports[0].directGuards.has("requireSession"), false)
    // Control: a genuine canonical (aliased) import IS counted.
    const genuine = analyzeRouteFile(write(dir, "r3.ts", `import { requireSession as resolveSession } from "@/lib/security/session"\nexport async function POST(request){ resolveSession(request); return new Response() }\n`))
    assert.equal(genuine.methodExports[0].directGuards.has("requireSession"), true)
  })
})

test("B8: bare provider packages, Node builtins, require, and dynamic infra imports are rejected in application", () => {
  withFixtureDir((dir) => {
    assert.equal(classifyApplicationEdge(firstEdge(write(dir, "a.ts", `import { WebClient } from "@slack/web-api"\nexport const c = WebClient\n`), "@slack/web-api")).ok, false)
    assert.equal(classifyApplicationEdge(firstEdge(write(dir, "b.ts", `import fs from "node:fs"\nexport const x = fs\n`), "node:fs")).ok, false)
    const se = firstEdge(write(dir, "c.ts", `import "@slack/web-api"\nexport const x = 1\n`), "@slack/web-api")
    assert.equal(se.edgeKind, "side-effect-import")
    assert.equal(classifyApplicationEdge(se).ok, false)
    const req = firstEdge(write(dir, "d.ts", `const r = require("../../infrastructure/x")\nexport const x = r\n`), "../../infrastructure/x")
    assert.equal(req.edgeKind, "require")
    assert.equal(classifyApplicationEdge(req).ok, false)
    const dyn = firstEdge(write(dir, "e.ts", `export async function f(){ return import("../../infrastructure/external/github/realGitHubClient") }\n`), "../../infrastructure/external/github/realGitHubClient")
    assert.equal(dyn.edgeKind, "dynamic-import")
    assert.equal(classifyApplicationEdge(dyn).ok, false)
  })
})

test("B9: an exact exception authorizes ONLY its own source→target→edge-kind", () => {
  // Synthetic value exception (real list is empty in WS1-PR2).
  const synthetic = { source: "app/lib/application/svc.ts", target: "app/lib/infrastructure/external/github/realGitHubClient.ts", edgeKind: "static-import" as const, typeOnly: false, reason: "test", removalIssue: "test" }
  const opts = { valueExceptions: [synthetic], typeOnlyExceptions: [] }
  const allowed: DependencyEdge = { sourceFile: abs(synthetic.source), specifier: "x", edgeKind: "static-import", targetKind: "alias", resolvedTarget: abs(synthetic.target), isTypeOnly: false, isLiteral: true }
  assert.equal(classifyApplicationEdge(allowed, opts).ok, true, "the exact synthetic exception edge is allowed")
  // A DIFFERENT source with the same target is not covered.
  const otherSource: DependencyEdge = { ...allowed, sourceFile: abs("app/lib/application/auth/sessionResolver.ts") }
  assert.equal(classifyApplicationEdge(otherSource, opts).ok, false)
  // With the REAL (empty) value-exception list, even the exact edge is denied.
  assert.equal(classifyApplicationEdge(allowed).ok, false)
})

test("B10: domain policy detects provider/builtin/require/cross-layer edges and process references", () => {
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

test("B11: all required dependency forms are parsed", () => {
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

test("B12: target kinds are classified via the config resolver", () => {
  assert.equal(resolveSpecifier(abs("app/api/workunit/inbox/route.ts"), "../../../lib/security/session.ts").targetKind, "relative")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "@/components/workunit-os/WorkUnitOSDashboard").targetKind, "alias")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "react").targetKind, "bare-package")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "node:fs").targetKind, "node-builtin")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "./does-not-exist-xyz").targetKind, "unresolved-internal")
})

test("B13: exception lists are well-formed (exact edge-kind + modality)", () => {
  for (const exc of APPLICATION_VALUE_EXCEPTIONS) { assert.equal(exc.typeOnly, false); assert.equal(exc.edgeKind, "static-import"); assert.ok(fs.existsSync(abs(exc.source)) && fs.existsSync(abs(exc.target))) }
  for (const exc of APPLICATION_TYPEONLY_EXCEPTIONS) { assert.equal(exc.typeOnly, true); assert.equal(exc.edgeKind, "type-only-import"); assert.ok(fs.existsSync(abs(exc.source)) && fs.existsSync(abs(exc.target))) }
})

// ═══ C. exact type-contract reachability-exemption soundness ═════
//
// Proves the ratchet's type-contract exemption is EXACT and fail-closed: it
// exempts a genuine pure-type port with a live type-only consumer, and rejects
// value modules, converted-to-runtime modules, side-effect imports, stale
// (unimported) modules, and directory/glob paths. Fixtures are throwaway modules
// in an OS temp dir; no committed product file is mutated.

test("C1: the exact pure type-contract port is validated and exempted", () => {
  const { validated, rejections } = validateTypeContractExemptions([SESSION_AUTHORITY_PORT])
  assert.deepEqual(rejections, [], "the real session-authority port must validate cleanly")
  assert.equal(validated.has(abs(SESSION_AUTHORITY_PORT)), true)
  // Proof components: pure self + a live production type-only inbound edge.
  assert.deepEqual(typeContractSelfViolations(abs(SESSION_AUTHORITY_PORT)), [])
  assert.ok(productionTypeOnlyImporters(abs(SESSION_AUTHORITY_PORT)).length >= 1, "must have ≥1 production type-only importer")
})

test("C2: an unrelated dead RUNTIME file (value code, no importer) is NOT exempted", () => {
  withFixtureDir((dir) => {
    const dead = write(dir, "deadRuntime.ts", `export const handler = () => new Response()\nexport function helper() { return 1 }\n`)
    const result = classifyTypeContractModule(dead)
    assert.equal(result.ok, false)
    assert.ok(result.reasons.some((r) => r.startsWith("value_export")), "value code must be flagged")
    assert.ok(result.reasons.some((r) => r.startsWith("stale_no_type_only_importer")), "and it has no type-only importer")
  })
})

test("C3: adding a VALUE EXPORT to an otherwise-pure contract invalidates the exemption", () => {
  withFixtureDir((dir) => {
    const converted = write(dir, "converted.ts", `export type Port = { readonly f: () => void }\nexport const RUNTIME_SINGLETON = { f() {} }\n`)
    const violations = typeContractSelfViolations(converted)
    assert.ok(violations.some((v) => v.code === "value_export"), "a value export must be a violation")
    assert.equal(classifyTypeContractModule(converted).ok, false)
  })
})

test("C4: a SIDE-EFFECT import invalidates the exemption", () => {
  withFixtureDir((dir) => {
    const withSideEffect = write(dir, "sideEffect.ts", `import "./register-runtime"\nexport type Port = { readonly f: () => void }\n`)
    const violations = typeContractSelfViolations(withSideEffect)
    assert.ok(violations.some((v) => v.code === "value_import"), "a side-effect import must be a value_import violation")
    assert.equal(classifyTypeContractModule(withSideEffect).ok, false)
  })
})

test("C5: a self-valid pure-type module with NO type-only inbound edge is stale and fails", () => {
  withFixtureDir((dir) => {
    const orphanContract = write(dir, "orphanPort.ts", `export interface OrphanPort { readonly run: () => Promise<void> }\nexport type OrphanId = string & { readonly __brand: "orphan" }\n`)
    assert.deepEqual(typeContractSelfViolations(orphanContract), [], "self-analysis passes (pure types)")
    assert.equal(productionTypeOnlyImporters(orphanContract).length, 0, "but no production module imports it")
    const result = classifyTypeContractModule(orphanContract)
    assert.equal(result.ok, false, "stale exemption must fail")
    assert.ok(result.reasons.some((r) => r.startsWith("stale_no_type_only_importer")))
  })
})

test("C6: exemption is EXACT-path only — directories, globs, and filename patterns are not exempted", () => {
  // A directory and a glob never resolve to a file → rejected.
  for (const notAFile of ["app/lib/domain/ports", "app/lib/domain/ports/**", "app/lib/domain/ports/*.ts"]) {
    const { validated, rejections } = validateTypeContractExemptions([notAFile])
    assert.equal(validated.size, 0, `${notAFile} must not be exempted`)
    assert.equal(rejections.length, 1)
    assert.ok(rejections[0].reasons.some((r) => r.startsWith("not_a_file")))
  }
  // The known list is exact: no wildcard characters, and it resolves to exactly one file.
  const { validated } = validateTypeContractExemptions([SESSION_AUTHORITY_PORT])
  assert.equal(SESSION_AUTHORITY_PORT.includes("*"), false)
  assert.deepEqual([...validated], [abs(SESSION_AUTHORITY_PORT)], "only the exact listed file is exempted")
})
