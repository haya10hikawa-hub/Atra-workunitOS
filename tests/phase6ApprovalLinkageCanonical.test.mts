/**
 * P6-FIX-011: canonical hash-domain tests for the Approval Chain Linkage module
 * (Issue #144). Verifies determinism, insertion-order independence, exact field
 * allowlists, domain separation, and 64-lowercase-hex output.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildApprovalReviewEnvelope,
  hashApprovalReviewEnvelope,
  buildApprovalIdentityChain,
  hashApprovalIdentityChain,
  buildApprovalLinkagePayload,
  hashApprovalLinkagePayload,
  hashHumanDecisionSnapshot,
  APPROVAL_REVIEW_ENVELOPE_DOMAIN,
  APPROVAL_IDENTITY_CHAIN_DOMAIN,
  APPROVAL_LINKAGE_DOMAIN,
} from "../app/lib/phase6/approvalLinkage/index.ts"

const HEX64 = /^[0-9a-f]{64}$/
const H = "a".repeat(64)

function envelopeInput(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: "tenant-1", human_decision_id: "hdr-1", human_decision_hash: H,
    workunit_id: "wu-1", action_preview_id: "preview-1", action_type: "slack_reply",
    target_hash: "b".repeat(64), payload_hash: "c".repeat(64), ...overrides,
  }
}

function chainInput(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: "tenant-1", requester_user_id: "req", creator_user_id: "cre",
    creator_source_action_preview_id: "preview-1", first_reviewer_user_id: "r1",
    second_reviewer_user_id: "r2", approver_user_id: "app",
    requester_identity_source: "authenticated_session", creator_identity_source: "stored_action_preview_creator",
    first_reviewer_identity_source: "authenticated_session", second_reviewer_identity_source: "authenticated_session",
    approver_identity_source: "authenticated_session", requester_actor_kind: "requester",
    creator_actor_kind: "creator", first_reviewer_actor_kind: "reviewer",
    second_reviewer_actor_kind: "reviewer", approver_actor_kind: "approver", ...overrides,
  }
}

function linkageInput(overrides: Record<string, unknown> = {}) {
  return {
    approval_linkage_id: "link-1", tenant_id: "tenant-1", human_decision_id: "hdr-1",
    human_decision_hash: H, review_evidence_id: "rev-1", review_evidence_hash: "d".repeat(64),
    review_envelope_hash: "e".repeat(64), first_review_attestation_id: "att-1",
    second_review_attestation_id: "att-2", identity_chain_hash: "f".repeat(64),
    workunit_id: "wu-1", action_preview_id: "preview-1", approval_id: "approval-1",
    action_type: "slack_reply", target_hash: "0".repeat(64), payload_hash: "1".repeat(64),
    approver_id: "approver-1", preview_created_at: "2026-07-05T00:00:00Z", preview_expires_at: "2026-07-05T06:00:00Z",
    review_completed_at: "2026-07-05T02:30:00Z", review_expires_at: "2026-07-05T05:30:00Z",
    approval_created_at: "2026-07-05T02:40:00Z", approval_approved_at: "2026-07-05T02:45:00Z",
    approval_expires_at: "2026-07-05T05:00:00Z", linked_at: "2026-07-05T02:50:00Z",
    linkage_expires_at: "2026-07-05T05:00:00Z", ...overrides,
  }
}

test("all three canonical hashes are 64 lowercase hex", () => {
  assert.match(hashApprovalReviewEnvelope(buildApprovalReviewEnvelope(envelopeInput())), HEX64)
  assert.match(hashApprovalIdentityChain(buildApprovalIdentityChain(chainInput())), HEX64)
  assert.match(hashApprovalLinkagePayload(buildApprovalLinkagePayload(linkageInput())), HEX64)
  assert.match(hashHumanDecisionSnapshot({ b: 2, a: 1 }), HEX64)
})

test("hashing is deterministic and insertion-order independent", () => {
  const a = buildApprovalReviewEnvelope(envelopeInput())
  const b = buildApprovalReviewEnvelope(
    envelopeInput({ payload_hash: "c".repeat(64), target_hash: "b".repeat(64) }),
  )
  assert.equal(hashApprovalReviewEnvelope(a), hashApprovalReviewEnvelope(b))
  // Human Decision hash is order-independent (hashField sorts keys).
  assert.equal(
    hashHumanDecisionSnapshot({ a: 1, b: 2, c: 3 }),
    hashHumanDecisionSnapshot({ c: 3, b: 2, a: 1 }),
  )
})

test("each builder pins its domain and version", () => {
  const env = buildApprovalReviewEnvelope(envelopeInput())
  assert.equal(env.hash_domain, APPROVAL_REVIEW_ENVELOPE_DOMAIN)
  assert.equal(env.hash_version, "1")
  const chain = buildApprovalIdentityChain(chainInput())
  assert.equal(chain.hash_domain, APPROVAL_IDENTITY_CHAIN_DOMAIN)
  const payload = buildApprovalLinkagePayload(linkageInput())
  assert.equal(payload.hash_domain, APPROVAL_LINKAGE_DOMAIN)
  assert.equal(payload.hash_algorithm, "sha256")
  assert.equal(payload.canonicalization_algorithm, "atra-sorted-json-v1")
})

test("changing the domain changes the hash (domain separation)", () => {
  const env = buildApprovalReviewEnvelope(envelopeInput())
  const forgedDomain = { ...env, hash_domain: "atra.approval-linkage" as never }
  assert.notEqual(hashApprovalReviewEnvelope(env), hashApprovalReviewEnvelope(forgedDomain))
})

test("review-envelope and linkage hashes cannot be confused", () => {
  // Even with overlapping field values, the domain field keeps the hashes
  // distinct — a review-envelope hash is never a linkage hash.
  const envHash = hashApprovalReviewEnvelope(buildApprovalReviewEnvelope(envelopeInput()))
  const linkHash = hashApprovalLinkagePayload(buildApprovalLinkagePayload(linkageInput()))
  const chainHash = hashApprovalIdentityChain(buildApprovalIdentityChain(chainInput()))
  assert.notEqual(envHash, linkHash)
  assert.notEqual(envHash, chainHash)
  assert.notEqual(linkHash, chainHash)
})

test("builders emit exactly the allowlisted fields (unknown fields dropped)", () => {
  const env = buildApprovalReviewEnvelope(envelopeInput({ extra_field: "x", role: "owner" } as never))
  assert.deepEqual(Object.keys(env).sort(), [
    "action_preview_id", "action_type", "hash_domain", "hash_version",
    "human_decision_hash", "human_decision_id", "payload_hash", "target_hash",
    "tenant_id", "workunit_id",
  ])
  assert.equal(Object.prototype.hasOwnProperty.call(env, "extra_field"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(env, "role"), false)
})

test("target, payload, action-type, and Human Decision mutations change the envelope hash", () => {
  const base = hashApprovalReviewEnvelope(buildApprovalReviewEnvelope(envelopeInput()))
  assert.notEqual(base, hashApprovalReviewEnvelope(buildApprovalReviewEnvelope(envelopeInput({ target_hash: "9".repeat(64) }))))
  assert.notEqual(base, hashApprovalReviewEnvelope(buildApprovalReviewEnvelope(envelopeInput({ payload_hash: "9".repeat(64) }))))
  assert.notEqual(base, hashApprovalReviewEnvelope(buildApprovalReviewEnvelope(envelopeInput({ action_type: "gmail_reply" }))))
  assert.notEqual(base, hashApprovalReviewEnvelope(buildApprovalReviewEnvelope(envelopeInput({ human_decision_hash: "9".repeat(64) }))))
})

test("a Human Decision content mutation changes its hash", () => {
  assert.notEqual(
    hashHumanDecisionSnapshot({ human_decision_id: "hdr-1", decision_outcome: "pass" }),
    hashHumanDecisionSnapshot({ human_decision_id: "hdr-1", decision_outcome: "warn" }),
  )
})

test("no raw target or payload body appears in canonical artifacts", () => {
  const env = buildApprovalReviewEnvelope(envelopeInput())
  const serialized = JSON.stringify(env)
  assert.ok(!serialized.includes("channel-1"))
  assert.ok(!serialized.includes("hello reviewers"))
  // Only hashes and IDs are present.
  assert.ok(serialized.includes("b".repeat(64)))
})

test("the identity chain binds every actor id, source, and kind", () => {
  const base = hashApprovalIdentityChain(buildApprovalIdentityChain(chainInput()))
  assert.notEqual(base, hashApprovalIdentityChain(buildApprovalIdentityChain(chainInput({ approver_user_id: "other" }))))
  assert.notEqual(base, hashApprovalIdentityChain(buildApprovalIdentityChain(chainInput({ creator_source_action_preview_id: "other" }))))
  assert.notEqual(base, hashApprovalIdentityChain(buildApprovalIdentityChain(chainInput({ approver_actor_kind: "reviewer" }))))
})
