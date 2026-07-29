/**
 * HTPE H1B2A: permanent tests for the shadow declared-reference temporal
 * association contract (docs/HTPE_H1B2A_DECLARED_TEMPORAL_ASSOCIATION_CONTRACT.md).
 * Scenarios are built inline from bounded constants — no fixture file, no
 * network, no clock, no LLM, no persistence. Also owns the repository-wide
 * RESOLVED CONSUMER GRAPH for H1A, H1B1 and H1B2A: a real parse of every tracked
 * executable source file, so a prose mention is not an import and a computed or
 * split specifier cannot slip past a substring scan.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import ts from "typescript"
import {
  evaluateDeclaredReferenceTemporalAssociation,
  snapshotValidatedDeclaredReferenceTemporalAssociation,
} from "../app/lib/phase6/temporalAssociation/evaluate.ts"
import type {
  DeclaredReferenceTemporalAssociationInput,
  DeclaredReferenceTemporalAssociationSuccess,
} from "../app/lib/phase6/temporalAssociation/types.ts"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const H1A_MOD = `temporal${"Contract"}`
const H1B1_MOD = `revision${"Reference"}`
const H1A_DIR = `app/lib/phase6/${H1A_MOD}`
const H1B1_DIR = `app/lib/phase6/${H1B1_MOD}`
const H1B2A_DIR = "app/lib/phase6/temporalAssociation"
const H1A_TEST = "tests/phase6TemporalContract.test.mts"
const H1B1_TEST = "tests/phase6RevisionReference.test.mts"
const H1B2A_TEST = "tests/phase6TemporalAssociation.test.mts"
const CONTRACT = "docs/HTPE_H1B2A_DECLARED_TEMPORAL_ASSOCIATION_CONTRACT.md"
const moduleFiles = (dir: string): string[] => [`${dir}/evaluate.ts`, `${dir}/types.ts`]
const H1B2A_FILES = moduleFiles(H1B2A_DIR)
const read = (file: string): string => readFileSync(`${ROOT}${file}`, "utf8")
const source = (): string => read(`${H1B2A_DIR}/evaluate.ts`)

const BASIS = "declared_opaque_ref"
const [SA, CA, RA] = ["SUBJa", "CLAIMa", "REVa"]
const [T1, T2, T3, T4] = [1, 2, 3, 4].map((day) => `2026-01-0${day}T00:00:00.000Z`)
const REFERENCE_KEYS = ["subjectRef", "logicalClaimRef", "revisionRef", "identityBasis"]
const OBSERVATION_KEYS = ["validFrom", "validTo", "observedAt", "recordedAt"]

type Loose = Record<string, unknown>
const ref = (over: Loose = {}): Loose =>
  ({ subjectRef: SA, logicalClaimRef: CA, revisionRef: RA, identityBasis: BASIS, ...over })
const obs = (over: Loose = {}): Loose =>
  ({ validFrom: T1, validTo: T2, observedAt: T3, recordedAt: T4, ...over })
const input = (declaredReference: unknown = ref(), temporalObservation: unknown = obs()): unknown =>
  ({ declaredReference, temporalObservation })
const ev = evaluateDeclaredReferenceTemporalAssociation
const snap = snapshotValidatedDeclaredReferenceTemporalAssociation
function okOf(value: unknown): DeclaredReferenceTemporalAssociationSuccess {
  const result = ev(value)
  assert.equal(result.ok, true)
  return result as DeclaredReferenceTemporalAssociationSuccess
}
const failOf = (value: unknown, failureCode: string): void =>
  assert.deepEqual(ev(value), { ok: false, failureCode })
const revokedProxy = (target: object): object => {
  const { proxy, revoke } = Proxy.revocable(target, {}); revoke(); return proxy
}
/** An object whose named keys are counting getters, in the given key order. */
function counted(keys: readonly string[], values: Loose, log: string[], counts: Loose): Loose {
  const host: Loose = {}
  for (const key of keys) {
    counts[key] = 0
    Object.defineProperty(host, key, { enumerable: true, configurable: true,
      get() { counts[key] = (counts[key] as number) + 1; log.push(key); return values[key] } })
  }
  return host
}
// ─── A. hostile capture boundary ────────────────────────────────

