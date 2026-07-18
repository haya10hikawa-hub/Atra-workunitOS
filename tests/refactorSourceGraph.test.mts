/**
 * Adversarial soundness tests for the architecture safety gates
 * (Refactor Program, umbrella #182).
 *
 * Proves the shared AST graph + policies + handler analysis actually DETECT the
 * violations they claim to — otherwise the gates would be decorative. Each case
 * builds throwaway fixture modules in an OS temp directory (never mutating any
 * committed production file) and asserts the corresponding gate flags them.
 *
 * Covers: bare/Node/side-effect/require/dynamic dependency bypasses, edge-level
 * exception scoping, and the four ways a name-matching route test could be
 * fooled (import-only, comment-only, unused-helper, dead-code-after-return),
 * plus state-change ordering, route-deletion detection, and dynamic-only
 * runtime reachability.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  parseModuleEdges,
  resolveSpecifier,
  classifyDomainEdge,
  classifyApplicationEdge,
  analyzeRouteModule,
  reachableFrom,
  knownEntryPointsMissing,
  KNOWN_RUNTIME_ENTRY_POINTS,
  STATE_CHANGING_CALLS,
  APPLICATION_EDGE_EXCEPTIONS,
  abs,
  type DependencyEdge,
  type EdgeException,
} from "./helpers/refactorSourceGraph.mts"

// ─── fixture harness ────────────────────────────────────────────

function withFixtureDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refactor-adv-"))
  try { return fn(dir) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

function writeModule(dir: string, name: string, source: string): string {
  const p = path.join(dir, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, source)
  return p
}

/** Classify a fixture's edges under the application policy; return violations. */
function applicationViolations(file: string, exceptions: readonly EdgeException[] = APPLICATION_EDGE_EXCEPTIONS): string[] {
  return parseModuleEdges(file)
    .map((e) => ({ e, v: classifyApplicationEdge(e, exceptions) }))
    .filter((x) => !x.v.ok)
    .map((x) => `${x.e.edgeKind} ${x.e.specifier ?? "<nl>"}: ${x.v.reason}`)
}

function domainViolations(file: string): string[] {
  return parseModuleEdges(file)
    .map((e) => ({ e, v: classifyDomainEdge(e) }))
    .filter((x) => !x.v.ok)
    .map((x) => `${x.e.edgeKind} ${x.e.specifier ?? "<nl>"}: ${x.v.reason}`)
}

function postHandler(file: string) {
  const h = analyzeRouteModule(file).find((x) => x.method === "POST")
  assert.ok(h, "fixture has no POST handler")
  return h
}

// ─── 1. application imports a provider package ───────────────────

test("case 1: application value-import of a provider package is detected", () => {
  withFixtureDir((dir) => {
    const f = writeModule(dir, "svc.ts", `import { WebClient } from "@slack/web-api"\nexport const c = new WebClient()\n`)
    const v = applicationViolations(f)
    assert.ok(v.some((s) => s.includes("@slack/web-api")), `expected provider-package violation, got: ${v.join("; ")}`)
  })
})

// ─── 2. application imports a Node builtin ───────────────────────

test("case 2: application import of a Node builtin is detected", () => {
  withFixtureDir((dir) => {
    const f = writeModule(dir, "svc.ts", `import fs from "node:fs"\nexport const x = fs.readFileSync\n`)
    const v = applicationViolations(f)
    assert.ok(v.some((s) => s.includes("node:fs")), `expected node-builtin violation, got: ${v.join("; ")}`)
    // Also a bare (non node:) builtin name.
    const g = writeModule(dir, "svc2.ts", `import { createHash } from "crypto"\nexport const h = createHash\n`)
    assert.ok(applicationViolations(g).some((s) => s.includes("crypto")), "bare builtin name not detected")
  })
})

// ─── 3. side-effect provider import ──────────────────────────────

test("case 3: side-effect provider import is detected", () => {
  withFixtureDir((dir) => {
    const f = writeModule(dir, "svc.ts", `import "@slack/web-api"\nexport const x = 1\n`)
    const edges = parseModuleEdges(f)
    assert.ok(edges.some((e) => e.edgeKind === "side-effect-import"), "side-effect import form not parsed")
    assert.ok(applicationViolations(f).some((s) => s.includes("@slack/web-api")), "side-effect provider import not detected")
  })
})

// ─── 4. literal require of infrastructure ────────────────────────

test("case 4: literal require() in application is detected (opaque form)", () => {
  withFixtureDir((dir) => {
    const f = writeModule(dir, "svc.ts", `const repo = require("../../infrastructure/persistence/control/x")\nexport const r = repo\n`)
    const edges = parseModuleEdges(f)
    assert.ok(edges.some((e) => e.edgeKind === "require"), "require form not parsed")
    assert.ok(applicationViolations(f).some((s) => s.includes("opaque module form require")), "require not flagged")
  })
})

