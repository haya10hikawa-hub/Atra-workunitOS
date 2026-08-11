/**
 * P1-1 semantic ratchet for SourceRecordV1.
 *
 * The PM ratified two clarifications: `providerObjectKey` is the provider's own native identity
 * (B1-A), and `contentDigest` attests the provider's own content (B2-P1). Both are claims about
 * meaning, and meaning decays silently — nothing fails when a reader, or a later implementer,
 * quietly returns to the weaker reading in which a composed display string is identity, or in
 * which hashing an Atra-side object is integrity evidence.
 *
 * These tests pin the ratified meaning to repository-controlled artifacts. They deliberately do
 * NOT teach `validateSourceRecordV1()` to check provider nativeness or content provenance: the
 * generic validator cannot know a provider's identity or content contract, and moving enforcement
 * into it would be a runtime change this WorkUnit is not authorized to make. What is enforced here
 * is that the written semantics, the profile gates and the unstarted implementation stay true.
 *
 * Prose is matched on whitespace-flattened text, so the documents may be reflowed and reworded
 * around these markers; only the ratified meaning is pinned.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isCodeFilePath } from "../scripts/lib/typescriptModuleGraph.mjs"
import { validateSourceRecordV1 } from "../app/lib/domain/source/index.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

const SEMANTICS_DOC = "docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md"
const RECORD_TYPES = "app/lib/domain/source/types.ts"
const RECORD_VALIDATOR = "app/lib/domain/source/validateSourceRecord.ts"
const RECORD_MODULE_DIR = "app/lib/domain/source"
const FIXTURE = "tests/fixtures/domain/source/sourceRecord.v1.json"
const CONTRACT_TEST = "tests/sourceRecordContract.test.mts"
const CONSUMER_RATCHET = "tests/normalizedToolSignalBoundary.test.mts"

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(rootDir, relativePath), "utf8")
}

/** Prose as meaning: line breaks, indentation and column padding are not part of the pin. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** The same, for a block comment: the leading `*` of each continued line is not prose. */
function flattenComment(text: string): string {
  return flatten(text.replace(/^[ \t]*\*/gm, " "))
}

function assertDeclares(text: string, phrases: string[], label: string): void {
  const missing = phrases.filter((phrase) => !text.includes(flatten(phrase)))
  assert.deepEqual(missing, [], `${label} must stay declared:\n${missing.join("\n")}`)
}

/**
 * One section of the semantic authority, flattened.
 *
 * A rule must stay stated where it governs. Matching against the whole document would let a rule
 * be deleted from the section that carries it and still pass on an incidental mention elsewhere —
 * which is exactly how a forbidden-subject list decays one bullet at a time.
 */
function section(raw: string, heading: string): string {
  const lines = raw.split("\n")
  const start = lines.findIndex((line) => line.trim() === heading)
  assert.ok(start >= 0, `${SEMANTICS_DOC} must keep the section ${heading}`)
  const level = (/^#+/.exec(heading) as RegExpExecArray)[0].length
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const next = /^(#{1,6}) /.exec(lines[index])
    if (next && next[1].length <= level) { end = index; break }
  }
  const body = flatten(lines.slice(start + 1, end).join("\n"))
  assert.ok(body.length > 0, `${heading} must not be empty`)
  return body
}

async function collectCodeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectCodeFiles(full)))
    else if (isCodeFilePath(entry.name)) files.push(full)
  }
  return files
}

// ─── R1 — the identity rule is repository-controlled ────────────────────────

// Stated in both places a reader looks: the declaration they import, and the document that
// governs it. One artifact carrying the rule is not enough — a reader who only opens the type
// must not still get the pre-ratification reading.
const IDENTITY_RULE_MARKERS = [
  "provider-issued",
  "provider-immutable",
  "injective",
  "reversible",
  "Composition does not create identity",
  "per-provider identity profile",
  "byte-for-byte",
]

test("R1: the ratified identity rule is stated in the semantic authority and in the type", async () => {
  const raw = await read(SEMANTICS_DOC)
  const rawTypes = await read(RECORD_TYPES)
  const types = flattenComment(rawTypes)

  assertDeclares(section(raw, "## 2. Identity Semantics"), [
    ...IDENTITY_RULE_MARKERS,
    "the provider's own native identity",
    "provider-scoped serialization",
    "no Atra-reminted identity",
  ], `${SEMANTICS_DOC} identity semantics`)
  assert.ok(flatten(raw).includes("SourceRecordV1"),
    `${SEMANTICS_DOC} must name the record it governs`)

  assertDeclares(types, [
    ...IDENTITY_RULE_MARKERS,
    "provider's own native identity",
  ], `${RECORD_TYPES} identity comment`)

  assert.ok(rawTypes.includes(SEMANTICS_DOC),
    `${RECORD_TYPES} must point at ${SEMANTICS_DOC} so the two cannot drift unnoticed`)
})

