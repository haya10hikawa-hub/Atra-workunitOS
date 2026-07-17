#!/usr/bin/env node
/**
 * Cloudflare Deploy Orchestrator
 *
 * Enforces a fixed, non-bypassable order:
 *   1. prepare            — assemble validated untracked config from deploy env vars
 *   2. authority          — load + validate that config ONCE, retain its exact bytes
 *                           and digest, then STOP TRUSTING the original file
 *   3. preflight          — fail-closed validation of a scoped execution config
 *   4. build              — OpenNext Cloudflare build (generates .open-next/worker.js)
 *   5. verify             — preflight --check-artifacts (worker + assets must exist)
 *   6. verify-remote-schema — READ-ONLY remote D1 schema verification (P0-PERSIST-015)
 *   7. deploy             — `wrangler deploy` with a scoped config from the SAME bytes
 *
 * Steps 6 and 7 contact Cloudflare and run ONLY when `CF_DEPLOY_EXECUTE=1`; without
 * it the orchestrator stops after step 5, so preflight/dry-run remain fully OFFLINE.
 * This task never sets that flag.
 *
 * BYTE IDENTITY, NOT PATH IDENTITY
 * --------------------------------
 * The generated config selects the physical databases AND the Worker deployment
 * configuration. A filesystem path is NOT immutable authority: a single reusable
 * private file that survives from build through remote verification to upload could
 * be edited in between, so the config verified and the config deployed would differ
 * even though the path is the same. Path equality proves nothing.
 *
 * Instead the orchestrator loads the config ONCE, retains the exact bytes and their
 * SHA-256, and every step that needs a config (preflight, artifact verification, and
 * the upload) runs against its OWN short-lived scoped config derived from those exact
 * bytes and removed the instant its one Wrangler call returns. Remote verification
 * runs in-process against the same authority and returns its `authorityDigest`;
 * before `wrangler deploy` the orchestrator asserts that digest equals its own
 * retained digest. Verification and upload therefore use different ephemeral paths
 * but provably identical bytes — that is the guarantee, not a false same-path claim.
 *
 * SAFETY:
 *   - no step can be skipped or reordered; any failing step aborts before deploy;
 *   - a remote schema-verification failure, or a digest mismatch, PREVENTS deploy;
 *   - Worker deploy NEVER applies database migrations or bootstrap records — both
 *     are separate, operator-gated commands (cf:d1:migrations:apply,
 *     cf:d1:bootstrap:apply) and are deliberately absent from this pipeline;
 *   - no long-lived execution config exists across the build; every scoped config is
 *     removed as its call returns, and the original generated config is removed the
 *     moment its bytes are retained (and again on every exit).
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { rmSync, readFileSync } from "node:fs"
import { createPrivateKey, sign as edSign } from "node:crypto"
import {
  loadValidatedDeployConfigAuthority, withPrivateExecutionConfig,
} from "./lib/cfDeployConfigAuthority.mjs"
import { verifyRemoteSchemasWithAuthority } from "./cf-d1-schema-verify-remote.mjs"
import { sha256Hex } from "./lib/d1OperationalEvidence.mjs"
import {
  openCommandReceiptContext, assembleUnsignedReceipt, persistSignedReceipt,
  SESSION_PRIVATE_KEY_BASENAME,
} from "./lib/d1EvidenceReceipts.mjs"

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
 * A step marked `usesConfig: true` names `--config <scoped>` in its `args`, where the
 * scoped config is a fresh short-lived file `runStep` mints from the retained
 * authority for THAT invocation and removes immediately afterwards — no step is ever
 * handed the original generated config, and no config survives between steps.
 * `verify-remote-schema` has no `cmd`: it runs in-process through the shared library
 * against the same retained authority, returning a digest the orchestrator matches
 * before deploy.
 *
 * NOTE: there is intentionally NO migration-apply or bootstrap-apply step — Worker
 * deploy must never silently apply database migrations or write bootstrap records.
 */