// ─── 5. dynamic infrastructure import ────────────────────────────

test("case 5: literal dynamic import of infrastructure is detected", () => {
  withFixtureDir((dir) => {
    const f = writeModule(dir, "svc.ts", `export async function load(){ return import("../../infrastructure/external/github/realGitHubClient") }\n`)
    const edges = parseModuleEdges(f)
    assert.ok(edges.some((e) => e.edgeKind === "dynamic-import"), "dynamic-import form not parsed")
    assert.ok(applicationViolations(f).some((s) => s.includes("infrastructure")), "dynamic infrastructure import not flagged")
  })
})

// ─── 6. second forbidden edge from the allowlisted source ────────

test("case 6: the sessionResolver exception does not license its OTHER forbidden imports", () => {
  const source = "app/lib/application/auth/sessionResolver.ts"
  // A DIFFERENT infrastructure target than the two exact exception targets.
  const otherInfraTarget = "app/lib/infrastructure/external/github/realGitHubClient.ts"
  assert.ok(fs.existsSync(abs(otherInfraTarget)), "control fixture target missing")
  const forgedEdge: DependencyEdge = {
    sourceFile: abs(source),
    specifier: "../../infrastructure/external/github/realGitHubClient.ts",
    edgeKind: "static-import",
    targetKind: "relative",
    resolvedTarget: abs(otherInfraTarget),
    isTypeOnly: false,
    isLiteral: true,
  }
  const verdict = classifyApplicationEdge(forgedEdge, APPLICATION_EDGE_EXCEPTIONS)
  assert.equal(verdict.ok, false, "a new forbidden import from the allowlisted source was wrongly permitted")

  // Control: the two REAL exception edges ARE permitted.
  for (const exc of APPLICATION_EDGE_EXCEPTIONS) {
    const okEdge: DependencyEdge = {
      sourceFile: abs(exc.source),
      specifier: "./x",
      edgeKind: "static-import",
      targetKind: "relative",
      resolvedTarget: abs(exc.target),
      isTypeOnly: false,
      isLiteral: true,
    }
    assert.equal(classifyApplicationEdge(okEdge, APPLICATION_EDGE_EXCEPTIONS).ok, true, `exact exception ${exc.source}→${exc.target} should be permitted`)
  }
})

// ─── domain policy soundness (complements the 12 numbered cases) ─

test("domain policy detects provider packages, Node builtins, require, and cross-layer imports", () => {
  withFixtureDir((dir) => {
    const provider = writeModule(dir, "d1.ts", `import { WebClient } from "@slack/web-api"\nexport const x = WebClient\n`)
    assert.ok(domainViolations(provider).some((s) => s.includes("@slack/web-api")), "domain provider import not detected")

    const builtin = writeModule(dir, "d2.ts", `import fs from "node:fs"\nexport const x = fs\n`)
    assert.ok(domainViolations(builtin).some((s) => s.includes("node:fs")), "domain Node builtin not detected")

    const req = writeModule(dir, "d3.ts", `const p = require("../persistence/x")\nexport const x = p\n`)
    assert.ok(domainViolations(req).some((s) => s.includes("opaque module form require")), "domain require() not detected")

    // A cross-layer relative import that does NOT resolve inside domain/tenant.
    const crossLayer: DependencyEdge = {
      sourceFile: abs("app/lib/domain/types.ts"),
      specifier: "../persistence/types",
      edgeKind: "static-import",
      targetKind: "relative",
      resolvedTarget: abs("app/lib/persistence/types.ts"),
      isTypeOnly: false,
      isLiteral: true,
    }
    assert.equal(classifyDomainEdge(crossLayer).ok, false, "domain cross-layer import wrongly permitted")
  })
})

// ─── 7-10. name-matching cannot be fooled ────────────────────────

test("case 7: a guard that appears only in an import is NOT counted as called", () => {
  withFixtureDir((dir) => {
    const f = writeModule(dir, "route.ts", `import { requireSession } from "../security/session"\nexport async function POST(request){ return new Response() }\n`)
    assert.equal(postHandler(f).calledNames.has("requireSession"), false)
  })
})

test("case 8: a guard that appears only in a comment is NOT counted as called", () => {
  withFixtureDir((dir) => {
    const f = writeModule(dir, "route.ts", `export async function POST(request){\n  // requireSession(request) is intentionally not called here\n  /* validateCsrfOrigin(request) */\n  return new Response()\n}\n`)
    const h = postHandler(f)
    assert.equal(h.calledNames.has("requireSession"), false)
    assert.equal(h.calledNames.has("validateCsrfOrigin"), false)
  })
})

