/**
 * HTPE H1A: permanent tests for the shadow two-axis temporal relation
 * contract (docs/HTPE_H1A_TEMPORAL_CONTRACT.md). Scenarios are built inline
 * from bounded constants — no fixture file, no network, no clock, no LLM, no
 * persistence. Also pins the architecture boundary: no production consumer,
 * no foreign import, exact module surface, H0 document immutability.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  evaluateTemporalRelation,
  snapshotValidatedTemporalRelationResult,
} from "../app/lib/phase6/temporalContract/evaluate.ts"
import type {
  TemporalObservationInput,
  TemporalRelationInput,
  TemporalRelationSuccess,
} from "../app/lib/phase6/temporalContract/types.ts"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const H0_DOC_SHA256 = "f2ac89f35735756358105d0c6cba2055face10397e5c71b8c9b15220147ef00f"

const [T0, T1, T2, T3, T4, T5, T6, T7] = [1, 2, 3, 4, 5, 6, 7, 8].map((day) => `2026-01-0${day}T00:00:00.000Z`)
const obs = (validFrom: string | null, validTo: string | null, observedAt: string, recordedAt: string): TemporalObservationInput =>
  ({ validFrom, validTo, observedAt, recordedAt })
const pair = (left: TemporalObservationInput, right: TemporalObservationInput): TemporalRelationInput => ({ left, right })
const swap = (input: TemporalRelationInput): TemporalRelationInput => pair(input.right, input.left)

function okOf(input: TemporalRelationInput): TemporalRelationSuccess {
  const result = evaluateTemporalRelation(input)
  assert.equal(result.ok, true)
  return result as TemporalRelationSuccess
}
function failOf(input: unknown, failureCode: string): void {
  assert.deepEqual(evaluateTemporalRelation(input as TemporalRelationInput), { ok: false, failureCode })
}
function leaves(value: unknown, out: unknown[] = []): unknown[] {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) leaves(child, out)
  } else out.push(value)
  return out
}
// Property NAMES are checked against the forbidden vocabulary; bounded constant
// sentences are not, so ordinary prose words never trip the scan.
const FORBIDDEN_NAME = /^(tenantid|userid|provider|sourceid|sourceobjectid|claimid|claim|subjectref|subject|actor|authority|title|summary|text|message|url|payload|timestamp|instant|duration|count|index|score|priority|confidence|rank|conflict|approval|execution)$|hash$/i
// Descriptor-level recursion: symbols, non-enumerables, accessors, prototypes
// and frozenness, not just enumerable string values.
function scan(value: unknown, path: string, out: string[] = []): string[] {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" || typeof value === "bigint") out.push(`${path}: numeric value`)
    if (typeof value === "string" && /\d/.test(value)) out.push(`${path}: digit in string`)
    return out
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== Array.prototype) out.push(`${path}: unexpected prototype`)
  if (!Object.isFrozen(value)) out.push(`${path}: not frozen`)
  for (const symbol of Object.getOwnPropertySymbols(value)) out.push(`${path}[${String(symbol)}]: symbol key`)
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    const at = `${path}.${key}`
    // Array `length` is an intrinsic, never an H1A field; nothing else may be non-enumerable.
    if (Array.isArray(value) && key === "length") continue
    if (!descriptor.enumerable) out.push(`${at}: non-enumerable own field`)
    if (descriptor.get !== undefined || descriptor.set !== undefined) out.push(`${at}: accessor`)
    if (FORBIDDEN_NAME.test(key)) out.push(`${at}: forbidden property name`)
    scan(descriptor.value, at, out)
  }
  return out
}
const namesOf = (value: object): string[] => Object.getOwnPropertyNames(value).sort()
const SENTENCE: Record<string, string> = {
  valid_time_left_before_right: "The left valid interval ends before the right valid interval begins.",
  valid_time_right_before_left: "The right valid interval ends before the left valid interval begins.",
  observed_time_left_before_right: "The left observation was observed before the right observation.",
  observed_time_right_before_left: "The right observation was observed before the left observation.",
  left_late_arriving: "The left observation arrived after the right observation despite representing an earlier valid interval.",
  right_late_arriving: "The right observation arrived after the left observation despite representing an earlier valid interval.",
}
// H1A's own files: a durable module-identity fact, not a release-diff fact. Used to exempt H1A from its own
// consumer scan. Release scope (which paths a PR changed) belongs to review and merge authorization, never here.
const H1A_OWN_FILES = ["app/lib/phase6/temporalContract/evaluate.ts", "app/lib/phase6/temporalContract/types.ts",
  "tests/phase6TemporalContract.test.mts"]
// EXACT reviewed internal consumer transition (HTPE H1B2A): H1A moves from zero
// internal consumers to exactly these two module files. No route, UI, provider,
// formation, persistence, ranking, candidate-pipeline or external consumer is
// authorized; the PRODUCTION pipeline consumer stays NONE; H1A's semantics are
// unchanged. The exemption is PINNED, not a hole: each consumer's ENTIRE import
// set is fixed, so it cannot grow an edge without failing here.
const H1B2A_CONSUMERS = ["app/lib/phase6/temporalAssociation/evaluate.ts",
  "app/lib/phase6/temporalAssociation/types.ts"]
// CONCATENATED: spelling H1B1's token literally would make this file an offender
// in H1B1's own permanent substring scan.
const H1B1_MOD = `revision${"Reference"}`
const H1B2A_IMPORTS: Record<string, string[]> = {
  "app/lib/phase6/temporalAssociation/evaluate.ts":
    ["./types.ts", `../${H1B1_MOD}/evaluate.ts`, "../temporalContract/evaluate.ts"],
  "app/lib/phase6/temporalAssociation/types.ts":
    [`../${H1B1_MOD}/types.ts`, "../temporalContract/types.ts"],
}
// An exempted consumer must exist, import exactly its reviewed specifiers, and
// reach nothing through a dynamic, re-exported, computed or split specifier.
function assertPinnedConsumer(root: string, tracked: string[], consumer: string): void {
  assert.equal(tracked.includes(consumer), true, `stale exemption: ${consumer}`)
  const source = readFileSync(`${root}${consumer}`, "utf8")
  const specifiers = [...source.matchAll(/(?:from|^\s*import)\s+"([^"]+)"/gm)].map((match) => match[1])
  assert.deepEqual(specifiers, H1B2A_IMPORTS[consumer], consumer)
  assert.doesNotMatch(source, /\bimport\s*\(/)
  assert.doesNotMatch(source, /\brequire\s*\(/)
  assert.doesNotMatch(source, /^\s*export\s[^=]*\sfrom\s/m)
  assert.doesNotMatch(source, /from\s+"[^"]*"\s*\+/)
  assert.doesNotMatch(source, /from\s+`/)
}
const git = (...args: string[]): string => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim()
const revokedProxy = (target: object): object => { const { proxy, revoke } = Proxy.revocable(target, {}); revoke(); return proxy }

// Reference scenarios: strict orders, tie cases, and unresolved boundaries.
const LBR_IN_ORDER = pair(obs(T0, T1, T4, T4), obs(T2, T3, T5, T5))
const LEFT_LATE = pair(obs(T0, T1, T6, T6), obs(T2, T3, T5, T5))
const SAME_INTERVAL = pair(obs(T0, T1, T4, T4), obs(T0, T1, T4, T4))
const OVERLAP = pair(obs(T0, T2, T4, T5), obs(T1, T3, T4, T5))
const TOUCHING = pair(obs(T0, T1, T4, T4), obs(T1, T2, T4, T4))
const UNRESOLVED = pair(obs(null, T1, T4, T4), obs(T2, T3, T5, T5))
// Overlapping intervals whose observation order IS distinct: arrival must stay
// unresolved, because observation order may never resolve an overlap.
const OVERLAP_DISTINCT_OBSERVED = pair(obs(T0, T2, T4, T4), obs(T1, T3, T5, T5))
const ALL_SCENARIOS = [LBR_IN_ORDER, LEFT_LATE, SAME_INTERVAL, OVERLAP, TOUCHING, UNRESOLVED, OVERLAP_DISTINCT_OBSERVED]

test("h1a: canonical valid input succeeds with literal shadow markers (t1,t12,t46-48)", () => {
  const result = okOf(LBR_IN_ORDER)
  assert.equal(result.candidateOnly, true)
  assert.equal(result.shadowOnly, true)
  assert.equal(result.humanReviewRequired, true)
  assert.equal(result.validTimeRelation, "left_before_right")
  assert.equal(result.transitionEvidence, "not_established")
  assert.equal(result.supersessionOrder, "not_established")
  assert.equal(Object.isFrozen(result), true)
})

test("h1a: top-level and observation exact-key allowlists (t2,t3)", () => {
  for (const extra of ["updatedAt", "sourceId", "provider", "claimId", "subjectRef", "actor",
    "authority", "transition", "supersedes", "status", "role", "conflict", "priority", "score",
    "metadata", "futureBinding", "foo"]) {
    failOf({ ...LBR_IN_ORDER, [extra]: undefined }, "unknown_field")
    failOf(pair({ ...LBR_IN_ORDER.left, [extra]: null } as never, LBR_IN_ORDER.right), "unknown_field")
  }
  failOf(null, "invalid_input")
  failOf("x", "invalid_input")
  failOf(7, "invalid_input")
  failOf([LBR_IN_ORDER.left, LBR_IN_ORDER.right], "invalid_input")
  failOf(pair(null as never, LBR_IN_ORDER.right), "invalid_input")
  failOf({ left: LBR_IN_ORDER.left }, "missing_field")
  failOf(pair({ validFrom: T0, validTo: T1, observedAt: T4 } as never, LBR_IN_ORDER.right), "missing_field")
})

test("h1a: unknown fields reject by name without value reads (t4)", () => {
  let read = false
  const spyValues = [undefined, null, { a: 1 }, new Proxy({}, { get: () => { read = true; throw new Error("trap") } })]
  for (const value of spyValues) failOf({ ...LBR_IN_ORDER, foo: value }, "unknown_field")
  const hostile: Record<string, unknown> = { ...LBR_IN_ORDER }
  Object.defineProperty(hostile, "foo", { enumerable: true, get: () => { read = true; throw new Error("boom") } })
  failOf(hostile, "unknown_field")
  assert.equal(read, false)
})

test("h1a: symbol keys and inherited required fields reject (t5,t6)", () => {
  failOf({ ...LBR_IN_ORDER, [Symbol("s")]: 1 }, "unknown_field")
  failOf(Object.create({ right: LBR_IN_ORDER.right }, {
    left: { value: LBR_IN_ORDER.left, enumerable: true },
  }), "missing_field")
  failOf(pair(Object.create({ recordedAt: T4 }, {
    validFrom: { value: T0, enumerable: true }, validTo: { value: T1, enumerable: true },
    observedAt: { value: T4, enumerable: true },
  }) as never, LBR_IN_ORDER.right), "missing_field")
})

test("h1a: every public property is read exactly once (t7,t8)", () => {
  const counting = (target: Record<string, unknown>, counts: Record<string, number>): Record<string, unknown> => {
    const wrapped = {}
    for (const [key, value] of Object.entries(target)) {
      Object.defineProperty(wrapped, key, {
        enumerable: true, get: () => { counts[key] = (counts[key] ?? 0) + 1; return value },
      })
    }
    return wrapped as Record<string, unknown>
  }
  const oneEach = { validFrom: 1, validTo: 1, observedAt: 1, recordedAt: 1 }
  const topCounts: Record<string, number> = {}
  const leftCounts: Record<string, number> = {}
  const rightCounts: Record<string, number> = {}
  const input = counting({
    left: counting({ ...LBR_IN_ORDER.left }, leftCounts),
    right: counting({ ...LBR_IN_ORDER.right }, rightCounts),
  }, topCounts)
  assert.equal(evaluateTemporalRelation(input as never).ok, true)
  assert.deepEqual(topCounts, { left: 1, right: 1 })
  assert.deepEqual(leftCounts, oneEach)
  assert.deepEqual(rightCounts, oneEach)
})

test("h1a: throwing accessors and proxy traps fail closed (t9,t10,t11)", () => {
  const throwing: Record<string, unknown> = { right: LBR_IN_ORDER.right }
  Object.defineProperty(throwing, "left", { enumerable: true, get: () => { throw new Error("no") } })
  failOf(throwing, "input_unreadable")
  failOf(new Proxy({}, { ownKeys: () => { throw new Error("no") } }), "input_unreadable")
  failOf(pair(new Proxy({}, { ownKeys: () => { throw new Error("no") } }) as never, LBR_IN_ORDER.right), "input_unreadable")
  failOf(new Proxy({ ...LBR_IN_ORDER }, {
    getOwnPropertyDescriptor: () => { throw new Error("no") },
  }), "input_unreadable")
})

test("h1a: revoked proxies fail closed at every input boundary (t12a-t12f)", () => {
  // Array.isArray/Reflect.ownKeys throw on a revoked Proxy; no caller exception
  // may escape, and the code is the same one used for every unreadable input.
  const unreadable = { ok: false, failureCode: "input_unreadable" }
  assert.deepEqual(evaluateTemporalRelation(revokedProxy({ ...LBR_IN_ORDER }) as never), unreadable)
  assert.deepEqual(evaluateTemporalRelation(revokedProxy([]) as never), unreadable)
  assert.deepEqual(evaluateTemporalRelation(pair(revokedProxy({ ...LBR_IN_ORDER.left }) as never, LBR_IN_ORDER.right)), unreadable)
  assert.deepEqual(evaluateTemporalRelation(pair(LBR_IN_ORDER.left, revokedProxy({ ...LBR_IN_ORDER.right }) as never)), unreadable)
  const nested = pair(revokedProxy({ ...LBR_IN_ORDER.left }) as never, revokedProxy({ ...LBR_IN_ORDER.right }) as never)
  assert.deepEqual(evaluateTemporalRelation(nested), unreadable)
  // Deterministic on repeat, and the result carries no exception text or caller value.
  const repeated = evaluateTemporalRelation(revokedProxy({ ...LBR_IN_ORDER }) as never)
  assert.deepEqual(repeated, unreadable)
  assert.deepEqual(namesOf(repeated), ["failureCode", "ok"])
  assert.deepEqual(scan(repeated, "revoked"), [])
  // A revoked proxy on the attestation surface is rejected, never thrown from.
  const rejected = { ok: false, failureCode: "attestation_rejected" }
  assert.deepEqual(snapshotValidatedTemporalRelationResult(revokedProxy({}), LBR_IN_ORDER), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(okOf(LBR_IN_ORDER), revokedProxy({})), rejected)
})

test("h1a: only canonical UTC instants are accepted (t13-t18)", () => {
  for (const bad of [
    "2026-01-01T00:00:00.000+09:00", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00.000z",
    "2026-01-01", "2026-01-01T00:00:00.000", "2026-02-30T00:00:00.000Z",
    " 2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z ", "2026-13-01T00:00:00.000Z",
    "January 1 2026", 1735689600000, new Date(T0), null as unknown, undefined,
  ]) {
    failOf(pair(obs(T0, T1, bad as never, T4), obs(T2, T3, T5, T5)), "invalid_instant")
  }
  failOf(pair(obs("2026-01-01T00:00:00Z" as never, T1, T4, T4), LBR_IN_ORDER.right), "invalid_instant")
})

test("h1a: interval and system-time sanity invariants (t19,t20,t21)", () => {
  failOf(pair(obs(T0, T1, T5, T4), obs(T2, T3, T5, T5)), "recorded_before_observed")
  failOf(pair(obs(T1, T0, T4, T4), obs(T2, T3, T5, T5)), "invalid_valid_interval")
  const point = okOf(pair(obs(T0, T0, T4, T4), obs(T1, T1, T5, T5)))
  assert.equal(point.validTimeRelation, "left_before_right")
})

test("h1a: valid-time relation matrix (t22-t27)", () => {
  assert.equal(okOf(LBR_IN_ORDER).validTimeRelation, "left_before_right")
  assert.equal(okOf(swap(LBR_IN_ORDER)).validTimeRelation, "right_before_left")
  assert.equal(okOf(SAME_INTERVAL).validTimeRelation, "same_interval")
  assert.equal(okOf(OVERLAP).validTimeRelation, "overlaps")
  assert.equal(okOf(TOUCHING).validTimeRelation, "overlaps")
  for (const partial of [
    pair(obs(null, T1, T4, T4), obs(T2, T3, T5, T5)), pair(obs(T0, null, T4, T4), obs(T2, T3, T5, T5)),
    pair(obs(T0, T1, T4, T4), obs(null, T3, T5, T5)), pair(obs(T0, T1, T4, T4), obs(T2, null, T5, T5)),
    pair(obs(null, null, T4, T4), obs(null, null, T5, T5)),
  ]) {
    assert.equal(okOf(partial).validTimeRelation, "unresolved")
  }
})

test("h1a: observed and recorded axes stay separate, all three cases (t28,t29)", () => {
  const mixed = okOf(pair(obs(T0, T1, T4, T7), obs(T2, T3, T5, T6)))
  assert.equal(mixed.observedTimeRelation, "left_before_right")
  assert.equal(mixed.recordedTimeRelation, "right_before_left")
  const same = okOf(pair(obs(T0, T1, T4, T5), obs(T2, T3, T4, T5)))
  assert.equal(same.observedTimeRelation, "same_instant")
  assert.equal(same.recordedTimeRelation, "same_instant")
  assert.equal(okOf(LEFT_LATE).observedTimeRelation, "right_before_left")
})

test("h1a: arrival classification (t30-t35)", () => {
  assert.equal(okOf(LBR_IN_ORDER).arrivalClassification, "in_order")
  assert.equal(okOf(swap(LBR_IN_ORDER)).arrivalClassification, "in_order")
  assert.equal(okOf(LEFT_LATE).arrivalClassification, "left_late_arriving")
  assert.equal(okOf(swap(LEFT_LATE)).arrivalClassification, "right_late_arriving")
  assert.equal(okOf(pair(obs(T0, T1, T4, T4), obs(T2, T3, T4, T4))).arrivalClassification, "unresolved")
  assert.equal(okOf(OVERLAP).arrivalClassification, "unresolved")
  assert.equal(okOf(SAME_INTERVAL).arrivalClassification, "unresolved")
  assert.equal(okOf(UNRESOLVED).arrivalClassification, "unresolved")
  // Overlapping intervals with a DISTINCT observation order: observation order
  // must not resolve an unproven valid-time order into an arrival verdict.
  const overlapDistinct = okOf(OVERLAP_DISTINCT_OBSERVED)
  assert.equal(overlapDistinct.validTimeRelation, "overlaps")
  assert.equal(overlapDistinct.observedTimeRelation, "left_before_right")
  assert.equal(overlapDistinct.arrivalClassification, "unresolved")
  assert.equal(okOf(swap(OVERLAP_DISTINCT_OBSERVED)).arrivalClassification, "unresolved")
})

test("h1a: recording order never changes arrival; observed order never changes valid time (t36,t37)", () => {
  const recordedFlipped = pair(obs(T0, T1, T4, T7), obs(T2, T3, T5, T6))
  assert.equal(okOf(recordedFlipped).arrivalClassification, okOf(LBR_IN_ORDER).arrivalClassification)
  const lateRecorded = pair(obs(T0, T1, T6, T7), obs(T2, T3, T5, T5))
  assert.equal(okOf(lateRecorded).arrivalClassification, "left_late_arriving")
  for (const observedShift of [pair(obs(T0, T1, T6, T6), obs(T2, T3, T4, T4)), LBR_IN_ORDER]) {
    assert.equal(okOf(observedShift).validTimeRelation, "left_before_right")
  }
  assert.equal(okOf(pair(obs(null, T1, T4, T4), obs(T2, T3, T5, T5))).validTimeRelation, "unresolved")
})

test("h1a: transition and supersession are never established; no authority words leak (t38,t39,t40)", () => {
  for (const scenario of ALL_SCENARIOS) {
    const result = okOf(scenario)
    assert.equal(result.transitionEvidence, "not_established")
    assert.equal(result.supersessionOrder, "not_established")
    assert.equal(result.reasonCodes.at(-2), "transition_not_established")
    assert.equal(result.reasonCodes.at(-1), "supersession_not_established")
    for (const value of leaves(result)) {
      if (typeof value !== "string") continue
      for (const banned of ["conflict", "latest", "newest", "newer", "older", "authoritative", "superseded"]) {
        assert.equal(value.includes(banned), false)
      }
      if (value.includes("supersession") || value.includes("transition")) {
        assert.equal(value.includes("not_established") || value.includes("No "), true)
      }
    }
  }
})

test("h1a: swap symmetry is exact for every relation (t41)", () => {
  const invert: Record<string, string> = {
    left_before_right: "right_before_left", right_before_left: "left_before_right",
    same_interval: "same_interval", overlaps: "overlaps", unresolved: "unresolved",
    same_instant: "same_instant", in_order: "in_order",
    left_late_arriving: "right_late_arriving", right_late_arriving: "left_late_arriving",
  }
  for (const scenario of ALL_SCENARIOS) {
    const forward = okOf(scenario)
    const reversed = okOf(swap(scenario))
    assert.equal(reversed.validTimeRelation, invert[forward.validTimeRelation])
    assert.equal(reversed.observedTimeRelation, invert[forward.observedTimeRelation])
    assert.equal(reversed.recordedTimeRelation, invert[forward.recordedTimeRelation])
    assert.equal(reversed.arrivalClassification, invert[forward.arrivalClassification])
    assert.equal(reversed.transitionEvidence, forward.transitionEvidence)
    assert.equal(reversed.supersessionOrder, forward.supersessionOrder)
    assert.equal(reversed.reasonCodes.length, 6)
    assert.equal(reversed.narrative.length, 6)
  }
})

test("h1a: reason order and narrative are deterministic and bounded (t42,t43)", () => {
  for (const scenario of ALL_SCENARIOS) {
    const first = okOf(scenario)
    const second = okOf(pair({ ...scenario.left }, { ...scenario.right }))
    assert.deepEqual([...first.reasonCodes], [...second.reasonCodes])
    assert.deepEqual([...first.narrative], [...second.narrative])
    assert.match(first.reasonCodes[0], /^valid_time_/)
    assert.match(first.reasonCodes[1], /^observed_time_/)
    assert.match(first.reasonCodes[2], /^recorded_time_/)
    assert.equal(Object.isFrozen(first.reasonCodes), true)
    assert.equal(Object.isFrozen(first.narrative), true)
  }
})

test("h1a: exact public own-key shapes on every output surface (t44a-t44g)", () => {
  const success = okOf(LBR_IN_ORDER)
  assert.deepEqual(namesOf(success), ["arrivalClassification", "candidateOnly", "humanReviewRequired", "narrative",
    "observedTimeRelation", "ok", "reasonCodes", "recordedTimeRelation", "shadowOnly", "supersessionOrder", "transitionEvidence", "validTimeRelation"])
  assert.deepEqual(namesOf(evaluateTemporalRelation(null as never)), ["failureCode", "ok"])
  const attested = snapshotValidatedTemporalRelationResult(success, LBR_IN_ORDER)
  assert.deepEqual(namesOf(attested), ["ok", "snapshot"])
  assert.deepEqual(namesOf(snapshotValidatedTemporalRelationResult({}, LBR_IN_ORDER)), ["failureCode", "ok"])
  assert.equal(attested.ok, true)
  if (!attested.ok) return
  // The snapshot is the success surface minus `ok` — no extra field may appear.
  assert.deepEqual(namesOf(attested.snapshot), namesOf(success).filter((name) => name !== "ok"))
  // Arrays carry exactly six index names plus the intrinsic length — no extra slot.
  const arrayNames = ["0", "1", "2", "3", "4", "5", "length"]
  assert.deepEqual(namesOf(attested.snapshot.reasonCodes), arrayNames)
  assert.deepEqual(namesOf(attested.snapshot.narrative), arrayNames)
  assert.deepEqual(namesOf(success.reasonCodes), arrayNames)
  assert.deepEqual(namesOf(success.narrative), arrayNames)
  for (const surface of [success, attested, attested.snapshot]) {
    assert.equal(Object.getOwnPropertySymbols(surface).length, 0)
    assert.equal(Object.getPrototypeOf(surface), Object.prototype)
    assert.equal(Object.isFrozen(surface), true)
  }
})

test("h1a: descriptor-level output safety on every public surface (t45a-t45c)", () => {
  const attestedInput = LBR_IN_ORDER
  const success = okOf(attestedInput)
  const surfaces: [string, unknown][] = [
    ...ALL_SCENARIOS.map((s, i): [string, unknown] => [`success${i}`, okOf(s)]),
    ["failInvalid", evaluateTemporalRelation(null as never)],
    ["failUnknown", evaluateTemporalRelation({ ...LBR_IN_ORDER, extra: 1 } as never)],
    ["failInstant", evaluateTemporalRelation(pair(obs(T0, T1, "nope" as never, T4), LBR_IN_ORDER.right))],
    ["attested", snapshotValidatedTemporalRelationResult(success, attestedInput)],
    ["attestRejected", snapshotValidatedTemporalRelationResult({}, attestedInput)],
  ]
  for (const [label, surface] of surfaces) assert.deepEqual(scan(surface, label), [])
})

test("h1a: swap inverts reason codes and narrative sentences exactly (t41a,t41b)", () => {
  const codes = (input: TemporalRelationInput): string[] => [...okOf(input).reasonCodes]
  assert.deepEqual(codes(LBR_IN_ORDER), ["valid_time_left_before_right", "observed_time_left_before_right",
    "recorded_time_left_before_right", "arrival_in_order", "transition_not_established", "supersession_not_established"])
  assert.deepEqual(codes(swap(LBR_IN_ORDER)), ["valid_time_right_before_left", "observed_time_right_before_left",
    "recorded_time_right_before_left", "arrival_in_order", "transition_not_established", "supersession_not_established"])
  assert.deepEqual(codes(LEFT_LATE), ["valid_time_left_before_right", "observed_time_right_before_left",
    "recorded_time_right_before_left", "left_late_arriving", "transition_not_established", "supersession_not_established"])
  assert.deepEqual(codes(swap(LEFT_LATE)), ["valid_time_right_before_left", "observed_time_left_before_right",
    "recorded_time_left_before_right", "right_late_arriving", "transition_not_established", "supersession_not_established"])
  // Each side-bearing code must carry ITS OWN sentence, in the same position.
  for (const scenario of ALL_SCENARIOS) {
    for (const input of [scenario, swap(scenario)]) {
      const result = okOf(input)
      result.reasonCodes.forEach((code, index) => {
        if (SENTENCE[code] !== undefined) assert.equal(result.narrative[index], SENTENCE[code])
      })
    }
  }
  // Fixed points keep their exact values under swap.
  for (const fixed of [SAME_INTERVAL, OVERLAP, TOUCHING]) {
    assert.deepEqual(codes(fixed), codes(swap(fixed)))
    assert.deepEqual([...okOf(fixed).narrative], [...okOf(swap(fixed)).narrative])
  }
})

test("h1a: no raw timestamp, digit, or numeric value in any output (t44,t45)", () => {
  const outputs: unknown[] = ALL_SCENARIOS.map((scenario) => okOf(scenario))
  outputs.push(evaluateTemporalRelation(null as never))
  const attested = okOf(LBR_IN_ORDER)
  outputs.push(snapshotValidatedTemporalRelationResult(attested, LBR_IN_ORDER))
  outputs.push(snapshotValidatedTemporalRelationResult({}, LBR_IN_ORDER))
  for (const value of outputs.flatMap((output) => leaves(output))) {
    assert.notEqual(typeof value, "number")
    assert.notEqual(typeof value, "bigint")
    if (typeof value === "string") assert.doesNotMatch(value, /\d/)
  }
})

test("h1a: attestation accepts only the exact result with the exact input (t49-t52)", () => {
  const input = pair(obs(T0, T1, T4, T4), obs(T2, T3, T5, T5))
  const result = okOf(input)
  const accepted = snapshotValidatedTemporalRelationResult(result, input)
  assert.equal(accepted.ok, true)
  assert.equal(accepted.ok && accepted.snapshot.validTimeRelation, "left_before_right")
  const rejected = { ok: false, failureCode: "attestation_rejected" }
  assert.deepEqual(snapshotValidatedTemporalRelationResult({ ...result }, input), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(structuredClone(result), input), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(Object.create(result), input), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(new Proxy(result, {}), input), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(JSON.parse(JSON.stringify(result)), input), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(evaluateTemporalRelation(null as never), input), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(result, pair(input.left, input.right)), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(result, { ...input }), rejected)
  const otherInput = pair(obs(T0, T1, T4, T4), obs(T2, T3, T5, T5))
  const otherResult = okOf(otherInput)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(result, otherInput), rejected)
  assert.deepEqual(snapshotValidatedTemporalRelationResult(otherResult, input), rejected)
})

test("h1a: snapshots never alias and survive public mutation (t53,t54)", () => {
  const left: Record<string, unknown> = { ...LBR_IN_ORDER.left }
  const input = { left, right: { ...LBR_IN_ORDER.right } } as unknown as TemporalRelationInput
  const result = okOf(input)
  const first = snapshotValidatedTemporalRelationResult(result, input)
  const second = snapshotValidatedTemporalRelationResult(result, input)
  assert.equal(first.ok && second.ok, true)
  if (!first.ok || !second.ok) return
  assert.notEqual(first, second)
  assert.notEqual(first.snapshot, second.snapshot)
  assert.notEqual(first.snapshot.reasonCodes, second.snapshot.reasonCodes)
  assert.notEqual(first.snapshot.narrative, second.snapshot.narrative)
  const before = JSON.stringify(first.snapshot)
  left.validFrom = T6
  left.observedAt = T7
  assert.throws(() => { (result.reasonCodes as string[]).push("valid_time_overlaps") })
  const after = snapshotValidatedTemporalRelationResult(result, input)
  assert.equal(after.ok, true)
  if (after.ok) assert.equal(JSON.stringify(after.snapshot), before)
})

test("h1a: exactly one reviewed internal consumer, no production consumer (t55,t56)", () => {
  const moduleDir = `${ROOT}app/lib/phase6/temporalContract`
  // Every TRACKED executable source file in the repository — app/, scripts/,
  // electron/, prototypes/, root configs and any future directory — not only app/.
  const sources = git("ls-files").split("\n").filter((path) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path))
  assert.equal(sources.length > 0, true)
  const own = new Set([...H1A_OWN_FILES, ...H1B2A_CONSUMERS])
  // Any reference form — static import, export-from, dynamic import(), require(),
  // or a bare path — must spell the module directory to reach it from outside.
  // The guard is NARROWED, not deleted: from "zero occurrences anywhere" to
  // "zero occurrences outside these named files, whose import sets are pinned".
  const offenders = sources.filter((path) => !own.has(path) && readFileSync(`${ROOT}${path}`, "utf8").includes("temporalContract"))
  assert.deepEqual(offenders, [])
  for (const consumer of H1B2A_CONSUMERS) assertPinnedConsumer(ROOT, sources, consumer)
  // Non-vacuity: the needle really does match its one legitimate importer, so
  // the scan is not silently searching for something that is never present.
  assert.equal(readFileSync(`${ROOT}${H1B2A_CONSUMERS[0]}`, "utf8").includes("temporalContract"), true)
  const evaluateSource = readFileSync(`${moduleDir}/evaluate.ts`, "utf8")
  // The module itself may not reach outward dynamically either.
  for (const source of [evaluateSource, readFileSync(`${moduleDir}/types.ts`, "utf8")]) {
    assert.doesNotMatch(source, /\bimport\s*\(/)
    assert.doesNotMatch(source, /\brequire\s*\(/)
  }
  const importSpecifiers = [...evaluateSource.matchAll(/(?:from|^\s*import)\s+"([^"]+)"/gm)].map((match) => match[1])
  assert.deepEqual(importSpecifiers, ["./types.ts"])
  const typesSource = readFileSync(`${moduleDir}/types.ts`, "utf8")
  assert.deepEqual([...typesSource.matchAll(/^\s*import\b/gm)], [])
  for (const source of [evaluateSource, typesSource]) {
    for (const banned of ["node:", "process.env", "fetch(", "Date.now", "Math.random"]) {
      assert.equal(source.includes(banned), false)
    }
  }
})

// Durable module invariants only. Which paths a given PR changed is a one-time release
// condition owned by review and merge authorization, never by the permanent suite: pinning
// it here would fail every later unrelated change to the repository.
test("h1a: exact module surface, contract documents, and H0 integrity (t57,t58)", () => {
  assert.deepEqual(readdirSync(`${ROOT}app/lib/phase6/temporalContract`).sort(), ["evaluate.ts", "types.ts"])
  const h0 = createHash("sha256").update(readFileSync(`${ROOT}docs/PROVENANCE_CLAIM_CONTRACT.md`)).digest("hex")
  assert.equal(h0, H0_DOC_SHA256)
  // The H1A contract document must exist and be readable: deleting it is a
  // scope regression, not a silent no-op.
  const contractPath = `${ROOT}docs/HTPE_H1A_TEMPORAL_CONTRACT.md`
  assert.equal(statSync(contractPath).isFile(), true)
  const contract = readFileSync(contractPath, "utf8")
  assert.match(contract, /^# HTPE H1A Temporal Relation Contract$/m)
  for (const required of ["SHADOW ONLY", "**Authority:** NONE", "**Production consumer:** NONE"]) assert.equal(contract.includes(required), true)
})
