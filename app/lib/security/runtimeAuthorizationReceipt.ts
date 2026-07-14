/**
 * P6-FIX-012 (Issue #145): the SINGLE, server-private production point for a
 * branded `RuntimeAuthorizationReceipt`.
 *
 * This module is deliberately NOT re-exported from any barrel and is
 * source-guarded so that ONLY `runtimeAuthorizationGate.ts` imports it. The gate
 * reaches this constructor only after a successful exact-binding ApprovalStore
 * CAS, so a receipt can never exist without a won one-time-use claim. The pure
 * `runtimeAuthorization` module intentionally exposes no callable that turns a
 * plain `RuntimeAuthorizationEligibleEvidence` into a branded receipt.
 *
 * The `authorization_hash` is an unkeyed SHA-256 integrity identifier over the
 * exact-allowlist canonical payload (which excludes the hash itself). The
 * receipt carries no `executed: true`, provider response/reference, raw target,
 * raw payload, credentials, tokens, or sendable body. Pure: no I/O, no clock, no
 * randomness, no mutation, no provider call.
 */

import {
  RUNTIME_AUTHORIZATION_HASH_DOMAIN,
  RUNTIME_AUTHORIZATION_HASH_VERSION,
  RUNTIME_AUTHORIZATION_HASH_ALGORITHM,
  RUNTIME_AUTHORIZATION_CANONICALIZATION_ALGORITHM,
  RUNTIME_AUTHORIZATION_STATUS,
  buildRuntimeAuthorizationPayload,
  hashRuntimeAuthorizationPayload,
  type RuntimeAuthorizationEligibleEvidence,
  type RuntimeAuthorizationReceipt,
} from "../phase6/runtimeAuthorization/index.ts"

/**
 * Construct the opaque frozen receipt from the eligible evidence produced by a
 * successful eligibility evaluation. Callable ONLY by the gate, and only after
 * its exact-binding CAS has succeeded.
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
