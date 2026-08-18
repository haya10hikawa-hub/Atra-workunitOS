/**
 * P1-2 semantic ratchet for the Gmail Message profile pair.
 *
 * The PM accepted a Phase-1 scoped identity exception for the Gmail Message resource
 * (`ATRA_PM_P1_2_GMAIL_PHASE1_SCOPED_IDENTITY_EXCEPTION_ACCEPTED`) and the content-scope half was
 * re-verified against Google's published contract. Both halves are claims about meaning, and meaning
 * decays silently: nothing fails when a later reader drops the one-mailbox bound, promotes a residual
 * Google never closed, digests the base64url text instead of the octets below it, or lets the generic
 * `gmail` namespace back into canonical production.
 *
 * These tests pin the accepted scope to repository-controlled artifacts. They deliberately do NOT
 * teach any runtime module about Gmail: no Gmail acquisition, producer, capture, transport or
 * credential path is authorized, and G4 asserts that absence rather than assuming it.
 *
 * Prose is matched on whitespace-flattened text, so the documents may be reflowed and reworded around
 * these markers; only the accepted meaning is pinned.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

const PROFILE_DOC = "docs/architecture/GMAIL_MESSAGE_ACQUISITION_PROFILE.md"
const SEMANTICS_DOC = "docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md"
const PRODUCT_AUTHORITY_DOC = "docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md"
const NAMESPACE_TYPES = "app/lib/domain/types.ts"
const RECORD_VALIDATOR = "app/lib/domain/source/validateSourceRecord.ts"

const PM_DECISION_TOKEN = "ATRA_PM_P1_2_GMAIL_PHASE1_SCOPED_IDENTITY_EXCEPTION_ACCEPTED"
const SCOPED_EXCEPTION_STATE = "PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL"

const IDENTITY_PROFILE_ID = "gmail.message.rest.message-id"
const CONTENT_PROFILE_ID = "gmail.message.rest.raw-rfc2822-octets"

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(rootDir, relativePath), "utf8")
}

/** Prose as meaning: line breaks, indentation and column padding are not part of the pin. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function assertDeclares(text: string, phrases: string[], label: string): void {
  const missing = phrases.filter((phrase) => !flatten(text).includes(flatten(phrase)))
  assert.deepEqual(missing, [], `${label} must stay declared:\n${missing.join("\n")}`)
}

/**
 * One section of a document, by heading.
 *
 * A rule must stay stated where it governs. Matching against the whole document would let a rule be
 * deleted from the section that carries it and still pass on an incidental mention elsewhere — which
 * is exactly how a scope bound decays one clause at a time. `historyId` and `threadId`, for instance,
 * appear in the identity-candidate table as REJECTED identity as well as in the field classification.
 */
function section(raw: string, heading: string): string {
  const lines = raw.split("\n")
  const start = lines.findIndex((line) => line.trim() === heading)
  assert.ok(start >= 0, `a pinned document must keep the section ${heading}`)
  const level = (/^#+/.exec(heading) as RegExpExecArray)[0].length
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const next = /^(#{1,6}) /.exec(lines[index])
    if (next && next[1].length <= level) { end = index; break }
  }
  const body = lines.slice(start + 1, end).join("\n")
  assert.ok(body.trim().length > 0, `${heading} must not be empty`)
  return body
}

/** A fenced block inside a section — the machine-readable half of a governing statement. */
function fencedBlock(raw: string, heading: string, index = 0): string {
  const blocks = [...section(raw, heading).matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1])
  assert.ok(blocks.length > index,
    `${heading} must keep declaring block ${index}, found ${blocks.length}`)
  return blocks[index]
}

const GMAIL_EXCEPTION_HEADING =
  "### 4.1 Scoped exception — Gmail Message, identity profile v1, Phase-1 only"
const SEMANTICS_EXCEPTION_HEADING =
  "### 4.4 Scoped exception — Gmail Message, identity profile v1, Phase-1 only"

