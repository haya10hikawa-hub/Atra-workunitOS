/**
 * Test-only fixture for the D1 operational-evidence suites (P0-OPS-016 second repair).
 *
 * The production initializer (`initializeEvidenceSession`) derives its repository
 * facts internally and accepts NO commit/dirty-tree claim, so tests drive it with a
 * temporary REAL git repository built here. Nothing in this module is imported by
 * production code, and it exposes no injection into the production API.
 *
 * NOT a `*.test.mts` file, so the test runner never executes it directly.
 */

import { mkdtempSync, mkdirSync, cpSync, copyFileSync, writeFileSync, rmSync, realpathSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { sha256Hex, EVIDENCE_CONTRACT_RELPATH } from "../scripts/lib/d1OperationalEvidence.mjs"
import { loadConfigFile, buildConfigWithIds, SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The six real command source files whose digests receipts bind to. */
export const PRODUCER_SOURCES = [
  "scripts/cf-d1-migrations-check.mjs", "scripts/cf-d1-migrations-apply.mjs",
  "scripts/cf-d1-schema-verify-remote.mjs", "scripts/cf-d1-bootstrap-apply.mjs",
  "scripts/cloudflare-deploy-preflight.mjs", "scripts/cloudflare-deploy.mjs",
]

/** Run a git command in `repoRoot`, deterministically (no signing, fixed identity). */
export function git(repoRoot: string, args: string[]) {
  const result = spawnSync("git", [
    "-c", "user.email=evidence-tests@example.com", "-c", "user.name=Evidence Tests",
    "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main",
    ...args,
  ], { cwd: repoRoot, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`)
  return result.stdout
}

export interface EvidenceRepo {
  repoRoot: string
  commitSha: string
  cleanup: () => void
}

/**
 * Build a temporary REAL git repository carrying everything the evidence layer
 * derives from, committed clean. Returns `{ repoRoot, commitSha, cleanup }`.
 *
 * With `{ fullScripts: true }` the ENTIRE `scripts/` tree is copied so the operator
 * commands can be run as real subprocesses whose `REPO_ROOT` resolves to this repo.
 */
export function makeEvidenceGitRepo({ fullScripts = false } = {}): EvidenceRepo {
  // realpath: macOS temp dirs live under a `/var → /private/var` symlink, and a
  // command only runs `main()` when `process.argv[1]` resolves to its own
  // `import.meta.url`. Canonicalizing the root keeps every path comparison honest.
  const repoRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "d1-evidence-repo-")))
  mkdirSync(resolve(repoRoot, "contracts/operations"), { recursive: true })
  copyFileSync(resolve(REPO_ROOT, EVIDENCE_CONTRACT_RELPATH), resolve(repoRoot, EVIDENCE_CONTRACT_RELPATH))
  cpSync(resolve(REPO_ROOT, "migrations"), resolve(repoRoot, "migrations"), { recursive: true })
  copyFileSync(resolve(REPO_ROOT, "wrangler.json"), resolve(repoRoot, "wrangler.json"))
  if (fullScripts) {
    // The whole scripts/ tree (commands + their libs) — so subprocesses run against
    // THIS repo and their producer-source digests match the copied command files.
    cpSync(resolve(REPO_ROOT, "scripts"), resolve(repoRoot, "scripts"), { recursive: true })
    copyFileSync(resolve(REPO_ROOT, "package.json"), resolve(repoRoot, "package.json"))
  } else {
    mkdirSync(resolve(repoRoot, "scripts/lib"), { recursive: true })
    for (const rel of PRODUCER_SOURCES) copyFileSync(resolve(REPO_ROOT, rel), resolve(repoRoot, rel))
  }
  mkdirSync(resolve(repoRoot, ".open-next"), { recursive: true })
  writeFileSync(resolve(repoRoot, ".open-next/worker.js"), "// synthetic worker artifact\n")
  // The evidence dir, git-ignored config, and node_modules must never dirty the tree.
  writeFileSync(resolve(repoRoot, ".gitignore"), "/.d1-evidence/\n/node_modules\n/wrangler.deploy*.json\n/bootstrap.control*.sql\n")
  // deriveWranglerVersion reads the installed package; provide a pinned copy (ignored).
  mkdirSync(resolve(repoRoot, "node_modules/wrangler"), { recursive: true })
  copyFileSync(resolve(REPO_ROOT, "node_modules/wrangler/package.json"), resolve(repoRoot, "node_modules/wrangler/package.json"))

  git(repoRoot, ["init", "--quiet"])
  git(repoRoot, ["add", "-A"])
  git(repoRoot, ["commit", "--quiet", "--no-verify", "-m", "evidence fixture"])
  const commitSha = git(repoRoot, ["rev-parse", "HEAD"]).trim()

  return { repoRoot, commitSha, cleanup: () => rmSync(repoRoot, { recursive: true, force: true }) }
}

/** Write a valid git-ignored deploy-config authority file at the repo root. */
export function writeDeployConfig(repoRoot: string, basename = "wrangler.deploy.evtest.json", ids: Record<string, string> = SYNTHETIC_D1_IDS) {
  const base = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config
  const path = resolve(repoRoot, basename)
  writeFileSync(path, JSON.stringify(buildConfigWithIds(base, ids), null, 2) + "\n", { mode: 0o600 })
  return path
}

/** A REAL retained-authority object (synthetic ids, consistent bytes + digest). */
export function makeAuthority(ids: Record<string, string> = SYNTHETIC_D1_IDS) {
  const base = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config
  const bytes = JSON.stringify(buildConfigWithIds(base, ids), null, 2)
  return { bytes, sha256: sha256Hex(bytes), snapshot: JSON.parse(bytes) }
}