test("h1b2a: unreadable, mistyped and array inputs fail closed at every level", () => {
  for (const bad of [null, undefined, "x", 7, true, Symbol("s"), () => 1, []]) failOf(bad, "invalid_input")
  for (const bad of [null, "x", 7, []]) {
    failOf(input(bad, obs()), "invalid_input")
    failOf(input(ref(), bad), "invalid_input")
  }
  failOf(revokedProxy({}), "input_unreadable")
  failOf(input(revokedProxy(ref()), obs()), "input_unreadable")
  failOf(input(ref(), revokedProxy(obs())), "input_unreadable")
  const boom = (): never => { throw new Error(SA) }
  failOf(new Proxy({}, { ownKeys: boom }), "input_unreadable")
  failOf(input(new Proxy(ref(), { ownKeys: boom }), obs()), "input_unreadable")
  failOf(input(ref(), new Proxy(obs(), { getOwnPropertyDescriptor: boom })), "input_unreadable")
  failOf(input({ ...ref(), get subjectRef(): string { return boom() } }, obs()), "input_unreadable")
  failOf(input(ref(), { ...obs(), get recordedAt(): string { return boom() } }), "input_unreadable")
})

test("h1b2a: unknown, symbol and inherited own keys are refused by name", () => {
  failOf({ ...(input() as Loose), extra: 1 }, "unknown_field")
  failOf(input({ ...ref(), extra: 1 }, obs()), "unknown_field")
  failOf(input(ref(), { ...obs(), extra: 1 }), "unknown_field")
  failOf({ ...(input() as Loose), [Symbol("s")]: 1 }, "unknown_field")
  failOf(input({ ...ref(), [Symbol("s")]: 1 }, obs()), "unknown_field")
  failOf(input(ref(), { ...obs(), [Symbol("s")]: 1 }), "unknown_field")
  failOf({ declaredReference: ref() }, "missing_field")
  failOf({ temporalObservation: obs() }, "missing_field")
  failOf(Object.create(input() as object), "missing_field")
  failOf(input(Object.create(ref()), obs()), "missing_field")
  failOf(input(ref(), Object.create(obs())), "missing_field")
  for (const key of REFERENCE_KEYS) {
    const partial = ref(); delete partial[key]; failOf(input(partial, obs()), "missing_field")
  }
  for (const key of OBSERVATION_KEYS) {
    const partial = obs(); delete partial[key]; failOf(input(ref(), partial), "missing_field")
  }
})

test("h1b2a: every accepted property is read exactly once, in fixed order, unknowns never", () => {
  const log: string[] = []
  const counts: Loose = {}
  const topLog: string[] = []
  const top = counted(["declaredReference", "temporalObservation"], {
    declaredReference: counted(REFERENCE_KEYS, ref(), log, counts),
    temporalObservation: counted(OBSERVATION_KEYS, obs(), log, counts),
  }, topLog, {})
  assert.equal(okOf(top).ok, true)
  assert.deepEqual(topLog, ["declaredReference", "temporalObservation"])
  assert.deepEqual(log, [...REFERENCE_KEYS, ...OBSERVATION_KEYS])
  for (const key of [...REFERENCE_KEYS, ...OBSERVATION_KEYS]) assert.equal(counts[key], 1, key)
  let reads = 0
  const poison = { enumerable: true, configurable: true, get() { reads += 1; return SA } }
  const hostileReference = ref()
  Object.defineProperty(hostileReference, "extra", poison)
  failOf(input(hostileReference, obs()), "unknown_field")
  const hostileTop = input() as Loose
  Object.defineProperty(hostileTop, "extra", poison)
  failOf(hostileTop, "unknown_field")
  assert.equal(reads, 0)
})
// ─── B. mandatory detached self-pair construction ───────────────

test("h1b2a: caller objects never reach a predecessor and cannot diverge between sides", () => {
  const once = (value: unknown): PropertyDescriptor => {
    let seen = 0
    return { enumerable: true, configurable: true,
      get() { seen += 1; if (seen > 1) throw new Error(SA); return value } }
  }
  const declaredReference: Loose = {}
  for (const key of REFERENCE_KEYS) Object.defineProperty(declaredReference, key, once(ref()[key]))
  const temporalObservation: Loose = {}
  for (const key of OBSERVATION_KEYS) Object.defineProperty(temporalObservation, key, once(obs()[key]))
  assert.equal(okOf(input(declaredReference, temporalObservation)).temporalBoundaryStatus, "fully_bounded")
  let calls = 0
  const diverging = ref()
  Object.defineProperty(diverging, "subjectRef", { enumerable: true, configurable: true,
    get() { calls += 1; return calls === 1 ? SA : "SUBJz" } })
  assert.equal(okOf(input(diverging, obs())).ok, true)
  assert.equal(calls, 1)
})

