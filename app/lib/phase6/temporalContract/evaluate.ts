/**
 * HTPE H1A: deterministic, shadow-only, pairwise two-axis temporal relation
 * evaluator (docs/HTPE_H1A_TEMPORAL_CONTRACT.md).
 *
 * Reads the hostile public input exactly once per property, captures detached
 * local primitives, fails closed and value-free, and computes closed-vocabulary
 * relations across valid time, observation time, recording time and arrival
 * order. Observation/recording order is NEVER promoted into valid-time order,
 * and no input can establish a transition, supersession, conflict or
 * latest/authority/timestamp-wins verdict: `transitionEvidence` and
 * `supersessionOrder` are constant `not_established`.
 *
 * No import other than ./types. No clock read, no randomness, no I/O, no LLM
 * path, no provider, no persistence, no production consumer.
 */

import type {
  ArrivalClassification, SystemTimeRelation,
  TemporalReasonCode, TemporalRelationFailure, TemporalRelationFailureCode,
  TemporalRelationInput, TemporalRelationResult, TemporalRelationSnapshot,
  TemporalRelationSnapshotResult, TemporalRelationSuccess, ValidTimeRelation,
} from "./types.ts"

const TOP_LEVEL_KEYS = ["left", "right"] as const
const OBSERVATION_KEYS = ["validFrom", "validTo", "observedAt", "recordedAt"] as const

// Canonical UTC shape. Four-digit year keeps lexicographic string order equal
// to chronological order, so no numeric epoch value is ever materialized.
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

// One constant sentence per reason code; nothing is ever interpolated, so no
// caller value can travel into a narrative.
const NARRATIVE: Record<TemporalReasonCode, string> = {
  valid_time_left_before_right: "The left valid interval ends before the right valid interval begins.",
  valid_time_right_before_left: "The right valid interval ends before the left valid interval begins.",
  valid_time_same_interval: "Both observations represent the same fully bounded valid interval.",
  valid_time_overlaps: "The two fully bounded valid intervals intersect without being identical.",
  valid_time_unresolved: "The valid-time relation is unresolved because at least one boundary is unknown.",
  observed_time_left_before_right: "The left observation was observed before the right observation.",
  observed_time_right_before_left: "The right observation was observed before the left observation.",
  observed_time_same_instant: "Both observations were observed at the same instant.",
  recorded_time_left_before_right: "The left observation was recorded before the right observation.",
  recorded_time_right_before_left: "The right observation was recorded before the left observation.",
  recorded_time_same_instant: "Both observations were recorded at the same instant.",
  arrival_in_order: "Observation order matches the proven valid-time order.",
  left_late_arriving: "The left observation arrived after the right observation despite representing an earlier valid interval.",
  right_late_arriving: "The right observation arrived after the left observation despite representing an earlier valid interval.",
  arrival_unresolved: "Arrival order is unresolved because no strict valid-time order and distinct observation order are both proven.",
  transition_not_established: "No explicit transition evidence is established by this temporal comparison.",
  supersession_not_established: "No supersession order is established by this temporal comparison.",
}

function fail(failureCode: TemporalRelationFailureCode): TemporalRelationFailure {
  return Object.freeze({ ok: false as const, failureCode })
}

function isCanonicalInstant(value: string): boolean {
  if (!CANONICAL_INSTANT.test(value)) return false
  const epoch = Date.parse(value)
  if (Number.isNaN(epoch)) return false
  // Rejects leap-normalized dates (e.g. Feb 30) that reparse to another day.
  return new Date(epoch).toISOString() === value
}

type Captured = { readonly values: readonly unknown[] } | TemporalRelationFailure

