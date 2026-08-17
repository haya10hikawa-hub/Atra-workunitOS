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

// Two of the six gates were closed for one provider RESOURCE — GitHub issues — by a separately
// authorized profile WorkUnit. Two of them, and only two. The labels below are the exact remaining
// unproven ones, spelled as the document spells them, so a gate that widens from "GitHub issues"
// to "GitHub" fails here rather than passing on a substring.
const PROFILE_GATES = [
  "GitHub identity profile, other resources",
  "Slack identity profile",
  "Google Calendar identity profile",
  "GitHub content-scope profile, other resources",
  "Slack content-scope profile",
  "Google Calendar content-scope profile",
]

// The gates a reviewed profile moved, and the document that must back them. A gate reading `PROVEN`
// without that document is exactly the failure this pin exists to catch.
//
// The two moved gates did NOT move to the same state, and collapsing them back into one list is
// the defect this split exists to prevent. Content scope was proven against GitHub's own published
// contract. Identity was not: the PM accepted it for Phase-1 with five requirements unproven, so it
// carries the scoped-exception state instead. A later edit that promotes identity to `PROVEN`
// presents an accepted risk as evidence, and fails here.
const PROVEN_PROFILE_GATES = [
  "GitHub issue content-scope profile", "GitHub pull request content-scope profile",
]
const SCOPED_EXCEPTION_GATE = "GitHub issue identity profile"
const PULL_REQUEST_EXCEPTION_GATE = "GitHub pull request identity profile"
const SCOPED_EXCEPTION_STATE = "PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL"
const PROVIDER_PROFILE_DOC = "docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md"
const PULL_REQUEST_PROFILE_DOC = "docs/architecture/GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.md"

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

