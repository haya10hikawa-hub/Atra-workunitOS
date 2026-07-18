/**
 * Architecture dependency-direction guards (Refactor Program, ADR-0002).
 *
 * Locks the layering rules from docs/refactor/TARGET_ARCHITECTURE.md as
 * executable tests over the REAL TypeScript AST dependency graph
 * (tests/helpers/refactorSourceGraph.mts). Because the graph classifies every
 * dependency form — static/type-only/side-effect import, export-from,
 * export-star, literal dynamic import, import-equals, literal require, and
 * non-literal dynamic — a bare provider package or Node builtin can no longer
 * slip past the gate by not matching a relative-path regex.
 *
 *   1. Domain (`app/lib/domain/**`) imports ONLY domain + tenant modules and
 *      never reads `process.env`.
 *   2. Application (`app/lib/application/**`) takes no third-party/Node-builtin
 *      dependency and no VALUE dependency on infrastructure / persistence /
 *      provider sources / the runtime env authority — except an EXACT,
 *      shrink-only edge-exception allowlist.
 *
 * These are ratchets: they characterize the boundary on the program base
 * (origin/main @ 2669f2ea) and fail when a NEW violation appears.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {
  appRoot,
  listSourceFiles,
  parseModuleEdges,
  classifyDomainEdge,
  classifyApplicationEdge,
  APPLICATION_EDGE_EXCEPTIONS,
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

test("domain modules never read process.env", () => {
  const domainDir = path.join(appRoot, "lib", "domain")
  const offenders = listSourceFiles(domainDir)
    .filter((f) => fs.readFileSync(f, "utf8").includes("process.env"))
    .map(rel)
  assert.deepEqual(offenders, [])
})

// ─── 2. Application → infrastructure / env ratchet ──────────────

// EXACT edge-level exceptions live in the helper (APPLICATION_EDGE_EXCEPTIONS):
// each is a pre-existing VALUE edge tracked for removal, authorizing ONLY its
// one source→target pair — it does NOT license any other import from that file.

test("application modules take no forbidden dependency beyond the exact allowlist", () => {
  const applicationDir = path.join(appRoot, "lib", "application")
  const violations: string[] = []
  for (const file of listSourceFiles(applicationDir)) {
    for (const edge of parseModuleEdges(file)) {
      const verdict = classifyApplicationEdge(edge, APPLICATION_EDGE_EXCEPTIONS)
      if (!verdict.ok) {
        violations.push(`${rel(file)} [${edge.edgeKind}${edge.isTypeOnly ? "/type" : ""}] → ${edge.specifier ?? "<non-literal>"} : ${verdict.reason}`)
      }
    }
  }
  assert.deepEqual(violations, [], `application layer gained forbidden dependencies:\n${violations.join("\n")}`)
})

test("every application edge-exception still exists and is still exercised (ratchet hygiene)", () => {
  for (const exc of APPLICATION_EDGE_EXCEPTIONS) {
    assert.ok(fs.existsSync(path.join(appRoot, "..", exc.source)), `exception source ${exc.source} no longer exists — remove it`)
    assert.ok(fs.existsSync(path.join(appRoot, "..", exc.target)), `exception target ${exc.target} no longer exists — remove it`)
    // The tolerated edge must actually be present; a stale exception must be deleted.
    const edges = parseModuleEdges(path.join(appRoot, "..", exc.source))
    const present = edges.some((e) => e.resolvedTarget && rel(e.resolvedTarget) === exc.target && !e.isTypeOnly)
    assert.ok(present, `exception ${exc.source} → ${exc.target} is stale (edge gone) — remove it`)
  }
})
