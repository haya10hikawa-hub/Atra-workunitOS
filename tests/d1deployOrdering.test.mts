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
/** A spawned step's args for a given private execution config. */
function argsOf(name: string, executionConfig: string): string[] {
  const step = stepNamed(name)
  if (!step.args) throw new Error(`"${name}" must be a spawned step with args`)
  return step.args(executionConfig)
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
  // failure prevents deploy). It returns an exit code rather than exiting inside
  // the loop — a nested exit would terminate inside a scoped config's callback,
  // before its finally removed the file.
  const src = read("scripts/cloudflare-deploy.mjs")
  assert.match(src, /if \(!run\(step, authority, spawn\)\)[\s\S]*?deploy aborted[\s\S]*?return 1/)
  assert.match(src, /if \(!result\.ok\)[\s\S]*?deploy aborted[\s\S]*?return 1/, "a remote schema-verification failure must abort before deploy")
  // …and a verified-authority digest mismatch aborts before deploy too.
  assert.match(src, /result\.authorityDigest !== authority\.sha256[\s\S]*?Deploy aborted[\s\S]*?return 1/, "a digest mismatch must abort before deploy")
})

test("Worker deploy NEVER applies database migrations", () => {
  const serialized = JSON.stringify(DEPLOY_STEPS)
  assert.doesNotMatch(serialized, /migrations:apply|cf-d1-migrations-apply|d1["'\s,]*execute/i)
  for (const step of DEPLOY_STEPS) {
    assert.doesNotMatch(step.name, /migrat/i, "no deploy step may be a migration step")
  }
  const src = read("scripts/cloudflare-deploy.mjs")
  assert.doesNotMatch(src, /cf-d1-migrations-apply/)
  assert.doesNotMatch(src, /cf-d1-bootstrap-apply/, "deploy must never write bootstrap records either")
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
  assert.match(src, /if \(step\.remote && !execute\)[\s\S]*?return 0/)
})

test("remote schema verification and deploy are bound by AUTHORITY BYTE IDENTITY — never the mutable generated config, and not a false same-path claim", () => {
  // Verification runs IN-PROCESS against the same authority the deploy uses, rather
  // than spawning a child that would snapshot wrangler.deploy.json a second time —
  // two independent reads of a mutable file could verify one database and deploy
  // another. It returns a digest the orchestrator matches before uploading.
  assert.equal(stepNamed("verify-remote-schema").inProcess, "verifyRemoteSchema")
  assert.equal(stepNamed("verify-remote-schema").cmd, undefined, "verification must not spawn a second snapshot")
  const src = read("scripts/cloudflare-deploy.mjs")
  assert.match(src, /verifyRemoteSchemas\(authority, \{ repoRoot: REPO_ROOT, spawn \}\)/)
  // The binding is byte identity: deploy aborts unless the verified digest equals
  // the orchestrator's retained authority digest. (The old test claimed they "cannot
  // receive different config paths" — they may; the guarantee is the digest match.)
  assert.match(src, /result\.authorityDigest !== authority\.sha256/, "deploy must match the verified authority digest")

  // NO step may name the original generated config: every step's args are a
  // function of the SCOPED execution config it is handed for its single call.
  for (const step of DEPLOY_STEPS) {
    if (!step.args) continue
    const args = step.args("SCOPED_EXEC_CONFIG").join(" ")
    assert.doesNotMatch(args, /wrangler\.deploy\.json/, `${step.name} must never receive the original generated config`)
  }
  // …and deploy receives exactly the scoped config it is minted for its call.
  assert.deepEqual(argsOf("deploy", "SCOPED_EXEC_CONFIG"), ["deploy", "--config", "SCOPED_EXEC_CONFIG"])
  assert.deepEqual(argsOf("preflight", "SCOPED_EXEC_CONFIG"), ["scripts/cloudflare-deploy-preflight.mjs", "--config", "SCOPED_EXEC_CONFIG"])
})

test("the orchestrator keeps NO long-lived execution config, and removes the original generated config on every exit", () => {
  const src = read("scripts/cloudflare-deploy.mjs")
  // There is no reusable execution-config path in the orchestrator — every Wrangler
  // call runs against a scoped config the shared lease removes on return.
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, ""), /createPrivateExecutionConfig|removePrivateExecutionConfig/,
    "the orchestrator must not create or hold a reusable execution config")
  assert.match(src, /withPrivateExecutionConfig\(authority, \{ repoRoot: REPO_ROOT, purpose: step\.purpose \}/, "config-using steps mint a scoped config per call")
  // The original generated config is removed the moment the authority is retained…
  assert.match(src, /rmSync\(generatedConfig, \{ force: true \}\)\n {6}exitCode = runPipeline/, "the original is dropped once its bytes are retained")
  // …and again unconditionally in the finally.
  const finallyIdx = src.lastIndexOf("} finally {")
  const body = src.slice(finallyIdx, src.indexOf("\n  }", finallyIdx))
  assert.match(body, /rmSync\(generatedConfig, \{ force: true \}\)/)
  assert.doesNotMatch(body.replace(/\/\/[^\n]*/g, ""), /\bif\s*\(/, "cleanup must be unconditional")
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
