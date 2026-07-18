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
 * On the program base (origin/main @ 2669f2ea) the AST graph yields, over the
 * app/** tree (368 files): 165 runtime-reachable, 203 runtime-unreachable,
 * of which 115 are test-only and 88 are fully orphaned. (These differ from the
 * earlier regex measurement, which wrongly followed type-only edges as runtime
 * dependencies and thus under-counted dead runtime code.)
 *
 * Ceilings are measured on that base; LOWER them as cleanup lands, never raise.
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
} from "./helpers/refactorSourceGraph.mts"
import path from "node:path"

// Ceilings measured on the rebased root base (2669f2ea). Only ever lower these.
const MAX_RUNTIME_UNREACHABLE = 203
const MAX_FULLY_ORPHANED = 88

test("runtime-unreachable app code does not grow (ratchet, AST value-edge graph)", () => {
  const allAppFiles = listSourceFiles(appRoot)
  const runtimeReachable = reachableFrom(discoverRuntimeEntryPoints(), { runtimeOnly: true })
  const testReachable = reachableFrom(listSourceFiles(path.join(repoRoot, "tests")), { runtimeOnly: true })

  const runtimeUnreachable = allAppFiles.filter((f) => !runtimeReachable.has(f))
  const fullyOrphaned = runtimeUnreachable.filter((f) => !testReachable.has(f))

  assert.ok(
    runtimeUnreachable.length <= MAX_RUNTIME_UNREACHABLE,
    `runtime-unreachable app files grew to ${runtimeUnreachable.length} > ${MAX_RUNTIME_UNREACHABLE}. ` +
      "Wire new code to a runtime entry point, or lower the ceiling if this is cleanup.",
  )
  assert.ok(
    fullyOrphaned.length <= MAX_FULLY_ORPHANED,
    `fully-orphaned app files grew to ${fullyOrphaned.length} > ${MAX_FULLY_ORPHANED}.`,
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
