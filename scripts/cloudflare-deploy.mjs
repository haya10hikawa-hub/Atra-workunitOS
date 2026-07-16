#!/usr/bin/env node
/**
 * Cloudflare Deploy Orchestrator
 *
 * Enforces a fixed, non-bypassable order:
 *   1. prepare            — assemble validated untracked config from deploy env vars
 *   2. authority          — load + validate that config ONCE, retain its exact bytes
 *   3. preflight          — fail-closed validation of the PRIVATE execution config
 *   4. build              — OpenNext Cloudflare build (generates .open-next/worker.js)
 *   5. verify             — preflight --check-artifacts (worker + assets must exist)
 *   6. verify-remote-schema — READ-ONLY remote D1 schema verification (P0-PERSIST-015)
 *   7. deploy             — `wrangler deploy` with the SAME private execution config
 *
 * Steps 6 and 7 contact Cloudflare and run ONLY when `CF_DEPLOY_EXECUTE=1`; without
 * it the orchestrator stops after step 5, so preflight/dry-run remain fully OFFLINE.
 * This task never sets that flag.
 *
 * ONE CONFIG AUTHORITY
 * --------------------
 * The generated config selects the physical databases AND the Worker deployment
 * configuration. Previously every step re-read `wrangler.deploy.json` independently,
 * so the config verified remotely and the config deployed were two separate reads of
 * a mutable file and could differ. Now the orchestrator loads it ONCE, writes the
 * exact retained bytes to a single private execution config, and every subsequent
 * step — preflight, artifact verification, remote schema verification, and the
 * upload — uses that one file. Editing, replacing, or deleting the original after
 * the snapshot cannot redirect anything.
 *
 * SAFETY:
 *   - no step can be skipped or reordered; any failing step aborts before deploy;
 *   - a remote schema-verification failure PREVENTS the deploy;
 *   - Worker deploy NEVER applies database migrations or bootstrap records — both
 *     are separate, operator-gated commands (cf:d1:migrations:apply,
 *     cf:d1:bootstrap:apply) and are deliberately absent from this pipeline;
 *   - the private execution config AND the original generated config are removed on
 *     EVERY exit (success, build/preflight/verification/deploy failure, or throw).
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { rmSync } from "node:fs"
import {
  loadValidatedDeployConfigAuthority, createPrivateExecutionConfig, removePrivateExecutionConfig,
} from "./lib/cfDeployConfigAuthority.mjs"
import { verifyRemoteSchemasWithAuthority } from "./cf-d1-schema-verify-remote.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const GENERATED_CONFIG = "wrangler.deploy.json"
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/**
 * Ordered pipeline. Exported so tests can assert that no gate (notably `prepare`,
 * `preflight`, and `verify-remote-schema`) is ever removed or reordered before
 * `deploy`. Steps marked `remote: true` contact Cloudflare and are reached ONLY
 * with CF_DEPLOY_EXECUTE=1.
 *
 * `args` is a FUNCTION of the private execution config: no step may name the
 * original generated config, so none can be handed a file that changed after
 * validation. `verify-remote-schema` has no `cmd` — it runs in-process through the
 * shared library against the same retained authority, rather than spawning a child
 * that would snapshot the file a second time.
 *
 * NOTE: there is intentionally NO migration-apply or bootstrap-apply step — Worker
 * deploy must never silently apply database migrations or write bootstrap records.
 */
export const DEPLOY_STEPS = [
  { name: "prepare", cmd: process.execPath, args: () => ["scripts/cloudflare-deploy-prepare.mjs"], beforeAuthority: true },
  { name: "preflight", cmd: process.execPath, args: (cfg) => ["scripts/cloudflare-deploy-preflight.mjs", "--config", cfg] },
  { name: "build", cmd: resolve(REPO_ROOT, "node_modules/.bin/opennextjs-cloudflare"), args: () => ["build"] },
  { name: "verify", cmd: process.execPath, args: (cfg) => ["scripts/cloudflare-deploy-preflight.mjs", "--config", cfg, "--check-artifacts"] },
  { name: "verify-remote-schema", inProcess: "verifyRemoteSchema", remote: true },
  { name: "deploy", cmd: WRANGLER_BIN, args: (cfg) => ["deploy", "--config", cfg], remote: true },
]

