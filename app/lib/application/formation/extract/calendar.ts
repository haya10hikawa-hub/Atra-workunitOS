/**
 * F2C — Deterministic Google Calendar formation extraction.
 *
 * Maps a bounded, normalized Calendar event (fixture-shaped; see
 * `./calendarTypes.ts`) onto the structured (`D`) fields of the F1A source
 * contract, then hands the constructed candidate to the REAL F1A builder and
 * returns its exact result.
 *
 * Constitutional dependency (plan Section 4):
 *   - Consumes F1A (`buildFormationSourceCandidate`,
 *     `snapshotValidatedFormationSourceResult` via the caller) plus the shared
 *     URL boundary (`parseProviderUrl`, `normalizeHost`,
 *     `recognizeGitHubObjectPath`) unchanged — never a weaker, duplicated parser.
 *   - Never calls or constructs F1B (Goal / Done Condition), F1C (aggregate /
 *     Source Role), the existing Calendar priority mapper, or any infrastructure
 *     Calendar surface — those imports are absent by design.
 *   - Never returns a forged or reconstructed candidate: the success result is the
 *     exact F1A builder object, which alone attests through
 *     `snapshotValidatedFormationSourceResult`; a clone would not.
 *
 * Determinism & scope (plan Sections 8–19):
 *   - Identity is composed from the opaque `calendarId`/`eventId` ONLY —
 *     independent of title, summary, organizer, attendees, start, status, and the
 *     opaque `sourceUrl`. `iCalUID` is NEVER identity; a recurring instance's
 *     `recurringEventId` becomes the PARENT, never the current object id.
 *   - The event START is the `explicitDeadline`; the Calendar END is an exclusive
 *     bound and is never the deadline. No urgency/priority/ranking is derived from
 *     proximity to start.
 *   - `updatedAt` (not the wall clock or any id) is the `occurredAt` authority.
 *   - Natural-language (`L`) fields, Source Role, `deadline_context`,
 *     `context_only`, authority, grouping, membership, and ranking are NOT
 *     produced. `eventType` has NO effect. A cancelled source does not complete a
 *     WorkUnit; a confirmed event is not an approval.
 *   - No LLM. No network access. No Calendar URL is ever synthesized.
 */

import { buildFormationSourceCandidate, FORMATION_SOURCE_BOUNDS, type FormationSourceStatus } from "../sourceContract.ts"
import { normalizeHost, parseProviderUrl, recognizeGitHubObjectPath } from "./providerUrl.ts"
import type { ProviderUrlRejection } from "./providerUrl.ts"
import { compareValidatedCalendarTimes, isValidCalendarTime } from "./calendarTime.ts"
import type {
  CalendarExtractionConfig,
  CalendarExtractionRejection,
  CalendarFormationExtractionResult,
  NormalizedCalendarFormationInput,
  NormalizedCalendarStatus,
} from "./calendarTypes.ts"

const PROVIDER = "google_calendar" as const

const DEFAULT_GITHUB_HOSTS: readonly string[] = ["github.com"]

// Resource bound (plan Section 16): 1 primary source link + at most 49 referenced
// links == F1A's 50-link boundary. The normalized referenced-URL array is rejected
// BEFORE iteration when it exceeds this, so oversized input never drives unbounded
// parse/dedup work. A deterministic bound on the normalized contract.
const MAX_REFERENCED_URLS = 49

// The F1A actor-assertion boundary (plan Section 13). The bound is applied to the
// normalized input BEFORE any per-attendee iteration, so oversized attendee input
// is REJECTED (never truncated) without unbounded work.
const MAX_ACTOR_ASSERTIONS = FORMATION_SOURCE_BOUNDS.actorAssertionsMaxEntries

// The F1A identifier length boundary. The composed object/parent identity must fit
// within it (plan Section 8: reject values that make the final identity exceed its
// bound), checked here so an oversized identity is a clear identity failure rather
// than an opaque `source_contract_rejected`.
const IDENTIFIER_MAX_LENGTH = FORMATION_SOURCE_BOUNDS.identifierMaxLength

// Opaque provider identifiers never contain whitespace, control characters, or
// Unicode format characters (General Category Cf). Cf/control characters are
// invisible yet byte-distinct and would defeat identity equality; whitespace (which
// includes leading/trailing spaces, tabs, NUL is Cc, and line breaks) is refused
// outright. Delimiter characters (`/`, `:`, `#`) are allowed here because they are
// percent-encoded before composition, so they cannot inject a false identity
// boundary. Evaluated with the `u` flag so membership is deterministic and
// locale-independent.
const FORBIDDEN_IDENTIFIER_CHARS = /[\s\p{Cc}\p{Cf}]/u

