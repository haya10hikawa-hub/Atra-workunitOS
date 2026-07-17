/**
 * P0-PERSIST-015 / P0-FIX-018 — Worker deploy ordering + migration/deploy separation
 * (#155).
 *
 * Worker deploy must NEVER silently apply database migrations, and a real deploy
 * (CF_DEPLOY_EXECUTE=1) must be preceded by a successful READ-ONLY remote D1 schema
 * verification. Offline preflight/dry-run must never contact Cloudflare.
 *
 * The pipeline itself is now PRIVATE to the command entrypoint; this file asserts the
 * ordering through the pure, non-authorizing `getDeployStepMetadata` /
 * `validateDeployStepOrder` exports and by inspecting the (comment-stripped) source.
 * Behavioural gate/latch coverage lives in `cloudflareRemoteGateBoundaries.test.mts`.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { getDeployStepMetadata, validateDeployStepOrder } from "../scripts/cloudflare-deploy.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p: string) => readFileSync(resolve(REPO_ROOT, p), "utf8")
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")
const names = () => getDeployStepMetadata().map((s) => s.name)
const idx = (n: string) => names().indexOf(n)

test("the deploy pipeline order is exactly prepare → preflight → build → verify → verify-remote-schema → deploy", () => {
  assert.deepEqual(names(), ["prepare", "preflight", "build", "verify", "verify-remote-schema", "deploy"])
  assert.deepEqual(validateDeployStepOrder(), { ok: true, failures: [] })
})

test("validateDeployStepOrder rejects a reordered, truncated, or migration-injected pipeline", () => {
  assert.equal(validateDeployStepOrder(["preflight", "prepare", "build", "verify", "verify-remote-schema", "deploy"]).ok, false)
  assert.equal(validateDeployStepOrder(["prepare", "preflight", "build", "deploy", "verify-remote-schema"]).ok, false)
  assert.ok(validateDeployStepOrder(["prepare", "preflight", "build", "verify", "deploy"]).failures.includes("verify_remote_schema_missing"))
  assert.ok(validateDeployStepOrder(["prepare", "migrations-apply", "verify-remote-schema", "deploy"]).failures.includes("migration_or_bootstrap_step_present"))
  // verify-remote-schema must be IMMEDIATELY before deploy.
  assert.ok(validateDeployStepOrder(["prepare", "preflight", "verify-remote-schema", "build", "verify", "deploy"]).failures.includes("deploy_not_immediately_after_verification"))
})

test("remote schema verification PRECEDES deploy, deploy is last, and only the remote steps are network steps", () => {
  assert.ok(idx("verify-remote-schema") >= 0)
  assert.ok(idx("verify-remote-schema") < idx("deploy"))
  assert.equal(idx("deploy"), names().length - 1, "deploy must be the final step")
  const remote = getDeployStepMetadata().filter((s) => s.remote).map((s) => s.name)
  assert.deepEqual(remote, ["verify-remote-schema", "deploy"])
  for (const offline of ["prepare", "preflight", "build", "verify"]) {
    assert.equal(getDeployStepMetadata().find((s) => s.name === offline)!.remote, false, `${offline} must be offline`)
  }
})

test("the step metadata is pure information — it carries no command binary, authority, or execution flag", () => {
  for (const step of getDeployStepMetadata()) {
    assert.deepEqual(Object.keys(step).sort(), ["name", "remote", "usesConfig"], `${step.name} exposes only non-authorizing metadata`)
  }
  // A returned copy cannot mutate the frozen source of truth.
  const copy = getDeployStepMetadata()
  copy.push({ name: "rogue", remote: true, usesConfig: true })
  assert.equal(getDeployStepMetadata().length, 6, "the metadata source is not mutable via a returned copy")
})

test("no step can be skipped or reordered — the entrypoint aborts on the FIRST failing gate, returning an exit code", () => {
  const src = codeOf("scripts/cloudflare-deploy.mjs")
  // Offline gates abort before the latch; the remote region returns 1 on failure.
  assert.match(src, /if \(!runOfflineSteps\(authority\.authority\)\)/)
  assert.match(src, /if \(!result\.ok\)[\s\S]*?deploy aborted[\s\S]*?return 1/, "a remote schema-verification failure must abort before deploy")
  assert.match(src, /if \(!deployAuthorityDigestsMatch\(result\.authorityDigest, authority\.sha256\)\)[\s\S]*?Deploy aborted[\s\S]*?return 1/, "a digest mismatch must abort before deploy")
  // The remote region never calls process.exit (a nested exit would skip a scoped config's finally).
  const remote = src.slice(src.indexOf("function runRemotePipeline("), src.indexOf("function main("))
  assert.doesNotMatch(remote, /process\.exit/, "the remote region must return an exit code, never exit")
})

test("Worker deploy NEVER applies database migrations or writes bootstrap records", () => {
  const src = codeOf("scripts/cloudflare-deploy.mjs")
  assert.doesNotMatch(src, /cf-d1-migrations-apply/)
  assert.doesNotMatch(src, /cf-d1-bootstrap-apply/)
  assert.doesNotMatch(src, /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE/, "deploy must never set another command's gate")
  for (const step of getDeployStepMetadata()) assert.doesNotMatch(step.name, /migrat|bootstrap/i)
})

test("the remote steps are reached ONLY through the entrypoint's CF_DEPLOY_EXECUTE gate + private latch", () => {
  const src = codeOf("scripts/cloudflare-deploy.mjs")
  assert.match(src, /const execute = process\.env\.CF_DEPLOY_EXECUTE === "1"/)
  // The latch opens only inside main, after the offline gates, and only when execute.
  assert.match(src, /deployExecutionAuthorized = true/)
  assert.equal((src.match(/deployExecutionAuthorized = true/g) ?? []).length, 1, "the latch is opened in exactly one place")
  assert.match(src, /requireDeployExecutionAuthorized\(\)/, "remote leaves require the latch")
})

test("offline preflight and dry-run perform NO remote schema query and never contact Cloudflare", () => {
  for (const script of ["scripts/cloudflare-deploy-preflight.mjs", "scripts/cloudflare-deploy-dry-run.mjs"]) {
    const src = read(script)
    assert.doesNotMatch(src, /cf-d1-schema-verify-remote/, `${script} must not run remote schema verification`)
    assert.doesNotMatch(src, /d1["'\s]*,\s*["']execute/, `${script} must not execute D1`)
    assert.doesNotMatch(src, /"--remote"/, `${script} must not use remote mode`)
  }
  assert.match(read("scripts/cloudflare-deploy-dry-run.mjs"), /--dry-run/)
})

test("EXTERNAL_ACTIONS_ENABLED and ALLOW_LEGACY_INGEST_FALLBACK remain false", () => {
  const cfg = JSON.parse(read("wrangler.json"))
  assert.equal(cfg.vars.EXTERNAL_ACTIONS_ENABLED, "false")
  assert.equal(cfg.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})
