import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Source-universe vocabulary pins.
//
// This document names the kinds of truth Atra needs. A vocabulary document is the cheapest place for
// three specific failures to happen, because none of them breaks anything when it does:
//
// 1. A taxonomy grows a schedule and becomes a second roadmap. Phase order lives in the Product
//    Authority; a layer document that starts sequencing phases competes with it silently.
// 2. A product judgment ("Slack is valuable") is read as a canonical permission ("Slack may produce a
//    SourceRecordV1"). The four axes exist to keep those apart, and collapsing them costs nothing at
//    the moment it happens.
// 3. A layer is written as owning a channel rather than a kind of truth. That is how "a decision" ends
//    up meaning "something said in a meeting", and how a recorded decision in Slack, Gmail or a
//    written ADR becomes unrepresentable while every gate still reads correct.
//
// What is pinned here is tokens, load-bearing statements and the eligibility copy — and the
// eligibility copy is checked against the authority as parsed, never against values restated here.
// Nothing here asserts prose wording, formatting or examples, and nothing here is a second source for
// any gate state.

const rootDir = fileURLToPath(new URL("../", import.meta.url))

const UNIVERSE_DOC = "docs/architecture/ATRA_SOURCE_UNIVERSE.md"
const SEMANTICS_DOC = "docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md"
const PRODUCT_AUTHORITY_DOC = "docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md"
const DOCTRINE_DOC = "docs/ATRA_DOCTRINE.md"

// The four questions a provider status must never collapse into one.
const AXES = [
  "AXIS_PRODUCT_VALUE",
  "AXIS_CANONICAL_ELIGIBILITY",
  "AXIS_IMPLEMENTATION_READINESS",
  "AXIS_DAILY_USE_VALUE",
]

// The layer non-collapse rules. The set is pinned, not merely each member's presence: dropping one is
// how two layers quietly merge, and merging them is how "a calendar event" becomes "the work".
const LAYER_INVARIANTS = [
  "I1  WORK_TRUTH_IS_NOT_HUMAN_SIGNAL",
  "I2  HUMAN_SIGNAL_IS_NOT_DECISION_EVIDENCE",
  "I3  DURABLE_CONTEXT_IS_NOT_DECISION_EVIDENCE",
  "I4  TIME_CONSTRAINT_IS_NOT_WORK_IDENTITY",
  "I5  USER_CURRENT_STATE_IS_NOT_EXTERNAL_EVIDENCE",
  "I6  ACTION_RESULT_IS_NOT_WORK_TRUTH",
  "I7  EVIDENCE_IS_NOT_INFERRED_DECISION",
]

// Multi-role evidence. One source may answer several questions at once; a layer owns a semantic
// responsibility, not a provider. Without these two, L4 drifts back into owning transcripts and the
// only way to record a Slack decision becomes inventing a second fake source for the same object.
const MULTI_ROLE_TOKENS = [
  "SOURCE_MAY_CONTRIBUTE_TO_MULTIPLE_LAYERS",
  "MULTI_ROLE_IS_NOT_SOURCE_SPLITTING",
]

// The two local eligibility labels. Neither is a value SOURCE_RECORD_V1_SEMANTICS.md §4 carries, and
// the document has to say so itself — a header claiming the whole column is a §4 copy is false while
// these exist, and false in the permissive direction.
const AUTHORITY_SILENT_VALUE = "`both=REQUIRED_UNPROVEN_UNRECORDED`"
const NOT_A_SOURCE_VALUE = "`NOT_A_CANONICAL_SOURCE`"
const LOCAL_ELIGIBILITY_LABELS = [AUTHORITY_SILENT_VALUE, NOT_A_SOURCE_VALUE]

// Which §4 gate subject each matrix namespace is claiming to copy. This is a *naming* correspondence
// between two documents, not a gate value: no state token appears on the right-hand side, so a gate
// moving in §4 cannot be satisfied by anything written here. A namespace absent from this map is one
// §4 says nothing about.
const MATRIX_ROW_TO_SECTION4_SUBJECT: ReadonlyMap<string, string> = new Map([
  ["`github_issue`", "GitHub issue"],
  ["`github_pull_request`", "GitHub pull request"],
  ["GitHub, other resources", "GitHub other resources"],
  ["`slack`", "Slack"],
  ["`google_calendar`", "Google Calendar"],
])

