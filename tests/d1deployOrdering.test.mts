/**
 * P0-PERSIST-015 — Worker deploy ordering + migration/deploy separation (#155).
 *
 * Worker deploy must NEVER silently apply database migrations, and a real deploy
 * (CF_DEPLOY_EXECUTE=1) must be preceded by a successful READ-ONLY remote D1
 * schema verification. Offline preflight/dry-run must never contact Cloudflare.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { DEPLOY_STEPS, type DeployStep } from "../scripts/cloudflare-deploy.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p: string) => readFileSync(resolve(REPO_ROOT, p), "utf8")
const names = () => DEPLOY_STEPS.map((s) => s.name)
const idx = (n: string) => names().indexOf(n)
/** The named step — throwing (rather than `undefined`) if the pipeline lost it. */
function stepNamed(name: string): DeployStep {
  const step = DEPLOY_STEPS.find((s) => s.name === name)
  if (!step) throw new Error(`deploy pipeline is missing the "${name}" step`)
  return step
}

test("the deploy pipeline order is exactly prepare → validate → build → verify artifacts → verify remote schema → deploy", () => {
  assert.deepEqual(names(), ["prepare", "preflight", "build", "verify", "verify-remote-schema", "deploy"])
})

test("remote schema verification PRECEDES deploy and deploy is last", () => {
  assert.ok(idx("verify-remote-schema") >= 0, "the remote schema verification step must exist")
  assert.ok(idx("verify-remote-schema") < idx("deploy"), "schema verification must precede deploy")
  assert.equal(idx("deploy"), DEPLOY_STEPS.length - 1, "deploy must be the final step")
})

test("no step can be skipped or reordered — every gate precedes deploy", () => {
  for (const gate of ["prepare", "preflight", "build", "verify", "verify-remote-schema"]) {
    assert.ok(idx(gate) >= 0, `${gate} must exist`)
    assert.ok(idx(gate) < idx("deploy"), `${gate} must precede deploy`)
  }
  // The orchestrator aborts on the FIRST failing step (so a schema-verification
  // failure prevents deploy).
  const src = read("scripts/cloudflare-deploy.mjs")
  assert.match(src, /if \(!runStep\(step\)\)[\s\S]*?deploy aborted[\s\S]*?process\.exit\(1\)/)
})

test("Worker deploy NEVER applies database migrations", () => {
  const serialized = JSON.stringify(DEPLOY_STEPS)
  assert.doesNotMatch(serialized, /migrations:apply|cf-d1-migrations-apply|d1["'\s,]*execute/i)
  for (const step of DEPLOY_STEPS) {
    assert.doesNotMatch(step.name, /migrat/i, "no deploy step may be a migration step")
  }
  const src = read("scripts/cloudflare-deploy.mjs")
  assert.doesNotMatch(src, /cf-d1-migrations-apply/)
})

test("only the remote steps are network steps, and they are gated by CF_DEPLOY_EXECUTE=1", () => {
  const remoteSteps = DEPLOY_STEPS.filter((s) => s.remote === true).map((s) => s.name)
  assert.deepEqual(remoteSteps, ["verify-remote-schema", "deploy"])
  for (const offline of ["prepare", "preflight", "build", "verify"]) {
    assert.notEqual(stepNamed(offline).remote, true, `${offline} must be offline`)
  }
  // The loop halts at the first remote step unless CF_DEPLOY_EXECUTE=1.
  const src = read("scripts/cloudflare-deploy.mjs")
  assert.match(src, /const execute = process\.env\.CF_DEPLOY_EXECUTE === "1"/)
  assert.match(src, /if \(step\.remote && !execute\)[\s\S]*?process\.exit\(0\)/)
})

test("the remote schema verification step is READ-ONLY and uses the generated config", () => {
  const args = stepNamed("verify-remote-schema").args.join(" ")
  assert.match(args, /cf-d1-schema-verify-remote\.mjs/)
  assert.match(args, /--config wrangler\.deploy\.json/)
  assert.match(args, /--remote/)
})

test("offline preflight and dry-run perform NO remote schema query and never contact Cloudflare", () => {
  for (const script of ["scripts/cloudflare-deploy-preflight.mjs", "scripts/cloudflare-deploy-dry-run.mjs"]) {
    const src = read(script)
    assert.doesNotMatch(src, /cf-d1-schema-verify-remote/, `${script} must not run remote schema verification`)
    assert.doesNotMatch(src, /d1["'\s]*,\s*["']execute/, `${script} must not execute D1`)
    assert.doesNotMatch(src, /"--remote"/, `${script} must not use remote mode`)
  }
  // The dry-run only ever passes --dry-run to wrangler deploy.
  assert.match(read("scripts/cloudflare-deploy-dry-run.mjs"), /--dry-run/)
})

test("EXTERNAL_ACTIONS_ENABLED remains false in the committed Worker config", () => {
  const cfg = JSON.parse(read("wrangler.json"))
  assert.equal(cfg.vars.EXTERNAL_ACTIONS_ENABLED, "false")
  assert.equal(cfg.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})
