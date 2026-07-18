/**
 * Real CLI subprocess tests for scripts/cf-d1-migrate.mjs
 * (P0-FIX-D1-CONTRACT-AUTHORITY).
 *
 * These launch the ACTUAL CLI as a child process and assert exit codes + safe
 * error categories — not just validateInvocation() directly. They prove the real
 * command path loads trusted staging context, fails closed on mismatch/absence,
 * and stops before any network without the execution latch. No test performs a
 * network request; the execution latch is never set.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, cpSync, realpathSync, rmSync } from "node:fs"
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

const TRUSTED = { CF_STAGING_ACCOUNT_ID: "acct-trusted", CF_STAGING_PROJECT: "proj-trusted" }

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

test("1. local plan succeeds without staging context", () => {
  const { code, out } = runCli(["plan", "--environment", "local"])
  assert.equal(code, 0)
  assert.match(out, /CONTROL_DB:/)
  assert.match(out, /TENANT_DB_DEFAULT:/)
})

test("2. local apply rejects --remote", () => {
  const { code, out } = runCli(["apply", "--environment", "local", "--remote"])
  assert.equal(code, 1)
  assert.match(out, /remote_flag_forbidden_for_local/)
})

test("3. staging apply without trusted context fails staging_context_unconfigured", () => {
  const { code, out } = runCli(["apply", "--environment", "staging", "--remote", "--confirm-staging"])
  assert.equal(code, 1)
  assert.match(out, /staging_context_unconfigured/)
})

test("4. staging apply with mismatched caller assertion fails unexpected_cloudflare_context", () => {
  const { code, out } = runCli(
    ["apply", "--environment", "staging", "--remote", "--confirm-staging", "--account", "acct-WRONG", "--project", "proj-trusted"],
    TRUSTED,
  )
  assert.equal(code, 1)
  assert.match(out, /unexpected_cloudflare_context/)
})

test("5. staging apply with matching context but no latch stops before network (exit 3)", () => {
  const { code, out } = runCli(
    ["apply", "--environment", "staging", "--remote", "--confirm-staging", "--account", "acct-trusted", "--project", "proj-trusted"],
    TRUSTED,
  )
  assert.equal(code, 3)
  assert.match(out, /authorization gate PASSED/)
  assert.match(out, /CF_D1_STAGING_EXECUTE=1 is not set/)
})

test("6. production environment is rejected", () => {
  const { code, out } = runCli(["apply", "--environment", "production", "--remote", "--confirm-staging"], TRUSTED)
  assert.equal(code, 1)
  assert.match(out, /production_environment_forbidden/)
})

test("7. unknown flags are rejected", () => {
  const { code, out } = runCli(["apply", "--environment", "local", "--force"])
  assert.equal(code, 1)
  assert.match(out, /unknown_flag/)
})

test("8. no output contains context values, IDs, or database identifiers", () => {
  // Exercise the mismatch + matching paths, then scan ALL output for the trusted
  // and asserted context values — none may appear.
  const mismatch = runCli(
    ["apply", "--environment", "staging", "--remote", "--confirm-staging", "--account", "acct-WRONG", "--project", "proj-trusted"],
    TRUSTED,
  )
  const matching = runCli(
    ["apply", "--environment", "staging", "--remote", "--confirm-staging", "--account", "acct-trusted", "--project", "proj-trusted"],
    TRUSTED,
  )
  for (const out of [mismatch.out, matching.out]) {
    for (const secret of ["acct-trusted", "proj-trusted", "acct-WRONG"]) {
      assert.doesNotMatch(out, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `output leaked ${secret}`)
    }
    // No UUID-shaped database id in output.
    assert.doesNotMatch(out, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  }
})

test("9. local apply is hermetic and leaves no retained state (no network)", () => {
  const { code, out } = runCli(["apply", "--environment", "local"])
  assert.equal(code, 0)
  assert.match(out, /fresh_apply=true/)
  assert.match(out, /replay_noop=true/)
  assert.match(out, /cleanup=true/)
})

test.after(() => rmSync(ISO_ROOT, { recursive: true, force: true }))
