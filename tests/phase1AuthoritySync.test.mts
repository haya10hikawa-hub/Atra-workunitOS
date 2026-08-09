import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isCodeFilePath } from "../scripts/lib/typescriptModuleGraph.mjs"

// P0_AUTHORITY_SYNC governance pins.
//
// This WorkUnit records PM decisions that are claims about authority, and authority claims decay
// silently: nothing fails when a reader starts assuming the opposite. Two decay paths are specific
// to this record and are pinned structurally rather than by restatement.
//
// 1. A second document quietly becomes a competing Primary Product / Roadmap Authority.
// 2. The three PM-ratified *semantic* names quietly become implementation permission — the exact
//    confusion decision C exists to prevent. The allowlist in architectureBoundaries.test.mts
//    already forbids the declarations; what is pinned here is that the ratification did not move,
//    and that the allowlist itself was not expanded alongside the ratification.

const rootDir = fileURLToPath(new URL("../", import.meta.url))

const PRODUCT_AUTHORITY_DOC = "docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md"
const ARCHITECTURE_AUTHORITY_DOC = "docs/architecture/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md"
const ALLOWLIST_SOURCE = "tests/architectureBoundaries.test.mts"

// The three names decision C ratified as Phase-1 semantic targets. Ratified as *names*; not
// authorized as declarations, and each may be authorized no earlier than the phase recorded here.
const RATIFIED_SEMANTIC_TARGETS = [
  { name: "CorrelationGroupV1", earliestPhase: "P1-2" },
  { name: "WorkUnitCandidateV1", earliestPhase: "P1-3" },
  { name: "WorkUnitCorrectionV1", earliestPhase: "P1-5" },
]

// Proposal names decision C did NOT ratify. These have no semantic status and no code status, so
// they must never appear in the ratified table.
const UNRATIFIED_PROPOSAL_NAMES = [
  "CanonicalSourceRecordV1", "WorkUnitReviewV1", "ReviewedWorkUnitV1", "ActionPreparationV1",
]

// The one canonical record declaration authorized at this head, and the literal that carries it.
const AUTHORIZED_CODE_DECLARATION = { name: "SourceRecordV1", path: "app/lib/domain/source/types.ts" }

// A forecast is not a milestone. The PM ratified the Gate's position in the spine, not its date.
const UNRATIFIED_VALUE_GATE_DATE = "2026-09-04"

// The architecture program's two status states. Its `Status:` field read "Draft ... review" while
// the ratification was recorded twelve lines below it, so both were readable as current. The draft
// wording is a true fact about the `066a43c3` snapshot and must stay visible; what must not recur is
// that wording occupying the unqualified current `Status:` field.
const ARCHITECTURE_CURRENT_STATUS = "Status: Ratified subordinate Technical / Domain Architecture Authority"
const ARCHITECTURE_HISTORICAL_STATUS = "Draft for PM and independent security/architecture review"
const ARCHITECTURE_HISTORICAL_MARKER =
  "Historical status at evidence snapshot `066a43c3df07f3da10a2fc93ff7d90157c732114`:"

async function readProductAuthority(): Promise<string> {
  return readFile(path.join(rootDir, PRODUCT_AUTHORITY_DOC), "utf8")
}

