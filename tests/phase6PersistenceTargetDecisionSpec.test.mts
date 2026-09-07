/**
 * P6-I5A: static, read-only tests pinning the Phase 6 Persistence Target
 * Decision and the Target Decision Record Contract.
 *
 * These tests ONLY read the three P6-I5A documents and assert string contents.
 * They call no P6-I0 validators, no P6-I1 constructors, no P6-I2 fixture, no
 * P6-I3 harness, no P6-I4/P6-I5 tests, no P7.1 utilities, no ApprovalStore, no
 * D1, no SQL, no LLM, no network, no GitHub API, no child_process; they mutate
 * no files and require no secrets. They inspect documentation, not runtime
 * behavior. To avoid self-match traps, the tests never scan their own source —
 * every assertion targets a document's contents with exact required phrases,
 * and the selected target class is checked only from the Decision Summary and
 * Selected Initial Target Class sections so that deferred mentions never count
 * as a selection.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
}

function requireAll(doc: string, label: string, needles: readonly string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: <<<${needle}>>>`)
  }
}

/** Extract the body of a "## <heading>" section up to the next "## " heading. */
function section(doc: string, heading: string): string {
  const marker = `## ${heading}`
  const start = doc.indexOf(marker)
  assert.ok(start >= 0, `section not found: <<<${heading}>>>`)
  const after = start + marker.length
  const nextIdx = doc.indexOf("\n## ", after)
  return doc.slice(after, nextIdx < 0 ? doc.length : nextIdx)
}

const GO = "../docs/legacy/P6_I5A_EXPLICIT_HUMAN_GO.md"
const DECISION = "../docs/legacy/P6_I5A_PERSISTENCE_TARGET_DECISION.md"
const RECORD = "../docs/legacy/P6_I5A_TARGET_DECISION_RECORD_CONTRACT.md"

const SELECTED = "in_memory_test_only_store"
const DEFERRED = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
] as const
const REJECTED = "blocked_target"

// ─── Files exist ────────────────────────────────────────────────

test("P6-I5A documents exist", () => {
  for (const rel of [GO, DECISION, RECORD]) {
    assert.ok(existsSync(fileURLToPath(new URL(rel, import.meta.url))), `${rel} must exist`)
  }
})

// ─── Decision: 22 sections ──────────────────────────────────────

test("Persistence Target Decision contains all 22 required sections", () => {
  requireAll(read(DECISION), "DECISION sections", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Decision Summary\n",
    "## 4. Selected Initial Target Class\n",
    "## 5. Rejected or Deferred Target Classes\n",
    "## 6. Why in_memory_test_only_store Is Selected\n",
    "## 7. Why local_ephemeral_dev_store Is Deferred\n",
    "## 8. Why append_only_audit_candidate_store Is Deferred\n",
    "## 9. Why tenant_scoped_artifact_candidate_store Is Deferred\n",
    "## 10. Why future_d1_store_after_separate_d1_gate Is Deferred\n",
    "## 11. Why blocked_target Is Not Selected\n",
    "## 12. Required Inputs from P6-I5\n",
    "## 13. Safety Properties Required Before P6-I5B\n",
    "## 14. Tenant Boundary\n",
    "## 15. Lineage and Identity Boundary\n",
    "## 16. Redaction and Sensitive Data Boundary\n",
    "## 17. Audit Boundary\n",
    "## 18. D1 and SQL Boundary\n",
    "## 19. ApprovalStore, P7.1 TSP, and External Action Boundary\n",
    "## 20. Future PR Slicing After Target Decision\n",
    "## 21. No-Go Conditions\n",
    "## 22. Non-authorization Statement\n",
  ])
})

// ─── Decision: required sentences ───────────────────────────────

test("Persistence Target Decision contains the required definition and Japanese sentences", () => {
  requireAll(read(DECISION), "DECISION sentences", [
    "P6-I5A selects in_memory_test_only_store as the first Phase 6 persistence target class for future type and validator work, but it does not implement persistence, storage, a repository, a storage adapter, a database schema, D1 access, SQL execution, ApprovalStore integration, external action execution, Formal WorkUnit promotion, or production readiness.",
    "P6-I5A Persistence Target Decisionとは、将来のPhase 6 persistence sliceで最初に扱うtarget classを in_memory_test_only_store に絞るためのdecisionであり、persistence実装・storage実装・repository・storage adapter・database schema・D1アクセス・SQL実行・ApprovalStore連携・external action実行・Formal WorkUnit promotion・production readinessを意味しない。",
  ])
})

