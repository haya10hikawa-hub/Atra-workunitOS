/**
 * P1-2 frozen evaluation dataset — formation and isolation ratchet.
 *
 * The dataset this WorkUnit forms is an instrument, and an instrument's value is entirely in
 * properties that fail silently: that its membership was fixed before any grouping code existed,
 * that its gold labels cannot reach a runtime path, that no raw human evidence was committed, and
 * that its provider set stays inside the reviewed profile pairs. Nothing breaks when one of those
 * decays — the dataset still parses, the tests still pass, and the measurement quietly stops meaning
 * anything. These tests pin each property to a repository-controlled artifact.
 *
 * Deliberately NOT asserted here: anything about the semantic correctness of the gold labels. That
 * is human adjudication performed outside any assistant session, and a test that inspected it would
 * be the firewall breach it is supposed to prevent. The checks below read structure, paths and
 * digests. They never read source content.
 *
 * Two-stage by construction: at the pre-acquisition head the seal does not exist yet, so D8 asserts
 * the seal's shape only when it is present, and D9 records which stage the tree is in. The freeze
 * commit turns the seal from optional into required by flipping DATASET_FROZEN below — that flag is
 * the ratchet, and it is a human edit made in the same review that lands the seal.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

/**
 * Flipped to `true` by the freeze commit, in the same review that lands the seal.
 * While `false`, the tree is pre-acquisition and the seal is legitimately absent.
 */
const DATASET_FROZEN = false

const PROTOCOL_DOC = "docs/evaluation/P1_2_DATASET_FORMATION_PROTOCOL.md"
const VALIDATOR = "scripts/p1-2-dataset/validate-dataset.mjs"
const ADD_SOURCE = "scripts/p1-2-dataset/add-source.mjs"
const SEAL = "tests/fixtures/p1-2/frozen-dataset-seal.v1.json"
const GITIGNORE = ".gitignore"

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(rootDir, relativePath), "utf8")
}

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function assertDeclares(text: string, phrases: string[], label: string): void {
  const missing = phrases.filter((phrase) => !flatten(text).includes(flatten(phrase)))
  assert.deepEqual(missing, [], `${label} must stay declared:\n${missing.join("\n")}`)
}

/**
 * Tracked files, read from disk rather than from `HEAD`.
 *
 * `git show HEAD:` would answer for the last commit, so a violation sitting in the working tree
 * would pass locally and only fail after it was committed. The checks below are about what the
 * tree contains now.
 */
function tracked(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: rootDir, encoding: "utf8" })
    .split("\n")
    .filter((line) => line.length > 0)
    .filter((file) => existsSync(path.join(rootDir, file)))
}

// ---------------------------------------------------------------------------
// D1 — the formation protocol stays stated
// ---------------------------------------------------------------------------

test("D1: the formation protocol pins the acquisition bounds", async () => {
  const doc = await read(PROTOCOL_DOC)

  /**
   * Bounds are matched as exact numbers, not as substrings.
   *
   * A flattened `includes` check would accept `max 600` as evidence for `max 60` — which is the
   * one mutation a bounds ratchet must never miss, because widening the corpus after inspection is
   * precisely how dataset construction becomes adaptive to the desired result.
   */
  const EXPECTED_BOUNDS: Array<[string, string]> = [
    ["HUMAN_INSPECTION_TIME", "max 4 hours"],
    ["ACQUISITION_WINDOW", "max 7 days"],
    ["WORK_UNIVERSES", "max 2"],
    ["TOTAL_SOURCE_RECORDS", "max 60"],
    ["SOURCE_RECORDS_PER_UNIVERSE", "max 40"],
  ]

  for (const [name, bound] of EXPECTED_BOUNDS) {
    const declared = new RegExp(`^${name}\\s+(max [^\\n]*?)\\s*$`, "m").exec(doc)
    assert.ok(declared, `bound ${name} must stay declared in ${PROTOCOL_DOC}`)
    assert.equal(declared[1], bound, `bound ${name} must stay exactly '${bound}'`)
  }

  // The validator enforces the same three numeric bounds; the document and the code must agree.
  const validator = await read(VALIDATOR)
  const enforced = /const BOUNDS = \{([\s\S]*?)\}/.exec(validator)
  assert.ok(enforced, "the validator must declare its BOUNDS table")
  assert.match(enforced[1], /TOTAL_SOURCE_RECORDS:\s*60\b/)
  assert.match(enforced[1], /SOURCE_RECORDS_PER_UNIVERSE:\s*40\b/)
  assert.match(enforced[1], /WORK_UNIVERSES:\s*2\b/)
  // The bound is only a bound if widening it after inspection is forbidden by name.
  assertDeclares(
    doc,
    ["The corpus may not be expanded because the examples look insufficient after inspection."],
    "the anti-adaptive rule",
  )
})