// ─── R2 — forbidden identity sources stay explicit ──────────────────────────

const FORBIDDEN_IDENTITY_SOURCES = [
  "URL identity",
  "mutable or display names",
  "Atra-generated ids, and acquisition-generated ids",
  "array positions, indexes or ordinals",
  "observation or clock values",
]

test("R2: every forbidden identity source stays forbidden by name", async () => {
  const raw = await read(SEMANTICS_DOC)
  assertDeclares(section(raw, "### Forbidden identity material"), FORBIDDEN_IDENTITY_SOURCES,
    `${SEMANTICS_DOC} forbidden identity material`)

  // The forms normalization can take are enumerated, so dropping one is a visible edit rather
  // than a silent narrowing of the rule.
  assertDeclares(section(raw, "### Forbidden transformation"), [
    "Normalization of provider identity is forbidden",
    "no trimming", "no case folding", "no Unicode normalization", "no re-encoding",
    // The one shape a reader is most likely to mistake for a ratified profile, named and refused.
    "`repository#number` is **not** a ratified GitHub identity profile",
  ], `${SEMANTICS_DOC} forbidden identity transformations`)

  assertDeclares(flattenComment(await read(RECORD_TYPES)), [
    "never a mutable or display name, a URL, an Atra-generated or acquisition-generated id, or an array position",
  ], `${RECORD_TYPES} forbidden identity material`)
})

// ─── R3 — the digest attests provider content ───────────────────────────────

test("R3: the digest is provider-content integrity under a reviewed content-scope profile", async () => {
  assertDeclares(section(await read(SEMANTICS_DOC), "## 3. Content Digest Semantics"), [
    "the integrity of the provider's own content",
    "per-provider content-scope profile",
    "equal digest = byte-identical canonicalized in-scope provider content",
    "different digest = at least one in-scope provider-content byte differs",
    "Any in-scope provider-content change must change the digest.",
    "does not compute or verify the content",
  ], `${SEMANTICS_DOC} content digest semantics`)

  assertDeclares(flattenComment(await read(RECORD_TYPES)), [
    "provider's own content",
    "per-provider content-scope profile",
    "in-scope provider-content change must change the digest",
    "carries the digest and never computes or verifies the content",
  ], `${RECORD_TYPES} content digest comment`)
})

// ─── R4 — Atra-side digest subjects stay forbidden ──────────────────────────

const FORBIDDEN_DIGEST_SUBJECTS = [
  "NormalizedToolSignal",
  "acquisition envelope, or any other acquisition representation",
  "a normalized provider projection",
  "`SourceRecord` fields",
  "any other Atra-side artifact",
]

test("R4: hashing an Atra-side representation is explicitly not a contentDigest", async () => {
  assertDeclares(section(await read(SEMANTICS_DOC), "### Forbidden digest subjects"), [
    ...FORBIDDEN_DIGEST_SUBJECTS,
    // The refusal must survive the obvious rationalization: a deterministic hash of the wrong
    // subject is still the wrong subject.
    "does not satisfy B2-P1",
    "however stable or deterministic that hash is",
  ], `${SEMANTICS_DOC} forbidden digest subjects`)

  assertDeclares(flattenComment(await read(RECORD_TYPES)), [
    "never computed over a NormalizedToolSignal, an acquisition envelope, a normalized provider projection, SourceRecord fields, or any other Atra-side representation",
  ], `${RECORD_TYPES} forbidden digest subjects`)
})

// ─── R5 — every provider profile stays unproven ─────────────────────────────

const PROFILE_GATES = [
  "GitHub identity profile",
  "Slack identity profile",
  "Google Calendar identity profile",
  "GitHub content-scope profile",
  "Slack content-scope profile",
  "Google Calendar content-scope profile",
]

const GATE_STATE = "REQUIRED_UNPROVEN"

// Promotions a future edit could make. `UNPROVEN` contains `PROVEN`, so the gate state is removed
// from the line before these are looked for; otherwise the check would fire on its own pin.
const FORBIDDEN_GATE_STATES = [
  /\bRATIFIED\b/, /\bPROVEN\b/, /\bCOMPLETE\b/, /\bDONE\b/, /\bSATISFIED\b/, /\bAUTHORIZED\b/,
]

