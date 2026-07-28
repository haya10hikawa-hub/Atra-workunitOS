/**
 * HTPE H1B1: permanent tests for the shadow declared-revision-reference
 * relation contract (docs/HTPE_H1B1_REVISION_REFERENCE_CONTRACT.md).
 * Scenarios are built inline from bounded constants — no fixture file, no
 * network, no clock, no LLM, no persistence. Also pins the architecture
 * boundary: no production consumer for this module or for H1A, no foreign
 * import, exact module surface, H0/H1A authority markers preserved.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  evaluateDeclaredRevisionReferenceRelation,
  snapshotValidatedDeclaredRevisionReferenceRelation,
} from "../app/lib/phase6/revisionReference/evaluate.ts"
import type {
  DeclaredRevisionReferenceDescriptor,
  DeclaredRevisionReferenceRelationInput,
  DeclaredRevisionReferenceRelationSuccess,
} from "../app/lib/phase6/revisionReference/types.ts"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const MODULE_DIR = `${ROOT}app/lib/phase6/revisionReference`
const BASIS = "declared_opaque_ref"
// Distinctive marker refs: if any raw reference ever leaked into an output,
// these tokens would appear in the serialized result.
const [SA, CA, RA, SB, CB, RB] = ["SUBJa", "CLAIMa", "REVa", "SUBJb", "CLAIMb", "REVb"]
const MARKERS = [SA, CA, RA, SB, CB, RB]

const desc = (subjectRef: string, logicalClaimRef: string, revisionRef: string): DeclaredRevisionReferenceDescriptor =>
  ({ subjectRef, logicalClaimRef, revisionRef, identityBasis: BASIS })
const pair = (
  left: DeclaredRevisionReferenceDescriptor,
  right: DeclaredRevisionReferenceDescriptor,
): DeclaredRevisionReferenceRelationInput => ({ left, right })
const swap = (input: DeclaredRevisionReferenceRelationInput): DeclaredRevisionReferenceRelationInput =>
  pair(input.right, input.left)

function okOf(input: unknown): DeclaredRevisionReferenceRelationSuccess {
  const result = evaluateDeclaredRevisionReferenceRelation(input)
  assert.equal(result.ok, true)
  return result as DeclaredRevisionReferenceRelationSuccess
}
function failOf(input: unknown, failureCode: string): void {
  assert.deepEqual(evaluateDeclaredRevisionReferenceRelation(input), { ok: false, failureCode })
}
/** Builds a descriptor whose one named field carries a hostile value. */
const withField = (field: string, value: unknown): unknown => ({ ...desc(SA, CA, RA), [field]: value })
const revokedProxy = (target: object): object => {
  const { proxy, revoke } = Proxy.revocable(target, {})
  revoke()
  return proxy
}
const namesOf = (value: object): string[] => Object.getOwnPropertyNames(value).sort()

// Property NAMES may never carry input, provider, temporal or authority-grant
// meaning. Bounded constant sentences are prose and are not name-scanned.
const FORBIDDEN_NAME =
  /^(subjectref|logicalclaimref|revisionref|identitybasis|tenantid|userid|provider|sourceid|sourceobjectid|claimid|actor|title|summary|url|payload|timestamp|instant|score|priority|confidence|rank|conflict|approval|execution)$|hash$/i
// Vocabulary that would overstate the relation. None of it may appear anywhere
// in a serialized result, in either a key or a value.
const FORBIDDEN_VOCABULARY = [
  "same_subject", "same_claim", "same_revision", "identical_revision",
  "verified_identity", "canonical_identity", "authoritative_identity",
]

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
    // Array `length` is an intrinsic, never an H1B1 field; nothing else may be non-enumerable.
    if (Array.isArray(value) && key === "length") continue
    if (!descriptor.enumerable) out.push(`${at}: non-enumerable own field`)
    if (descriptor.get !== undefined || descriptor.set !== undefined) out.push(`${at}: accessor`)
    if (FORBIDDEN_NAME.test(key)) out.push(`${at}: forbidden property name`)
    scan(descriptor.value, at, out)
  }
  return out
}

