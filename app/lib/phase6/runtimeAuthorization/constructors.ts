/**
 * P6-FIX-012: the opaque Runtime Authorization receipt constructor (Issue #145).
 *
 * This is the ONLY production point for a `RuntimeAuthorizationReceipt`. The
 * brand is compile-time only and NOT exported, so no code outside this module
 * can forge a receipt by object literal or cast-to-shape. The server-side gate
 * invokes this constructor ONLY after the exact-binding atomic ApprovalStore
 * claim wins; a receipt therefore witnesses `authorized_not_executed`, never
 * execution.
 *
 * The receipt carries the canonical payload fields plus the `authorization_hash`
 * (SHA-256 integrity identifier, never a MAC). It never carries `executed: true`,
 * a provider response/reference, a raw target, a raw payload, credentials,
 * tokens, or a sendable request body. Constructing or holding one calls no
 * provider. Pure: no I/O, no clock, no randomness, no mutation.
 */

import {
  RUNTIME_AUTHORIZATION_HASH_DOMAIN,
  RUNTIME_AUTHORIZATION_HASH_VERSION,
  RUNTIME_AUTHORIZATION_HASH_ALGORITHM,
  RUNTIME_AUTHORIZATION_CANONICALIZATION_ALGORITHM,
  RUNTIME_AUTHORIZATION_STATUS,
  type RuntimeAuthorizationEligibleEvidence,
  type RuntimeAuthorizationReceipt,
} from "./types.ts"
import {
  buildRuntimeAuthorizationPayload,
  hashRuntimeAuthorizationPayload,
} from "./canonical.ts"

/**
 * Construct the opaque frozen receipt from the eligible evidence produced by a
 * successful eligibility evaluation. The caller (the gate) must only reach here
 * after the atomic claim has succeeded.
 */
export function constructRuntimeAuthorizationReceipt(
  evidence: RuntimeAuthorizationEligibleEvidence,
): RuntimeAuthorizationReceipt {
  const payload = buildRuntimeAuthorizationPayload({
    authorization_id: evidence.authorization_id,
    tenant_id: evidence.tenant_id,
    workunit_id: evidence.workunit_id,
    action_preview_id: evidence.action_preview_id,
    approval_id: evidence.approval_id,
    approval_linkage_id: evidence.approval_linkage_id,
    action_type: evidence.action_type,
    target_hash: evidence.target_hash,
    payload_hash: evidence.payload_hash,
    executor_id: evidence.executor_id,
    idempotency_key: evidence.idempotency_key,
    issued_at: evidence.issued_at,
    expires_at: evidence.expires_at,
  })
  const authorizationHash = hashRuntimeAuthorizationPayload(payload)

  // The opaque brand is compile-time only; no runtime field is added. This is
  // the module's single trusted production point for the type.
  return Object.freeze({
    hash_domain: RUNTIME_AUTHORIZATION_HASH_DOMAIN,
    hash_version: RUNTIME_AUTHORIZATION_HASH_VERSION,
    authorization_id: payload.authorization_id,
    status: RUNTIME_AUTHORIZATION_STATUS,
    tenant_id: payload.tenant_id,
    workunit_id: payload.workunit_id,
    action_preview_id: payload.action_preview_id,
    approval_id: payload.approval_id,
    approval_linkage_id: payload.approval_linkage_id,
    action_type: payload.action_type,
    target_hash: payload.target_hash,
    payload_hash: payload.payload_hash,
    executor_id: payload.executor_id,
    idempotency_key: payload.idempotency_key,
    issued_at: payload.issued_at,
    expires_at: payload.expires_at,
    hash_algorithm: RUNTIME_AUTHORIZATION_HASH_ALGORITHM,
    canonicalization_algorithm: RUNTIME_AUTHORIZATION_CANONICALIZATION_ALGORITHM,
    authorization_hash: authorizationHash,
  }) as unknown as RuntimeAuthorizationReceipt
}
