/**
 * Route guard-parity characterization (Refactor Program).
 *
 * Proves the guard surface of every API route from the REAL exported handlers,
 * with:
 *   - canonical guard IDENTITY: a call counts as a guard only when its callee is
 *     a bare identifier bound (possibly aliased) to exactly the canonical export
 *     of exactly the canonical module — `logger.requireSession(...)`, a local
 *     `const requireSession = …`, or a same-named import from elsewhere do NOT
 *     count;
 *   - guard DOMINANCE, not textual order: a guard counts only when called
 *     unconditionally (depth-0: not inside an if/else/loop/try body, a
 *     function/callback, or a short-circuit branch) at a position before the
 *     first direct state-changing effect;
 *   - EXHAUSTIVE coverage: routes and methods are DISCOVERED, not hand-listed;
 *     every discovered (route, method) must be classified and pass, and any
 *     unclassified HTTP method fails closed.
 *
 * Backed by the repository's behavioral route suites (e.g.
 * tenantIsolationRoutes) which exercise the guards at runtime.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  analyzeRoute,
  evaluateGuardPolicy,
  routePolicyCoverage,
  discoverRouteFiles,
  abs,
  rel,
  REQUIRED_POST_GUARDS,
  REQUIRED_GET_GUARDS,
} from "./helpers/refactorSourceGraph.mts"

test("EXHAUSTIVE: every discovered route/method is classified and guard-dominant", () => {
  const routeFiles = discoverRouteFiles()
  assert.ok(routeFiles.length >= 9, `expected >= 9 route modules, found ${routeFiles.length}`)
  const coverage = routePolicyCoverage(routeFiles)
  assert.ok(coverage.length >= routeFiles.length, "every route must expose at least one HTTP handler")

  const failures = coverage.filter((c) => !c.ok)
  assert.deepEqual(
    failures.map((f) => `${f.file} ${f.method} [${f.policy}] ${f.reason}`),
    [],
    "routes failed guard-policy coverage",
  )
  // No unclassified methods currently exist; a new PUT/DELETE handler would fail above.
  assert.deepEqual(coverage.filter((c) => c.policy === "unclassified"), [])
})

test("discovered == classified: every exported HTTP method entered a policy", () => {
  for (const file of discoverRouteFiles()) {
    const reports = analyzeRoute(file)
    for (const r of reports) {
      assert.notEqual(r.policy, undefined)
      // classification is total: GET | POST | unclassified
      assert.ok(["GET", "POST", "unclassified"].includes(r.policy), `${rel(file)} ${r.method} has no policy bucket`)
    }
  }
})

test("POST handlers: the four required guards dominate the first effect", () => {
  for (const file of discoverRouteFiles()) {
    for (const r of analyzeRoute(file).filter((h) => h.method === "POST")) {
      const v = evaluateGuardPolicy(r)
      assert.ok(v.ok, `${rel(file)} POST missing dominant guards: ${v.missing.join(", ")}`)
      for (const g of REQUIRED_POST_GUARDS) assert.ok(r.dominatingGuards.has(g), `${rel(file)} POST: ${g} not dominant`)
    }
  }
})

test("GET handlers: session + runtime-config guards dominate", () => {
  for (const file of discoverRouteFiles()) {
    for (const r of analyzeRoute(file).filter((h) => h.method === "GET")) {
      for (const g of REQUIRED_GET_GUARDS) assert.ok(r.dominatingGuards.has(g), `${rel(file)} GET: ${g} not dominant`)
    }
  }
})

test("KNOWN DEFECT PIN (#156): inbox GET actually reaches the write path", () => {
  // Proven by effect-sink analysis following called local helpers, not a string:
  // the exported GET handler transitively reaches repository.upsert (via
  // persistWorkUnits) and usage.recordEvent. The #156 fix must change THIS
  // assertion in the same PR.
  const get = analyzeRoute(abs("app/api/workunit/inbox/route.ts")).find((h) => h.method === "GET")
  assert.ok(get, "inbox GET handler not found")
  assert.ok(get.effectsReached.has("upsert"), "inbox GET no longer reaches upsert — if #156 was fixed, update this pin")
  assert.ok(get.effectsReached.has("recordEvent"), "inbox GET no longer records usage — if #156 was fixed, update this pin")
})

test("KNOWN GAP PIN: GET-only handlers do not call rate limiting today", () => {
  // Adding rate limiting to GET routes is an intended reliability change
  // (AUD-006 / #180); this pin makes its arrival explicit.
  const getOnly = [
    "app/api/workunit/inbox/route.ts",
    "app/api/workunit/[id]/approval/status/route.ts",
    "app/api/audit/recent/route.ts",
    "app/api/integrations/status/route.ts",
  ]
  for (const route of getOnly) {
    const get = analyzeRoute(abs(route)).find((h) => h.method === "GET")
    assert.ok(get, `${route} GET not found`)
    assert.ok(!get.dominatingGuards.has("checkRateLimit"), `${route} GET gained rate limiting — update this pin in the same PR`)
  }
})