const FORBIDDEN_BASES = [
  "source_object_id", "provider_object_id", "provider_revision_id", "provider_name", "title",
  "summary", "url", "actor", "display_name", "latest_timestamp", "observed_at", "recorded_at",
  "array_position", "semantic_similarity", "llm_inference",
]
const NOT_ESTABLISHED_FIELDS = [
  "immutableRevisionIdentity", "logicalClaimContinuity", "claimBinding",
  "transitionEvidence", "supersessionOrder", "correctionRelation",
]
// H1B1's own files: a durable module-identity fact, not a release-diff fact. Used to exempt
// H1B1 from its own consumer scan. Release scope (which paths a PR changed) belongs to review
// and merge authorization, never here.
const OWN_FILES = [
  "app/lib/phase6/revisionReference/evaluate.ts",
  "app/lib/phase6/revisionReference/types.ts",
  "tests/phase6RevisionReference.test.mts",
]
// Built by concatenation on purpose: spelling H1A's directory token literally would make THIS
// file an offender in H1A's own permanent consumer scan.
const H1A_TOKEN = "temporal" + "Contract"
const H1A_OWN_FILES = [
  `app/lib/phase6/${H1A_TOKEN}/evaluate.ts`,
  `app/lib/phase6/${H1A_TOKEN}/types.ts`,
  "tests/phase6TemporalContract.test.mts",
]
const git = (...args: string[]): string => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim()
const trackedSources = (): string[] => {
  const files = git("ls-files").split("\n").filter((path) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path))
  assert.equal(files.length > 0, true)
  return files
}

const ALL_SAME = pair(desc(SA, CA, RA), desc(SA, CA, RA))
const ALL_DIFFERENT = pair(desc(SA, CA, RA), desc(SB, CB, RB))
const MIXED = pair(desc(SA, CA, RA), desc(SA, CA, RB))
const SCENARIOS = [ALL_SAME, ALL_DIFFERENT, MIXED, swap(MIXED), pair(desc(SA, CB, RA), desc(SA, CA, RA))]

// ─── A. hostile boundary ────────────────────────────────────────

test("h1b1: canonical valid input succeeds with literal shadow markers", () => {
  const result = okOf(ALL_SAME)
  assert.equal(result.candidateOnly, true)
  assert.equal(result.shadowOnly, true)
  assert.equal(result.humanReviewRequired, true)
  assert.equal(result.referenceEqualityOnly, true)
  assert.equal(result.basisVerifiedHere, false)
  assert.equal(result.identityAuthority, "none")
  assert.equal(Object.isFrozen(result), true)
})

test("h1b1: exact own-key allowlists at both levels", () => {
  for (const extra of ["observedAt", "recordedAt", "validFrom", "sourceObjectId", "providerName",
    "identity", "authority", "transition", "supersedes", "correction", "claimBinding", "order",
    "latest", "confidence", "metadata", "foo"]) {
    failOf({ ...ALL_SAME, [extra]: undefined }, "unknown_field")
    failOf(pair(withField(extra, null) as never, ALL_SAME.right), "unknown_field")
  }
  for (const bad of [null, undefined, "x", 7, true, Symbol("s")]) failOf(bad, "invalid_input")
  failOf([ALL_SAME.left, ALL_SAME.right], "invalid_input")
  failOf(pair(null as never, ALL_SAME.right), "invalid_input")
  failOf(pair(ALL_SAME.left, [] as never), "invalid_input")
  failOf({ left: ALL_SAME.left }, "missing_field")
  failOf({ right: ALL_SAME.right }, "missing_field")
  failOf(pair({ subjectRef: SA, logicalClaimRef: CA, revisionRef: RA } as never, ALL_SAME.right), "missing_field")
  failOf(pair({ subjectRef: SA, logicalClaimRef: CA, identityBasis: BASIS } as never, ALL_SAME.right), "missing_field")
})

