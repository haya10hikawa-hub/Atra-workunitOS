#!/usr/bin/env node
/**
 * Cloudflare Deploy Orchestrator
 *
 * Enforces a fixed, non-bypassable order:
 *   1. prepare  — assemble validated untracked config from deploy env vars
 *   2. preflight — fail-closed config validation (rejects placeholders, etc.)
 *   3. build    — OpenNext Cloudflare build (generates .open-next/worker.js)
 *   4. verify   — preflight --check-artifacts (worker + assets must exist)
 *   5. deploy   — `wrangler deploy` with the prepared config
 *
 * The real upload (step 5) only runs when `CF_DEPLOY_EXECUTE=1` is set; without
 * it the orchestrator stops after verification. This task never sets that flag.
 *
 * SAFETY: no step can be skipped; any failing step aborts the run before deploy.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const GENERATED_CONFIG = "wrangler.deploy.json"
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/**
 * Ordered pipeline. Exported so tests can assert that no gate (notably
 * `prepare` and `preflight`) is ever removed or reordered before `deploy`.
 */
export const DEPLOY_STEPS = [
  { name: "prepare", cmd: process.execPath, args: ["scripts/cloudflare-deploy-prepare.mjs"] },
  { name: "preflight", cmd: process.execPath, args: ["scripts/cloudflare-deploy-preflight.mjs", "--config", GENERATED_CONFIG] },
  { name: "build", cmd: resolve(REPO_ROOT, "node_modules/.bin/opennextjs-cloudflare"), args: ["build"] },
  { name: "verify", cmd: process.execPath, args: ["scripts/cloudflare-deploy-preflight.mjs", "--config", GENERATED_CONFIG, "--check-artifacts"] },
  { name: "deploy", cmd: WRANGLER_BIN, args: ["deploy", "--config", GENERATED_CONFIG] },
]

function runStep(step) {
  console.log(`cf:deploy → ${step.name}`)
  const result = spawnSync(step.cmd, step.args, { cwd: REPO_ROOT, stdio: "inherit" })
  return result.status === 0
}

function main() {
  const execute = process.env.CF_DEPLOY_EXECUTE === "1"
  for (const step of DEPLOY_STEPS) {
    if (step.name === "deploy" && !execute) {
      console.log(
        "cf:deploy: stopping before upload (set CF_DEPLOY_EXECUTE=1 to perform the real deploy).",
      )
      process.exit(0)
    }
    if (!runStep(step)) {
      console.error(`cf:deploy: FAILED at step "${step.name}" — deploy aborted.`)
      process.exit(1)
    }
  }
  console.log("cf:deploy: complete.")
  process.exit(0)
}

// Run only when invoked directly (importing for tests must not execute).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
