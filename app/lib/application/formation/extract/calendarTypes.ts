/**
 * F2C — Google Calendar deterministic extraction input/config/result contract.
 *
 * A small, CLOSED input type: only the normalized, structured fields required for
 * deterministic (`D`) extraction. Like the F2A GitHub and F2B Slack contracts it
 * deliberately CANNOT represent a live provider surface — there is no field for a
 * Google Calendar API client, an OAuth grant, an access/refresh token, a sync or
 * page token, a cookie, an authorization header, an etag, a raw event/payload,
 * description HTML, conference data (hangout link, meeting code, access code,
 * passcode, pin), reminders, extended properties, or attachments. The extractor
 * consumes THIS shape only, AFTER the acquisition/normalization boundary.
 *
 * Trust boundary (plan Sections 6, 15):
 *   - F2C is a TRUSTED_NORMALIZED_INTERNAL_BOUNDARY and is UNWIRED. It makes no
 *     claim of arbitrary-runtime totality: a future LIVE Calendar adapter must
 *     runtime-normalize a raw Google Calendar event into this shape BEFORE calling
 *     F2C, and must attest that `sourceUrl` was copied from the SAME normalized
 *     event record as `calendarId`/`eventId` (this module cannot verify that from
 *     the opaque Web-UI deep link — see plan Section 15).
 *
 * Scope boundary (plan Sections 12, 18):
 *   - No Goal, Done Condition, Verifier, Acceptance Criteria, Decision Needed,
 *     Source Role, `deadline_context`, `context_only`, authority, membership,
 *     grouping, ranking, State Prediction, priority, or aggregate.
 *   - No natural-language (`L`) interpretation: fields requiring it are omitted.
 *   - The extractor's success output is the EXACT F1A builder result object; it
 *     never reconstructs the F1A success type.
 */

import type { FormationSourceContractResult } from "../sourceContract.ts"

/**
 * Normalized Calendar event type. A closed union (never a raw provider string):
 * the normalization boundary maps a provider event onto exactly one of these. The
 * event type is validated and preserved but has NO downstream effect — it never
 * implies a status, priority, urgency, ranking, Goal, task, Source Role, or
 * authority (plan Sections 12, 18). `deadline_approaching` creates no urgency;
 * `meeting_preparation_needed` creates no task or Goal.
 */
export type NormalizedCalendarEventType = "deadline_approaching" | "meeting_preparation_needed"

/**
 * Normalized, structured Calendar status. A closed union — SOURCE status only,
 * never a Done Condition status, an approval, or an authority signal, and never
 * inferred from the event type, title, summary, start proximity, attendee
 * responses, organizer, or calendar name (plan Section 12).
 */
export type NormalizedCalendarStatus = "confirmed" | "tentative" | "cancelled"

/**
 * A normalized Calendar time. Google Calendar times are either an all-day `date`
 * (`YYYY-MM-DD`) or a timed `date_time` (strict RFC 3339 with an explicit `Z` or
 * numeric UTC offset). The two forms are kept DISTINCT: an all-day date is never
 * reinterpreted as UTC midnight (plan Sections 10–11).
 */
export type NormalizedCalendarTime =
  | { readonly kind: "date"; readonly value: string }
  | { readonly kind: "date_time"; readonly value: string }

/**
 * The bounded, fixture-shaped normalized Calendar event F2C accepts.
 *
 * Identity fields (`calendarId`, `eventId`) are exact opaque provider identifiers.
 * `updatedAt` is the timestamp AUTHORITY (maps to `occurredAt`); `capturedAt` is
 * the acquisition/normalization timestamp stamped by the boundary that produced
 * this record. A recurring instance carries `recurringEventId` (the series id) and
 * `originalStart` (the series slot); a single event carries neither. `sequence` is
 * the provider event version. `sourceUrl` is an OPAQUE provider deep link — its
 * structure never defines identity (plan Section 15).
 */
export type NormalizedCalendarFormationInput = {
  readonly eventType: NormalizedCalendarEventType

  readonly calendarId: string
  readonly eventId: string

  readonly iCalUID?: string
  readonly recurringEventId?: string
  readonly originalStart?: NormalizedCalendarTime

  readonly title: string
  readonly summary: string

  readonly organizer?: string
  readonly attendees?: readonly string[]

  readonly status: NormalizedCalendarStatus

  readonly start: NormalizedCalendarTime
  readonly end: NormalizedCalendarTime

  readonly sourceUrl: string

  readonly updatedAt: string
  readonly capturedAt: string

  readonly sequence?: number
  readonly referencedUrls?: readonly string[]
}

/**
 * Calendar extraction configuration. Calendar hosts are supplied EXPLICITLY by the
 * trusted normalization boundary — provider identity is never inferred from a URL
 * substring. `calendarHosts` must be non-empty, hold only bare normalized
 * hostnames (no scheme/path/port/userinfo/query/fragment), deduplicate canonical
 * case/trailing-dot variants, and fail closed on any malformed entry (plan Section
 * 15). GitHub hosts for referenced-link recognition are allowed ONLY through
 * `githubHosts`; when omitted, only `github.com` is trusted for references.
 */
export type CalendarExtractionConfig = {
  readonly calendarHosts: readonly string[]
  readonly githubHosts?: readonly string[]
}

/**
 * Provider-extraction rejection categories. Deliberately carry NO echo of the
 * rejected input value, URL, host, identifier, or secret — every value is a closed
 * discriminator only. `source_contract_rejected` is opaque: it means the F1A
 * builder rejected the constructed candidate, without exposing the rejected content
 * or F1A's own finding detail.
 */
export type CalendarExtractionRejection =
  | "source_contract_rejected"
  | "config_invalid"
  | "event_type_unsupported"
  | "status_invalid"
  | "identity_unsafe"
  | "identity_too_long"
  | "recurrence_invalid"
  | "calendar_time_invalid"
  | "calendar_time_kind_mismatch"
  | "calendar_time_end_not_after_start"
  | "actor_limit_exceeded"
  | "sequence_invalid"
  | "referenced_urls_too_many"
  | "source_url_not_string"
  | "source_url_too_long"
  | "source_url_unparseable"
  | "source_url_scheme_not_https"
  | "source_url_userinfo_present"
  | "source_url_empty_host"
  | "source_url_host_not_allowed"
  | "source_url_sensitive_value"

/**
 * On success, `sourceResult` is the EXACT object returned by
 * `buildFormationSourceCandidate` — the same identity that
 * `snapshotValidatedFormationSourceResult` attests. It is never a clone.
 */
export type CalendarFormationExtractionResult =
  | {
      readonly ok: true
      readonly sourceResult: Extract<FormationSourceContractResult, { readonly ok: true }>
    }
  | {
      readonly ok: false
      readonly reason: CalendarExtractionRejection
    }
