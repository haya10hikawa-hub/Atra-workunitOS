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
const H1A_BASE_SHA = "83a536fd0714e1fa0757223e21d4a22ff8493583"
const H0_DOC_SHA256 = "f2ac89f35735756358105d0c6cba2055face10397e5c71b8c9b15220147ef00f"

const [T0, T1, T2, T3, T4, T5, T6, T7] = [1, 2, 3, 4, 5, 6, 7, 8].map(
  (day) => `2026-01-0${day}T00:00:00.000Z`,
)
const obs = (
  validFrom: string | null, validTo: string | null, observedAt: string, recordedAt: string,
): TemporalObservationInput => ({ validFrom, validTo, observedAt, recordedAt })
const pair = (left: TemporalObservationInput, right: TemporalObservationInput): TemporalRelationInput =>
  ({ left, right })
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

// Reference scenarios: strict orders, tie cases, and unresolved boundaries.
const LBR_IN_ORDER = pair(obs(T0, T1, T4, T4), obs(T2, T3, T5, T5))
const LEFT_LATE = pair(obs(T0, T1, T6, T6), obs(T2, T3, T5, T5))
const SAME_INTERVAL = pair(obs(T0, T1, T4, T4), obs(T0, T1, T4, T4))
const OVERLAP = pair(obs(T0, T2, T4, T5), obs(T1, T3, T4, T5))
const TOUCHING = pair(obs(T0, T1, T4, T4), obs(T1, T2, T4, T4))
const UNRESOLVED = pair(obs(null, T1, T4, T4), obs(T2, T3, T5, T5))
const ALL_SCENARIOS = [LBR_IN_ORDER, LEFT_LATE, SAME_INTERVAL, OVERLAP, TOUCHING, UNRESOLVED]

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

test("h1a: no production consumer and no foreign import (t55,t56)", () => {
  const moduleDir = `${ROOT}app/lib/phase6/temporalContract`
  const offenders: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`
      if (statSync(path).isDirectory()) {
        if (path !== moduleDir) walk(path)
      } else if (/\.(ts|tsx|mts)$/.test(entry) && readFileSync(path, "utf8").includes("temporalContract")) {
        offenders.push(path)
      }
    }
  }
  walk(`${ROOT}app`)
  assert.deepEqual(offenders, [])
  const evaluateSource = readFileSync(`${moduleDir}/evaluate.ts`, "utf8")
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

test("h1a: exact module surface, four-file scope, H0 document unchanged (t57,t58)", () => {
  assert.deepEqual(readdirSync(`${ROOT}app/lib/phase6/temporalContract`).sort(), ["evaluate.ts", "types.ts"])
  const h0 = createHash("sha256").update(readFileSync(`${ROOT}docs/PROVENANCE_CLAIM_CONTRACT.md`)).digest("hex")
  assert.equal(h0, H0_DOC_SHA256)
  const ALLOWED = [
    "app/lib/phase6/temporalContract/evaluate.ts", "app/lib/phase6/temporalContract/types.ts",
    "docs/HTPE_H1A_TEMPORAL_CONTRACT.md", "tests/phase6TemporalContract.test.mts",
  ]
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim()
  let baseAvailable = true
  try { git("cat-file", "-e", H1A_BASE_SHA) } catch { baseAvailable = false }
  if (!baseAvailable) return
  const scoped = git("diff", "--name-only", H1A_BASE_SHA, "HEAD", "--", ...ALLOWED, "docs/PROVENANCE_CLAIM_CONTRACT.md")
    .split("\n").filter((line) => line !== "").sort()
  assert.deepEqual(scoped.filter((path) => path === "docs/PROVENANCE_CLAIM_CONTRACT.md"), [])
  let exactSlice = false
  try { exactSlice = git("merge-base", H1A_BASE_SHA, "HEAD") === H1A_BASE_SHA && Number(git("rev-list", "--count", `${H1A_BASE_SHA}..HEAD`)) <= 1 } catch { exactSlice = false }
  if (exactSlice) {
    const committed = git("diff", "--name-only", H1A_BASE_SHA, "HEAD").split("\n").filter((line) => line !== "").sort()
    for (const path of committed) assert.equal(ALLOWED.includes(path), true)
  }
})
