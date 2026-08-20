#!/usr/bin/env node
/**
 * P1-2 frozen evaluation dataset — structural validator and freeze step.
 *
 * This is the only program authorized to read the private dataset tree, and it is written so that
 * no source byte, subject line, address, provider identifier or gold rationale can reach its
 * output. It reports opaque ids, counts, digests and structural errors — nothing else. That is a
 * human-content-firewall control (see docs/evaluation/P1_2_DATASET_FORMATION_PROTOCOL.md §2), not a
 * convenience, and tests/p1_2DatasetFreezeAuthority.test.mts pins it.
 *
 * Two consequences the reader should hold onto:
 *
 *   - Error messages name a record id and a field. They never quote the offending value, because a
 *     malformed `observed_at` is harmless to echo but a malformed subject line is not, and the rule
 *     that admits one admits the other.
 *   - Raw bytes are read only to be hashed. They are never decoded to text, never parsed, never
 *     matched against a pattern, and never held beyond the digest.
 *
 * Usage:
 *   node scripts/p1-2-dataset/validate-dataset.mjs            # validate only
 *   node scripts/p1-2-dataset/validate-dataset.mjs --freeze   # validate, then seal
 */
import { createHash } from "node:crypto"
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))

const DATASET_VERSION = "v1"

const PRIVATE_ROOT =
  process.env.ATRA_P1_2_DATASET_ROOT ??
  path.join(os.homedir(), "atra-private", "p1-2-dataset", DATASET_VERSION)

const SOURCES_DIR = path.join(PRIVATE_ROOT, "sources")
const MANIFEST_PATH = path.join(PRIVATE_ROOT, "manifest.private.jsonl")
const GOLD_PATH = path.join(PRIVATE_ROOT, "gold.private.json")
const FREEZE_PATH = path.join(PRIVATE_ROOT, "freeze.private.json")

const SEAL_PATH = path.join(repoRoot, "tests", "fixtures", "p1-2", "frozen-dataset-seal.v1.json")

/**
 * The reviewed profile pairs, transcribed from the profile documents at the base commit.
 *
 * This table is the N4 gate in executable form: a provider or resource class absent from it has no
 * reviewed profile pair, so admitting it would make the dataset unevaluable rather than merely
 * unusual. The validator fail-closes on anything outside it.
 */
const REVIEWED_PROFILES = {
  github_issue: {
    provider: "github",
    content: { id: "github.issue.rest.retained-response-body", version: "v1" },
    identity: { id: "github.issue.rest.database-primary-key", version: "v1" },
  },
  github_pull_request: {
    provider: "github",
    content: { id: "github.pull-request.rest.retained-response-body", version: "v1" },
    identity: { id: "github.pull-request.rest.database-primary-key", version: "v1" },
  },
  gmail_message: {
    provider: "gmail",
    content: { id: "gmail.message.rest.raw-rfc2822-octets", version: "v1" },
    identity: { id: "gmail.message.rest.message-id", version: "v1" },
  },
}

const BOUNDS = {
  TOTAL_SOURCE_RECORDS: 60,
  SOURCE_RECORDS_PER_UNIVERSE: 40,
  WORK_UNIVERSES: 2,
}

const WORK_UNIVERSES = new Set(["U-SELF", "U-COLLAB", "U-TEAM"])

const DATASET_ID_PATTERN = /^P1D-[0-9]{4}$/
const GOLD_GROUP_ID_PATTERN = /^GOLD-[0-9]{3}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/**
 * The closed key set for a manifest row.
 *
 * Unknown keys are rejected rather than ignored. An ignored key is exactly how a `subject`, a
 * `snippet` or a `notes` field would arrive in a file the assistant is allowed to read.
 */
const MANIFEST_KEYS = new Set([
  "dataset_record_id",
  "provider",
  "resource_class",
  "profile_id",
  "profile_version",
  "identity_profile_id",
  "identity_profile_version",
  "content_sha256",
  "provider_identity_commitment_sha256",
  "observed_at",
  "source_event_at",
  "work_universe_id",
  "raw_artifact_relative_path",
  "gmail_scope",
])

const GMAIL_SCOPE_KEYS = new Set(["mailbox_commitment_sha256", "is_draft", "representation"])
const GOLD_KEYS = new Set(["dataset_version", "groups", "hard_negatives", "related_context"])
const GOLD_GROUP_KEYS = new Set(["gold_group_id", "members"])
const RELATED_CONTEXT_KEYS = new Set(["source", "referent_group"])