// Candidate provider identifiers that were explicitly NOT ratified. Naming one here would present
// a guess as a provider contract, so none may appear in the document at all.
const UNVERIFIED_PROVIDER_FIELDS = [
  /\bnode[_ ]?id\b/i, /\bdatabase id\b/i, /\bts tuple\b/i, /\bevent id tuple\b/i,
]

test("R5: all six provider profile gates stay REQUIRED_UNPROVEN", async () => {
  const raw = await read(SEMANTICS_DOC)
  const lines = raw.split("\n")

  for (const gate of PROFILE_GATES) {
    const gateLines = lines.filter((line) => line.includes(gate) && line.includes("="))
    assert.equal(gateLines.length, 1, `${gate} must have exactly one gate line`)
    const [gateLine] = gateLines
    assert.ok(gateLine.includes(GATE_STATE), `${gate} must stay ${GATE_STATE}: ${gateLine}`)

    const withoutState = gateLine.split(GATE_STATE).join("")
    const promoted = FORBIDDEN_GATE_STATES.filter((pattern) => pattern.test(withoutState))
    assert.deepEqual(promoted.map(String), [], `${gate} must not be promoted: ${gateLine}`)
  }

  // A gate is an obligation, never permission, and only a separately authorized WorkUnit may move
  // one. Both statements must stay, so the list cannot be read as a checklist this WorkUnit — or
  // any WorkUnit that has not verified the provider's own contract — is allowed to tick off.
  assertDeclares(section(raw, "## 4. Provider Profile Gates"), [
    "never a permission",
    "asserts no provider identity field and no provider content scope",
    "external provider-contract verification",
    "separately authorized profile WorkUnit",
    "a gate moving out of `REQUIRED_UNPROVEN` is a defect",
  ], `${SEMANTICS_DOC} profile gate framing`)

  const asserted = UNVERIFIED_PROVIDER_FIELDS.filter((pattern) => pattern.test(raw))
  assert.deepEqual(asserted.map(String), [],
    "no unverified provider identifier may be asserted as a profile")
})

// ─── R6 — the acquisition implementation stays unstarted ────────────────────

// R6 was written while acquisition-evidence DECLARATION was also unstarted, so the two contract
// type names sat in the denylist below alongside genuine implementation symbols. A separately
// authorized WorkUnit has since declared the neutral contract, and only that part is superseded:
//
//   ACQUISITION_EVIDENCE_CONTRACT   = DECLARED
//   PROVIDER_PROFILE_IMPLEMENTATION = ABSENT
//   PROVIDER_WIRING                 = ABSENT
//   DIGEST_COMPUTATION              = ABSENT
//   SOURCE_RECORD_PRODUCER          = ABSENT
//   SOURCE_RECORD_CONSUMERS         = 0
//
// Declaring a contract shape is not implementing acquisition. Every symbol that would exist only
// because production code began producing, adapting or digesting a SourceRecordV1, or began
// implementing a provider profile, stays forbidden below — the denylist lost exactly two names
// and gained no permission.
const UNSTARTED_IMPLEMENTATION_SYMBOLS = [
  "toSourceRecordV1", "buildSourceRecordV1", "createSourceRecordV1", "makeSourceRecordV1",
  "sourceRecordFrom", "SourceRecordAdapter", "SourceRecordProducer", "SourceRecordRepository",
  "computeContentDigest", "contentDigestOf", "buildContentDigest", "canonicalizeProviderContent",
  "ProviderIdentityProfile", "ProviderContentScopeProfile", "providerIdentityProfile",
  "providerObjectKeyFor",
]

// The declared contract, and the single module allowed to declare it. The pair is pinned by
// resolved path so "declared" cannot decay into "declared anywhere".
const EVIDENCE_PORT = "app/lib/ports/acquisitionEvidence/types.ts"
const EVIDENCE_CONTRACT_SYMBOLS = ["AcquisitionEvidence", "AcquiredSignalObservation"]

