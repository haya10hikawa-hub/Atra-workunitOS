/**
 * WU-01B: the sole runtime validation authority for SourceRecordV1.
 *
 * PURE, DETERMINISTIC, LEAF. No I/O, no clock, no randomness, no network, no
 * filesystem, no persistence, no provider. Never throws for ordinary invalid
 * input. Never mutates its argument. Returns a frozen, freshly-built record.
 *
 * Validation success is NOT authenticity, NOT authorization, NOT approval and
 * NOT permission to persist or execute.
 *
 * Identity is exactly (tenantId, provider, providerObjectKey). No value is
 * trimmed, case-folded, Unicode-normalized or URL-canonicalized on the way in
 * or out: a normalization step would silently merge two distinct provider
 * objects. `contentDigest` and `declaredSourceRef` are carried as evidence and
 * are never compared, parsed or promoted to identity here.
 */

import type { TenantId } from "../tenant/types.ts"
import type { SourceIdentityNamespace } from "../types.ts"
import type {
  SourceRecordFailureCode,
  SourceRecordV1,
  SourceRecordValidationFailure,
  SourceRecordValidationResult,
} from "./types.ts"

/** Exact own-key set, in the order fields are validated and constructed. */
const RECORD_KEYS = [
  "recordVersion", "tenantId", "provider", "providerObjectKey", "declaredSourceRef",
  "sourceUrl", "observedAt", "recordedAt", "sourceEventAt", "contentDigest",
] as const

/**
 * The accepted provider vocabulary is the domain `SourceIdentityNamespace` union,
 * reused rather than re-minted.
 *
 * Typing it as `Record<SourceIdentityNamespace, true>` makes the two drift-proof in
 * both directions at compile time: omitting a member is a missing-property error,
 * and adding a non-member is an excess-property error. No separate assertion
 * is needed, so there is nothing here that can rot unnoticed.
 *
 * `github` is absent and its absence is load-bearing: GitHub's reviewed resources are
 * `github_issue` and `github_pull_request`, and a record that fell back to the generic
 * provider would put two different provider key spaces in one namespace. It is refused
 * here as `invalid_provider` rather than folded into either resource — this validator
 * cannot know which resource a key came from, and guessing is exactly the false merge
 * the split exists to prevent.
 *
 * `gmail` is absent for the same reason and by the same rule: Gmail's one reviewed resource
 * is `gmail_message`, so the provider-level placeholder was resolved and removed rather than
 * left reachable beside it. Producer-unreachability of a resolved placeholder is guaranteed
 * by non-existence here, not by convention elsewhere.
 */
const ACCEPTED_PROVIDERS: Record<SourceIdentityNamespace, true> = {
  slack: true, notion: true, gmail_message: true, google_drive: true,
  google_calendar: true, github_issue: true, github_pull_request: true,
  manual: true, meeting_transcript: true,
}

const MAX_TENANT_ID = 200
const MAX_PROVIDER_OBJECT_KEY = 512
const MAX_DECLARED_SOURCE_REF = 512

/** Unicode control characters (C0, DEL, C1). Rejected, never stripped. */
const CONTROL_CHARACTER = /\p{Cc}/u

/** Lowercase-only, so an uppercase-hex digest is a rejection and not a silent fold. */
const CONTENT_DIGEST = /^sha256:[0-9a-f]{64}$/

/**
 * Pinned ISO-8601 UTC profile: `YYYY-MM-DDTHH:mm:ssZ` with optional 1–3 digit
 * fractional seconds and a mandatory trailing `Z`. No offset, no whitespace,
 * no omitted seconds, no trailing data.
 *
 * This profile is deliberately restated here rather than imported from
 * `app/lib/phase6/shared/isoUtcTimestamp.ts`: every Phase 6 module is shadow
 * only with no production consumer, and importing one from a domain record
 * would promote it to authority as a side effect. The two guards are pinned to
 * agree on a shared vector set by the contract test, so they cannot drift.
 */
const ISO_UTC_COMPONENTS =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/

function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isGregorianLeapYear(year) ? 29 : 28
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30
  if (month >= 1 && month <= 12) return 31
  return 0
}

/**
 * Returns a fixed-width comparable key for a valid instant, or null.
 *
 * The key exists only to order two instants; it is never stored. Lexicographic
 * comparison of the raw strings would be wrong, because `…:00Z` and `…:00.000Z`
 * denote the same instant but differ byte-for-byte. No `Date` is constructed
 * and no clock is read.
 */
