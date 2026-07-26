/**
 * F2C — Calendar time validation and comparison.
 *
 * Deterministic, pure, LOCALE-FREE and NETWORK-FREE validation of the two
 * normalized Calendar time forms, plus a non-floating comparison of two times of
 * the SAME kind. This module never reads the wall clock, never constructs a `Date`,
 * and never uses a locale-sensitive parser — so validation and ordering are
 * deterministic and timezone-independent (plan Section 10).
 *
 * Accepted forms (an intentional subset that is byte-for-byte accepted by the F1A
 * `explicitDeadline` validator, so a validated `start` always survives the F1A
 * handoff):
 *   date       : YYYY-MM-DD (a REAL Gregorian date)
 *   date_time  : YYYY-MM-DDTHH:mm:ss(.<1..9 fractional digits>)?(Z | ±HH:mm)
 *                time  — hour 00..23, minute 00..59, second 00..59 (no leap second)
 *                offset — civil UTC-offset policy: hours 00..14, minutes 00..59,
 *                         and when the hour is 14 the minutes must be 00. This
 *                         mirrors the F1A source-contract offset policy exactly.
 *
 * All-day dates are NEVER reinterpreted as UTC midnight: a `date` compares as a
 * calendar day, a `date_time` compares as an instant (plan Section 11).
 */

import type { NormalizedCalendarTime } from "./calendarTypes.ts"

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/

function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function gregorianDaysInMonth(year: number, month: number): number {
  const daysByMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month === 2 && isGregorianLeapYear(year)) return 29
  return daysByMonth[month - 1]
}

function isValidGregorianDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= gregorianDaysInMonth(year, month)
}

// Civil UTC-offset policy, identical to the F1A source contract: offset hours
// 00..14, offset minutes 00..59, and when the hour is 14 the minutes must be 00.
function isValidUtcOffset(offsetHours: number, offsetMinutes: number): boolean {
  if (offsetHours < 0 || offsetHours > 14) return false
  if (offsetMinutes < 0 || offsetMinutes > 59) return false
  return offsetHours !== 14 || offsetMinutes === 0
}

/** True when `value` is exactly `YYYY-MM-DD` and a real Gregorian calendar date. */
export function isValidCalendarDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value)
  if (match === null) return false
  return isValidGregorianDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

/** True when `value` is exactly a strict RFC 3339 date-time under the civil-offset policy. */
export function isValidCalendarDateTime(value: string): boolean {
  const match = ISO_DATE_TIME_PATTERN.exec(value)
  if (match === null) return false
  if (!isValidGregorianDate(Number(match[1]), Number(match[2]), Number(match[3]))) return false
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  if (hour > 23 || minute > 59 || second > 59) return false
  const offset = match[8]
  if (offset === "Z") return true
  return isValidUtcOffset(Number(offset.slice(1, 3)), Number(offset.slice(4, 6)))
}

/**
 * Validate a normalized Calendar time against its declared kind. A `date` must be
 * a real `YYYY-MM-DD`; a `date_time` must be a strict RFC 3339 instant. The kind
 * discriminator is authoritative — a `date` value that looks like a date-time (or
 * vice versa) is rejected.
 */
export function isValidCalendarTime(time: NormalizedCalendarTime): boolean {
  if (time === null || typeof time !== "object") return false
  if (time.kind === "date") return typeof time.value === "string" && isValidCalendarDate(time.value)
  if (time.kind === "date_time") return typeof time.value === "string" && isValidCalendarDateTime(time.value)
  return false
}

// Days since the Unix epoch (1970-01-01) for a real Gregorian date, via Howard
// Hinnant's `days_from_civil`. Pure integer arithmetic — no `Date`, no locale, no
// wall clock. Caller guarantees a validated real date.
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

// A validated date-time decomposed into its exact UTC instant: whole seconds since
// the Unix epoch (a safe integer for every representable year) plus a zero-padded
// nine-digit fractional-second string. Keeping the fraction as a fixed-width string
// makes the comparison exact and floating-point-free without needing BigInt (whose
// literals require an ES2020+ target). The offset is applied as local = UTC + offset
// ⇒ UTC = local − offset. Caller guarantees `isValidCalendarDateTime(value)`.
type CalendarInstant = { readonly seconds: number; readonly fractionNanos: string }

function dateTimeToInstant(value: string): CalendarInstant {
  const match = ISO_DATE_TIME_PATTERN.exec(value)
  if (match === null) throw new Error("dateTimeToInstant requires a validated date-time")
  const days = daysFromCivil(Number(match[1]), Number(match[2]), Number(match[3]))
  let seconds = days * 86_400 + Number(match[4]) * 3_600 + Number(match[5]) * 60 + Number(match[6])
  const offset = match[8]
  if (offset !== "Z") {
    const sign = offset[0] === "-" ? -1 : 1
    seconds -= sign * (Number(offset.slice(1, 3)) * 3_600 + Number(offset.slice(4, 6)) * 60)
  }
  const fractionDigits = match[7] ?? ""
  return { seconds, fractionNanos: (fractionDigits + "000000000").slice(0, 9) }
}

/**
 * Compare two validated Calendar times of the SAME kind. Returns a negative
 * number when `a < b`, zero when they represent the same day / instant, and a
 * positive number when `a > b`. Caller guarantees both times are valid and share a
 * kind; a kind mismatch is a programming error and throws.
 *
 * A `date` comparison is a calendar-day comparison; a `date_time` comparison is an
 * instant comparison. An all-day date is never promoted to an instant.
 */
export function compareValidatedCalendarTimes(a: NormalizedCalendarTime, b: NormalizedCalendarTime): number {
  if (a.kind !== b.kind) throw new Error("compareValidatedCalendarTimes requires matching kinds")
  if (a.kind === "date" && b.kind === "date") {
    const da = ISO_DATE_PATTERN.exec(a.value)
    const db = ISO_DATE_PATTERN.exec(b.value)
    if (da === null || db === null) throw new Error("compareValidatedCalendarTimes requires validated dates")
    const na = daysFromCivil(Number(da[1]), Number(da[2]), Number(da[3]))
    const nb = daysFromCivil(Number(db[1]), Number(db[2]), Number(db[3]))
    return na < nb ? -1 : na > nb ? 1 : 0
  }
  const ia = dateTimeToInstant(a.value)
  const ib = dateTimeToInstant(b.value)
  if (ia.seconds !== ib.seconds) return ia.seconds < ib.seconds ? -1 : 1
  // Both fractional parts are zero-padded to nine digits, so lexical order equals
  // numeric order.
  if (ia.fractionNanos === ib.fractionNanos) return 0
  return ia.fractionNanos < ib.fractionNanos ? -1 : 1
}
