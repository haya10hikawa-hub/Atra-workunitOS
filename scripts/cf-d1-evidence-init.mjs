#!/usr/bin/env node
/**
 * cf:d1:evidence:init (P0-OPS-016 repair) — initialize ONE offline evidence
 * session, or assemble a session's verified receipts into a final pack.
 *
 * ENTIRELY LOCAL: performs no network, D1, Wrangler, migration, bootstrap, or
 * deploy action. The ONLY process it may spawn is read-only `git` (rev-parse /
 * status), used to DERIVE — never accept as claims — the exact HEAD commit and
 * whether the worktree is clean. It fails closed when the tree is dirty, HEAD
 * cannot be resolved, required files are missing, or contract digests cannot be
 * derived.
 *
 * The session's Ed25519 private key is written 0600, exclusively, into the
 * git-ignored session directory and is never printed or embedded anywhere.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { initializeEvidenceSessionAt, assembleEvidencePackFromSession } from "./lib/d1EvidenceReceipts.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** Run ONE read-only git command; anything else is unreachable from this file. */
function gitReadOnly(args) {
  const allowed = new Set(["rev-parse", "status"])
  if (!allowed.has(args[0])) throw new Error("git_command_not_allowlisted")
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" })
  if (result.status !== 0) return null
  return result.stdout
}

/** Derive HEAD + worktree cleanliness — never accepted from the caller. */
export function deriveGitFacts(runGit = gitReadOnly) {
  const head = runGit(["rev-parse", "HEAD"])
  const commitSha = head ? head.trim() : null
  if (!commitSha || !/^[0-9a-f]{40}$/.test(commitSha)) return { ok: false, blocked: ["head_unresolvable"] }
  const status = runGit(["status", "--porcelain"])
  if (status === null) return { ok: false, blocked: ["worktree_state_unresolvable"] }
  if (status.trim().length > 0) return { ok: false, blocked: ["repository_dirty"] }
  return { ok: true, commitSha, dirtyTree: false }
}

/** The pinned Wrangler version, derived from the installed package — not claimed. */
export function deriveWranglerVersion(repoRoot = REPO_ROOT) {
  try {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "node_modules/wrangler/package.json"), "utf8"))
    return typeof pkg.version === "string" ? pkg.version : null
  } catch {
    return null
  }
}

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

  const git = deriveGitFacts()
  if (!git.ok) {
    console.error(`cf:d1:evidence:init: STOPPED — ${git.blocked.join(", ")}`)
    console.error("Evidence sessions require a CLEAN worktree at a resolvable HEAD commit.")
    process.exit(1)
  }
  const wranglerVersion = deriveWranglerVersion()
  if (!wranglerVersion) {
    console.error("cf:d1:evidence:init: STOPPED — wrangler_version_underivable")
    process.exit(1)
  }

  const initialized = initializeEvidenceSessionAt({
    repoRoot: REPO_ROOT,
    environmentClass: args.environment,
    derived: {
      commitSha: git.commitSha,
      dirtyTree: git.dirtyTree,
      nodeVersion: process.version,
      wranglerVersion,
    },
  })
  if (!initialized.ok) {
    console.error(`cf:d1:evidence:init: STOPPED — ${initialized.blocked.join(", ")}`)
    process.exit(1)
  }
  console.log(`cf:d1:evidence:init: session initialized (${initialized.sessionId}).`)
  console.log(`cf:d1:evidence:init: export CF_D1_EVIDENCE_SESSION_DIR=${initialized.sessionDir}`)
  console.log("cf:d1:evidence:init: each operator command emits its own signed receipt; gates remain operator-supplied.")
  process.exit(0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