// ─── Decision: selects exactly in_memory_test_only_store ────────

test("Persistence Target Decision selects exactly in_memory_test_only_store", () => {
  const doc = read(DECISION)
  const summary = section(doc, "3. Decision Summary\n")
  const selectedClass = section(doc, "4. Selected Initial Target Class\n")

  // The selection sections name the selected class ...
  assert.ok(summary.includes(SELECTED), "Decision Summary must name in_memory_test_only_store")
  assert.ok(
    selectedClass.includes(SELECTED),
    "Selected Initial Target Class must name in_memory_test_only_store",
  )

  // ... and name no other target class as selected (no self-match on deferred mentions).
  for (const other of [...DEFERRED, REJECTED]) {
    assert.ok(
      !summary.includes(other),
      `Decision Summary must not name deferred/rejected class as selected: ${other}`,
    )
    assert.ok(
      !selectedClass.includes(other),
      `Selected Initial Target Class must not name deferred/rejected class: ${other}`,
    )
  }
})

test("Persistence Target Decision does not select future_d1_store_after_separate_d1_gate", () => {
  const doc = read(DECISION)
  const summary = section(doc, "3. Decision Summary\n")
  const selectedClass = section(doc, "4. Selected Initial Target Class\n")
  assert.ok(!summary.includes(DEFERRED[3]), "future_d1 must not be selected in Decision Summary")
  assert.ok(
    !selectedClass.includes(DEFERRED[3]),
    "future_d1 must not be selected in Selected Initial Target Class",
  )
})

test("Persistence Target Decision defers all non-selected target classes and rejects blocked_target", () => {
  const deferSection = section(read(DECISION), "5. Rejected or Deferred Target Classes\n")
  for (const cls of DEFERRED) {
    assert.ok(deferSection.includes(`${cls} — deferred`), `${cls} must be marked deferred`)
  }
  assert.ok(
    deferSection.includes(`${REJECTED} — not selected`),
    "blocked_target must be marked not selected",
  )
})

// ─── Decision: selection rationale ──────────────────────────────

test("Persistence Target Decision contains all required reasons for selecting in_memory_test_only_store", () => {
  requireAll(section(read(DECISION), "6. Why in_memory_test_only_store Is Selected\n"), "SELECT reasons", [
    "safest first target",
    "no filesystem persistence",
    "no database persistence",
    "no D1 binding",
    "no SQL execution",
    "no migrations",
    "no production data",
    "easiest to validate deterministically",
    "compatible with P6-I3 in-memory harness",
    "supports future types and validators without runtime risk",
    "keeps persistence target work separate from D1 and SQL",
  ])
})

test("Persistence Target Decision contains all required deferral reasons for each other target", () => {
  const doc = read(DECISION)
  requireAll(section(doc, "7. Why local_ephemeral_dev_store Is Deferred\n"), "local deferral", [
    "filesystem persistence risk",
    "local state leak risk",
    "cleanup risk",
    "path traversal risk",
    "developer environment variability",
    "requires separate file-system gate",
  ])
  requireAll(section(doc, "8. Why append_only_audit_candidate_store Is Deferred\n"), "audit deferral", [
    "audit semantics must be specified first",
    "append-only behavior requires rollback and compaction decisions",
    "may be confused with Evidence Ledger",
    "requires separate audit evidence gate",
    "must not imply ApprovalStore approval",
  ])
  requireAll(section(doc, "9. Why tenant_scoped_artifact_candidate_store Is Deferred\n"), "tenant deferral", [
    "tenant isolation must be implemented and tested first",
    "read/write separation must be specified first",
    "storage key strategy must be specified first",
    "duplicate handling must be specified first",
    "requires future storage implementation gate",
  ])
  requireAll(section(doc, "10. Why future_d1_store_after_separate_d1_gate Is Deferred\n"), "d1 deferral", [
    "D1 gate is not yet executed",
    "D1 bindings are forbidden in P6-I5A",
    "D1 migrations are forbidden in P6-I5A",
    "SQL execution is forbidden in P6-I5A",
    "SQL mutation is forbidden in P6-I5A",
    "future D1 read-only execution remains P6-I6 or later",
    "D1 persistence requires a separate D1 persistence gate",
  ])
  requireAll(section(doc, "11. Why blocked_target Is Not Selected\n"), "blocked rejection", [
    "blocked_target represents explicit No-Go",
    "blocked_target may appear only when target selection is blocked",
    "blocked_target is not a valid implementation target",
    "blocked_target cannot be used to justify implementation",
  ])
})

