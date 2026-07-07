/**
 * P6-I5G: Phase 6 Persistence Audit Evidence types
 * (docs/P6_I5G_PERSISTENCE_AUDIT_EVIDENCE_TYPES_VALIDATORS.md, grounded in
 * docs/P6_I5F_PERSISTENCE_AUDIT_EVENT_CONTRACT.md and
 * docs/P6_I5F_PERSISTENCE_AUDIT_EVIDENCE_SPEC.md).
 *
 * INERT TYPES ONLY — no audit runtime, no audit event emitter, no constructors,
 * no storage, no persistence, no repository, no adapter, no database schema, no
 * database access, no query-language execution, no Evidence Ledger append, no
 * Graph Model write, no I/O. Type validity is not truth. Validation pass is not
 * approval, not execution permission, not audit runtime, not persistence, not
 * durable storage, and not production readiness.
 *
 * This module is isolated under app/lib/phase6/persistenceAuditEvidence/: it
 * imports nothing from app runtime, app/lib/persistence,
 * app/lib/phase6/persistenceTargetDecision, app/lib/phase6/artifacts,
 * app/lib/security/approvalMac, test fixtures, test harnesses, database clients,
 * query-language execution, approval-store, or P7.1 utilities. The adapter and
 * selected target class are fixed to exactly `in_memory_test_only_store`.
 *
 * The PersistenceAuditEvent deliberately carries NO grant-like field (approval,
 * approved, authorized, execution_permission, executed, promotion_permission,
 * promoted, persistence_permission, persisted, storage_permission, stored,
 * durable_storage_permission, evidence_ledger_append_permission,
 * graph_write_permission, external_action_permission, formal_workunit_promotion,
 * approvalstore_approval): describing an operation cannot express authorization.
 */

// ─── Primitives ─────────────────────────────────────────────────

/** ISO-8601 UTC, e.g. 2026-07-07T12:34:56Z or with .mmm milliseconds. */
export type IsoTimestamp = string
/** 64-character lowercase hex SHA-256 digest. */
export type Sha256Hex = string
export type PersistenceAuditNoGoFlag = (typeof PERSISTENCE_AUDIT_NO_GO_FLAGS)[number]

// ─── The one fixed selectable/adapter target class ──────────────

/** The one and only permitted adapter/selected target class (P6-I5A..F). */
export const PERSISTENCE_AUDIT_TARGET_CLASSES = ["in_memory_test_only_store"] as const
export type PersistenceAuditTargetClass = (typeof PERSISTENCE_AUDIT_TARGET_CLASSES)[number]

/** Deferred target classes — never valid as adapter/selected target. */
export const PERSISTENCE_AUDIT_DEFERRED_TARGET_CLASSES = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
] as const

/** Rejected target classes — never valid as adapter/selected target. */
export const PERSISTENCE_AUDIT_REJECTED_TARGET_CLASSES = ["blocked_target"] as const

// ─── Enums (literal unions) with runtime value lists ────────────

export const PERSISTENCE_AUDIT_OPERATIONS = [
  "put",
  "get",
  "list",
  "count",
  "clear_tenant",
  "clear_all",
] as const
export type PersistenceAuditOperation = (typeof PERSISTENCE_AUDIT_OPERATIONS)[number]

export const PERSISTENCE_AUDIT_OPERATION_STATUSES = [
  "attempted",
  "accepted",
  "rejected",
  "not_found",
  "cleared",
  "blocked_no_go",
] as const
export type PersistenceAuditOperationStatus =
  (typeof PERSISTENCE_AUDIT_OPERATION_STATUSES)[number]

export const PERSISTENCE_AUDIT_OPERATION_OUTCOMES = ["pass", "warn", "fail", "no_go"] as const
export type PersistenceAuditOperationOutcome =
  (typeof PERSISTENCE_AUDIT_OPERATION_OUTCOMES)[number]

export const PERSISTENCE_AUDIT_VALIDATION_RESULTS = [
  "validator_passed",
  "validator_failed",
  "validator_not_applicable",
  "validator_not_run_no_go",
] as const
export type PersistenceAuditValidationResult =
  (typeof PERSISTENCE_AUDIT_VALIDATION_RESULTS)[number]

export const PERSISTENCE_AUDIT_IDEMPOTENCY_RESULTS = [
  "first_write",
  "idempotent_duplicate",
  "duplicate_conflict",
  "not_applicable",
] as const
export type PersistenceAuditIdempotencyResult =
  (typeof PERSISTENCE_AUDIT_IDEMPOTENCY_RESULTS)[number]

export const PERSISTENCE_AUDIT_DUPLICATE_RESULTS = [
  "first_write",
  "idempotent_duplicate",
  "duplicate_conflict",
  "not_applicable",
] as const
export type PersistenceAuditDuplicateResult =
  (typeof PERSISTENCE_AUDIT_DUPLICATE_RESULTS)[number]

