/**
 * P6-I0: Phase 6 shared artifact types (docs/PHASE6_IMPLEMENTATION_DECISION_RECORD.md §7-§9,
 * grounded in the P6.7–P6.14 contract docs).
 *
 * INERT TYPES ONLY — no constructors, no storage, no pipeline, no I/O.
 * Type validity is not authorization. Validation pass is not approval and not
 * execution permission. Every artifact carries tenant_id; every downstream
 * artifact carries its upstream lineage ids; hash fields are 64-char lowercase
 * hex SHA-256; content integrity references are `sha256:<64 lowercase hex>`.
 *
 * These primitive aliases are local to the Phase 6 artifact module on purpose
 * (no import from app/lib/domain or app/lib/security/approvalMac): P6-I0 code
 * must stay isolated under app/lib/phase6/artifacts/. The local `TenantId`
 * alias is distinct from app/lib/tenant's TenantId; both erase to `string`.
 */

// ─── Primitives ─────────────────────────────────────────────────

export type TenantId = string
export type ArtifactId = string
/** ISO-8601 UTC, e.g. 2026-07-05T12:34:56Z or with .mmm milliseconds. */
export type IsoTimestamp = string
/** 64-character lowercase hex SHA-256 digest. */
export type Sha256Hex = string
/** `sha256:` + Sha256Hex. */
export type ContentIntegrityReference = string
export type NonEmptyString = string
export type NoGoFlag = string

// ─── Enums (literal unions) with runtime value lists ────────────

export const RULE_REVIEW_STATUSES = [
  "draft_review",
  "clarification_needed",
  "blocked_no_go",
  "ready_for_future_execution_gate_review",
] as const
export type RuleReviewStatus = (typeof RULE_REVIEW_STATUSES)[number]

export const EVIDENCE_REVIEW_STATUSES = [
  "draft_evidence_review",
  "clarification_needed",
  "blocked_no_go",
  "ready_for_human_evidence_review",
] as const
export type EvidenceReviewStatus = (typeof EVIDENCE_REVIEW_STATUSES)[number]

export const LLM_JUDGMENT_STATUSES = [
  "draft_judgment",
  "clarification_needed",
  "blocked_no_go",
  "ready_for_human_judgment_review",
] as const
export type LlmJudgmentStatus = (typeof LLM_JUDGMENT_STATUSES)[number]

export const HUMAN_DECISION_STATUSES = [
  "draft_human_decision",
  "clarification_needed",
  "blocked_no_go",
  "ready_for_future_gate_review",
] as const
export type HumanDecisionStatus = (typeof HUMAN_DECISION_STATUSES)[number]

export const OUTCOMES = ["pass", "warn", "fail", "no_go"] as const
export type Outcome = (typeof OUTCOMES)[number]

export const REDACTION_STATES = [
  "not_required",
  "redacted",
  "partially_redacted",
  "redaction_required",
  "redaction_unknown",
  "redaction_failed",
] as const
export type RedactionState = (typeof REDACTION_STATES)[number]

export const SOURCE_TRUST_MARKERS = [
  "first_party_system_record",
  "integration_provided_record",
  "user_provided_record",
  "derived_query_result",
  "aggregated_result",
  "unknown_source",
  "untrusted_source",
] as const
export type SourceTrustMarker = (typeof SOURCE_TRUST_MARKERS)[number]

export const CONFLICT_STATES = [
  "no_conflict",
  "conflict_detected",
  "unresolved_conflict",
  "source_disagreement",
  "missing_information",
  "unknown",
] as const
export type ConflictState = (typeof CONFLICT_STATES)[number]

export const UNCERTAINTY_STATES = [
  "low_uncertainty",
  "medium_uncertainty",
  "high_uncertainty",
  "unknown_uncertainty",
  "conflicting_evidence",
  "insufficient_evidence",
] as const
export type UncertaintyState = (typeof UNCERTAINTY_STATES)[number]