function runStep(step, executionConfig) {
  console.log(`cf:deploy → ${step.name}`)
  const result = spawnSync(step.cmd, step.args(executionConfig), { cwd: REPO_ROOT, stdio: "inherit" })
  return result.status === 0
}

/**
 * Run the pipeline after `prepare`. Returns an exit code and NEVER calls
 * `process.exit` — the caller's `finally` must be able to remove the private
 * execution config first. A nested exit would leave a file containing real database
 * IDs at the repository root.
 */
export function runPipeline(authority, executionConfig, execute, deps = {}) {
  const { verifyRemoteSchemas = verifyRemoteSchemasWithAuthority, run = runStep } = deps
  for (const step of DEPLOY_STEPS) {
    // `prepare` produced the config the authority was loaded from; it has already
    // run by the time we get here.
    if (step.beforeAuthority) continue

    // The first remote step halts an offline run — nothing after it contacts
    // Cloudflare without an explicit CF_DEPLOY_EXECUTE=1.
    if (step.remote && !execute) {
      console.log(
        "cf:deploy: stopping before remote schema verification + upload (set CF_DEPLOY_EXECUTE=1 to perform the real deploy).",
      )
      return 0
    }

    if (step.inProcess === "verifyRemoteSchema") {
      console.log(`cf:deploy → ${step.name}`)
      // The SAME retained authority that will be deployed — not a second snapshot
      // of a file that may have changed since preflight.
      const result = verifyRemoteSchemas(authority, { repoRoot: REPO_ROOT })
      if (!result.ok) {
        console.error(`cf:deploy: FAILED at step "${step.name}" — deploy aborted.`)
        return 1
      }
      continue
    }

    if (!run(step, executionConfig)) {
      console.error(`cf:deploy: FAILED at step "${step.name}" — deploy aborted.`)
      return 1
    }
  }
  console.log("cf:deploy: complete.")
  return 0
}

function main() {
  const execute = process.env.CF_DEPLOY_EXECUTE === "1"
  const generatedConfig = resolve(REPO_ROOT, GENERATED_CONFIG)

  // Step 1: prepare writes the generated config from deploy env vars.
  const prepare = DEPLOY_STEPS[0]
  console.log(`cf:deploy → ${prepare.name}`)
  if (spawnSync(prepare.cmd, prepare.args(), { cwd: REPO_ROOT, stdio: "inherit" }).status !== 0) {
    console.error(`cf:deploy: FAILED at step "${prepare.name}" — deploy aborted.`)
    rmSync(generatedConfig, { force: true })
    process.exit(1)
  }

  let executionConfig = null
  let exitCode = 1
  try {
    // Step 2: ONE authority for the whole pipeline.
    const authority = loadValidatedDeployConfigAuthority({ configPath: generatedConfig, repoRoot: REPO_ROOT, allowPlaceholderIds: false })
    if (!authority.ok) {
      // Safe categories only — never a database ID or config content.
      console.error(`cf:deploy: FAILED — generated config rejected: ${authority.blocked.join(", ")}`)
      exitCode = 1
    } else {
      executionConfig = createPrivateExecutionConfig(authority.authority, { repoRoot: REPO_ROOT, purpose: "deploy-exec" })
      exitCode = runPipeline(authority.authority, executionConfig, execute)
    }
  } catch (err) {
    console.error(`cf:deploy: FAILED — ${err instanceof Error ? err.message : "deploy_failed"}`)
    exitCode = 1
  } finally {
    // Unconditional, on EVERY exit. The orchestrator owns both files: the private
    // execution config it created, and the generated config `prepare` produced.
    // Neither may outlive the run — both carry real database IDs.
    removePrivateExecutionConfig(executionConfig)
    rmSync(generatedConfig, { force: true })
  }
  process.exit(exitCode)
}

// Run only when invoked directly (importing for tests must not execute).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