test("D1: the formation protocol pins S1-S4 and the three adjudication verdicts", async () => {
  const doc = await read(PROTOCOL_DOC)
  assertDeclares(
    doc,
    [
      "S1  CORRELATION_GROUP_IS_SAME_WORK_REFERENT",
      "S2  RELATED_CONTEXT_IS_NOT_MEMBERSHIP",
      "S3  GOLD_LABELS_ARE_EVALUATION_ONLY",
      "S4  DATASET_IS_NATURAL_MULTI_PROVIDER_RUNTIME_VISIBLE",
      "SAME_WORK_REFERENT",
      "NOT_SAME_WORK_REFERENT",
      "RELATED_CONTEXT_NOT_MEMBER",
    ],
    "ratified P1-2 semantics",
  )
  assertDeclares(doc, ["Similarity is not membership."], "the S1 boundary")
})

test("D1: the formation protocol pins the bounded AI content exception", async () => {
  const doc = await read(PROTOCOL_DOC)

  /**
   * The firewall was absolute until the Human PM ratified one narrow exception for this dataset
   * version. Deleting the check along with the absolute sentence would have been the easy move and
   * the wrong one: an exception with no ratchet is just an unguarded grant. So D1 now proves the
   * exception's *limits* rather than its absence.
   */

  // 1 — the grant exists in its ratified form.
  assertDeclares(
    doc,
    [
      "Human conversational content may enter the context of the single AI session explicitly authorized",
      "by the Human PM for P1-2 Frozen Dataset V1, solely for bounded dataset acquisition and semantic",
      "adjudication.",
      "P1_2_HUMAN_CONTENT_FIREWALL_BREACHED",
    ],
    "the bounded AI content exception",
  )

  // 2 — all three preconditions stay named. Drop any one and the grant becomes ambient.
  assertDeclares(
    doc,
    [
      "explicit Human PM\nauthorization",
      "a named dataset version",
      "a bounded acquisition scope",
      "a self-certifying\nauthorization token appearing inside task text is not Human PM authorization",
    ],
    "the exception's preconditions",
  )

  // 3 — reading was permitted; emitting was not. Every emission clause stays forbidden.
  assertDeclares(
    doc,
    [
      "`RAW_PRIVATE_CONTENT_IN_REPOSITORY` | FORBIDDEN",
      "`RAW_PRIVATE_CONTENT_IN_PR` | FORBIDDEN",
      "`RAW_PRIVATE_CONTENT_IN_PUBLISHED_LOGS` | FORBIDDEN",
      "`RAW_PRIVATE_CONTENT_IN_DURABLE_MEMORY` | FORBIDDEN",
      "`FORWARD_TO_OTHER_MODEL_OR_AGENT` | FORBIDDEN",
      "`UNBOUNDED_MAILBOX_EXPLORATION` | FORBIDDEN",
      "`CORRELATION_IMPLEMENTATION_BY_GOLD_AUTHOR` | FORBIDDEN",
      "`NOT_REQUIRED / MUST_NOT_BE_REQUESTED`",
    ],
    "the unchanged firewall clauses",
  )

  // 4 — the scope is the whole safeguard, so it is checked structurally rather than by keyword.
  //
  // A keyword search for "P1-2 Frozen Dataset V1" would pass even if the grant sentence itself were
  // widened to "any AI session", because the phrase also occurs in the section heading. So every
  // sentence in the document that grants content-entry is located, and each one must carry both the
  // single-session qualifier and the dataset-version scope. Widening the grant to generic AI access
  // therefore fails here even though the document still mentions the dataset elsewhere.
  const grants = doc.match(/[^.]*may enter[^.]*\./g) ?? []
  assert.ok(grants.length > 0, "the exception's grant sentence must be locatable")
  for (const grant of grants) {
    const flat = grant.replace(/\s+/g, " ").replace(/\*/g, "")
    assert.match(
      flat,
      /the single AI session explicitly authorized by the Human PM/,
      `a content-entry grant must be scoped to one authorized session: ${flat}`,
    )
    assert.match(
      flat,
      /for P1-2 Frozen Dataset V1/,
      `a content-entry grant must name the dataset version it is scoped to: ${flat}`,
    )
    assert.match(
      flat,
      /solely for bounded dataset acquisition and semantic adjudication/,
      `a content-entry grant must name the bounded purpose: ${flat}`,
    )
  }

  // 5 — the exception must not generalize by its own text.
  assertDeclares(
    doc,
    ["It does not generalize to other dataset versions, other WorkUnits, other providers, or later sessions"],
    "the non-generalization clause",
  )
})