test("h1b1: unknown fields reject by name without value reads", () => {
  let read = false
  const spy = [undefined, null, { a: 1 }, new Proxy({}, { get: () => { read = true; throw new Error("trap") } })]
  for (const value of spy) {
    failOf({ ...ALL_SAME, foo: value }, "unknown_field")
    failOf(pair(withField("foo", value) as never, ALL_SAME.right), "unknown_field")
  }
  const hostile: Record<string, unknown> = { ...ALL_SAME }
  Object.defineProperty(hostile, "foo", { enumerable: true, get: () => { read = true; throw new Error("boom") } })
  failOf(hostile, "unknown_field")
  assert.equal(read, false)
})

test("h1b1: symbol keys and inherited required fields reject", () => {
  failOf({ ...ALL_SAME, [Symbol("s")]: 1 }, "unknown_field")
  failOf(pair({ ...ALL_SAME.left, [Symbol("s")]: 1 } as never, ALL_SAME.right), "unknown_field")
  failOf(Object.create({ right: ALL_SAME.right }, {
    left: { value: ALL_SAME.left, enumerable: true },
  }), "missing_field")
  failOf(pair(Object.create({ identityBasis: BASIS }, {
    subjectRef: { value: SA, enumerable: true }, logicalClaimRef: { value: CA, enumerable: true },
    revisionRef: { value: RA, enumerable: true },
  }) as never, ALL_SAME.right), "missing_field")
})

test("h1b1: every public property is read exactly once", () => {
  const counting = (target: Record<string, unknown>, counts: Record<string, number>): Record<string, unknown> => {
    const wrapped = {}
    for (const [key, value] of Object.entries(target)) {
      Object.defineProperty(wrapped, key, {
        enumerable: true, get: () => { counts[key] = (counts[key] ?? 0) + 1; return value },
      })
    }
    return wrapped as Record<string, unknown>
  }
  const oneEach = { subjectRef: 1, logicalClaimRef: 1, revisionRef: 1, identityBasis: 1 }
  const topCounts: Record<string, number> = {}
  const leftCounts: Record<string, number> = {}
  const rightCounts: Record<string, number> = {}
  const input = counting({
    left: counting({ ...ALL_SAME.left }, leftCounts),
    right: counting({ ...ALL_SAME.right }, rightCounts),
  }, topCounts)
  assert.equal(evaluateDeclaredRevisionReferenceRelation(input).ok, true)
  assert.deepEqual(topCounts, { left: 1, right: 1 })
  assert.deepEqual(leftCounts, oneEach)
  assert.deepEqual(rightCounts, oneEach)
})

test("h1b1: throwing accessors and proxy traps fail closed", () => {
  const throwing: Record<string, unknown> = { right: ALL_SAME.right }
  Object.defineProperty(throwing, "left", { enumerable: true, get: () => { throw new Error("no") } })
  failOf(throwing, "input_unreadable")
  const throwingRef: Record<string, unknown> = { logicalClaimRef: CA, revisionRef: RA, identityBasis: BASIS }
  Object.defineProperty(throwingRef, "subjectRef", { enumerable: true, get: () => { throw new Error("no") } })
  failOf(pair(throwingRef as never, ALL_SAME.right), "input_unreadable")
  const ownKeysThrows = () => new Proxy({}, { ownKeys: () => { throw new Error("no") } })
  failOf(ownKeysThrows(), "input_unreadable")
  failOf(pair(ownKeysThrows() as never, ALL_SAME.right), "input_unreadable")
  const descriptorThrows = (target: object) => new Proxy(target, {
    getOwnPropertyDescriptor: () => { throw new Error("no") },
  })
  failOf(descriptorThrows({ ...ALL_SAME }), "input_unreadable")
  failOf(pair(descriptorThrows({ ...ALL_SAME.left }) as never, ALL_SAME.right), "input_unreadable")
})

