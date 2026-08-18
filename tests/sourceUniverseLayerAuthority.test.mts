import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Source-universe vocabulary pins.
//
// This document names the kinds of truth Atra needs. A vocabulary document is the cheapest place for
// two specific failures to happen, because neither breaks anything when it does:
//
// 1. A taxonomy grows a schedule and becomes a second roadmap. Phase order lives in the Product
//    Authority; a layer document that starts sequencing phases competes with it silently.
// 2. A product judgment ("Slack is valuable") is read as a canonical permission ("Slack may produce a
//    SourceRecordV1"). The four axes exist to keep those apart, and collapsing them costs nothing at
//    the moment it happens.
//
// What is pinned here is tokens, required statements and the eligibility copy. Nothing here asserts
// prose wording or formatting, and nothing here is a second source for any gate state.

const rootDir = fileURLToPath(new URL("../", import.meta.url))

const UNIVERSE_DOC = "docs/architecture/ATRA_SOURCE_UNIVERSE.md"
const SEMANTICS_DOC = "docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md"
const PRODUCT_AUTHORITY_DOC = "docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md"

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
]

// Namespaces whose gates SOURCE_RECORD_V1_SEMANTICS.md §4 enumerates as REQUIRED_UNPROVEN. The matrix
// copies §4; this pins that the copy still matches, so a product judgment recorded here can never
// drift into a stronger eligibility claim than the semantics document actually makes.
const REQUIRED_UNPROVEN_ROWS = ["`slack`", "`google_calendar`", "GitHub, other resources"]

// The two resources that do produce a record, and the exact identity state they carry. Both halves
// matter: the content gate is proven and the identity gate is not, and a row that showed only the
// first would read as a fully proven provider.
const PRODUCING_ROWS = ["`github_issue`", "`github_pull_request`"]
const PRODUCING_ELIGIBILITY =
  "`content=PROVEN` `identity=PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL`"

// Eligibility values this document is allowed to carry at all. Anything else is an invented state.
const ELIGIBILITY_VOCABULARY = [
  PRODUCING_ELIGIBILITY,
  "`both=REQUIRED_UNPROVEN`",
  "`both=REQUIRED_UNPROVEN_UNRECORDED`",
  "`NOT_A_CANONICAL_SOURCE`",
]

// Statements that keep the compositions descriptive. Without them PHASE1_CORE reads as a requirement,
// and P1-2 entry silently gains a third layer it was never ratified to need.
const COMPOSITION_BOUNDARY = [
  "COMPOSITIONS_ARE_NOT_ENTRY_CRITERIA",
  "COMPOSITIONS_ARE_NOT_PHASE_ORDER",
]

async function read(relative: string): Promise<string> {
  return readFile(path.join(rootDir, relative), "utf8")
}

function assertDeclares(doc: string, phrases: string[], label: string): void {
  const missing = phrases.filter((phrase) => !doc.includes(phrase))
  assert.deepEqual(missing, [], `${label} must stay declared:\n${missing.join("\n")}`)
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

test("source universe: eligibility is copied from the semantics document, never originated", async () => {
  const doc = await read(UNIVERSE_DOC)

  assertDeclares(doc, [
    "is a copy of `SOURCE_RECORD_V1_SEMANTICS.md` §4 and originates",
    "A value here that disagrees with §4 is a defect in this document",
  ], "eligibility copy boundary")

  // Only the provider matrix. Other tables in the document carry layer names too, and scanning them
  // for eligibility values would fail on tables that were never making an eligibility claim.
  const lines = doc.split("\n")
  const start = lines.indexOf("## Provider Status Matrix")
  assert.ok(start !== -1, "the provider status matrix section must exist")
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "))
  const matrixRows = lines
    .slice(start, end === -1 ? lines.length : end)
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---") && !line.startsWith("| Namespace"))
  assert.ok(matrixRows.length > 0, "the provider status matrix must have rows")

  // Every matrix row carries an eligibility value from the closed vocabulary. An invented state is
  // how a provider gains standing without a reviewed profile.
  const offVocabulary = matrixRows.filter(
    (row) => !ELIGIBILITY_VOCABULARY.some((value) => row.includes(value)),
  )
  assert.deepEqual(offVocabulary, [],
    `every matrix row must carry a known eligibility value:\n${offVocabulary.join("\n")}`)

  // The copy still matches §4 for every gate §4 enumerates.
  const semantics = await read(SEMANTICS_DOC)
  for (const subject of ["Slack", "Google Calendar"]) {
    assert.ok(
      semantics.includes(`${subject} identity profile                `) ||
        new RegExp(`^${subject} identity profile\\s+= REQUIRED_UNPROVEN$`, "m").test(semantics),
      `${subject} must still read REQUIRED_UNPROVEN in ${SEMANTICS_DOC}`)
  }
  for (const row of REQUIRED_UNPROVEN_ROWS) {
    const [matched] = matrixRows.filter((line) => line.includes(row))
    assert.ok(matched !== undefined, `${row} must have a matrix row`)
    assert.ok(matched.includes("`both=REQUIRED_UNPROVEN`"),
      `${row} must copy REQUIRED_UNPROVEN from ${SEMANTICS_DOC} §4`)
  }

  // The two producing resources keep both halves of their state. The scoped exception is not a
  // proof, and a row that dropped the identity half would say it was.
  for (const row of PRODUCING_ROWS) {
    const [matched] = matrixRows.filter((line) => line.includes(row))
    assert.ok(matched !== undefined, `${row} must have a matrix row`)
    assert.ok(matched.includes(PRODUCING_ELIGIBILITY),
      `${row} must carry the proven content gate and the unproven identity residual together`)
  }

  // The unrecorded label must stay explicitly not-weaker. Read the other way it becomes permission by
  // silence, which is the exact opposite of what §4 requires.
  assertDeclares(doc, [
    "It is **not weaker** than `REQUIRED_UNPROVEN`",
    "Absence of a written gate is absence of a record, never absence of a requirement",
  ], "the unrecorded-gate label")
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
  assert.ok(doc.includes("P1-2 entry needs **two independent providers**"),
    "the ratified entry condition must stay stated as the thing compositions do not change")

  // The Product Authority keeps its exclusive role. The structural scan for a competing Primary
  // Product / Roadmap Authority lives in phase1AuthoritySync.test.mts and covers this file too; what
  // is pinned here is the positive statement that phase order is owned elsewhere.
  assert.ok(doc.includes(`\`${path.basename(PRODUCT_AUTHORITY_DOC)}\` owns phase order`),
    "phase order must stay attributed to the Product Authority")
})
