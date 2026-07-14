/**
 * P6-FIX-011: inert types and pinned constants for the Phase 6 Approval Chain
 * Linkage module (Issue #144, docs/APPROVAL_CHAIN_LINKAGE_CONTRACT.md).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. An ApprovalLinkageRecord is immutable
 * historical evidence that, at one snapshot in time, one Validated Human
 * Decision, one active Four-Eyes Review Evidence artifact, one successful
 * internally-evaluated Identity Independence input, one stored ActionPreview,
 * and one stored approved Approval Record all bound to the same chain. It is
 * NOT an ApprovalStore record, NOT approval creation, NOT approval status, NOT
 * runtime authorization, NOT execution permission, NOT persistence, NOT a
 * one-time-use claim, and NOT an external action. Runtime authorization and
 * immediately-before-use atomic consumption belong to Issue #145.
 *
 * These types are inert descriptions only: no runtime behavior, no consumer,
 * no capability, no I/O, no clock, no randomness. The persistence row types
 * (`ActionPreviewRow`, `ApprovalRecordRow`) are imported TYPE-ONLY; no
 * repository, adapter, store, route, or migration is touched.
 */

import type { ActionPreviewRow, ApprovalRecordRow } from "../../persistence/types.ts"

// ─── Pinned hash domains, versions, and algorithm ───────────────

/** SHA-256 over `atra-sorted-json-v1` canonical JSON. Never a keyed MAC. */
export const APPROVAL_LINKAGE_HASH_ALGORITHM = "sha256" as const
export const APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM = "atra-sorted-json-v1" as const

/** Domain separation: each hash domain is distinct so hashes cannot be confused. */
export const APPROVAL_REVIEW_ENVELOPE_DOMAIN = "atra.approval-review-envelope" as const
export const APPROVAL_REVIEW_ENVELOPE_VERSION = "1" as const
export const APPROVAL_IDENTITY_CHAIN_DOMAIN = "atra.approval-identity-chain" as const
export const APPROVAL_IDENTITY_CHAIN_VERSION = "1" as const
export const APPROVAL_LINKAGE_DOMAIN = "atra.approval-linkage" as const
export const APPROVAL_LINKAGE_VERSION = "1" as const

/**
 * The supported external approval action types for an approval linkage. These
 * mirror the runtime `ApprovalActionType` union (internal-only actions never
 * form an external-approval linkage).
 */
export const APPROVAL_LINKAGE_ACTION_TYPES = [
  "slack_reply",
  "gmail_reply",
  "github_issue",
  "calendar_event",
] as const

export type ApprovalLinkageActionType = (typeof APPROVAL_LINKAGE_ACTION_TYPES)[number]

// ─── Canonical hash payloads (plain, insertion-order independent) ─

/**
 * Approval Review Envelope V1 — the exact canonical value the two reviewers
 * reviewed for approval linkage. Its SHA-256 is the review-envelope hash, and
 * Review Evidence `reviewed_payload_hash` must equal it for an approval
 * linkage. No raw target/payload, role, email, session, or token appears.
 */
export type ApprovalReviewEnvelopeV1 = {
  readonly hash_domain: typeof APPROVAL_REVIEW_ENVELOPE_DOMAIN
  readonly hash_version: typeof APPROVAL_REVIEW_ENVELOPE_VERSION
  readonly tenant_id: string
  readonly human_decision_id: string
  readonly human_decision_hash: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
}

/**
 * Identity Chain V1 — canonical binding of the successful identity-independence
 * evaluation. Its SHA-256 is the identity-chain hash. Only the approver ID is
 * stored on the Linkage Record in the clear (Issue #144 requirement); every
 * other actor identity is represented ONLY through this hash and is never
 * exposed by audit events.
 */
export type ApprovalIdentityChainV1 = {
  readonly hash_domain: typeof APPROVAL_IDENTITY_CHAIN_DOMAIN
  readonly hash_version: typeof APPROVAL_IDENTITY_CHAIN_VERSION
  readonly tenant_id: string
  readonly requester_user_id: string
  readonly creator_user_id: string
  readonly creator_source_action_preview_id: string
  readonly first_reviewer_user_id: string
  readonly second_reviewer_user_id: string
  readonly approver_user_id: string
  readonly requester_identity_source: string
  readonly creator_identity_source: string
  readonly first_reviewer_identity_source: string
  readonly second_reviewer_identity_source: string
  readonly approver_identity_source: string
  readonly requester_actor_kind: string
  readonly creator_actor_kind: string
  readonly first_reviewer_actor_kind: string
  readonly second_reviewer_actor_kind: string
  readonly approver_actor_kind: string
}

/**
 * Approval Linkage payload V1 — the exact canonical value hashed into
 * `linkage_hash`. It deliberately EXCLUDES `linkage_hash` itself (a hash never
 * covers itself).
 */