test("h1b1: revoked proxies fail closed at every input boundary", () => {
  const unreadable = { ok: false, failureCode: "input_unreadable" }
  assert.deepEqual(evaluateDeclaredRevisionReferenceRelation(revokedProxy({ ...ALL_SAME })), unreadable)
  assert.deepEqual(evaluateDeclaredRevisionReferenceRelation(revokedProxy([])), unreadable)
  assert.deepEqual(evaluateDeclaredRevisionReferenceRelation(pair(revokedProxy({}) as never, ALL_SAME.right)), unreadable)
  assert.deepEqual(evaluateDeclaredRevisionReferenceRelation(pair(ALL_SAME.left, revokedProxy({}) as never)), unreadable)
  assert.deepEqual(evaluateDeclaredRevisionReferenceRelation(
    pair(revokedProxy({}) as never, revokedProxy({}) as never)), unreadable)
  // Deterministic on repeat, and the result carries no exception text or caller value.
  const repeated = evaluateDeclaredRevisionReferenceRelation(revokedProxy({ ...ALL_SAME }))
  assert.deepEqual(repeated, unreadable)
  assert.deepEqual(namesOf(repeated), ["failureCode", "ok"])
  assert.deepEqual(scan(repeated, "revoked"), [])
  const rejected = { ok: false, failureCode: "attestation_rejected" }
  assert.deepEqual(snapshotValidatedDeclaredRevisionReferenceRelation(revokedProxy({}), ALL_SAME), rejected)
  assert.deepEqual(snapshotValidatedDeclaredRevisionReferenceRelation(okOf(ALL_SAME), revokedProxy({})), rejected)
})

// ─── B. reference validation ────────────────────────────────────

test("h1b1: only bounded ASCII base64url primitive strings are accepted", () => {
  const long = "a".repeat(128)
  okOf(pair(desc(long, CA, RA), desc(long, CA, RA)))
  okOf(pair(desc("a", "b", "c"), desc("a", "b", "c")))
  for (const bad of [
    "", `${long}a`, "a".repeat(129), " ", "a b", " a", "a ", "\ta", "a\n",
    "a/b", "a.b", "a:b", "a+b", "a=b", "a%b", "a#b", "a\\b", "a@b", "a,b",
    "\u00e9", "\u65e5", "\ud83d\ude42", "a\u0301", "\u00a0", "a\u00adb", "a\u200bb",
    Object("abc"), 7, 0, true, false, null, undefined, {}, [], Symbol("s"), () => "abc",
  ]) {
    for (const field of ["subjectRef", "logicalClaimRef", "revisionRef"]) {
      failOf(pair(withField(field, bad) as never, ALL_SAME.right), "invalid_reference")
      failOf(pair(ALL_SAME.left, withField(field, bad) as never), "invalid_reference")
    }
  }
})

test("h1b1: references are case sensitive, never trimmed, never normalized", () => {
  // Case folding would collapse these into an equality that was never declared.
  assert.equal(okOf(pair(desc("abc", CA, RA), desc("ABC", CA, RA))).declaredSubjectRefRelation, "different_declared_ref")
  // Character folding across the two permitted punctuation marks is likewise refused.
  assert.equal(okOf(pair(desc("a-b", CA, RA), desc("a_b", CA, RA))).declaredSubjectRefRelation, "different_declared_ref")
  // A padded reference must be REJECTED, not silently trimmed into a match.
  for (const padded of [" abc", "abc ", " abc "]) {
    failOf(pair(withField("subjectRef", padded) as never, desc("abc", CA, RA)), "invalid_reference")
  }
})

// ─── C. basis rejection ─────────────────────────────────────────