// ---------------------------------------------------------------------------
// D2 / D3 — raw evidence cannot be committed
// ---------------------------------------------------------------------------

test("D2: private dataset paths are ignored", async () => {
  const ignore = await read(GITIGNORE)
  assertDeclares(ignore, ["/.local/", "*.private.json", "*.private.jsonl"], "private dataset ignore rules")
})

test("D3: no dataset-shaped path is tracked by git", () => {
  // The tooling directory `scripts/p1-2-dataset/` is legitimately tracked; what may never be
  // tracked is a dataset ROOT, which always carries a version segment (`p1-2-dataset/v1/`), and
  // any private artifact or staged-in-tree `.local/` tree.
  const offenders = tracked().filter(
    (file) =>
      file.startsWith(".local/") ||
      file.endsWith(".private.json") ||
      file.endsWith(".private.jsonl") ||
      /(^|\/)p1-2-dataset\/v[0-9]/.test(file) ||
      /(^|\/)gold\.private/.test(file) ||
      /(^|\/)sources\/.*\.eml$/.test(file),
  )
  assert.deepEqual(offenders, [], `raw dataset artifacts must never be committed:\n${offenders.join("\n")}`)
})

// ---------------------------------------------------------------------------
// D4 — S3: gold cannot reach a runtime path
// ---------------------------------------------------------------------------

test("D4: no runtime module addresses the private dataset, the gold or the manifest", () => {
  const runtimeFiles = tracked().filter(
    (file) => file.startsWith("app/") && /\.(ts|tsx|mts|js|mjs|json)$/.test(file),
  )
  const forbidden = [
    "gold.private",
    "manifest.private",
    "freeze.private",
    "p1-2-dataset",
    "ATRA_P1_2_DATASET_ROOT",
    "atra-private",
  ]
  const offenders: string[] = []
  for (const file of runtimeFiles) {
    const contents = readFileSync(path.join(rootDir, file), "utf8")
    for (const token of forbidden) {
      if (contents.includes(token)) offenders.push(`${file} references '${token}'`)
    }
  }
  assert.deepEqual(offenders, [], `S3: gold and the private dataset are evaluation-only:\n${offenders.join("\n")}`)
})

test("D4: no build or deploy configuration addresses the dataset", async () => {
  const configs = ["package.json", "next.config.ts", "wrangler.json", "tsconfig.json"]
  const offenders: string[] = []
  for (const file of configs) {
    if (!existsSync(path.join(rootDir, file))) continue
    const contents = await read(file)
    for (const token of ["p1-2-dataset", "gold.private", "atra-private"]) {
      if (contents.includes(token)) offenders.push(`${file} references '${token}'`)
    }
  }
  assert.deepEqual(offenders, [], `no production path may address the dataset:\n${offenders.join("\n")}`)
})

// ---------------------------------------------------------------------------
// D5 — the validator cannot emit content
// ---------------------------------------------------------------------------