test("R6: no production module produces, adapts, digests or profiles a SourceRecordV1", async () => {
  const declared: string[] = []
  const evidenceSites: string[] = []
  let scanned = 0
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      const source = await readFile(file, "utf8")
      scanned += 1
      for (const symbol of UNSTARTED_IMPLEMENTATION_SYMBOLS) {
        if (new RegExp(`\\b(?:type|interface|class|enum|const|let|var|function)\\s+${symbol}\\b`).test(source)) {
          declared.push(`${path.relative(rootDir, file)} declares ${symbol}`)
        }
      }
      for (const symbol of EVIDENCE_CONTRACT_SYMBOLS) {
        if (new RegExp(`\\b(?:type|interface|class|enum|const|let|var|function)\\s+${symbol}\\b`).test(source)) {
          evidenceSites.push(`${path.relative(rootDir, file)} declares ${symbol}`)
        }
      }
    }
  }
  assert.ok(scanned > 100, "the production scan must not be vacuous")
  assert.deepEqual(declared, [],
    `P1-1 acquisition implementation is not authorized here:\n${declared.join("\n")}`)

  // ACQUISITION_EVIDENCE_CONTRACT = DECLARED, and declared in exactly one place. Dropping the two
  // names from the denylist above must not become permission to declare them anywhere, nor may the
  // contract quietly disappear while this test still reports the state as DECLARED.
  assert.deepEqual(evidenceSites.sort(), EVIDENCE_CONTRACT_SYMBOLS
    .map((symbol) => `${EVIDENCE_PORT} declares ${symbol}`).sort(),
    `the acquisition evidence contract must be declared exactly once, at ${EVIDENCE_PORT}`)

  // DIGEST_COMPUTATION = ABSENT, at the one module now authorized to name the digest. The
  // contract carries attested evidence; a hashing primitive here would start the implementation
  // this WorkUnit is not authorized to make.
  const evidenceSource = await read(EVIDENCE_PORT)
  for (const token of ["createHash", "subtle", "node:crypto", 'from "crypto"', "digest(", "TextEncoder"]) {
    assert.equal(evidenceSource.includes(token), false,
      `${EVIDENCE_PORT} must not reach for ${token}: evidence is attested, never computed here`)
  }

  // The record's module is still the three declared files. An adapter would have to arrive as a
  // fourth, and would then be caught whatever it was named.
  const moduleFiles = (await readdir(path.join(rootDir, RECORD_MODULE_DIR))).sort()
  assert.deepEqual(moduleFiles, ["index.ts", "types.ts", "validateSourceRecord.ts"],
    `${RECORD_MODULE_DIR} must stay the record, its validator and their surface`)

  // The stronger edge-level ratchet lives in the WU-02 boundary suite. This does not repeat it —
  // it binds it, so the "no production consumer" guarantee cannot be deleted by a later WorkUnit
  // while this clarification still claims it holds.
  assertDeclares(flatten(await read(CONSUMER_RATCHET)), [
    "no production module consumes app/lib/domain/source",
    "SourceRecordV1 must have no production consumer",
  ], `${CONSUMER_RATCHET} production-consumer ratchet`)

  const raw = await read(SEMANTICS_DOC)
  assertDeclares(section(raw, "## 5. Acquisition Consequence"), [
    "ACQUISITION_SCOPE_CHANGE_REQUIRED = YES",
    "neither enough provider-native identity",
    "nor the full provider content",
    "does not authorize the change it names",
  ], `${SEMANTICS_DOC} acquisition consequence`)
  assertDeclares(section(raw, "## 6. Explicit Non-Goals"), [
    "P1-1 remains `PARTIAL`",
    "runtime producer remains absent",
    "authorizing or implementing a `SourceRecordV1` producer, adapter, consumer or persistence path",
    "authorizing or implementing content canonicalization or digest computation",
  ], `${SEMANTICS_DOC} non-goals`)
})

// ─── R7 — the fixture cannot masquerade as a provider profile ───────────────

const RETIRED_FIXTURE_KEY = "haya10hikawa-hub/Atra-workunitOS#218"
const FIXTURE_KEY = "provider-native-key-fixture"

test("R7: the golden fixture self-identifies as validator-shape evidence only", async () => {
  const raw = await read(FIXTURE)
  const fixture = JSON.parse(raw) as { note: string; valid: Record<string, unknown> }

  assertDeclares(flatten(fixture.note), [
    "validator-shape evidence only",
    "NOT a provider identity profile",
    "NOT a provider content-scope profile",
    "not a provider-native identifier",
    "No provider contract may be inferred",
  ], `${FIXTURE} note`)

  assert.equal(raw.includes(RETIRED_FIXTURE_KEY), false,
    "the repository#number example must not return as a fixture identity")
  assert.equal(fixture.valid.providerObjectKey, FIXTURE_KEY,
    "the fixture key must stay an unmistakably synthetic validator-only token")

  // The repair must not have over-corrected into a generic rule. `#` is ordinary byte material in
  // a provider key: only its use as a *ratified profile shape* was refused, and the validator must
  // still carry any such key verbatim.
  const result = validateSourceRecordV1({ ...fixture.valid, providerObjectKey: "opaque#1" })
  assert.ok(result.ok, "a provider key containing # must still be accepted")
  assert.equal(result.record.providerObjectKey, "opaque#1", "the key must be carried byte-for-byte")
})