const errors = []
/** Errors carry an id and a field name, never a value. */
function fail(scope, message) {
  errors.push(`${scope}: ${message}`)
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertClosedKeys(value, allowed, scope, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(scope, `${label} carries unexpected key '${key}'`)
  }
}

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------

async function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    fail("manifest", "manifest.private.jsonl is missing")
    return []
  }
  const raw = await readFile(MANIFEST_PATH, "utf8")
  const lines = raw.split("\n").filter((line) => line.trim().length > 0)
  const rows = []
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      fail(`manifest:line ${lineNumber}`, "is not valid JSON")
      continue
    }
    if (!isPlainObject(parsed)) {
      fail(`manifest:line ${lineNumber}`, "is not a JSON object")
      continue
    }
    rows.push(parsed)
  }
  return rows
}

async function validateManifestRow(row, lineNumber) {
  const id = typeof row.dataset_record_id === "string" ? row.dataset_record_id : `line ${lineNumber}`
  const scope = `manifest:${id}`

  assertClosedKeys(row, MANIFEST_KEYS, scope, "row")

  if (typeof row.dataset_record_id !== "string" || !DATASET_ID_PATTERN.test(row.dataset_record_id)) {
    fail(scope, "dataset_record_id must match ^P1D-[0-9]{4}$")
  }

  const profile = REVIEWED_PROFILES[row.resource_class]
  if (!profile) {
    // N4: a resource class outside the reviewed set has no profile pair to quantify over.
    fail(scope, `resource_class '${String(row.resource_class)}' has no reviewed profile pair`)
  } else {
    if (row.provider !== profile.provider) {
      fail(scope, `provider does not match the reviewed provider for this resource_class`)
    }
    if (row.profile_id !== profile.content.id || row.profile_version !== profile.content.version) {
      fail(scope, "profile_id/profile_version are not the reviewed content-scope profile")
    }
    if (
      row.identity_profile_id !== profile.identity.id ||
      row.identity_profile_version !== profile.identity.version
    ) {
      fail(scope, "identity_profile_id/identity_profile_version are not the reviewed identity profile")
    }
  }

  for (const field of ["content_sha256", "provider_identity_commitment_sha256"]) {
    if (typeof row[field] !== "string" || !SHA256_PATTERN.test(row[field])) {
      fail(scope, `${field} must be a lowercase hex sha256`)
    }
  }

  if (typeof row.observed_at !== "string" || !RFC3339_PATTERN.test(row.observed_at)) {
    fail(scope, "observed_at must be an RFC3339 timestamp")
  }
  if (row.source_event_at !== null) {
    if (typeof row.source_event_at !== "string" || !RFC3339_PATTERN.test(row.source_event_at)) {
      fail(scope, "source_event_at must be an RFC3339 timestamp or null")
    }
  }

  if (!WORK_UNIVERSES.has(row.work_universe_id)) {
    fail(scope, "work_universe_id is not a declared work universe")
  }

  // Path containment: the artifact must resolve inside sources/, so a crafted relative path cannot
  // make the validator hash a file outside the private tree.
  const relative = row.raw_artifact_relative_path
  if (typeof relative !== "string" || relative.length === 0) {
    fail(scope, "raw_artifact_relative_path is missing")
    return
  }
  const resolved = path.resolve(SOURCES_DIR, relative)
  if (resolved !== SOURCES_DIR && !resolved.startsWith(SOURCES_DIR + path.sep)) {
    fail(scope, "raw_artifact_relative_path escapes sources/")
    return
  }
  if (!existsSync(resolved)) {
    fail(scope, "raw artifact named by raw_artifact_relative_path does not exist")
    return
  }

  // Bytes are read to be hashed and for no other purpose.
  const bytes = await readFile(resolved)
  if (sha256Hex(bytes) !== row.content_sha256) {
    fail(scope, "content_sha256 does not match the stored artifact bytes")
  }

  if (row.provider === "gmail") {
    const gmailScope = row.gmail_scope
    if (!isPlainObject(gmailScope)) {
      fail(scope, "gmail rows require a gmail_scope attestation")
    } else {
      assertClosedKeys(gmailScope, GMAIL_SCOPE_KEYS, scope, "gmail_scope")
      if (
        typeof gmailScope.mailbox_commitment_sha256 !== "string" ||
        !SHA256_PATTERN.test(gmailScope.mailbox_commitment_sha256)
      ) {
        fail(scope, "gmail_scope.mailbox_commitment_sha256 must be a lowercase hex sha256")
      }
      // The draft exclusion is a scope narrowing that may not be dropped.
      if (gmailScope.is_draft !== false) {
        fail(scope, "gmail_scope.is_draft must be false — draft-stage messages are out of scope")
      }
      if (gmailScope.representation !== "raw-rfc2822-octets") {
        fail(scope, "gmail_scope.representation must be the reviewed raw-rfc2822-octets profile")
      }
    }
  } else if (row.gmail_scope !== undefined) {
    fail(scope, "gmail_scope is only meaningful on gmail rows")
  }
}

