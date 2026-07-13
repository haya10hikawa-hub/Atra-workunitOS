/**
 * P6-I5K: static, read-only tests pinning the Phase 6 Recorder Audit Summary Spec
 * and the Recorder Audit Summary Contract, plus — for the P6-FIX-007e one-way
 * No-Go relationship — the P6-I5L Recorder Audit Summary Types and Validators
 * document.
 *
 * These tests ONLY read those Recorder Audit Summary documents and assert string
 * contents. They import no app code, no harness, no fixture, no P6-I5J recorder;
 * they call no network, no GitHub API, no child_process, no ApprovalStore, no D1,
 * no SQL, no LLM; they append no Evidence Ledger and write no Graph Model; they
 * mutate no files and require no secrets. They inspect documentation, not runtime
 * behavior. To avoid self-match traps, the tests never scan their own source —
 * every assertion targets a document's contents with exact required phrases and
 * anchored section headings.
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

const GO = "../docs/P6_I5K_EXPLICIT_HUMAN_GO.md"
const SPEC = "../docs/P6_I5K_RECORDER_AUDIT_SUMMARY_SPEC.md"
const CONTRACT = "../docs/P6_I5K_RECORDER_AUDIT_SUMMARY_CONTRACT.md"
const TYPES_VALIDATORS = "../docs/P6_I5L_RECORDER_AUDIT_SUMMARY_TYPES_VALIDATORS.md"

// ─── Files exist ────────────────────────────────────────────────

test("P6-I5K documents exist", () => {
  for (const rel of [GO, SPEC, CONTRACT]) {
    assert.ok(existsSync(fileURLToPath(new URL(rel, import.meta.url))), `${rel} must exist`)
  }
})

// ─── Spec: 28 sections ──────────────────────────────────────────

test("Recorder Audit Summary Spec contains all 28 required sections", () => {
  requireAll(read(SPEC), "SPEC sections", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Definition of Recorder Audit Summary\n",
    "## 4. What Recorder Audit Summary Is Not\n",
    "## 5. Product and Safety Invariants\n",
    "## 6. Required Inputs from P6-I5J\n",
    "## 7. Summary Scope\n",
    "## 8. Summarized Recorder Operations\n",
    "## 9. Summary Shape\n",
    "## 10. Tenant Scope Summary\n",
    "## 11. Operation Count Summary\n",
    "## 12. Status and Outcome Summary\n",
    "## 13. Validation Result Summary\n",
    "## 14. Duplicate and Idempotency Summary\n",
    "## 15. Clear Operation Summary\n",
    "## 16. Not-found and Failure Summary\n",
    "## 17. Defensive Snapshot Summary\n",
    "## 18. Non-durability Summary\n",
    "## 19. Fixture Coverage Summary\n",
    "## 20. Recorder Boundary\n",
    "## 21. Evidence Ledger Boundary\n",
    "## 22. Graph Model Boundary\n",
    "## 23. ApprovalStore, P7.1 TSP, and External Action Boundary\n",
    "## 24. D1 and SQL Boundary\n",
    "## 25. Privacy and Redaction Boundary\n",
    "## 26. Future Implementation Requirements\n",
    "## 27. No-Go Conditions\n",
    "## 28. Non-authorization Statement\n",
  ])
})

// ─── Spec: required sentences ───────────────────────────────────

test("Recorder Audit Summary Spec contains the required definition and Japanese sentences", () => {
  requireAll(read(SPEC), "SPEC sentences", [
    "P6-I5K defines the recorder audit summary shape for Phase 6 in-memory test-only Persistence Audit Evidence recorder behavior, but it does not implement recorder summary runtime, audit runtime, audit event emission, persistence, durable storage, D1 access, SQL execution, Evidence Ledger append, Graph Model write, ApprovalStore integration, external action execution, Formal WorkUnit promotion, or production readiness.",
    "P6-I5K Recorder Audit Summary Specとは、Phase 6のin-memory test-only Persistence Audit Evidence recorderの挙動を将来どのようなsummaryとして表現するかを定義する仕様であり、summary runtime実装・audit runtime実装・audit event emission・persistence実装・durable storage・D1アクセス・SQL実行・Evidence Ledger append・Graph Model write・ApprovalStore連携・external action実行・Formal WorkUnit promotion・production readinessを意味しない。",
  ])
})

// ─── Spec: not-summary items ────────────────────────────────────

test("Recorder Audit Summary Spec lists all not-summary items", () => {
  requireAll(read(SPEC), "SPEC not-summary", [
    "- truth\n",
    "- approval\n",
    "- execution permission\n",
    "- audit runtime\n",
    "- audit event emitter\n",
    "- summary runtime\n",
    "- persistence permission\n",
    "- durable storage\n",
    "- production readiness\n",
    "- Formal WorkUnit promotion\n",
    "- ApprovalStore approval\n",
    "- Evidence Ledger append\n",
    "- Graph Model write\n",
    "- D1 access\n",
    "- SQL execution\n",
    "- external action authorization\n",
    "- automated decision-making\n",
  ])
})

// ─── Spec: invariants ───────────────────────────────────────────

test("Recorder Audit Summary Spec contains product and safety invariants", () => {
  requireAll(read(SPEC), "SPEC invariants", [
    "AI proposes. Rules guard. Humans decide.",
    "Recorder audit summary is descriptive, not authorizing.",
    "Recorder audit summary must not approve anything.",
    "Recorder audit summary must not execute anything.",
    "Recorder audit summary must not emit audit events.",
    "Recorder audit summary must not append Evidence Ledger.",
    "Recorder audit summary must not write Graph Model.",
    "Recorder audit summary must not promote a WorkUnit.",
    "Recorder audit summary must not make evidence true.",
    "Recorder audit summary must not make recorder success into persistence.",
    "Recorder audit summary must not make in-memory recording durable.",
  ])
})

// ─── Spec: required inputs ──────────────────────────────────────

test("Recorder Audit Summary Spec contains required inputs from P6-I5J", () => {
  requireAll(read(SPEC), "SPEC inputs", [
    "P6-I5J merged into main",
    "in-memory test-only recorder exists",
    "recorder is test-only",
    "recorder is in-memory only",
    "recorder is non-durable",
    "recorder is tenant-scoped",
    "recorder validates through P6-I5G validators",
    "recorder works with P6-I5I fixtures",
    "recorder handles idempotent duplicates",
    "recorder rejects duplicate conflicts",
    "recorder returns deterministic ordering by created_at then audit_event_id",
    "recorder has no app runtime wiring",
    "recorder has no D1 access",
    "recorder has no SQL execution",
    "recorder has no Evidence Ledger append",
    "recorder has no Graph Model write",
    "recorder has no ApprovalStore integration",
    "recorder has no external action execution",
  ])
})

// ─── Spec: summarized operations ────────────────────────────────

const RECORDER_OPERATIONS = [
  "recordAuditEvent",
  "getAuditEvent",
  "listAuditEvents",
  "countAuditEvents",
  "clearTenantAuditEvents",
  "clearAllAuditEvents",
] as const

test("Recorder Audit Summary Spec contains all summarized recorder operations", () => {
  requireAll(read(SPEC), "SPEC operations", RECORDER_OPERATIONS)
})

// ─── Spec: summary shape fields ─────────────────────────────────

const SUMMARY_FIELDS = [
  "summary_id",
  "tenant_id",
  "recorder_target_class",
  "selected_target_class",
  "summary_scope",
  "summarized_operation_names",
  "total_record_attempts",
  "accepted_record_count",
  "rejected_record_count",
  "stored_event_count",
  "returned_event_count",
  "listed_event_count",
  "cleared_event_count",
  "not_found_count",
  "validation_failed_count",
  "tenant_mismatch_count",
  "duplicate_conflict_count",
  "idempotent_duplicate_count",
  "forbidden_target_class_count",
  "recorder_exception_count",
  "operation_counts",
  "status_counts",
  "outcome_counts",
  "validation_result_counts",
  "issue_code_counts",
  "no_go_flag_counts",
  "fixture_coverage",
  "tenant_scope_summary",
  "deterministic_ordering_summary",
  "defensive_snapshot_summary",
  "non_durability_summary",
  "clear_scope_summary",
  "failure_summary",
  "redaction_summary",
  "source_loop",
  "source_recorder_loop",
  "source_fixture_loop",
  "source_validator_loop",
  "created_at",
  "payload_hash",
  "non_authorization_statement",
  "no_go_flags",
] as const

test("Recorder Audit Summary Spec contains all summary shape fields", () => {
  requireAll(read(SPEC), "SPEC fields", SUMMARY_FIELDS)
})

test("Recorder Audit Summary Spec contains all summary scope values and count enums", () => {
  requireAll(read(SPEC), "SPEC enums", [
    "tenant, all_test_memory, operation_subset, fixture_suite",
    "record, get, list, count, clear_tenant, clear_all",
    "attempted, accepted, rejected, not_found, cleared, blocked_no_go",
    "pass, warn, fail, no_go",
    "validator_passed, validator_failed, validator_not_applicable",
    "validator_not_run_no_go",
  ])
})

// ─── Spec: summary subsections ──────────────────────────────────

test("Recorder Audit Summary Spec contains operation count summary", () => {
  requireAll(read(SPEC), "SPEC op count", [
    "total record attempts",
    "accepted record count",
    "rejected record count",
    "stored event count",
    "returned event count",
    "listed event count",
    "cleared event count",
    "not found count",
    "failure counts",
    "counts are descriptive only",
  ])
})

test("Recorder Audit Summary Spec contains status and outcome summary", () => {
  requireAll(read(SPEC), "SPEC status/outcome", [
    "accepted count",
    "rejected count",
    "not_found count",
    "cleared count",
    "blocked_no_go count",
    "pass count",
    "warn count",
    "fail count",
    "no_go count",
    "status/outcome summary is not approval",
  ])
})

test("Recorder Audit Summary Spec contains validation result summary", () => {
  requireAll(read(SPEC), "SPEC validation", [
    "validation pass count",
    "validation failure count",
    "validator_not_applicable count",
    "validator_not_run_no_go count",
    "validator pass is not truth",
    "validator pass is not persistence permission",
    "validation failure is not approval",
  ])
})

test("Recorder Audit Summary Spec contains duplicate and idempotency summary", () => {
  requireAll(read(SPEC), "SPEC duplicate", [
    "first write count",
    "idempotent duplicate count",
    "duplicate conflict count",
    "duplicate conflict must be fail-closed",
    "duplicate conflict must not overwrite prior event",
    "duplicate handling summary is not durable persistence",
  ])
})

test("Recorder Audit Summary Spec contains clear operation summary", () => {
  requireAll(read(SPEC), "SPEC clear", [
    "tenant clear count",
    "all-test-memory clear count",
    "cleared_event_count",
    "clearTenantAuditEvents remains tenant scoped",
    "clearAllAuditEvents remains test-only",
    "clear summary is not production capability",
  ])
})

test("Recorder Audit Summary Spec contains not-found and failure summary", () => {
  requireAll(read(SPEC), "SPEC failure", [
    "not_found count",
    "invalid_input count",
    "invalid_event count",
    "validation_failed count",
    "tenant_mismatch count",
    "duplicate_conflict count",
    "forbidden_target_class count",
    "recorder_exception count",
    "stable issue codes only",
    "failure summary must not echo raw payloads",
  ])
})

test("Recorder Audit Summary Spec contains defensive snapshot summary", () => {
  requireAll(read(SPEC), "SPEC snapshot", [
    "frozen snapshot count",
    "defensive clone count",
    "mutation blocked or non-mutating behavior",
    "returned events must not become authorization",
    "returned events must not become persistence evidence",
    "snapshot summary is not durability evidence",
  ])
})

test("Recorder Audit Summary Spec contains non-durability summary", () => {
  requireAll(read(SPEC), "SPEC non-durability", [
    "recorder is in-memory only",
    "recorder does not survive process restart",
    "summary must not claim durability",
    "summary must not claim persisted record",
    "summary must not claim storage backend write",
    "process-lifetime-only wording required",
  ])
})

test("Recorder Audit Summary Spec contains fixture coverage summary", () => {
  requireAll(read(SPEC), "SPEC fixture coverage", [
    "put fixture coverage",
    "get fixture coverage",
    "list fixture coverage",
    "count fixture coverage",
    "clear_tenant fixture coverage",
    "clear_all fixture coverage",
    "blocked_no_go fixture coverage",
    "fixture coverage is not production coverage",
    "fixture coverage is not release readiness",
  ])
})

// ─── Spec: boundaries ───────────────────────────────────────────

test("Recorder Audit Summary Spec contains recorder boundary", () => {
  requireAll(read(SPEC), "SPEC recorder boundary", [
    "P6-I5K does not modify the recorder",
    "P6-I5K does not implement recorder summary runtime",
    "P6-I5K does not add summary emitters",
    "P6-I5K does not make the recorder production-ready",
    "P6-I5K does not add app runtime wiring",
  ])
})

test("Recorder Audit Summary Spec contains Evidence Ledger boundary", () => {
  requireAll(read(SPEC), "SPEC ledger boundary", [
    "P6-I5K does not append ALPHA_EVIDENCE_LEDGER",
    "P6-I5K does not modify ALPHA_EVIDENCE_LEDGER",
    "recorder summary may be future input to an Evidence Ledger gate",
    "recorder summary is not a ledger entry by itself",
    "ledger linkage remains future-gated",
  ])
})

test("Recorder Audit Summary Spec contains Graph Model boundary", () => {
  requireAll(read(SPEC), "SPEC graph boundary", [
    "P6-I5K does not create graph nodes",
    "P6-I5K does not create graph edges",
    "P6-I5K does not implement GraphRAG",
    "recorder summary may be future input to a graph linkage gate",
    "graph linkage remains future-gated",
  ])
})

test("Recorder Audit Summary Spec contains ApprovalStore/P7.1/external action boundary", () => {
  requireAll(read(SPEC), "SPEC approval boundary", [
    "recorder summary has no ApprovalStore authority",
    "recorder summary is not ApprovalStore approval",
    "P7.1 TSP utilities remain unwired",
    "recorder summary cannot satisfy approval requirements",
    "recorder summary cannot execute external actions",
    "recorder summary cannot authorize sends, posts, creates, updates, deletes, shares, commits, or publishes",
    "external action execution remains blocked",
  ])
})

test("Recorder Audit Summary Spec contains D1/SQL boundary", () => {
  requireAll(read(SPEC), "SPEC d1/sql boundary", [
    "P6-I5K does not permit D1 access",
    "P6-I5K does not permit D1 bindings",
    "P6-I5K does not permit D1 migrations",
    "P6-I5K does not permit SQL execution",
    "P6-I5K does not permit SQL mutation",
    "future D1 read-only execution remains P6-I6 or later",
    "D1 persistence requires a separate D1 persistence gate",
    "SQL compilation and SQL execution remain separately gated",
  ])
})

test("Recorder Audit Summary Spec contains privacy/redaction boundary", () => {
  requireAll(read(SPEC), "SPEC privacy boundary", [
    "recorder summary must not echo secret-like values",
    "failure reasons must use stable codes",
    "issue counts must not include raw payloads",
    "tenant_id may be present as scoped identifier",
    "raw events should be omitted unless future gate permits them",
    "payload_hash may be included",
    "redaction failure is No-Go",
  ])
})

test("Recorder Audit Summary Spec contains future implementation requirements", () => {
  requireAll(read(SPEC), "SPEC future", [
    "P6-I5L must have explicit human Go if recorder audit summary types and validators are implemented",
    "P6-I5L must verify P6-I5K merged into main",
    "P6-I5L must implement types and validators only if selected",
    "P6-I5L must not implement summary runtime unless a later gate permits it",
    "P6-I5L must not emit audit events",
    "P6-I5L must not append Evidence Ledger",
    "P6-I5L must not write Graph Model",
    "P6-I5L must not implement durable storage",
    "P6-I5L must not access D1",
    "P6-I5L must not execute SQL",
    "P6-I5L must preserve non-authorization boundary",
  ])
})

// ─── Spec: No-Go conditions ─────────────────────────────────────

test("Recorder Audit Summary Spec contains all No-Go conditions", () => {
  requireAll(read(SPEC), "SPEC no-go", [
    "p6_i5j_not_merged",
    "missing_foundation_file",
    "missing_explicit_human_go",
    "app_runtime_changed",
    "recorder_summary_runtime_implemented",
    "summary_emitter_implemented",
    "audit_runtime_implemented",
    "audit_event_emitter_implemented",
    "persistence_implementation_added",
    "durable_storage_added",
    "repository_added",
    "production_adapter_added",
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
    "recorder_summary_treated_as_approval",
    "recorder_summary_treated_as_execution",
    "recorder_summary_treated_as_persistence",
    "recorder_summary_treated_as_durable_storage",
    "recorder_summary_treated_as_production_readiness",
    "recorder_summary_treated_as_audit_runtime",
    "recorder_summary_treated_as_audit_event_emission",
    "evidence_ledger_append_added",
    "graph_write_added",
    "raw_event_payload_echo_allowed",
    "secret_like_value_echo_allowed",
    "redaction_failure_allowed",
    "tenant_scope_bypassed",
    "validator_result_bypassed",
    "duplicate_conflict_treated_as_success",
    "clear_all_treated_as_production_capability",
    "ruleset_weakened",
    "validation_failed",
  ])
})

test("Recorder Audit Summary Spec contains the non-authorization statement", () => {
  requireAll(read(SPEC), "SPEC non-auth", [
    "This P6-I5K Recorder Audit Summary Spec authorizes no recorder summary runtime implementation, no summary emitter implementation, no audit runtime implementation, no audit event emitter implementation, no persistence implementation, no durable storage implementation, no repository implementation, no production storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no Evidence Ledger append, no Graph Model write, no deployment, no release, no production readiness, and no automated decision-making.",
  ])
})

// ─── Contract: 22 sections ──────────────────────────────────────

test("Recorder Audit Summary Contract contains all 22 required sections", () => {
  requireAll(read(CONTRACT), "CONTRACT sections", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Definition of Recorder Audit Summary Record\n",
    "## 4. What Recorder Audit Summary Record Is Not\n",
    "## 5. Required Fields\n",
    "## 6. Summary Scope Values\n",
    "## 7. Recorder Operation Names\n",
    "## 8. Count Fields\n",
    "## 9. Operation Count Fields\n",
    "## 10. Status and Outcome Count Fields\n",
    "## 11. Validation Count Fields\n",
    "## 12. Issue and No-Go Count Fields\n",
    "## 13. Fixture Coverage Fields\n",
    "## 14. Tenant and Ordering Fields\n",
    "## 15. Defensive Snapshot and Non-durability Fields\n",
    "## 16. Clear and Failure Fields\n",
    "## 17. Source and Lineage Fields\n",
    "## 18. Relationship to Evidence Ledger\n",
    "## 19. Relationship to Graph Model\n",
    "## 20. Relationship to Approval and Execution\n",
    "## 21. Validation Rules\n",
    "## 22. Non-authorization Statement\n",
  ])
})

test("Recorder Audit Summary Contract contains the required definition and Japanese sentences", () => {
  requireAll(read(CONTRACT), "CONTRACT sentences", [
    "A Recorder Audit Summary Record is a future non-authorizing summary shape for describing Phase 6 in-memory test-only Persistence Audit Evidence recorder behavior.",
    "Recorder Audit Summary Recordとは、Phase 6のin-memory test-only Persistence Audit Evidence recorderの挙動を説明するための将来の非認可summary shapeであり、truth・approval・execution permission・audit runtime・audit event emission・persistence permission・durable storage・production readinessを意味しない。",
  ])
})

test("Recorder Audit Summary Contract lists all not-record items", () => {
  requireAll(read(CONTRACT), "CONTRACT not-record", [
    "- truth\n",
    "- approval\n",
    "- ApprovalStore approval\n",
    "- execution permission\n",
    "- audit runtime\n",
    "- audit event emitter\n",
    "- summary runtime\n",
    "- persistence permission\n",
    "- durable storage\n",
    "- D1 record\n",
    "- SQL result\n",
    "- Evidence Ledger entry by itself\n",
    "- Graph Model node\n",
    "- Graph Model edge\n",
    "- repository operation\n",
    "- production adapter operation\n",
    "- external action authorization\n",
    "- Formal WorkUnit promotion\n",
    "- production readiness\n",
  ])
})

test("Recorder Audit Summary Contract contains all required fields", () => {
  requireAll(read(CONTRACT), "CONTRACT fields", SUMMARY_FIELDS)
})

test("Recorder Audit Summary Contract contains all summary scope values", () => {
  requireAll(read(CONTRACT), "CONTRACT scope values", [
    "- tenant\n",
    "- all_test_memory\n",
    "- operation_subset\n",
    "- fixture_suite\n",
  ])
})

test("Recorder Audit Summary Contract contains all recorder operation names", () => {
  requireAll(read(CONTRACT), "CONTRACT op names", RECORDER_OPERATIONS)
})

test("Recorder Audit Summary Contract contains count field requirements", () => {
  requireAll(read(CONTRACT), "CONTRACT count req", [
    "All count fields must be non-negative integers in future validators.",
  ])
})

test("Recorder Audit Summary Contract contains operation count fields", () => {
  requireAll(read(CONTRACT), "CONTRACT op counts", [
    "- record\n",
    "- get\n",
    "- list\n",
    "- count\n",
    "- clear_tenant\n",
    "- clear_all\n",
  ])
})

test("Recorder Audit Summary Contract contains status and outcome count fields", () => {
  requireAll(read(CONTRACT), "CONTRACT status/outcome", [
    "- attempted\n",
    "- accepted\n",
    "- rejected\n",
    "- not_found\n",
    "- cleared\n",
    "- blocked_no_go\n",
    "- pass\n",
    "- warn\n",
    "- fail\n",
    "- no_go\n",
  ])
})

test("Recorder Audit Summary Contract contains validation count fields", () => {
  requireAll(read(CONTRACT), "CONTRACT validation", [
    "- validator_passed\n",
    "- validator_failed\n",
    "- validator_not_applicable\n",
    "- validator_not_run_no_go\n",
  ])
})

test("Recorder Audit Summary Contract contains issue and no-go count fields", () => {
  requireAll(read(CONTRACT), "CONTRACT issue counts", [
    "- invalid_input\n",
    "- invalid_event\n",
    "- validation_failed\n",
    "- tenant_mismatch\n",
    "- duplicate_conflict\n",
    "- forbidden_target_class\n",
    "- recorder_exception\n",
    "- blocked_no_go\n",
    "- validation_failed no-go flag\n",
    "- stable issue codes only\n",
  ])
})

test("Recorder Audit Summary Contract contains fixture coverage fields", () => {
  requireAll(read(CONTRACT), "CONTRACT fixture fields", [
    "put_fixture_covered",
    "get_fixture_covered",
    "list_fixture_covered",
    "count_fixture_covered",
    "clear_tenant_fixture_covered",
    "clear_all_fixture_covered",
    "blocked_no_go_fixture_covered",
    "all_required_fixtures_covered",
  ])
})

test("Recorder Audit Summary Contract contains tenant and ordering fields", () => {
  requireAll(read(CONTRACT), "CONTRACT tenant/ordering", [
    "tenant_scope_summary",
    "cross_tenant_blocked_count",
    "tenant_mismatch_count",
    "deterministic_ordering_summary",
    "ordering_key_created_at",
    "ordering_key_audit_event_id",
  ])
})

test("Recorder Audit Summary Contract contains defensive snapshot and non-durability fields", () => {
  requireAll(read(CONTRACT), "CONTRACT snapshot fields", [
    "defensive_snapshot_summary",
    "frozen_snapshot_count",
    "defensive_clone_count",
    "mutation_blocked_count",
    "non_durability_summary",
    "process_lifetime_only",
    "durability_claimed",
  ])
})

test("Recorder Audit Summary Contract contains clear and failure fields", () => {
  requireAll(read(CONTRACT), "CONTRACT clear/failure", [
    "clear_scope_summary",
    "clear_tenant_count",
    "clear_all_count",
    "cleared_event_count",
    "not_found_count",
    "failure_summary",
    "redaction_summary",
  ])
})

test("Recorder Audit Summary Contract contains source and lineage fields", () => {
  requireAll(read(CONTRACT), "CONTRACT source fields", [
    "source_loop",
    "source_recorder_loop",
    "source_fixture_loop",
    "source_validator_loop",
    "source_summary_spec_loop",
    "source_recorder_pr",
    "source_fixture_pr",
    "source_validator_pr",
  ])
})

test("Recorder Audit Summary Contract contains Evidence Ledger relationship", () => {
  requireAll(read(CONTRACT), "CONTRACT ledger rel", [
    "Recorder Audit Summary Record is not an Evidence Ledger entry by itself.",
    "P6-I5K does not append ALPHA_EVIDENCE_LEDGER.",
    "P6-I5K does not modify ALPHA_EVIDENCE_LEDGER.",
    "Future ledger linkage requires a separate gate.",
  ])
})

test("Recorder Audit Summary Contract contains Graph Model relationship", () => {
  requireAll(read(CONTRACT), "CONTRACT graph rel", [
    "Recorder Audit Summary Record is not a Graph Model node by itself.",
    "Recorder Audit Summary Record is not a Graph Model edge by itself.",
    "P6-I5K does not write Graph Model.",
    "Future graph linkage requires a separate gate.",
  ])
})

test("Recorder Audit Summary Contract contains approval and execution relationship", () => {
  requireAll(read(CONTRACT), "CONTRACT approval rel", [
    "Recorder Audit Summary Record is not approval.",
    "Recorder Audit Summary Record is not ApprovalStore approval.",
    "Recorder Audit Summary Record is not execution permission.",
    "Recorder Audit Summary Record cannot execute external actions.",
    "Recorder Audit Summary Record cannot promote Formal WorkUnits.",
  ])
})

test("Recorder Audit Summary Contract contains validation rules", () => {
  requireAll(read(CONTRACT), "CONTRACT rules", [
    "missing summary_id is No-Go",
    "missing tenant_id is No-Go",
    "missing summary_scope is No-Go",
    "unknown summary_scope is No-Go",
    "missing summarized_operation_names is No-Go",
    "unknown recorder operation name is No-Go",
    "recorder_target_class other than in_memory_test_only_store is No-Go",
    "selected_target_class other than in_memory_test_only_store is No-Go",
    "negative count is No-Go",
    "non-integer count is No-Go",
    "missing operation_counts is No-Go",
    "missing status_counts is No-Go",
    "missing outcome_counts is No-Go",
    "missing validation_result_counts is No-Go",
    "duplicate_conflict treated as success is No-Go",
    "clear_all treated as production capability is No-Go",
    "recorder summary treated as truth is No-Go",
    "recorder summary treated as approval is No-Go",
    "recorder summary treated as execution permission is No-Go",
    "recorder summary treated as audit runtime is No-Go",
    "recorder summary treated as audit event emission is No-Go",
    "recorder summary treated as persistence is No-Go",
    "recorder summary treated as durable storage is No-Go",
    "recorder summary treated as production readiness is No-Go",
    "raw event payload included without future gate is No-Go",
    "secret-like value echoed is No-Go",
  ])
})

test("Recorder Audit Summary Contract contains the non-authorization statement", () => {
  requireAll(read(CONTRACT), "CONTRACT non-auth", [
    "This Recorder Audit Summary Contract authorizes no recorder summary runtime implementation, no summary emitter implementation, no audit runtime implementation, no audit event emitter implementation, no persistence implementation, no durable storage implementation, no repository implementation, no production storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no Evidence Ledger append, no Graph Model write, no deployment, no release, no production readiness, and no automated decision-making.",
  ])
})

// ─── P6-FIX-007e (Issue #121): intentional one-way No-Go relationship ────────
//
// All three Recorder Audit Summary documents must document that the
// no_go_flags → blocked/no-go-evidence relationship is intentionally one-way,
// pinning each implication direction independently. The P6-I5L document is now
// read here in addition to the spec and contract.

test("P6-I5L types/validators document exists", () => {
  assert.ok(
    existsSync(fileURLToPath(new URL(TYPES_VALIDATORS, import.meta.url))),
    `${TYPES_VALIDATORS} must exist`,
  )
})

test("all three documents state the relationship is intentionally one-way", () => {
  for (const [rel, label] of [
    [SPEC, "SPEC"],
    [CONTRACT, "CONTRACT"],
    [TYPES_VALIDATORS, "TYPES_VALIDATORS"],
  ] as const) {
    requireAll(read(rel), label, ["The relationship is intentionally one-way."])
  }
})

test("all three documents pin the forward implication (flags require evidence)", () => {
  for (const [rel, label] of [
    [SPEC, "SPEC"],
    [CONTRACT, "CONTRACT"],
    [TYPES_VALIDATORS, "TYPES_VALIDATORS"],
  ] as const) {
    requireAll(read(rel), label, ["Non-empty no_go_flags requires blocked/no-go evidence"])
  }
})

test("all three documents pin the intentionally-false reverse implication", () => {
  for (const [rel, label] of [
    [SPEC, "SPEC"],
    [CONTRACT, "CONTRACT"],
    [TYPES_VALIDATORS, "TYPES_VALIDATORS"],
  ] as const) {
    requireAll(read(rel), label, ["Blocked/no-go evidence does not require non-empty no_go_flags"])
  }
})

test("spec and contract pin evidence-without-flags as valid; types doc marks it a deliberate decision", () => {
  requireAll(read(SPEC), "SPEC", [
    "Aggregate blocked/no-go evidence with no_go_flags: [] is valid",
    "Aggregate evidence must not be promoted into a current summary-level No-Go",
  ])
  requireAll(read(CONTRACT), "CONTRACT", [
    "Valid: blocked/no-go count > 0 and no_go_flags is empty.",
    "Invalid: no_go_flags is non-empty and both blocked/no-go counts are zero",
  ])
  requireAll(read(TYPES_VALIDATORS), "TYPES_VALIDATORS", [
    "deliberate design decision, not an omitted",
    "must not infer or synthesize `no_go_flags` from aggregate counts",
  ])
})
