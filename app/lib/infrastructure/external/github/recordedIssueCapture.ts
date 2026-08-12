/**
 * GitHub issue acquisition — recorded, read-only, evidence-deriving.
 *
 * Turns one retained human-triggered GitHub REST export into one
 * `AcquisitionCapture`. It is the GitHub half of P1-1: the module that knows a
 * provider's identity and content contracts, and the only module authorized to state
 * them. Its proof is recorded in
 * docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md.
 *
 * PURE. No network, no clock, no randomness, no filesystem, no persistence. The
 * caller supplies the retained archive text; this module never fetches anything, so
 * a recorded capture can never silently become a live read. Async only because
 * SHA-256 is, and the digest is computed over the retained bytes with the Web Crypto
 * API available in both the Node and Workers runtimes.
 *
 * THE ONE PROPERTY THAT MAKES THIS EVIDENCE
 *
 * Every evidential value — `providerObjectKey`, `contentDigest`, `sourceEventAt` —
 * is DERIVED from the retained provider bytes, never read from the archive envelope.
 * The envelope states only what the provider cannot: which capture this was, which
 * tenant partition it belongs to, how it was acquired, and when Atra observed it.
 * An operator therefore cannot assert an identity or a digest that the bytes do not
 * support, and any reviewer holding the same bytes recomputes all three.
 *
 * The retained bytes are never edited, never re-serialized and never normalized. The
 * digest's subject is the exact retained byte stream, and base64 is used only as a
 * lossless transport encoding of it.
 */

import type {
  AcquisitionCapture,
  AcquisitionCaptureId,
  AcquisitionTenantPartition,
} from "../../../ports/acquisitionEvidence/types.ts"

/**
 * The ratified GitHub issue profiles, stated once.
 *
 * `providerNamespace` is GitHub's own identifier space for the issue resource, not
 * Atra's `NormalizedToolProvider` spelling and not the `SourceType` member a record
 * later carries. The mapping from this namespace to a record vocabulary is the
 * producer's decision and is deliberately not made here.
 *
 * Both profiles are versioned separately because they answer different questions and
 * can move independently: narrowing the content scope must not invalidate keys, and
 * re-versioning identity must not silently re-scope digests.
 */
export const GITHUB_ISSUE_ACQUISITION_PROFILE = Object.freeze({
  /** GitHub's issue identifier space on github.com. */
  providerNamespace: "github.com/rest/issues",
  /**
   * Identity = the issue's database primary key, as GitHub's own schema names it
   * ("Identifies the primary key from the database"), serialized as its exact
   * decimal digits. Not `node_id`, whose values GitHub has already migrated once.
   */
  identityProfileId: "github.issue.rest.database-primary-key",
  identityProfileVersion: "1",
  /**
   * Content scope = the complete retained provider response byte stream, with the
   * identity canonicalization (no transformation of any kind). Selecting a subset
   * would require an Atra-side projection step; version 1 deliberately has none.
   */
  contentScopeProfileId: "github.issue.rest.retained-response-body",
  contentScopeProfileVersion: "1",
})

/** Closed, value-free failure vocabulary. No archive or provider value is echoed. */
export type RecordedGitHubIssueCaptureFailureCode =
  | "archive_unreadable"
  | "archive_unknown_field"
  | "archive_missing_field"
  | "unsupported_archive_version"
  | "invalid_capture_id"
  | "invalid_tenant_partition"
  | "unauthorized_acquisition_mode"
  | "unauthorized_request_method"
  | "invalid_observed_at"
  | "unsupported_retention"
  | "invalid_retained_bytes"
  | "retained_content_unreadable"
  | "provider_identity_absent"
  | "provider_identity_unrepresentable"
  | "provider_event_time_unreadable"

export type RecordedGitHubIssueCaptureResult =
  | { readonly ok: true; readonly capture: AcquisitionCapture }
  | { readonly ok: false; readonly failureCode: RecordedGitHubIssueCaptureFailureCode }

const ARCHIVE_KEYS = [
  "archiveVersion", "captureId", "tenantPartition", "acquisitionMode",
  "observedAt", "capturedFrom", "retainedContent",
] as const