export const PERSISTENCE_AUDIT_TENANT_SCOPE_RESULTS = [
  "tenant_scoped",
  "tenant_mismatch",
  "cross_tenant_blocked",
  "tenant_scope_not_applicable",
  "tenant_scope_no_go",
] as const
export type PersistenceAuditTenantScopeResult =
  (typeof PERSISTENCE_AUDIT_TENANT_SCOPE_RESULTS)[number]

export const PERSISTENCE_AUDIT_DEFENSIVE_SNAPSHOT_RESULTS = [
  "frozen_snapshot_returned",
  "defensive_clone_returned",
  "not_applicable",
  "snapshot_no_go",
] as const
export type PersistenceAuditDefensiveSnapshotResult =
  (typeof PERSISTENCE_AUDIT_DEFENSIVE_SNAPSHOT_RESULTS)[number]

export const PERSISTENCE_AUDIT_NON_DURABILITY_RESULTS = [
  "in_memory_only",
  "not_durable",
  "process_lifetime_only",
  "durability_not_claimed",
] as const
export type PersistenceAuditNonDurabilityResult =
  (typeof PERSISTENCE_AUDIT_NON_DURABILITY_RESULTS)[number]

export const PERSISTENCE_AUDIT_CLEAR_SCOPES = ["none", "tenant_only", "all_test_memory"] as const
export type PersistenceAuditClearScope = (typeof PERSISTENCE_AUDIT_CLEAR_SCOPES)[number]

export const PERSISTENCE_AUDIT_REDACTION_RESULTS = [
  "redacted",
  "no_raw_payload",
  "stable_codes_only",
  "redaction_not_applicable",
  "redaction_no_go",
] as const
export type PersistenceAuditRedactionResult =
  (typeof PERSISTENCE_AUDIT_REDACTION_RESULTS)[number]

export const PERSISTENCE_AUDIT_SOURCE_LOOPS = ["P6-I5E", "P6-I5F", "P6-I5G"] as const
export type PersistenceAuditSourceLoop = (typeof PERSISTENCE_AUDIT_SOURCE_LOOPS)[number]

export const PERSISTENCE_AUDIT_NO_GO_FLAGS = [
  "p6_i5f_not_merged",
  "missing_foundation_file",
  "missing_explicit_human_go",
  "audit_runtime_implemented",
  "audit_event_emitter_implemented",
  "persistence_implementation_added",
  "durable_storage_added",
  "d1_access_added",
  "sql_execution_added",
  "evidence_treated_as_truth",
  "audit_evidence_treated_as_approval",
  "audit_evidence_treated_as_execution",
  "audit_evidence_treated_as_persistence",
  "evidence_ledger_append_added",
  "graph_write_added",
  "raw_payload_echo_allowed",
  "secret_like_value_echo_allowed",
  "redaction_failure_allowed",
  "tenant_scope_bypassed",
  "validator_result_bypassed",
  "duplicate_conflict_treated_as_success",
  "clear_all_treated_as_production_capability",
  "validation_failed",
] as const

// ─── Persistence Audit Event ────────────────────────────────────

export type PersistenceAuditEvent = {
  readonly audit_event_id: string
  readonly tenant_id: string
  readonly target_decision_record_id: string
  readonly operation: PersistenceAuditOperation
  readonly operation_status: PersistenceAuditOperationStatus
  readonly operation_outcome: PersistenceAuditOperationOutcome
  /** Must be exactly "in_memory_test_only_store". */
  readonly adapter_target_class: PersistenceAuditTargetClass
  /** Must be exactly "in_memory_test_only_store". */
  readonly selected_target_class: PersistenceAuditTargetClass
  readonly validation_result: PersistenceAuditValidationResult
  readonly validator_issue_codes: readonly string[]
  readonly adapter_issue_codes: readonly string[]
  readonly idempotency_result: PersistenceAuditIdempotencyResult
  readonly duplicate_result: PersistenceAuditDuplicateResult
  readonly tenant_scope_result: PersistenceAuditTenantScopeResult
  readonly defensive_snapshot_result: PersistenceAuditDefensiveSnapshotResult
  readonly non_durability_result: PersistenceAuditNonDurabilityResult
  readonly clear_scope: PersistenceAuditClearScope
  readonly record_count: number
  readonly failure_reasons: readonly string[]
  readonly redaction_result: PersistenceAuditRedactionResult
  readonly source_loop: PersistenceAuditSourceLoop
  readonly source_adapter_loop: string
  readonly source_fixture_loop: string
  readonly source_validator_loop: string
  readonly source_constructor_loop: string
  readonly source_target_decision_record_id: string
  readonly created_at: IsoTimestamp
  readonly payload_hash: Sha256Hex
  readonly non_authorization_statement: string
  readonly no_go_flags: readonly PersistenceAuditNoGoFlag[]
}
