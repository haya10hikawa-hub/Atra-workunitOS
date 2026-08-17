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
import type { SourceIdentityNamespace } from "../types.ts"

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

  /**
   * Namespace in which providerObjectKey is interpreted. Identity field.
   *
   * A canonical identity namespace, not the application's integration vocabulary: where
   * one provider issues keys from separate spaces per resource, the resource is part of
   * the namespace. Two objects whose keys are byte-equal but whose namespaces differ are
   * two distinct sources, and no namespace is ever widened to a shared provider-level
   * value to make them one. See `SourceIdentityNamespace`.
   */
  readonly provider: SourceIdentityNamespace

  /**
   * The provider's own native identity for the observed object. Identity field.
   * Carried byte-for-byte and never normalized: no trimming, no case folding,
   * no Unicode normalization, no re-encoding.
   *
   * Where a provider's identity is scoped rather than scalar, this may be an
   * injective, reversible, provider-scoped serialization of provider-issued
   * identity components under a reviewed per-provider identity profile. Every
   * component must be provider-issued, provider-immutable for the object's
   * lifetime, and part of the provider's own identity. Composition does not
   * create identity: it is never a mutable or display name, a URL, an
   * Atra-generated or acquisition-generated id, or an array position.
   *
   * No per-provider identity profile is proven yet. This generic validator
   * cannot know a provider's identity contract and does not check nativeness;
   * see docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md.
   */
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
   * Integrity evidence over the provider's own content for the referenced
   * provider object, canonicalized under a reviewed per-provider content-scope
   * profile: `sha256:<64 lowercase hex>`. NOT identity, NOT equality.
   *
   * For one provider and one profile version: an equal digest means the
   * canonicalized in-scope provider content is byte-identical, a different
   * digest means at least one in-scope provider-content byte differs, and any
   * in-scope provider-content change must change the digest. It is never
   * computed over a NormalizedToolSignal, an acquisition envelope, a normalized
   * provider projection, SourceRecord fields, or any other Atra-side
   * representation.
   *
   * Attested by the caller; this domain carries the digest and never computes
   * or verifies the content. No per-provider content-scope profile is proven
   * yet; see docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md.
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