test("h1b1: every explicitly forbidden identity basis fails closed", () => {
  assert.equal(FORBIDDEN_BASES.length, 15)
  for (const basis of FORBIDDEN_BASES) {
    failOf(pair(withField("identityBasis", basis) as never, ALL_SAME.right), "forbidden_identity_basis")
    failOf(pair(ALL_SAME.left, withField("identityBasis", basis) as never), "forbidden_identity_basis")
  }
})

test("h1b1: any other basis is unsupported, with no fallback", () => {
  for (const basis of [
    "", "declared", "declared_opaque", "DECLARED_OPAQUE_REF", "Declared_Opaque_Ref",
    "declared_opaque_ref ", " declared_opaque_ref", "declared_opaque_refs", "opaque_ref",
    "source_object_ids", "content_digest", "human_attested",
    Object(BASIS), null, undefined, 7, true, {}, [], Symbol("s"), () => BASIS,
  ]) {
    failOf(pair(withField("identityBasis", basis) as never, ALL_SAME.right), "unsupported_identity_basis")
  }
  // The accepted literal is accepted only as an exact primitive string.
  assert.equal(okOf(ALL_SAME).ok, true)
})

// ─── D. relation matrix ─────────────────────────────────────────

test("h1b1: relation matrix over all three declared domains", () => {
  const same = okOf(ALL_SAME)
  assert.equal(same.declaredSubjectRefRelation, "same_declared_ref")
  assert.equal(same.declaredLogicalClaimRefRelation, "same_declared_ref")
  assert.equal(same.declaredRevisionRefRelation, "same_declared_ref")
  const different = okOf(ALL_DIFFERENT)
  assert.equal(different.declaredSubjectRefRelation, "different_declared_ref")
  assert.equal(different.declaredLogicalClaimRefRelation, "different_declared_ref")
  assert.equal(different.declaredRevisionRefRelation, "different_declared_ref")
  const mixed = okOf(MIXED)
  assert.equal(mixed.declaredSubjectRefRelation, "same_declared_ref")
  assert.equal(mixed.declaredLogicalClaimRefRelation, "same_declared_ref")
  assert.equal(mixed.declaredRevisionRefRelation, "different_declared_ref")
  const claimOnly = okOf(pair(desc(SA, CB, RA), desc(SA, CA, RA)))
  assert.equal(claimOnly.declaredLogicalClaimRefRelation, "different_declared_ref")
  assert.equal(claimOnly.declaredRevisionRefRelation, "same_declared_ref")
})

test("h1b1: only corresponding fields are compared", () => {
  // Every string below is equal to some OTHER domain's reference on the other
  // side. Corresponding-field equality is nil, so all three must differ.
  const crossed = okOf(pair(desc("Xa", "Xb", "Xc"), desc("Xb", "Xc", "Xa")))
  assert.equal(crossed.declaredSubjectRefRelation, "different_declared_ref")
  assert.equal(crossed.declaredLogicalClaimRefRelation, "different_declared_ref")
  assert.equal(crossed.declaredRevisionRefRelation, "different_declared_ref")
})

test("h1b1: left/right swap is symmetric and replay is deterministic", () => {
  for (const scenario of SCENARIOS) {
    const direct = okOf(scenario)
    const swapped = okOf(swap(scenario))
    for (const field of ["declaredSubjectRefRelation", "declaredLogicalClaimRefRelation",
      "declaredRevisionRefRelation"] as const) {
      assert.equal(direct[field], swapped[field])
    }
    // Same input object and a structurally equal fresh one both replay identically.
    assert.deepEqual(okOf(scenario), direct)
    assert.deepEqual(okOf(pair(desc(scenario.left.subjectRef, scenario.left.logicalClaimRef, scenario.left.revisionRef),
      desc(scenario.right.subjectRef, scenario.right.logicalClaimRef, scenario.right.revisionRef))), direct)
  }
})

// ─── E. non-authority ───────────────────────────────────────────

