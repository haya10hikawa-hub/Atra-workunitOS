/**
 * Operator entry point: walk one retained provider capture all the way to a canonical
 * `SourceRecordV1`, and print the provenance a reviewer needs to check it.
 *
 * READ-ONLY AND OFFLINE. It reads one archive file, calls the same production modules
 * the tests call, and writes nothing anywhere. It performs no provider request, so it
 * cannot turn a recorded capture into a live read, and it persists nothing, so running
 * it changes no state.
 *
 *   npm run source:acquire-recorded -- [archive path]
 *
 * The recording instant is this process's clock and is the one value the command
 * itself contributes; every other printed value is derived from the retained provider
 * bytes or stated by the archive.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { acquireRecordedGitHubIssueCapture } from "../app/lib/infrastructure/external/github/recordedIssueCapture.ts"
import { produceSourceRecordFromCapture } from "../app/lib/application/source/sourceRecordProduction.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const DEFAULT_ARCHIVE = "acquisitions/github/issue-4968607486.capture.json"

function line(label: string, value: string): void {
  process.stdout.write(`${label.padEnd(28)} ${value}\n`)
}

const archivePath = process.argv[2] ?? DEFAULT_ARCHIVE
const archiveText = await readFile(path.resolve(rootDir, archivePath), "utf8")

const acquired = await acquireRecordedGitHubIssueCapture(archiveText)
if (!acquired.ok) {
  process.stderr.write(`acquisition refused: ${acquired.failureCode}\n`)
  process.exit(1)
}

// The producer's own fact, and the only value this command contributes.
const recordedAt = new Date().toISOString()
const produced = produceSourceRecordFromCapture(acquired.capture, recordedAt)
if (!produced.ok) {
  process.stderr.write(
    `production refused: ${produced.failureCode}${produced.recordFailureCode === null ? "" : ` (${produced.recordFailureCode})`}\n`,
  )
  process.exit(1)
}

const { capture } = acquired
const { record, captureId } = produced.production

process.stdout.write(`\nRECORDED SOURCE  ${archivePath}\n\n`)
line("1 provider object", `${capture.identity.providerNamespace} / ${capture.identity.providerObjectKey}`)
line("2 identity profile", `${capture.identity.identityProfileId} v${capture.identity.identityProfileVersion}`)
line("3 content scope", `${capture.contentScope.contentScopeProfileId} v${capture.contentScope.contentScopeProfileVersion}`)
line("  retained bytes", `${capture.retainedContent.retention} (base64 length ${capture.retainedContent.bytesBase64.length})`)
line("  digest over them", capture.contentScope.contentDigest)
line("4 observed at", capture.observedAt)
line("5 acquisition mode", capture.acquisitionMode)
line("6 produced from capture", captureId)

process.stdout.write("\nSourceRecordV1\n")
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`)