// ---------------------------------------------------------------------------
// gold
// ---------------------------------------------------------------------------

async function loadGold() {
  if (!existsSync(GOLD_PATH)) {
    fail("gold", "gold.private.json is missing")
    return null
  }
  try {
    const parsed = JSON.parse(await readFile(GOLD_PATH, "utf8"))
    if (!isPlainObject(parsed)) {
      fail("gold", "gold.private.json is not a JSON object")
      return null
    }
    return parsed
  } catch {
    fail("gold", "gold.private.json is not valid JSON")
    return null
  }
}

function validateGold(gold, knownIds) {
  assertClosedKeys(gold, GOLD_KEYS, "gold", "gold")

  if (gold.dataset_version !== DATASET_VERSION) {
    fail("gold", `dataset_version must be '${DATASET_VERSION}'`)
  }

  const groups = Array.isArray(gold.groups) ? gold.groups : []
  const hardNegatives = Array.isArray(gold.hard_negatives) ? gold.hard_negatives : []
  const relatedContext = Array.isArray(gold.related_context) ? gold.related_context : []

  if (!Array.isArray(gold.groups)) fail("gold", "groups must be an array")
  if (!Array.isArray(gold.hard_negatives)) fail("gold", "hard_negatives must be an array")
  if (!Array.isArray(gold.related_context)) fail("gold", "related_context must be an array")

  const groupOfSource = new Map()
  const groupIds = new Set()

  for (const group of groups) {
    if (!isPlainObject(group)) {
      fail("gold:groups", "a group entry is not an object")
      continue
    }
    const gid = typeof group.gold_group_id === "string" ? group.gold_group_id : "<unnamed>"
    const scope = `gold:${gid}`
    assertClosedKeys(group, GOLD_GROUP_KEYS, scope, "group")

    if (!GOLD_GROUP_ID_PATTERN.test(gid)) fail(scope, "gold_group_id must match ^GOLD-[0-9]{3}$")
    if (groupIds.has(gid)) fail(scope, "gold_group_id is duplicated")
    groupIds.add(gid)

    const members = Array.isArray(group.members) ? group.members : []
    if (!Array.isArray(group.members)) fail(scope, "members must be an array")
    // A group of one asserts no relation, so it cannot carry a positive label.
    if (members.length < 2) fail(scope, "a gold group requires at least two members")
    if (new Set(members).size !== members.length) fail(scope, "members contains a duplicate id")

    for (const member of members) {
      if (typeof member !== "string" || !knownIds.has(member)) {
        fail(scope, "members names an id absent from the manifest")
        continue
      }
      // S1: a source is about one work referent, so overlapping groups are incoherent.
      if (groupOfSource.has(member)) fail(scope, `${member} already belongs to another gold group`)
      else groupOfSource.set(member, gid)
    }
  }

  for (const [index, pair] of hardNegatives.entries()) {
    const scope = `gold:hard_negatives[${index}]`
    if (!Array.isArray(pair) || pair.length !== 2) {
      fail(scope, "a hard negative must be a pair of dataset ids")
      continue
    }
    const [a, b] = pair
    if (typeof a !== "string" || typeof b !== "string" || !knownIds.has(a) || !knownIds.has(b)) {
      fail(scope, "names an id absent from the manifest")
      continue
    }
    if (a === b) fail(scope, "a hard negative must name two distinct sources")
    // A negative that gold also calls positive is a contradiction, not a hard case.
    if (groupOfSource.has(a) && groupOfSource.get(a) === groupOfSource.get(b)) {
      fail(scope, "names two sources that share a gold group")
    }
  }

  for (const [index, entry] of relatedContext.entries()) {
    const scope = `gold:related_context[${index}]`
    if (!isPlainObject(entry)) {
      fail(scope, "a related-context entry is not an object")
      continue
    }
    assertClosedKeys(entry, RELATED_CONTEXT_KEYS, scope, "related_context entry")
    if (typeof entry.source !== "string" || !knownIds.has(entry.source)) {
      fail(scope, "source names an id absent from the manifest")
      continue
    }
    if (!groupIds.has(entry.referent_group)) {
      fail(scope, "referent_group names an unknown gold group")
      continue
    }
    // S2 is exactly this: context about a referent is not membership in it.
    if (groupOfSource.get(entry.source) === entry.referent_group) {
      fail(scope, "source is a member of the group it is recorded as contextualising")
    }
  }

  return { groups, hardNegatives, relatedContext, groupOfSource }
}

