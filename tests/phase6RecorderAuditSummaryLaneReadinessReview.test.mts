/**
 * P6-I5P: static, read-only tests pinning the Phase 6 Recorder Audit Summary
 * Lane Readiness Review and its explicit human Go record.
 *
 * These tests ONLY read the two P6-I5P documents and check that the previously
 * merged lane artifacts (P6-I5K..P6-I5O) exist on disk. They import no app
 * code, no harness, no fixture; they call no network, no GitHub API, no
 * child_process, no ApprovalStore, no D1, no SQL, no LLM; they append no
 * Evidence Ledger and write no Graph Model; they mutate no files and require
 * no secrets. They inspect documentation, not runtime behavior. To avoid
 * self-match traps, the tests never scan their own source — every assertion
 * targets a document's contents with exact required phrases and anchored
 * section headings, or a file's existence.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

function abs(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url))
}

function read(rel: string): string {
  return readFileSync(abs(rel), "utf8")
}

function requireAll(doc: string, label: string, needles: readonly string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: <<<${needle}>>>`)
  }
}

const GO = "../docs/P6_I5P_EXPLICIT_HUMAN_GO.md"
const REVIEW = "../docs/P6_I5P_RECORDER_AUDIT_SUMMARY_LANE_READINESS_REVIEW.md"

// ─── Files exist ────────────────────────────────────────────────

test("P6-I5P review doc and explicit human Go doc exist", () => {
  for (const rel of [GO, REVIEW]) {
    assert.ok(existsSync(abs(rel)), `${rel} must exist`)
  }
})

// ─── Review doc: 22 required sections ───────────────────────────

test("readiness review contains all 22 required sections", () => {
  requireAll(read(REVIEW), "REVIEW sections", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Completed Artifact Map\n",
    "## 4. P6-I5K Spec Summary\n",
    "## 5. P6-I5L Types and Validators Summary\n",
    "## 6. P6-I5M Constructors Summary\n",
    "## 7. P6-I5N Fixtures Summary\n",
    "## 8. P6-I5O Harness Summary\n",
    "## 9. Boundary Matrix\n",
    "## 10. Non-authorization Matrix\n",
    "## 11. What Is Proven\n",
    "## 12. What Is Not Proven\n",
    "## 13. Forbidden Runtime Escalations\n",
    "## 14. Remaining Risks\n",
    "## 15. Required Gates Before Future Runtime / Emission / Linkage Work\n",
    "## 16. StartHub Boundary Reminder\n",
    "## 17. D1 / SQL Boundary Reminder\n",
    "## 18. Evidence Ledger / Graph Model Boundary Reminder\n",
    "## 19. ApprovalStore / External Action Boundary Reminder\n",
    "## 20. Recommended Next Safe Options\n",
    "## 21. Go / No-Go Criteria\n",
    "## 22. Validation Commands\n",
  ])
})

// ─── Review doc: lane loops are named ───────────────────────────

test("readiness review names P6-I5K through P6-I5O and their PRs", () => {
  requireAll(read(REVIEW), "REVIEW loop names", [
    "P6-I5K",
    "P6-I5L",
    "P6-I5M",
    "P6-I5N",
    "P6-I5O",
    "PR #105",
    "PR #106",
    "PR #107",
    "PR #108",
    "PR #109",
  ])
})

// ─── Review doc: all expected artifact paths mentioned ──────────

const LANE_ARTIFACT_PATHS = [
  "docs/P6_I5K_EXPLICIT_HUMAN_GO.md",
  "docs/P6_I5K_RECORDER_AUDIT_SUMMARY_SPEC.md",
  "docs/P6_I5K_RECORDER_AUDIT_SUMMARY_CONTRACT.md",
  "tests/phase6RecorderAuditSummarySpec.test.mts",
  "docs/P6_I5L_EXPLICIT_HUMAN_GO.md",
  "docs/P6_I5L_RECORDER_AUDIT_SUMMARY_TYPES_VALIDATORS.md",
  "app/lib/phase6/recorderAuditSummary/types.ts",
  "app/lib/phase6/recorderAuditSummary/validators.ts",
  "app/lib/phase6/recorderAuditSummary/index.ts",
  "tests/phase6RecorderAuditSummaryValidators.test.mts",
  "docs/P6_I5M_EXPLICIT_HUMAN_GO.md",
  "docs/P6_I5M_PURE_RECORDER_AUDIT_SUMMARY_CONSTRUCTORS.md",
  "app/lib/phase6/recorderAuditSummary/construction.ts",
  "app/lib/phase6/recorderAuditSummary/constructors.ts",
  "tests/phase6RecorderAuditSummaryConstructors.test.mts",
  "docs/P6_I5N_EXPLICIT_HUMAN_GO.md",
  "docs/P6_I5N_TEST_ONLY_RECORDER_AUDIT_SUMMARY_FIXTURE.md",
  "tests/fixtures/phase6/recorderAuditSummaryFixture.mts",
  "tests/phase6RecorderAuditSummaryFixture.test.mts",
  "docs/P6_I5O_EXPLICIT_HUMAN_GO.md",
  "docs/P6_I5O_TEST_ONLY_RECORDER_AUDIT_SUMMARY_HARNESS.md",
  "tests/harness/phase6/recorderAuditSummaryHarness.mts",
  "tests/phase6RecorderAuditSummaryHarness.test.mts",
]

test("readiness review mentions every lane artifact path", () => {
  requireAll(read(REVIEW), "REVIEW artifact paths", LANE_ARTIFACT_PATHS)
})

test("every lane artifact exists on disk", () => {
  for (const rel of LANE_ARTIFACT_PATHS) {
    assert.ok(existsSync(abs(`../${rel}`)), `${rel} must exist on disk`)
  }
})

// ─── Review doc: matrices and lists ─────────────────────────────

test("boundary matrix exists with per-loop boundary rows", () => {
  requireAll(read(REVIEW), "REVIEW boundary matrix", [
    "| Boundary | P6-I5K | P6-I5L | P6-I5M | P6-I5N | P6-I5O |",
    "| No summary runtime |",
    "| No persistence / durable storage |",
    "| No D1 / SQL |",
    "| No Evidence Ledger append |",
    "| No Graph Model write |",
    "| No ApprovalStore / P7.1 TSP wiring |",
    "| No StartHub runtime |",
    "| Target fixed to `in_memory_test_only_store` |",
    "| Explicit human Go before code |",
  ])
})

test("non-authorization matrix exists with per-artifact rows", () => {
  requireAll(read(REVIEW), "REVIEW non-authorization matrix", [
    "| Artifact success means | Is truth? | Is approval? | Is execution permission? | Is summary runtime? | Is persistence? | Is production readiness? |",
    "| Spec test PASS (I5K) | No | No | No | No | No | No |",
    "| Validation PASS (I5L) | No | No | No | No | No | No |",
    "| Constructor success (I5M) | No | No | No | No | No | No |",
    "| Fixture validity (I5N) | No | No | No | No | No | No |",
    "| Harness success (I5O) | No | No | No | No | No | No |",
    "| Readiness review PASS (I5P) | No | No | No | No | No | No |",
  ])
})

test("forbidden runtime escalations are listed", () => {
  requireAll(read(REVIEW), "REVIEW forbidden escalations", [
    "- recorder summary runtime\n",
    "- summary emitter\n",
    "- audit runtime\n",
    "- audit event emitter\n",
    "- real persistence\n",
    "- durable storage\n",
    "- repository implementation\n",
    "- production adapter\n",
    "- database schema\n",
    "- D1 binding\n",
    "- D1 migration\n",
    "- D1 access\n",
    "- SQL execution\n",
    "- SQL mutation\n",
    "- Evidence Ledger append\n",
    "- Graph Model write\n",
    "- ApprovalStore integration\n",
    "- P7.1 TSP wiring\n",
    "- StartHub runtime\n",
    "- external action execution\n",
    "- Formal WorkUnit promotion\n",
    "- product runtime pipeline\n",
  ])
})

test("next safe options are listed and none is self-authorizing", () => {
  requireAll(read(REVIEW), "REVIEW next safe options", [
    "- Option A:",
    "- Option B:",
    "- Option C:",
    "- Option D:",
    "- Option E:",
    "requiring its own explicit human Go",
    "authorizes",
    "none of them by itself",
  ])
})

// ─── Review doc: required gate language ─────────────────────────

test("required gate language exists before future runtime/emission/linkage work", () => {
  requireAll(read(REVIEW), "REVIEW gates", [
    "Required Gates Before Future Runtime / Emission / Linkage Work",
    "A new explicit human Go document recorded before any code.",
    "A dedicated, separately gated loop",
    "This review does not grant any of these gates.",
    "D1 read-only execution gate",
    "a separate ledger/graph gate",
    "the P7 security lane gates",
  ])
})

// ─── Review doc: non-authorization statements ───────────────────

test("readiness review states its own non-authorization boundary", () => {
  // Whitespace-normalized matching so hard-wrapped prose still pins the exact
  // sentences regardless of line-break positions.
  const normalized = read(REVIEW).replace(/\s+/g, " ")
  const statements = [
    "It is not runtime permission.",
    "It is not production readiness.",
    "It is not persistence readiness.",
    "It is not approval.",
    "It is not execution permission.",
    "It does not append Evidence Ledger.",
    "It does not write Graph Model.",
    "It does not wire ApprovalStore.",
    "It does not implement StartHub runtime.",
    "It does not execute external actions.",
    "It does not promote Formal WorkUnits.",
    "Consolidation PASS is not authorization to implement persistence.",
  ]
  for (const needle of statements) {
    assert.ok(normalized.includes(needle), `REVIEW must contain: <<<${needle}>>>`)
  }
})

// ─── Go doc: sign-off content ───────────────────────────────────

test("explicit human Go records the docs-only scope and non-authorization boundary", () => {
  requireAll(read(GO), "GO statements", [
    "- P6-I5P has explicit human Go.",
    "- This task is docs-only + static-test.",
    "- The task will create only the three allowed files.",
    "- The task will not modify `app/`.",
    "- Readiness Review is not runtime permission.",
    "- Readiness Review is not production readiness.",
    "- Readiness Review is not persistence readiness.",
    "- Readiness Review is not approval.",
    "- Readiness Review is not execution permission.",
    "- Consolidation PASS is not authorization to implement persistence.",
    "AI proposes. Rules guard. Humans decide.",
  ])
})

// ─── Review doc: no capability claims ───────────────────────────

test("readiness review never claims a forbidden capability was implemented", () => {
  const doc = read(REVIEW)
  const forbiddenClaims = [
    "summary runtime is implemented",
    "summary emitter is implemented",
    "audit runtime is implemented",
    "persistence is implemented",
    "durable storage is implemented",
    "production ready",
    "production-ready",
    "approved for execution",
    "grants execution permission",
    "Evidence Ledger was appended",
    "Graph Model was written",
    "ApprovalStore is wired",
    "StartHub runtime is implemented",
  ]
  for (const claim of forbiddenClaims) {
    assert.ok(!doc.includes(claim), `REVIEW must not claim: <<<${claim}>>>`)
  }
})

// ─── Both-ways sanity (no self-match trap) ──────────────────────

test("assertions are behavioral, not self-matching", () => {
  const doc = read(REVIEW)
  assert.ok(doc.includes("## 3. Completed Artifact Map\n"))
  assert.ok(!doc.includes("## 99. Nonexistent Section\n"))
  assert.ok(!read(GO).includes("## 99. Nonexistent Section\n"))
})