test("h1b2a: the source builds two distinct detached records per predecessor", () => {
  const text = source()
  const pairs = [...text.matchAll(
    /left: detachedRecord\(([A-Z_]+), (\w+)\.values\),\s*right: detachedRecord\(\1, \2\.values\),/g)]
  assert.equal(pairs.length, 2)
  assert.deepEqual(pairs.map((match) => match[1]), ["REFERENCE_KEYS", "OBSERVATION_KEYS"])
  for (const raw of ["declaredReferenceRaw", "temporalObservationRaw"]) {
    assert.equal(text.includes(`captureOwn(${raw}, `), true)
    assert.doesNotMatch(text, new RegExp(`(left|right):\\s*${raw}\\b`))
  }
  for (const [call, argument] of [["evaluateDeclaredRevisionReferenceRelation", "referencePairInput"],
    ["evaluateTemporalRelation", "temporalPairInput"]] as const) {
    assert.deepEqual([...text.matchAll(new RegExp(`${call}\\(\\s*([A-Za-z]+)`, "g"))]
      .map((match) => match[1]).filter((name) => name !== call), [argument])
  }
  assert.match(text, /const record: Record<string, unknown> = \{\}/)
  assert.match(text, /return Object\.freeze\(record\)/)
  assert.match(text, /snapshotValidatedDeclaredRevisionReferenceRelation\(referenceResult, referencePairInput\)/)
  assert.match(text, /snapshotValidatedTemporalRelationResult\(temporalResult, temporalPairInput\)/)
  assert.match(text, /const reference1 = referenceAttestation\.snapshot/)
  assert.match(text, /const temporal1 = temporalAttestation\.snapshot/)
})
// ─── C. H1B1 composition ────────────────────────────────────────

test("h1b2a: H1B1 owns reference and basis validation; every rejection is one opaque code", () => {
  assert.equal(okOf(input()).referenceContractCheck, "accepted_for_this_call")
  for (const bad of ["", "has space", "a/b", "a.b", "x".repeat(129), 7, null, true, ["x"], new String(SA)]) {
    failOf(input(ref({ subjectRef: bad }), obs()), "reference_contract_rejected")
    failOf(input(ref({ revisionRef: bad }), obs()), "reference_contract_rejected")
  }
  for (const basis of ["url", "provider_object_id", "latest_timestamp", "array_position",
    "semantic_similarity", "verified", "", null, 7]) {
    failOf(input(ref({ identityBasis: basis }), obs()), "reference_contract_rejected")
  }
  failOf(input(ref({ subjectRef: ` ${SA}` }), obs()), "reference_contract_rejected")
  const text = source()
  for (const literal of ['declaredSubjectRefRelation !== "same_declared_ref"',
    'declaredLogicalClaimRefRelation !== "same_declared_ref"',
    'declaredRevisionRefRelation !== "same_declared_ref"', "referenceEqualityOnly !== true",
    "basisVerifiedHere !== false", 'identityAuthority !== "none"',
    'immutableRevisionIdentity !== "not_established"', 'logicalClaimContinuity !== "not_established"',
    'claimBinding !== "not_established"', 'transitionEvidence !== "not_established"',
    'supersessionOrder !== "not_established"', 'correctionRelation !== "not_established"']) {
    assert.equal(text.includes(literal), true, `missing H1B1 signature check: ${literal}`)
  }
  const serialized = JSON.stringify(okOf(input()))
  for (const banned of ["same_declared_ref", "different_declared_ref", "same_subject", "same_claim",
    "same_revision", "verified_identity", "canonical_identity", "authoritative_identity"]) {
    assert.equal(serialized.includes(banned), false, banned)
  }
})
// ─── D. H1A composition ─────────────────────────────────────────