// Structured Calendar status → a single SOURCE status marker (plan Section 12).
// `confirmed` is scheduled state, NOT an approval; `cancelled` is source state, NOT
// WorkUnit completion; `tentative` is genuinely unknown. This is a source status
// only — never a Done Condition status or an authority signal, and never inferred
// from the event type, title, attendees, organizer, or start proximity.
const STATUS_TO_MARKER: Readonly<Record<NormalizedCalendarStatus, FormationSourceStatus>> = {
  confirmed: "scheduled",
  tentative: "unknown",
  cancelled: "cancelled",
}

function mapUrlRejection(reason: ProviderUrlRejection): CalendarExtractionRejection {
  switch (reason) {
    case "not_string":
      return "source_url_not_string"
    case "too_long":
      return "source_url_too_long"
    case "unparseable":
      return "source_url_unparseable"
    case "scheme_not_https":
      return "source_url_scheme_not_https"
    case "userinfo_present":
      return "source_url_userinfo_present"
    case "empty_host":
      return "source_url_empty_host"
    case "host_not_allowed":
      return "source_url_host_not_allowed"
    case "sensitive_value":
      return "source_url_sensitive_value"
  }
}

/** True when `value` is a safe, exact opaque provider identifier (plan Section 8). */
function isSafeOpaqueId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= IDENTIFIER_MAX_LENGTH &&
    !FORBIDDEN_IDENTIFIER_CHARS.test(value)
  )
}

type ActorAssertion = { readonly name: string; readonly assertedRelation: "author" | "mentioned" }
type ObjectRef = { readonly provider: "github"; readonly sourceObjectId: string }
type SourceLink = { readonly url: string; readonly recognized?: ObjectRef }

type ResolvedCalendarConfig = {
  readonly calendarHosts: readonly string[]
  readonly githubHosts: ReadonlySet<string>
}

/**
 * Validate the extraction configuration, fail-closed. `calendarHosts` must be a
 * non-empty array of bare, normalized hostnames; a malformed entry (a non-string,
 * or anything carrying a scheme/path/port/userinfo/query/fragment) rejects the
 * whole configuration. Canonical case/trailing-dot variants deduplicate. GitHub
 * hosts are optional and malformed entries there are simply skipped (they only
 * gate reference recognition, and default to `github.com`).
 */
function resolveConfig(config: CalendarExtractionConfig): ResolvedCalendarConfig | null {
  if (config === null || typeof config !== "object") return null
  const rawHosts = config.calendarHosts
  if (!Array.isArray(rawHosts) || rawHosts.length === 0) return null

  const seen = new Set<string>()
  const calendarHosts: string[] = []
  for (const entry of rawHosts) {
    if (typeof entry !== "string") return null
    const normalized = normalizeHost(entry)
    if (normalized === null) return null // fail closed on any malformed calendar host
    if (!seen.has(normalized)) {
      seen.add(normalized)
      calendarHosts.push(normalized)
    }
  }

  const githubHosts = new Set<string>()
  for (const entry of config.githubHosts ?? DEFAULT_GITHUB_HOSTS) {
    const normalized = normalizeHost(entry)
    if (normalized !== null) githubHosts.add(normalized)
  }

  return { calendarHosts, githubHosts }
}

type RecurrenceResolution =
  | { readonly ok: true; readonly recurring: false }
  | { readonly ok: true; readonly recurring: true; readonly recurringEventId: string }
  | { readonly ok: false }

/**
 * Validate the recurrence contract (plan Section 9). A single event carries
 * neither `recurringEventId` nor `originalStart`; a recurring instance carries
 * BOTH. `recurringEventId` must be a safe opaque id DISTINCT from `eventId` (so the
 * series parent can never collide with the instance), and `originalStart` must be a
 * valid Calendar time. A moved instance (`originalStart != start`) is valid and is
 * NOT required to equal `start`.
 */
function resolveRecurrence(input: NormalizedCalendarFormationInput): RecurrenceResolution {
  const hasRecurringId = input.recurringEventId !== undefined
  const hasOriginalStart = input.originalStart !== undefined
  if (hasRecurringId !== hasOriginalStart) return { ok: false } // one without the other
  if (!hasRecurringId) return { ok: true, recurring: false }

  const recurringEventId = input.recurringEventId as string
  if (!isSafeOpaqueId(recurringEventId)) return { ok: false }
  if (recurringEventId === input.eventId) return { ok: false } // instance id == series id
  if (!isValidCalendarTime(input.originalStart as NormalizedCalendarFormationInput["start"])) return { ok: false }
  return { ok: true, recurring: true, recurringEventId }
}

/**
 * Extract a deterministic F1A source candidate from a normalized Calendar event.
 *
 * Returns the exact F1A builder result on success (`{ ok: true, sourceResult }`)
 * or a small, content-free provider-extraction rejection on failure. Never mutates
 * `input` or `config`, never performs network access, and never invokes an LLM.
 */