// Statements that keep the compositions descriptive. Without them PHASE1_CORE reads as a requirement,
// and P1-2 entry silently gains a third layer it was never ratified to need.
const COMPOSITION_BOUNDARY = [
  "COMPOSITIONS_ARE_NOT_ENTRY_CRITERIA",
  "COMPOSITIONS_ARE_NOT_PHASE_ORDER",
]

async function read(relative: string): Promise<string> {
  return readFile(path.join(rootDir, relative), "utf8")
}

// Content assertions run against whitespace-normalized text, and structural ones against the raw
// lines. A statement that survives being re-wrapped at a different column is the same statement, and
// a governance test that fails on re-wrapping teaches people to stop editing the document.
function flatten(text: string): string {
  return text.replace(/\s+/g, " ")
}

function assertDeclares(doc: string, phrases: string[], label: string): void {
  const flat = flatten(doc)
  const missing = phrases.filter((phrase) => !flat.includes(flatten(phrase)))
  assert.deepEqual(missing, [], `${label} must stay declared:\n${missing.join("\n")}`)
}

// --- SOURCE_RECORD_V1_SEMANTICS.md §4, parsed -------------------------------------------------
//
// §4 records its gates as `<subject> = <STATE>` inside one fenced block. Parsing it is the whole
// point: a cross-check that restates the expected states as constants here is a second copy of the
// authority, and two copies drift in exactly the case this test exists to catch.

interface ProviderGate {
  readonly identity: string
  readonly content: string
}

function section4Subject(rawSubject: string): { subject: string; gate: "identity" | "content" } | null {
  const gate = rawSubject.includes("content-scope profile")
    ? "content"
    : rawSubject.includes("identity profile")
      ? "identity"
      : null
  if (gate === null) return null
  const subject = rawSubject
    .replace(gate === "content" ? "content-scope profile" : "identity profile", " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return { subject, gate }
}

function parseSection4Gates(semantics: string): Map<string, ProviderGate> {
  const lines = semantics.split("\n")
  const start = lines.findIndex((line) => line.startsWith("## 4. Provider Profile Gates"))
  assert.ok(start !== -1, `${SEMANTICS_DOC} must have a "## 4. Provider Profile Gates" section`)
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "))
  const section = lines.slice(start, end === -1 ? lines.length : end)

  const fenceStart = section.findIndex((line) => line.trim() === "```text")
  assert.ok(fenceStart !== -1, "§4 must record its gates in a fenced text block")
  const fenceEnd = section.findIndex((line, index) => index > fenceStart && line.trim() === "```")
  assert.ok(fenceEnd !== -1, "§4's gate block must be closed")

  const identity = new Map<string, string>()
  const content = new Map<string, string>()
  for (const line of section.slice(fenceStart + 1, fenceEnd)) {
    if (line.trim() === "") continue
    const match = /^(.*?)\s+=\s+(\S+)$/.exec(line)
    assert.ok(match !== null, `unparsable §4 gate line, the cross-check cannot be trusted: ${line}`)
    const parsed = section4Subject(match[1].trim())
    assert.ok(parsed !== null,
      `§4 gate line names neither an identity nor a content-scope profile: ${line}`)
    const target = parsed.gate === "identity" ? identity : content
    assert.ok(!target.has(parsed.subject),
      `§4 records ${parsed.subject} ${parsed.gate} twice; the cross-check cannot pick one`)
    target.set(parsed.subject, match[2])
  }

  assert.ok(identity.size > 0 && content.size > 0, "§4 must record identity and content gates")
  assert.deepEqual([...identity.keys()].sort(), [...content.keys()].sort(),
    "every §4 subject must carry both an identity gate and a content-scope gate")

  const gates = new Map<string, ProviderGate>()
  for (const [subject, identityState] of identity) {
    gates.set(subject, { identity: identityState, content: content.get(subject)! })
  }
  return gates
}

// The document's own rendering convention for a copied gate pair, applied to whatever §4 currently
// says. This is what makes case A–D detectable: the expected cell is computed from the authority, so
// a gate that moves changes the expected cell and a stale matrix row stops matching it.
function renderEligibility(gate: ProviderGate): string {
  return gate.identity === gate.content
    ? `\`both=${gate.identity}\``
    : `\`content=${gate.content}\` \`identity=${gate.identity}\``
}

interface MatrixRow {
  readonly namespace: string
  readonly eligibility: string
  readonly line: string
}

function parseProviderMatrix(doc: string): MatrixRow[] {
  const lines = doc.split("\n")
  const start = lines.indexOf("## Provider Status Matrix")
  assert.ok(start !== -1, "the provider status matrix section must exist")
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "))
  const rows = lines
    .slice(start, end === -1 ? lines.length : end)
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---") && !line.startsWith("| Namespace"))
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim())
      // cells[0] is the empty span before the leading pipe.
      return { namespace: cells[1], eligibility: cells[4], line }
    })
  assert.ok(rows.length > 0, "the provider status matrix must have rows")
  return rows
}