test("h1b2a: H1A owns instant, interval and ordering validation", () => {
  for (const bad of ["", "2026-01-01", "2026-01-01T00:00:00Z", "2026-02-30T00:00:00.000Z",
    "2026-01-01T00:00:00.000+09:00", 7, true, ["x"], new String(T1)]) {
    failOf(input(ref(), obs({ validFrom: bad })), "temporal_contract_rejected")
    failOf(input(ref(), obs({ observedAt: bad })), "temporal_contract_rejected")
  }
  failOf(input(ref(), obs({ observedAt: null })), "temporal_contract_rejected")
  failOf(input(ref(), obs({ recordedAt: null })), "temporal_contract_rejected")
  failOf(input(ref(), obs({ validFrom: T2, validTo: T1 })), "temporal_contract_rejected")
  failOf(input(ref(), obs({ observedAt: T4, recordedAt: T3 })), "temporal_contract_rejected")
})

test("h1b2a: boundary status follows H1A's verdict and null stays unknown", () => {
  assert.equal(okOf(input()).temporalBoundaryStatus, "fully_bounded")
  assert.equal(okOf(input(ref(), obs({ validFrom: T1, validTo: T1 }))).temporalBoundaryStatus, "fully_bounded")
  for (const over of [{ validFrom: null }, { validTo: null }, { validFrom: null, validTo: null }]) {
    const result = okOf(input(ref(), obs(over)))
    assert.equal(result.temporalBoundaryStatus, "boundary_unknown")
    assert.equal(result.reasonCodes.includes("valid_interval_boundary_unknown"), true)
    assert.equal(result.reasonCodes.includes("valid_interval_fully_bounded"), false)
  }
  const serialized = JSON.stringify([okOf(input(ref(), obs({ validTo: null }))), okOf(input())])
  for (const banned of ["open", "current", "ongoing", "still_valid", "unbounded", "infinity",
    "eligible", "latest", "preferred"]) assert.equal(serialized.includes(banned), false, banned)
  const text = source()
  for (const literal of ["validTimeRelation !== expectedValidTime", 'observedTimeRelation !== "same_instant"',
    'recordedTimeRelation !== "same_instant"', 'arrivalClassification !== "unresolved"',
    'transitionEvidence !== "not_established"', 'supersessionOrder !== "not_established"']) {
    assert.equal(text.includes(literal), true, `missing H1A signature check: ${literal}`)
  }
  assert.match(text, /const expectedValidTime = validFrom !== null && validTo !== null \? "same_interval" : "unresolved"/)
  assert.equal(text.includes("/^"), false)
  for (const banned of ["Date.parse", "new Date", "getTime(", "Date.now", "toISOString"]) {
    assert.equal(text.includes(banned), false, banned)
  }
  for (const field of [...OBSERVATION_KEYS, "expectedValidTime"]) {
    assert.doesNotMatch(text, new RegExp(`${field}\\s*(<=|>=|<|>)[^=]`), field)
    assert.doesNotMatch(text, new RegExp(`(<=|>=|<|>)\\s*${field}`), field)
  }
})
// ─── E. failure precedence ──────────────────────────────────────

test("h1b2a: the documented precedence table decides every cross-invalid input", () => {
  const badRef = ref({ subjectRef: "bad ref" })
  const badObs = obs({ observedAt: "nope" })
  failOf(revokedProxy({ declaredReference: badRef, temporalObservation: badObs }), "input_unreadable")
  failOf({ declaredReference: badRef, temporalObservation: badObs, extra: 1 }, "unknown_field")
  failOf({ declaredReference: badRef }, "missing_field")
  failOf(input({ ...badRef, extra: 1 }, { ...badObs, extra: 1 }), "unknown_field")
  const missingRef = ref(); delete missingRef.subjectRef
  failOf(input(missingRef, { ...badObs, extra: 1 }), "missing_field")
  failOf(input(revokedProxy(badRef), revokedProxy(badObs)), "input_unreadable")
  failOf(input(badRef, { ...badObs, extra: 1 }), "unknown_field")
  const missingObs = obs(); delete missingObs.validTo
  failOf(input(badRef, missingObs), "missing_field")
  failOf(input(badRef, revokedProxy(badObs)), "input_unreadable")
  failOf(input(badRef, badObs), "reference_contract_rejected")
  failOf(input(ref(), badObs), "temporal_contract_rejected")
  const text = source()
  const at = (needle: string, from = 0): number => {
    const index = text.indexOf(needle, from)
    assert.notEqual(index, -1, needle)
    return index
  }
  const attest = 'fail("predecessor_attestation_rejected")'
  const sign = 'fail("predecessor_signature_mismatch")'
  at(sign, at(attest, at('fail("temporal_contract_rejected")',
    at(sign, at(attest, at('fail("reference_contract_rejected")'))))))
  const contract = read(CONTRACT)
  for (const step of ["| 7 | H1B1 evaluation |", "| 8 | H1B1 exact-pair attestation |",
    "| 9 | H1B1 self-signature |", "| 10 | H1A evaluation |",
    "| 11 | H1A exact-pair attestation |", "| 12 | H1A self-signature |"]) {
    assert.equal(contract.includes(step), true, step)
  }
})
// ─── F. output safety ───────────────────────────────────────────