test("R5: every gate without a reviewed profile stays REQUIRED_UNPROVEN", async () => {
  const raw = await read(SEMANTICS_DOC)
  const lines = raw.split("\n")

  // The two moved gates, and the proof that had to exist before they could move. Checked first, so
  // a document that promotes a gate with no profile behind it fails on the missing proof rather
  // than on an unrelated assertion further down.
  for (const gate of PROVEN_PROFILE_GATES) {
    const gateLines = lines.filter((line) => line.includes(gate) && line.includes("="))
    assert.equal(gateLines.length, 1, `${gate} must have exactly one gate line`)
    assert.ok(/=\s*PROVEN\b/.test(gateLines[0]), `${gate} must read PROVEN: ${gateLines[0]}`)
  }

  // The accepted-with-residual gates, one per reviewed GitHub resource. Two separate assertions on
  // purpose: that each reads the scoped state, and that neither reads `PROVEN`. A single positive
  // check would still pass a line that had acquired both.
  for (const gate of [SCOPED_EXCEPTION_GATE, PULL_REQUEST_EXCEPTION_GATE]) {
    const identityGateLines = lines.filter((line) => line.includes(gate) && line.includes("="))
    assert.equal(identityGateLines.length, 1, `${gate} must have exactly one gate line`)
    assert.ok(new RegExp(`=\\s*${SCOPED_EXCEPTION_STATE}\\b`).test(identityGateLines[0]),
      `${gate} must read ${SCOPED_EXCEPTION_STATE}: ${identityGateLines[0]}`)
    assert.equal(/=\s*PROVEN\b/.test(identityGateLines[0]), false,
      `${gate} must not be promoted to PROVEN: ${identityGateLines[0]}`)
  }

  const profileDoc = await read(PROVIDER_PROFILE_DOC)
  for (const required of [
    "github.issue.rest.database-primary-key", "github.issue.rest.retained-response-body",
    "Identifies the primary key from the database", "GitHub issues only",
  ]) {
    assert.ok(profileDoc.includes(required),
      `${PROVIDER_PROFILE_DOC} must record ${required} for the moved gates to mean anything`)
  }
  // Scope, not just existence: the moved gates are for issues. The profile must say so about the
  // identifier GitHub itself has already re-issued, or the exclusion is only implied.
  assert.ok(/node[_ ]?id/i.test(profileDoc),
    `${PROVIDER_PROFILE_DOC} must state why node_id is excluded rather than leave it unmentioned`)

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

// ─── R5b — the identity exception is explicit, scoped, and still an exception ───

// The five requirements the PM accepted as unproven, spelled as both documents spell them. They
// exist to be READ by a later implementer deciding whether `providerObjectKey` may be persisted,
// correlated or deduplicated on. A residual that is quietly dropped takes that decision away from
// them, so each one is pinned in the profile document AND in the semantic authority: a reader who
// opens only one of the two must not get the reassuring half.
const IDENTITY_RESIDUALS = [
  "REST issue `id` lifetime immutability",
  "non-reuse of a REST issue `id` after deletion",
  "persistence of a REST issue `id` across repository transfer",
  "provider-backed collision guarantee for github.com/rest/issues",
  "normative REST `id` = GraphQL `databaseId` equivalence",
]

// Claims the superseded profile made, each of which asserted more than GitHub publishes. They are
// pinned as forbidden rather than merely deleted, because the argument that produced them is the
// one a later editor is most likely to reconstruct from the same schema text.
const FALSE_IDENTITY_PROOF_CLAIMS = [
  /never re-issued/i,
  /a primary key identifies the row for the row's lifetime/i,
  /are the same value for the same object/i,
]

// Providers and resources that must NOT acquire the exception by being mentioned near it. The
// exception is one provider resource wide; "GitHub issues were accepted, so GitHub was" is exactly
// the widening this checks for.
const NON_EXCEPTED_SUBJECTS = ["Slack", "Google Calendar", "other resources"]

test("R5b: the GitHub Issue identity exception is scoped, residual-bearing and not a rule change", async () => {
  const raw = await read(SEMANTICS_DOC)
  const profileDoc = await read(PROVIDER_PROFILE_DOC)
  const gates = section(raw, "## 4. Provider Profile Gates")

  // The generic rule is what the exception is an exception TO. If section 2 stops requiring
  // provider-lifetime immutability, the exception has silently become the rule and there is
  // nothing left for it to except.
  assertDeclares(section(raw, "## 2. Identity Semantics"), [
    "provider-immutable for the object's lifetime",
  ], `${SEMANTICS_DOC} generic identity rule survives the exception`)

  // The exception must say the four things that make it reviewable: what is not proven, that a
  // human accepted it knowing so, how far it reaches, and when it stops.
  assertDeclares(gates, [
    "PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL",
    "GitHub Issues only",
    "github.issue.rest.database-primary-key v1",
    "Phase-1 bounded experimental use only",
    "The human PM reviewed R1–R5 and accepted the residual explicitly",
    "Acceptance is not evidence",
    "The exception expires when Phase-1 bounded experimental use ends",
    "The generic semantics in sections 2 and 3 are untouched by this exception",
  ], `${SEMANTICS_DOC} scoped exception record`)

  // What the acceptance is NOT. Stated, because every one of these is a reading a later reader
  // could arrive at from "the PM accepted it" alone.
  assertDeclares(gates, [
    "It is not a lifetime-immutability proof",
    "a production identity certification",
    "an authorization for any other GitHub resource",
    "a precedent any second provider or profile may claim",
  ], `${SEMANTICS_DOC} exception non-grants`)

  for (const residual of IDENTITY_RESIDUALS) {
    assert.ok(flatten(gates).includes(flatten(residual)),
      `${SEMANTICS_DOC} §4.1 must keep the residual visible: ${residual}`)
    assert.ok(flatten(profileDoc).includes(flatten(residual)),
      `${PROVIDER_PROFILE_DOC} must keep the residual visible: ${residual}`)
  }

  // The profile document must state the residuals as unproven, not merely mention them, and must
  // not restate any of the superseded proofs.
  for (const marker of ["UNPROVEN", "PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL"]) {
    assert.ok(profileDoc.includes(marker), `${PROVIDER_PROFILE_DOC} must record ${marker}`)
  }
  const revived = FALSE_IDENTITY_PROOF_CLAIMS.filter((pattern) => pattern.test(profileDoc))
  assert.deepEqual(revived.map(String), [],
    `${PROVIDER_PROFILE_DOC} must not restate a superseded identity proof`)

  // The content-scope profile is untouched by an identity residual, and must not be dragged down
  // with it: a remediation that downgrades the proven half is as untrue as one that upgrades the
  // unproven half.
  assert.ok(/GitHub ISSUE content-scope profile\s*=\s*PROVEN\b/.test(profileDoc),
    `${PROVIDER_PROFILE_DOC} must keep the content-scope profile PROVEN`)

  // Each exception belongs to exactly one provider resource. There are two — GitHub issues (§4.1)
  // and GitHub pull requests (§4.2), each separately ratified — and the check below is per LINE, not
  // per document: every occurrence of the state, in all three documents, must be free of the
  // non-excepted subjects, so no unreviewed provider can be swept in beside a reviewed one.
  const pullRequestProfileDoc = await read(PULL_REQUEST_PROFILE_DOC)
  for (const [label, doc] of [
    [SEMANTICS_DOC, raw],
    [PROVIDER_PROFILE_DOC, profileDoc],
    [PULL_REQUEST_PROFILE_DOC, pullRequestProfileDoc],
  ] as const) {
    const carrying = doc.split("\n").filter((line) => line.includes(SCOPED_EXCEPTION_STATE))
    assert.ok(carrying.length > 0, `${label} must state ${SCOPED_EXCEPTION_STATE}`)
    for (const line of carrying) {
      const leaked = NON_EXCEPTED_SUBJECTS.filter((subject) => line.includes(subject))
      assert.deepEqual(leaked, [],
        `${label}: the exception must not reach ${leaked.join(", ")}: ${line}`)
    }
  }
})

// ─── R5c — the pull request exception and the namespace decision ────────────

// The five requirements the PM accepted as unproven for the pull request resource, spelled as both
// documents spell them. Pinned in the semantic authority AND in the profile document for the same
// reason as R1–R5: a reader who opens only one of the two must not get the reassuring half.
const PULL_REQUEST_RESIDUALS = [
  "REST pull request `id` lifetime immutability",
  "non-reuse of a REST pull request `id` after deletion",
  "persistence of a REST pull request `id` across repository transfer",
  "provider-backed collision guarantee for github.com/rest/pulls",
  "normative REST `id` = GraphQL `databaseId` equivalence",
]

test("R5c: the GitHub pull request exception is its own decision, not an inheritance", async () => {
  const raw = await read(SEMANTICS_DOC)
  const gates = section(raw, "## 4. Provider Profile Gates")
  const profileDoc = await read(PULL_REQUEST_PROFILE_DOC)

  // The exception must say the four things that make it reviewable: what is not proven, that a human
  // accepted it knowing so, how far it reaches, and when it stops.
  assertDeclares(gates, [
    "GitHub Pull Requests only",
    "github.pull-request.rest.database-primary-key v1",
    "Phase-1 bounded experimental use only",
    "The human PM reviewed P-R1–P-R5 and accepted the residual explicitly",
    "Acceptance is not evidence",
    "It did not inherit",
  ], `${SEMANTICS_DOC} pull request scoped exception`)

  for (const residual of PULL_REQUEST_RESIDUALS) {
    assert.ok(flatten(gates).includes(flatten(residual)),
      `${SEMANTICS_DOC} §4.2 must keep the residual visible: ${residual}`)
    assert.ok(flatten(profileDoc).includes(flatten(residual)),
      `${PULL_REQUEST_PROFILE_DOC} must keep the residual visible: ${residual}`)
  }

  // The content-scope half is proven and must not be dragged down with the identity residuals, and
  // the identity half must not be promoted on the strength of the proven half.
  assert.ok(/GitHub PULL REQUEST content-scope profile\s*=\s*PROVEN\b/.test(profileDoc),
    `${PULL_REQUEST_PROFILE_DOC} must keep the content-scope profile PROVEN`)
  assert.ok(/GitHub PULL REQUEST identity profile\s*=\s*PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL\b/
    .test(profileDoc),
    `${PULL_REQUEST_PROFILE_DOC} must keep the identity profile at its scoped-exception state`)
  const revived = FALSE_IDENTITY_PROOF_CLAIMS.filter((pattern) => pattern.test(profileDoc))
  assert.deepEqual(revived.map(String), [],
    `${PULL_REQUEST_PROFILE_DOC} must not restate a superseded identity proof`)

  // The absent sixth residual is the one a later reader is most likely to misread as a promotion.
  // The document must say why it is gone — an Atra-side defect was removed — and must not present
  // that as evidence about the provider.
  assertDeclares(flatten(profileDoc), [
    "There is no sixth residual, and that is not a promotion",
    "Removing an Atra-side defect proves nothing about the provider",
  ], `${PULL_REQUEST_PROFILE_DOC} sixth-residual framing`)

  // The profile must record what provider authority it did NOT obtain. This is the honest basis for
  // the acceptance, and deleting it would leave the residuals looking like an oversight.
  assertDeclares(flatten(profileDoc), [
    "No new provider-contract verification was performed for this resource",
  ], `${PULL_REQUEST_PROFILE_DOC} authority disclosure`)
})

test("R5c: canonical identity namespaces are per resource and introduce no namespace field", async () => {
  const gates = section(await read(SEMANTICS_DOC),
    "### 4.3 Canonical identity namespaces are per resource, not per provider")

  assertDeclares(gates, [
    // The decision itself, and the rejected alternative stated as rejected rather than omitted.
    "distinct canonical identity namespaces",
    "The single `\"github\"` canonical identity namespace is **rejected**",
    "a record cannot fall back to it",
    // Why: the provider fact, and the measurement consequence that made it urgent.
    "different table per resource",
    "would become one canonical identity",
    "arrive at that experiment disguised as a correlation result",
    // The boundary: what was deliberately NOT built.
    "No generalized namespace model",
    "gains no `providerNamespace` field and no fourth identity component",
    "the record's field set, order and optionality are unchanged",
    // When it is revisited, so the boundary is not permanent by accident.
    "a third canonical GitHub resource becoming necessary, or canonical persistence beginning",
    // Observation never becomes proof.
    "`OBSERVED_STABILITY` is not `PROVIDER_PROOF`",
    "no provider-specific observation field may be added",
  ], `${SEMANTICS_DOC} canonical namespace decision`)
})

// ─── R6 — the acquisition implementation is exactly the reviewed slice ──────

// R6 was written while acquisition was unstarted, and asserted absence. Two separately authorized
// WorkUnits have since declared the contract and then built one vertical slice through it, so
// absence is superseded by an exact, path-bound set:
//
//   ACQUISITION_EVIDENCE_CONTRACT   = DECLARED, at one module
//   PROVIDER_PROFILE_IMPLEMENTATION = GitHub issues only, at one module
//   PROVIDER_WIRING                 = GitHub issues only, at one module
//   DIGEST_COMPUTATION              = at the GitHub acquisition module only
//   SOURCE_RECORD_PRODUCER          = one module
//   SOURCE_RECORD_CONSUMERS         = 1, its producer
//
// What R6 protected has not changed: nothing else may produce, adapt, digest or profile a
// SourceRecordV1. So the denylist below is kept in full and made path-bound instead of being
// deleted. Each name may be declared only at a reviewed module, and a second producer, a second
// digest site or a second provider profile fails here whatever it is called — including under one
// of these names at a new path, which is how the check would otherwise have been evaded by renaming.
const UNSTARTED_IMPLEMENTATION_SYMBOLS = [
  "toSourceRecordV1", "buildSourceRecordV1", "createSourceRecordV1", "makeSourceRecordV1",
  "sourceRecordFrom", "SourceRecordAdapter", "SourceRecordProducer", "SourceRecordRepository",
  "computeContentDigest", "contentDigestOf", "buildContentDigest", "canonicalizeProviderContent",
  "ProviderIdentityProfile", "ProviderContentScopeProfile", "providerIdentityProfile",
  "providerObjectKeyFor",
]

// The modules the reviewed slices authorized, pinned by resolved path. No further module may
// acquire, produce, digest or profile, whatever it is named. The pull request adapter joined the
// list when the GitHub resource namespace split reviewed a second resource; the list is exact, so
// a third resource is a failure here until it is reviewed too.
const GITHUB_ACQUISITION = "app/lib/infrastructure/external/github/recordedIssueCapture.ts"
const GITHUB_PULL_REQUEST_ACQUISITION =
  "app/lib/infrastructure/external/github/recordedPullRequestCapture.ts"
const SOURCE_PRODUCER = "app/lib/application/source/sourceRecordProduction.ts"
const AUTHORIZED_IMPLEMENTATION_MODULES = [
  GITHUB_ACQUISITION, GITHUB_PULL_REQUEST_ACQUISITION, SOURCE_PRODUCER,
]

// The declared contract, and the single module allowed to declare it. The pair is pinned by
// resolved path so "declared" cannot decay into "declared anywhere".
const EVIDENCE_PORT = "app/lib/ports/acquisitionEvidence/types.ts"
const EVIDENCE_CONTRACT_SYMBOLS = [
  "AcquisitionCaptureId", "AcquisitionTenantPartition", "AcquisitionMode",
  "RetainedProviderContent", "ContentScopeBinding", "ProviderIdentityProvenance",
  "AcquisitionCapture", "AcquisitionEvidence",
]

test("R6: only the reviewed slice produces, adapts, digests or profiles a SourceRecordV1", async () => {
  const declared: string[] = []
  const evidenceSites: string[] = []
  let scanned = 0
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      const relative = path.relative(rootDir, file).split(path.sep).join("/")
      const source = await readFile(file, "utf8")
      scanned += 1
      for (const symbol of UNSTARTED_IMPLEMENTATION_SYMBOLS) {
        if (new RegExp(`\\b(?:type|interface|class|enum|const|let|var|function)\\s+${symbol}\\b`).test(source)
          && !AUTHORIZED_IMPLEMENTATION_MODULES.includes(relative)) {
          declared.push(`${relative} declares ${symbol}`)
        }
      }
      for (const symbol of EVIDENCE_CONTRACT_SYMBOLS) {
        if (new RegExp(`\\b(?:type|interface|class|enum|const|let|var|function)\\s+${symbol}\\b`).test(source)) {
          evidenceSites.push(`${relative} declares ${symbol}`)
        }
      }
    }
  }
  assert.ok(scanned > 100, "the production scan must not be vacuous")
  assert.deepEqual(declared, [],
    `P1-1 acquisition implementation is authorized only at the reviewed modules:\n${declared.join("\n")}`)

  // Non-vacuity for the path-bound exemption: it must actually be reachable. Both authorized
  // modules must exist, or the allowance above silently guards nothing and a moved module would
  // pass by disappearing rather than by being reviewed.
  for (const authorized of AUTHORIZED_IMPLEMENTATION_MODULES) {
    await assert.doesNotReject(read(authorized), `${authorized} must exist for its exemption to mean anything`)
  }

  // ACQUISITION_EVIDENCE_CONTRACT = DECLARED, and declared in exactly one place. The contract may
  // neither be declared a second time nor quietly disappear while this test reports it as DECLARED.
  assert.deepEqual(evidenceSites.sort(), EVIDENCE_CONTRACT_SYMBOLS
    .map((symbol) => `${EVIDENCE_PORT} declares ${symbol}`).sort(),
    `the acquisition evidence contract must be declared exactly once, at ${EVIDENCE_PORT}`)

  // DIGEST_COMPUTATION stays out of the contract module. The digest is computed by the provider
  // profile, over retained provider bytes; a hashing primitive at the contract would put it where
  // there is no retained subject to hash.
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
  // it binds it, so the exact-consumer guarantee cannot be loosened to "any consumer" by a later
  // WorkUnit while this clarification still claims it holds.
  assertDeclares(flatten(await read(CONSUMER_RATCHET)), [
    "the only production consumer of app/lib/domain/source is its producer",
    "SourceRecordV1 must have exactly one production consumer",
    SOURCE_PRODUCER,
  ], `${CONSUMER_RATCHET} production-consumer ratchet`)

  const raw = await read(SEMANTICS_DOC)
  assertDeclares(section(raw, "## 5. Acquisition Consequence"), [
    "ACQUISITION_SCOPE_CHANGE_REQUIRED = YES, except for GitHub issues and GitHub pull requests, where it has been made",
    "neither enough provider-native identity",
    "nor the full provider content",
    "For every other provider and every remaining GitHub resource, acquisition scope is unchanged",
    // Extension by review, not by generalization. The alternative — one parameterized GitHub
    // adapter — would make a third resource reachable without a reviewed profile.
    "Each resource has its own acquisition module",
    "not generalized into a provider plugin surface",
  ], `${SEMANTICS_DOC} acquisition consequence`)
  // Section 6 is the historical boundary of the clarification itself, and its wording is preserved
  // verbatim. It is only honest alongside section 7, which records what later WorkUnits crossed —
  // so the two are pinned together, and deleting section 7 fails here rather than leaving section 6
  // reading as a claim about the current tree.
  assertDeclares(section(raw, "## 6. Explicit Non-Goals"), [
    "the boundary of **this clarification**",
    "not a standing prohibition on every later WorkUnit",
    "P1-1 remains `PARTIAL`",
    "runtime producer remains absent",
    "authorizing or implementing a `SourceRecordV1` producer, adapter, consumer or persistence path",
    "authorizing or implementing content canonicalization or digest computation",
  ], `${SEMANTICS_DOC} non-goals`)
  assertDeclares(section(raw, "## 7. What later WorkUnits have since crossed"), [
    SOURCE_PRODUCER,
    GITHUB_ACQUISITION,
    GITHUB_PULL_REQUEST_ACQUISITION,
    "No persistence path exists",
    "**P1-1 remains `PARTIAL`**",
  ], `${SEMANTICS_DOC} superseding record`)
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
//
// `provider` reads `SourceIdentityNamespace` and not `SourceType`, and the re-cut is deliberate.
// The GitHub resource namespace split was a separately authorized WorkUnit that changed the
// discriminator's TYPE — not the field set, not the order, not optionality, and not a field's
// meaning: `provider` was always "the namespace in which providerObjectKey is interpreted", and the
// split made the declared type say what that sentence already required for a provider issuing keys
// per resource. The rest of this list is unchanged, so a fourth field or a re-ordering still fails.
const RECORD_FIELDS = [
  "recordVersion: SourceRecordVersion",
  "tenantId: TenantId",
  "provider: SourceIdentityNamespace",
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