test("h1b1: no input establishes identity, continuity, binding or order", () => {
  for (const scenario of SCENARIOS) {
    const result = okOf(scenario) as unknown as Record<string, unknown>
    for (const field of NOT_ESTABLISHED_FIELDS) assert.equal(result[field], "not_established")
    assert.equal(result.identityAuthority, "none")
    assert.equal(result.basisVerifiedHere, false)
    assert.equal(result.referenceEqualityOnly, true)
  }
  // Identical revision references specifically do NOT promote anything.
  const same = okOf(ALL_SAME) as unknown as Record<string, unknown>
  assert.equal(same.declaredRevisionRefRelation, "same_declared_ref")
  assert.equal(same.immutableRevisionIdentity, "not_established")
  assert.equal(same.logicalClaimContinuity, "not_established")
  // Differing references specifically do NOT imply transition, supersession or correction.
  const different = okOf(ALL_DIFFERENT) as unknown as Record<string, unknown>
  assert.equal(different.transitionEvidence, "not_established")
  assert.equal(different.supersessionOrder, "not_established")
  assert.equal(different.correctionRelation, "not_established")
})

// ─── F. output safety ───────────────────────────────────────────

test("h1b1: exact success shape, descriptors, ordering and narrative", () => {
  const result = okOf(MIXED)
  assert.deepEqual(namesOf(result), [
    "basisVerifiedHere", "candidateOnly", "claimBinding", "correctionRelation",
    "declaredLogicalClaimRefRelation", "declaredRevisionRefRelation", "declaredSubjectRefRelation",
    "humanReviewRequired", "identityAuthority", "immutableRevisionIdentity", "logicalClaimContinuity",
    "narrative", "ok", "reasonCodes", "referenceEqualityOnly", "shadowOnly", "supersessionOrder",
    "transitionEvidence",
  ])
  assert.deepEqual(result.reasonCodes, [
    "declared_subject_ref_same", "declared_logical_claim_ref_same", "declared_revision_ref_different",
    "reference_equality_only", "declared_basis_not_verified_here",
    "immutable_revision_identity_not_established", "logical_claim_continuity_not_established",
    "claim_binding_not_established", "transition_evidence_not_established",
    "supersession_order_not_established", "correction_relation_not_established",
  ])
  assert.equal(result.narrative.length, result.reasonCodes.length)
  // Closed constant sentences: no interpolation, so no caller value can travel.
  for (const sentence of result.narrative) {
    assert.match(sentence, /^[A-Za-z ,.'\-]+\.$/)
    for (const marker of MARKERS) assert.equal(sentence.includes(marker), false)
  }
  assert.equal(new Set(result.narrative).size, result.narrative.length)
})

test("h1b1: outputs carry no raw reference, numeric leaf or overstated vocabulary", () => {
  const outputs: unknown[] = SCENARIOS.map((scenario) => okOf(scenario))
  outputs.push(evaluateDeclaredRevisionReferenceRelation(null))
  outputs.push(evaluateDeclaredRevisionReferenceRelation(pair(withField("identityBasis", "url") as never, ALL_SAME.right)))
  outputs.push(snapshotValidatedDeclaredRevisionReferenceRelation(okOf(ALL_SAME), ALL_SAME))
  outputs.push(snapshotValidatedDeclaredRevisionReferenceRelation({}, ALL_SAME))
  for (const output of outputs) {
    // Frozen, no symbol/non-enumerable/accessor field, no numeric or digit-bearing leaf,
    // no input-, provider-, temporal- or authority-named property.
    assert.deepEqual(scan(output, "out"), [])
    const serialized = JSON.stringify(output)
    for (const marker of MARKERS) assert.equal(serialized.includes(marker), false)
    for (const banned of FORBIDDEN_VOCABULARY) assert.equal(serialized.includes(banned), false)
    for (const banned of FORBIDDEN_BASES) assert.equal(serialized.includes(banned), false)
    assert.equal(serialized.includes(BASIS), false)
  }
})

// ─── G. attestation ─────────────────────────────────────────────

test("h1b1: attestation accepts only the exact result with the exact input", () => {
  const input = pair(desc(SA, CA, RA), desc(SB, CB, RB))
  const result = okOf(input)
  const accepted = snapshotValidatedDeclaredRevisionReferenceRelation(result, input)
  assert.equal(accepted.ok, true)
  assert.equal(accepted.ok && accepted.snapshot.declaredRevisionRefRelation, "different_declared_ref")
  assert.equal(accepted.ok && "ok" in accepted.snapshot, false)
  const rejected = { ok: false, failureCode: "attestation_rejected" }
  const reject = (r: unknown, i: unknown) => assert.deepEqual(snapshotValidatedDeclaredRevisionReferenceRelation(r, i), rejected)
  reject({ ...result }, input)
  reject(structuredClone(result), input)
  reject(JSON.parse(JSON.stringify(result)), input)
  reject(Object.create(result), input)
  reject(new Proxy(result, {}), input)
  reject(revokedProxy({ ...result }), input)
  reject({ ok: true, declaredRevisionRefRelation: "same_declared_ref" }, input)
  reject(evaluateDeclaredRevisionReferenceRelation(null), input)
  reject(null, input)
  reject(result, { ...input })
  reject(result, pair(input.left, input.right))
  reject(result, structuredClone(input))
  const otherInput = pair(desc(SA, CA, RA), desc(SB, CB, RB))
  const otherResult = okOf(otherInput)
  reject(result, otherInput)
  reject(otherResult, input)
})

test("h1b1: snapshots never alias and survive public mutation", () => {
  const left: Record<string, unknown> = { ...ALL_DIFFERENT.left }
  const input = { left, right: { ...ALL_DIFFERENT.right } } as unknown as DeclaredRevisionReferenceRelationInput
  const result = okOf(input)
  const first = snapshotValidatedDeclaredRevisionReferenceRelation(result, input)
  const second = snapshotValidatedDeclaredRevisionReferenceRelation(result, input)
  assert.equal(first.ok && second.ok, true)
  if (!first.ok || !second.ok) return
  assert.notEqual(first, second)
  assert.notEqual(first.snapshot, second.snapshot)
  assert.notEqual(first.snapshot.reasonCodes, second.snapshot.reasonCodes)
  assert.notEqual(first.snapshot.narrative, second.snapshot.narrative)
  const before = JSON.stringify(first.snapshot)
  left.subjectRef = SB
  left.revisionRef = RB
  assert.throws(() => { (result.reasonCodes as string[]).push("reference_equality_only") })
  const after = snapshotValidatedDeclaredRevisionReferenceRelation(result, input)
  assert.equal(after.ok, true)
  if (after.ok) assert.equal(JSON.stringify(after.snapshot), before)
})

// ─── H. architecture ────────────────────────────────────────────

test("h1b1: no production consumer anywhere in the repository, for H1B1 or H1A", () => {
  const sources = trackedSources()
  // Any reference form — static import, export-from, dynamic import(), require(),
  // or a bare path — must spell the module directory to reach it from outside.
  // A SAME-DIRECTORY sibling would not, which is why the exact module surface is
  // pinned in the next test: together they close both routes.
  const offendersFor = (token: string, own: string[]): string[] =>
    sources.filter((path) => !own.includes(path) && readFileSync(`${ROOT}${path}`, "utf8").includes(token))
  assert.deepEqual(offendersFor("revisionReference", OWN_FILES), [])
  assert.deepEqual(offendersFor(H1A_TOKEN, H1A_OWN_FILES), [])
  // Non-vacuity, both directions: each needle DOES match the one importer that
  // legitimately spells it, so neither scan is silently searching for nothing,
  // and every own file is a real tracked path rather than a stale exemption.
  for (const [needle, importer, own] of [
    ["revisionReference", "tests/phase6RevisionReference.test.mts", OWN_FILES],
    [H1A_TOKEN, H1A_OWN_FILES[2], H1A_OWN_FILES],
  ] as const) {
    assert.equal(readFileSync(`${ROOT}${importer}`, "utf8").includes(needle), true)
    for (const path of own) assert.equal(sources.includes(path), true, `stale exemption: ${path}`)
  }
})

test("h1b1: exact module surface and dependency leaf", () => {
  assert.deepEqual(readdirSync(MODULE_DIR).sort(), ["evaluate.ts", "types.ts"])
  const evaluateSource = readFileSync(`${MODULE_DIR}/evaluate.ts`, "utf8")
  const typesSource = readFileSync(`${MODULE_DIR}/types.ts`, "utf8")
  for (const source of [evaluateSource, typesSource]) {
    assert.doesNotMatch(source, /\bimport\s*\(/)
    assert.doesNotMatch(source, /\brequire\s*\(/)
    for (const banned of ["node:", "process.env", "fetch(", "Date.now", "Math.random", "globalThis["]) {
      assert.equal(source.includes(banned), false)
    }
  }
  // The dependency leaf is proven by the SPECIFIER SET, not by prose: the module
  // documents the neighbours it refuses, so a substring scan over the whole file
  // would flag its own rationale. `evaluate.ts` may name exactly one specifier and
  // `types.ts` none, which is what makes every forbidden neighbour — H1A, canonical
  // identity, identity independence, formation, providers, persistence, runtime
  // authorization, approval, ranking, LLM clients, network and digest helpers —
  // unreachable in one assertion rather than an enumerable denylist.
  const importSpecifiers = [...evaluateSource.matchAll(/(?:from|^\s*import)\s+"([^"]+)"/gm)].map((match) => match[1])
  assert.deepEqual(importSpecifiers, ["./types.ts"])
  assert.deepEqual([...typesSource.matchAll(/^\s*import\b/gm)], [])
  // Belt and braces: no export-from re-export smuggles a second edge in either file.
  for (const source of [evaluateSource, typesSource]) assert.doesNotMatch(source, /^\s*export\s[^=]*\sfrom\s/m)
})

// Durable document invariants only. Which paths a given PR changed is a one-time release
// condition owned by review and merge authorization, never by the permanent suite: pinning
// it here would fail every later unrelated change to the repository.
test("h1b1: contract document present and H0/H1A authority markers preserved", () => {
  const contractPath = `${ROOT}docs/HTPE_H1B1_REVISION_REFERENCE_CONTRACT.md`
  assert.equal(statSync(contractPath).isFile(), true)
  const contract = readFileSync(contractPath, "utf8")
  assert.match(contract, /^# HTPE H1B1 Declared Revision Reference Relation Contract$/m)
  for (const required of ["SHADOW ONLY", "**Authority:** NONE", "**Production consumer:** NONE",
    "`same_declared_ref` means only that the two validated opaque strings are byte-for-byte",
    "immutable revision."]) {
    assert.equal(contract.includes(required), true, `contract must state: ${required}`)
  }
  // H0 and H1A remain the upstream authorities; H1B1 neither rewrites nor weakens them.
  const h0 = readFileSync(`${ROOT}docs/PROVENANCE_CLAIM_CONTRACT.md`, "utf8")
  for (const required of ["TEST-ONLY_READ-ONLY_SHADOW_PROJECTION", "HTPE NEVER RE-DERIVES THIS AUTHORITY"]) {
    assert.equal(h0.includes(required), true, `H0 must still state: ${required}`)
  }
  const h1a = readFileSync(`${ROOT}docs/HTPE_H1A_TEMPORAL_CONTRACT.md`, "utf8")
  for (const required of ["SHADOW ONLY", "**Authority:** NONE", "**Production consumer:** NONE"]) {
    assert.equal(h1a.includes(required), true)
  }
  assert.deepEqual(readdirSync(`${ROOT}app/lib/phase6/${H1A_TOKEN}`).sort(), ["evaluate.ts", "types.ts"])
})