// ─── Decision: inputs, safety, boundaries, slicing, no-go ───────

test("Persistence Target Decision contains required inputs from P6-I5", () => {
  requireAll(section(read(DECISION), "12. Required Inputs from P6-I5\n"), "P6-I5 inputs", [
    "Persistence Implementation Gate merged into main",
    "Persistence Gate Record Contract available",
    "allowed future persistence target classes",
    "disallowed persistence targets",
    "persistence readiness criteria",
    "tenant isolation requirements",
    "artifact identity and lineage requirements",
    "schema versioning requirements",
    "serialization and redaction requirements",
    "idempotency and duplicate handling requirements",
    "audit and rollback requirements",
    "D1 and SQL boundary",
    "non-authorization boundary",
  ])
})

test("Persistence Target Decision contains safety properties before P6-I5B", () => {
  requireAll(section(read(DECISION), "13. Safety Properties Required Before P6-I5B\n"), "safety props", [
    "target class selected",
    "target class is non-authorizing",
    "target class is test-only",
    "target class is non-persistent",
    "D1 remains deferred",
    "SQL remains deferred",
    "app runtime remains untouched",
    "ApprovalStore remains unwired",
    "external actions remain blocked",
    "Formal WorkUnit promotion remains blocked",
    "persistence target decision record contract is pinned",
    "static test pins the decision",
  ])
})

test("Persistence Target Decision contains the D1 and SQL boundary", () => {
  requireAll(section(read(DECISION), "18. D1 and SQL Boundary\n"), "D1/SQL boundary", [
    "P6-I5A does not permit D1 access",
    "P6-I5A does not permit D1 bindings",
    "P6-I5A does not permit D1 migrations",
    "P6-I5A does not permit SQL execution",
    "P6-I5A does not permit SQL mutation",
    "future D1 read-only execution remains P6-I6 or later",
    "D1 persistence requires a separate D1 persistence gate",
    "SQL compilation and SQL execution remain separately gated",
  ])
})

test("Persistence Target Decision contains future PR slicing", () => {
  requireAll(section(read(DECISION), "20. Future PR Slicing After Target Decision\n"), "PR slicing", [
    "P6-I5B persistence target decision types and validators only",
    "P6-I5C pure persistence candidate constructors only",
    "P6-I5D test-only persistence fixture",
    "P6-I5E in-memory test-only persistence adapter",
    "P6-I5F persistence audit evidence spec",
    "P6-I6 D1 read-only execution implementation gate or later",
    "no PR may combine target decision with persistence implementation",
    "no PR may combine target decision with D1 execution",
    "no PR may combine target decision with external action execution",
    "no PR may combine target decision with ApprovalStore wiring",
  ])
})

test("Persistence Target Decision contains all No-Go conditions", () => {
  requireAll(section(read(DECISION), "21. No-Go Conditions\n"), "No-Go conditions", [
    "p6_i5_not_merged",
    "missing_foundation_file",
    "missing_explicit_human_go",
    "app_runtime_changed",
    "persistence_implementation_added",
    "storage_implementation_added",
    "repository_added",
    "storage_adapter_added",
    "database_schema_added",
    "d1_binding_added",
    "d1_migration_added",
    "d1_access_added",
    "sql_execution_added",
    "sql_mutation_added",
    "runtime_pipeline_added",
    "product_runtime_wiring_added",
    "approvalstore_integration_added",
    "p7_1_tsp_wiring_added",
    "external_action_execution_added",
    "formal_workunit_promotion_added",
    "selected_target_not_in_memory_test_only_store",
    "multiple_targets_selected",
    "local_ephemeral_dev_store_selected",
    "append_only_audit_candidate_store_selected",
    "tenant_scoped_artifact_candidate_store_selected",
    "future_d1_store_after_separate_d1_gate_selected",
    "blocked_target_selected",
    "d1_gate_bypassed",
    "filesystem_gate_bypassed",
    "audit_evidence_gate_bypassed",
    "tenant_isolation_gate_bypassed",
    "target_decision_treated_as_persistence",
    "target_decision_treated_as_approval",
    "target_decision_treated_as_execution",
    "target_decision_treated_as_production_readiness",
    "ruleset_weakened",
    "validation_failed",
  ])
})

