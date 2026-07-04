/**
 * P7.1: Keyed approval MAC computation, constant-time comparison, and
 * explicit-input verification (docs/CANONICAL_APPROVAL_PAYLOAD_SPEC.md §8,
 * docs/TSP_DESIGN_REVIEW_CLOSURE.md §10).
 *
 * ISOLATED MODULE — NOT WIRED. Nothing in the live approval path imports this
 * module; ApprovalStore integration, nonce storage, and key rotation remain
 * separate future gates. Risk Register R4 stays open at runtime.
 *
 * Security properties:
 * - keyed HMAC-SHA-256 only — there is no unkeyed code path here;
 * - the MAC input is the canonical payload string, so tenant_id, operation,
 *   target_hash, payload_hash, preview_hash, expires_at, nonce, key_id, and
 *   key_version are all bound by construction;
 * - fail closed on invalid payload, unknown algorithms, unavailable secret,
 *   unknown key_id/key_version, expiry, and non-empty no_go_flags;
 * - constant-time digest comparison; secrets never logged, returned, or thrown.
 */

import { createHmac, timingSafeEqual } from "crypto"
import {
  canonicalizeApprovalPayload,
  validateCanonicalApprovalPayload,
  CanonicalApprovalPayloadValidationError,
  type CanonicalApprovalPayload,
} from "./canonicalApprovalPayload.ts"
import type { TenantSecretProvider } from "./tenantSecretProvider.ts"

const MAC_HEX = /^[0-9a-f]{64}$/

/**
 * Constant-time comparison of two 64-char lowercase hex MAC strings.
 * Returns false (never throws) on any invalid input. After format checks the
 * comparison is delegated to crypto.timingSafeEqual on the decoded bytes, so
 * it does not early-return on the first mismatched byte.
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false
  if (!MAC_HEX.test(a) || !MAC_HEX.test(b)) return false
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  } catch {
    return false
  }
}

export type ApprovalMacFailureReason =
  | "missing_required_field"
  | "unknown_field"
  | "invalid_field_type"
  | "invalid_hash_format"
  | "invalid_timestamp"
  | "unsupported_hash_algorithm"
  | "unsupported_canonicalization_algorithm"
  | "tenant_secret_unavailable"
  | "unknown_key_id"
  | "unknown_key_version"
  | "mac_mismatch"
  | "expired_payload"
  | "no_go_flags_present"
  | "invalid_mac_format"

export type ApprovalMacVerificationResult =
  | {
      ok: true
      reason: "verified"
      tenant_id: string
      approval_request_id: string
      key_id: string
      key_version: string
      hash_algorithm: string
      canonicalization_algorithm: string
    }
  | {
      ok: false
      reason: string
      tenant_id?: string
      approval_request_id?: string
      key_id?: string
      key_version?: string
      hash_algorithm?: string
      canonicalization_algorithm?: string
    }

export class ApprovalMacError extends Error {
  public readonly code: ApprovalMacFailureReason
  constructor(code: ApprovalMacFailureReason) {
    super(code)
    this.name = "ApprovalMacError"
    this.code = code
  }
}

/**
 * Compute the keyed HMAC-SHA-256 MAC (64-char lowercase hex) over the
 * canonical payload string. The secret comes only from the injected provider
 * — client-provided secret material has no path into this function. Throws
 * ApprovalMacError / CanonicalApprovalPayloadValidationError; neither carries
 * secret material or payload values.
 */
export async function computeApprovalMac(
  payload: unknown,
  provider: TenantSecretProvider,
): Promise<string> {
  // Validate into a frozen own-property snapshot and derive BOTH the canonical
  // MAC input and the provider-lookup identity from that single snapshot, so a
  // getter-bearing input cannot bind the MAC to one identity while resolving a
  // secret for another.
  const validated = validateCanonicalApprovalPayload(payload)
  const canonical = canonicalizeApprovalPayload(validated)
  const material = await provider.resolveTenantSecret(
    validated.tenant_id,
    validated.key_id,
    validated.key_version,
  )
  if (material === null) {
    throw new ApprovalMacError("tenant_secret_unavailable")
  }
  if (material.key_id !== validated.key_id) {
    throw new ApprovalMacError("unknown_key_id")
  }
  if (material.key_version !== validated.key_version) {
    throw new ApprovalMacError("unknown_key_version")
  }
  return createHmac("sha256", Buffer.from(material.secret))
    .update(canonical, "utf8")
    .digest("hex")
}

/**
 * Verify an expected MAC against a canonical approval payload with explicit
 * inputs only. Fail-closed order: payload validation → no_go_flags → expiry →
 * secret resolution → MAC recompute → constant-time compare. Returns a
 * structured result; never returns or logs secret material.
 */
export async function verifyApprovalMac(
  payload: unknown,
  expectedMac: string,
  provider: TenantSecretProvider,
  now: string = new Date().toISOString(),
): Promise<ApprovalMacVerificationResult> {
  // Validate once into a frozen snapshot; every gate below and the MAC recompute
  // read from this same snapshot, closing the getter-based TOCTOU where a live
  // input could show an expired expires_at / non-empty no_go_flags to the MAC
  // but a passing value to the gates.
  let validated: CanonicalApprovalPayload
  try {
    validated = validateCanonicalApprovalPayload(payload)
  } catch (error) {
    const reason =
      error instanceof CanonicalApprovalPayloadValidationError
        ? error.code
        : "invalid_field_type"
    return { ok: false, reason }
  }

  const identity = {
    tenant_id: validated.tenant_id,
    approval_request_id: validated.approval_request_id,
    key_id: validated.key_id,
    key_version: validated.key_version,
    hash_algorithm: validated.hash_algorithm,
    canonicalization_algorithm: validated.canonicalization_algorithm,
  }

  if (validated.no_go_flags.length > 0) {
    return { ok: false, reason: "no_go_flags_present", ...identity }
  }
  const nowMs = new Date(now).getTime()
  const expiresMs = new Date(validated.expires_at).getTime()
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) || nowMs >= expiresMs) {
    // Fail closed on an unparseable now / expires_at rather than treating a
    // NaN comparison (always false) as "not expired".
    return { ok: false, reason: "expired_payload", ...identity }
  }
  if (typeof expectedMac !== "string" || !MAC_HEX.test(expectedMac)) {
    return { ok: false, reason: "invalid_mac_format", ...identity }
  }

  let computed: string
  try {
    computed = await computeApprovalMac(validated, provider)
  } catch (error) {
    const reason =
      error instanceof ApprovalMacError ? error.code : "tenant_secret_unavailable"
    return { ok: false, reason, ...identity }
  }

  if (!constantTimeEqualHex(computed, expectedMac)) {
    return { ok: false, reason: "mac_mismatch", ...identity }
  }
  return { ok: true, reason: "verified", ...identity }
}
