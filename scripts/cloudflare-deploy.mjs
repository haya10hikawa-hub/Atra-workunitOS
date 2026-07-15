#!/usr/bin/env node
/**
 * Cloudflare Deploy Orchestrator
 *
 * Enforces a fixed, non-bypassable order:
 *   1. prepare            — assemble validated untracked config from deploy env vars
 *   2. preflight          — fail-closed config validation (rejects placeholders, etc.)
 *   3. build              — OpenNext Cloudflare build (generates .open-next/worker.js)
 *   4. verify             — preflight --check-artifacts (worker + assets must exist)
 *   5. verify-remote-schema — READ-ONLY remote D1 schema verification (P0-PERSIST-015)
 *   6. deploy             — `wrangler deploy` with the prepared config
 *
 * Steps 5 and 6 contact Cloudflare and run ONLY when `CF_DEPLOY_EXECUTE=1`; without
 * it the orchestrator stops after step 4, so preflight/dry-run remain fully OFFLINE.
 * This task never sets that flag.
 *
 * SAFETY:
 *   - no step can be skipped or reordered; any failing step aborts before deploy;
 *   - a remote schema-verification failure PREVENTS the deploy;
 *   - Worker deploy NEVER applies database migrations — migration apply is a
 *     separate, operator-gated command (cf:d1:migrations:apply) and is
 *     deliberately absent from this pipeline.
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
 * `prepare`, `preflight`, and `verify-remote-schema`) is ever removed or
 * reordered before `deploy`. Steps marked `remote: true` contact Cloudflare and
 * are reached ONLY with CF_DEPLOY_EXECUTE=1.
 *
 * NOTE: there is intentionally NO migration-apply step — Worker deploy must never
 * silently apply database migrations.
 */
export const DEPLOY_STEPS = [
  { name: "prepare", cmd: process.execPath, args: ["scripts/cloudflare-deploy-prepare.mjs"] },
  { name: "preflight", cmd: process.execPath, args: ["scripts/cloudflare-deploy-preflight.mjs", "--config", GENERATED_CONFIG] },
  { name: "build", cmd: resolve(REPO_ROOT, "node_modules/.bin/opennextjs-cloudflare"), args: ["build"] },
  { name: "verify", cmd: process.execPath, args: ["scripts/cloudflare-deploy-preflight.mjs", "--config", GENERATED_CONFIG, "--check-artifacts"] },
  { name: "verify-remote-schema", cmd: process.execPath, args: ["scripts/cf-d1-schema-verify-remote.mjs", "--config", GENERATED_CONFIG, "--remote"], remote: true },
  { name: "deploy", cmd: WRANGLER_BIN, args: ["deploy", "--config", GENERATED_CONFIG], remote: true },
]

function runStep(step) {
  console.log(`cf:deploy → ${step.name}`)
  const result = spawnSync(step.cmd, step.args, { cwd: REPO_ROOT, stdio: "inherit" })
  return result.status === 0
}

function main() {
  const execute = process.env.CF_DEPLOY_EXECUTE === "1"
  for (const step of DEPLOY_STEPS) {
    // The first remote step halts an offline run — nothing after it contacts
    // Cloudflare without an explicit CF_DEPLOY_EXECUTE=1.
    if (step.remote && !execute) {
      console.log(
        "cf:deploy: stopping before remote schema verification + upload (set CF_DEPLOY_EXECUTE=1 to perform the real deploy).",
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
