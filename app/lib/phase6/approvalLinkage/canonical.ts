/**
 * P6-FIX-011: canonical hash-domain builders for the Approval Chain Linkage
 * module (Issue #144). Four explicitly separated hash domains:
 *
 *   1. Human Decision hash  — `hashField(single-read Human Decision snapshot)`.
 *   2. Approval Review Envelope hash — `hashField(ApprovalReviewEnvelopeV1)`;
 *      Review Evidence `reviewed_payload_hash` must equal this for a linkage.
 *   3. Identity Chain hash  — `hashField(ApprovalIdentityChainV1)`.
 *   4. Approval Linkage hash — `hashField(ApprovalLinkagePayloadV1)`; the
 *      payload never includes the linkage hash itself.
 *
 * All hashes are unkeyed SHA-256 over the shared `atra-sorted-json-v1`
 * canonicalization (key-sorted, undefined-stripped, insertion-order
 * independent). A hash here is an INTEGRITY identifier, never a MAC and never
 * authorization. The P7.1 `CanonicalApprovalPayload`/MAC module is deliberately
 * NOT reused and NOT imported.
 *
 * Every builder receives already-snapshotted plain values; nothing here reads a
 * getter-bearing object. Pure: no I/O, no clock, no randomness, no mutation.
 */

import { hashField } from "../../security/hash.ts"
import {
  APPROVAL_REVIEW_ENVELOPE_DOMAIN,
  APPROVAL_REVIEW_ENVELOPE_VERSION,
  APPROVAL_IDENTITY_CHAIN_DOMAIN,
  APPROVAL_IDENTITY_CHAIN_VERSION,
  APPROVAL_LINKAGE_DOMAIN,
  APPROVAL_LINKAGE_VERSION,
  APPROVAL_LINKAGE_HASH_ALGORITHM,
  APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM,
  type ApprovalReviewEnvelopeV1,
  type ApprovalIdentityChainV1,
  type ApprovalLinkagePayloadV1,
} from "./types.ts"

// ─── Human Decision hash ────────────────────────────────────────

/**
 * Integrity hash over an already-snapshotted, validated Human Decision. The
 * caller must pass a plain single-read snapshot — never a getter-bearing
 * object. `hashField` canonicalizes (sorts keys, strips undefined) before
 * SHA-256, so the result is insertion-order independent.
 */
export function hashHumanDecisionSnapshot(snapshot: Record<string, unknown>): string {
  return hashField(snapshot)
}

// ─── Approval Review Envelope ───────────────────────────────────

export type ApprovalReviewEnvelopeInput = {
  readonly tenant_id: string
  readonly human_decision_id: string
  readonly human_decision_hash: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
}

/** Build the exact-allowlist canonical Approval Review Envelope V1. */
export function buildApprovalReviewEnvelope(
  input: ApprovalReviewEnvelopeInput,
): ApprovalReviewEnvelopeV1 {
  return {
    hash_domain: APPROVAL_REVIEW_ENVELOPE_DOMAIN,
    hash_version: APPROVAL_REVIEW_ENVELOPE_VERSION,
    tenant_id: input.tenant_id,
    human_decision_id: input.human_decision_id,
    human_decision_hash: input.human_decision_hash,
    workunit_id: input.workunit_id,
    action_preview_id: input.action_preview_id,
    action_type: input.action_type,
    target_hash: input.target_hash,
    payload_hash: input.payload_hash,
  }
}

/** SHA-256 of the canonical Approval Review Envelope V1. */
export function hashApprovalReviewEnvelope(envelope: ApprovalReviewEnvelopeV1): string {
  return hashField(envelope)
}

// ─── Identity Chain ─────────────────────────────────────────────

export type ApprovalIdentityChainInput = {
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

/** Build the exact-allowlist canonical Identity Chain V1. */
export function buildApprovalIdentityChain(
  input: ApprovalIdentityChainInput,
): ApprovalIdentityChainV1 {
  return {
    hash_domain: APPROVAL_IDENTITY_CHAIN_DOMAIN,
    hash_version: APPROVAL_IDENTITY_CHAIN_VERSION,
    tenant_id: input.tenant_id,
    requester_user_id: input.requester_user_id,
    creator_user_id: input.creator_user_id,
    creator_source_action_preview_id: input.creator_source_action_preview_id,
    first_reviewer_user_id: input.first_reviewer_user_id,
    second_reviewer_user_id: input.second_reviewer_user_id,
    approver_user_id: input.approver_user_id,
    requester_identity_source: input.requester_identity_source,
    creator_identity_source: input.creator_identity_source,
    first_reviewer_identity_source: input.first_reviewer_identity_source,
    second_reviewer_identity_source: input.second_reviewer_identity_source,
    approver_identity_source: input.approver_identity_source,
    requester_actor_kind: input.requester_actor_kind,
    creator_actor_kind: input.creator_actor_kind,
    first_reviewer_actor_kind: input.first_reviewer_actor_kind,
    second_reviewer_actor_kind: input.second_reviewer_actor_kind,
    approver_actor_kind: input.approver_actor_kind,
  }
}

/** SHA-256 of the canonical Identity Chain V1. */
export function hashApprovalIdentityChain(chain: ApprovalIdentityChainV1): string {
  return hashField(chain)
}

// ─── Approval Linkage ───────────────────────────────────────────

/**
 * The linkage payload minus the linkage-hash field. Everything the linkage
 * record stores except `linkage_hash` itself (a hash never covers itself).
 */
export type ApprovalLinkagePayloadInput = Omit<
  ApprovalLinkagePayloadV1,
  "hash_domain" | "hash_version" | "hash_algorithm" | "canonicalization_algorithm"
>

/** Build the exact-allowlist canonical Approval Linkage payload V1. */
export function buildApprovalLinkagePayload(
  input: ApprovalLinkagePayloadInput,
): ApprovalLinkagePayloadV1 {
  return {
    hash_domain: APPROVAL_LINKAGE_DOMAIN,
    hash_version: APPROVAL_LINKAGE_VERSION,
    approval_linkage_id: input.approval_linkage_id,
    tenant_id: input.tenant_id,
    human_decision_id: input.human_decision_id,
    human_decision_hash: input.human_decision_hash,
    review_evidence_id: input.review_evidence_id,
    review_evidence_hash: input.review_evidence_hash,
    review_envelope_hash: input.review_envelope_hash,
    first_review_attestation_id: input.first_review_attestation_id,
    second_review_attestation_id: input.second_review_attestation_id,
    identity_chain_hash: input.identity_chain_hash,
    workunit_id: input.workunit_id,
    action_preview_id: input.action_preview_id,
    approval_id: input.approval_id,
    action_type: input.action_type,
    target_hash: input.target_hash,
    payload_hash: input.payload_hash,
    approver_id: input.approver_id,
    preview_created_at: input.preview_created_at,
    preview_expires_at: input.preview_expires_at,
    review_completed_at: input.review_completed_at,
    review_expires_at: input.review_expires_at,
    approval_created_at: input.approval_created_at,
    approval_approved_at: input.approval_approved_at,
    approval_expires_at: input.approval_expires_at,
    linked_at: input.linked_at,
    linkage_expires_at: input.linkage_expires_at,
    hash_algorithm: APPROVAL_LINKAGE_HASH_ALGORITHM,
    canonicalization_algorithm: APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM,
  }
}

/**
 * SHA-256 of the canonical Approval Linkage payload V1. This is the
 * `linkage_hash`; the payload it hashes must never itself contain a
 * linkage-hash field.
 */
export function hashApprovalLinkagePayload(payload: ApprovalLinkagePayloadV1): string {
  return hashField(payload)
}
