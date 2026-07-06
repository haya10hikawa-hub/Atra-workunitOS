/**
 * P6-I4: static, read-only tests pinning the Phase 6 Storage Gate Spec and the
 * Storage Gate Record Contract.
 *
 * These tests ONLY read the three P6-I4 documents and assert string contents.
 * They call no P6-I0 validators, no P6-I1 constructors, no P6-I2 fixture, no
 * P6-I3 harness, no P7.1 utilities, no ApprovalStore, no D1, no SQL, no LLM, no
 * network, no GitHub API, no child_process; they mutate no files and require no
 * secrets. They inspect documentation, not runtime behavior. To avoid self-match
 * traps, the tests never scan their own source — every assertion targets a
 * document's contents with exact required phrases.
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

const GO = "../docs/P6_I4_EXPLICIT_HUMAN_GO.md"
const SPEC = "../docs/P6_I4_STORAGE_GATE_SPEC.md"
const RECORD = "../docs/P6_I4_STORAGE_GATE_RECORD_CONTRACT.md"

// ─── Files exist ────────────────────────────────────────────────

test("P6-I4 documents exist", () => {
  for (const rel of [GO, SPEC, RECORD]) {
    assert.ok(existsSync(fileURLToPath(new URL(rel, import.meta.url))), `${rel} must exist`)
  }
})

// ─── Spec: sections ─────────────────────────────────────────────

test("Storage Gate Spec contains all 19 required sections", () => {
  requireAll(read(SPEC), "SPEC", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Definition of Storage Gate\n",
    "## 4. What Storage Gate Is Not\n",
    "## 5. Product and Safety Invariants\n",
    "## 6. Storage Eligibility\n",
    "## 7. Eligible Phase 6 Artifacts\n",
    "## 8. Required Pre-storage Checks\n",
    "## 9. Tenant Scope Requirements\n",
    "## 10. Lineage Continuity Requirements\n",
    "## 11. Hash and Content Integrity Requirements\n",
    "## 12. Determinism Requirements\n",
    "## 13. No-Go Conditions\n",
    "## 14. Relationship to Evidence Ledger\n",
    "## 15. Relationship to Graph Model\n",
    "## 16. Relationship to ApprovalStore\n",
    "## 17. Relationship to External Actions\n",
    "## 18. Requirements for Future P6-I5 Persistence Implementation Gate\n",
    "## 19. Non-authorization Statement\n",
  ])
})

// ─── Spec: required sentences ───────────────────────────────────

test("Storage Gate Spec contains the required definition sentence and Japanese sentence", () => {
  const doc = read(SPEC)
  requireAll(doc, "SPEC", [
    "The Phase 6 Storage Gate defines whether validated Phase 6 artifacts are eligible for future persistence, but it does not implement storage, persistence, D1 access, SQL execution, repository behavior, approval, promotion, execution, or production readiness.",
    "Phase 6 Storage Gateとは、検証済みのPhase 6 artifactが将来の永続化候補になれるかを判定するためのgateであり、storage実装・persistence実装・D1アクセス・SQL実行・repository動作・approval・promotion・execution・production readinessを意味しない。",
  ])
})

// ─── Spec: not-storage-gate items ───────────────────────────────

test("Storage Gate Spec lists all not-storage-gate items", () => {
  requireAll(read(SPEC), "SPEC not-a-gate", [
    "storage implementation",
    "persistence implementation",
    "D1 access",
    "D1 migration",
    "SQL execution",
    "repository implementation",
    "storage adapter implementation",
    "database schema",
    "runtime pipeline",
    "ApprovalStore integration",
    "external action execution",
    "Formal WorkUnit promotion",
    "production readiness",
  ])
})

// ─── Spec: product and safety invariants ────────────────────────

test("Storage Gate Spec contains product and safety invariants", () => {
  requireAll(read(SPEC), "SPEC invariants", [
    "AI proposes. Rules guard. Humans decide.",
    "Storage eligibility is non-authorizing.",
    "Storage eligibility must not approve anything.",
    "Storage eligibility must not execute anything.",
    "Storage eligibility must not promote a WorkUnit.",
    "Storage eligibility must not make evidence true.",
    "Storage eligibility must not make LLM judgment true.",
    "Storage eligibility must not make a Human Decision into ApprovalStore approval.",
  ])
})

// ─── Spec: storage eligibility requirements ─────────────────────

test("Storage Gate Spec contains all storage eligibility requirements", () => {
  requireAll(read(SPEC), "SPEC eligibility", [
    "artifact was constructed by P6-I1 constructor or an equivalent future gated constructor",
    "artifact passes matching P6-I0 validator",
    "artifact has tenant_id",
    "artifact has stable artifact id",
    "artifact has required lineage ids",
    "artifact belongs to one tenant scope",
    "upstream lineage ids are internally consistent",
    "no_go_flags are empty unless artifact status is blocked_no_go and future gate explicitly permits storing blocked records",
    "hash fields are valid 64-character lowercase SHA-256 hex where applicable",
    "content_integrity_reference fields are sha256:<64 lowercase hex> where applicable",
    "timestamps are caller-provided and deterministic",
    "artifact does not include approval/execution/promotion grant fields",
    "artifact is not treated as truth, approval, execution, or promotion",
  ])
})

// ─── Spec: eligible artifacts ───────────────────────────────────

test("Storage Gate Spec lists all eligible Phase 6 artifacts", () => {
  requireAll(read(SPEC), "SPEC artifacts", [
    "QueryIntentRecord",
    "SafeQueryPlan",
    "CompiledSqlArtifact",
    "RuleReviewRecord",
    "QueryResultRecord",
    "EvidenceReviewRecord",
    "LlmJudgmentRecord",
    "HumanDecisionRecord",
    "full Phase 6 artifact spine as a grouped candidate, only when each artifact is individually eligible",
  ])
})

// ─── Spec: pre-storage checks ───────────────────────────────────

test("Storage Gate Spec contains all required pre-storage checks", () => {
  requireAll(read(SPEC), "SPEC checks", [
    "matching validator pass",
    "tenant consistency check",
    "lineage continuity check",
    "artifact id presence check",
    "timestamp presence check",
    "hash format check",
    "content integrity format check",
    "no_go_flags policy check",
    "non-authorization shape check",
    "forbidden grant-like key check",
    "deterministic fixture/harness reproducibility check for test fixtures",
    "explicit human review before enabling persistence implementation",
  ])
})

// ─── Spec: tenant scope requirements ────────────────────────────

test("Storage Gate Spec contains tenant scope requirements", () => {
  requireAll(read(SPEC), "SPEC tenant", [
    "tenant_id required on every stored candidate artifact",
    "cross-tenant spine storage is No-Go",
    "missing tenant_id is No-Go",
    "tenant inconsistency across a grouped spine is No-Go",
    "tenant scope eligibility is not authorization",
    "tenant scope eligibility is not user permission",
    "future storage implementation must still enforce authorization separately",
  ])
})

// ─── Spec: all 29 lineage edges ─────────────────────────────────

test("Storage Gate Spec contains all lineage continuity edges", () => {
  requireAll(read(SPEC), "SPEC lineage", [
    "SafeQueryPlan.source_query_intent_id === QueryIntentRecord.query_intent_id",
    "CompiledSqlArtifact.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id",
    "CompiledSqlArtifact.source_query_intent_id === QueryIntentRecord.query_intent_id",
    "RuleReviewRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id",
    "RuleReviewRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id",
    "RuleReviewRecord.source_query_intent_id === QueryIntentRecord.query_intent_id",
    "QueryResultRecord.source_rule_review_record_id === RuleReviewRecord.rule_review_record_id",
    "QueryResultRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id",
    "QueryResultRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id",
    "QueryResultRecord.source_query_intent_id === QueryIntentRecord.query_intent_id",
    "EvidenceReviewRecord.source_query_result_record_id === QueryResultRecord.query_result_record_id",
    "EvidenceReviewRecord.source_rule_review_record_id === RuleReviewRecord.rule_review_record_id",
    "EvidenceReviewRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id",
    "EvidenceReviewRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id",
    "EvidenceReviewRecord.source_query_intent_id === QueryIntentRecord.query_intent_id",
    "LlmJudgmentRecord.source_evidence_review_record_id === EvidenceReviewRecord.evidence_review_id",
    "LlmJudgmentRecord.source_query_result_record_id === QueryResultRecord.query_result_record_id",
    "LlmJudgmentRecord.source_rule_review_record_id === RuleReviewRecord.rule_review_record_id",
    "LlmJudgmentRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id",
    "LlmJudgmentRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id",
    "LlmJudgmentRecord.source_query_intent_id === QueryIntentRecord.query_intent_id",
    "HumanDecisionRecord.source_evidence_review_record_id === EvidenceReviewRecord.evidence_review_id",
    "HumanDecisionRecord.source_llm_judgment_record_id === LlmJudgmentRecord.llm_judgment_id",
    "HumanDecisionRecord.llm_judgment_id === LlmJudgmentRecord.llm_judgment_id",
    "HumanDecisionRecord.source_query_result_record_id === QueryResultRecord.query_result_record_id",
    "HumanDecisionRecord.source_rule_review_record_id === RuleReviewRecord.rule_review_record_id",
    "HumanDecisionRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id",
    "HumanDecisionRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id",
    "HumanDecisionRecord.source_query_intent_id === QueryIntentRecord.query_intent_id",
  ])
})

// ─── Spec: hash / content integrity + determinism ───────────────

test("Storage Gate Spec contains hash, content-integrity, and determinism requirements", () => {
  requireAll(read(SPEC), "SPEC hash+determinism", [
    "sql_hash must be 64-character lowercase SHA-256 hex",
    "result_hash must be 64-character lowercase SHA-256 hex",
    "content_integrity_reference must be sha256:<64 lowercase hex>",
    "payload_hash for future storage gate records must be sha256:<64 lowercase hex>",
    "hash validity is not truth",
    "content integrity is not approval",
    "hash presence is not execution permission",
    "Storage eligibility must be deterministic",
    "the gate generates no timestamps",
    "reproduce the same artifacts and the same eligibility verdict",
  ])
})

// ─── Spec: all 33 No-Go conditions ──────────────────────────────

test("Storage Gate Spec contains all No-Go conditions", () => {
  requireAll(read(SPEC), "SPEC no-go", [
    "p6_i3_not_merged",
    "missing_foundation_file",
    "missing_explicit_human_go",
    "app_runtime_changed",
    "storage_implementation_added",
    "persistence_implementation_added",
    "d1_binding_added",
    "d1_migration_added",
    "sql_execution_added",
    "repository_added",
    "storage_adapter_added",
    "database_schema_added",
    "runtime_pipeline_added",
    "approvalstore_integration_added",
    "p7_1_tsp_wiring_added",
    "external_action_execution_added",
    "formal_workunit_promotion_added",
    "storage_eligibility_treated_as_approval",
    "storage_eligibility_treated_as_execution",
    "storage_eligibility_treated_as_promotion",
    "evidence_treated_as_truth",
    "llm_judgment_treated_as_truth",
    "human_decision_treated_as_approval",
    "missing_tenant_id_allowed",
    "cross_tenant_spine_allowed",
    "lineage_mismatch_allowed",
    "invalid_hash_allowed",
    "invalid_content_integrity_allowed",
    "no_go_flags_ignored",
    "validation_not_required_before_storage",
    "human_review_bypassed_before_persistence_gate",
    "ruleset_weakened",
    "validation_failed",
  ])
})

// ─── Spec: ledger / graph / approvalstore / external boundaries ─

test("Storage Gate Spec contains ledger, graph, ApprovalStore, and external-action boundaries", () => {
  requireAll(read(SPEC), "SPEC boundaries", [
    "Storage Gate may define future eligibility for ledger entry candidates.",
    "Storage Gate does not update ALPHA_EVIDENCE_LEDGER.",
    "Storage Gate does not append evidence ledger entries.",
    "Storage Gate does not make evidence true.",
    "Ledger linkage remains future-gated.",
    "Storage Gate may define future eligibility for graph node or edge candidates.",
    "Storage Gate does not implement graph storage.",
    "Storage Gate does not implement GraphRAG.",
    "Storage Gate does not create runtime graph edges.",
    "Graph linkage remains future-gated.",
    "Storage Gate has no ApprovalStore authority.",
    "Storage eligibility is not ApprovalStore approval.",
    "Storage eligibility must not satisfy approval requirements.",
    "ApprovalStore wiring remains blocked.",
    "P7.1 TSP utilities remain unwired.",
    "Storage Gate cannot execute external actions.",
    "Storage Gate cannot authorize sends, posts, creates, updates, deletes, shares, commits, or publishes.",
    "External action execution remains blocked.",
  ])
})

// ─── Spec: P6-I5 requirements + non-authorization statement ─────

test("Storage Gate Spec contains P6-I5 requirements and the non-authorization statement", () => {
  requireAll(read(SPEC), "SPEC p6i5+nonauth", [
    "P6-I5 must have its own explicit human Go",
    "P6-I5 must verify P6-I4 merged into main",
    "P6-I5 must define allowed storage target before implementation",
    "P6-I5 must define tenant isolation checks",
    "P6-I5 must define schema versioning",
    "P6-I5 must define idempotency and duplicate handling",
    "P6-I5 must define rollback behavior",
    "P6-I5 must define audit behavior without ApprovalStore authority",
    "P6-I5 must define redaction behavior",
    "P6-I5 must preserve non-authorization boundary",
    "P6-I5 must not add D1 execution unless a separate D1 gate permits it",
    "P6-I5 must not add external actions",
    "P6-I5 must not promote Formal WorkUnits",
    "This Phase 6 Storage Gate Spec authorizes no storage implementation, no persistence implementation, no D1 access, no D1 migration, no SQL execution, no repository implementation, no storage adapter, no database schema, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.",
  ])
})

// ─── Record: sections ───────────────────────────────────────────

test("Storage Gate Record Contract contains all 17 required sections", () => {
  requireAll(read(RECORD), "RECORD", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Definition of Storage Gate Record\n",
    "## 4. What Storage Gate Record Is Not\n",
    "## 5. Required Fields\n",
    "## 6. Storage Eligibility Status\n",
    "## 7. Artifact Reference Fields\n",
    "## 8. Tenant and Lineage Fields\n",
    "## 9. Validation Evidence Fields\n",
    "## 10. Hash and Content Integrity Fields\n",
    "## 11. No-Go and Failure Fields\n",
    "## 12. Human Review Fields\n",
    "## 13. Relationship to Future Persistence\n",
    "## 14. Relationship to Ledger and Graph Linkage\n",
    "## 15. Relationship to Approval and Execution\n",
    "## 16. Validation Rules\n",
    "## 17. Non-authorization Statement\n",
  ])
})

// ─── Record: required sentences + not-a-record items ────────────

test("Storage Gate Record Contract contains required sentences and not-a-record items", () => {
  requireAll(read(RECORD), "RECORD sentences", [
    "A Storage Gate Record is a future non-authorizing record of whether a Phase 6 artifact or artifact spine is eligible to be considered by a later persistence implementation gate.",
    "Storage Gate Recordとは、Phase 6 artifactまたはartifact spineが将来のpersistence implementation gateで検討可能かを記録するための非認可recordであり、保存実行・approval・execution・promotionを意味しない。",
    "stored artifact",
    "database row by itself",
    "storage execution",
    "persistence execution",
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

// ─── Record: required fields ────────────────────────────────────

test("Storage Gate Record Contract contains all required fields", () => {
  requireAll(read(RECORD), "RECORD fields", [
    "storage_gate_record_id",
    "tenant_id",
    "storage_gate_status",
    "storage_gate_outcome",
    "artifact_scope",
    "artifact_references",
    "spine_references",
    "validation_evidence",
    "tenant_consistency_result",
    "lineage_continuity_result",
    "hash_integrity_result",
    "content_integrity_result",
    "no_go_flags_result",
    "non_authorization_result",
    "human_review_required",
    "reviewed_by_human_at",
    "reviewed_by_human_id",
    "created_at",
    "payload_hash",
    "no_go_flags",
  ])
})

// ─── Record: status / outcome / scope literals ──────────────────

test("Storage Gate Record Contract contains all status, outcome, and scope literals", () => {
  const doc = read(RECORD)
  requireAll(doc, "RECORD status", [
    "draft_storage_gate_record",
    "blocked_no_go",
    "storage_eligible_for_future_gate",
    "storage_ineligible",
    "clarification_needed",
    "Eligible for a future persistence implementation gate review only. It is not storage execution.",
  ])
  requireAll(doc, "RECORD outcome", ["- pass\n", "- warn\n", "- fail\n", "- no_go\n"])
  requireAll(doc, "RECORD scope", [
    "single_artifact",
    "full_phase6_spine",
    "partial_spine",
    "blocked_record",
  ])
})

// ─── Record: reference / tenant-lineage / validation-evidence ───

test("Storage Gate Record Contract contains reference, tenant-lineage, and validation-evidence fields", () => {
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
  requireAll(doc, "RECORD tenant-lineage", [
    "tenant_consistency_result",
    "lineage_continuity_result",
    "lineage_edges_checked",
    "lineage_mismatches",
    "cross_tenant_detected",
  ])
  requireAll(doc, "RECORD validation-evidence", [
    "validators_checked",
    "validator_results",
    "construction_results_checked",
    "harness_results_checked",
    "fixture_results_checked",
    "validation_passed",
  ])
})

// ─── Record: hash / no-go-failure / human-review ────────────────

test("Storage Gate Record Contract contains hash, No-Go/failure, and human-review fields", () => {
  const doc = read(RECORD)
  requireAll(doc, "RECORD hash", [
    "sql_hash_check_result",
    "result_hash_check_result",
    "content_integrity_check_result",
    "payload_hash",
    "payload_hash_algorithm",
    "payload_hash_algorithm must be sha256",
  ])
  requireAll(doc, "RECORD no-go-failure", [
    "no_go_flags_result",
    "failure_reasons",
    "blocked_capabilities",
    "unresolved_risks",
  ])
  requireAll(doc, "RECORD human-review", [
    "reviewed_by_human_id",
    "reviewed_by_human_at",
    "reviewer_role",
    "review_rationale",
  ])
})

// ─── Record: boundaries + validation rules + non-auth ───────────

test("Storage Gate Record Contract contains persistence/ledger/approval boundaries, validation rules, and non-authorization statement", () => {
  const doc = read(RECORD)
  requireAll(doc, "RECORD future-persistence", [
    "Storage Gate Record may be an input to P6-I5.",
    "Storage Gate Record does not persist artifacts by itself.",
    "Storage Gate Record does not choose a database backend.",
    "Storage Gate Record does not create D1 bindings.",
    "Storage Gate Record does not run migrations.",
  ])
  requireAll(doc, "RECORD ledger-graph", [
    "Storage Gate Record does not append evidence ledger entries",
    "Storage Gate Record does not create graph nodes or graph edges",
    "Ledger linkage and graph linkage remain future-gated",
  ])
  requireAll(doc, "RECORD approval-execution", [
    "Storage Gate Record is not ApprovalStore approval",
    "Storage Gate Record is not execution authorization",
    "Storage Gate Record does not promote a Formal WorkUnit.",
    "storage_eligible_for_future_gate is not approval, not execution permission, and not promotion.",
  ])
  requireAll(doc, "RECORD validation-rules", [
    "missing tenant_id is No-Go",
    "missing artifact references are No-Go",
    "empty artifact_references are No-Go",
    "cross-tenant lineage is No-Go",
    "lineage mismatch is No-Go",
    "invalid payload_hash is No-Go",
    "invalid content_integrity_reference is No-Go",
    "missing human review for storage eligibility is No-Go",
    "no_go_flags cannot be ignored",
    "storage_eligible_for_future_gate cannot be used as approval",
    "storage_eligible_for_future_gate cannot be used as execution permission",
    "storage_eligible_for_future_gate cannot be used as production readiness",
  ])
  requireAll(doc, "RECORD non-auth", [
    "This Storage Gate Record Contract authorizes no storage implementation, no persistence implementation, no D1 access, no D1 migration, no SQL execution, no repository implementation, no storage adapter, no database schema, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.",
  ])
})

// ─── Go doc ─────────────────────────────────────────────────────

test("P6-I4 explicit human Go records the required sign-offs", () => {
  requireAll(read(GO), "GO", [
    "P6-I4 has explicit human Go.",
    "The allowed scope is docs-only + static-test storage gate specification.",
    "P6-I4 must not add app runtime code.",
    "P6-I4 must not implement storage.",
    "P6-I4 must not implement persistence.",
    "Storage eligibility is not approval.",
    "Storage eligibility is not execution permission.",
    "Storage eligibility is not production readiness.",
    "This loop must stop if forbidden paths change.",
  ])
})