// ─── G1 — the identity half stays an exception, never a proof ───────────────

// The four requirements the PM accepted as unproven, spelled as both documents spell them. They exist
// to be READ by a later implementer deciding whether `providerObjectKey` may be persisted, correlated
// or deduplicated on. A residual quietly dropped takes that decision away from them, so each is pinned
// in the profile document AND in the semantic authority: a reader who opens only one of the two must
// not get the reassuring half.
const UNPROVEN_IDENTITY_RESIDUALS = ["G-R2", "G-R3", "G-R4", "G-R5"]

// The two Google DOES assert, in its own published contract. They are pinned as proven so that a later
// edit cannot quietly demote them either — the register is exact in both directions.
const PROVEN_IDENTITY_RESIDUALS = ["G-R1", "G-R6"]

// Promotions a future edit could make to the identity gate. `UNPROVEN` contains `PROVEN`, so the
// residual's own state is removed from the line before these are looked for.
const FORBIDDEN_IDENTITY_PROMOTIONS = [
  /\bPROVEN\b/, /\bRATIFIED\b/, /\bSATISFIED\b/, /\bCERTIFIED\b/, /\bGUARANTEED\b/,
]

/** The one line in a document that declares a residual's state, e.g. `G-R2  ...  UNPROVEN`. */
function residualLine(doc: string, residual: string): string {
  const lines = doc.split("\n").filter((line) => new RegExp(`^\\s*${residual}\\s`).test(line))
  assert.equal(lines.length, 1,
    `${residual} must have exactly one register line, got ${lines.length}`)
  return lines[0]
}

test("G1: the Gmail identity half is a scoped exception with G-R2–G-R5 unproven", async () => {
  const profile = await read(PROFILE_DOC)
  const semantics = await read(SEMANTICS_DOC)

  // The gate reads the scoped-exception state in the profile, and never PROVEN. Two separate
  // assertions on purpose: a single positive check would still pass a line that had acquired both.
  assert.ok(new RegExp(`Gmail MESSAGE identity profile\\s*=\\s*${SCOPED_EXCEPTION_STATE}\\b`)
    .test(profile), `${PROFILE_DOC} must keep the identity profile at its scoped-exception state`)
  assert.equal(/Gmail MESSAGE identity profile\s*=\s*PROVEN\b/.test(profile), false,
    `${PROFILE_DOC} must not promote the Gmail identity profile to PROVEN`)

  // The residual register is exact in both documents and in both directions.
  for (const doc of [profile, semantics]) {
    for (const residual of UNPROVEN_IDENTITY_RESIDUALS) {
      const line = residualLine(doc, residual)
      assert.ok(/\bUNPROVEN\b/.test(line), `${residual} must stay UNPROVEN: ${line}`)
      const withoutState = line.split("UNPROVEN").join("")
      const promoted = FORBIDDEN_IDENTITY_PROMOTIONS.filter((p) => p.test(withoutState))
      assert.deepEqual(promoted.map(String), [], `${residual} must not be promoted: ${line}`)
    }
    for (const residual of PROVEN_IDENTITY_RESIDUALS) {
      assert.ok(/\bPROVEN\b/.test(residualLine(doc, residual)),
        `${residual} is asserted by Google's own contract and must stay PROVEN`)
    }
  }

  // Acceptance is a product decision taken in knowledge of the gap, never evidence about Google, and
  // never a precedent. Each of these has already been got wrong once for GitHub.
  assertDeclares(profile, [
    PM_DECISION_TOKEN,
    "Acceptance is not evidence",
    "discharges none of `G-R2`–`G-R5`",
    "It did not inherit the GitHub exceptions",
    "`G-R2`–`G-R5` may not be promoted",
  ], `${PROFILE_DOC} exception framing`)
  assertDeclares(semantics, [
    PM_DECISION_TOKEN,
    "The third exception of its kind",
    "Acceptance is not evidence",
    "It did not inherit §4.1 or §4.2",
  ], `${SEMANTICS_DOC} §4.4 exception framing`)

  // Nothing about Gmail is DISPROVEN, and the distinction from the rejected routes rests on it. A
  // document that acquired a DISPROVEN residual would no longer be exception-eligible at all.
  assertDeclares(profile, ["DISPROVEN = NONE"], `${PROFILE_DOC} residual register`)
})