function instantOrder(value: unknown): string | null {
  if (typeof value !== "string") return null
  const parts = ISO_UTC_COMPONENTS.exec(value)
  if (parts === null) return null

  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const hour = Number(parts[4])
  const minute = Number(parts[5])
  const second = Number(parts[6])

  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  if (hour > 23 || minute > 59 || second > 59) return null

  return `${parts[1]}${parts[2]}${parts[3]}${parts[4]}${parts[5]}${parts[6]}${(parts[7] ?? "").padEnd(3, "0")}`
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function fail(failureCode: SourceRecordFailureCode): SourceRecordValidationFailure {
  return Object.freeze({ ok: false as const, failureCode })
}

/**
 * Accepts `unknown`. A caller-supplied object is never trusted structurally.
 *
 * Order is fixed and total: structural readability, then unknown own keys by
 * NAME ONLY, then absent keys, then the version discriminant, then each field
 * in declared order. Optionality is expressed as `T | null`, never by key
 * absence, so a missing key is always a failure and never a default.
 */
export function validateSourceRecordV1(input: unknown): SourceRecordValidationResult {
  if (input === null || typeof input !== "object") return fail("input_unreadable")

  let own: (string | symbol)[]
  let values: Record<string, unknown>
  try {
    // A plain object only: an array, a class instance and any exotic prototype
    // are refused before a single value is read.
    const prototype = Object.getPrototypeOf(input)
    if (prototype !== Object.prototype && prototype !== null) return fail("input_unreadable")
    own = Reflect.ownKeys(input)
    if (own.some((key) => typeof key !== "string" || !RECORD_KEYS.includes(key as never))) {
      return fail("unknown_field")
    }
    if (RECORD_KEYS.some((key) => !own.includes(key))) return fail("missing_field")

    values = {}
    for (const key of RECORD_KEYS) values[key] = (input as Record<string, unknown>)[key]
  } catch {
    // A throwing accessor or revoked Proxy fails closed and value-free.
    return fail("input_unreadable")
  }

  if (values.recordVersion !== "1") return fail("unsupported_record_version")

  const tenantId = values.tenantId
  if (typeof tenantId !== "string" || tenantId.length === 0 || tenantId.length > MAX_TENANT_ID
    || tenantId !== tenantId.trim()) {
    return fail("invalid_tenant_id")
  }

  const provider = values.provider
  // Own keys only, so an inherited name such as `toString` is not a provider.
  if (typeof provider !== "string" || !Object.hasOwn(ACCEPTED_PROVIDERS, provider)) {
    return fail("invalid_provider")
  }

  const providerObjectKey = values.providerObjectKey
  if (typeof providerObjectKey !== "string" || providerObjectKey.length === 0
    || providerObjectKey.length > MAX_PROVIDER_OBJECT_KEY || CONTROL_CHARACTER.test(providerObjectKey)) {
    return fail("invalid_provider_object_key")
  }

  const declaredSourceRef = values.declaredSourceRef
  if (declaredSourceRef !== null && (typeof declaredSourceRef !== "string"
    || declaredSourceRef.length === 0 || declaredSourceRef.length > MAX_DECLARED_SOURCE_REF)) {
    return fail("invalid_declared_source_ref")
  }

  const sourceUrl = values.sourceUrl
  if (sourceUrl !== null && (typeof sourceUrl !== "string" || !isHttpsUrl(sourceUrl))) {
    return fail("invalid_source_url")
  }

  const observedOrder = instantOrder(values.observedAt)
  const recordedOrder = instantOrder(values.recordedAt)
  const sourceEventAt = values.sourceEventAt
  if (observedOrder === null || recordedOrder === null) return fail("invalid_instant")
  // null means UNKNOWN and nothing else: it is neither defaulted nor read as
  // now, current, open, ongoing, unbounded or infinite.
  if (sourceEventAt !== null && instantOrder(sourceEventAt) === null) return fail("invalid_instant")
  if (recordedOrder < observedOrder) return fail("recorded_before_observed")

  const contentDigest = values.contentDigest
  if (typeof contentDigest !== "string" || !CONTENT_DIGEST.test(contentDigest)) {
    return fail("invalid_content_digest")
  }

  // A freshly constructed, frozen record with the exact keys — never the
  // caller's object, so no later holder of the input can mutate the result.
  const record: SourceRecordV1 = Object.freeze({
    recordVersion: "1" as const,
    tenantId: tenantId as TenantId,
    provider: provider as SourceIdentityNamespace,
    providerObjectKey,
    declaredSourceRef,
    sourceUrl,
    observedAt: values.observedAt as string,
    recordedAt: values.recordedAt as string,
    sourceEventAt: sourceEventAt as string | null,
    contentDigest,
  })
  return Object.freeze({ ok: true as const, record })
}