// Reads each allowed own key of one hostile object exactly once, in fixed key
// order, after rejecting unknown own keys by NAME ONLY (their values are never
// read). Every trap or accessor throw fails closed and value-free.
function captureOwn(value: unknown, allowedKeys: readonly string[]): Captured {
  // `typeof` and `=== null` are total: they never invoke a Proxy internal
  // method, so a revoked Proxy reaches the readability checks below.
  if (value === null || typeof value !== "object") return fail("invalid_input")
  // Array.isArray performs IsArray, which THROWS on a revoked Proxy. An object
  // whose readability is gone is unreadable, not mistyped, so it joins the
  // other trap failures rather than invalid_input.
  let isArray: boolean
  try {
    isArray = Array.isArray(value)
  } catch {
    return fail("input_unreadable")
  }
  if (isArray) return fail("invalid_input")
  let ownKeys: (string | symbol)[]
  try {
    ownKeys = Reflect.ownKeys(value)
  } catch {
    return fail("input_unreadable")
  }
  for (const key of ownKeys) {
    if (typeof key !== "string" || !allowedKeys.includes(key)) return fail("unknown_field")
  }
  const values: unknown[] = []
  for (const key of allowedKeys) {
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch {
      return fail("input_unreadable")
    }
    if (descriptor === undefined) return fail("missing_field")
    try {
      values.push((value as Record<string, unknown>)[key])
    } catch {
      return fail("input_unreadable")
    }
  }
  return { values }
}

type Observation = {
  readonly validFrom: string | null
  readonly validTo: string | null
  readonly observedAt: string
  readonly recordedAt: string
}

function validateObservation(raw: unknown): Observation | TemporalRelationFailure {
  const captured = captureOwn(raw, OBSERVATION_KEYS)
  if ("ok" in captured) return captured
  const [validFrom, validTo, observedAt, recordedAt] = captured.values
  for (const boundary of [validFrom, validTo]) {
    if (boundary === null) continue
    if (typeof boundary !== "string" || !isCanonicalInstant(boundary)) return fail("invalid_instant")
  }
  for (const instant of [observedAt, recordedAt]) {
    if (typeof instant !== "string" || !isCanonicalInstant(instant)) return fail("invalid_instant")
  }
  const from = validFrom as string | null
  const to = validTo as string | null
  if (from !== null && to !== null && from > to) return fail("invalid_valid_interval")
  const observed = observedAt as string
  const recorded = recordedAt as string
  if (recorded < observed) return fail("recorded_before_observed")
  return { validFrom: from, validTo: to, observedAt: observed, recordedAt: recorded }
}

// Strict valid-time relations exist only when all four boundaries are known.
// A null boundary means unknown — never "now", never infinity — so nothing
// else (observedAt, recordedAt, argument position, arrival) may resolve it.
function relateValidTime(left: Observation, right: Observation): ValidTimeRelation {
  if (left.validFrom === null || left.validTo === null || right.validFrom === null || right.validTo === null) {
    return "unresolved"
  }
  if (left.validFrom === right.validFrom && left.validTo === right.validTo) return "same_interval"
  if (left.validTo < right.validFrom) return "left_before_right"
  if (right.validTo < left.validFrom) return "right_before_left"
  // Touching boundaries intersect at the shared instant, so they overlap.
  return "overlaps"
}

function relateSystemTime(leftInstant: string, rightInstant: string): SystemTimeRelation {
  if (leftInstant < rightInstant) return "left_before_right"
  if (rightInstant < leftInstant) return "right_before_left"
  return "same_instant"
}

// Arrival compares the PROVEN valid-time order with observation order only.
// recordedAt never participates: recording delay is not late-arriving
// evidence. Every unproven combination stays unresolved.
function classifyArrival(validTime: ValidTimeRelation, observedTime: SystemTimeRelation): ArrivalClassification {
  if (validTime === "left_before_right" && observedTime === "left_before_right") return "in_order"
  if (validTime === "right_before_left" && observedTime === "right_before_left") return "in_order"
  if (validTime === "left_before_right" && observedTime === "right_before_left") return "left_late_arriving"
  if (validTime === "right_before_left" && observedTime === "left_before_right") return "right_late_arriving"
  return "unresolved"
}

const VALID_TIME_CODE: Record<ValidTimeRelation, TemporalReasonCode> = {
  left_before_right: "valid_time_left_before_right",
  right_before_left: "valid_time_right_before_left",
  same_interval: "valid_time_same_interval",
  overlaps: "valid_time_overlaps",
  unresolved: "valid_time_unresolved",
}
const OBSERVED_TIME_CODE: Record<SystemTimeRelation, TemporalReasonCode> = {
  left_before_right: "observed_time_left_before_right",
  right_before_left: "observed_time_right_before_left",
  same_instant: "observed_time_same_instant",
}
const RECORDED_TIME_CODE: Record<SystemTimeRelation, TemporalReasonCode> = {
  left_before_right: "recorded_time_left_before_right",
  right_before_left: "recorded_time_right_before_left",
  same_instant: "recorded_time_same_instant",
}
const ARRIVAL_CODE: Record<ArrivalClassification, TemporalReasonCode> = {
  in_order: "arrival_in_order",
  left_late_arriving: "left_late_arriving",
  right_late_arriving: "right_late_arriving",
  unresolved: "arrival_unresolved",
}