// ─── G2 — the exact approved scope survives in full ─────────────────────────

// The exact approved scope, as an ordered key -> value map. Pinned as a BLOCK and in both directions:
// a missing key fails, an extra key fails, and a changed value fails. Matching these as free phrases
// anywhere in the document is not enough — every one of them is also discussed in surrounding prose,
// so a bound deleted from the block that grants it would still be found somewhere and pass. That is
// not hypothetical: the loose form of this pin let a draft-exclusion removal through.
//
// Each bound is load-bearing on its own. Drop MAILBOX_SCOPE and the unproven half of G-R2 goes live.
// Drop EXCLUDED and the profile claims a population Google documents as having unstable ids. Drop
// REPRESENTATION and one message acquires two canonical keys. Drop USE and an experimental acceptance
// silently becomes a production one. Drop COMPOSITION and the closed composite route reopens.
const APPROVED_SCOPE_BLOCK: ReadonlyArray<readonly [string, string]> = [
  ["RESOURCE_CLASS", "Gmail Message"],
  ["EXCLUDED", "draft-stage / DRAFT-labelled messages"],
  ["MAILBOX_SCOPE", "exactly ONE Gmail mailbox"],
  ["IDENTITY", "Message.id alone"],
  ["REPRESENTATION", "Gmail REST API hex string, byte-for-byte"],
  ["COMPOSITION", "none"],
  ["USE", "Phase-1 bounded experimental use only"],
]

// The same bounds as the semantic authority states them. Both documents must carry them: a reader who
// opens only one of the two must not get an unbounded exception.
const SEMANTICS_SCOPE_BOUNDS = [
  "Gmail Messages only",
  "gmail.message.rest.message-id v1",
  "non-draft messages in exactly ONE Gmail mailbox",
  "Gmail REST API hex representation only",
  "Phase-1 bounded experimental use only",
]

// The resource scope §2 declares, which is what the namespace-vs-profile width argument rests on.
const RESOURCE_SCOPE_BOUNDS = [
  "messages not carrying the DRAFT label, in exactly ONE Gmail mailbox",
  "draft-stage messages",
]

// The seven triggers that reopen the exception. A trigger that disappears is how an exception outlives
// the conditions it was granted under.
const REVISIT_TRIGGERS = [
  "a second Gmail mailbox",
  "another Gmail resource class",
  "another identity representation",
  "identity profile version bump",
  "Google identity authority",
  "evidence contradicting",
  "beyond Phase-1 bounded experimental use",
  "production use beyond Phase 1",
]

