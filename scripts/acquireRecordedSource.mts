/**
 * Operator entry point: walk each retained provider capture all the way to a canonical
 * `SourceRecordV1`, and print the provenance a reviewer needs to check it.
 *
 * READ-ONLY AND OFFLINE. It reads archive files, calls the same production modules the
 * tests call, and writes nothing anywhere. It performs no provider request, so it cannot
 * turn a recorded capture into a live read, and it persists nothing, so running it
 * changes no state.
 *
 *   npm run source:acquire-recorded                          # every recorded source
 *   npm run source:acquire-recorded -- issue                 # one resource
 *   npm run source:acquire-recorded -- pull-request [path]   # one resource, one archive
 *
 * THE RESOURCE IS CHOSEN, NOT SNIFFED
 *
 * Each retained archive is read by the acquisition module for its own provider resource,
 * and the operator selects which. Nothing here inspects the archive to decide — not the
 * filename, and above all not `capturedFrom.requestUrl`, which is provenance for a human
 * reader and is never followed or parsed for a decision. Choosing the wrong resource
 * produces a refusal, not a reinterpretation, because each module pins its own profile.
 *
 * The recording instant is this process's clock and is the one value the command itself
 * contributes; every other printed value is derived from the retained provider bytes or
 * stated by the archive.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { acquireRecordedGitHubIssueCapture } from "../app/lib/infrastructure/external/github/recordedIssueCapture.ts"
import { acquireRecordedGitHubPullRequestCapture } from "../app/lib/infrastructure/external/github/recordedPullRequestCapture.ts"
import { produceSourceRecordFromCapture } from "../app/lib/application/source/sourceRecordProduction.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

/**
 * The capture shape, taken from what the producer accepts rather than imported from the
 * acquisition evidence port.
 *
 * This is not stylistic. The port's production consumers are a pinned, reviewed set —
 * the two acquisition adapters and the producer — and an operator convenience script is
 * not one of them. Depending on the producer's own input type gives this command exactly
 * the type it needs without widening that set, and it stays correct by construction if
 * the producer's accepted evidence ever changes.
 */
type ProducibleCapture = Parameters<typeof produceSourceRecordFromCapture>[0]

type AcquisitionResult =
  | { readonly ok: true; readonly capture: ProducibleCapture }
  | { readonly ok: false; readonly failureCode: string }

type RecordedResource = {
  readonly resource: string
  readonly archivePath: string
  readonly acquire: (archiveText: unknown) => Promise<AcquisitionResult>
}

/** The reviewed resources and their retained captures. One entry per ratified profile pair. */
const RECORDED_RESOURCES: readonly RecordedResource[] = [
  {
    resource: "issue",
    archivePath: "acquisitions/github/issue-4968607486.capture.json",
    acquire: acquireRecordedGitHubIssueCapture,
  },
  {
    resource: "pull-request",
    archivePath: "acquisitions/github/pull-request-4258276579.capture.json",
    acquire: acquireRecordedGitHubPullRequestCapture,
  },
]

function line(label: string, value: string): void {
  process.stdout.write(`${label.padEnd(28)} ${value}\n`)
}

const [selected, archiveOverride] = process.argv.slice(2)

let targets = RECORDED_RESOURCES
if (selected !== undefined) {
  targets = RECORDED_RESOURCES.filter((entry) => entry.resource === selected)
  if (targets.length === 0) {
    process.stderr.write(
      `unknown resource: expected one of ${RECORDED_RESOURCES.map((e) => e.resource).join(", ")}\n`)
    process.exit(1)
  }
  if (archiveOverride !== undefined) {
    targets = [{ ...targets[0], archivePath: archiveOverride }]
  }
}

for (const target of targets) {
  const archiveText = await readFile(path.resolve(rootDir, target.archivePath), "utf8")

  const acquired = await target.acquire(archiveText)
  if (!acquired.ok) {
    process.stderr.write(`acquisition refused (${target.resource}): ${acquired.failureCode}\n`)
    process.exit(1)
  }

  // The producer's own fact, and the only value this command contributes.
  const recordedAt = new Date().toISOString()
  const produced = produceSourceRecordFromCapture(acquired.capture, recordedAt)
  if (!produced.ok) {
    process.stderr.write(
      `production refused (${target.resource}): ${produced.failureCode}${produced.recordFailureCode === null ? "" : ` (${produced.recordFailureCode})`}\n`,
    )
    process.exit(1)
  }

  const { capture } = acquired
  const { record, captureId } = produced.production

  process.stdout.write(`\nRECORDED SOURCE  ${target.archivePath}\n\n`)
  line("1 provider object", `${capture.identity.providerNamespace} / ${capture.identity.providerObjectKey}`)
  line("2 identity profile", `${capture.identity.identityProfileId} v${capture.identity.identityProfileVersion}`)
  line("3 content scope", `${capture.contentScope.contentScopeProfileId} v${capture.contentScope.contentScopeProfileVersion}`)
  line("  retained bytes", `${capture.retainedContent.retention} (base64 length ${capture.retainedContent.bytesBase64.length})`)
  line("  digest over them", capture.contentScope.contentDigest)
  line("4 observed at", capture.observedAt)
  line("5 acquisition mode", capture.acquisitionMode)
  line("6 produced from capture", captureId)
  line("7 canonical namespace", record.provider)

  process.stdout.write("\nSourceRecordV1\n")
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`)
}
