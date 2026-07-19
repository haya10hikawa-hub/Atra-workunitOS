/**
 * Architecture dependency-direction guards (Refactor Program, ADR-0002).
 *
 * Locks the layering rules from docs/refactor/TARGET_ARCHITECTURE.md as
 * executable tests over the REAL TypeScript AST dependency graph
 * (tests/helpers/refactorSourceGraph.mts), which classifies every dependency
 * form with correct import/export type-only semantics and resolves specifiers
 * through the repository's actual tsconfig.
 *
 *   1. Domain (`app/lib/domain/**`) depends only on domain + tenant and never
 *      references the Node `process` global (AST-checked).
 *   2. Application (`app/lib/application/**`) depends only on domain / application
 *      / tenant, OR through an EXACT edge exception — VALUE edges via
 *      APPLICATION_VALUE_EXCEPTIONS, TYPE-ONLY edges via
 *      APPLICATION_TYPEONLY_EXCEPTIONS. A type-only import of an infrastructure
 *      or persistence IMPLEMENTATION is a violation.
 */

import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import {
  appRoot,
  listSourceFiles,
  parseModuleEdges,
  classifyDomainEdge,
  classifyApplicationEdge,
  APPLICATION_VALUE_EXCEPTIONS,
  APPLICATION_TYPEONLY_EXCEPTIONS,
  processSymbolReferences,
  rel,
} from "./helpers/refactorSourceGraph.mts"

// ─── 1. Domain purity ───────────────────────────────────────────

test("domain modules depend only on domain + tenant (all dependency forms)", () => {
  const domainDir = path.join(appRoot, "lib", "domain")
  const violations: string[] = []
  for (const file of listSourceFiles(domainDir)) {
    for (const edge of parseModuleEdges(file)) {
      const verdict = classifyDomainEdge(edge)
      if (!verdict.ok) violations.push(`${rel(file)} [${edge.edgeKind}] → ${edge.specifier ?? "<non-literal>"} : ${verdict.reason}`)
    }
  }
  assert.deepEqual(violations, [], `domain layer gained forbidden dependencies:\n${violations.join("\n")}`)
})

test("domain modules never reference the Node process global (AST)", () => {
  const domainDir = path.join(appRoot, "lib", "domain")
  const offenders = listSourceFiles(domainDir)
    .filter((f) => processSymbolReferences(f) > 0)
    .map(rel)
  assert.deepEqual(offenders, [])
})

// ─── 2. Application → boundary ratchet ──────────────────────────

test("application modules take no forbidden dependency beyond the exact allowlists", () => {
  const applicationDir = path.join(appRoot, "lib", "application")
  const violations: string[] = []
  for (const file of listSourceFiles(applicationDir)) {
    for (const edge of parseModuleEdges(file)) {
      const verdict = classifyApplicationEdge(edge)
      if (!verdict.ok) {
        violations.push(`${rel(file)} [${edge.edgeKind}${edge.isTypeOnly ? "/type" : ""}] → ${edge.specifier ?? "<non-literal>"} : ${verdict.reason}`)
      }
    }
  }
  assert.deepEqual(violations, [], `application layer gained forbidden dependencies:\n${violations.join("\n")}`)
})

test("every application edge-exception is exact (source+target+edgeKind+modality) and still exercised", () => {
  const check = (exc: (typeof APPLICATION_VALUE_EXCEPTIONS)[number]) => {
    // The tolerated edge must actually be present with the EXACT edge-kind and modality.
    const edges = parseModuleEdges(path.join(appRoot, "..", exc.source))
    const present = edges.some((e) =>
      e.resolvedTarget && rel(e.resolvedTarget) === exc.target && e.edgeKind === exc.edgeKind && e.isTypeOnly === exc.typeOnly,
    )
    assert.ok(present, `exception ${exc.source} → ${exc.target} (edgeKind=${exc.edgeKind}, typeOnly=${exc.typeOnly}) is stale — remove it`)
  }
  for (const exc of APPLICATION_VALUE_EXCEPTIONS) { assert.equal(exc.typeOnly, false); assert.equal(exc.edgeKind, "static-import"); check(exc) }
  for (const exc of APPLICATION_TYPEONLY_EXCEPTIONS) { assert.equal(exc.typeOnly, true); assert.equal(exc.edgeKind, "type-only-import"); check(exc) }
})
