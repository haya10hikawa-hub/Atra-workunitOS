/**
 * P6-I5B: Phase 6 Persistence Target Decision types (docs/P6_I5B_PERSISTENCE_TARGET_TYPES_VALIDATORS.md,
 * grounded in docs/P6_I5A_TARGET_DECISION_RECORD_CONTRACT.md and
 * docs/P6_I5A_PERSISTENCE_TARGET_DECISION.md).
 *
 * INERT TYPES ONLY — no constructors, no storage, no persistence, no repository,
 * no adapter, no database schema, no D1, no SQL, no pipeline, no I/O. Type
 * validity is not persistence. Type validity is not authorization. Validation
 * pass is not storage, not approval, not execution permission, not promotion,
 * and not production readiness.
 *
 * This module is isolated under app/lib/phase6/persistenceTargetDecision/ on
 * purpose: it imports nothing from app runtime, app/lib/persistence,
 * app/lib/phase6/artifacts, app/lib/security/approvalMac, D1, SQL, ApprovalStore,
 * or P7.1 utilities. The selected target class is fixed by P6-I5A to exactly
 * `in_memory_test_only_store`; no other class may validate as selected.
 *
 * The TargetDecisionRecord deliberately carries NO grant-like field (approval,
 * approved, authorized, execution_permission, executed, promotion_permission,
 * promoted, persistence_permission, persisted, storage_permission, stored,
 * external_action_permission, formal_workunit_promotion): recording a target
 * decision cannot express any authorization.
 */

// ─── Primitives ─────────────────────────────────────────────────

/** ISO-8601 UTC, e.g. 2026-07-06T12:34:56Z or with .mmm milliseconds. */
export type IsoTimestamp = string
/** 64-character lowercase hex SHA-256 digest. */
export type Sha256Hex = string
export type NoGoFlag = string

// ─── Enums (literal unions) with runtime value lists ────────────

/** The one and only selectable Phase 6 persistence target class (P6-I5A). */
export const PERSISTENCE_TARGET_CLASSES = ["in_memory_test_only_store"] as const
export type PersistenceTargetClass = (typeof PERSISTENCE_TARGET_CLASSES)[number]

/** Deferred target classes — allowed only in deferred_target_classes, never selected. */
export const DEFERRED_PERSISTENCE_TARGET_CLASSES = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
] as const
export type DeferredPersistenceTargetClass =
  (typeof DEFERRED_PERSISTENCE_TARGET_CLASSES)[number]

/** Rejected target classes — allowed only in rejected_target_classes, never selected. */
export const REJECTED_PERSISTENCE_TARGET_CLASSES = ["blocked_target"] as const
export type RejectedPersistenceTargetClass =
  (typeof REJECTED_PERSISTENCE_TARGET_CLASSES)[number]

export const TARGET_DECISION_STATUSES = [
  "draft_target_decision_record",
  "target_selected_for_future_types",
  "blocked_no_go",
  "clarification_needed",
  "target_rejected",
] as const
export type TargetDecisionStatus = (typeof TARGET_DECISION_STATUSES)[number]

export const TARGET_DECISION_OUTCOMES = ["pass", "warn", "fail", "no_go"] as const
export type TargetDecisionOutcome = (typeof TARGET_DECISION_OUTCOMES)[number]

export const DEPENDENCY_STATUSES = [
  "present",
  "missing",
  "not_checked",
  "blocked_no_go",
] as const
export type DependencyStatus = (typeof DEPENDENCY_STATUSES)[number]

export const SAFETY_BOUNDARY_RESULTS = [
  "confirmed",
  "failed",
  "not_checked",
  "blocked_no_go",
] as const
export type SafetyBoundaryResult = (typeof SAFETY_BOUNDARY_RESULTS)[number]

// ─── Future slice declaration ───────────────────────────────────

export type FutureSliceDeclaration = {
  readonly next_slice: string
  readonly next_slice_scope: string
  readonly forbidden_next_slice_capabilities: readonly string[]
  readonly d1_gate_requirement: string
  readonly external_action_gate_requirement: string
  readonly approvalstore_gate_requirement: string
}

// ─── Target Decision Record ─────────────────────────────────────

export type TargetDecisionRecord = {
  readonly target_decision_record_id: string
  readonly tenant_id: string
  readonly target_decision_status: TargetDecisionStatus
  readonly target_decision_outcome: TargetDecisionOutcome
  readonly selected_target_class: PersistenceTargetClass
  readonly deferred_target_classes: readonly DeferredPersistenceTargetClass[]
  readonly rejected_target_classes: readonly RejectedPersistenceTargetClass[]
  readonly decision_rationale: string
  readonly selected_target_rationale: string
  readonly deferred_target_rationales: readonly string[]
  readonly rejected_target_rationales: readonly string[]
  readonly d1_deferral_rationale: string
  readonly sql_deferral_rationale: string
  readonly approvalstore_deferral_rationale: string
  readonly external_action_deferral_rationale: string
  readonly test_only_confirmed: SafetyBoundaryResult
  readonly non_persistent_confirmed: SafetyBoundaryResult
  readonly non_authorizing_confirmed: SafetyBoundaryResult
  readonly app_runtime_untouched_confirmed: SafetyBoundaryResult
  readonly d1_deferred_confirmed: SafetyBoundaryResult
  readonly sql_deferred_confirmed: SafetyBoundaryResult
  readonly approvalstore_unwired_confirmed: SafetyBoundaryResult
  readonly external_actions_blocked_confirmed: SafetyBoundaryResult
  readonly formal_workunit_promotion_blocked_confirmed: SafetyBoundaryResult
  readonly p6_i5_merged: boolean
  readonly p6_i5_merge_commit: string
  readonly storage_gate_spec_available: DependencyStatus
  readonly persistence_gate_spec_available: DependencyStatus
  readonly persistence_record_contract_available: DependencyStatus
  readonly main_safety_gate_active: boolean
  readonly human_review_required: boolean
  readonly reviewed_by_human_at: IsoTimestamp
  readonly reviewed_by_human_id: string
  readonly reviewer_role: string
  readonly review_rationale: string
  readonly next_slice: string
  readonly next_slice_scope: string
  readonly forbidden_next_slice_capabilities: readonly string[]
  readonly d1_gate_requirement: string
  readonly external_action_gate_requirement: string
  readonly approvalstore_gate_requirement: string
  readonly created_at: IsoTimestamp
  readonly payload_hash: Sha256Hex
  readonly no_go_flags: readonly NoGoFlag[]
}