test("source universe: the four axes stay separate", async () => {
  const doc = await read(UNIVERSE_DOC)
  assertDeclares(doc, [...AXES, "AXES_NEVER_COLLAPSE"], "the four axes")

  // The direction of the separation is the point. Product value must be stated as a judgment recorded
  // here, and eligibility as a state owned elsewhere; a document that declared both without saying
  // which one it may originate has already lost the distinction.
  assertDeclares(doc, [
    "are **product judgments** recorded here",
    "are **evidence states owned elsewhere**",
  ], "axis ownership")
})

test("source universe: layer non-collapse invariants stay declared", async () => {
  assertDeclares(await read(UNIVERSE_DOC), LAYER_INVARIANTS, "layer invariants")
})

test("source universe: a layer is a kind of truth, not a communication channel", async () => {
  const doc = await read(UNIVERSE_DOC)

  // CASE A. A decision recorded asynchronously in writing — "Decision: use option B." in Slack, an
  // approval in Gmail, an adopted decision in a written ADR — must be representable as Decision
  // Evidence. The layer that scoped itself to synchronous communication with no written trace made
  // most real decisions unrepresentable while every gate in the document still read correct.
  assertDeclares(doc, [
    "Decision Evidence is a kind of truth, not a communication channel",
    "Asynchronous and written decisions are representable here",
  ], "L4 as a kind of truth")

  // The same claim, from the other side: no re-narrowing to a channel. These patterns are the shapes
  // the exclusion takes, not one wording of it.
  const flat = flatten(doc)
  const channelExclusions: Array<[RegExp, string]> = [
    [/synchronous communication, where the decision leaves no written trace/i,
      "L4 scoped to synchronous communication with no written trace"],
    [/asynchronous[^.\n]{0,60}is not a decision/i,
      "asynchronous discussion categorically excluded from Decision Evidence"],
    [/written specification states intent; it does not record that a decision was taken/i,
      "written specification categorically excluded from Decision Evidence"],
    [/decisions? (?:can |may )?only (?:be |arise )?[^.\n]{0,40}(?:meeting|synchronous|transcript)/i,
      "Decision Evidence restricted to meetings"],
  ]
  const reNarrowed = channelExclusions
    .filter(([pattern]) => pattern.test(flat))
    .map(([, label]) => label)
  assert.deepEqual(reNarrowed, [],
    `Decision Evidence must not be re-scoped to a channel:\n${reNarrowed.join("\n")}`)

  // CASE B and CASE C. Insufficiency, not exclusion: discussion that sounds conclusive is still not a
  // recorded decision, and a specification that merely describes an option has not adopted it. I2 and
  // I3 keep saying that; I7 is what stops Atra closing the gap by inference.
  assertDeclares(doc, [
    "Discussion does not by itself prove that a decision was taken",
    "does not, merely by existing, record that a decision was taken",
    "A decision is recorded, never inferred",
  ], "decision insufficiency rules")

  // CASE D. A written decision record contributes Decision Evidence and stays Durable Context. That
  // is only expressible because a source may hold more than one role.
  assertDeclares(doc, [
    ...MULTI_ROLE_TOKENS,
    "does contribute Decision Evidence, and remains Durable Context",
  ], "multi-role evidence")

  // CASE E. A transcript is evidence. What Atra derives from it is a candidate for human judgment,
  // and no automatic formalization is authorized — unchanged by the rescope above.
  assertDeclares(doc, [
    "**A transcript is evidence; a decision is a derived claim.**",
    "This layer never\ngains automatic formalization authority",
  ], "the transcript boundary")

  // Multi-role must not become a route to a provider count. One source answering two questions is
  // still one provider, and P1-2 entry needs two independent ones.
  assert.ok(flat.includes("a layer count is never a provider count"),
    "multi-role contribution must not be readable as satisfying the two-provider entry condition")
})