// ---------------------------------------------------------------------------
// topology and bounds
// ---------------------------------------------------------------------------

function evaluateTopology(rows, goldView) {
  const providerOf = new Map(rows.map((row) => [row.dataset_record_id, row.provider]))

  const crossProviderPositive = goldView.groups.some((group) => {
    const providers = new Set(
      (Array.isArray(group.members) ? group.members : [])
        .map((member) => providerOf.get(member))
        .filter(Boolean),
    )
    return providers.has("github") && providers.has("gmail")
  })

  return {
    cross_provider_positive_exists: crossProviderPositive,
    hard_negative_exists: goldView.hardNegatives.length > 0,
    related_context_case_exists: goldView.relatedContext.length > 0,
  }
}

function evaluateBounds(rows) {
  const perUniverse = new Map()
  for (const row of rows) {
    perUniverse.set(row.work_universe_id, (perUniverse.get(row.work_universe_id) ?? 0) + 1)
  }
  if (rows.length > BOUNDS.TOTAL_SOURCE_RECORDS) {
    fail("bounds", `TOTAL_SOURCE_RECORDS exceeded (${rows.length} > ${BOUNDS.TOTAL_SOURCE_RECORDS})`)
  }
  if (perUniverse.size > BOUNDS.WORK_UNIVERSES) {
    fail("bounds", `WORK_UNIVERSES exceeded (${perUniverse.size} > ${BOUNDS.WORK_UNIVERSES})`)
  }
  for (const [universe, count] of perUniverse) {
    if (count > BOUNDS.SOURCE_RECORDS_PER_UNIVERSE) {
      fail("bounds", `SOURCE_RECORDS_PER_UNIVERSE exceeded for ${universe} (${count})`)
    }
  }
  return perUniverse
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const freeze = process.argv.includes("--freeze")

  if (!existsSync(PRIVATE_ROOT)) {
    console.error(`private dataset root not found: ${PRIVATE_ROOT}`)
    console.error("acquisition has not happened yet, or ATRA_P1_2_DATASET_ROOT points elsewhere.")
    process.exit(2)
  }

  const rows = await loadManifest()

  const seenIds = new Set()
  for (const [index, row] of rows.entries()) {
    await validateManifestRow(row, index + 1)
    const id = row.dataset_record_id
    if (typeof id === "string") {
      if (seenIds.has(id)) fail(`manifest:${id}`, "dataset_record_id is duplicated")
      seenIds.add(id)
    }
  }

  const sortedIds = [...seenIds].sort()
  const manifestOrder = rows.map((row) => row.dataset_record_id)
  if (JSON.stringify(manifestOrder) !== JSON.stringify(sortedIds)) {
    // Determinism: the digest is over the file, so a reordered file is a different commitment.
    fail("manifest", "rows must be sorted by dataset_record_id")
  }

  // Exactly one mailbox is what the Gmail scoped exception is bounded by.
  const mailboxCommitments = new Set(
    rows
      .filter((row) => row.provider === "gmail" && isPlainObject(row.gmail_scope))
      .map((row) => row.gmail_scope.mailbox_commitment_sha256),
  )
  if (mailboxCommitments.size > 1) {
    fail("gmail_scope", `dataset spans ${mailboxCommitments.size} mailboxes — exactly one is permitted`)
  }

  // Every artifact in sources/ must be accounted for, or the digest set is not the dataset.
  if (existsSync(SOURCES_DIR)) {
    const declared = new Set(rows.map((row) => row.raw_artifact_relative_path))
    const present = (await readdir(SOURCES_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
    for (const name of present) {
      if (!declared.has(name)) fail("sources", `an artifact in sources/ is not declared in the manifest`)
    }
  }

  const gold = await loadGold()
  const goldView = gold
    ? validateGold(gold, seenIds)
    : { groups: [], hardNegatives: [], relatedContext: [], groupOfSource: new Map() }

  const perUniverse = evaluateBounds(rows)
  const topology = evaluateTopology(rows, goldView)

  const providerCounts = {}
  for (const row of rows) {
    if (typeof row.provider === "string") {
      providerCounts[row.provider] = (providerCounts[row.provider] ?? 0) + 1
    }
  }
  const providerSet = Object.keys(providerCounts).sort()

  const manifestSha = existsSync(MANIFEST_PATH) ? sha256Hex(await readFile(MANIFEST_PATH)) : null
  const goldSha = existsSync(GOLD_PATH) ? sha256Hex(await readFile(GOLD_PATH)) : null

  const report = {
    dataset_version: DATASET_VERSION,
    provider_set: providerSet,
    provider_count: providerSet.length,
    total_source_count: rows.length,
    per_provider_counts: providerCounts,
    work_universe_count: perUniverse.size,
    gold_group_count: goldView.groups.length,
    hard_negative_count: goldView.hardNegatives.length,
    related_context_count: goldView.relatedContext.length,
    ...topology,
    manifest_sha256: manifestSha,
    gold_sha256: goldSha,
    raw_content_committed: false,
  }

  console.log(JSON.stringify(report, null, 2))

  if (errors.length > 0) {
    console.error(`\n${errors.length} structural error(s):`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }

  if (!freeze) {
    console.error("\nvalidation PASS. re-run with --freeze to seal.")
    return
  }

  // Freeze preconditions: the topology the instrument is required to exhibit.
  const missing = []
  if (report.provider_count < 2) missing.push("PROVIDER_COUNT >= 2")
  if (!providerSet.includes("github") || !providerSet.includes("gmail")) {
    missing.push("PROVIDER_SET must be github + gmail")
  }
  if (!topology.cross_provider_positive_exists) missing.push("CROSS_PROVIDER_POSITIVE")
  if (!topology.hard_negative_exists) missing.push("HARD_NEGATIVE")
  if (missing.length > 0) {
    console.error(`\ncannot freeze — missing required topology: ${missing.join(", ")}`)
    process.exit(1)
  }

  if (existsSync(FREEZE_PATH)) {
    console.error(`\nalready frozen: ${FREEZE_PATH}`)
    console.error("a change after freeze requires a DATASET_VERSION_BUMP, not a re-freeze.")
    process.exit(1)
  }

  const frozenAt = new Date().toISOString()

  const profilesInUse = [...new Set(rows.map((row) => row.resource_class))].sort().map((cls) => ({
    resource_class: cls,
    provider: REVIEWED_PROFILES[cls].provider,
    content_profile: REVIEWED_PROFILES[cls].content,
    identity_profile: REVIEWED_PROFILES[cls].identity,
  }))

  const seal = {
    dataset_version: DATASET_VERSION,
    frozen_at: frozenAt,
    provider_set: providerSet,
    provider_count: providerSet.length,
    total_source_count: rows.length,
    per_provider_counts: providerCounts,
    work_universe_count: perUniverse.size,
    gold_group_count: goldView.groups.length,
    hard_negative_count: goldView.hardNegatives.length,
    related_context_count: goldView.relatedContext.length,
    cross_provider_positive_exists: topology.cross_provider_positive_exists,
    hard_negative_exists: topology.hard_negative_exists,
    related_context_case_exists: topology.related_context_case_exists,
    manifest_sha256: manifestSha,
    gold_sha256: goldSha,
    reviewed_profiles: profilesInUse,
    human_adjudication_completed: true,
    raw_content_committed: false,
    ai_viewed_human_content: false,
  }

  await writeFile(FREEZE_PATH, JSON.stringify({ ...seal, private_root: PRIVATE_ROOT }, null, 2) + "\n")
  await mkdir(path.dirname(SEAL_PATH), { recursive: true })
  await writeFile(SEAL_PATH, JSON.stringify(seal, null, 2) + "\n")

  console.error(`\nFROZEN at ${frozenAt}`)
  console.error(`  private freeze record: ${FREEZE_PATH}`)
  console.error(`  repository seal:       ${path.relative(repoRoot, SEAL_PATH)}`)
}

await main()