const SUCCESS_KEYS = ["ok", "candidateOnly", "shadowOnly", "humanReviewRequired", "declaredAssociation",
  "associationAuthority", "processLocalComposition", "referenceContractCheck", `${H1A_MOD}Check`,
  "temporalBoundaryStatus", "identityAuthority", "basisVerifiedHere", "immutableRevisionIdentity",
  "logicalClaimContinuity", "claimBinding", "temporalClaimBinding", "transitionEvidence",
  "correctionRelation", "supersessionOrder", "reasonCodes", "narrative"]
const NOT_ESTABLISHED = ["immutableRevisionIdentity", "logicalClaimContinuity", "claimBinding",
  "temporalClaimBinding", "transitionEvidence", "correctionRelation", "supersessionOrder"]

/** Descriptor-level recursion: symbols, non-enumerables, accessors, prototypes, frozenness. */
function scan(value: unknown, at: string, out: string[] = []): string[] {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" || typeof value === "bigint") out.push(`${at}: numeric`)
    if (typeof value === "symbol") out.push(`${at}: symbol`)
    if (typeof value === "string" && /\d/.test(value)) out.push(`${at}: digit in string`)
    return out
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== Array.prototype) out.push(`${at}: prototype`)
  if (!Object.isFrozen(value)) out.push(`${at}: not frozen`)
  if (Object.getOwnPropertySymbols(value).length > 0) out.push(`${at}: symbol key`)
  for (const key of Object.getOwnPropertyNames(value)) {
    if (Array.isArray(value) && key === "length") continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined) continue
    if (descriptor.get !== undefined || descriptor.set !== undefined) out.push(`${at}.${key}: accessor`)
    if (!descriptor.enumerable && !Array.isArray(value)) out.push(`${at}.${key}: non-enumerable`)
    scan((value as Loose)[key], `${at}.${key}`, out)
  }
  return out
}