test("Persistence Target Decision contains the non-authorization statement", () => {
  requireAll(read(DECISION), "DECISION non-auth", [
    "This P6-I5A Persistence Target Decision authorizes no persistence implementation, no storage implementation, no repository implementation, no storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.",
  ])
})

// ─── Record contract: 16 sections ───────────────────────────────

test("Target Decision Record Contract contains all 16 required sections", () => {
  requireAll(read(RECORD), "RECORD sections", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Definition of Target Decision Record\n",
    "## 4. What Target Decision Record Is Not\n",
    "## 5. Required Fields\n",
    "## 6. Target Decision Status\n",
    "## 7. Selected Target Class\n",
    "## 8. Deferred Target Classes\n",
    "## 9. Rejected Target Classes\n",
    "## 10. Decision Rationale Fields\n",
    "## 11. Safety Boundary Fields\n",
    "## 12. Dependency Fields\n",
    "## 13. Human Review Fields\n",
    "## 14. Future Slice Fields\n",
    "## 15. Validation Rules\n",
    "## 16. Non-authorization Statement\n",
  ])
})

test("Target Decision Record Contract contains the required definition and Japanese sentences", () => {
  requireAll(read(RECORD), "RECORD sentences", [
    "A Target Decision Record is a future non-authorizing record of which persistence target class has been selected for the next Phase 6 persistence slice.",
    "Target Decision Recordとは、次のPhase 6 persistence sliceで扱うpersistence target classを記録するための非認可recordであり、persistence実行・storage実行・D1アクセス・SQL実行・approval・execution・promotionを意味しない。",
  ])
})

test("Target Decision Record Contract lists all not-record items", () => {
  requireAll(section(read(RECORD), "4. What Target Decision Record Is Not\n"), "not-record", [
    "persistence implementation",
    "storage implementation",
    "database row by itself",
    "repository operation",
    "storage adapter operation",
    "D1 record",
    "SQL result",
    "ledger entry",
    "graph node",
    "graph edge",
    "approval record",
    "execution authorization",
    "Formal WorkUnit promotion",
    "production readiness",
  ])
})

test("Target Decision Record Contract contains all required fields", () => {
  requireAll(section(read(RECORD), "5. Required Fields\n"), "required fields", [
    "target_decision_record_id",
    "tenant_id",
    "target_decision_status",
    "target_decision_outcome",
    "selected_target_class",
    "deferred_target_classes",
    "rejected_target_classes",
    "decision_rationale",
    "p6_i5_dependency_status",
    "storage_gate_dependency_status",
    "persistence_gate_dependency_status",
    "d1_boundary_result",
    "sql_boundary_result",
    "non_authorization_result",
    "human_review_required",
    "reviewed_by_human_at",
    "reviewed_by_human_id",
    "created_at",
    "payload_hash",
    "no_go_flags",
  ])
})

test("Target Decision Record Contract contains all target decision statuses", () => {
  const s = section(read(RECORD), "6. Target Decision Status\n")
  requireAll(s, "statuses", [
    "draft_target_decision_record",
    "target_selected_for_future_types",
    "blocked_no_go",
    "clarification_needed",
    "target_rejected",
    "Target selected for future type and validator work only. It is not persistence implementation.",
  ])
})

test("Target Decision Record Contract contains all target decision outcomes", () => {
  requireAll(section(read(RECORD), "7. Selected Target Class\n"), "outcomes", [
    "pass",
    "warn",
    "fail",
    "no_go",
  ])
})