test("source universe: overlap is classified by shared kind of truth, not by acquisition context", async () => {
  const doc = await read(UNIVERSE_DOC)

  // Classification has to follow the layers a pair actually shares. Slack and a meeting transcript
  // both carry Human Signal and both can carry a recorded decision, so calling them ORTHOGONAL states
  // the opposite of what the layers say — and it is the same defect as scoping L4 to a channel,
  // surviving in a table after the prose was fixed.
  const lines = doc.split("\n")
  const start = lines.indexOf("## Overlap Classification")
  assert.ok(start !== -1, "the overlap classification section must exist")
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "))
  const rows = lines
    .slice(start, end === -1 ? lines.length : end)
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---") && !line.startsWith("| Pair"))
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim())
      return { pair: cells[1], classification: cells[3] }
    })
  assert.ok(rows.length > 0, "the overlap classification table must have rows")

  const shareDecisionEvidence = rows.filter(
    (row) => /slack/i.test(row.pair) && /transcript/i.test(row.pair),
  )
  assert.ok(shareDecisionEvidence.length > 0,
    "the Slack × meeting transcript pair must stay classified; it is the pair the layer rescope turns on")
  const orthogonal = shareDecisionEvidence
    .filter((row) => row.classification.includes("ORTHOGONAL"))
    .map((row) => `${row.pair}: ${row.classification}`)
  assert.deepEqual(orthogonal, [],
    `sources that can both carry Decision Evidence are not orthogonal:\n${orthogonal.join("\n")}`)

  // And the rule the row follows from, so the next pair is classified the same way.
  assertDeclares(doc, [
    "Classification is per shared layer role, not per provider",
    "A pair is never `ORTHOGONAL` merely because its two sources are acquired differently",
  ], "the overlap classification rule")
})

test("source universe: eligibility is copied from the semantics document, never originated", async () => {
  const doc = await read(UNIVERSE_DOC)

  // The header has to be true of every value in the column. Two of them are this document's own
  // labels rather than §4 values, so a blanket "this column is a copy of §4" is false — and false in
  // the direction that makes a local label look authority-backed.
  assertDeclares(doc, [
    "**The `Canonical Eligibility` column originates nothing.**",
    "COPIED_FROM_AUTHORITY",
    "AUTHORITY_SILENT",
    "NOT_A_SOURCE_LAYER",
    "A value here that disagrees with §4 is a defect in this document",
  ], "eligibility copy boundary")

  const gates = parseSection4Gates(await read(SEMANTICS_DOC))
  const matrixRows = parseProviderMatrix(doc)

  // Every gate §4 records must still have a row here. A namespace §4 starts speaking about, and this
  // document stays silent on, is the same staleness as a row carrying the wrong value.
  const claimedSubjects = new Set(
    matrixRows
      .map((row) => MATRIX_ROW_TO_SECTION4_SUBJECT.get(row.namespace))
      .filter((subject): subject is string => subject !== undefined),
  )
  const unclaimed = [...gates.keys()].filter((subject) => !claimedSubjects.has(subject)).sort()
  assert.deepEqual(unclaimed, [],
    `§4 records gates this matrix does not carry a row for:\n${unclaimed.join("\n")}`)

  // Rows that claim to copy §4 must equal what §4 currently says, rendered by the document's own
  // convention. Both halves travel together: a row showing only the proven content gate would read as
  // a fully proven provider, and the scoped identity exception is not a proof.
  const drifted: string[] = []
  for (const row of matrixRows) {
    const subject = MATRIX_ROW_TO_SECTION4_SUBJECT.get(row.namespace)
    if (subject === undefined) continue
    const gate = gates.get(subject)
    assert.ok(gate !== undefined,
      `${row.namespace} claims to copy §4 subject "${subject}", which §4 no longer records`)
    const expected = renderEligibility(gate)
    if (row.eligibility !== expected) {
      drifted.push(`${row.namespace}: matrix says ${row.eligibility}, §4 says ${expected}`)
    }
  }
  assert.deepEqual(drifted, [],
    `the matrix must copy ${SEMANTICS_DOC} §4 as it currently reads:\n${drifted.join("\n")}`)

  // Where §4 is silent, absence stays absence of a record. It may never be rendered as a gate state,
  // because a namespace with no reviewed profile reading anything §4-shaped is permission by silence.
  const permissiveBySilence = matrixRows
    .filter((row) => !MATRIX_ROW_TO_SECTION4_SUBJECT.has(row.namespace))
    .filter((row) => !LOCAL_ELIGIBILITY_LABELS.includes(row.eligibility))
    .map((row) => `${row.namespace}: ${row.eligibility}`)
  assert.deepEqual(permissiveBySilence, [],
    `§4 records no gate for these namespaces, so they may carry only ${LOCAL_ELIGIBILITY_LABELS.join(" or ")}:\n${permissiveBySilence.join("\n")}`)

  // The closed vocabulary, built from the authority rather than restated beside it: whatever §4
  // currently renders to, plus this document's two local labels. Anything else is an invented state.
  const allowed = new Set([
    ...[...gates.values()].map(renderEligibility),
    ...LOCAL_ELIGIBILITY_LABELS,
  ])
  const offVocabulary = matrixRows
    .filter((row) => !allowed.has(row.eligibility))
    .map((row) => `${row.namespace}: ${row.eligibility}`)
  assert.deepEqual(offVocabulary, [],
    `every matrix row must carry a §4-derived value or a declared local label:\n${offVocabulary.join("\n")}`)

  // The unrecorded label must stay explicitly not-weaker. Read the other way it becomes permission by
  // silence, which is the exact opposite of what §4 requires.
  assertDeclares(doc, [
    "is **not weaker** than `REQUIRED_UNPROVEN`",
    "Absence of a written gate is absence of a record, never absence of a requirement",
    "may not manufacture a §4 entry",
  ], "the unrecorded-gate label")
})