export function extractCalendarFormationSource(
  input: NormalizedCalendarFormationInput,
  config: CalendarExtractionConfig,
): CalendarFormationExtractionResult {
  // ── Event type: validated and preserved (never authority, never semantic) ──
  if (input.eventType !== "deadline_approaching" && input.eventType !== "meeting_preparation_needed") {
    return { ok: false, reason: "event_type_unsupported" }
  }

  // ── Status: structured Calendar status → one source marker ──
  const statusMarker = STATUS_TO_MARKER[input.status]
  if (statusMarker === undefined) return { ok: false, reason: "status_invalid" }

  // ── Configuration: explicit, fail-closed calendar-host allowlist ──
  const resolved = resolveConfig(config)
  if (resolved === null) return { ok: false, reason: "config_invalid" }

  // ── Identity: opaque calendarId / eventId ONLY (plan Section 8) ──
  if (!isSafeOpaqueId(input.calendarId) || !isSafeOpaqueId(input.eventId)) {
    return { ok: false, reason: "identity_unsafe" }
  }

  // ── Recurrence contract (plan Section 9) ──
  const recurrence = resolveRecurrence(input)
  if (!recurrence.ok) return { ok: false, reason: "recurrence_invalid" }

  // Collision-safe component encoding: a `/`, `:`, or `#` inside an id becomes
  // `%2F`/`%3A`/`%23`, so it can never be confused with a structural delimiter.
  // Identity is therefore a function of calendarId/eventId ONLY.
  const encodedCalendarId = encodeURIComponent(input.calendarId)
  const encodedEventId = encodeURIComponent(input.eventId)
  const sourceObjectId = `${PROVIDER}:${encodedCalendarId}/${encodedEventId}`
  const parentObjectId = recurrence.recurring
    ? `${PROVIDER}:${encodedCalendarId}/${encodeURIComponent(recurrence.recurringEventId)}`
    : `${PROVIDER}:${encodedCalendarId}`

  if (sourceObjectId.length > IDENTIFIER_MAX_LENGTH || parentObjectId.length > IDENTIFIER_MAX_LENGTH) {
    return { ok: false, reason: "identity_too_long" }
  }
  // Defensive: the series parent must never equal the instance identity (already
  // guaranteed by `recurringEventId != eventId`, re-checked on the composed ids).
  if (parentObjectId === sourceObjectId) return { ok: false, reason: "recurrence_invalid" }

  const externalId = input.eventId
  const container = input.calendarId

  // ── Temporal contract (plan Sections 10–11) ──
  if (!isValidCalendarTime(input.start) || !isValidCalendarTime(input.end)) {
    return { ok: false, reason: "calendar_time_invalid" }
  }
  if (input.start.kind !== input.end.kind) {
    return { ok: false, reason: "calendar_time_kind_mismatch" }
  }
  // The Calendar end is an EXCLUSIVE bound: end must be strictly after start.
  if (compareValidatedCalendarTimes(input.start, input.end) >= 0) {
    return { ok: false, reason: "calendar_time_end_not_after_start" }
  }

  // The START is the explicit deadline (never the exclusive end). An all-day date
  // is stored verbatim — never promoted to a UTC-midnight instant.
  const explicitDeadline = { value: input.start.value, inferred: false }

  // ── Primary URL: OPAQUE provider deep link, host policy only (plan Section 15) ──
  // The URL is screened for scheme/userinfo/host/sensitive-value by the shared
  // boundary but is NEVER decoded, reverse-engineered, or used to derive identity.
  // Its structure does not prove calendarId/eventId; a future live adapter must
  // attest the URL came from the same normalized record.
  const primary = parseProviderUrl(input.sourceUrl, resolved.calendarHosts)
  if (!primary.ok) return { ok: false, reason: mapUrlRejection(primary.reason) }
  const navigationTarget = primary.value.url

  // ── Actor assertions (plan Section 13): organizer→author, attendees→mentioned ──
  // The F1A actor bound is applied to the NORMALIZED input before iteration: an
  // input that would exceed 20 assertions is rejected, never truncated.
  const attendees = input.attendees ?? []
  const rawActorCount = (input.organizer !== undefined ? 1 : 0) + attendees.length
  if (rawActorCount > MAX_ACTOR_ASSERTIONS) return { ok: false, reason: "actor_limit_exceeded" }

  const actorAssertions: ActorAssertion[] = []
  const seenActors = new Set<string>()
  const pushActor = (name: string, assertedRelation: "author" | "mentioned"): void => {
    // Deterministic exact dedup on the (relation, name) pair. Organizer-as-author
    // and the same person as a mentioned attendee are distinct source-local
    // assertions and both survive; an exact repeat collapses.
    const key = `${assertedRelation} ${name}`
    if (seenActors.has(key)) return
    seenActors.add(key)
    actorAssertions.push({ name, assertedRelation })
  }
  if (input.organizer !== undefined) pushActor(input.organizer, "author")
  for (const attendee of attendees) pushActor(attendee, "mentioned")

  // ── Timestamps from structured provider timestamps only ──
  // `updatedAt` is the occurred-at authority; it is never derived from eventId,
  // iCalUID, title, or the wall clock.
  const timestamps = { occurredAt: input.updatedAt, capturedAt: input.capturedAt }

  // ── Sequence → version info (plan Section 14): a label, never authority ──
  let versionInfo: { readonly value: string; readonly inferred: false } | undefined
  if (input.sequence !== undefined) {
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
      return { ok: false, reason: "sequence_invalid" }
    }
    versionInfo = { value: `sequence:${input.sequence}`, inferred: false }
  }

  // ── Source links + deterministically recognized GitHub references (Section 16) ──
  // Reject an oversized referenced-URL array BEFORE any iteration.
  const referencedUrls = input.referencedUrls ?? []
  if (referencedUrls.length > MAX_REFERENCED_URLS) {
    return { ok: false, reason: "referenced_urls_too_many" }
  }

  const sourceLinks: SourceLink[] = [{ url: primary.value.url }]
  const seenLinks = new Set<string>([primary.value.url])
  const referencedObjects: ObjectRef[] = []
  const seenRefs = new Set<string>()

  for (const rawUrl of referencedUrls) {
    // Any safe https host may be retained as an OPAQUE source link; only an allowed
    // GitHub host (object path) becomes a recognized reference. Slack and every
    // other link stay opaque (no cross-provider recognition in this slice). Unsafe,
    // unparseable, or sensitive-value-bearing referenced URLs are DROPPED WITHOUT
    // ECHO (`parseProviderUrl` refuses `sensitive_value`), never fetched.
    const safe = parseProviderUrl(rawUrl)
    if (!safe.ok) continue

    let recognized: ObjectRef | undefined
    if (resolved.githubHosts.has(safe.value.hostname)) {
      const githubRef = recognizeGitHubObjectPath(safe.value.pathname)
      if (githubRef !== null) {
        // Canonical (ASCII lowercase) GitHub identity per the shared F2A policy, so
        // a case variant dedupes to one identity.
        recognized = {
          provider: "github",
          sourceObjectId: `github:${githubRef.owner.toLowerCase()}/${githubRef.name.toLowerCase()}#${githubRef.number}`,
        }
      }
    }

    // Exact-string dedup for source links; canonical-identity dedup for referenced
    // objects; the primary object never lists itself as a reference.
    if (!seenLinks.has(safe.value.url)) {
      seenLinks.add(safe.value.url)
      sourceLinks.push(recognized !== undefined ? { url: safe.value.url, recognized } : { url: safe.value.url })
    }
    if (recognized !== undefined) {
      const key = `${recognized.provider} ${recognized.sourceObjectId}`
      if (recognized.sourceObjectId !== sourceObjectId && !seenRefs.has(key)) {
        seenRefs.add(key)
        referencedObjects.push(recognized)
      }
    }
  }

  // ── Construct ONLY the bounded F1A input (D fields; every L field omitted). ──
  // Derived fields (`extractionConfidence`, `candidateOnly`) are NOT supplied — F1A
  // derives them. No Goal, Done Condition, Source Role, decision/unresolved marker,
  // authority signal, supersession, grouping, or membership field appears here; the
  // semantic/structural arrays are explicitly empty (plan Section 17). `threadId` is
  // never emitted — the recurrence relation is container structure, not a thread.
  const candidateInput = {
    provider: PROVIDER,
    sourceRef: {
      source: PROVIDER,
      externalId,
      container,
      url: primary.value.url,
      capturedAt: input.capturedAt,
    },
    sourceObjectId,
    parentObjectId,
    title: input.title,
    sanitizedSummary: input.summary,
    actorAssertions,
    timestamps,
    explicitDeadline,
    sourceLinks,
    referencedObjects,
    ...(versionInfo !== undefined ? { versionInfo } : {}),
    supersedes: [],
    supersededBy: [],
    unresolvedMarkers: [],
    decisionMarkers: [],
    statusMarkers: [statusMarker],
    authoritySignals: [],
    navigationTarget,
  }

  // ── F1A handoff: serialize and call the REAL builder (plan Section 19). ──
  // The builder is the sole validation authority. Its exact returned object is
  // propagated on success so it attests through
  // `snapshotValidatedFormationSourceResult`; a clone would not.
  const result = buildFormationSourceCandidate(JSON.stringify(candidateInput))
  if (!result.ok) {
    return { ok: false, reason: "source_contract_rejected" }
  }
  return { ok: true, sourceResult: result }
}
