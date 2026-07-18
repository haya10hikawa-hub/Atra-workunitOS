/**
 * Route guard-parity characterization (Refactor Program).
 *
 * Proves the CURRENT guard surface of every API route from the REAL exported
 * handlers (TypeScript AST), NOT from source-text name matching. For each route
 * module we analyze the exported GET/POST handler and collect the function and
 * method names ACTUALLY called along the handler's execution path — inlining
 * local helpers at their call site and pruning statements after an
 * unconditional return/throw. Imports, comments, strings, unused helpers, and
 * dead code therefore do not count as guards.
 *
 * So any change to the guard wiring during the refactor is deliberate, not
 * accidental (Phase 16 rule 1). Known defects are pinned to actual handler-path
 * behavior; their fixes must flip the corresponding pin in the same PR.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  analyzeRouteModule,
  abs,
  STATE_CHANGING_CALLS,
  type HandlerAnalysis,
} from "./helpers/refactorSourceGraph.mts"

const POST_ROUTES = [
  "app/api/workunit/tools/route.ts",
  "app/api/workunit/[id]/action-preview/route.ts",
  "app/api/workunit/[id]/approval/route.ts",
  "app/api/workunit/[id]/execution/dry-run/route.ts",
  "app/api/workunit/[id]/feedback/route.ts",
]

const GET_ONLY_ROUTES = [
  "app/api/workunit/inbox/route.ts",
  "app/api/workunit/[id]/approval/status/route.ts",
  "app/api/audit/recent/route.ts",
  "app/api/integrations/status/route.ts",
]

function handler(route: string, method: string): HandlerAnalysis {
  const found = analyzeRouteModule(abs(route)).find((h) => h.method === method)
  assert.ok(found, `${route} has no exported ${method} handler`)
  return found
}

function firstIndex(ordered: readonly string[], predicate: (n: string) => boolean): number {
  return ordered.findIndex(predicate)
}

test("every POST handler actually calls session, CSRF, rate limit, and bounded body parsing", () => {
  for (const route of POST_ROUTES) {
    const post = handler(route, "POST")
    for (const guard of ["requireSession", "validateCsrfOrigin", "checkRateLimit", "readBoundedJsonObject"]) {
      assert.ok(post.calledNames.has(guard), `${route} POST no longer calls ${guard} on the handler path`)
    }
  }
})

test("every POST handler calls CSRF + session BEFORE any state-changing call (order proof)", () => {
  for (const route of POST_ROUTES) {
    const { orderedNames } = handler(route, "POST")
    const idxCsrf = firstIndex(orderedNames, (n) => n === "validateCsrfOrigin")
    const idxSession = firstIndex(orderedNames, (n) => n === "requireSession")
    const idxStateChange = firstIndex(orderedNames, (n) => STATE_CHANGING_CALLS.has(n))
    assert.ok(idxCsrf >= 0 && idxSession >= 0, `${route} POST missing csrf/session on the handler path`)
    if (idxStateChange >= 0) {
      assert.ok(idxCsrf < idxStateChange, `${route} POST performs a state change (@${idxStateChange}) before CSRF (@${idxCsrf})`)
      assert.ok(idxSession < idxStateChange, `${route} POST performs a state change (@${idxStateChange}) before session (@${idxSession})`)
    }
  }
})

test("every GET handler actually calls session verification and resolves the runtime config", () => {
  for (const route of [...GET_ONLY_ROUTES, "app/api/workunit/tools/route.ts"]) {
    const get = handler(route, "GET")
    assert.ok(get.calledNames.has("requireSession"), `${route} GET no longer calls requireSession`)
    assert.ok(
      get.calledNames.has("resolveValidatedRequestRuntimeConfig"),
      `${route} GET no longer resolves the validated runtime config on the handler path`,
    )
  }
})

test("KNOWN DEFECT PIN (#156): inbox GET actually reaches the write path", () => {
  // Proven by handler-path call analysis, not a string/import: the exported GET
  // handler transitively calls repository.upsert (via persistWorkUnits) and
  // usage.recordEvent. The #156 fix must change THIS assertion in the same PR.
  const get = handler("app/api/workunit/inbox/route.ts", "GET")
  assert.ok(get.calledNames.has("upsert"), "inbox GET no longer reaches upsert — if #156 was fixed, update this pin")
  assert.ok(get.calledNames.has("recordEvent"), "inbox GET no longer records usage — if #156 was fixed, update this pin")
  // And the write path is a genuine state change per our classification.
  assert.ok([...get.calledNames].some((n) => STATE_CHANGING_CALLS.has(n)), "inbox GET has no state-changing call")
})

test("KNOWN GAP PIN: GET-only handlers do not call rate limiting today", () => {
  // Adding rate limiting to GET routes is an intended reliability change
  // (AUD-006 / #180); this pin makes its arrival explicit and deliberate.
  for (const route of GET_ONLY_ROUTES) {
    const get = handler(route, "GET")
    assert.ok(
      !get.calledNames.has("checkRateLimit"),
      `${route} GET gained rate limiting — intended? Update this characterization pin in the same PR.`,
    )
  }
})