export const DEPLOY_STEPS = [
  { name: "prepare", cmd: process.execPath, args: () => ["scripts/cloudflare-deploy-prepare.mjs"], beforeAuthority: true },
  { name: "preflight", cmd: process.execPath, args: (cfg) => ["scripts/cloudflare-deploy-preflight.mjs", "--config", cfg], usesConfig: true, purpose: "preflight-exec" },
  { name: "build", cmd: resolve(REPO_ROOT, "node_modules/.bin/opennextjs-cloudflare"), args: () => ["build"] },
  { name: "verify", cmd: process.execPath, args: (cfg) => ["scripts/cloudflare-deploy-preflight.mjs", "--config", cfg, "--check-artifacts"], usesConfig: true, purpose: "artifacts-exec" },
  { name: "verify-remote-schema", inProcess: "verifyRemoteSchema", remote: true },
  { name: "deploy", cmd: WRANGLER_BIN, args: (cfg) => ["deploy", "--config", cfg], remote: true, usesConfig: true, purpose: "deploy-exec" },
]

/**
 * Run one spawned step. A `usesConfig` step gets a FRESH scoped execution config
 * from the retained authority for its single Wrangler call, removed the instant the
 * call returns; a step that needs no config is spawned directly. `spawn` is
 * injectable so tests can observe the exact `--config` file (and its bytes) without
 * contacting Cloudflare.
 */
function runStep(step, authority, spawn = spawnSync) {
  console.log(`cf:deploy → ${step.name}`)
  if (step.usesConfig) {
    // Created immediately before the call, used for that one invocation, gone after.
    return withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: step.purpose }, (cfg) =>
      spawn(step.cmd, step.args(cfg), { cwd: REPO_ROOT, stdio: "inherit" }).status === 0)
  }
  return spawn(step.cmd, step.args(), { cwd: REPO_ROOT, stdio: "inherit" }).status === 0
}

/**
 * Run the pipeline after `prepare`. Returns an exit code and NEVER calls
 * `process.exit` — a nested exit could terminate the process inside a scoped config's
 * callback, before its `finally` removed the file. Every Wrangler call runs against a
 * fresh scoped config from `authority`; there is no reusable execution-config path.
 */
export function runPipeline(authority, execute, deps = {}) {
  const { verifyRemoteSchemas = verifyRemoteSchemasWithAuthority, run = runStep, spawn = spawnSync } = deps
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
      // of a file that may have changed since preflight. Each introspection query
      // opens its own scoped config from this authority.
      const result = verifyRemoteSchemas(authority, { repoRoot: REPO_ROOT, spawn })
      if (!result.ok) {
        console.error(`cf:deploy: FAILED at step "${step.name}" — deploy aborted.`)
        return 1
      }
      // Byte identity is the guarantee: the database whose schema was just verified
      // must be the database we are about to deploy. Both are bound to one digest —
      // a mismatch here is a validate/deploy divergence and MUST prevent deploy.
      if (result.authorityDigest !== authority.sha256) {
        console.error(`cf:deploy: FAILED at step "${step.name}" — verified authority digest does not match the deploy authority. Deploy aborted.`)
        return 1
      }
      continue
    }

    if (!run(step, authority, spawn)) {
      console.error(`cf:deploy: FAILED at step "${step.name}" — deploy aborted.`)
      return 1
    }
  }
  console.log("cf:deploy: complete.")
  return 0
}

// ─── Command-local evidence emission (private; not exported) ──────
//
// Receipt creation and signing live HERE, after a real gated deploy attempt reached
// its pipeline outcome. Status is derived from the outcome and bound to the real
// built Worker artifact bytes; the session key is read and signed inline.

/** Derive status + proof from the REAL deploy outcome (worker artifact required). */
function deriveWorkerDeployOutcome(repoRoot, deployResult) {
  if (!deployResult || typeof deployResult.deployed !== "boolean") {
    return { ok: false, blocked: ["result_shape_invalid"] }
  }
  let workerDigest
  try { workerDigest = sha256Hex(readFileSync(resolve(repoRoot, ".open-next/worker.js"))) } catch { workerDigest = null }
  if (deployResult.deployed && !workerDigest) return { ok: false, blocked: ["worker_artifact_missing"] }
  return {
    ok: true, status: deployResult.deployed ? "success" : "failed",
    proof: {
      worker_artifact_sha256: workerDigest ?? sha256Hex("worker_artifact_absent"),
      deploy_result: deployResult.deployed ? "worker_deployed" : "worker_deploy_failed",
    },
    safeCategories: deployResult.deployed ? ["worker_deployed"] : ["worker_deploy_failed"],
  }
}