test("Target Decision Record Contract requires selected_target_class to be exactly in_memory_test_only_store", () => {
  const s = section(read(RECORD), "7. Selected Target Class\n")
  assert.ok(
    s.includes("selected_target_class must be exactly:"),
    "must require exact selected_target_class",
  )
  assert.ok(s.includes(SELECTED), "must name in_memory_test_only_store")
  assert.ok(
    s.includes("Any other selected_target_class is No-Go for P6-I5A."),
    "must state any other class is No-Go",
  )
})

test("Target Decision Record Contract contains all deferred target classes", () => {
  requireAll(section(read(RECORD), "8. Deferred Target Classes\n"), "deferred classes", [...DEFERRED])
})

test("Target Decision Record Contract contains blocked_target as rejected", () => {
  assert.ok(
    section(read(RECORD), "9. Rejected Target Classes\n").includes(REJECTED),
    "blocked_target must be listed as rejected",
  )
})

test("Target Decision Record Contract contains decision rationale fields", () => {
  requireAll(section(read(RECORD), "10. Decision Rationale Fields\n"), "rationale fields", [
    "selected_target_rationale",
    "deferred_target_rationales",
    "rejected_target_rationales",
    "d1_deferral_rationale",
    "sql_deferral_rationale",
    "approvalstore_deferral_rationale",
    "external_action_deferral_rationale",
  ])
})

test("Target Decision Record Contract contains safety boundary fields", () => {
  requireAll(section(read(RECORD), "11. Safety Boundary Fields\n"), "safety boundary fields", [
    "test_only_confirmed",
    "non_persistent_confirmed",
    "non_authorizing_confirmed",
    "app_runtime_untouched_confirmed",
    "d1_deferred_confirmed",
    "sql_deferred_confirmed",
    "approvalstore_unwired_confirmed",
    "external_actions_blocked_confirmed",
    "formal_workunit_promotion_blocked_confirmed",
  ])
})

test("Target Decision Record Contract contains dependency fields", () => {
  requireAll(section(read(RECORD), "12. Dependency Fields\n"), "dependency fields", [
    "p6_i5_merged",
    "p6_i5_merge_commit",
    "storage_gate_spec_available",
    "persistence_gate_spec_available",
    "persistence_record_contract_available",
    "main_safety_gate_active",
  ])
})

test("Target Decision Record Contract contains human review fields", () => {
  requireAll(section(read(RECORD), "13. Human Review Fields\n"), "human review fields", [
    "human_review_required",
    "reviewed_by_human_id",
    "reviewed_by_human_at",
    "reviewer_role",
    "review_rationale",
  ])
})

test("Target Decision Record Contract contains future slice fields", () => {
  requireAll(section(read(RECORD), "14. Future Slice Fields\n"), "future slice fields", [
    "next_slice",
    "next_slice_scope",
    "forbidden_next_slice_capabilities",
    "d1_gate_requirement",
    "external_action_gate_requirement",
    "approvalstore_gate_requirement",
  ])
})

test("Target Decision Record Contract contains validation rules", () => {
  requireAll(section(read(RECORD), "15. Validation Rules\n"), "validation rules", [
    "missing selected_target_class is No-Go",
    "selected_target_class other than in_memory_test_only_store is No-Go",
    "multiple selected targets is No-Go",
    "missing deferred target classes is No-Go",
    "future_d1_store_after_separate_d1_gate selected before D1 gate is No-Go",
    "local_ephemeral_dev_store selected before filesystem gate is No-Go",
    "append_only_audit_candidate_store selected before audit evidence gate is No-Go",
    "tenant_scoped_artifact_candidate_store selected before tenant isolation implementation gate is No-Go",
    "blocked_target selected as implementation target is No-Go",
    "missing human review is No-Go",
    "target_selected_for_future_types cannot be used as persistence permission",
    "target_selected_for_future_types cannot be used as approval",
    "target_selected_for_future_types cannot be used as execution permission",
    "target_selected_for_future_types cannot be used as production readiness",
  ])
})

test("Target Decision Record Contract contains the non-authorization statement", () => {
  requireAll(read(RECORD), "RECORD non-auth", [
    "This Target Decision Record Contract authorizes no persistence implementation, no storage implementation, no repository implementation, no storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.",
  ])
})
