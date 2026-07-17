#!/usr/bin/env node
/**
 * cf:d1:evidence:init (P0-OPS-016) — initialize ONE offline evidence session, or
 * assemble a session's verified receipts into a final pack.
 *
 * ENTIRELY LOCAL: performs no network, D1, Wrangler, migration, bootstrap, or
 * deploy action. Session initialization DERIVES its repository facts internally
 * (HEAD commit, clean worktree, Node/Wrangler versions, contract digests) through
 * the library — the only process it spawns is read-only `git` — and fails closed
 * when the tree is dirty, HEAD is unresolvable, required files are missing, or a
 * digest cannot be derived. There is no way to hand it a commit or dirty-tree claim.
 *
 * The session's Ed25519 private key is written 0600, exclusively, into the
 * git-ignored session directory and is never printed or embedded anywhere.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { initializeEvidenceSession, assembleEvidencePackFromSession } from "./lib/d1EvidenceReceipts.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function parseArgs(argv) {
  const args = { environment: null, assemble: null, previous: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--environment" && argv[i + 1]) { args.environment = argv[i + 1]; i++ }
    else if (argv[i] === "--assemble" && argv[i + 1]) { args.assemble = resolve(argv[i + 1]); i++ }
    else if (argv[i] === "--previous" && argv[i + 1]) { args.previous = argv[i + 1]; i++ }
    else return null
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    console.error("cf:d1:evidence:init: unknown argument.")
    console.error("Usage: npm run cf:d1:evidence:init -- --environment staging|production")
    console.error("       npm run cf:d1:evidence:init -- --assemble .d1-evidence/<session-id> [--previous <sha256>]")
    process.exit(1)
  }

  if (args.assemble) {
    const assembled = assembleEvidencePackFromSession(args.assemble, { repoRoot: REPO_ROOT, previousRecordSha256: args.previous })
    if (!assembled.ok) {
      console.error(`cf:d1:evidence:init: ASSEMBLY FAILED — ${assembled.blocked.join(", ")}`)
      process.exit(1)
    }
    console.log("cf:d1:evidence:init: pack assembled from verified receipts.")
    console.log(`cf:d1:evidence:init: verify it with: npm run cf:d1:evidence:verify -- --file ${assembled.path}`)
    process.exit(0)
  }

  if (!args.environment) {
    console.error("cf:d1:evidence:init: --environment staging|production is required.")
    process.exit(1)
  }

  // The library derives HEAD, worktree cleanliness, versions, and contract digests
  // internally; it accepts no repository claim. A dirty tree or unresolvable HEAD
  // fails closed here.
  const initialized = initializeEvidenceSession({ repoRoot: REPO_ROOT, environmentClass: args.environment })
  if (!initialized.ok) {
    console.error(`cf:d1:evidence:init: STOPPED — ${initialized.blocked.join(", ")}`)
    console.error("Evidence sessions require a CLEAN worktree at a resolvable HEAD commit, with derivable toolchain versions and contract digests.")
    process.exit(1)
  }
  console.log(`cf:d1:evidence:init: session initialized (${initialized.sessionId}).`)
  console.log(`cf:d1:evidence:init: export CF_D1_EVIDENCE_SESSION_DIR=${initialized.sessionDir}`)
  console.log("cf:d1:evidence:init: each operator command emits its own signed receipt; gates remain operator-supplied.")
  process.exit(0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