test("h1b2a: successes carry the exact closed shape and only the boundary varies", () => {
  const bounded = okOf(input())
  const unknownBoundary = okOf(input(ref(), obs({ validTo: null })))
  for (const result of [bounded, unknownBoundary]) {
    assert.deepEqual(Object.getOwnPropertyNames(result), SUCCESS_KEYS)
    assert.equal(result.declaredAssociation, "caller_declared_named_field_co_submission")
    assert.equal(result.associationAuthority, "declaration_only")
    assert.equal(result.processLocalComposition, "established")
    assert.equal(result.identityAuthority, "none")
    assert.equal(result.basisVerifiedHere, false)
    assert.equal(result.candidateOnly && result.shadowOnly && result.humanReviewRequired, true)
    for (const field of ["referenceContractCheck", `${H1A_MOD}Check`]) {
      assert.equal((result as unknown as Loose)[field], "accepted_for_this_call", field)
    }
    for (const field of NOT_ESTABLISHED) {
      assert.equal((result as unknown as Loose)[field], "not_established", field)
    }
    assert.equal(result.narrative.length, result.reasonCodes.length)
    assert.equal(new Set(result.narrative).size, result.narrative.length)
    for (const sentence of result.narrative) assert.match(sentence, /^[A-Za-z ,.'-]+\.$/)
  }
  assert.deepEqual(bounded.reasonCodes, ["caller_declared_named_field_co_submission",
    "reference_contract_accepted_for_this_call", "temporal_contract_accepted_for_this_call",
    "valid_interval_fully_bounded", "declaration_only_no_association_authority",
    "process_local_composition_only", "identity_authority_none", "declared_basis_not_verified_here",
    "immutable_revision_identity_not_established", "logical_claim_continuity_not_established",
    "claim_binding_not_established", "temporal_claim_binding_not_established",
    "transition_evidence_not_established", "correction_relation_not_established",
    "supersession_order_not_established"])
  assert.deepEqual(unknownBoundary.reasonCodes.filter((code) => !bounded.reasonCodes.includes(code)),
    ["valid_interval_boundary_unknown"])
})

test("h1b2a: no output carries a caller value, a numeric leaf or overstated vocabulary", () => {
  const genuine = okOf(input())
  const bound = okOf(input())
  for (const output of [genuine, okOf(input(ref(), obs({ validFrom: null }))), ev(null),
    ev(input(ref({ subjectRef: "bad ref" }), obs())), ev(input(ref(), obs({ validTo: "x" }))),
    snap(genuine, undefined), snap({}, undefined), snap(bound, bound)]) {
    assert.deepEqual(scan(output, "out"), [])
    const serialized = JSON.stringify(output)
    for (const marker of [SA, CA, RA, BASIS, T1, T2, T3, T4]) {
      assert.equal(serialized.includes(marker), false, marker)
    }
    for (const banned of ["verified_association", "verified_claim", "verified_revision", "bound_claim",
      "bound_revision", "authoritative", "canonical_claim_binding", "truth", "conflict", "score",
      "confidence", "rank", "digest", "provider", "actor"]) {
      assert.equal(serialized.includes(banned), false, banned)
    }
  }
  const failure = ev(input(ref(), obs({ observedAt: "x" })))
  assert.deepEqual(Object.getOwnPropertyNames(failure), ["ok", "failureCode"])
  assert.equal(Object.isFrozen(failure), true)
  const basisFailure = JSON.stringify(ev(input(ref({ identityBasis: "url" }), obs())))
  for (const code of ["invalid_instant", "invalid_valid_interval", "recorded_before_observed",
    "invalid_reference", "forbidden_identity_basis", "unsupported_identity_basis"]) {
    assert.equal(JSON.stringify(failure).includes(code), false, code)
    assert.equal(basisFailure.includes(code), false, code)
  }
})
// ─── G. attestation ─────────────────────────────────────────────

test("h1b2a: attestation accepts only the exact result with the exact input", () => {
  const one = input()
  const result = okOf(one)
  const accepted = snap(result, one)
  assert.equal(accepted.ok, true)
  assert.equal(accepted.ok && accepted.snapshot.temporalBoundaryStatus, "fully_bounded")
  assert.equal(accepted.ok && "ok" in accepted.snapshot, false)
  const reject = (r: unknown, i: unknown): void =>
    assert.deepEqual(snap(r, i), { ok: false, failureCode: "attestation_rejected" })
  reject({ ...result }, one)
  reject(structuredClone(result), one)
  reject(JSON.parse(JSON.stringify(result)), one)
  reject(Object.create(result), one)
  reject(new Proxy(result, {}), one)
  reject(revokedProxy({ ...result }), one)
  reject({ ok: true, declaredAssociation: "caller_declared_named_field_co_submission" }, one)
  reject(ev(null), one)
  reject(null, one)
  reject(undefined, one)
  reject(result, { ...(one as Loose) })
  reject(result, structuredClone(one))
  reject(result, input())
  const other = input()
  const otherResult = okOf(other)
  reject(result, other)
  reject(otherResult, one)
  const again = okOf(one)
  assert.notEqual(again, result)
  assert.equal(snap(again, one).ok, true)
  assert.equal(snap(result, one).ok, true)
  reject({ ...again }, one)
})

test("h1b2a: snapshots never alias and survive later mutation", () => {
  const declaredReference = ref()
  const one = input(declaredReference, obs()) as DeclaredReferenceTemporalAssociationInput
  const result = okOf(one)
  const first = snap(result, one)
  const second = snap(result, one)
  assert.equal(first.ok && second.ok, true)
  if (!first.ok || !second.ok) return
  assert.notEqual(first, second)
  assert.notEqual(first.snapshot, second.snapshot)
  assert.notEqual(first.snapshot.reasonCodes, second.snapshot.reasonCodes)
  assert.notEqual(first.snapshot.narrative, second.snapshot.narrative)
  const before = JSON.stringify(first.snapshot)
  declaredReference.subjectRef = "SUBJz"
  assert.throws(() => { (result.reasonCodes as string[]).push("identity_authority_none") })
  assert.throws(() => { (first.snapshot.reasonCodes as string[]).push("identity_authority_none") })
  const after = snap(result, one)
  assert.equal(after.ok, true)
  if (after.ok) assert.equal(JSON.stringify(after.snapshot), before)
})
// ─── H. resolved consumer graph ─────────────────────────────────

const git = (...args: string[]): string => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim()
const SOURCES = git("ls-files").split("\n").filter((file) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file))

type Refs = { readonly specifiers: readonly string[]; readonly nonLiteral: number }
/** Real parse: only genuine module specifiers count, so prose never does. */
function analyze(file: string, text: string): Refs {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const specifiers: string[] = []
  let nonLiteral = 0
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text)
      else nonLiteral += 1
    }
    if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const required = ts.isIdentifier(node.expression) && node.expression.text === "require"
      if (dynamic || required) {
        const [argument] = node.arguments
        if (node.arguments.length === 1 && argument !== undefined && ts.isStringLiteralLike(argument)) {
          specifiers.push(argument.text)
        } else nonLiteral += 1
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return { specifiers, nonLiteral }
}
/** Repository-relative targets of one specifier; bare package names resolve nowhere. */
function targets(from: string, specifier: string): string[] {
  if (specifier.startsWith(".")) {
    return [path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))]
  }
  if (specifier.startsWith("@/")) return [`app/${specifier.slice(2)}`, specifier.slice(2)]
  return []
}
const reaches = (file: string, text: string, dir: string): boolean =>
  analyze(file, text).specifiers.some((specifier) =>
    targets(file, specifier).some((target) => target === dir || target.startsWith(`${dir}/`)))
