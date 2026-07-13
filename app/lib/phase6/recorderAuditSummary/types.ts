/**
 * P6-I5L: Phase 6 Recorder Audit Summary types
 * (docs/P6_I5L_RECORDER_AUDIT_SUMMARY_TYPES_VALIDATORS.md, grounded in
 * docs/P6_I5K_RECORDER_AUDIT_SUMMARY_SPEC.md and
 * docs/P6_I5K_RECORDER_AUDIT_SUMMARY_CONTRACT.md).
 *
 * INERT TYPES ONLY — no recorder summary runtime, no summary emitter, no audit
 * runtime, no audit event emitter, no constructors, no storage, no persistence,
 * no repository, no adapter, no database schema, no database access, no
 * query-language execution, no Evidence Ledger append, no Graph Model write, no
 * I/O. Type validity is not truth. Validation pass (see ./validators.ts) is not
 * approval, not execution permission, not summary runtime, not audit runtime,
 * not audit event emission, not persistence, not durable storage, and not
 * production readiness.
 *
 * This module is isolated under app/lib/phase6/recorderAuditSummary/: it imports
 * nothing from app runtime, app/lib/persistence, app/lib/phase6/
 * persistenceAuditEvidence, app/lib/phase6/persistenceTargetDecision,
 * app/lib/phase6/artifacts, app/lib/security/approvalMac, test fixtures, test
 * harnesses, database clients, query-language execution, approval-store, or
 * P7.1 utilities. The recorder and selected target class are fixed to exactly
 * `in_memory_test_only_store`.
 *
 * The RecorderAuditSummaryRecord deliberately carries NO grant-like field
 * (approval, approved, authorized, execution_permission, executed,
 * promotion_permission, promoted, persistence_permission, persisted,
 * storage_permission, stored, durable_storage_permission,
 * evidence_ledger_append_permission, graph_write_permission,
 * external_action_permission, formal_workunit_promotion,
 * approvalstore_approval, summary_runtime_permission, audit_emission_permission,
 * starthub_execution_permission): describing a recorder summary cannot express
 * authorization.
 */

// ─── Primitives ─────────────────────────────────────────────────

/** ISO-8601 UTC, e.g. 2026-07-08T12:34:56Z or with .mmm milliseconds. */
export type IsoTimestamp = string
/** 64-character lowercase hex SHA-256 digest. */
export type Sha256Hex = string

// ─── The one fixed recorder/selected target class ───────────────

/** The one and only permitted recorder/selected target class (P6-I5A..K). */
export const RECORDER_AUDIT_TARGET_CLASSES = ["in_memory_test_only_store"] as const
export type RecorderAuditTargetClass = (typeof RECORDER_AUDIT_TARGET_CLASSES)[number]

// ─── Enums (literal unions) with runtime value lists ────────────

export const RECORDER_AUDIT_SUMMARY_SCOPES = [
  "tenant",
  "all_test_memory",
  "operation_subset",
  "fixture_suite",
] as const
export type RecorderAuditSummaryScope = (typeof RECORDER_AUDIT_SUMMARY_SCOPES)[number]

export const RECORDER_AUDIT_OPERATION_NAMES = [
  "recordAuditEvent",
  "getAuditEvent",
  "listAuditEvents",
  "countAuditEvents",
  "clearTenantAuditEvents",
  "clearAllAuditEvents",
] as const
export type RecorderAuditOperationName = (typeof RECORDER_AUDIT_OPERATION_NAMES)[number]

export const RECORDER_AUDIT_OPERATION_COUNT_KEYS = [
  "record",
  "get",
  "list",
  "count",
  "clear_tenant",
  "clear_all",
] as const
export type RecorderAuditOperationCountKey = (typeof RECORDER_AUDIT_OPERATION_COUNT_KEYS)[number]

export const RECORDER_AUDIT_STATUS_COUNT_KEYS = [
  "attempted",
  "accepted",
  "rejected",
  "not_found",
  "cleared",
  "blocked_no_go",
] as const
export type RecorderAuditStatusCountKey = (typeof RECORDER_AUDIT_STATUS_COUNT_KEYS)[number]

export const RECORDER_AUDIT_OUTCOME_COUNT_KEYS = ["pass", "warn", "fail", "no_go"] as const
export type RecorderAuditOutcomeCountKey = (typeof RECORDER_AUDIT_OUTCOME_COUNT_KEYS)[number]

export const RECORDER_AUDIT_VALIDATION_RESULT_COUNT_KEYS = [
  "validator_passed",
  "validator_failed",
  "validator_not_applicable",
  "validator_not_run_no_go",
] as const
export type RecorderAuditValidationResultCountKey =
  (typeof RECORDER_AUDIT_VALIDATION_RESULT_COUNT_KEYS)[number]