test("G2: the exact approved Gmail scope and its revisit triggers stay stated", async () => {
  const profile = await read(PROFILE_DOC)
  const semantics = await read(SEMANTICS_DOC)

  // Block 0 of §4.1 is the decision token; block 1 is the scope the token was granted over.
  const granted = fencedBlock(profile, GMAIL_EXCEPTION_HEADING, 1)
  const entries = granted.split("\n").map((line) => line.trim()).filter((line) => line.length > 0)
    .map((line) => {
      const match = /^([A-Z_]+)\s{2,}(.+)$/.exec(line)
      assert.ok(match, `the approved-scope block must stay a KEY  value map, got: ${line}`)
      return [(match as RegExpExecArray)[1], (match as RegExpExecArray)[2].trim()] as const
    })
  assert.deepEqual(entries.map(([key]) => key), APPROVED_SCOPE_BLOCK.map(([key]) => key),
    "the approved-scope key set is exactly what the PM granted; a bound may not be added or dropped")
  for (const [key, value] of APPROVED_SCOPE_BLOCK) {
    const declared = entries.find(([entryKey]) => entryKey === key)
    assert.equal((declared as readonly [string, string])[1], value,
      `${key} is part of the exact approved scope and may not be widened`)
  }

  // The same bounds in the semantic authority, read from the block that grants them there.
  const semanticsScope = fencedBlock(semantics, SEMANTICS_EXCEPTION_HEADING)
  assertDeclares(semanticsScope, SEMANTICS_SCOPE_BOUNDS, `${SEMANTICS_DOC} §4.4 scope block`)
  assert.ok(new RegExp(`state\\s+${SCOPED_EXCEPTION_STATE}`).test(semanticsScope),
    `${SEMANTICS_DOC} §4.4 must keep the scoped-exception state in the granting block`)

  // And the resource scope §2 declares, which the namespace-vs-profile width argument rests on.
  assertDeclares(fencedBlock(profile, "## 2. Resource scope"), RESOURCE_SCOPE_BOUNDS,
    `${PROFILE_DOC} §2 resource scope block`)
  assertDeclares(profile, [
    "The draft exclusion is a scope narrowing, not a repair, and it may not be dropped",
  ], `${PROFILE_DOC} draft-exclusion framing`)

  assertDeclares(profile, REVISIT_TRIGGERS, `${PROFILE_DOC} revisit triggers`)
  assertDeclares(semantics, REVISIT_TRIGGERS, `${SEMANTICS_DOC} §4.4 revisit triggers`)

  // Bounded Phase-1 correlation does NOT reopen it. The same sentence was misread the other way for
  // GitHub, which is why the ratified reading is pinned rather than left to the qualifier.
  assertDeclares(semantics, ["P1_2_DOES_NOT_REOPEN_PHASE1_IDENTITY_EXCEPTIONS"],
    `${SEMANTICS_DOC} §4.4 correlation reading`)

  // Why the mailbox bound is the substance: no admissible mailbox component exists, so the composite
  // repair is closed permanently. Deleting this makes the bound look like a preference.
  assertDeclares(profile, [
    "admissible mailbox component",
    "mutable display-and-routing value",
    "no immutable Google account or mailbox identifier exists in this API",
  ], `${PROFILE_DOC} composite closure`)

  // Both profile versions are named. A gate that moved without a version is a gate with no scope.
  assertDeclares(profile, [`${IDENTITY_PROFILE_ID} v1`, `${CONTENT_PROFILE_ID} v1`],
    `${PROFILE_DOC} profile versions`)
})

// ─── G3 — the content byte domain cannot drift ──────────────────────────────

// Fields Google returns beside the message. Each is out of the digest's subject, and each is a
// plausible thing for a later implementer to fold in "for completeness" — which would make the digest
// move on a label change and stop attesting message content.
const OUT_OF_SCOPE_FIELDS = [
  "`labelIds`", "`threadId`", "`historyId`", "`snippet`", "`sizeEstimate`", "`internalDate`",
  "`payload`", "`classificationLabelValues`",
]

