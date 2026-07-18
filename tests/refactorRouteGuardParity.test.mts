/**
 * Route guard-parity characterization (Refactor Program).
 *
 * Captures the CURRENT guard surface of every API route so any change during
 * the refactor is deliberate, not accidental (Phase 16 rule 1):
 *
 *   - every state-changing (POST) route wires session + CSRF + rate limit;
 *   - every GET route wires session verification;
 *   - the inbox GET's write side effects (Issue #156) are pinned as KNOWN
 *     current behavior — when #156 is fixed, flip that assertion in the same PR.
 *
 * These assertions are structural (call-site presence in the route module),
 * complementing the behavioral suites that already exercise the guards.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8")

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

test("every POST route wires session, CSRF, rate limit, and bounded body parsing", () => {
  for (const route of POST_ROUTES) {
    const src = read(route)
    for (const guard of ["requireSession", "validateCsrfOrigin", "checkRateLimit", "readBoundedJsonObject"]) {
      assert.ok(src.includes(guard), `${route} lost guard ${guard}`)
    }
  }
})

test("every GET route wires session verification and the runtime config authority", () => {
  for (const route of [...GET_ONLY_ROUTES, "app/api/workunit/tools/route.ts"]) {
    const src = read(route)
    assert.ok(src.includes("requireSession"), `${route} lost requireSession`)
    assert.ok(
      src.includes("resolveValidatedRequestRuntimeConfig"),
      `${route} no longer resolves the validated runtime config`,
    )
  }
})

test("KNOWN DEFECT PIN (#156): inbox GET currently performs writes", () => {
  // Characterization, not endorsement: GET /api/workunit/inbox upserts
  // WorkUnits and appends usage/audit rows today. The fix for Issue #156 must
  // change THIS assertion in the same PR, proving the behavior change was
  // deliberate and reviewed.
  const src = read("app/api/workunit/inbox/route.ts")
  assert.ok(src.includes("repository.upsert"), "inbox GET no longer upserts — if #156 was fixed, update this pin")
  assert.ok(src.includes("usage.recordEvent"), "inbox GET no longer records usage — if #156 was fixed, update this pin")
})

test("KNOWN GAP PIN: GET routes have no rate limiting today", () => {
  // Risk-register R-10/AUD-006 context: adding rate limiting to GET routes is
  // an intended reliability change; this pin makes its arrival explicit.
  for (const route of GET_ONLY_ROUTES) {
    const src = read(route)
    assert.ok(
      !src.includes("checkRateLimit"),
      `${route} gained rate limiting — intended? Update this characterization pin in the same PR.`,
    )
  }
})
