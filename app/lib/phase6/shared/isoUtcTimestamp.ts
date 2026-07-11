/**
 * P6-FIX-004: the single shared, semantic ISO-8601 UTC timestamp guard for
 * Phase 6 (Issue #115). Before this module the same structural regex was hand
 * copied into four validators and checked digit placement only, so non-existent
 * calendar values (month 13, February 30, hour 25, `2026-99-99T99:99:99.999Z`)
 * passed. This guard validates both the pinned UTC structure and the Gregorian
 * calendar/clock semantics in one place.
 *
 * PURE, DETERMINISTIC, LEAF. No imports, no I/O, no clock read, no timezone or
 * locale dependence, no environment/network/filesystem access, no randomness,
 * and no authorization concept. It never throws for ordinary invalid input,
 * never mutates or echoes its input, and allocates no result object — it is a
 * scalar predicate only.
 *
 * Semantic validity is not authenticity: a timestamp passing this guard is
 * structurally valid and denotes a real Gregorian date/time, but this does not
 * establish that the timestamp is truthful, came from a trusted clock, or that
 * any record may be persisted or any action may execute.
 */

/**
 * Pinned Phase 6 profile: `YYYY-MM-DDTHH:mm:ssZ` with optional 1–3 digit
 * fractional seconds and a mandatory trailing `Z`. No timezone offset, no
 * whitespace, no omitted seconds, no trailing data. Groups capture the numeric
 * components for the semantic range checks below.
 */
const ISO_8601_UTC_COMPONENTS =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/

/** Gregorian leap year: divisible by 4, except by 100, unless by 400. */
function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Days in the given 1-based month, accounting for leap-year February. */
function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    case 2:
      return isGregorianLeapYear(year) ? 29 : 28
    default:
      return 0
  }
}

/**
 * True when `value` is a string in the pinned ISO-8601 UTC format AND its
 * calendar/clock components are real: month 1–12, day within the actual month
 * length (leap-year aware), hour 0–23, minute 0–59, second 0–59. Leap second
 * `:60` is rejected (leap-second support is out of scope). The four-digit year
 * profile is preserved; no narrower year range is imposed.
 */
export function isIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false
  const match = ISO_8601_UTC_COMPONENTS.exec(value)
  if (match === null) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])

  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  if (hour > 23) return false
  if (minute > 59) return false
  if (second > 59) return false
  return true
}
