/**
 * Route inventory + direct guard characterization (Refactor Program).
 *
 * SCOPE (deliberately narrow — see PR body): these are static tests. They prove
 * a route INVENTORY and DIRECT structural characterization only:
 *   - the exact set of route files and, per file, the exact set of exported HTTP
 *     methods and their export FORM;
 *   - for statically analyzable handlers, that each canonical guard is CALLED
 *     DIRECTLY in the handler body, by canonical import identity.
 *
 * They do NOT prove runtime guard dominance across arbitrary control flow, nor
 * that effects performed by imported application services are guarded. Export
 * forms that bind the handler indirectly (aliased export, re-export, wrapper
 * const) are reported and FAIL CLOSED — they are not claimed covered. Runtime
 * enforcement is tracked in the canonical-secured-route Issue #185.
 *
 * Coverage is asserted PER ROUTE FILE against a pinned inventory — never by an
 * aggregate count, which can mask a per-route regression.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  analyzeRouteFile,
  routeInventory,
  discoverRouteFiles,
  inboxWritePath,
  abs,
  rel,
  REQUIRED_POST_GUARDS,
  REQUIRED_GET_GUARDS,
} from "./helpers/refactorSourceGraph.mts"

// Pinned per-route method inventory on the program base. A NEW route file, a
// removed route, or a changed method set fails the exact per-route assertions
// below (no aggregate count is used as proof).
const KNOWN_ROUTE_METHODS: Readonly<Record<string, readonly string[]>> = {
  "app/api/audit/recent/route.ts": ["GET"],
  "app/api/integrations/status/route.ts": ["GET"],
  "app/api/workunit/inbox/route.ts": ["GET"],
  "app/api/workunit/tools/route.ts": ["GET", "POST"],
  "app/api/workunit/[id]/action-preview/route.ts": ["POST"],
  "app/api/workunit/[id]/approval/route.ts": ["GET", "POST"],
  "app/api/workunit/[id]/approval/status/route.ts": ["GET"],
  "app/api/workunit/[id]/execution/dry-run/route.ts": ["POST"],
  "app/api/workunit/[id]/feedback/route.ts": ["POST"],
}

test("discovered route files exactly match the pinned inventory (per-file, not counted)", () => {
  const discovered = discoverRouteFiles().map(rel).sort()
  const pinned = Object.keys(KNOWN_ROUTE_METHODS).sort()
  assert.deepEqual(discovered, pinned, "route file set changed — add/remove the route in KNOWN_ROUTE_METHODS and its guard pin")
})

test("each route file's recognized HTTP methods match its pin", () => {
  for (const [file, methods] of Object.entries(KNOWN_ROUTE_METHODS)) {
    const report = analyzeRouteFile(abs(file))
    assert.deepEqual(report.recognizedMethods, [...methods].sort(), `${file} method set changed`)
  }
})

test("no current route file has zero recognized methods (explicit per-file result)", () => {
  for (const report of routeInventory(discoverRouteFiles())) {
    assert.equal(report.hasZeroRecognizedMethods, false, `${report.file} exports no recognized HTTP method`)
  }
})

test("no current route uses an indeterminate export form (fail closed on aliased/reexport/wrapper)", () => {
  for (const report of routeInventory(discoverRouteFiles())) {
    assert.deepEqual(
      report.indeterminateForms,
      [],
      `${report.file} uses an export form that cannot be statically characterized (${report.indeterminateForms.join(", ")}) — ` +
        "convert to a direct handler or enforce guards at runtime per the canonical-secured-route Issue",
    )
  }
})

test("DIRECT characterization (not dominance): every analyzable handler calls its canonical guards", () => {
  for (const report of routeInventory(discoverRouteFiles())) {
    for (const m of report.methodExports) {
      assert.ok(m.analyzable, `${report.file} ${m.method} is not analyzable (${m.form})`)
      const required = m.method === "POST" ? REQUIRED_POST_GUARDS : m.method === "GET" ? REQUIRED_GET_GUARDS : []
      const missing = required.filter((g) => !m.directGuards.has(g))
      assert.deepEqual(missing, [], `${report.file} ${m.method} does not directly call: ${missing.join(", ")}`)
    }
  }
})

test("KNOWN DEFECT PIN (#156): the exact current inbox GET write path is present", () => {
  // Exact structural characterization of app/api/workunit/inbox/route.ts — NOT a
  // general effect boundary. The #156 fix (removing the write from GET) must flip
  // these and update this pin in the same PR.
  const wp = inboxWritePath()
  assert.equal(wp.getCallsPersistWorkUnits, true, "inbox GET no longer calls persistWorkUnits — if #156 fixed, update this pin")
  assert.equal(wp.persistWorkUnitsCallsUpsert, true, "persistWorkUnits no longer calls .upsert — if #156 fixed, update this pin")
  assert.equal(wp.getCallsRecordEvent, true, "inbox GET no longer calls usage.recordEvent — if #156 fixed, update this pin")
})

test("KNOWN GAP PIN: GET handlers do not directly call checkRateLimit today", () => {
  for (const report of routeInventory(discoverRouteFiles())) {
    for (const m of report.methodExports.filter((x) => x.method === "GET")) {
      assert.ok(!m.directGuards.has("checkRateLimit"), `${report.file} GET gained rate limiting — intended? update this pin`)
    }
  }
})
