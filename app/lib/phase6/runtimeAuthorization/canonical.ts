/**
 * P6-FIX-012: canonical Runtime Authorization payload, integrity hash,
 * deterministic idempotency key, and deterministic authorization id
 * (Issue #145).
 *
 * The `authorization_hash` is an unkeyed SHA-256 over the `atra-sorted-json-v1`
 * canonicalization (key-sorted, undefined-stripped, insertion-order
 * independent) of the exact-allowlist payload. It is an INTEGRITY identifier,
 * never a MAC and never a bearer credential. The P7.1 keyed MAC module is
 * deliberately NOT reused and NOT imported.
 *
 * The idempotency key and authorization id are DETERMINISTIC functions of the
 * binding envelope + executor canonical user id. No `Date.now()`, no
 * `Math.random()`, no UUID randomness, no client-supplied key. Changing the
 * executor, Linkage, Preview, Approval, action type, target, or payload changes
 * the key (and therefore the id).
 *
 * Pure: no I/O, no clock, no randomness, no mutation.
 */

import { hashField } from "../../security/hash.ts"
import {
  RUNTIME_AUTHORIZATION_HASH_DOMAIN,
  RUNTIME_AUTHORIZATION_HASH_VERSION,
  RUNTIME_AUTHORIZATION_HASH_ALGORITHM,
  RUNTIME_AUTHORIZATION_CANONICALIZATION_ALGORITHM,
  RUNTIME_AUTHORIZATION_IDEMPOTENCY_DOMAIN,
  RUNTIME_AUTHORIZATION_IDEMPOTENCY_VERSION,
  RUNTIME_AUTHORIZATION_STATUS,
  type RuntimeAuthorizationPayloadV1,
} from "./types.ts"

// ─── Deterministic idempotency key ──────────────────────────────

export type RuntimeAuthorizationIdempotencyInput = {
  readonly tenant_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly approval_linkage_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
  readonly executor_id: string
}

/**
 * Derive the deterministic idempotency key. Domain-separated from the
 * authorization payload so the two hashes can never be confused. Every binding
 * field plus the executor canonical user id participates, so a change to any of
 * them yields a different key.
 */
export function deriveRuntimeAuthorizationIdempotencyKey(
  input: RuntimeAuthorizationIdempotencyInput,
): string {
  return hashField({
    hash_domain: RUNTIME_AUTHORIZATION_IDEMPOTENCY_DOMAIN,
    hash_version: RUNTIME_AUTHORIZATION_IDEMPOTENCY_VERSION,
    tenant_id: input.tenant_id,
    workunit_id: input.workunit_id,
    action_preview_id: input.action_preview_id,
    approval_id: input.approval_id,
    approval_linkage_id: input.approval_linkage_id,
    action_type: input.action_type,
    target_hash: input.target_hash,
    payload_hash: input.payload_hash,
    executor_id: input.executor_id,
  })
}

/**
 * Derive the deterministic authorization id from the idempotency key. A pure
 * function of the key, so the same claimed envelope always yields the same id.
 */
export function deriveRuntimeAuthorizationId(idempotencyKey: string): string {
  const digest = hashField({
    hash_domain: RUNTIME_AUTHORIZATION_IDEMPOTENCY_DOMAIN,
    hash_version: RUNTIME_AUTHORIZATION_IDEMPOTENCY_VERSION,
    idempotency_key: idempotencyKey,
  })
  return `rauth_${digest}`
}

// ─── Canonical authorization payload ────────────────────────────

export type RuntimeAuthorizationPayloadInput = {
  readonly authorization_id: string
  readonly tenant_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly approval_linkage_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
  readonly executor_id: string
  readonly idempotency_key: string
  readonly issued_at: string
  readonly expires_at: string
}

/**
 * Build the exact-allowlist canonical Runtime Authorization payload V1. Only the
 * whitelisted fields appear; there is no raw target, raw payload, email,
 * session, role, token, secret, or environment value, and the payload never
 * contains `authorization_hash` (a hash never covers itself).
 */
export function buildRuntimeAuthorizationPayload(
  input: RuntimeAuthorizationPayloadInput,
): RuntimeAuthorizationPayloadV1 {
  return {
    hash_domain: RUNTIME_AUTHORIZATION_HASH_DOMAIN,
    hash_version: RUNTIME_AUTHORIZATION_HASH_VERSION,
    authorization_id: input.authorization_id,
    status: RUNTIME_AUTHORIZATION_STATUS,
    tenant_id: input.tenant_id,
    workunit_id: input.workunit_id,
    action_preview_id: input.action_preview_id,
    approval_id: input.approval_id,
    approval_linkage_id: input.approval_linkage_id,
    action_type: input.action_type,
    target_hash: input.target_hash,
    payload_hash: input.payload_hash,
    executor_id: input.executor_id,
    idempotency_key: input.idempotency_key,
    issued_at: input.issued_at,
    expires_at: input.expires_at,
    hash_algorithm: RUNTIME_AUTHORIZATION_HASH_ALGORITHM,
    canonicalization_algorithm: RUNTIME_AUTHORIZATION_CANONICALIZATION_ALGORITHM,
  }
}

/**
 * SHA-256 of the canonical Runtime Authorization payload V1. This is the
 * `authorization_hash`; the payload it hashes must never itself contain an
 * `authorization_hash` field.
 */
export function hashRuntimeAuthorizationPayload(
  payload: RuntimeAuthorizationPayloadV1,
): string {
  return hashField(payload)
}