/** Consumers OUTSIDE the module's own files: its two sources and its own suite. */
const consumersOf = (dir: string, ownTest: string): string[] =>
  SOURCES.filter((file) => !moduleFiles(dir).includes(file) && file !== ownTest)
    .filter((file) => reaches(file, read(file), dir)).sort()

test("h1b2a: exactly one reviewed internal consumer for H1A and H1B1, and one for H1B2A", () => {
  assert.equal(SOURCES.length > 0, true)
  assert.deepEqual(consumersOf(H1A_DIR, H1A_TEST), [...H1B2A_FILES].sort())
  assert.deepEqual(consumersOf(H1B1_DIR, H1B1_TEST), [...H1B2A_FILES].sort())
  assert.deepEqual(consumersOf(H1B2A_DIR, ""), [H1B2A_TEST])
  assert.deepEqual(SOURCES.filter((file) => analyze(file, read(file)).nonLiteral > 0), [])
  assert.deepEqual(analyze(H1B2A_FILES[1], read(H1B2A_FILES[1])).specifiers,
    [`../${H1B1_MOD}/types.ts`, `../${H1A_MOD}/types.ts`])
  assert.deepEqual(analyze(H1B2A_FILES[0], read(H1B2A_FILES[0])).specifiers,
    ["./types.ts", `../${H1B1_MOD}/evaluate.ts`, `../${H1A_MOD}/evaluate.ts`])
  assert.deepEqual(analyze(H1B2A_TEST, read(H1B2A_TEST)).specifiers.filter((s) => s.startsWith(".")),
    [`../${H1B2A_DIR}/evaluate.ts`, `../${H1B2A_DIR}/types.ts`])
  for (const token of [H1A_MOD, H1B1_MOD]) assert.equal(read(H1B2A_TEST).includes(token), false, token)
  for (const [dir, ownTest] of [[H1A_DIR, H1A_TEST], [H1B1_DIR, H1B1_TEST],
    [H1B2A_DIR, H1B2A_TEST]] as const) {
    assert.equal(SOURCES.includes(ownTest), true, ownTest)
    assert.equal(reaches(ownTest, read(ownTest), dir), true, dir)
  }
})