export type ApprovalLinkagePayloadV1 = {
  readonly hash_domain: typeof APPROVAL_LINKAGE_DOMAIN
  readonly hash_version: typeof APPROVAL_LINKAGE_VERSION
  readonly approval_linkage_id: string
  readonly tenant_id: string
  readonly human_decision_id: string
  readonly human_decision_hash: string
  readonly review_evidence_id: string
  readonly review_evidence_hash: string
  readonly review_envelope_hash: string
  readonly first_review_attestation_id: string
  readonly second_review_attestation_id: string
  readonly identity_chain_hash: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
  readonly approver_id: string
  readonly preview_created_at: string
  readonly preview_expires_at: string
  readonly review_completed_at: string
  readonly review_expires_at: string
  readonly approval_created_at: string
  readonly approval_approved_at: string
  readonly approval_expires_at: string
  readonly linked_at: string
  readonly linkage_expires_at: string
  readonly hash_algorithm: typeof APPROVAL_LINKAGE_HASH_ALGORITHM
  readonly canonicalization_algorithm: typeof APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM
}

// ─── Untrusted input + server-owned context ─────────────────────

/**
 * The only caller-selectable fields for an approval linkage. Every binding
 * field (IDs, hashes, approver, expiry) is deliberately ABSENT and derived
 * from server-owned sources; input carrying any binding field is rejected
 * fail-closed.
 */
export type UnvalidatedApprovalLinkageInput = {
  readonly approval_linkage_id: string
  readonly linked_at: string
}

/**
 * Server-owned construction/verification context. Every source object is
 * already server-fetched; this module never reads a repository. The revoke and
 * consume collections are immutable snapshots — the module never mutates them
 * and performs no I/O.
 */
export type ApprovalLinkageContext = {
  readonly tenant_id: string
  readonly human_decision: unknown
  readonly review_evidence: unknown
  readonly identity_input: unknown
  readonly action_preview: unknown
  readonly approval_record: unknown
  readonly evaluated_at: string
  readonly revoked_review_evidence_ids: readonly string[]
  readonly consumed_review_evidence_ids: readonly string[]
  readonly revoked_approval_ids: readonly string[]
  readonly consumed_approval_ids: readonly string[]
  readonly revoked_approval_linkage_ids: readonly string[]
  readonly consumed_approval_linkage_ids: readonly string[]
}

/** Type-only references kept for documentation of the expected row shapes. */
export type ApprovalLinkageActionPreviewSource = ActionPreviewRow
export type ApprovalLinkageApprovalRecordSource = ApprovalRecordRow

// ─── Opaque linkage record ──────────────────────────────────────

/**
 * Module-private opaque brand for constructor-produced linkage records. It is
 * a compile-time-only phantom property: never assigned at runtime, never
 * serialized, and deliberately NOT exported. A TypeScript cast can always lie,
 * so this brand is a compile-time provenance boundary — not cryptographic
 * proof and not authorization.
 */
declare const approvalLinkageRecordBrand: unique symbol

/**
 * One immutable approval-chain linkage snapshot, produced ONLY by
 * `createApprovalLinkageRecord`. Every array is frozen. Holding one grants
 * nothing.
 */
export type ApprovalLinkageRecord = {
  readonly approval_linkage_id: string
  readonly tenant_id: string
  readonly human_decision_id: string
  readonly human_decision_hash: string
  readonly review_evidence_id: string
  readonly review_evidence_hash: string
  readonly review_envelope_hash: string
  readonly first_review_attestation_id: string
  readonly second_review_attestation_id: string
  readonly identity_chain_hash: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
  readonly approver_id: string
  readonly preview_created_at: string
  readonly preview_expires_at: string
  readonly review_completed_at: string
  readonly review_expires_at: string
  readonly approval_created_at: string
  readonly approval_approved_at: string
  readonly approval_expires_at: string
  readonly linked_at: string
  readonly linkage_expires_at: string
  readonly hash_algorithm: typeof APPROVAL_LINKAGE_HASH_ALGORITHM
  readonly canonicalization_algorithm: typeof APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM
  readonly linkage_hash: string
  readonly [approvalLinkageRecordBrand]: true
}

// ─── Verification result ────────────────────────────────────────

export const APPROVAL_LINKAGE_VERIFICATION_STATES = [
  "verified",
  "invalid",
  "stale",
  "expired",
  "revoked",
  "used",
  "replayed",
] as const

export type ApprovalLinkageVerificationState =
  (typeof APPROVAL_LINKAGE_VERIFICATION_STATES)[number]

// ─── Redacted audit projection ──────────────────────────────────

export const APPROVAL_LINKAGE_AUDIT_EVENT_KINDS = [
  "approval_linkage_verified",
  "approval_linkage_stale",
  "approval_linkage_replayed",
  "approval_linkage_rejected",
] as const

export type ApprovalLinkageAuditEventKind =
  (typeof APPROVAL_LINKAGE_AUDIT_EVENT_KINDS)[number]

/**
 * A pure, redacted audit projection of one linkage verification decision. It
 * exposes record identifiers, the verification state, the boolean outcome,
 * allowlisted stable issue codes, and the evaluation timestamp ONLY. It never
 * exposes target/payload content, any hash, any actor identity, session IDs,
 * roles, email, tokens, secrets, ApprovalStore contents, or authorization
 * material. Producing an audit event authorizes nothing.
 */
export type ApprovalLinkageAuditEvent = {
  readonly event_kind: ApprovalLinkageAuditEventKind
  readonly approval_linkage_id: string
  readonly human_decision_id: string
  readonly review_evidence_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly state: ApprovalLinkageVerificationState
  readonly ok: boolean
  readonly issue_codes: readonly string[]
  readonly evaluated_at: string
}