// ─── R8 — the canonical contract shape is unchanged ─────────────────────────

// The clarification is documentation. These are the record's declarations at the ratified head:
// order, names, types and non-optionality. Any executable or type-shape edit fails here, which is
// what makes "comment-only" checkable rather than merely asserted.
const RECORD_FIELDS = [
  "recordVersion: SourceRecordVersion",
  "tenantId: TenantId",
  "provider: SourceType",
  "providerObjectKey: string",
  "declaredSourceRef: string | null",
  "sourceUrl: string | null",
  "observedAt: string",
  "recordedAt: string",
  "sourceEventAt: string | null",
  "contentDigest: string",
]

const FAILURE_CODES = [
  "input_unreadable", "unknown_field", "missing_field", "unsupported_record_version",
  "invalid_tenant_id", "invalid_provider", "invalid_provider_object_key",
  "invalid_declared_source_ref", "invalid_source_url", "invalid_instant",
  "recorded_before_observed", "invalid_content_digest",
]

test("R8: the clarification changed no field, no optionality and no failure code", async () => {
  const types = await read(RECORD_TYPES)
  const block = /export type SourceRecordV1 = \{([\s\S]*?)\n\}/.exec(types)
  assert.ok(block, `${RECORD_TYPES} must keep declaring SourceRecordV1`)

  const fields = [...block[1].matchAll(/^\s*readonly (.+)$/gm)].map((entry) => entry[1].trim())
  assert.deepEqual(fields, RECORD_FIELDS, "the record's field set, order and types are unchanged")
  assert.equal(/readonly \w+\?:/.test(block[1]), false, "no field may become optional")

  const codes = [...types.matchAll(/\| "([a-z_]+)"/g)].map((entry) => entry[1])
  assert.deepEqual(codes.sort(), [...FAILURE_CODES].sort(), "the failure vocabulary is unchanged")
  assert.ok(types.includes('SOURCE_RECORD_VERSION = "1" as const'),
    "the version discriminant is unchanged")
})

test("R8: semantic enforcement did not move into the generic validator", async () => {
  const validator = await read(RECORD_VALIDATOR)

  // The provider is checked against the closed vocabulary and nothing else. A per-provider branch
  // would be this WorkUnit claiming a provider contract it has not verified.
  assert.ok(validator.includes("Object.hasOwn(ACCEPTED_PROVIDERS, provider)"),
    "the provider check must stay a closed-vocabulary lookup")
  assert.deepEqual([...validator.matchAll(/provider\s*===\s*"(\w+)"/g)].map((entry) => entry[1]), [],
    "no per-provider identity or content branch may appear in the generic validator")
  assert.equal(/switch\s*\(\s*(?:values\.)?provider\b/.test(validator), false,
    "no per-provider dispatch may appear in the generic validator")

  // The domain carries the digest; it never computes one. A hashing primitive here would be the
  // start of an unauthorized content-digest implementation.
  for (const token of ["createHash", "subtle", "crypto", "digest(", "TextEncoder"]) {
    assert.equal(validator.includes(token), false,
      `${RECORD_VALIDATOR} must not reach for ${token}: the digest is attested, never computed here`)
  }

  // The semantic authority states the same boundary from its side, so neither artifact can be
  // read alone and produce a stronger guarantee than the code gives.
  assertDeclares(section(await read(SEMANTICS_DOC), "## 1. Authority Position"), [
    "checks shape only, and deliberately does not check provider nativeness or content provenance",
    "not a property the generic validator can enforce",
  ], `${SEMANTICS_DOC} validator boundary`)

  // The permanent contract suite is this WorkUnit's regression base and stays in force unchanged.
  assertDeclares(flatten(await read(CONTRACT_TEST)), [
    "T1: identity is exactly (tenantId, provider, providerObjectKey)",
    "T2: contentDigest is integrity evidence, never identity or equality",
    "T3: providerObjectKey is byte-exact and never normalized",
  ], `${CONTRACT_TEST} canonical contract tests`)
})
