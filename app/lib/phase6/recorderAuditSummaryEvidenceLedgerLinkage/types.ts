/**
 * P6-I5S: inert static contract types for a future Recorder Audit Summary to
 * Evidence Ledger linkage candidate, implementing the P6-I5R static contract
 * (docs/P6_I5S_NO_APPEND_LINKAGE_CONTRACT_TYPES_AND_PURE_VALIDATOR.md, grounded
 * in docs/P6_I5R_RECORDER_AUDIT_SUMMARY_EVIDENCE_LEDGER_STATIC_CONTRACT_NO_APPEND_VALIDATOR_SPEC.md).
 *
 * These types are inert descriptions only. They carry no runtime behavior, no
 * consumer, and no capability. A LinkageCandidate is a proposal object that a
 * human reviewer might reference from a human-authored Evidence Ledger entry;
 * it is not a ledger entry, not a ledger append, not approval, not execution
 * permission, and not production readiness. The three flag fields are fixed by
 * the contract: `human_review_required` is `true`, `append_allowed` is `false`,
 * and `graph_write_allowed` is `false`.
 *
 * This module imports only the inert Recorder Audit Summary scope type from its
 * sibling P6-I5L module. It imports nothing from app runtime, no persistence, no
 * database access, no query-language execution, no approval-store, no external
 * clients, and no model providers.
 */

import type { RecorderAuditSummaryScope } from "../recorderAuditSummary/types.ts"

// ─── Descriptive scalar aliases ─────────────────────────────────

/** 64-character lowercase hex reference to the summary record (descriptive). */
export type LinkagePayloadHash = string
/** ISO-8601 UTC timestamp of the referenced record (descriptive). */
export type LinkageIsoTimestamp = string

// ─── The inert linkage candidate contract ───────────────────────

/**
 * A future linkage candidate. Descriptive proposal only. Every field is
 * descriptive; none authorizes anything. `human_review_required` must be `true`,
 * `append_allowed` must be `false`, and `graph_write_allowed` must be `false`
 * in the no-append validator stage.
 *
 * Exactly one — or both — of `source_fixture_loop` / `source_harness_loop` must
 * be present as a non-empty descriptive string (fixture-lineage or
 * harness-lineage), per the P6-I5R contract.
 */
export type LinkageCandidate = {
  readonly summary_id: string
  readonly payload_hash: LinkagePayloadHash
  readonly tenant_id: string
  readonly summary_scope: RecorderAuditSummaryScope
  readonly created_at: LinkageIsoTimestamp
  readonly source_loop: string
  readonly source_recorder_loop: string
  readonly source_validator_loop: string
  readonly source_fixture_loop?: string
  readonly source_harness_loop?: string
  readonly non_authorization_statement: string
  readonly evidence_ledger_reference_purpose: string
  readonly human_review_required: true
  readonly append_allowed: false
  readonly graph_write_allowed: false
}

// ─── Required / optional / forbidden field name lists ───────────

/** Always-required top-level field names (both source-lineage variants excluded). */
export const LINKAGE_CANDIDATE_REQUIRED_FIELDS = [
  "summary_id",
  "payload_hash",
  "tenant_id",
  "summary_scope",
  "created_at",
  "source_loop",
  "source_recorder_loop",
  "source_validator_loop",
  "non_authorization_statement",
  "evidence_ledger_reference_purpose",
  "human_review_required",
  "append_allowed",
  "graph_write_allowed",
] as const

/** At least one of these lineage fields must be present as a non-empty string. */
export const LINKAGE_CANDIDATE_LINEAGE_VARIANT_FIELDS = [
  "source_fixture_loop",
  "source_harness_loop",
] as const

/** Every allowed top-level field name (required plus the lineage variants). */
export const LINKAGE_CANDIDATE_ALLOWED_FIELDS = [
  ...LINKAGE_CANDIDATE_REQUIRED_FIELDS,
  ...LINKAGE_CANDIDATE_LINEAGE_VARIANT_FIELDS,
] as const

/**
 * The exact forbidden field names from the P6-I5R contract (§9). Presence of
 * any of these is a fail-closed rejection.
 */
export const LINKAGE_CANDIDATE_FORBIDDEN_GRANT_FIELDS = [
  "approval_granted",
  "execution_allowed",
  "append_performed",
  "evidence_ledger_entry_written",
  "graph_write_performed",
  "approval_store_approved",
  "external_action_executed",
  "formal_workunit_promoted",
] as const

export const LINKAGE_CANDIDATE_FORBIDDEN_SECRET_FIELDS = [
  "secret",
  "token",
  "credential",
  "private_customer_data",
] as const

export const LINKAGE_CANDIDATE_FORBIDDEN_RAW_PAYLOAD_FIELDS = ["raw_event_payload"] as const

// ─── Validation result shape ────────────────────────────────────

export const LINKAGE_VALIDATION_ISSUE_CODES = [
  "invalid_input",
  "not_object",
  "missing_required_field",
  "null_required_field",
  "invalid_field_type",
  "unknown_field",
  "forbidden_field_present",
  "invalid_payload_hash",
  "invalid_summary_scope",
  "invalid_tenant",
  "invalid_source_lineage",
  "invalid_non_authorization_statement",
  "append_allowed_must_be_false",
  "graph_write_allowed_must_be_false",
  "human_review_required_must_be_true",
  "secret_like_value_present",
  "raw_event_payload_present",
  "grant_like_field_present",
  "validator_exception",
] as const

export type LinkageValidationIssueCode = (typeof LINKAGE_VALIDATION_ISSUE_CODES)[number]

export type LinkageValidationIssue = {
  readonly code: LinkageValidationIssueCode
  readonly field: string
  /** Always `${code}:${field}` — never contains input values. */
  readonly message: string
}

/**
 * Descriptive-only validation result. Carries no authorization field, no append
 * field, and no execution field. `ok: true` is descriptive only.
 */
export type LinkageValidationResult = {
  readonly ok: boolean
  readonly issues: readonly LinkageValidationIssue[]
}
