#!/usr/bin/env node
/**
 * P1-2 frozen evaluation dataset — append one acquired source to the private manifest.
 *
 * The freeze is one-shot: a mistyped digest is not a warning, it is a dataset that cannot be
 * re-frozen without a version bump that invalidates every measurement taken against v1. So the
 * digests are computed here rather than by hand.
 *
 * Sensitive values are read from the ENVIRONMENT, never from argv, so a provider identity or a
 * mailbox address does not land in shell history:
 *
 *   ATRA_SOURCE_IDENTITY=<provider identity value>   required
 *   ATRA_MAILBOX=<the single mailbox identifier>     required for gmail rows
 *
 * Neither is stored or echoed. Only their SHA-256 commitments reach the manifest, and only the
 * commitments are printed.
 *
 * Usage:
 *   ATRA_SOURCE_IDENTITY=... node scripts/p1-2-dataset/add-source.mjs \
 *     --resource-class github_issue --file issue-123.json \
 *     --observed-at 2026-08-20T10:00:00Z --source-event-at 2026-08-14T09:00:00Z \
 *     --universe U-SELF
 */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"

const DATASET_VERSION = "v1"
const PRIVATE_ROOT =
  process.env.ATRA_P1_2_DATASET_ROOT ??
  path.join(os.homedir(), "atra-private", "p1-2-dataset", DATASET_VERSION)
const SOURCES_DIR = path.join(PRIVATE_ROOT, "sources")
const MANIFEST_PATH = path.join(PRIVATE_ROOT, "manifest.private.jsonl")
const FREEZE_PATH = path.join(PRIVATE_ROOT, "freeze.private.json")

const REVIEWED = {
  github_issue: {
    provider: "github",
    content: ["github.issue.rest.retained-response-body", "v1"],
    identity: ["github.issue.rest.database-primary-key", "v1"],
  },
  github_pull_request: {
    provider: "github",
    content: ["github.pull-request.rest.retained-response-body", "v1"],
    identity: ["github.pull-request.rest.database-primary-key", "v1"],
  },
  gmail_message: {
    provider: "gmail",
    content: ["gmail.message.rest.raw-rfc2822-octets", "v1"],
    identity: ["gmail.message.rest.message-id", "v1"],
  },
}

const UNIVERSES = new Set(["U-SELF", "U-COLLAB", "U-TEAM"])
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function die(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex")

const resourceClass = arg("resource-class")
const file = arg("file")
const observedAt = arg("observed-at")
const sourceEventAt = arg("source-event-at")
const universe = arg("universe")

const profile = REVIEWED[resourceClass]
if (!profile) die(`--resource-class must be one of: ${Object.keys(REVIEWED).join(", ")}`)
if (!file) die("--file is required (a filename inside sources/)")
if (!observedAt || !RFC3339.test(observedAt)) die("--observed-at must be an RFC3339 timestamp")
if (sourceEventAt !== "null" && (!sourceEventAt || !RFC3339.test(sourceEventAt))) {
  die("--source-event-at must be an RFC3339 timestamp or the literal 'null'")
}
if (!UNIVERSES.has(universe)) die(`--universe must be one of: ${[...UNIVERSES].join(", ")}`)

// The freeze is final. Appending after it is the mutation the instrument exists to prevent.
if (existsSync(FREEZE_PATH)) {
  die("dataset is already frozen; adding a source requires a DATASET_VERSION_BUMP")
}

const identityValue = process.env.ATRA_SOURCE_IDENTITY
if (!identityValue) die("ATRA_SOURCE_IDENTITY must be set in the environment (never passed in argv)")

const artifactPath = path.resolve(SOURCES_DIR, file)
if (artifactPath !== SOURCES_DIR && !artifactPath.startsWith(SOURCES_DIR + path.sep)) {
  die("--file must name a file inside sources/")
}
if (!existsSync(artifactPath)) die(`no such artifact in sources/: ${file}`)

// Bytes are hashed, never decoded.
const bytes = await readFile(artifactPath)

const existing = existsSync(MANIFEST_PATH)
  ? (await readFile(MANIFEST_PATH, "utf8")).split("\n").filter((line) => line.trim().length > 0)
  : []

const rows = existing.map((line) => JSON.parse(line))

const contentSha = sha256(bytes)
const duplicate = rows.find((row) => row.content_sha256 === contentSha)
if (duplicate) die(`these bytes are already in the dataset as ${duplicate.dataset_record_id}`)

const nextNumber = rows.length + 1
if (nextNumber > 60) die("TOTAL_SOURCE_RECORDS bound (60) reached; the first bound reached terminates the search")

const perUniverse = rows.filter((row) => row.work_universe_id === universe).length
if (perUniverse + 1 > 40) die(`SOURCE_RECORDS_PER_UNIVERSE bound (40) reached for ${universe}`)

const universes = new Set(rows.map((row) => row.work_universe_id))
universes.add(universe)
if (universes.size > 2) die("WORK_UNIVERSES bound (2) reached")

const datasetRecordId = `P1D-${String(nextNumber).padStart(4, "0")}`

const row = {
  dataset_record_id: datasetRecordId,
  provider: profile.provider,
  resource_class: resourceClass,
  profile_id: profile.content[0],
  profile_version: profile.content[1],
  identity_profile_id: profile.identity[0],
  identity_profile_version: profile.identity[1],
  content_sha256: contentSha,
  provider_identity_commitment_sha256: sha256(identityValue),
  observed_at: observedAt,
  source_event_at: sourceEventAt === "null" ? null : sourceEventAt,
  work_universe_id: universe,
  raw_artifact_relative_path: file,
}

if (profile.provider === "gmail") {
  const mailbox = process.env.ATRA_MAILBOX
  if (!mailbox) die("ATRA_MAILBOX must be set for gmail rows (never passed in argv)")
  const mailboxCommitment = sha256(mailbox)

  // Exactly one mailbox is the bound the Gmail scoped identity exception travels with.
  const priorMailboxes = new Set(
    rows.filter((r) => r.provider === "gmail").map((r) => r.gmail_scope?.mailbox_commitment_sha256),
  )
  if (priorMailboxes.size > 0 && !priorMailboxes.has(mailboxCommitment)) {
    die("ATRA_MAILBOX differs from the mailbox already in the dataset; exactly one is permitted")
  }

  row.gmail_scope = {
    mailbox_commitment_sha256: mailboxCommitment,
    is_draft: false,
    representation: "raw-rfc2822-octets",
  }
}

// The manifest stays sorted: the digest is over the file, so order is part of the commitment.
rows.push(row)
rows.sort((a, b) => a.dataset_record_id.localeCompare(b.dataset_record_id))
await writeFile(MANIFEST_PATH, rows.map((r) => JSON.stringify(r)).join("\n") + "\n")

console.log(
  JSON.stringify(
    {
      dataset_record_id: datasetRecordId,
      provider: row.provider,
      resource_class: row.resource_class,
      content_sha256: row.content_sha256,
      work_universe_id: row.work_universe_id,
      total_source_count: rows.length,
    },
    null,
    2,
  ),
)