/**
 * Provenance for a human reader, and nothing else.
 *
 * It is validated so it cannot smuggle unexpected material into a reviewed artifact,
 * and it is read for exactly one decision: that the recorded request was a read.
 * `requestUrl` is never an identity, never a digest subject and never re-fetched —
 * re-fetching would convert a recorded capture into a live read.
 */
const CAPTURED_FROM_KEYS = [
  "requestMethod", "requestUrl", "providerApiVersion", "acceptHeader",
] as const

const RETAINED_CONTENT_KEYS = ["retention", "bytesBase64"] as const

const MAX_CAPTURE_ID = 200
const MAX_TENANT_PARTITION = 200
/** 8 MiB of base64. A capture larger than this is refused before it is decoded. */
const MAX_RETAINED_BASE64 = 8 * 1024 * 1024

const CONTROL_CHARACTER = /\p{Cc}/u
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/**
 * The same pinned ISO-8601 UTC profile the Source domain validates against:
 * `YYYY-MM-DDTHH:mm:ssZ` with optional 1–3 fractional digits and a mandatory `Z`.
 *
 * Restated rather than imported because a domain validator is not an acquisition
 * dependency, and because acquisition must reject a shape the domain would reject
 * rather than discover it two layers later. The contract test pins the two against a
 * shared vector set so they cannot drift.
 */
const ISO_UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

function fail(
  failureCode: RecordedGitHubIssueCaptureFailureCode,
): RecordedGitHubIssueCaptureResult {
  return Object.freeze({ ok: false as const, failureCode })
}

/** A plain object only: arrays, class instances and exotic prototypes are refused. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Exact own-key equality, by name. Missing and unknown keys are distinct failures. */
function keyFailure(
  value: Record<string, unknown>,
  keys: readonly string[],
): "archive_unknown_field" | "archive_missing_field" | null {
  const own = Reflect.ownKeys(value)
  if (own.some((key) => typeof key !== "string" || !keys.includes(key))) return "archive_unknown_field"
  if (keys.some((key) => !own.includes(key))) return "archive_missing_field"
  return null
}

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && value === value.trim() && !CONTROL_CHARACTER.test(value)
}

/**
 * Decodes canonical base64 to bytes, or returns null.
 *
 * Canonicality is checked by re-encoding and comparing: `atob` accepts final quanta
 * whose unused bits are set, so two distinct strings could otherwise decode to the
 * same retained content and both be accepted as "the" retained bytes.
 */
function decodeCanonicalBase64(value: string): Uint8Array<ArrayBuffer> | null {
  if (value.length === 0 || value.length > MAX_RETAINED_BASE64) return null
  if (!CANONICAL_BASE64.test(value)) return null
  let binary: string
  try {
    binary = atob(value)
  } catch {
    return null
  }
  // Backed by a concrete ArrayBuffer rather than the default `ArrayBufferLike`, so the byte view
  // handed to the digest is the exact one Web Crypto's `BufferSource` accepts in both runtimes.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  let reencoded = ""
  for (const byte of bytes) reencoded += String.fromCharCode(byte)
  return btoa(reencoded) === value ? bytes : null
}

function toHex(buffer: ArrayBuffer): string {
  let hex = ""
  for (const byte of new Uint8Array(buffer)) hex += byte.toString(16).padStart(2, "0")
  return hex
}

/**
 * Acquires one capture from one retained GitHub issue export.
 *
 * The argument is the archive text and never a provider handle. There is no code
 * path from here to the network.
 */