test("G3: the Gmail content digest is over decoded RFC 2822 octets and nothing else", async () => {
  const profile = await read(PROFILE_DOC)
  const classification = section(profile, "## 6. Field classification")

  assert.ok(new RegExp(`Gmail MESSAGE content-scope profile\\s*=\\s*PROVEN\\b`).test(profile),
    `${PROFILE_DOC} must keep the content-scope profile PROVEN`)

  // The byte domain itself, stated as the domain and not as a description of one.
  assertDeclares(profile, [
    "decoding the `raw` field",
    "users.messages.get with format=RAW",
    "EXACT_PROVIDER_CONTENT_BYTES",
    "The entire email message in an RFC 2822 formatted and base64url encoded string",
  ], `${PROFILE_DOC} content byte domain`)

  // The three rejections that keep the domain where it is. Digesting the base64url text breaks the
  // biconditional; digesting the JSON resource or the HTTP bytes makes the digest a function of how
  // Atra called; format=full is not total over attachment bytes.
  assertDeclares(profile, [
    "not injective",
    "prettyPrint",
    "Its membership is undocumented",
    "reachable only through `messages.attachments.get`",
    "no secondary fetch",
  ], `${PROFILE_DOC} rejected content surfaces`)

  // Every out-of-scope field must stay classified. Presence alone is not enough — each must sit on a
  // row that answers "No" to whether a change moves the digest.
  for (const field of OUT_OF_SCOPE_FIELDS) {
    const rows = classification.split("\n").filter((line) => line.startsWith(`| ${field} | `))
    assert.equal(rows.length, 1,
      `${PROFILE_DOC} must classify ${field} on exactly one row, got ${rows.length}`)
    assert.ok(/\| No\b/.test(rows[0]),
      `${field} must stay out of the digest subject: ${rows[0]}`)
  }
  const rawRow = classification.split("\n").find((line) => line.startsWith("| `raw` "))
  assert.ok(rawRow !== undefined && /\*\*Yes\*\*/.test(rawRow),
    "`raw` must stay the one field whose change moves the digest")

  // The decode rule is the single step between Google's bytes and the hash, and it fails closed. A
  // rule that stops refusing is a hidden canonicalization gap, which a PROVEN scope may not have.
  assertDeclares(profile, [
    "RFC 4648 §5 URL-safe alphabet",
    "provider_content_encoding_inadmissible",
    "re-encoding the decoded octets",
    "`+` and `/` appear nowhere",
  ], `${PROFILE_DOC} transport-decode rule`)

  // No canonicalizer. Every candidate was rejected on one ground, and the ground must stay stated.
  assertDeclares(profile, [
    "makes the digest a function of **Atra's parser**",
    "`DETERMINISTIC_CANONICALIZATION_REQUIRED` is deliberately not returned",
  ], `${PROFILE_DOC} canonicalization decision`)

  // The content residual register, exact in both directions.
  for (const residual of ["G-C1", "G-C2", "G-C3", "G-C4"]) {
    assert.ok(/\bUNPROVEN\b/.test(residualLine(profile, residual)),
      `${residual} must stay UNPROVEN`)
  }
  assert.ok(/\bPROVEN\b/.test(residualLine(profile, "G-C5")),
    "G-C5 is asserted by Google's own contract and must stay PROVEN")
})

// ─── G4 — the canonical namespace is resource-scoped, and Gmail has no runtime ───

// Namespaces this WorkUnit deliberately did NOT introduce. No profile reviews these resources, so a
// member for one of them would be a namespace invented by analogy — the exact move §4.3 forbids.
const UNREVIEWED_GMAIL_NAMESPACES = ["gmail_thread", "gmail_draft", "gmail_attachment"]

// Markers of a Gmail acquisition path. None may appear under `app/**`: a reviewed profile states what
// an acquisition would have to satisfy and is not permission to build one.
const GMAIL_ACQUISITION_MARKERS = [
  "gmail.googleapis.com", "users.messages.get", "format=RAW", "messages.attachments.get",
  "gmail.message.rest",
]

// One pre-existing file legitimately names a Gmail host, and it is excluded by path rather than by
// weakening the marker set. `app/lib/externalToolClients.ts` is the legacy approved-execution client
// for `messages.send` — an outbound WRITE surface that long predates this profile and has nothing to
// do with source acquisition. Excluding it by name keeps the marker list sharp; the assertion below
// then holds it to a stricter rule than the general scan, because a read path appearing *there* is
// exactly how Gmail acquisition would arrive disguised as an existing integration.
const LEGACY_GMAIL_EXECUTION_CLIENT = "app/lib/externalToolClients.ts"
const GMAIL_READ_MARKERS = [
  "users.messages.get", "format=RAW", "messages.attachments.get", "messages/me/messages?",
  "gmail.message.rest", "SourceRecord",
]