test("source universe: product hypotheses stay labelled as hypotheses", async () => {
  const doc = await read(UNIVERSE_DOC)

  // A differentiation judgment is not a repository fact. Unlabelled, "distinctive capability" reads
  // as a finding, and the first plan to cite it inherits a market claim nobody made.
  assertDeclares(doc, [
    "DIFFERENTIATION_HYPOTHESIS",
    "unvalidated product hypothesis",
  ], "the differentiation hypothesis label")

  const flat = flatten(doc)
  assertDeclares(doc, [
    "None of them is a user-research finding, a market fact, a competitive survey, a provider",
    "eligibility state or Product Authority",
  ], "what the differentiation hypothesis is not")

  // A universal claim about products nobody examined is not bounded by calling the column a
  // hypothesis. The claim itself has to go.
  assert.ok(!/Every integration product reaches/i.test(flat),
    "a universal competitor claim may not be stated as fact; state the bounded hypothesis instead")
  assert.ok(flat.includes("UNVALIDATED"),
    "the differentiation hypothesis must carry its unvalidated state where it is stated")
})

test("source universe: it is subordinate and authorizes nothing", async () => {
  const doc = await read(UNIVERSE_DOC)

  assertDeclares(doc, [
    "Status: Subordinate product-domain reference. Not a roadmap, not a phase plan, not a gate.",
    "RUNTIME_IMPLEMENTATION = 0",
    "IMPLEMENTATION_NEXT    = NO",
    "Where this document disagrees with any of them, they govern and this document is the defect.",
  ], "subordination and non-authorization")

  // Compositions describe product shape. The moment one is readable as a requirement, it competes
  // with the ratified P1-2 entry criterion, which needs two independent providers and no layer count.
  assertDeclares(doc, COMPOSITION_BOUNDARY, "composition boundary")
  assert.ok(flatten(doc).includes("P1-2 entry needs **two independent providers**"),
    "the ratified entry condition must stay stated as the thing compositions do not change")

  // The Product Authority keeps its exclusive role. The structural scan for a competing Primary
  // Product / Roadmap Authority lives in phase1AuthoritySync.test.mts and covers this file too; what
  // is pinned here is the positive statement that phase order is owned elsewhere.
  assert.ok(flatten(doc).includes(`\`${path.basename(PRODUCT_AUTHORITY_DOC)}\` owns phase order`),
    "phase order must stay attributed to the Product Authority")

  // Cross-document references have to resolve, and the sections cited have to exist. A bare filename
  // for a file that lives one directory up is the cheap version of citing an authority that is not
  // there to check.
  assert.ok(flatten(doc).includes(`\`${DOCTRINE_DOC}\``),
    `the doctrine must be cited by its repo-relative path \`${DOCTRINE_DOC}\``)
  const doctrine = await read(DOCTRINE_DOC)
  assertDeclares(doctrine, ["## 7. What Atra Must Not Do", "## 11. Product Invariant"],
    `the doctrine sections ${UNIVERSE_DOC} cites`)
})