type AttestationRecord = {
  readonly input: TemporalRelationInput
  readonly snapshot: TemporalRelationSnapshot
}

// Module-private: only the exact success object produced for the exact input
// object is ever registered. Not exported, not enumerable, not forgeable.
const ATTESTED: WeakMap<TemporalRelationSuccess, AttestationRecord> = new WeakMap()

// Fresh non-aliasing copy: new outer object, new frozen arrays, primitives
// only. Used both to detach the stored snapshot from the returned success and
// to detach every snapshot returned to a caller from the stored one.
function detachedSnapshot(source: TemporalRelationSnapshot): TemporalRelationSnapshot {
  return Object.freeze({
    ...source,
    reasonCodes: Object.freeze([...source.reasonCodes]),
    narrative: Object.freeze([...source.narrative]),
  })
}

function buildSnapshot(success: TemporalRelationSuccess): TemporalRelationSnapshot {
  const { ok, ...fields } = success
  void ok
  return detachedSnapshot(fields)
}

/**
 * Evaluates the pairwise temporal relation of two bounded observations.
 * Deterministic; validation order is fixed (top level, then left, then
 * right); failures are closed-vocabulary and value-free.
 */
export function evaluateTemporalRelation(input: TemporalRelationInput): TemporalRelationResult {
  const captured = captureOwn(input, TOP_LEVEL_KEYS)
  if ("ok" in captured) return captured
  const [leftRaw, rightRaw] = captured.values
  const left = validateObservation(leftRaw)
  if ("ok" in left) return left
  const right = validateObservation(rightRaw)
  if ("ok" in right) return right

  const validTimeRelation = relateValidTime(left, right)
  const observedTimeRelation = relateSystemTime(left.observedAt, right.observedAt)
  const recordedTimeRelation = relateSystemTime(left.recordedAt, right.recordedAt)
  const arrivalClassification = classifyArrival(validTimeRelation, observedTimeRelation)

  // Documented deterministic order: valid, observed, recorded, arrival, then
  // the two constant non-authority codes.
  const reasonCodes: readonly TemporalReasonCode[] = Object.freeze([
    VALID_TIME_CODE[validTimeRelation],
    OBSERVED_TIME_CODE[observedTimeRelation],
    RECORDED_TIME_CODE[recordedTimeRelation],
    ARRIVAL_CODE[arrivalClassification],
    "transition_not_established" as const,
    "supersession_not_established" as const,
  ])
  const success: TemporalRelationSuccess = Object.freeze({
    ok: true as const,
    candidateOnly: true as const,
    shadowOnly: true as const,
    humanReviewRequired: true as const,
    validTimeRelation,
    observedTimeRelation,
    recordedTimeRelation,
    arrivalClassification,
    transitionEvidence: "not_established" as const,
    supersessionOrder: "not_established" as const,
    reasonCodes,
    narrative: Object.freeze(reasonCodes.map((code) => NARRATIVE[code])),
  })
  ATTESTED.set(success, { input, snapshot: buildSnapshot(success) })
  return success
}

/**
 * Returns a detached inert snapshot only for the exact success object
 * produced by this module, presented together with the exact top-level input
 * object it was produced from. Clones, wrappers, proxies, forgeries, failed
 * results, structurally equal inputs and cross-input replays are rejected
 * with one value-free code. Repeated calls never alias.
 */
export function snapshotValidatedTemporalRelationResult(
  result: unknown,
  input: unknown,
): TemporalRelationSnapshotResult {
  const record = result !== null && typeof result === "object"
    ? ATTESTED.get(result as TemporalRelationSuccess)
    : undefined
  if (record === undefined || record.input !== input) {
    return Object.freeze({ ok: false as const, failureCode: "attestation_rejected" as const })
  }
  return Object.freeze({ ok: true as const, snapshot: detachedSnapshot(record.snapshot) })
}
