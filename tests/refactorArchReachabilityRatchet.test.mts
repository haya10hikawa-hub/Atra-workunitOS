/**
 * Runtime-reachability ratchet (Refactor Program; Issue #137 quantification).
 *
 * Uses the shared AST dependency graph (tests/helpers/refactorSourceGraph.mts)
 * for BOTH runtime and test reachability, so every runtime dependency form is
 * followed (static/side-effect import, export-from, export-star, literal
 * dynamic import, import-equals, literal require) and type-only edges are
 * EXCLUDED — a module reached only through `import type` is never loaded at
 * runtime and is correctly counted as unreachable here.
 *
 * On the program base (origin/main @ 2669f2ea) the AST graph yielded, over the
 * app/** tree (368 files): 165 runtime-reachable, 203 runtime-unreachable,
 * of which 115 are test-only and 88 are fully orphaned. (These differ from the
 * earlier regex measurement, which wrongly followed type-only edges as runtime
 * dependencies and thus under-counted dead runtime code.)
 *
 * WS1-PR2 added a new DOMAIN PORT (`app/lib/domain/ports/sessionAuthority.ts`) —
 * a pure interface/type module with NO runtime footprint (it emits nothing), so
 * it is inherently orphaned by this value-edge metric. The GLOBAL ceilings are
 * NOT raised for it (raising them would also silently tolerate real dead runtime
 * code). Instead it is removed by an EXACT, VALIDATED type-contract exemption
 * (`KNOWN_TYPE_ONLY_CONTRACT_MODULES` + `validateTypeContractExemptions`): each
 * exempted path is proven to exist, be imported by ≥1 production module through a
 * type-only edge, and carry no value import/export, runtime declaration, or side
 * effect. A stale entry or a module converted into runtime code FAILS validation,
 * so the exemption can never mask a regression. The other three WS1-PR2 modules
 * (role, adapter, composition root) are all runtime-reachable.
 *
 * Ceilings: base 203/88 preserved; LOWER them as cleanup lands. Never raise them.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  appRoot,
  listSourceFiles,
  reachableFrom,
  discoverRuntimeEntryPoints,
  knownEntryPointsMissing,
  KNOWN_RUNTIME_ENTRY_POINTS,
  repoRoot,
  rel,
  abs,
  validateTypeContractExemptions,
} from "./helpers/refactorSourceGraph.mts"
import path from "node:path"

// Base 2669f2ea: 203 / 88. These GLOBAL ceilings are NEVER raised — a genuine new
// pure type-contract module is removed via an exact validated exemption, not a
// ceiling bump. Only LOWER these as dead code is cleaned up.
const MAX_RUNTIME_UNREACHABLE = 203
const MAX_FULLY_ORPHANED = 88

// EXACT type-contract modules exempted from the reachability counts. Each entry is
// an exact repo-relative FILE path (never a directory or glob) that is validated —
// pure types only, with a live production type-only importer — before removal.
const KNOWN_TYPE_ONLY_CONTRACT_MODULES = [
  "app/lib/domain/ports/sessionAuthority.ts",
] as const

test("runtime-unreachable app code does not grow (ratchet, AST value-edge graph)", () => {
  const allAppFiles = listSourceFiles(appRoot)
  const runtimeReachable = reachableFrom(discoverRuntimeEntryPoints(), { runtimeOnly: true })
  const testReachable = reachableFrom(listSourceFiles(path.join(repoRoot, "tests")), { runtimeOnly: true })

  // Validate the exact type-contract exemptions BEFORE using them. A stale entry
  // or one converted into runtime code is rejected here, failing the ratchet
  // rather than silently absorbing a regression.
  const { validated, rejections } = validateTypeContractExemptions(KNOWN_TYPE_ONLY_CONTRACT_MODULES)
  assert.deepEqual(
    rejections,
    [],
    `type-contract exemption(s) stale or converted to runtime code: ${JSON.stringify(rejections)}`,
  )

  const runtimeUnreachable = allAppFiles.filter((f) => !runtimeReachable.has(f))
  const fullyOrphaned = runtimeUnreachable.filter((f) => !testReachable.has(f))

  // Remove ONLY the validated exact type-contract modules, then compare against the
  // original 203/88 ceilings.
  const runtimeUnreachableNet = runtimeUnreachable.filter((f) => !validated.has(f))
  const fullyOrphanedNet = fullyOrphaned.filter((f) => !validated.has(f))

  assert.ok(
    runtimeUnreachableNet.length <= MAX_RUNTIME_UNREACHABLE,
    `runtime-unreachable app files grew to ${runtimeUnreachableNet.length} > ${MAX_RUNTIME_UNREACHABLE} ` +
      `(after ${validated.size} validated type-contract exemption(s)). ` +
      "Wire new code to a runtime entry point, or lower the ceiling if this is cleanup.",
  )
  assert.ok(
    fullyOrphanedNet.length <= MAX_FULLY_ORPHANED,
    `fully-orphaned app files grew to ${fullyOrphanedNet.length} > ${MAX_FULLY_ORPHANED} ` +
      `(after ${validated.size} validated type-contract exemption(s)).`,
  )
})

test("the type-contract exemption is EXACT: an unrelated dead runtime file still fails 203/88", () => {
  const allAppFiles = listSourceFiles(appRoot)
  const runtimeReachable = reachableFrom(discoverRuntimeEntryPoints(), { runtimeOnly: true })
  const testReachable = reachableFrom(listSourceFiles(path.join(repoRoot, "tests")), { runtimeOnly: true })
  const { validated } = validateTypeContractExemptions(KNOWN_TYPE_ONLY_CONTRACT_MODULES)

  const runtimeUnreachable = allAppFiles.filter((f) => !runtimeReachable.has(f))
  const fullyOrphaned = runtimeUnreachable.filter((f) => !testReachable.has(f))
  const baselineOrphanNet = fullyOrphaned.filter((f) => !validated.has(f)).length
  assert.equal(baselineOrphanNet, MAX_FULLY_ORPHANED, "exemption should net exactly the 88 baseline, not more")

  // A hypothetical SECOND dead runtime file (not a validated type contract) must NOT
  // be absorbed by the exemption — the 88 ceiling still binds.
  const hypotheticalDead = abs("app/lib/__unrelated_dead_runtime__.ts")
  assert.equal(validated.has(hypotheticalDead), false, "an arbitrary dead file must never be exempted")
  const withExtraDead = [...fullyOrphaned, hypotheticalDead].filter((f) => !validated.has(f)).length
  assert.equal(withExtraDead, baselineOrphanNet + 1)
  assert.ok(
    withExtraDead > MAX_FULLY_ORPHANED,
    "a second unrelated dead file must push the net count past the 88 ceiling (exemption is exact, not a blanket raise)",
  )
})

test("deterministic entry inventory: every KNOWN route + page/layout exists (deletion detector)", () => {
  const missing = knownEntryPointsMissing(KNOWN_RUNTIME_ENTRY_POINTS)
  assert.deepEqual(missing, [], `known runtime entry points were removed: ${missing.join(", ")}`)
  // Discovery must find AT LEAST the known set (new routes may add more).
  const discovered = new Set(discoverRuntimeEntryPoints().map(rel))
  const notDiscovered = KNOWN_RUNTIME_ENTRY_POINTS.filter((r) => !discovered.has(r))
  assert.deepEqual(notDiscovered, [], `known entry points not discovered by the walker: ${notDiscovered.join(", ")}`)
})

test("known API routes are actually runtime-reachable from the entry graph", () => {
  const reachable = reachableFrom(discoverRuntimeEntryPoints(), { runtimeOnly: true })
  const reachableRel = new Set([...reachable].map(rel))
  const unreachableKnown = KNOWN_RUNTIME_ENTRY_POINTS.filter((r) => !reachableRel.has(r))
  assert.deepEqual(unreachableKnown, [], `known entry points not in the reachable set: ${unreachableKnown.join(", ")}`)
})