/** Emit the deploy receipt from THIS command's real result path. Private. */
function emitWorkerDeployReceipt(sessionDir, { repoRoot, authority, startedAt, deployResult }) {
  const producer = "cf_worker_deploy"
  const operation = "worker_deploy_completed"
  const ctx = openCommandReceiptContext(sessionDir, { repoRoot, authority, producer })
  if (!ctx.ok) return ctx
  const outcome = deriveWorkerDeployOutcome(repoRoot, deployResult)
  if (!outcome.ok) return outcome
  const built = assembleUnsignedReceipt(ctx.session, ctx.existingReceipts, {
    operation, producer, authoritySha256: ctx.authoritySha256, producerSourceSha256: ctx.producerSourceSha256,
    startedAt, completedAt: new Date().toISOString(),
    status: outcome.status, proof: outcome.proof, safeCategories: outcome.safeCategories,
  })
  if (!built.ok) return built
  const pem = readFileSync(resolve(sessionDir, SESSION_PRIVATE_KEY_BASENAME), "utf8")
  built.receipt.receipt_signature = edSign(null, Buffer.from(built.receipt.receipt_sha256, "utf8"), createPrivateKey(pem)).toString("hex")
  return persistSignedReceipt(ctx.session, built.receipt)
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

  let exitCode = 1
  // Evidence session (optional): a deploy receipt exists ONLY for a real gated
  // deploy attempt (CF_DEPLOY_EXECUTE=1) — an offline run performs no deploy and
  // therefore emits nothing. The boundary opens after the authority is retained.
  const evidenceSessionDir = process.env.CF_D1_EVIDENCE_SESSION_DIR
  let retainedAuthority = null
  let evidenceStartedAt = null
  try {
    // Step 2: ONE authority for the whole pipeline — its exact bytes and digest.
    const authority = loadValidatedDeployConfigAuthority({ configPath: generatedConfig, repoRoot: REPO_ROOT, allowPlaceholderIds: false })
    if (!authority.ok) {
      // Safe categories only — never a database ID or config content.
      console.error(`cf:deploy: FAILED — generated config rejected: ${authority.blocked.join(", ")}`)
      exitCode = 1
    } else {
      // Stop trusting the original the moment its exact bytes are retained: nothing
      // downstream reads it, and every Wrangler call runs a fresh scoped config from
      // the authority. Editing, replacing, or deleting it now cannot redirect a step.
      retainedAuthority = authority.authority
      evidenceStartedAt = evidenceSessionDir && execute ? new Date().toISOString() : null
      rmSync(generatedConfig, { force: true })
      exitCode = runPipeline(authority.authority, execute)
    }
  } catch (err) {
    console.error(`cf:deploy: FAILED — ${err instanceof Error ? err.message : "deploy_failed"}`)
    exitCode = 1
  } finally {
    // Backstop, on EVERY exit: the original generated config never outlives the run,
    // even if the authority load threw before it was removed. Scoped execution
    // configs remove themselves as each of their calls returns.
    rmSync(generatedConfig, { force: true })
  }

  // Command-local receipt from THIS result path, only when a gated deploy actually
  // ran. Status is bound to the real built Worker artifact bytes and derived from the
  // pipeline outcome — no exit-code parameter exists.
  if (evidenceSessionDir && execute && retainedAuthority !== null && evidenceStartedAt !== null) {
    const receipt = emitWorkerDeployReceipt(evidenceSessionDir, {
      repoRoot: REPO_ROOT, authority: retainedAuthority, startedAt: evidenceStartedAt,
      deployResult: { deployed: exitCode === 0 },
    })
    if (receipt.ok) console.log("evidence: receipt recorded (worker_deploy_completed)")
    else console.error(`evidence: receipt FAILED — ${receipt.blocked.join(", ")}`)
  }
  process.exit(exitCode)
}

// Run only when invoked directly (importing for tests must not execute).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