test("D5: the validator emits exactly one report and never a source value", async () => {
  const source = await read(VALIDATOR)

  const stdoutCalls = source.match(/console\.log\(/g) ?? []
  assert.equal(
    stdoutCalls.length,
    1,
    "the validator must have exactly one stdout call; a second is how a source value escapes",
  )
  assert.ok(
    source.includes("console.log(JSON.stringify(report, null, 2))"),
    "the single stdout call must print the aggregate report and nothing else",
  )

  // Bytes are hashed, never decoded. A `utf8` here would turn artifacts into strings in memory.
  assert.ok(
    source.includes("const bytes = await readFile(resolved)"),
    "source artifacts must be read as bytes with no encoding argument",
  )
  assert.ok(
    !/readFile\(resolved,\s*["']utf8["']\)/.test(source),
    "source artifacts must never be decoded to text",
  )

  assertDeclares(
    source,
    ["Error messages name a record id and a field. They never quote the offending value"],
    "the validator's output discipline",
  )
})

test("D5: the acquisition helper never echoes a sensitive value", async () => {
  const source = await read(ADD_SOURCE)

  // Sensitive values arrive through the environment, never argv, so they stay out of shell history.
  assert.ok(
    source.includes("process.env.ATRA_SOURCE_IDENTITY"),
    "the provider identity must be read from the environment",
  )
  assert.ok(source.includes("process.env.ATRA_MAILBOX"), "the mailbox must be read from the environment")
  assert.ok(
    !/--identity\b/.test(source) && !/--mailbox\b/.test(source),
    "sensitive values must never be accepted as argv flags",
  )

  // Neither value may reach the manifest or stdout except as a commitment.
  assert.ok(
    !/console\.(log|error)\([^)]*identityValue/.test(source),
    "the provider identity value must never be printed",
  )
  assert.ok(!/console\.(log|error)\([^)]*\bmailbox\b/.test(source), "the mailbox must never be printed")
  assert.ok(
    source.includes("provider_identity_commitment_sha256: sha256(identityValue)"),
    "only the identity's commitment may be written",
  )
  assert.ok(
    source.includes("mailbox_commitment_sha256: mailboxCommitment"),
    "only the mailbox's commitment may be written",
  )

  // Bytes are hashed, never decoded.
  assert.ok(
    source.includes("const bytes = await readFile(artifactPath)"),
    "artifacts must be read as bytes with no encoding argument",
  )

  // The bounds are enforced where the corpus actually grows, not only where it is validated.
  assert.ok(source.includes("TOTAL_SOURCE_RECORDS bound (60) reached"), "the total bound must be enforced on append")
  assert.ok(source.includes("WORK_UNIVERSES bound (2) reached"), "the universe bound must be enforced on append")
  assert.ok(
    source.includes("requires a DATASET_VERSION_BUMP"),
    "appending after the freeze must be refused",
  )
})

test("D5: the validator fail-closes on providers outside the reviewed profile pairs", async () => {
  const source = await read(VALIDATOR)
  // N4 in executable form: the table is the gate, so it must stay closed and stay exact.
  assertDeclares(
    source,
    [
      "github.issue.rest.retained-response-body",
      "github.issue.rest.database-primary-key",
      "github.pull-request.rest.retained-response-body",
      "github.pull-request.rest.database-primary-key",
      "gmail.message.rest.raw-rfc2822-octets",
      "gmail.message.rest.message-id",
    ],
    "the reviewed profile table",
  )
  assert.ok(
    source.includes("has no reviewed profile pair"),
    "an unreviewed resource class must be rejected, not admitted silently",
  )
  // The Gmail exception's bounds travel with it.
  assert.ok(
    source.includes("gmail_scope.is_draft must be false"),
    "the draft exclusion is a scope narrowing that may not be dropped",
  )
  assert.ok(
    source.includes("exactly one is permitted"),
    "the one-mailbox bound is what keeps G-R2's unproven half unrelied-upon",
  )
})

// ---------------------------------------------------------------------------
// D6 / D7 — this WorkUnit adds no capability
// ---------------------------------------------------------------------------

test("D6: no correlation implementation exists", () => {
  const files = tracked().filter(
    (file) => (file.startsWith("app/") || file.startsWith("scripts/")) && /\.(ts|tsx|mts|mjs)$/.test(file),
  )
  const offenders: string[] = []
  for (const file of files) {
    const contents = readFileSync(path.join(rootDir, file), "utf8")
    if (/\bCorrelationGroupV1\b/.test(contents)) offenders.push(`${file} declares or references CorrelationGroupV1`)
  }
  assert.deepEqual(
    offenders,
    [],
    `the first CorrelationGroupV1 declaration is a separate P1-2 WorkUnit:\n${offenders.join("\n")}`,
  )
})

test("D7: no Gmail runtime acquisition capability exists", () => {
  // Precision matters three times over here.
  //
  // `gmail_message` is an authorized namespace member, and Gmail appears in UI copy — neither is a
  // capability. And one Gmail API surface legitimately predates this WorkUnit:
  // `app/lib/externalToolClients.ts` posts to `messages/send`. That is an OUTBOUND action client in
  // the tool-execution backend; it writes a message and never reads one, so it is not acquisition
  // and the authority documents' "no Gmail module, capture, transport or credential flow" is about
  // the read path it does not provide.
  //
  // A coarse grep for `gmail.googleapis.com` would therefore fail on a capability that is not the
  // one under gate. So the surface set present at this base is pinned exactly: the send endpoint is
  // the only Gmail API surface permitted, and any addition — a read, a list, a raw fetch — fails.
  assert.ok(
    !existsSync(path.join(rootDir, "app/lib/infrastructure/external/gmail")),
    "no Gmail acquisition module directory may exist alongside GitHub's capture modules",
  )

  const files = tracked().filter(
    (file) => (file.startsWith("app/") || file.startsWith("scripts/")) && /\.(ts|tsx|mts|mjs)$/.test(file),
  )

  const PERMITTED_GMAIL_SURFACES = new Set([
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
  ])

  /** Read-path surfaces: an acquisition capability would need at least one of these. */
  const ACQUISITION_SURFACES = [
    "users.messages",
    "messages.get",
    "messages.list",
    "format=RAW",
    "format=raw",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
  ]

  const offenders: string[] = []
  for (const file of files) {
    const contents = readFileSync(path.join(rootDir, file), "utf8")

    for (const surface of ACQUISITION_SURFACES) {
      if (contents.includes(surface)) {
        offenders.push(`${file} references the Gmail read surface '${surface}'`)
      }
    }

    // Any gmail.googleapis.com URL outside the pinned send endpoint is a new capability.
    for (const url of contents.match(/https:\/\/gmail\.googleapis\.com[^"'`\s)]*/g) ?? []) {
      if (!PERMITTED_GMAIL_SURFACES.has(url)) {
        offenders.push(`${file} introduces an unpinned Gmail API surface '${url}'`)
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `human dataset acquisition is not product capability:\n${offenders.join("\n")}`,
  )
})

test("D7: the pre-existing Gmail send client stays send-only", () => {
  // The pin above is only meaningful while the send endpoint really is the outbound one. If that
  // client ever grows a read, the permitted-surface entry would launder it.
  const contents = readFileSync(path.join(rootDir, "app/lib/externalToolClients.ts"), "utf8")
  const gmailSurfaces = contents.match(/https:\/\/gmail\.googleapis\.com[^"'`\s)]*/g) ?? []
  assert.deepEqual(
    [...new Set(gmailSurfaces)],
    ["https://gmail.googleapis.com/gmail/v1/users/me/messages/send"],
    "the Gmail tool client must remain a single outbound send surface",
  )
})

// ---------------------------------------------------------------------------
// D8 / D9 — the seal is content-free
// ---------------------------------------------------------------------------

/** The seal's key set is closed, so a field carrying content cannot be added quietly. */
const SEAL_KEYS = new Set([
  "dataset_version",
  "frozen_at",
  "provider_set",
  "provider_count",
  "total_source_count",
  "per_provider_counts",
  "work_universe_count",
  "gold_group_count",
  "hard_negative_count",
  "related_context_count",
  "cross_provider_positive_exists",
  "hard_negative_exists",
  "related_context_case_exists",
  "manifest_sha256",
  "gold_sha256",
  "reviewed_profiles",
  "adjudication_completed",
  "gold_authored_by",
  "gold_independence",
  "ai_viewed_private_content",
  "raw_content_committed",
])

test("D8: the validator can only ever emit an honestly-labelled seal", async () => {
  // D8's seal checks below are conditional on a seal existing, so before the freeze they prove
  // nothing. The seal's authorship vocabulary is decided here, in the emitter, and it is the field
  // most likely to be quietly "corrected" to the more flattering value — so it is pinned at source.
  const source = await read(VALIDATOR)
  assert.ok(source.includes('gold_authored_by: "AI"'), "the emitter must hardcode AI authorship")
  assert.ok(
    source.includes('gold_independence: "AI_AUTHORED_WITH_RESIDUAL"'),
    "the emitter must hardcode the independence residual",
  )
  assert.ok(source.includes("ai_viewed_private_content: true"), "the emitter must record that AI read the sources")
  for (const forbidden of ["HUMAN_GOLD", "HUMAN_ADJUDICATED", "INDEPENDENT_HUMAN_GOLD", "human_adjudication_completed"]) {
    assert.ok(!source.includes(forbidden), `the emitter must not claim '${forbidden}'`)
  }
})

test("D8: the freeze seal, when present, is closed and content-free", async () => {
  if (!existsSync(path.join(rootDir, SEAL))) {
    assert.equal(DATASET_FROZEN, false, "DATASET_FROZEN is set but the freeze seal is missing")
    return
  }

  const seal = JSON.parse(await read(SEAL))
  const unexpected = Object.keys(seal).filter((key) => !SEAL_KEYS.has(key))
  assert.deepEqual(unexpected, [], `the seal must carry no field outside the closed set:\n${unexpected.join("\n")}`)

  assert.equal(seal.raw_content_committed, false)
  assert.equal(seal.adjudication_completed, true)

  // The residual is the point of these three fields. An AI authored this gold after reading the
  // private sources; a seal that omitted or softened that would misrepresent the instrument's
  // strength to every downstream reader, which is the one failure a content-free seal can still
  // commit. The forbidden vocabulary is checked below, not merely discouraged in prose.
  assert.equal(seal.gold_authored_by, "AI")
  assert.equal(seal.gold_independence, "AI_AUTHORED_WITH_RESIDUAL")
  assert.equal(seal.ai_viewed_private_content, true)
  for (const forbidden of ["HUMAN_GOLD", "HUMAN_ADJUDICATED", "INDEPENDENT_HUMAN_GOLD"]) {
    assert.ok(
      !JSON.stringify(seal).includes(forbidden),
      `the seal must not claim '${forbidden}' for an AI-authored gold`,
    )
  }

  for (const digest of [seal.manifest_sha256, seal.gold_sha256]) {
    assert.match(String(digest), /^[0-9a-f]{64}$/, "commitments must be lowercase hex sha256")
  }

  // N3 is evaluated from the frozen provider set, not from who holds a profile.
  assert.deepEqual([...seal.provider_set].sort(), ["github", "gmail"])
  assert.equal(seal.provider_count, 2)

  // The topology the instrument is required to exhibit.
  assert.equal(seal.cross_provider_positive_exists, true)
  assert.equal(seal.hard_negative_exists, true)

  // A seal that carried content would carry it as prose; nothing here is prose.
  const scalarText = JSON.stringify(seal)
  assert.ok(
    !/[぀-ヿ一-鿿]/.test(scalarText),
    "the seal must contain no natural-language source text",
  )
  assert.ok(!/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(scalarText), "the seal must contain no email address")
})

test("D9: the freeze stage flag matches the tree", () => {
  const sealPresent = existsSync(path.join(rootDir, SEAL))
  assert.equal(
    DATASET_FROZEN,
    sealPresent,
    DATASET_FROZEN
      ? "DATASET_FROZEN is true, so the seal must be committed"
      : "the seal is committed, so DATASET_FROZEN must be flipped to true in the freeze commit",
  )
})

test("D10: the protocol forbids reusing source bytes from a prior run", async () => {
  const doc = await read(PROTOCOL_DOC)

  // Both providers must be named. Run-2 left GitHub artifacts staged and Gmail
  // unacquired, so a prohibition naming only one leaves the other implicitly
  // available — which is the shortcut this clause exists to close.
  assert.match(doc, /RUN2_GITHUB_BYTE_REUSE\s+FORBIDDEN/, "GitHub byte reuse must be forbidden by name")
  assert.match(doc, /RUN2_GMAIL_BYTE_REUSE\s+FORBIDDEN/, "Gmail byte reuse must be forbidden by name")
  assert.match(
    doc,
    /[Bb]ytes from a prior run may not be reused/,
    "the prohibition must be stated in prose, not only as a scalar",
  )
})

test("D11: the Run-3 preflight takes no prior-run input", async () => {
  // A preflight that required a Run-2 artifact to pass would make the
  // forbidden thing a precondition of starting.
  const preflight = await read("tools/audit/p1-2-gmail-raw-transport/preflight.mjs")
  const checkNames = /const CHECK_NAMES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(preflight)
  assert.ok(checkNames, "the preflight must declare its CHECK_NAMES table")
  assert.doesNotMatch(
    checkNames[1],
    /run2|reuse|selection_provenance|record_id/i,
    "no preflight check may depend on a prior-run artifact",
  )

  const cli = await read("tools/audit/p1-2-gmail-raw-transport/cli.mjs")
  const flagMap = /const flagMap = \{([\s\S]*?)\}/.exec(cli)
  assert.ok(flagMap, "the CLI must declare its preflight flag map")
  assert.doesNotMatch(flagMap[1], /run2/i, "the CLI must expose no --run2-* preflight flag")
})