test("h1b2a: the consumer graph rejects every route and accepts prose and unrelated files", () => {
  const probe = (text: string, file = "app/lib/probe.ts"): boolean => reaches(file, text, H1A_DIR)
  for (const text of [
    `import { evaluateTemporalRelation } from "./phase6/${H1A_MOD}/evaluate.ts"`,
    `import type { TemporalRelationInput } from "./phase6/${H1A_MOD}/types.ts"`,
    `export { evaluateTemporalRelation } from "./phase6/${H1A_MOD}/evaluate.ts"`,
    `export * from "./phase6/${H1A_MOD}/evaluate.ts"`,
    `const m = await import("./phase6/${H1A_MOD}/evaluate.ts")`,
    `const m = require("./phase6/${H1A_MOD}/evaluate.ts")`,
    `import x from "@/lib/phase6/${H1A_MOD}/evaluate.ts"`,
    `import x from "../../lib/phase6/${H1A_MOD}/evaluate.ts"`,
  ]) assert.equal(probe(text) || probe(text, "app/a/b/probe.ts"), true, text)
  assert.equal(reaches(`${H1A_DIR}/sneak.ts`, 'import x from "./evaluate.ts"', H1A_DIR), true)
  for (const dir of [H1A_DIR, H1B1_DIR, H1B2A_DIR]) {
    assert.deepEqual(readdirSync(`${ROOT}${dir}`).sort(), ["evaluate.ts", "types.ts"])
  }
  for (const text of [`const m = await import("./phase6/${H1A_MOD}" + "/evaluate.ts")`,
    `const m = await import("./phase6/".concat("${H1A_MOD}/evaluate.ts"))`,
    "const m = await import(specifier)", "const m = require(`./phase6/${name}/evaluate.ts`)"]) {
    assert.equal(analyze("app/lib/probe.ts", text).nonLiteral > 0, true, text)
    assert.equal(probe(text), false, text)
  }
  for (const text of [`// ${H1A_MOD} is documented in docs/HTPE_H1A_TEMPORAL_CONTRACT.md`,
    `const label = "${H1A_MOD}"`, `/** ${H1B1_MOD} and ${H1A_MOD} */ export const x = 1`,
    'import { readFileSync } from "node:fs"', 'import x from "./unrelated.ts"']) {
    assert.equal(probe(text), false, text)
    assert.equal(reaches("app/lib/probe.ts", text, H1B1_DIR), false, text)
  }
  const self = read(H1B2A_TEST)
  for (const historical of [`rev-${"parse"}`, `rev-${"list"}`, `merge-${"base"}`,
    `git("${"log"}"`, `git("${"show"}"`, `git("${"diff"}"`]) {
    assert.equal(self.includes(historical), false, historical)
  }
  assert.equal(self.includes(`git("ls-${"files"}")`), true)
})
// ─── I. authority preservation ──────────────────────────────────

test("h1b2a: predecessor authority, H0 and PR #211 boundaries are unchanged", () => {
  for (const dir of [H1A_DIR, H1B1_DIR]) {
    assert.deepEqual(analyze(`${dir}/evaluate.ts`, read(`${dir}/evaluate.ts`)).specifiers, ["./types.ts"])
    assert.deepEqual(analyze(`${dir}/types.ts`, read(`${dir}/types.ts`)).specifiers, [])
  }
  for (const document of ["docs/HTPE_H1A_TEMPORAL_CONTRACT.md", "docs/HTPE_H1B1_REVISION_REFERENCE_CONTRACT.md"]) {
    const contract = read(document)
    for (const required of ["SHADOW ONLY", "**Authority:** NONE", "**Production consumer:** NONE",
      "app/lib/phase6/temporalAssociation/", "authority and semantics are unchanged"]) {
      assert.equal(contract.includes(required), true, `${document}: ${required}`)
    }
  }
  const h0 = read("docs/PROVENANCE_CLAIM_CONTRACT.md")
  for (const required of ["TEST-ONLY_READ-ONLY_SHADOW_PROJECTION", "HTPE NEVER RE-DERIVES THIS AUTHORITY"]) {
    assert.equal(h0.includes(required), true, required)
  }
  assert.equal(statSync(`${ROOT}${CONTRACT}`).isFile(), true)
  const contract = read(CONTRACT)
  assert.match(contract, /^# HTPE H1B2A Declared Reference Temporal Association Contract$/m)
  for (const required of ["SHADOW ONLY", "**Authority:** NONE", "**Production consumer:** NONE",
    "**Persistence:** NONE — not authorized.", "It\n> is not a ClaimBinding and establishes no identity authority.",
    "**`null` means unknown.**", "**PR #211 is unmerged non-authority and is not authorized by this contract.**",
    "**H1B3, H2, F6B and F7** — all deferred"]) {
    assert.equal(contract.includes(required), true, `contract must state: ${required}`)
  }
  for (const file of H1B2A_FILES) {
    const text = read(file)
    assert.deepEqual(analyze(file, text).specifiers.filter((s) => !s.startsWith(".")), [])
    assert.equal(analyze(file, text).nonLiteral, 0)
    for (const banned of ["node:", "process.env", "fetch(", "Date.now", "Math.random", "globalThis["]) {
      assert.equal(text.includes(banned), false, `${file}: ${banned}`)
    }
  }
})