test("G4: gmail_message is the canonical member, generic gmail is unreachable", async () => {
  const types = await read(NAMESPACE_TYPES)
  const validator = await read(RECORD_VALIDATOR)

  const union = /export type SourceIdentityNamespace =([\s\S]*?)\n\n/.exec(types)
  assert.ok(union, `${NAMESPACE_TYPES} must keep declaring SourceIdentityNamespace`)
  const members = [...(union as RegExpExecArray)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])

  assert.ok(members.includes("gmail_message"),
    "gmail_message is the reviewed Gmail resource namespace and must be a member")
  assert.equal(members.includes("gmail"), false,
    "the generic `gmail` placeholder was resolved and must not be a canonical namespace member")
  for (const speculative of UNREVIEWED_GMAIL_NAMESPACES) {
    assert.equal(members.includes(speculative), false,
      `${speculative} reviews no profile and must not be a member`)
  }

  // The validator's accepted set follows the union by type, so the two cannot drift — but a literal
  // `gmail` key would be an excess property, and asserting its absence keeps the failure legible.
  const accepted = /ACCEPTED_PROVIDERS: Record<SourceIdentityNamespace, true> = \{([\s\S]*?)\}/
    .exec(validator)
  assert.ok(accepted, `${RECORD_VALIDATOR} must keep declaring ACCEPTED_PROVIDERS`)
  const acceptedKeys = [...(accepted as RegExpExecArray)[1].matchAll(/(\w+):\s*true/g)].map((m) => m[1])
  assert.ok(acceptedKeys.includes("gmail_message"), "gmail_message must be accepted")
  assert.equal(acceptedKeys.includes("gmail"), false,
    "a record whose provider reads `gmail` must be refused as invalid_provider")

  // `SourceType` is the application's separate integration vocabulary and answers a different
  // question. Resolving a canonical namespace must not reach across and rewrite it.
  const sourceType = /export type SourceType =([\s\S]*?)\n\n/.exec(types)
  assert.ok(sourceType, `${NAMESPACE_TYPES} must keep declaring SourceType`)
  const sourceTypes = [...(sourceType as RegExpExecArray)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  assert.ok(sourceTypes.includes("gmail") && sourceTypes.includes("github"),
    "SourceType is unrelated integration vocabulary and must not be narrowed by a namespace decision")
  for (const speculative of [...UNREVIEWED_GMAIL_NAMESPACES, "gmail_message"]) {
    assert.equal(sourceTypes.includes(speculative), false,
      `SourceType must not be widened with the canonical namespace member ${speculative}`)
  }

  // A namespace names a key space; the profile names a narrower population inside it. Losing that
  // distinction is how a draft-stage record would look permitted rather than unreviewed.
  assertDeclares(types, [
    "A member names a KEY SPACE, not the population a profile covers",
    "no reviewed profile, not under a permissive one",
  ], `${NAMESPACE_TYPES} namespace-vs-profile width`)
})