export const DECISION_IMPACT_SCOPES = [
  "priority_assessment",
  "risk_assessment",
  "action_readiness_assessment",
  "promotion_readiness_assessment",
  "evidence_acceptance",
  "judgment_acceptance",
  "no_action_decision",
  "clarification_request",
  "defer_decision",
] as const
export type DecisionImpactScope = (typeof DECISION_IMPACT_SCOPES)[number]

// ─── Artifact records ───────────────────────────────────────────

export type QueryIntentRecord = {
  readonly query_intent_id: ArtifactId
  readonly tenant_id: TenantId
  readonly actor_id: NonEmptyString
  readonly input_signal_id: ArtifactId
  readonly intent_summary: NonEmptyString
  readonly requested_information: readonly string[]
  readonly allowed_sources: readonly string[]
  readonly disallowed_sources: readonly string[]
  readonly tenant_scope_required: boolean
  readonly human_review_required: boolean
  readonly created_at: IsoTimestamp
  readonly no_go_flags: readonly NoGoFlag[]
}

export type SafeQueryPlan = {
  readonly safe_query_plan_id: ArtifactId
  readonly tenant_id: TenantId
  readonly source_query_intent_id: ArtifactId
  readonly query_goal: NonEmptyString
  readonly allowed_tables: readonly string[]
  readonly selected_columns: readonly string[]
  readonly tenant_scope_filter_required: boolean
  readonly denied_operations: readonly string[]
  readonly estimated_result_shape: NonEmptyString
  readonly human_review_required: boolean
  readonly created_at: IsoTimestamp
  readonly no_go_flags: readonly NoGoFlag[]
}

export type CompiledSqlArtifact = {
  readonly compiled_sql_artifact_id: ArtifactId
  readonly tenant_id: TenantId
  readonly source_safe_query_plan_id: ArtifactId
  readonly source_query_intent_id: ArtifactId
  readonly sql_hash: Sha256Hex
  readonly sql_text_redaction_state: RedactionState
  readonly read_only: boolean
  readonly mutation_detected: boolean
  readonly tenant_scope_filter_present: boolean
  readonly selected_columns: readonly string[]
  readonly created_at: IsoTimestamp
  readonly no_go_flags: readonly NoGoFlag[]
}

export type RuleReviewRecord = {
  readonly rule_review_record_id: ArtifactId
  readonly tenant_id: TenantId
  readonly source_compiled_sql_artifact_id: ArtifactId
  readonly source_safe_query_plan_id: ArtifactId
  readonly source_query_intent_id: ArtifactId
  readonly rule_review_status: RuleReviewStatus
  readonly rule_review_outcome: Outcome
  readonly read_only_check_result: NonEmptyString
  readonly tenant_scope_check_result: NonEmptyString
  readonly denied_schema_check_result: NonEmptyString
  readonly human_review_required: boolean
  readonly reviewed_at: IsoTimestamp
  readonly no_go_flags: readonly NoGoFlag[]
}

export type QueryResultRecord = {
  readonly query_result_record_id: ArtifactId
  readonly tenant_id: TenantId
  readonly source_rule_review_record_id: ArtifactId
  readonly source_compiled_sql_artifact_id: ArtifactId
  readonly source_safe_query_plan_id: ArtifactId
  readonly source_query_intent_id: ArtifactId
  readonly selected_source_rows: readonly string[]
  readonly selected_columns: readonly string[]
  readonly provenance_complete: boolean
  readonly evidence_eligible: boolean
  readonly result_hash: Sha256Hex
  readonly content_integrity_reference: ContentIntegrityReference
  readonly redaction_state: RedactionState
  /** Explicit null is allowed (documented): null when the result is not aggregated. */
  readonly aggregation_method: string | null
  /** Explicit null is allowed (documented): null when the result is not aggregated. */
  readonly source_scope: string | null
  readonly source_trust_marker: SourceTrustMarker
  readonly conflict_state: ConflictState
  readonly human_review_required: boolean
  readonly created_at: IsoTimestamp
  readonly no_go_flags: readonly NoGoFlag[]
}