function assertDocDeclares(doc: string, phrases: string[], label: string): void {
  const missing = phrases.filter((phrase) => !doc.includes(phrase))
  assert.deepEqual(missing, [], `${label} must stay declared:\n${missing.join("\n")}`)
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

test("phase-1 authority: exactly one Primary Product / Roadmap Authority is declared", async () => {
  const doc = await readProductAuthority()
  assertDocDeclares(doc, [
    "Status: Primary Product / Roadmap Authority, ratified by the human PM.",
    "ATRA_PHASE1_PLAN_AUTHORITY_RATIFIED_WITH_MODIFICATIONS",
    "This document is the single Primary Product / Roadmap Authority.",
    "### What is not Product Authority",
  ], "product authority declaration")

  // Structural: no other architecture document may claim the same role. A competing roadmap
  // document is exactly the failure mode "do not create multiple competing roadmap documents"
  // names, and a prose reminder in one file cannot detect one appearing in another.
  const architectureDir = path.join(rootDir, "docs/architecture")
  const claimants: string[] = []
  for (const entry of await readdir(architectureDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    const relative = path.join("docs/architecture", entry.name)
    const source = await readFile(path.join(architectureDir, entry.name), "utf8")
    if (source.includes("single Primary Product / Roadmap Authority") && relative !== PRODUCT_AUTHORITY_DOC) {
      claimants.push(relative)
    }
  }
  assert.deepEqual(claimants, [],
    `only ${PRODUCT_AUTHORITY_DOC} may claim Primary Product / Roadmap Authority:\n${claimants.join("\n")}`)
})

test("phase-1 authority: the architecture program is recorded as subordinate", async () => {
  assertDocDeclares(await readFile(path.join(rootDir, ARCHITECTURE_AUTHORITY_DOC), "utf8"), [
    "## Authority Position",
    "This document is the ratified subordinate Technical / Domain Architecture Authority.",
    "**The WU-00 … WU-10 sequence below does not override Phase-1 Product Authority sequencing.**",
    "A WU-nn row is never authorization to start that WorkUnit.",
  ], "subordinate architecture authority")

  // The product authority states the same boundary from its own side, so neither document can be
  // read alone and produce a different hierarchy.
  assertDocDeclares(await readProductAuthority(), [
    "is the ratified subordinate Technical / Domain Architecture Authority",
    "It is subordinate to this document on sequencing and product priority",
  ], "authority hierarchy reciprocity")
})

test("phase-1 authority: the architecture program's current status is ratified, its draft status historical", async () => {
  const doc = await readFile(path.join(rootDir, ARCHITECTURE_AUTHORITY_DOC), "utf8")
  const lines = doc.split("\n")

  // Current: exactly one unqualified `Status:` field, and it records the ratified authority. A
  // second one would reintroduce the same "which of these is current?" ambiguity from the other end.
  const statusFields = lines.filter((line) => line.startsWith("Status:"))
  assert.deepEqual(statusFields, [ARCHITECTURE_CURRENT_STATUS],
    `${ARCHITECTURE_AUTHORITY_DOC} must carry exactly one current Status field, the ratified one`)

  // Historical: the draft status stays visible and stays attached to the snapshot it was true at.
  // Deleting it would erase the fact that ratification came later, which is the history this repair
  // exists to preserve.
  assert.ok(doc.includes(ARCHITECTURE_HISTORICAL_MARKER),
    "the draft status must stay recorded as the historical status at its evidence snapshot")
  const historicalLines = lines.filter((line) => line.includes(ARCHITECTURE_HISTORICAL_STATUS))
  assert.ok(historicalLines.length > 0,
    "the historical draft status wording must stay in the document")

  // The distinction itself: no occurrence of the draft wording may sit in the current Status field.
  const unqualified = historicalLines.filter((line) => line.startsWith("Status:"))
  assert.deepEqual(unqualified, [],
    `the draft status is historical, never the current Status field:\n${unqualified.join("\n")}`)
})

test("phase-1 authority: ratified semantic targets are not code authorization", async () => {
  const doc = await readProductAuthority()
  assertDocDeclares(doc, [
    "RATIFIED_PHASE1_SEMANTIC_TARGET",
    "**NOT YET AUTHORIZED AS A CODE DECLARATION**",
    "The semantic ratification must not become implementation permission.",
    "Allowlist expansion in this WorkUnit is zero.",
  ], "semantic vs code authorization")

  // Each ratified name keeps its ratified status and its earliest authorizing phase. Losing the
  // phase would turn a just-in-time expansion into an open-ended one.
  for (const target of RATIFIED_SEMANTIC_TARGETS) {
    assert.ok(doc.includes(`\`${target.name}\` | \`RATIFIED_PHASE1_SEMANTIC_TARGET\``),
      `${target.name} must stay a ratified semantic target`)
    assert.ok(doc.includes(`${target.earliestPhase} → may authorize ${target.name}`),
      `${target.name} must stay bound to ${target.earliestPhase} as its earliest authorizing phase`)
  }

  // Structural: ratifying the names must not have declared them. This repeats the closed-allowlist
  // guarantee deliberately, because the ratification is the event that makes the confusion likely.
  const declared: string[] = []
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      const source = await readFile(file, "utf8")
      for (const target of RATIFIED_SEMANTIC_TARGETS) {
        if (new RegExp(`\\b(?:type|interface|class|enum|const|function)\\s+${target.name}\\b`).test(source)) {
          declared.push(`${path.relative(rootDir, file)} declares ${target.name}`)
        }
      }
    }
  }
  assert.deepEqual(declared, [],
    `a ratified semantic target is not an authorized declaration:\n${declared.join("\n")}`)
})

test("phase-1 authority: unratified proposal names gain no semantic status", async () => {
  const doc = await readProductAuthority()
  assertDocDeclares(doc, ["### Names that remain unauthorized entirely"], "unratified proposal names")

  // None of the four may be presented as ratified. Absence from the ratified table is not enough:
  // the assertion is that the ratified token never attaches to them anywhere in the document.
  const promoted = UNRATIFIED_PROPOSAL_NAMES.filter((name) =>
    doc.includes(`\`${name}\` | \`RATIFIED_PHASE1_SEMANTIC_TARGET\``) ||
    doc.includes(`may authorize ${name}`))
  assert.deepEqual(promoted, [],
    `these names have no ratified semantic status: ${promoted.join(", ")}`)

  for (const name of UNRATIFIED_PROPOSAL_NAMES) {
    assert.ok(doc.includes(name), `${name} must stay explicitly recorded as unauthorized`)
  }
})

