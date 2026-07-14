/**
 * P6-FIX-012 (Issue #145): canonical Runtime Authorization payload, integrity
 * hash, deterministic idempotency key + id, and receipt construction.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildRuntimeAuthorizationPayload,
  hashRuntimeAuthorizationPayload,
  deriveRuntimeAuthorizationIdempotencyKey,
  deriveRuntimeAuthorizationId,
  constructRuntimeAuthorizationReceipt,
  RUNTIME_AUTHORIZATION_HASH_DOMAIN,
  RUNTIME_AUTHORIZATION_STATUS,
  type RuntimeAuthorizationEligibleEvidence,
} from "../app/lib/phase6/runtimeAuthorization/index.ts"

const IDEMPOTENCY = {
  tenant_id: "tenant-1", workunit_id: "wu-1", action_preview_id: "preview-1",
  approval_id: "approval-1", approval_linkage_id: "link-1", action_type: "slack_reply",
  target_hash: "a".repeat(64), payload_hash: "b".repeat(64), executor_id: "executor-1",
}

const EVIDENCE: RuntimeAuthorizationEligibleEvidence = {
  tenant_id: "tenant-1", workunit_id: "wu-1", action_preview_id: "preview-1",
  approval_id: "approval-1", approval_linkage_id: "link-1", action_type: "slack_reply",
  target_hash: "a".repeat(64), payload_hash: "b".repeat(64), executor_id: "executor-1",
  idempotency_key: deriveRuntimeAuthorizationIdempotencyKey(IDEMPOTENCY),
  authorization_id: deriveRuntimeAuthorizationId(deriveRuntimeAuthorizationIdempotencyKey(IDEMPOTENCY)),
  issued_at: "2026-07-05T03:00:00Z", expires_at: "2026-07-05T03:00:30Z",
}

test("payload uses the pinned domain, status, and excludes its own hash", () => {
  const payload = buildRuntimeAuthorizationPayload({ ...EVIDENCE })
  assert.equal(payload.hash_domain, RUNTIME_AUTHORIZATION_HASH_DOMAIN)
  assert.equal(payload.status, RUNTIME_AUTHORIZATION_STATUS)
  assert.equal(payload.hash_algorithm, "sha256")
  assert.equal(payload.canonicalization_algorithm, "atra-sorted-json-v1")
  assert.ok(!("authorization_hash" in payload), "payload must not contain its own hash")
})

test("hash is a 64-hex integrity digest, insertion-order independent", () => {
  const a = hashRuntimeAuthorizationPayload(buildRuntimeAuthorizationPayload({ ...EVIDENCE }))
  // Reversed insertion order of the evidence yields the same canonical hash.
  const reversed: RuntimeAuthorizationEligibleEvidence = Object.fromEntries(
    Object.entries(EVIDENCE).reverse(),
  ) as RuntimeAuthorizationEligibleEvidence
  const b = hashRuntimeAuthorizationPayload(buildRuntimeAuthorizationPayload({ ...reversed }))
  assert.match(a, /^[0-9a-f]{64}$/)
  assert.equal(a, b)
})

test("idempotency key is deterministic and binds every field", () => {
  const base = deriveRuntimeAuthorizationIdempotencyKey(IDEMPOTENCY)
  assert.equal(base, deriveRuntimeAuthorizationIdempotencyKey({ ...IDEMPOTENCY }))
  for (const field of Object.keys(IDEMPOTENCY) as (keyof typeof IDEMPOTENCY)[]) {
    const mutated = deriveRuntimeAuthorizationIdempotencyKey({ ...IDEMPOTENCY, [field]: "CHANGED" })
    assert.notEqual(base, mutated, `${field} must change the idempotency key`)
  }
})

test("authorization id is a deterministic function of the idempotency key", () => {
  const key = deriveRuntimeAuthorizationIdempotencyKey(IDEMPOTENCY)
  const id = deriveRuntimeAuthorizationId(key)
  assert.match(id, /^rauth_[0-9a-f]{64}$/)
  assert.equal(id, deriveRuntimeAuthorizationId(key))
})

test("receipt is frozen, authorized_not_executed, and carries the hash", () => {
  const receipt = constructRuntimeAuthorizationReceipt(EVIDENCE)
  assert.equal(receipt.status, "authorized_not_executed")
  assert.match(receipt.authorization_hash, /^[0-9a-f]{64}$/)
  assert.equal(Object.isFrozen(receipt), true)
  // No execution / provider material leaks into the receipt shape (camelCase
  // AND snake_case variants).
  for (const forbidden of [
    "executed", "provider", "providerRef", "provider_ref", "externalRef", "external_ref",
    "rawTarget", "raw_target", "rawPayload", "raw_payload", "sendableBody", "sendable_body",
    "token", "credential",
  ]) {
    assert.ok(!(forbidden in receipt), `receipt must not carry ${forbidden}`)
  }
  // The receipt shape is exactly the allowlisted fields (no extra key sneaks in).
  assert.deepEqual(
    Object.keys(receipt).sort(),
    [
      "action_preview_id", "action_type", "approval_id", "approval_linkage_id",
      "authorization_hash", "authorization_id", "canonicalization_algorithm",
      "executor_id", "expires_at", "hash_algorithm", "hash_domain", "hash_version",
      "idempotency_key", "issued_at", "payload_hash", "status", "target_hash",
      "tenant_id", "workunit_id",
    ],
  )
})

test("receipt hash matches an independently recomputed payload hash", () => {
  const receipt = constructRuntimeAuthorizationReceipt(EVIDENCE)
  const recomputed = hashRuntimeAuthorizationPayload(buildRuntimeAuthorizationPayload({ ...EVIDENCE }))
  assert.equal(receipt.authorization_hash, recomputed)
})