export type EvidenceReviewRecord = {
  readonly evidence_review_id: ArtifactId
  readonly tenant_id: TenantId
  readonly source_query_result_record_id: ArtifactId
  readonly source_rule_review_record_id: ArtifactId
  readonly source_compiled_sql_artifact_id: ArtifactId
  readonly source_safe_query_plan_id: ArtifactId
  readonly source_query_intent_id: ArtifactId
  readonly evidence_review_status: EvidenceReviewStatus
  readonly evidence_review_outcome: Outcome
  readonly evidence_claim: NonEmptyString
  readonly evidence_type: NonEmptyString
  readonly source_trust_marker: SourceTrustMarker
  readonly evidence_eligible: boolean
  readonly evidence_accepted: boolean
  readonly human_review_required: boolean
  readonly result_hash_check_result: NonEmptyString
  readonly content_integrity_check_result: NonEmptyString
  readonly reviewed_at: IsoTimestamp
  readonly no_go_flags: readonly NoGoFlag[]
}

export type LlmJudgmentRecord = {
  readonly llm_judgment_id: ArtifactId
  readonly tenant_id: TenantId
  readonly source_evidence_review_record_id: ArtifactId
  readonly source_query_result_record_id: ArtifactId
  readonly source_rule_review_record_id: ArtifactId
  readonly source_compiled_sql_artifact_id: ArtifactId
  readonly source_safe_query_plan_id: ArtifactId
  readonly source_query_intent_id: ArtifactId
  readonly judgment_status: LlmJudgmentStatus
  readonly judgment_outcome: Outcome
  readonly judgment_summary: NonEmptyString
  readonly judgment_claims: readonly string[]
  readonly evidence_references: readonly string[]
  readonly provenance_references: readonly string[]
  readonly uncertainty_state: UncertaintyState
  readonly confidence_explanation: NonEmptyString
  readonly unsupported_inferences: readonly string[]
  readonly conflict_handling_summary: NonEmptyString
  readonly human_review_required: boolean
  readonly allowed_use: readonly string[]
  readonly disallowed_use: readonly string[]
  readonly judged_at: IsoTimestamp
  readonly no_go_flags: readonly NoGoFlag[]
}

export type HumanDecisionRecord = {
  readonly human_decision_id: ArtifactId
  readonly tenant_id: TenantId
  readonly decision_status: HumanDecisionStatus
  readonly decision_outcome: Outcome
  readonly human_reviewer_id: NonEmptyString
  readonly human_reviewer_role: NonEmptyString
  readonly reviewer_context: NonEmptyString
  readonly source_evidence_review_record_id: ArtifactId
  readonly source_llm_judgment_record_id: ArtifactId
  readonly source_query_result_record_id: ArtifactId
  readonly source_rule_review_record_id: ArtifactId
  readonly source_compiled_sql_artifact_id: ArtifactId
  readonly source_safe_query_plan_id: ArtifactId
  readonly source_query_intent_id: ArtifactId
  readonly evidence_accepted: boolean
  readonly evidence_claim: NonEmptyString
  readonly evidence_type: NonEmptyString
  readonly llm_judgment_id: ArtifactId
  readonly judgment_summary: NonEmptyString
  readonly uncertainty_state: UncertaintyState
  readonly human_decision_summary: NonEmptyString
  readonly human_decision_rationale: NonEmptyString
  readonly decision_impact_scope: DecisionImpactScope
  readonly allowed_use: readonly string[]
  readonly disallowed_use: readonly string[]
  readonly future_gate_requirements: readonly string[]
  readonly approval_required: boolean
  readonly promotion_required: boolean
  readonly execution_required: boolean
  readonly four_eyes_required: boolean
  readonly self_approval_blocked: boolean
  readonly reviewed_by_human_at: IsoTimestamp
  readonly no_go_flags: readonly NoGoFlag[]
}
