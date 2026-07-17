/**
 * P0-OPS-016 second repair — command ENTRYPOINT receipt emission (Issue #155).
 *
 * These tests run the real operator commands as SUBPROCESSES against a temporary git
 * repository, with execution stubbed only at the process boundary (no `--remote`, no
 * Wrangler, no Cloudflare). They prove that:
 *   - a command emits its receipt from its real result path (after the result);
 *   - a command whose gates are not satisfied emits NOTHING (execution never starts);
 *   - a FAILED command emits a FAILED receipt, never a success.
 *
 * Nothing here contacts Cloudflare; the only external process is the command under
 * test, run entirely offline.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { makeEvidenceGitRepo, writeDeployConfig } from "./evidenceTestRepo.mts"
import { initializeEvidenceSession } from "../scripts/lib/d1EvidenceReceipts.mjs"

/**
 * Run one command in the repo, offline, with an evidence session bound. The script
 * path is realpath'd because a command only runs `main()` when `process.argv[1]`
 * resolves to its own `import.meta.url` — and macOS temp dirs live under a symlink.
 */
function runCommand(repoRoot: string, scriptRel: string, args: string[], sessionDir: string | null) {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (sessionDir) env.CF_D1_EVIDENCE_SESSION_DIR = sessionDir
  else delete env.CF_D1_EVIDENCE_SESSION_DIR
  const scriptPath = realpathSync(resolve(repoRoot, scriptRel))
  return spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", scriptPath, ...args], {
    cwd: repoRoot, encoding: "utf8", env,
  })
}

function receiptFiles(sessionDir: string) {
  try { return readdirSync(sessionDir).filter((n) => /^receipt-\d{4}\.json$/.test(n)).sort() } catch { return [] }
}

// ─── 10. a command emits a receipt from its real result path ──────

test("10. cf:d1:migrations:check emits a signed receipt from its real result path", () => {
  const repo = makeEvidenceGitRepo({ fullScripts: true })
  try {
    const init = initializeEvidenceSession({ repoRoot: repo.repoRoot, environmentClass: "staging" })
    assert.ok(init.ok)
    if (!init.ok) return
    const configPath = writeDeployConfig(repo.repoRoot)
    const result = runCommand(repo.repoRoot, "scripts/cf-d1-migrations-check.mjs", ["--config", configPath], init.sessionDir)
    assert.equal(result.status, 0, `check must pass: ${result.stderr}`)
    assert.match(result.stdout, /evidence: receipt recorded \(migration_plan_verified\)/)
    const files = receiptFiles(init.sessionDir)
    assert.deepEqual(files, ["receipt-0001.json"])
    const receipt = JSON.parse(readFileSync(resolve(init.sessionDir, files[0]), "utf8"))
    assert.equal(receipt.operation, "migration_plan_verified")
    assert.equal(receipt.status, "success")
    assert.match(receipt.receipt_signature, /^[0-9a-f]{128}$/)
    assert.equal(receipt.repository_commit_sha, repo.commitSha)
  } finally { repo.cleanup() }
})

// ─── 11 + 12. no receipt before a gate succeeds / when execution never starts ──

test("11 + 12. a gated command whose gates are NOT satisfied emits NO receipt (execution never starts)", () => {
  const repo = makeEvidenceGitRepo({ fullScripts: true })
  try {
    const init = initializeEvidenceSession({ repoRoot: repo.repoRoot, environmentClass: "staging" })
    assert.ok(init.ok)
    if (!init.ok) return
    const configPath = writeDeployConfig(repo.repoRoot)
    // Missing --remote, CF_D1_MIGRATE_EXECUTE, and the confirmation phrase: the apply
    // STOPS before Wrangler and before any receipt could be emitted.
    const result = runCommand(repo.repoRoot, "scripts/cf-d1-migrations-apply.mjs", ["--config", configPath], init.sessionDir)
    assert.notEqual(result.status, 0)
    assert.match(result.stdout + result.stderr, /STOPPED before Wrangler/)
    assert.doesNotMatch(result.stdout, /evidence: receipt recorded/)
    assert.deepEqual(receiptFiles(init.sessionDir), [], "no receipt exists for a run the gates refused")
  } finally { repo.cleanup() }
})

// ─── 13. a failed command emits a FAILED receipt, never a success ─

test("13. a FAILED command emits a FAILED receipt (never a success)", () => {
  const repo = makeEvidenceGitRepo({ fullScripts: true })
  try {
    const init = initializeEvidenceSession({ repoRoot: repo.repoRoot, environmentClass: "staging" })
    assert.ok(init.ok)
    if (!init.ok) return
    const configPath = writeDeployConfig(repo.repoRoot)
    // Corrupt a pinned migration file so runCheck FAILS (digest mismatch), while the
    // manifest itself stays loadable so the plan digest is still derivable.
    const migration = resolve(repo.repoRoot, "migrations/0006_action_preview_creator.sql")
    writeFileSync(migration, readFileSync(migration, "utf8") + "\n-- corruption\n")
    const result = runCommand(repo.repoRoot, "scripts/cf-d1-migrations-check.mjs", ["--config", configPath], init.sessionDir)
    assert.notEqual(result.status, 0, "the check must fail")
    const files = receiptFiles(init.sessionDir)
    assert.deepEqual(files, ["receipt-0001.json"], "a failure is still a command-issued receipt")
    const receipt = JSON.parse(readFileSync(resolve(init.sessionDir, files[0]), "utf8"))
    assert.equal(receipt.operation, "migration_plan_verified")
    assert.equal(receipt.status, "failed", "a failed command can NEVER emit a success receipt")
    assert.deepEqual(receipt.safe_categories, ["plan_verification_failed"])
  } finally { repo.cleanup() }
})

// ─── 12b. no session dir set → no receipt path at all ─────────────

test("12b. with no evidence session bound, a passing command emits no receipt and stays green", () => {
  const repo = makeEvidenceGitRepo({ fullScripts: true })
  try {
    const configPath = writeDeployConfig(repo.repoRoot)
    const result = runCommand(repo.repoRoot, "scripts/cf-d1-migrations-check.mjs", ["--config", configPath], null)
    assert.equal(result.status, 0)
    assert.doesNotMatch(result.stdout, /evidence: receipt/)
    assert.equal(existsSync(resolve(repo.repoRoot, ".d1-evidence")), false)
  } finally { repo.cleanup() }
})