test("case 9: a guard called only in an UNUSED helper is NOT counted as called", () => {
  withFixtureDir((dir) => {
    const f = writeModule(dir, "route.ts", `function unused(request){ requireSession(request) }\nexport async function POST(request){ return new Response() }\n`)
    assert.equal(postHandler(f).calledNames.has("requireSession"), false)
  })
})

test("case 10: a guard AFTER a state-changing effect (or after an unconditional return) is flagged/ignored", () => {
  withFixtureDir((dir) => {
    // (a) guard placed after a state-changing call: ordering check must flag it.
    const a = writeModule(dir, "routeA.ts", `export async function POST(request){\n  const r = repo.upsert(request)\n  validateCsrfOrigin(request)\n  requireSession(request)\n  return r\n}\n`)
    const ha = postHandler(a)
    const idxState = ha.orderedNames.findIndex((n) => STATE_CHANGING_CALLS.has(n))
    const idxCsrf = ha.orderedNames.findIndex((n) => n === "validateCsrfOrigin")
    assert.ok(idxState >= 0 && idxCsrf >= 0 && idxState < idxCsrf, "ordering did not observe state-change-before-guard")

    // (b) guard in dead code after an unconditional return is NOT counted.
    const b = writeModule(dir, "routeB.ts", `export async function POST(request){\n  return new Response()\n  requireSession(request)\n}\n`)
    assert.equal(postHandler(b).calledNames.has("requireSession"), false)
  })
})

// ─── 11. route deletion is detected ──────────────────────────────

test("case 11: removal of a known route is detected by the inventory", () => {
  // Real inventory is currently intact.
  assert.deepEqual(knownEntryPointsMissing(KNOWN_RUNTIME_ENTRY_POINTS), [])
  // Simulate a deletion: a known route path that no longer exists is reported.
  const withDeleted = KNOWN_RUNTIME_ENTRY_POINTS.filter((r) => r !== "app/api/workunit/inbox/route.ts")
    .concat("app/api/workunit/inbox/route.ts.deleted-sentinel")
  const missing = knownEntryPointsMissing(withDeleted)
  assert.ok(missing.includes("app/api/workunit/inbox/route.ts.deleted-sentinel"), "deletion detector failed to report a removed route")
})

// ─── 12. runtime module reachable only via dynamic import ────────

test("case 12: a module connected only through a literal dynamic import is runtime-reachable", () => {
  withFixtureDir((dir) => {
    const target = writeModule(dir, "target.mts", `export const loaded = true\n`)
    const entry = writeModule(dir, "entry.mts", `export async function boot(){ const m = await import("./target.mts"); return m.loaded }\n`)
    const reachable = reachableFrom([entry], { runtimeOnly: true })
    assert.ok(reachable.has(target), "dynamic-import target was not followed by the runtime reachability graph")
    // And a type-only edge must NOT make its target runtime-reachable.
    const typeTarget = writeModule(dir, "types.mts", `export type Only = 1\n`)
    const typeEntry = writeModule(dir, "typeEntry.mts", `import type { Only } from "./types.mts"\nexport const x: Only = 1\n`)
    const rt = reachableFrom([typeEntry], { runtimeOnly: true })
    assert.equal(rt.has(typeTarget), false, "type-only edge wrongly counted as a runtime dependency")
  })
})

// ─── graph form coverage (all required dependency forms parse) ───

test("all required dependency forms are parsed and classified", () => {
  withFixtureDir((dir) => {
    writeModule(dir, "dep.ts", `export const a = 1\n`)
    const f = writeModule(dir, "forms.ts", [
      `import a from "./dep"`, // static
      `import type { T } from "./dep"`, // type-only
      `import "./dep"`, // side-effect
      `export { a } from "./dep"`, // export-from
      `export * from "./dep"`, // export-star
      `import eq = require("./dep")`, // import-equals
      `const r = require("./dep")`, // require
      `export async function f(){ await import("./dep"); await import(a as any) }`, // dynamic + non-literal
    ].join("\n") + "\n")
    const kinds = new Set(parseModuleEdges(f).map((e) => e.edgeKind))
    for (const required of [
      "static-import", "type-only-import", "side-effect-import", "export-from",
      "export-star", "import-equals", "require", "dynamic-import", "non-literal-dynamic",
    ]) {
      assert.ok(kinds.has(required as never), `dependency form not parsed: ${required}`)
    }
  })
})

test("target kinds are classified: relative, alias, bare package, node builtin, unresolved-internal", () => {
  assert.equal(resolveSpecifier(abs("app/api/workunit/inbox/route.ts"), "../../../lib/security/session").targetKind, "relative")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "@/components/workunit-os/WorkUnitOSDashboard").targetKind, "alias")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "react").targetKind, "bare-package")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "node:fs").targetKind, "node-builtin")
  assert.equal(resolveSpecifier(abs("app/page.tsx"), "./does-not-exist-xyz").targetKind, "unresolved-internal")
})
