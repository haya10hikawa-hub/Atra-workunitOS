/**
 * WU-01B: the first canonical neutral source-level record.
 *
 * PROVENANCE AND IDENTITY ONLY. A SourceRecordV1 records that one tenant
 * observed one provider object. It is NOT a WorkUnit, NOT a candidate, NOT a
 * proposal, NOT a review and NOT an approval. It carries no goal, no action,
 * no score, no confidence and no forward reference to any later record.
 *
 * NO CONSUMER. NO PERSISTENCE. NO PROVIDER CALL. NO CLOCK. NO RANDOMNESS.
 */

import type { TenantId } from "../tenant/types.ts"
import type { SourceType } from "../types.ts"

/** Version discriminant. An unknown value fails closed; it is never defaulted. */
export const SOURCE_RECORD_VERSION = "1" as const
export type SourceRecordVersion = typeof SOURCE_RECORD_VERSION

/**
 * One observed provider object.
 *
 * IDENTITY is exactly (tenantId, provider, providerObjectKey), compared
 * byte-for-byte with no normalization. No other field participates in identity
 * or equality — see declaredSourceRef and contentDigest.
 */
export type SourceRecordV1 = {
  readonly recordVersion: SourceRecordVersion

  /** Canonical branded tenant. Partition, never permission. */
  readonly tenantId: TenantId

  /** Namespace in which providerObjectKey is interpreted. Identity field. */
  readonly provider: SourceType

  /** The provider's own exact native key. Identity field. Never normalized. */
  readonly providerObjectKey: string

  /**
   * Opaque caller-declared token. NOT identity, NOT equality, never parsed,
   * never compared by this module. null = the caller declared none.
   */
  readonly declaredSourceRef: string | null

  /** Human recall locator. Never identity. null = unknown or absent. */
  readonly sourceUrl: string | null

  /** When Atra observed the provider stating this. Required instant. */
  readonly observedAt: string

  /** When Atra recorded the observation. Required; never before observedAt. */
  readonly recordedAt: string

  /**
   * When the event occurred at the source, if the provider stated it.
   * null = UNKNOWN. Never "now", "current", "open", "ongoing" or "infinite".
   */
  readonly sourceEventAt: string | null

  /**
   * Integrity evidence over the referenced content: `sha256:<64 lowercase hex>`.
   * Attested by the caller; never computed here. NOT identity, NOT equality.
   */
  readonly contentDigest: string
}

/** Closed, value-free failure vocabulary. No caller key or value is ever echoed. */
export type SourceRecordFailureCode =
  | "input_unreadable"
  | "unknown_field"
  | "missing_field"
  | "unsupported_record_version"
  | "invalid_tenant_id"
  | "invalid_provider"
  | "invalid_provider_object_key"
  | "invalid_declared_source_ref"
  | "invalid_source_url"
  | "invalid_instant"
  | "recorded_before_observed"
  | "invalid_content_digest"

export type SourceRecordValidationFailure = {
  readonly ok: false
  readonly failureCode: SourceRecordFailureCode
}

export type SourceRecordValidationSuccess = {
  readonly ok: true
  readonly record: SourceRecordV1
}

export type SourceRecordValidationResult =
  | SourceRecordValidationSuccess
  | SourceRecordValidationFailure