export async function acquireRecordedGitHubIssueCapture(
  archiveText: unknown,
): Promise<RecordedGitHubIssueCaptureResult> {
  if (typeof archiveText !== "string") return fail("archive_unreadable")

  let archive: unknown
  try {
    archive = JSON.parse(archiveText)
  } catch {
    return fail("archive_unreadable")
  }
  if (!isPlainObject(archive)) return fail("archive_unreadable")

  const archiveKeyFailure = keyFailure(archive, ARCHIVE_KEYS)
  if (archiveKeyFailure !== null) return fail(archiveKeyFailure)

  if (archive.archiveVersion !== "1") return fail("unsupported_archive_version")
  if (!isBoundedText(archive.captureId, MAX_CAPTURE_ID)) return fail("invalid_capture_id")
  if (!isBoundedText(archive.tenantPartition, MAX_TENANT_PARTITION)) {
    return fail("invalid_tenant_partition")
  }
  // The one authorized mode, compared against the literal rather than a variable, so
  // widening acquisition authority cannot happen by data.
  if (archive.acquisitionMode !== "HUMAN_TRIGGERED_PROVIDER_EXPORT") {
    return fail("unauthorized_acquisition_mode")
  }
  if (typeof archive.observedAt !== "string" || !ISO_UTC_INSTANT.test(archive.observedAt)) {
    return fail("invalid_observed_at")
  }

  const capturedFrom = archive.capturedFrom
  if (!isPlainObject(capturedFrom)) return fail("archive_unreadable")
  const capturedFromKeyFailure = keyFailure(capturedFrom, CAPTURED_FROM_KEYS)
  if (capturedFromKeyFailure !== null) return fail(capturedFromKeyFailure)
  // Read-only acquisition, checked rather than asserted in prose. A capture recorded
  // from anything but a read is refused here, whatever else it carries.
  if (capturedFrom.requestMethod !== "GET") return fail("unauthorized_request_method")

  const retainedContent = archive.retainedContent
  if (!isPlainObject(retainedContent)) return fail("archive_unreadable")
  const retainedKeyFailure = keyFailure(retainedContent, RETAINED_CONTENT_KEYS)
  if (retainedKeyFailure !== null) return fail(retainedKeyFailure)
  if (retainedContent.retention !== "INLINE_BYTES") return fail("unsupported_retention")
  if (typeof retainedContent.bytesBase64 !== "string") return fail("invalid_retained_bytes")

  const bytes = decodeCanonicalBase64(retainedContent.bytesBase64)
  if (bytes === null) return fail("invalid_retained_bytes")

  // The digest's subject: the exact retained bytes, under the identity
  // canonicalization. Nothing between the retained stream and the hash function.
  const contentDigest = `sha256:${toHex(await crypto.subtle.digest("SHA-256", bytes))}`

  let providerObject: unknown
  try {
    providerObject = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch {
    return fail("retained_content_unreadable")
  }
  if (!isPlainObject(providerObject)) return fail("retained_content_unreadable")

  // Identity, derived from the provider's own bytes. `id` is the issue's database
  // primary key; `node_id` is deliberately not used.
  const primaryKey = providerObject.id
  if (typeof primaryKey !== "number") return fail("provider_identity_absent")
  // A key outside the exactly-representable integer range would have been rounded by
  // the JSON parser, so the digits below would not be GitHub's. Refused, never
  // approximated.
  if (!Number.isSafeInteger(primaryKey) || primaryKey <= 0) {
    return fail("provider_identity_unrepresentable")
  }

  // Provider-stated event time. GitHub states when the issue was created; nothing is
  // substituted when it does not, and no other field is read in its place.
  const createdAt = providerObject.created_at
  if (typeof createdAt !== "string" || !ISO_UTC_INSTANT.test(createdAt)) {
    return fail("provider_event_time_unreadable")
  }

  const capture: AcquisitionCapture = Object.freeze({
    kind: "CAPTURE" as const,
    captureId: archive.captureId as AcquisitionCaptureId,
    tenantPartition: archive.tenantPartition as AcquisitionTenantPartition,
    acquisitionMode: "HUMAN_TRIGGERED_PROVIDER_EXPORT" as const,
    identity: Object.freeze({
      providerNamespace: GITHUB_ISSUE_ACQUISITION_PROFILE.providerNamespace,
      providerObjectKey: String(primaryKey),
      identityProfileId: GITHUB_ISSUE_ACQUISITION_PROFILE.identityProfileId,
      identityProfileVersion: GITHUB_ISSUE_ACQUISITION_PROFILE.identityProfileVersion,
    }),
    retainedContent: Object.freeze({
      retention: "INLINE_BYTES" as const,
      bytesBase64: retainedContent.bytesBase64,
    }),
    contentScope: Object.freeze({
      contentScopeProfileId: GITHUB_ISSUE_ACQUISITION_PROFILE.contentScopeProfileId,
      contentScopeProfileVersion: GITHUB_ISSUE_ACQUISITION_PROFILE.contentScopeProfileVersion,
      contentDigest,
    }),
    observedAt: archive.observedAt,
    sourceEventAt: createdAt,
  })
  return Object.freeze({ ok: true as const, capture })
}
