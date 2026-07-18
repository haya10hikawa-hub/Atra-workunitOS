/**
 * Real CLI subprocess tests for scripts/cf-d1-migrate.mjs (P0-FIX-D1-*).
 *
 * These launch the ACTUAL CLI as a child process and assert exit codes + safe
 * error categories — not just validateInvocation() directly. They prove the real
 * command path loads and validates the COMPLETE trusted staging context, enforces
 * complete-or-absent caller assertions, and exposes staging as a PREFLIGHT-only
 * capability (no remote executor). No test performs a network request; the
 * execution latch is never set; no context value is ever printed.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, mkdtempSync, cpSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CLI = join(SRC_ROOT, "scripts", "cf-d1-migrate.mjs")

// Isolated migrations root so a concurrent test writing a scratch migration into
// the real migrations/ dir cannot make offline manifest reads flaky.
const ISO_ROOT = (() => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "atra-cli-root-")))
  cpSync(join(SRC_ROOT, "migrations"), join(dir, "migrations"), { recursive: true })
  return dir
})()

// Synthetic but FORMAT-VALID staging context (32-hex account id; allowlisted
// project name). These are not real Cloudflare identifiers.
const ACCT = "0123456789abcdef0123456789abcdef"
const PROJ = "workunit-os-staging"
const ACCT_WRONG = "deadbeefdeadbeefdeadbeefdeadbeef"
const TRUSTED = { CF_STAGING_ACCOUNT_ID: ACCT, CF_STAGING_PROJECT: PROJ }

function runCli(args: string[], extraEnv: Record<string, string> = {}) {
  // A clean env WITHOUT any staging context or execution latch by default.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    NODE_ENV: process.env.NODE_ENV ?? "test",
    CF_D1_MIGRATE_REPO_ROOT: ISO_ROOT,
    ...extraEnv,
  }
  const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", CLI, ...args], {
    encoding: "utf8",
    env,
    timeout: 60_000,
  })
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` }
}

test("1. local plan works with no staging context", () => {
  const { code, out } = runCli(["plan", "--environment", "local"])
  assert.equal(code, 0)
  assert.match(out, /CONTROL_DB:/)
  assert.match(out, /TENANT_DB_DEFAULT:/)
})

test("2. staging preflight with neither context variable fails unconfigured", () => {
  const { code, out } = runCli(["preflight", "--environment", "staging"])
  assert.equal(code, 1)
  assert.match(out, /staging_context_unconfigured/)
})

test("3. only account configured fails incomplete", () => {
  const { code, out } = runCli(["preflight", "--environment", "staging"], { CF_STAGING_ACCOUNT_ID: ACCT })
  assert.equal(code, 1)
  assert.match(out, /staging_context_incomplete/)
})

test("4. only project configured fails incomplete", () => {
  const { code, out } = runCli(["preflight", "--environment", "staging"], { CF_STAGING_PROJECT: PROJ })
  assert.equal(code, 1)
  assert.match(out, /staging_context_incomplete/)
})

test("5. malformed account fails invalid", () => {
  const { code, out } = runCli(["preflight", "--environment", "staging"], { CF_STAGING_ACCOUNT_ID: "NOT-HEX", CF_STAGING_PROJECT: PROJ })
  assert.equal(code, 1)
  assert.match(out, /staging_context_invalid/)
})

test("6. malformed project fails invalid", () => {
  const { code, out } = runCli(["preflight", "--environment", "staging"], { CF_STAGING_ACCOUNT_ID: ACCT, CF_STAGING_PROJECT: "Bad Project!" })
  assert.equal(code, 1)
  assert.match(out, /staging_context_invalid/)
})

test("7. partial caller assertions fail incomplete", () => {
  const { code, out } = runCli(["preflight", "--environment", "staging", "--account", ACCT], TRUSTED)
  assert.equal(code, 1)
  assert.match(out, /staging_context_assertion_incomplete/)
})

test("8. mismatched full assertions fail unexpected context", () => {
  const { code, out } = runCli(["preflight", "--environment", "staging", "--account", ACCT_WRONG, "--project", PROJ], TRUSTED)
  assert.equal(code, 1)
  assert.match(out, /unexpected_cloudflare_context/)
})

test("9. matching full assertions pass preflight (offline)", () => {
  const { code, out } = runCli(["preflight", "--environment", "staging", "--account", ACCT, "--project", PROJ], TRUSTED)
  assert.equal(code, 0)
  assert.match(out, /trusted_context_complete=true/)
  assert.match(out, /execution_latch_absent=true/)
  assert.match(out, /local_manifest_valid=true/)
  assert.match(out, /remote=false/)
})

test("10. no output contains trusted or asserted context values", () => {
  const runs = [
    runCli(["preflight", "--environment", "staging", "--account", ACCT_WRONG, "--project", PROJ], TRUSTED),
    runCli(["preflight", "--environment", "staging", "--account", ACCT, "--project", PROJ], TRUSTED),
    runCli(["preflight", "--environment", "staging"], TRUSTED),
  ]
  for (const { out } of runs) {
    for (const value of [ACCT, PROJ, ACCT_WRONG]) {
      assert.doesNotMatch(out, new RegExp(value), `output leaked ${value}`)
    }
    assert.doesNotMatch(out, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  }
})

test("11. no network or provider command is spawned by the CLI", () => {
  // The CLI source imports no network/provider client and never spawns wrangler.
  // (Comments may mention --remote to explain the boundary; behavior is what the
  // subprocess tests above prove.)
  const src = readFileSync(CLI, "utf8")
  assert.doesNotMatch(src, /\bwrangler\b/i)
  assert.doesNotMatch(src, /child_process|execSync|spawnSync|spawn\(|fetch\(|https?:\/\//)
})

test("12. deprecated staging apply/verify command names are explicitly rejected", () => {
  const apply = runCli(["apply", "--environment", "staging", "--remote", "--confirm-staging"], TRUSTED)
  assert.equal(apply.code, 1)
  assert.match(apply.out, /staging_remote_execution_not_available/)
  const verify = runCli(["verify", "--environment", "staging", "--remote"], TRUSTED)
  assert.equal(verify.code, 1)
  assert.match(verify.out, /staging_remote_execution_not_available/)
  // The package.json scripts no longer advertise a remote staging verifier/applier.
  const pkg = JSON.parse(readFileSync(join(SRC_ROOT, "package.json"), "utf8"))
  assert.equal(pkg.scripts["cf:d1:migrate:verify-staging"], undefined)
  assert.equal(pkg.scripts["cf:d1:migrate:apply-staging"], undefined)
  assert.ok(pkg.scripts["cf:d1:migrate:preflight-staging"])
})

test("13. production environment is rejected; unknown flags are rejected", () => {
  assert.equal(runCli(["preflight", "--environment", "production"], TRUSTED).code, 1)
  assert.match(runCli(["preflight", "--environment", "production"], TRUSTED).out, /production_environment_forbidden/)
  assert.match(runCli(["apply", "--environment", "local", "--force"]).out, /unknown_flag/)
})

test("14. local apply is hermetic and leaves no retained state (no network)", () => {
  const { code, out } = runCli(["apply", "--environment", "local"])
  assert.equal(code, 0)
  assert.match(out, /fresh_apply=true/)
  assert.match(out, /replay_noop=true/)
  assert.match(out, /cleanup=true/)
})

test.after(() => rmSync(ISO_ROOT, { recursive: true, force: true }))
