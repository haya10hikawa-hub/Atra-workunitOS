/**
 * F2C — Deterministic Google Calendar formation extraction tests.
 *
 * Proves the extractor is:
 *   - deterministic and structural: identity is composed from the opaque
 *     calendarId/eventId ONLY, independent of title, summary, organizer, attendees,
 *     start, status, and the opaque Web-UI deep link; iCalUID is never identity and
 *     a recurring instance's recurringEventId becomes the PARENT, never the current
 *     object id;
 *   - temporally sound: timed and all-day forms are distinct, an all-day date is
 *     never promoted to UTC midnight, the Calendar end is an EXCLUSIVE bound, and
 *     the START (never the end) is the explicit deadline;
 *   - trust-bounded: on success it returns the EXACT F1A builder result object,
 *     which alone attests through `snapshotValidatedFormationSourceResult` — a
 *     spread or JSON clone never attests;
 *   - source-local (no `L` extraction): no Goal, Done Condition, Decision Needed,
 *     Source Role, deadline_context, context_only, authority signal, priority,
 *     urgency, ranking, grouping, membership, or projection is ever produced; the
 *     event type has no effect; confirmed is not approval; cancelled is not
 *     completion;
 *   - host-safe: the primary URL is screened by the shared F2A boundary
 *     (`parseProviderUrl`) via parsed-hostname EQUALITY against the configured
 *     calendar host, rejecting userinfo/scheme/host-confusion/IDN and
 *     sensitive-value forms; nothing is ever fetched and no URL is synthesized;
 *   - non-mutating and free of forbidden raw/provider/tenant/token/conference
 *     fields;
 *   - constitutionally scoped: it imports and calls F1A + the shared URL boundary
 *     only — never an F1B or F1C builder, never the existing infrastructure
 *     Calendar priority mapper, and no network module.
 *
 * The token-shaped fixture URLs below are negative-control data, not product data.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { extractCalendarFormationSource } from "../app/lib/application/formation/extract/calendar.ts"
import {
  isValidCalendarDate,
  isValidCalendarDateTime,
  isValidCalendarTime,
  compareValidatedCalendarTimes,
} from "../app/lib/application/formation/extract/calendarTime.ts"
import { parseProviderUrl, normalizeHost } from "../app/lib/application/formation/extract/providerUrl.ts"
import type {
  CalendarExtractionConfig,
  CalendarExtractionRejection,
  NormalizedCalendarFormationInput,
} from "../app/lib/application/formation/extract/calendarTypes.ts"
import { snapshotValidatedFormationSourceResult } from "../app/lib/application/formation/sourceContract.ts"
import { P0_FORBIDDEN_CONTEXT_KEYS } from "../app/lib/application/safety/p0Policy.ts"
import { FORBIDDEN_CANDIDATE_FIELDS } from "../app/lib/application/candidate/safeWorkUnitCandidate.ts"
import { containsSensitiveValue } from "../app/lib/security/untrustedTextScan.ts"
// F1B / F1C builders are imported ONLY to assert they exist and are never
// referenced by the extractor source — the extractor must not call them.
import { buildFormationGoalDoneConditionCandidate } from "../app/lib/application/formation/goalDoneConditionAdapter.ts"
import { buildWorkUnitFormationCandidate } from "../app/lib/application/formation/workUnitFormationAggregate.ts"

// ─── Fixtures ────────────────────────────────────────────────────

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/formation/calendar/", import.meta.url))

type Fixture = {
  readonly config: CalendarExtractionConfig
  readonly input: NormalizedCalendarFormationInput
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/formation/calendar/${name}.json`, import.meta.url), "utf8")) as Fixture
}

function run(name: string) {
  const fixture = loadFixture(name)
  return extractCalendarFormationSource(fixture.input, fixture.config)
}

// Expected outcome per fixture. Unlisted fixtures are expected to succeed.
const REJECTIONS: Readonly<Record<string, CalendarExtractionRejection>> = {
  "30-wrong-calendar-host": "source_url_host_not_allowed",
  "31-host-spoof": "source_url_host_not_allowed",
  "32-userinfo": "source_url_userinfo_present",
  "33-wrong-scheme": "source_url_scheme_not_https",
  "34-idn-host-confusion": "source_url_host_not_allowed",
  "35-sensitive-primary-url": "source_url_sensitive_value",
  "37-empty-calendar-id": "identity_unsafe",
  "38-malformed-event-id": "identity_unsafe",
  "39-oversized-final-identity": "identity_too_long",
  "40-malformed-timed-start": "calendar_time_invalid",
  "41-malformed-timed-end": "calendar_time_invalid",
  "42-malformed-all-day-date": "calendar_time_invalid",
  "43-start-end-kind-mismatch": "calendar_time_kind_mismatch",
  "44-end-equal-start": "calendar_time_end_not_after_start",
  "45-end-before-start": "calendar_time_end_not_after_start",
  "46-recurring-without-original-start": "recurrence_invalid",
  "47-original-start-without-recurring": "recurrence_invalid",
  "48-recurring-id-equals-event-id": "recurrence_invalid",
  "50-fifty-references": "referenced_urls_too_many",
  "51-twenty-one-actor-assertions": "actor_limit_exceeded",
}

function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
}

function successCandidate(name: string) {
  const result = run(name)
  assert.equal(result.ok, true, `${name} should extract`)
  if (!result.ok) throw new Error("unreachable")
  return result.sourceResult.candidate
}

// ─── Deep scan helpers ───────────────────────────────────────────

function collect(value: unknown, keys: string[], strings: string[]): void {
  if (value === null || value === undefined) return
  if (typeof value === "string") {
    strings.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, keys, strings)
    return
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      keys.push(k)
      collect(v, keys, strings)
    }
  }
}

function scan(value: unknown): { keys: string[]; strings: string[] } {
  const keys: string[] = []
  const strings: string[] = []
  collect(value, keys, strings)
  return { keys, strings }
}

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(
  [
    ...P0_FORBIDDEN_CONTEXT_KEYS,
    ...FORBIDDEN_CANDIDATE_FIELDS,
    // raw provider / transport surfaces that F2C must never emit
    "raw",
    "rawEvent",
    "rawPayload",
    "payload",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "token",
    "syncToken",
    "pageToken",
    "authorization",
    "cookie",
    "etag",
    "tenantId",
    "tenant_id",
    // Calendar conference / credential surfaces (plan Section 6)
    "conferenceData",
    "conferenceId",
    "hangoutLink",
    "meetingCode",
    "accessCode",
    "passcode",
    "password",
    "pin",
    "reminders",
    "extendedProperties",
    "attachments",
    "calendarClient",
    "googleClient",
    // downstream semantic surfaces that F2C must never emit
    "goal",
    "doneCondition",
    "done_condition",
    "verifier",
    "acceptanceCriteria",
    "decisionNeeded",
    "sourceRole",
    "role",
    "deadlineContext",
    "deadline_context",
    "contextOnly",
    "context_only",
    "membership",
    "grouping",
    "rank",
    "priority",
    "priorityHint",
    "urgency",
  ].map((k) => k.toLowerCase()),
)

// ─── Canonical config + inputs used for behavioral proofs ────────

const STD_CONFIG: CalendarExtractionConfig = { calendarHosts: ["calendar.google.com"] }

function baseInput(): NormalizedCalendarFormationInput {
  return loadFixture("01-timed-confirmed-deadline").input
}

function extract(input: NormalizedCalendarFormationInput, config: CalendarExtractionConfig = STD_CONFIG) {
  return extractCalendarFormationSource(input, config)
}

function candidateOf(input: NormalizedCalendarFormationInput, config: CalendarExtractionConfig = STD_CONFIG) {
  const result = extract(input, config)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("unreachable")
  return result.sourceResult.candidate
}

const BASE_ID = "google_calendar:team%40group.calendar.google.com/evt6a8b2c9d0e1f"
const BASE_PARENT = "google_calendar:team%40group.calendar.google.com"

// ─── 1. Fixture outcome table ────────────────────────────────────

test("every fixture yields its expected outcome", () => {
  for (const name of fixtureNames()) {
    const result = run(name)
    const expected = REJECTIONS[name]
    if (expected === undefined) {
      assert.equal(result.ok, true, `${name} should succeed`)
    } else {
      assert.equal(result.ok, false, `${name} should be rejected`)
      if (!result.ok) assert.equal(result.reason, expected, `${name} rejection reason`)
    }
  }
})

test("every successful fixture is an attested, candidate-only F1A result", () => {
  for (const name of fixtureNames()) {
    if (REJECTIONS[name] !== undefined) continue
    const result = run(name)
    assert.equal(result.ok, true, name)
    if (!result.ok) continue
    assert.notEqual(snapshotValidatedFormationSourceResult(result.sourceResult), null, `${name} attests`)
    assert.equal(result.sourceResult.candidateOnly, true)
    assert.equal(result.sourceResult.candidate.candidateOnly, true)
    assert.equal(result.sourceResult.candidate.provider, "google_calendar")
  }
})

// ─── Provider name (Section 7) ───────────────────────────────────

test("the formation provider is google_calendar, never the inbox `calendar` name", () => {
  const c = successCandidate("01-timed-confirmed-deadline")
  assert.equal(c.provider, "google_calendar")
  assert.equal(c.sourceRef.source, "google_calendar")
  assert.ok(c.sourceObjectId.startsWith("google_calendar:"))
  assert.ok(!c.sourceObjectId.startsWith("calendar:"))
})

// ─── Structured D-field mapping (Sections 8, 10–14) ──────────────

test("timed confirmed event maps structured D fields with encoded identity", () => {
  const c = successCandidate("01-timed-confirmed-deadline")
  assert.equal(c.sourceObjectId, BASE_ID)
  assert.equal(c.parentObjectId, BASE_PARENT)
  assert.equal(c.sourceRef.externalId, "evt6a8b2c9d0e1f")
  assert.equal(c.sourceRef.container, "team@group.calendar.google.com")
  assert.equal(c.sourceRef.url, "https://calendar.google.com/calendar/event?eid=evt6a8b2c9d0e1f")
  assert.deepEqual(c.statusMarkers, ["scheduled"])
  assert.equal(c.navigationTarget, c.sourceRef.url)
  assert.deepEqual(c.actorAssertions, [
    { name: "Hayato", assertedRelation: "author" },
    { name: "Reviewer A", assertedRelation: "mentioned" },
    { name: "Reviewer B", assertedRelation: "mentioned" },
  ])
  // occurredAt is the updatedAt authority; capturedAt is the capture stamp.
  assert.equal(c.timestamps.occurredAt, "2026-08-01T09:30:00Z")
  assert.equal(c.timestamps.capturedAt, "2026-08-02T00:00:00Z")
  assert.equal(c.timestamps.editedAt, undefined)
})

// ─── explicitDeadline = START, exclusive END (Sections 10–11, M5) ──

test("the event START is the explicit deadline; the exclusive END is never the deadline", () => {
  const timed = successCandidate("01-timed-confirmed-deadline")
  assert.deepEqual(timed.explicitDeadline, { value: "2026-08-20T17:00:00Z", inferred: false })
  assert.ok(timed.explicitDeadline?.value !== "2026-08-20T18:00:00Z", "end must not be the deadline")
})

test("an all-day date is the deadline verbatim — never promoted to UTC midnight", () => {
  const allDay = successCandidate("02-all-day-event")
  assert.deepEqual(allDay.explicitDeadline, { value: "2026-08-20", inferred: false })
  const { strings } = scan(allDay)
  for (const s of strings) {
    assert.ok(s !== "2026-08-20T00:00:00Z", "all-day date must not become UTC midnight")
  }
})

// ─── Status mapping (Section 12, M6/M8) ──────────────────────────

test("status maps only from the structured status; confirmed is not approval, cancelled not completion", () => {
  assert.deepEqual(successCandidate("01-timed-confirmed-deadline").statusMarkers, ["scheduled"])
  assert.deepEqual(successCandidate("04-tentative-event").statusMarkers, ["unknown"])
  const cancelled = successCandidate("05-cancelled-event")
  assert.deepEqual(cancelled.statusMarkers, ["cancelled"])
  // A confirmed event emits no authority signal; a cancelled event still produces a
  // candidate and never a Done Condition completion.
  assert.deepEqual(successCandidate("01-timed-confirmed-deadline").authoritySignals, [])
  assert.deepEqual(cancelled.authoritySignals, [])
})

// ─── Recurrence & parent identity (Section 9, M3/M4) ─────────────

test("a recurring instance's parent is the SERIES, and the instance keeps its own id", () => {
  const c = successCandidate("06-recurring-instance")
  assert.equal(c.sourceObjectId, "google_calendar:team%40group.calendar.google.com/evtinst20260820")
  assert.equal(c.parentObjectId, "google_calendar:team%40group.calendar.google.com/evtseriesabc123")
  assert.notEqual(c.sourceObjectId, c.parentObjectId)
  // recurringEventId becomes the parent, NEVER the current object id.
  assert.ok(!c.sourceObjectId.includes("evtseriesabc123"))
})

test("a moved recurring instance (originalStart != start) is valid and retains its parent relation", () => {
  const c = successCandidate("07-moved-recurring-instance")
  assert.equal(c.parentObjectId, "google_calendar:team%40group.calendar.google.com/evtseriesabc123")
  // The instance deadline is the CURRENT start, not the original slot.
  assert.equal(c.explicitDeadline?.value, "2026-08-20T17:00:00Z")
})

test("two instances sharing one iCalUID but with different eventId stay DISTINCT; iCalUID is never identity", () => {
  const a = successCandidate("08-icaluid-instance-a")
  const b = successCandidate("09-icaluid-instance-b")
  assert.notEqual(a.sourceObjectId, b.sourceObjectId)
  assert.equal(a.parentObjectId, b.parentObjectId) // same series
  // The shared iCalUID appears in NEITHER identity.
  for (const c of [a, b]) {
    assert.ok(!c.sourceObjectId.includes("series-uid-123"))
    assert.ok(!c.parentObjectId?.includes("series-uid-123"))
    const { strings } = scan(c)
    assert.ok(!strings.includes("series-uid-123@google.com"), "iCalUID must not leak into output")
  }
})

// ─── Identity independence (M1) ──────────────────────────────────

test("identity depends only on calendarId/eventId — not title, summary, actors, start, status, or URL", () => {
  const base = baseInput()
  const variants: NormalizedCalendarFormationInput[] = [
    { ...base, title: "an entirely different title" },
    { ...base, summary: "an unrelated summary sentence" },
    { ...base, organizer: "someone-else" },
    { ...base, attendees: ["different", "people"] },
    { ...base, status: "tentative" },
    { ...base, eventType: "meeting_preparation_needed" },
    {
      ...base,
      start: { kind: "date_time", value: "2026-09-01T10:00:00Z" },
      end: { kind: "date_time", value: "2026-09-01T11:00:00Z" },
    },
    { ...base, sourceUrl: "https://calendar.google.com/calendar/event?eid=totally-different" },
  ]
  for (const v of variants) {
    const c = candidateOf(v)
    assert.equal(c.sourceObjectId, BASE_ID)
    assert.equal(c.parentObjectId, BASE_PARENT)
    assert.ok(!c.sourceObjectId.includes("different"))
    assert.ok(!c.sourceObjectId.includes("someone-else"))
  }
})

// ─── Identity from BOTH calendarId and eventId (M2) ──────────────

test("the same eventId in two calendars yields distinct identities (calendarId is load-bearing)", () => {
  const a = candidateOf(baseInput())
  const b = candidateOf({
    ...baseInput(),
    calendarId: "other@group.calendar.google.com",
  })
  assert.notEqual(a.sourceObjectId, b.sourceObjectId)
  assert.equal(b.sourceObjectId, "google_calendar:other%40group.calendar.google.com/evt6a8b2c9d0e1f")
})

test("two eventIds in one calendar yield distinct identities (eventId is load-bearing)", () => {
  const a = candidateOf(baseInput())
  const b = candidateOf({
    ...baseInput(),
    eventId: "evtDIFFERENT",
    sourceUrl: "https://calendar.google.com/calendar/event?eid=evtDIFFERENT",
  })
  assert.notEqual(a.sourceObjectId, b.sourceObjectId)
})

test("delimiter-bearing ids are collision-safe: distinct splits never collide", () => {
  // ("a/b:c", "d") vs ("a", "b:c/d") would collide under naive concatenation.
  const left = candidateOf({
    ...baseInput(),
    calendarId: "a/b:c",
    eventId: "d",
    sourceUrl: "https://calendar.google.com/calendar/event?eid=d",
  })
  const right = candidateOf({
    ...baseInput(),
    calendarId: "a",
    eventId: "b:c/d",
    sourceUrl: "https://calendar.google.com/calendar/event?eid=bcd",
  })
  assert.notEqual(left.sourceObjectId, right.sourceObjectId)
  assert.equal(left.sourceObjectId, "google_calendar:a%2Fb%3Ac/d")
  assert.equal(right.sourceObjectId, "google_calendar:a/b%3Ac%2Fd")
})

// ─── Timestamp authority (Section 11) ────────────────────────────

test("occurredAt is updatedAt — never derived from eventId, iCalUID, or the wall clock", () => {
  const c = successCandidate("01-timed-confirmed-deadline")
  assert.equal(c.timestamps.occurredAt, "2026-08-01T09:30:00Z")
  // The identity strings never leak into the timestamp.
  assert.ok(!c.timestamps.occurredAt.includes("evt"))
  const nowYear = String(new Date().getUTCFullYear())
  assert.ok(!c.timestamps.occurredAt.startsWith(nowYear) || "2026" === nowYear, "occurredAt is fixture data, not now()")
})

// ─── Sequence / version (Section 14) ─────────────────────────────

test("sequence maps to a non-authoritative versionInfo label; absent sequence emits none", () => {
  assert.deepEqual(successCandidate("14-sequence-zero").versionInfo, { value: "sequence:0", inferred: false })
  assert.deepEqual(successCandidate("15-positive-sequence").versionInfo, { value: "sequence:7", inferred: false })
  assert.equal(successCandidate("01-timed-confirmed-deadline").versionInfo, undefined)
})

test("a negative or non-integer sequence is rejected, never coerced", () => {
  for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    const r = extract({ ...baseInput(), sequence: bad })
    assert.equal(r.ok, false, `sequence ${String(bad)} rejected`)
    if (!r.ok) assert.equal(r.reason, "sequence_invalid")
  }
})

// ─── Actor policy + bound before iteration (Section 13, M13) ─────

test("organizer→author and attendees→mentioned; exact duplicate names collapse; none imply authority", () => {
  const c = successCandidate("13-duplicate-attendee-names")
  assert.deepEqual(c.actorAssertions, [
    { name: "Hayato", assertedRelation: "author" },
    { name: "Reviewer A", assertedRelation: "mentioned" },
  ])
  assert.deepEqual(c.authoritySignals, [])
  // Missing organizer / no attendees each yield exactly the present assertions.
  assert.deepEqual(
    successCandidate("10-missing-organizer").actorAssertions,
    [
      { name: "Reviewer A", assertedRelation: "mentioned" },
      { name: "Reviewer B", assertedRelation: "mentioned" },
    ],
  )
  assert.deepEqual(successCandidate("11-no-attendees").actorAssertions, [{ name: "Hayato", assertedRelation: "author" }])
})

test("the actor bound is applied before iteration: 20 accepted, 21 rejected (never truncated)", () => {
  assert.equal(run("21-twenty-actor-assertions").ok, true)
  const c = successCandidate("21-twenty-actor-assertions")
  assert.equal(c.actorAssertions.length, 20)

  const over = run("51-twenty-one-actor-assertions")
  assert.equal(over.ok, false)
  if (!over.ok) assert.equal(over.reason, "actor_limit_exceeded")

  // Much larger attendee arrays are rejected before iteration, not truncated to 20.
  for (const n of [21, 100, 5000]) {
    const many = extract({ ...baseInput(), organizer: "Hayato", attendees: Array.from({ length: n }, (_, i) => `A ${i}`) })
    assert.equal(many.ok, false)
    if (!many.ok) assert.equal(many.reason, "actor_limit_exceeded")
  }
})

// ─── eventType has no effect (M6, M16) ───────────────────────────

test("changing only eventType produces an IDENTICAL candidate (no priority, task, or Goal)", () => {
  const deadline = candidateOf(loadFixture("01-timed-confirmed-deadline").input)
  const prep = candidateOf(loadFixture("24-eventtype-variant").input)
  assert.deepEqual(prep, deadline)
  // No priority / urgency / ranking / goal key appears anywhere.
  for (const name of ["01-timed-confirmed-deadline", "03-meeting-preparation"]) {
    const { keys } = scan(successCandidate(name))
    for (const key of keys) assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()), `${name} must not emit ${key}`)
  }
})

// ─── sourceUrl invariance (Section 15, M14) ──────────────────────

test("changing only sourceUrl keeps identity but changes the navigation target to the EXACT URL", () => {
  const a = candidateOf(loadFixture("01-timed-confirmed-deadline").input)
  const b = candidateOf(loadFixture("23-sourceurl-variant").input)
  assert.equal(a.sourceObjectId, b.sourceObjectId)
  assert.notEqual(a.navigationTarget, b.navigationTarget)
  // navigationTarget is the exact input URL, never synthesized from ids.
  assert.equal(b.navigationTarget, "https://calendar.google.com/calendar/event?eid=alternate-deep-link-value")
  assert.ok(!b.navigationTarget.includes("evt6a8b2c9d0e1f"), "URL is never derived from the event id")
})

// ─── Referenced links (Section 16) ───────────────────────────────

test("GitHub PR/Issue references become canonical referenced objects; other links stay opaque", () => {
  assert.deepEqual(successCandidate("16-github-pr-reference").referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#238" },
  ])
  assert.deepEqual(successCandidate("17-github-issue-reference").referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#239" },
  ])
  // A safe external link AND a Slack permalink both stay opaque (no cross-provider
  // recognition in this slice).
  const opaque = successCandidate("18-opaque-external-url")
  assert.deepEqual(opaque.referencedObjects, [])
  assert.ok(opaque.sourceLinks.some((l) => l.url.includes("myworkspace.slack.com") && l.recognized === undefined))
  assert.ok(opaque.sourceLinks.some((l) => l.url === "https://example.com/docs/spec" && l.recognized === undefined))
})

test("a sensitive referenced URL is dropped completely; a safe GitHub reference in the same array survives", () => {
  const c = successCandidate("25-sensitive-referenced-url")
  assert.deepEqual(c.referencedObjects, [{ provider: "github", sourceObjectId: "github:example-org/example-repo#238" }])
  const { strings } = scan(c)
  for (const s of strings) {
    assert.ok(!s.includes("ghp_"), "sensitive token must not survive")
    assert.ok(!s.includes("access_token"), "sensitive param must not survive")
    assert.ok(!containsSensitiveValue(s), "no token-shaped value survives")
  }
})

test("referenced-URL bound: 49 accepted, 50 rejected before iteration (M12)", () => {
  assert.equal(run("26-forty-nine-references").ok, true)
  const over = run("50-fifty-references")
  assert.equal(over.ok, false)
  if (!over.ok) assert.equal(over.reason, "referenced_urls_too_many")
  for (const n of [50, 1000, 10000, 100000]) {
    const many = extract({ ...baseInput(), referencedUrls: Array.from({ length: n }, (_, i) => `https://example.com/d-${i}`) })
    assert.equal(many.ok, false)
    if (!many.ok) assert.equal(many.reason, "referenced_urls_too_many")
  }
})

// ─── URL & host policy (Section 15, M7) ──────────────────────────

test("the primary host is matched by parsed-hostname equality — spoof/IDN/userinfo/scheme all fail", () => {
  assert.equal((run("30-wrong-calendar-host") as { reason?: string }).reason, "source_url_host_not_allowed")
  assert.equal((run("31-host-spoof") as { reason?: string }).reason, "source_url_host_not_allowed")
  assert.equal((run("34-idn-host-confusion") as { reason?: string }).reason, "source_url_host_not_allowed")
  assert.equal((run("32-userinfo") as { reason?: string }).reason, "source_url_userinfo_present")
  assert.equal((run("33-wrong-scheme") as { reason?: string }).reason, "source_url_scheme_not_https")
  // Direct boundary checks.
  assert.equal(parseProviderUrl("https://calendar.google.com.evil.example/x", ["calendar.google.com"]).ok, false)
  assert.equal(parseProviderUrl("https://calendar.google.com/x", ["calendar.google.com"]).ok, true)
  assert.equal(normalizeHost("Calendar.Google.COM."), "calendar.google.com")
})

test("a sensitive primary URL rejects the whole extraction with no echo (M8/M9)", () => {
  const result = run("35-sensitive-primary-url")
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.reason, "source_url_sensitive_value")
  assert.deepEqual(Object.keys(result), ["ok", "reason"])
  assert.ok(!JSON.stringify(result).includes("ghp_"))
})

// ─── Alternate host binding (Section 15) ─────────────────────────

test("an alternate calendar host is trusted only through the explicit allowlist", () => {
  const c = successCandidate("19-alternate-calendar-host")
  assert.equal(c.navigationTarget, "https://www.google.com/calendar/event?eid=evt6a8b2c9d0e1f")
  // The SAME input under the default single-host config fails closed.
  const denied = extractCalendarFormationSource(loadFixture("19-alternate-calendar-host").input, STD_CONFIG)
  assert.equal(denied.ok, false)
  if (!denied.ok) assert.equal(denied.reason, "source_url_host_not_allowed")
})

test("calendar-host configuration must be a non-empty allowlist of bare hosts; malformed fails closed", () => {
  const input = baseInput()
  const bad: CalendarExtractionConfig[] = [
    { calendarHosts: [] }, // empty
    { calendarHosts: ["https://calendar.google.com"] }, // scheme
    { calendarHosts: ["calendar.google.com/path"] }, // path
    { calendarHosts: ["calendar.google.com:8443"] }, // non-default port
    { calendarHosts: ["user@calendar.google.com"] }, // userinfo
    { calendarHosts: ["not a host !!"] }, // malformed
    { calendarHosts: [123 as unknown as string] }, // non-string
  ]
  for (const config of bad) {
    const r = extractCalendarFormationSource(input, config)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.reason, "config_invalid")
  }
  // Canonical case/trailing-dot variants deduplicate and still trust the host.
  const dedup = extractCalendarFormationSource(input, { calendarHosts: ["Calendar.Google.COM.", "calendar.google.com"] })
  assert.equal(dedup.ok, true)
})

// ─── Event type validation ───────────────────────────────────────

test("both event types are accepted; an unsupported event type is rejected", () => {
  for (const eventType of ["deadline_approaching", "meeting_preparation_needed"] as const) {
    assert.equal(extract({ ...baseInput(), eventType }).ok, true, `${eventType} accepted`)
  }
  const bad = extract({ ...baseInput(), eventType: "birthday" as unknown as NormalizedCalendarFormationInput["eventType"] })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.reason, "event_type_unsupported")
})

// ─── Determinism & non-mutation ──────────────────────────────────

test("identical input+config gives deeply equal extraction", () => {
  const a = extract(baseInput())
  const b = extract(baseInput())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (a.ok && b.ok) assert.deepEqual(a.sourceResult.candidate, b.sourceResult.candidate)
})

test("input and configuration are not mutated", () => {
  const fixture = loadFixture("22-full-field-success")
  const input = fixture.input
  const config = fixture.config
  const beforeInput = structuredClone(input)
  const beforeConfig = structuredClone(config)
  extractCalendarFormationSource(input, config)
  assert.deepEqual(input, beforeInput)
  assert.deepEqual(config, beforeConfig)
})

// ─── Attestation / exact-object handoff (M10) ────────────────────

test("only the exact F1A builder object attests; clones do not", () => {
  const result = run("01-timed-confirmed-deadline")
  assert.equal(result.ok, true)
  if (!result.ok) return
  const exact = result.sourceResult
  assert.notEqual(snapshotValidatedFormationSourceResult(exact), null)
  assert.equal(snapshotValidatedFormationSourceResult({ ...exact }), null) // spread clone
  assert.equal(snapshotValidatedFormationSourceResult(JSON.parse(JSON.stringify(exact))), null) // JSON clone
  assert.equal(snapshotValidatedFormationSourceResult(structuredClone(exact)), null) // structuredClone
  assert.equal(
    snapshotValidatedFormationSourceResult({ ok: true, candidateOnly: true, candidate: exact.candidate, flags: [] }),
    null,
  ) // hand-built look-alike
})

// ─── No semantic / authority / grouping extraction (Sections 17–18) ──

test("no L field, Source Role, authority, decision/unresolved marker, or grouping is produced", () => {
  for (const name of fixtureNames()) {
    if (REJECTIONS[name] !== undefined) continue
    const c = successCandidate(name)
    assert.deepEqual(c.unresolvedMarkers, [], `${name} unresolvedMarkers`)
    assert.deepEqual(c.decisionMarkers, [], `${name} decisionMarkers`)
    assert.deepEqual(c.authoritySignals, [], `${name} authoritySignals`)
    assert.deepEqual(c.supersedes, [], `${name} supersedes`)
    assert.deepEqual(c.supersededBy, [], `${name} supersededBy`)
    assert.equal(c.threadId, undefined, `${name} threadId`)
    const { keys } = scan(c)
    for (const key of keys) {
      assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()), `${name} must not emit key ${key}`)
    }
  }
})

// ─── Forbidden fields absent from the whole result (M11) ─────────

test("no forbidden raw/provider/tenant/token/conference field appears in any output", () => {
  for (const name of fixtureNames()) {
    const result = run(name)
    const { keys, strings } = scan(result)
    for (const key of keys) {
      assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()), `${name} leaks forbidden key ${key}`)
    }
    for (const s of strings) {
      assert.ok(!containsSensitiveValue(s), `${name} leaks a token-shaped value`)
    }
  }
})

// ─── Constitutional source scan (M15, F1B/F1C, network) ──────────

test("extractor source imports F1A + shared URL boundary only — no F1B/F1C, infra mapper, or network", () => {
  const readSource = (rel: string) =>
    readFileSync(new URL(`../app/lib/application/formation/extract/${rel}`, import.meta.url), "utf8")
  const calendar = readSource("calendar.ts")
  const calendarTime = readSource("calendarTime.ts")
  const calendarTypes = readSource("calendarTypes.ts")
  const all = calendar + calendarTime + calendarTypes

  // Calls F1A only.
  assert.ok(calendar.includes("buildFormationSourceCandidate"), "must call the F1A builder")
  // Never the F1B / F1C builders.
  assert.ok(!all.includes("goalDoneConditionAdapter"), "must not import F1B")
  assert.ok(!all.includes("workUnitFormationAggregate"), "must not import F1C")
  assert.ok(!all.includes("buildFormationGoalDoneConditionCandidate"))
  assert.ok(!all.includes("buildWorkUnitFormationCandidate"))
  // Never the infrastructure / inbox Calendar surface or its priority mapper.
  assert.ok(!all.includes("infrastructure/external/calendar"), "must not import infra calendar")
  assert.ok(!all.includes("workunitInbox/sources/calendar"), "must not import inbox calendar")
  assert.ok(!all.includes("toNormalizedToolSignal"), "must not route through the infra mapper")
  assert.ok(!all.includes("NormalizedToolSignal"), "must not import the infra normalized signal")
  assert.ok(!all.includes("defaultPriority"), "must not import the existing priority mapper")
  assert.ok(!all.includes("priorityHint"), "must not emit a priority hint")
  // Never a network / provider-client surface.
  for (const forbidden of ["node:http", "node:https", "undici", "googleapis", "google-auth", "OAuth2", "fetch(", "octokit"]) {
    assert.ok(!all.includes(forbidden), `must not reference ${forbidden}`)
  }
  // The imported F1B/F1C builders exist (proving the negative check is meaningful).
  assert.equal(typeof buildFormationGoalDoneConditionCandidate, "function")
  assert.equal(typeof buildWorkUnitFormationCandidate, "function")
})

// ─── Calendar time unit tests (Section 10) ───────────────────────

test("calendar date validation accepts real dates and rejects impossible / locale forms", () => {
  for (const ok of ["2026-08-20", "2024-02-29", "2000-12-31"]) assert.equal(isValidCalendarDate(ok), true, ok)
  for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-8-20", "08/20/2026", "2026-08-20T00:00:00Z"]) {
    assert.equal(isValidCalendarDate(bad), false, bad)
  }
})

test("calendar date-time validation is strict RFC 3339 under the civil-offset policy", () => {
  for (const ok of ["2026-08-20T17:00:00Z", "2026-08-20T17:00:00.123Z", "2026-08-20T17:00:00+09:00", "2026-08-20T17:00:00-05:00"]) {
    assert.equal(isValidCalendarDateTime(ok), true, ok)
  }
  for (const bad of [
    "2026-08-20T17:00:00", // no offset
    "2026-08-20 17:00:00Z", // space, not T
    "2026-08-20T25:00:00Z", // hour 25
    "2026-08-20T17:60:00Z", // minute 60
    "2026-08-20T17:00:00+15:00", // offset hour 15 (outside civil policy)
    "2026-02-30T00:00:00Z", // impossible date
  ]) {
    assert.equal(isValidCalendarDateTime(bad), false, bad)
  }
})

test("kind is authoritative and comparison respects day vs instant", () => {
  assert.equal(isValidCalendarTime({ kind: "date", value: "2026-08-20T17:00:00Z" }), false) // datetime under date kind
  assert.equal(isValidCalendarTime({ kind: "date_time", value: "2026-08-20" }), false) // date under datetime kind
  // Instant comparison honors offsets: 17:00Z == 18:00+01:00.
  assert.equal(
    compareValidatedCalendarTimes(
      { kind: "date_time", value: "2026-08-20T17:00:00Z" },
      { kind: "date_time", value: "2026-08-20T18:00:00+01:00" },
    ),
    0,
  )
  assert.ok(
    compareValidatedCalendarTimes({ kind: "date", value: "2026-08-20" }, { kind: "date", value: "2026-08-21" }) < 0,
  )
})