export const RECORDER_AUDIT_ISSUE_CODES = [
  "invalid_input",
  "invalid_event",
  "validation_failed",
  "tenant_mismatch",
  "duplicate_conflict",
  "forbidden_target_class",
  "recorder_exception",
  "blocked_no_go",
] as const
export type RecorderAuditIssueCode = (typeof RECORDER_AUDIT_ISSUE_CODES)[number]

export const RECORDER_AUDIT_NO_GO_FLAGS = [
  "p6_i5j_not_merged",
  "missing_foundation_file",
  "missing_explicit_human_go",
  "recorder_summary_runtime_implemented",
  "summary_emitter_implemented",
  "audit_runtime_implemented",
  "audit_event_emitter_implemented",
  "persistence_implementation_added",
  "durable_storage_added",
  "d1_access_added",
  "sql_execution_added",
  "evidence_ledger_append_added",
  "graph_write_added",
  "recorder_summary_treated_as_approval",
  "recorder_summary_treated_as_execution",
  "recorder_summary_treated_as_persistence",
  "recorder_summary_treated_as_durable_storage",
  "recorder_summary_treated_as_production_readiness",
  "raw_event_payload_echo_allowed",
  "secret_like_value_echo_allowed",
  "redaction_failure_allowed",
  "tenant_scope_bypassed",
  "validator_result_bypassed",
  "duplicate_conflict_treated_as_success",
  "clear_all_treated_as_production_capability",
  "validation_failed",
] as const
export type RecorderAuditNoGoFlag = (typeof RECORDER_AUDIT_NO_GO_FLAGS)[number]

export const RECORDER_AUDIT_FIXTURE_COVERAGE_FIELDS = [
  "put_fixture_covered",
  "get_fixture_covered",
  "list_fixture_covered",
  "count_fixture_covered",
  "clear_tenant_fixture_covered",
  "clear_all_fixture_covered",
  "blocked_no_go_fixture_covered",
  "all_required_fixtures_covered",
] as const
export type RecorderAuditFixtureCoverageField =
  (typeof RECORDER_AUDIT_FIXTURE_COVERAGE_FIELDS)[number]

/** Every fixture coverage field is boolean. */
export type RecorderAuditFixtureCoverage = {
  readonly [K in RecorderAuditFixtureCoverageField]: boolean
}

/** A readonly record-like count map covering exactly the keys of K. */
export type RecorderAuditCountMap<K extends string> = {
  readonly [P in K]: number
}

// ─── Recorder Audit Summary Record ──────────────────────────────

export type RecorderAuditSummaryRecord = {
  readonly summary_id: string
  readonly tenant_id: string
  /** Must be exactly "in_memory_test_only_store". */
  readonly recorder_target_class: RecorderAuditTargetClass
  /** Must be exactly "in_memory_test_only_store". */
  readonly selected_target_class: RecorderAuditTargetClass
  readonly summary_scope: RecorderAuditSummaryScope
  readonly summarized_operation_names: readonly RecorderAuditOperationName[]
  readonly total_record_attempts: number
  readonly accepted_record_count: number
  readonly rejected_record_count: number
  readonly stored_event_count: number
  readonly returned_event_count: number
  readonly listed_event_count: number
  readonly cleared_event_count: number
  readonly not_found_count: number
  readonly validation_failed_count: number
  readonly tenant_mismatch_count: number
  readonly duplicate_conflict_count: number
  readonly idempotent_duplicate_count: number
  readonly forbidden_target_class_count: number
  readonly recorder_exception_count: number
  readonly operation_counts: RecorderAuditCountMap<RecorderAuditOperationCountKey>
  readonly status_counts: RecorderAuditCountMap<RecorderAuditStatusCountKey>
  readonly outcome_counts: RecorderAuditCountMap<RecorderAuditOutcomeCountKey>
  readonly validation_result_counts: RecorderAuditCountMap<RecorderAuditValidationResultCountKey>
  readonly issue_code_counts: RecorderAuditCountMap<RecorderAuditIssueCode>
  readonly no_go_flag_counts: RecorderAuditCountMap<RecorderAuditNoGoFlag>
  readonly fixture_coverage: RecorderAuditFixtureCoverage
  readonly tenant_scope_summary: string
  readonly deterministic_ordering_summary: string
  readonly defensive_snapshot_summary: string
  readonly non_durability_summary: string
  readonly clear_scope_summary: string
  readonly failure_summary: string
  readonly redaction_summary: string
  readonly source_loop: string
  readonly source_recorder_loop: string
  readonly source_fixture_loop: string
  readonly source_validator_loop: string
  readonly created_at: IsoTimestamp
  readonly payload_hash: Sha256Hex
  readonly non_authorization_statement: string
  readonly no_go_flags: readonly RecorderAuditNoGoFlag[]
}