test("G4: no Gmail acquisition, producer or transport exists under app/**", async () => {
  const { readdir } = await import("node:fs/promises")

  async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const files: string[] = []
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) files.push(...await walk(full))
      else if (/\.(ts|tsx|mts)$/.test(entry.name)) files.push(full)
    }
    return files
  }

  const offenders: string[] = []
  let scanned = 0
  for (const file of await walk(path.join(rootDir, "app"))) {
    const relative = path.relative(rootDir, file).split(path.sep).join("/")
    const source = await readFile(file, "utf8")
    scanned += 1
    const markers = relative === LEGACY_GMAIL_EXECUTION_CLIENT
      ? GMAIL_READ_MARKERS
      : GMAIL_ACQUISITION_MARKERS
    for (const marker of markers) {
      if (source.includes(marker)) offenders.push(`${relative}: ${marker}`)
    }
  }
  // The exclusion must stay non-vacuous: if the legacy write client is ever deleted or renamed, the
  // allowlist entry silently stops covering anything and this test would quietly weaken.
  assert.ok(
    (await readFile(path.join(rootDir, LEGACY_GMAIL_EXECUTION_CLIENT), "utf8"))
      .includes("gmail.googleapis.com"),
    `${LEGACY_GMAIL_EXECUTION_CLIENT} is excluded by name and must still be the file that needs it`)
  assert.ok(scanned > 100, `the app/** scan must be non-vacuous, scanned ${scanned}`)
  assert.deepEqual(offenders, [],
    `a reviewed Gmail profile authorizes no runtime path:\n${offenders.join("\n")}`)

  // And the authority must say so, so the absence is a stated boundary rather than an accident of
  // sequencing that the next WorkUnit reads as an omission.
  assertDeclares(await read(SEMANTICS_DOC), [
    "Gmail acquisition does **not** exist",
    "`ACQUISITION_SCOPE_CHANGE_REQUIRED` stays `YES` for Gmail",
    "A reviewed profile states what an acquisition would have to satisfy",
  ], `${SEMANTICS_DOC} Gmail acquisition boundary`)
})

// ─── G5 — the phase gates Gmail does not move ──────────────────────────────

// The three entry conditions a ready profile pair could be misread as advancing. N2 needs a frozen
// dataset, N3 needs two providers REPRESENTED IN IT, and N4 is quantified over that dataset's provider
// set — none of which a profile supplies.
const UNSATISFIED_ENTRY_CONDITIONS = ["N2", "N3", "N4"]

test("G5: a ready Gmail profile pair moves no P1-2 entry condition", async () => {
  const product = await read(PRODUCT_AUTHORITY_DOC)
  const lines = product.split("\n")

  for (const condition of UNSATISFIED_ENTRY_CONDITIONS) {
    const declarations = lines.filter((line) => new RegExp(`^${condition}\\s{2,}\\S`).test(line.trim()))
    assert.equal(declarations.length, 1,
      `${PRODUCT_AUTHORITY_DOC} must declare ${condition} exactly once, got ${declarations.length}`)
    assert.ok(/\bNOT SATISFIED\b/.test(declarations[0]),
      `${condition} must stay NOT SATISFIED — no dataset exists: ${declarations[0]}`)
  }

  // N1 is the one that IS satisfied, pinned so the block above cannot pass by the whole criterion
  // having been emptied out.
  const n1 = lines.filter((line) => /^N1\s{2,}\S/.test(line.trim()))
  assert.equal(n1.length, 1, "N1 must stay declared exactly once")
  assert.ok(/\bSATISFIED\b/.test(n1[0]) && !/\bNOT SATISFIED\b/.test(n1[0]),
    `N1 is satisfied and must stay so: ${n1[0]}`)

  // The exact remaining binding, recorded as a token so it cannot soften into prose. "Satisfiable" is
  // not "satisfied", and the distinction is the whole content of this WorkUnit's N4 effect.
  assertDeclares(product, [
    "N4_DATASET_PROVIDER_PROFILE_PREREQUISITE_SATISFIABLE_FOR_GITHUB_GMAIL_ROUTE",
    "N4 = NOT_SATISFIED",
    "there is no provider set to quantify over",
    "not the condition itself",
  ], `${PRODUCT_AUTHORITY_DOC} N4 binding`)

  // P1-2 entry readiness is unchanged. `tests/phase1AuthoritySync.test.mts` also pins this; it is
  // repeated here because this is the WorkUnit whose result most looks like readiness.
  const status = lines.map((line) => /^P1_2_ENTRY_STATUS = (\S+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null).map((match) => match[1])
  assert.deepEqual(status, ["NOT_READY"],
    "a reviewed profile pair is not a dataset; P1-2 entry stays NOT_READY")
})
