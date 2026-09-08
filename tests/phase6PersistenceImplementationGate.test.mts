/**
 * P6-I5: static, read-only tests pinning the Phase 6 Persistence Implementation
 * Gate and the Persistence Gate Record Contract.
 *
 * These tests ONLY read the three P6-I5 documents and assert string contents.
 * They call no P6-I0 validators, no P6-I1 constructors, no P6-I2 fixture, no
 * P6-I3 harness, no P6-I4 tests, no P7.1 utilities, no ApprovalStore, no D1, no
 * SQL, no LLM, no network, no GitHub API, no child_process; they mutate no files
 * and require no secrets. They inspect documentation, not runtime behavior. To
 * avoid self-match traps, the tests never scan their own source — every
 * assertion targets a document's contents with exact required phrases.
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

const GO = "../docs/legacy/P6_I5_EXPLICIT_HUMAN_GO.md"
const GATE = "../docs/legacy/P6_I5_PERSISTENCE_IMPLEMENTATION_GATE.md"
const RECORD = "../docs/legacy/P6_I5_PERSISTENCE_RECORD_CONTRACT.md"

// ─── Files exist ────────────────────────────────────────────────

test("P6-I5 documents exist", () => {
  for (const rel of [GO, GATE, RECORD]) {
    assert.ok(existsSync(fileURLToPath(new URL(rel, import.meta.url))), `${rel} must exist`)
  }
})

// ─── Gate: sections ─────────────────────────────────────────────

test("Persistence Implementation Gate contains all 24 required sections", () => {
  requireAll(read(GATE), "GATE", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Definition of Persistence Implementation Gate\n",
    "## 4. What Persistence Implementation Gate Is Not\n",
    "## 5. Product and Safety Invariants\n",
    "## 6. Required Inputs from P6-I4 Storage Gate\n",
    "## 7. Allowed Future Persistence Targets\n",
    "## 8. Disallowed Persistence Targets\n",
    "## 9. Persistence Readiness Criteria\n",
    "## 10. Tenant Isolation Requirements\n",
    "## 11. Artifact Identity and Lineage Requirements\n",
    "## 12. Schema Versioning Requirements\n",
    "## 13. Serialization and Deserialization Requirements\n",
    "## 14. Idempotency and Duplicate Handling Requirements\n",
    "## 15. Redaction and Sensitive Data Requirements\n",
    "## 16. Audit Requirements Without ApprovalStore Authority\n",
    "## 17. Rollback and Recovery Requirements\n",
    "## 18. Read and Write Separation\n",
    "## 19. D1 and SQL Boundary\n",
    "## 20. Evidence Ledger and Graph Model Boundary\n",
    "## 21. ApprovalStore, P7.1 TSP, and External Action Boundary\n",
    "## 22. Future Implementation PR Slicing\n",
    "## 23. No-Go Conditions\n",
    "## 24. Non-authorization Statement\n",
  ])
})

// ─── Gate: required sentences ───────────────────────────────────

test("Persistence Implementation Gate contains the required definition and Japanese sentences", () => {
  requireAll(read(GATE), "GATE sentences", [
    "The Phase 6 Persistence Implementation Gate defines what must be true before a later loop may implement persistence for storage-eligible Phase 6 artifacts, but it does not implement persistence, storage, D1 access, SQL execution, repository behavior, storage adapters, database schema, approval, promotion, execution, or production readiness.",
    "Phase 6 Persistence Implementation Gateとは、storage-eligibleなPhase 6 artifactを将来のloopで永続化実装できるかを判定するためのgateであり、persistence実装・storage実装・D1アクセス・SQL実行・repository動作・storage adapter・database schema・approval・promotion・execution・production readinessを意味しない。",
  ])
})

// ─── Gate: not-a-gate items ─────────────────────────────────────

test("Persistence Implementation Gate lists all not-gate items", () => {
  requireAll(read(GATE), "GATE not-a-gate", [
    "persistence implementation",
    "storage implementation",
    "D1 access",
    "D1 binding",
    "D1 migration",
    "SQL execution",
    "repository implementation",
    "storage adapter implementation",
    "database schema",
    "runtime pipeline",
    "ApprovalStore integration",
    "P7.1 TSP wiring",
    "external action execution",
    "Formal WorkUnit promotion",
    "production readiness",
  ])
})

// ─── Gate: product and safety invariants ────────────────────────

test("Persistence Implementation Gate contains product and safety invariants", () => {
  requireAll(read(GATE), "GATE invariants", [
    "AI proposes. Rules guard. Humans decide.",
    "Persistence readiness is non-authorizing.",
    "Persistence readiness must not approve anything.",
    "Persistence readiness must not execute anything.",
    "Persistence readiness must not promote a WorkUnit.",
    "Persistence readiness must not make evidence true.",
    "Persistence readiness must not make LLM judgment true.",
    "Persistence readiness must not make a Human Decision into ApprovalStore approval.",
    "Persistence readiness must not imply D1 access.",
    "Persistence readiness must not imply SQL execution.",
  ])
})

// ─── Gate: required inputs from P6-I4 ───────────────────────────

test("Persistence Implementation Gate contains required inputs from P6-I4", () => {
  requireAll(read(GATE), "GATE inputs", [
    "P6-I4 Storage Gate Spec merged into main",
    "Storage Gate Record Contract available",
    "explicit human Go for P6-I5",
    "storage eligibility requirements",
    "Storage Gate Record required fields",
    "tenant consistency requirement",
    "lineage continuity requirement",
    "hash and content integrity requirement",
    "no_go_flags policy",
    "non-authorization boundary",
    "P6-I5 future implementation requirements",
  ])
})

// ─── Gate: allowed / disallowed targets ─────────────────────────

test("Persistence Implementation Gate contains all allowed and disallowed persistence targets", () => {
  const doc = read(GATE)
  requireAll(doc, "GATE allowed", [
    "in_memory_test_only_store",
    "local_ephemeral_dev_store",
    "append_only_audit_candidate_store",
    "tenant_scoped_artifact_candidate_store",
    "future_d1_store_after_separate_d1_gate",
    "Allowed target class names are not implementations.",
    "No target class may be implemented by P6-I5.",
    "future_d1_store_after_separate_d1_gate is not allowed until a separate D1 gate permits it.",
  ])
  requireAll(doc, "GATE disallowed", [
    "production_database_without_gate",
    "cross_tenant_shared_store_without_isolation",
    "external_service_store",
    "browser_local_storage",
    "unencrypted_secret_store",
    "approvalstore_as_phase6_storage",
    "evidence_ledger_as_primary_storage_without_gate",
    "graph_store_without_graph_gate",
    "vector_store",
    "d1_store_without_d1_gate",
    "sql_mutation_store",
    "external_action_log_as_storage",
  ])
})

// ─── Gate: readiness criteria ───────────────────────────────────

test("Persistence Implementation Gate contains persistence readiness criteria", () => {
  requireAll(read(GATE), "GATE readiness", [
    "Storage Gate Record exists or is defined by the gate",
    "artifact or spine is storage_eligible_for_future_gate",
    "tenant consistency passed",
    "lineage continuity passed",
    "matching validators passed",
    "construction results checked",
    "harness result checked when using full spine",
    "hash integrity passed",
    "content integrity passed",
    "no_go_flags policy passed",
    "redaction policy decided",
    "schema version decided",
    "idempotency key strategy decided",
    "duplicate handling strategy decided",
    "rollback strategy decided",
    "audit strategy decided",
    "explicit human review before implementation",
    "no approval/execution/promotion grant present",
  ])
})

// ─── Gate: tenant isolation + identity/lineage ──────────────────

test("Persistence Implementation Gate contains tenant isolation and identity/lineage requirements", () => {
  const doc = read(GATE)
  requireAll(doc, "GATE tenant", [
    "tenant_id must be part of every persistence key or namespace",
    "cross-tenant writes are No-Go",
    "cross-tenant reads are No-Go",
    "cross-tenant indexes are No-Go unless a later gate explicitly proves isolation",
    "tenant_id must be validated before any future write",
    "tenant_id must be validated before any future read",
    "tenant isolation is not authorization",
    "user permission must remain separately enforced in future implementation",
  ])
  requireAll(doc, "GATE identity", [
    "artifact ids must be stable",
    "artifact ids must be caller-provided or derived only by a future gated id policy",
    "artifact ids must not be generated implicitly by persistence",
    "storage keys must not replace artifact ids",
    "upstream lineage ids must be stored or preserved in future persistence",
    "lineage mismatch is No-Go",
    "missing lineage is No-Go",
    "HumanDecisionRecord.source_llm_judgment_record_id must equal HumanDecisionRecord.llm_judgment_id when persisted",
    "persisted spine candidates must preserve all P6-I2 lineage edges",
  ])
})

// ─── Gate: schema / serialization / idempotency ─────────────────

test("Persistence Implementation Gate contains schema, serialization, and idempotency requirements", () => {
  const doc = read(GATE)
  requireAll(doc, "GATE schema", [
    "schema_version is required for future persisted records",
    "schema_version must be explicit",
    "schema_version must not be inferred from current date",
    "migration policy must be defined before schema changes",
    "backward compatibility expectations must be stated",
    "unknown schema version must fail closed",
    "schema version validity is not approval",
  ])
  requireAll(doc, "GATE serialization", [
    "serialization must preserve tenant_id",
    "serialization must preserve artifact ids",
    "serialization must preserve lineage ids",
    "serialization must preserve no_go_flags",
    "serialization must preserve non-authorization fields",
    "deserialization must validate with P6-I0 validators or future gated validators",
    "deserialization must fail closed on unknown critical fields",
    "deserialization must not grant approval/execution/promotion",
    "serialized form must not include secrets unless explicitly allowed by a future redaction gate",
  ])
  requireAll(doc, "GATE idempotency", [
    "idempotency key strategy must be explicit",
    "duplicate artifact ids must fail closed or be treated as idempotent only by explicit policy",
    "repeated writes must not create conflicting records",
    "repeated writes must not create extra approvals",
    "repeated writes must not execute actions",
    "duplicate detection must be tenant-scoped",
    "duplicate handling must be auditable",
  ])
})

// ─── Gate: redaction / audit / rollback / read-write ────────────

test("Persistence Implementation Gate contains redaction, audit, rollback, and read/write separation", () => {
  const doc = read(GATE)
  requireAll(doc, "GATE redaction", [
    "secret-like values must not be persisted unless a future gate explicitly permits it",
    "unknown_sensitive fields are No-Go",
    "blocked_input must not be persisted",
    "token-like values must be redacted",
    "raw external payloads require a separate redaction decision",
    "redaction failure is No-Go",
    "redaction is not approval",
    "redaction is not evidence truth",
  ])
  requireAll(doc, "GATE audit", [
    "future persistence must produce audit evidence",
    "audit evidence must not be ApprovalStore approval",
    "audit evidence must not authorize execution",
    "audit evidence must include tenant_id",
    "audit evidence must include artifact ids",
    "audit evidence must include outcome",
    "audit evidence must include failure reasons",
    "audit evidence must include human reviewer reference when required",
    "audit evidence must not leak secrets",
  ])
  requireAll(doc, "GATE rollback", [
    "rollback behavior must be defined before persistence implementation",
    "partial writes must fail closed",
    "partial spine persistence must be explicitly marked partial",
    "recovery must not infer missing artifacts",
    "recovery must not promote WorkUnits",
    "recovery must not execute actions",
    "rollback events must be auditable",
  ])
  requireAll(doc, "GATE read-write", [
    "write eligibility is separate from read eligibility",
    "future writes must not imply future reads",
    "future reads must not imply evidence truth",
    "future reads must not imply approval",
    "read APIs require a separate gate if exposed beyond tests",
    "mutation APIs require a separate gate",
  ])
})

// ─── Gate: D1/SQL + ledger/graph + approval/external boundaries ─

test("Persistence Implementation Gate contains D1/SQL, ledger/graph, and ApprovalStore/external boundaries", () => {
  const doc = read(GATE)
  requireAll(doc, "GATE d1-sql", [
    "P6-I5 does not permit D1 access",
    "P6-I5 does not permit D1 bindings",
    "P6-I5 does not permit D1 migrations",
    "P6-I5 does not permit SQL execution",
    "P6-I5 does not permit SQL mutation",
    "future D1 read-only execution remains P6-I6 or later",
    "D1 persistence requires a separate D1 gate",
    "SQL compilation and SQL execution remain separately gated",
  ])
  requireAll(doc, "GATE ledger-graph", [
    "persistence readiness may reference ledger linkage candidates",
    "persistence readiness does not append ALPHA_EVIDENCE_LEDGER",
    "persistence readiness does not update evidence ledger",
    "persistence readiness does not create graph nodes",
    "persistence readiness does not create graph edges",
    "persistence readiness does not implement GraphRAG",
    "ledger and graph linkage remain future-gated",
  ])
  requireAll(doc, "GATE approval-external", [
    "persistence readiness has no ApprovalStore authority",
    "persistence readiness is not ApprovalStore approval",
    "P7.1 TSP utilities remain unwired",
    "persistence readiness cannot satisfy approval requirements",
    "persistence readiness cannot execute external actions",
    "persistence readiness cannot authorize sends, posts, creates, updates, deletes, shares, commits, or publishes",
    "external action execution remains blocked",
  ])
})

// ─── Gate: PR slicing ───────────────────────────────────────────

test("Persistence Implementation Gate contains future implementation PR slicing", () => {
  requireAll(read(GATE), "GATE slicing", [
    "P6-I5A persistence target decision spec if needed",
    "P6-I5B persistence types and validators only",
    "P6-I5C pure persistence candidate constructors only",
    "P6-I5D test-only persistence fixture",
    "P6-I5E in-memory test-only persistence adapter",
    "P6-I5F persistence audit evidence spec",
    "P6-I6 D1 read-only execution implementation gate or later",
    "no PR may combine persistence implementation with D1 execution",
    "no PR may combine persistence implementation with external action execution",
    "no PR may combine persistence implementation with ApprovalStore wiring",
  ])
})

// ─── Gate: all No-Go conditions ─────────────────────────────────

test("Persistence Implementation Gate contains all No-Go conditions", () => {
  requireAll(read(GATE), "GATE no-go", [
    "p6_i4_not_merged",
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
    "evidence_treated_as_truth",
    "llm_judgment_treated_as_truth",
    "human_decision_treated_as_approval",
    "persistence_readiness_treated_as_approval",
    "persistence_readiness_treated_as_execution",
    "persistence_readiness_treated_as_promotion",
    "storage_eligibility_bypassed",
    "storage_gate_record_bypassed",
    "missing_tenant_isolation",
    "cross_tenant_write_allowed",
    "cross_tenant_read_allowed",
    "lineage_mismatch_allowed",
    "invalid_hash_allowed",
    "invalid_content_integrity_allowed",
    "no_go_flags_ignored",
    "redaction_failure_allowed",
    "unknown_sensitive_persisted",
    "schema_version_missing_allowed",
    "idempotency_policy_missing",
    "duplicate_policy_missing",
    "rollback_policy_missing",
    "audit_policy_missing",
    "human_review_bypassed_before_persistence",
    "d1_gate_bypassed",
    "ruleset_weakened",
    "validation_failed",
  ])
})

// ─── Gate: non-authorization statement ──────────────────────────

test("Persistence Implementation Gate contains the non-authorization statement", () => {
  requireAll(read(GATE), "GATE non-auth", [
    "This Phase 6 Persistence Implementation Gate authorizes no persistence implementation, no storage implementation, no repository implementation, no storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.",
  ])
})

// ─── Record: sections ───────────────────────────────────────────

test("Persistence Gate Record Contract contains all 19 required sections", () => {
  requireAll(read(RECORD), "RECORD", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Definition of Persistence Gate Record\n",
    "## 4. What Persistence Gate Record Is Not\n",
    "## 5. Required Fields\n",
    "## 6. Persistence Readiness Status\n",
    "## 7. Persistence Target Class\n",
    "## 8. Artifact and Storage Gate References\n",
    "## 9. Tenant Isolation Fields\n",
    "## 10. Lineage and Identity Fields\n",
    "## 11. Schema Versioning Fields\n",
    "## 12. Serialization and Redaction Fields\n",
    "## 13. Idempotency and Duplicate Handling Fields\n",
    "## 14. Audit and Rollback Fields\n",
    "## 15. D1 and SQL Boundary Fields\n",
    "## 16. Relationship to Future Implementation\n",
    "## 17. Relationship to Approval and Execution\n",
    "## 18. Validation Rules\n",
    "## 19. Non-authorization Statement\n",
  ])
})

// ─── Record: required sentences + not-a-record items ────────────

test("Persistence Gate Record Contract contains required sentences and not-a-record items", () => {
  requireAll(read(RECORD), "RECORD sentences", [
    "A Persistence Gate Record is a future non-authorizing record of whether storage-eligible Phase 6 artifacts are ready to be considered by a later persistence implementation loop.",
    "Persistence Gate Recordとは、storage-eligibleなPhase 6 artifactが将来のpersistence implementation loopで検討可能かを記録するための非認可recordであり、persistence実行・storage実行・D1アクセス・SQL実行・approval・execution・promotionを意味しない。",
    "persisted artifact",
    "database row by itself",
    "persistence execution",
    "storage execution",
    "D1 record",
    "SQL result",
    "repository operation",
    "storage adapter operation",
    "ledger entry",
    "graph node",
    "graph edge",
    "approval record",
    "execution authorization",
    "Formal WorkUnit promotion",
    "production readiness",
  ])
})

// ─── Record: required fields ────────────────────────────────────

test("Persistence Gate Record Contract contains all required fields", () => {
  requireAll(read(RECORD), "RECORD fields", [
    "persistence_gate_record_id",
    "tenant_id",
    "persistence_gate_status",
    "persistence_gate_outcome",
    "persistence_target_class",
    "storage_gate_record_id",
    "storage_gate_status",
    "storage_gate_outcome",
    "artifact_scope",
    "artifact_references",
    "spine_references",
    "tenant_isolation_result",
    "lineage_continuity_result",
    "schema_versioning_result",
    "serialization_result",
    "redaction_result",
    "idempotency_result",
    "duplicate_handling_result",
    "rollback_result",
    "audit_result",
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

// ─── Record: status / outcome / target literals ─────────────────

test("Persistence Gate Record Contract contains all status, outcome, and target-class literals", () => {
  const doc = read(RECORD)
  requireAll(doc, "RECORD status", [
    "draft_persistence_gate_record",
    "blocked_no_go",
    "persistence_ready_for_future_implementation",
    "persistence_not_ready",
    "clarification_needed",
    "Ready for a future persistence implementation loop review only. It is not persistence execution.",
  ])
  requireAll(doc, "RECORD outcome", ["- pass\n", "- warn\n", "- fail\n", "- no_go\n"])
  requireAll(doc, "RECORD target", [
    "in_memory_test_only_store",
    "local_ephemeral_dev_store",
    "append_only_audit_candidate_store",
    "tenant_scoped_artifact_candidate_store",
    "future_d1_store_after_separate_d1_gate",
    "blocked_target",
  ])
})

// ─── Record: reference / tenant / lineage-identity fields ───────

test("Persistence Gate Record Contract contains reference, tenant, and lineage/identity fields", () => {
  const doc = read(RECORD)
  requireAll(doc, "RECORD refs", [
    "query_intent_id",
    "safe_query_plan_id",
    "compiled_sql_artifact_id",
    "rule_review_record_id",
    "query_result_record_id",
    "evidence_review_id",
    "llm_judgment_id",
    "human_decision_id",
  ])
  requireAll(doc, "RECORD tenant", [
    "tenant_namespace",
    "cross_tenant_write_detected",
    "cross_tenant_read_detected",
    "tenant_indexing_policy",
    "tenant_permission_boundary_note",
  ])
  requireAll(doc, "RECORD lineage-identity", [
    "artifact_identity_result",
    "lineage_edges_checked",
    "lineage_mismatches",
    "stable_artifact_ids_confirmed",
    "storage_key_strategy",
    "id_generation_policy",
  ])
})

// ─── Record: schema / serialization-redaction / idempotency ─────

test("Persistence Gate Record Contract contains schema, serialization/redaction, and idempotency fields", () => {
  const doc = read(RECORD)
  requireAll(doc, "RECORD schema", [
    "schema_version",
    "migration_policy_reference",
    "backward_compatibility_note",
    "unknown_schema_version_behavior",
  ])
  requireAll(doc, "RECORD serialization-redaction", [
    "deserialization_validation_required",
    "unknown_critical_field_behavior",
    "sensitive_field_policy",
    "secret_persistence_allowed",
  ])
  requireAll(doc, "RECORD idempotency", [
    "idempotency_key_strategy",
    "duplicate_detection_scope",
    "repeated_write_behavior",
  ])
})

// ─── Record: audit-rollback / D1-SQL boundary fields ────────────

test("Persistence Gate Record Contract contains audit/rollback and D1/SQL boundary fields", () => {
  const doc = read(RECORD)
  requireAll(doc, "RECORD audit-rollback", [
    "audit_event_shape_reference",
    "partial_write_behavior",
    "recovery_behavior",
    "failure_reasons",
  ])
  requireAll(doc, "RECORD d1-sql", [
    "d1_boundary_result",
    "sql_boundary_result",
    "d1_gate_required",
    "sql_execution_allowed",
    "sql_mutation_allowed",
  ])
})

// ─── Record: boundaries + validation rules + non-auth ───────────

test("Persistence Gate Record Contract contains future/approval boundaries, validation rules, and non-authorization statement", () => {
  const doc = read(RECORD)
  requireAll(doc, "RECORD future-impl", [
    "Persistence Gate Record may be an input to a future P6-I5 implementation loop.",
    "Persistence Gate Record does not persist artifacts by itself.",
    "Persistence Gate Record does not choose or implement a database backend.",
    "Persistence Gate Record does not create D1 bindings.",
    "Persistence Gate Record does not run migrations.",
  ])
  requireAll(doc, "RECORD approval-execution", [
    "Persistence Gate Record is not ApprovalStore approval",
    "Persistence Gate Record is not execution authorization",
    "Persistence Gate Record does not promote a Formal WorkUnit.",
    "persistence_ready_for_future_implementation is not approval, not execution permission, and not promotion.",
  ])
  requireAll(doc, "RECORD validation-rules", [
    "missing tenant_id is No-Go",
    "missing storage_gate_record_id is No-Go",
    "storage gate bypass is No-Go",
    "missing artifact references are No-Go",
    "cross-tenant write is No-Go",
    "cross-tenant read is No-Go",
    "lineage mismatch is No-Go",
    "missing schema_version is No-Go",
    "unknown schema_version must fail closed",
    "missing idempotency policy is No-Go",
    "missing duplicate policy is No-Go",
    "missing rollback policy is No-Go",
    "redaction failure is No-Go",
    "unknown_sensitive persistence is No-Go",
    "D1 access without D1 gate is No-Go",
    "SQL execution without SQL gate is No-Go",
    "persistence_ready_for_future_implementation cannot be used as approval",
    "persistence_ready_for_future_implementation cannot be used as execution permission",
    "persistence_ready_for_future_implementation cannot be used as production readiness",
  ])
  requireAll(doc, "RECORD non-auth", [
    "This Persistence Gate Record Contract authorizes no persistence implementation, no storage implementation, no repository implementation, no storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.",
  ])
})

// ─── Go doc ─────────────────────────────────────────────────────

test("P6-I5 explicit human Go records the required sign-offs", () => {
  requireAll(read(GO), "GO", [
    "P6-I5 has explicit human Go.",
    "The allowed scope is docs-only + static-test persistence implementation gate specification.",
    "P6-I5 must not add app runtime code.",
    "P6-I5 must not implement persistence.",
    "P6-I5 must not implement storage.",
    "P6-I5 must not implement D1 read-only execution.",
    "Persistence readiness is not approval.",
    "Persistence readiness is not execution permission.",
    "Persistence readiness is not production readiness.",
    "This loop must stop if forbidden paths change.",
  ])
})