test("phase-1 authority: the canonical record allowlist was not expanded by this ratification", async () => {
  // The allowlist literal is source-controlled in another test file. Reading it here binds this
  // governance record to the machine-enforced permission: if a later WorkUnit expands the list, it
  // must also update this record, so a silent expansion cannot ride along with a doc change.
  const source = await readFile(path.join(rootDir, ALLOWLIST_SOURCE), "utf8")
  const literal = source.match(/const AUTHORIZED_CANONICAL_RECORD_DECLARATIONS = \[([\s\S]*?)\]/)
  assert.ok(literal, `${ALLOWLIST_SOURCE} must keep the authorized canonical record allowlist`)

  const entries = [...literal[1].matchAll(/\{\s*name:\s*"([^"]+)",\s*path:\s*"([^"]+)"\s*\}/g)]
    .map((match) => `${match[2]} declares ${match[1]}`)
  assert.deepEqual(entries,
    [`${AUTHORIZED_CODE_DECLARATION.path} declares ${AUTHORIZED_CODE_DECLARATION.name}`],
    "P0_AUTHORITY_SYNC records allowlist expansion = 0")

  assertDocDeclares(await readProductAuthority(), [
    "The only authorized canonical record declaration remains `SourceRecordV1` at `app/lib/domain/source/types.ts`.",
  ], "authorized code declaration")
})

test("phase-1 authority: the Value Gate date stays unratified", async () => {
  const doc = await readProductAuthority()
  assertDocDeclares(doc, [
    "2026-08-21 Alpha deadline = SUPERSEDED",
    "Value Gate DATE           = UNRATIFIED",
    "must not be entered into any authoritative milestone or date field",
  ], "value gate timing")

  // The forecast may be named, but only as a forecast. Every occurrence must carry that framing,
  // so it cannot drift into a milestone field by repetition.
  const forecastLines = doc.split("\n").filter((line) => line.includes(UNRATIFIED_VALUE_GATE_DATE))
  assert.ok(forecastLines.length > 0, "the superseded forecast must stay recorded as a forecast")
  const promoted = forecastLines.filter((line) =>
    !line.includes("forecast only") && !line.includes("must not be entered"))
  assert.deepEqual(promoted, [],
    `${UNRATIFIED_VALUE_GATE_DATE} is a forecast, never a milestone:\n${promoted.join("\n")}`)
})

test("phase-1 authority: the asset ledger classifies every identified critical asset", async () => {
  const doc = await readProductAuthority()

  // Each asset keeps its exact ratified classification. A missing row is a silent reclassification.
  assertDocDeclares(doc, [
    "| Formation F1–F5 | `IMPLEMENTATION_ASSET` / `NON_AUTHORITY` |",
    "| Formation F3 | `POTENTIAL_P1_2_REFERENCE_INPUT` |",
    "| PR #211 | `UNMERGED_NON_AUTHORITY_INPUT` |",
    "| HTPE | `CONTRACT_REFERENCE_ASSET` / `NON_CRITICAL_PATH_BEFORE_VALUE_GATE` |",
    "| Large-SaaS | `INFRASTRUCTURE_SUBPROGRAM` |",
    "| PR #224 | `LEGACY_EXPERIMENT` / `NOT_PHASE1_CRITICAL_PATH` |",
    "| Current default Launcher | `CURRENT_PRODUCT_PROJECTION_SURFACE` |",
    "| Legacy / adopted Dashboard | `LEGACY_PROJECTION_SURFACE` |",
  ], "asset ledger")

  // Classification is a record, never a grant. The two promotions that would matter most are the
  // Launcher becoming domain authority and an unmerged asset becoming adopted.
  const lowered = doc.toLowerCase()
  const promotions = [
    "transplant_authorized", "launcher is canonical", "adopted as authority", "merge authorized",
  ].filter((phrase) => lowered.includes(phrase))
  assert.deepEqual(promotions, [],
    `the asset ledger must not promote an asset to authority: ${promotions.join(", ")}`)

  assertDocDeclares(doc, ["No entry above is an authorization to start work on that asset."],
    "asset ledger non-authorization")
})

test("phase-1 authority: no implementation WorkUnit is authorized by this record", async () => {
  assertDocDeclares(await readProductAuthority(), [
    "Execution boundary: governance and documentation only.",
    "It authorizes no implementation WorkUnit.",
    "This governance record does not implement that arrow, does not authorize it, and does not start P1-1.",
    "No parallel validation-only WorkUnit truth may be introduced.",
  ], "implementation non-authorization")
})

test("phase-1 authority: issue disposition records classification without claiming completion", async () => {
  assertDocDeclares(await readProductAuthority(), [
    "Classification here is a record, not a mutation authorization.",
    "SUPERSEDED_AS_EXECUTION_SCHEDULE",
    "Requirements are **not** completed merely because the schedule is superseded.",
    "PM_METADATA_MUTATION_AUTHORIZATION_REQUIRED",
    "PR224_DISPOSITION_PENDING_PM_MUTATION_AUTHORIZATION",
  ], "issue and PR disposition")
})
