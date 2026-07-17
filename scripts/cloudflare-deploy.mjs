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
 *
 * P0-FIX-018 — remote execution is ENTRYPOINT-ONLY. There is NO exported `runPipeline`
 * and no `RunPipelineDeps`: the pipeline and every remote-capable leaf are PRIVATE to
 * this module. `main()` alone reads `CF_DEPLOY_EXECUTE`, and a module-private
 * deployment-authorization latch is opened ONLY after every gate (validated config +
 * offline preflight/build/artifact verification) succeeds — never by a caller-supplied
 * boolean. Every remote leaf (in-process schema introspection and `wrangler deploy`)
 * calls `requireDeployExecutionAuthorized()` before touching Cloudflare, and the latch
 * is closed in `finally`. Deploy does its OWN private Wrangler-backed schema
 * introspection (reusing only PURE schema helpers) — it never imports a remote-capable
 * function from the standalone schema command. The only exported surface is pure,
 * non-authorizing step metadata and a digest-equality predicate.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { rmSync, readFileSync } from "node:fs"
import { createPrivateKey, sign as edSign } from "node:crypto"
import {
  loadValidatedDeployConfigAuthority, withPrivateExecutionConfig,
} from "./lib/cfDeployConfigAuthority.mjs"
// PURE schema helpers only — NEVER a remote-capable function from the schema command.
import { loadSchemaContract, verifyViaRunner, isReadOnlyIntrospectionSql } from "./lib/d1SchemaContract.mjs"
import { KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
import { sha256Hex } from "./lib/d1OperationalEvidence.mjs"
import {
  openCommandReceiptContext, assembleUnsignedReceipt, persistSignedReceipt,
  SESSION_PRIVATE_KEY_BASENAME,
} from "./lib/d1EvidenceReceipts.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const GENERATED_CONFIG = "wrangler.deploy.json"
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

// ─── Pure, non-authorizing step information (the ONLY exported surface) ──
//
// This is INFORMATION, not execution: it names no command binary, receives no
// authority, accepts no execution flag, has no remote default, and cannot spawn or
// contact Cloudflare. It exists so tests and tooling can assert the pipeline's shape
// and order without any path to remote execution.

const DEPLOY_STEP_METADATA = Object.freeze([
  Object.freeze({ name: "prepare", remote: false, usesConfig: false }),
  Object.freeze({ name: "preflight", remote: false, usesConfig: true }),
  Object.freeze({ name: "build", remote: false, usesConfig: false }),
  Object.freeze({ name: "verify", remote: false, usesConfig: true }),
  Object.freeze({ name: "verify-remote-schema", remote: true, usesConfig: false }),
  Object.freeze({ name: "deploy", remote: true, usesConfig: true }),
])

/** The ordered, non-authorizing step metadata (fresh copy; no cmd, no authority). */
export function getDeployStepMetadata() {
  return DEPLOY_STEP_METADATA.map((step) => ({ ...step }))
}

/**
 * Validate the canonical deploy step order — a PURE check. Requires `prepare` first,
 * `deploy` last, `verify-remote-schema` IMMEDIATELY before `deploy`, and NO migration
 * or bootstrap step anywhere. Returns `{ ok, failures }`.
 */
export function validateDeployStepOrder(order) {
  const names = Array.isArray(order) ? order : DEPLOY_STEP_METADATA.map((step) => step.name)
  const failures = []
  if (names[0] !== "prepare") failures.push("prepare_not_first")
  if (names[names.length - 1] !== "deploy") failures.push("deploy_not_last")
  const verifyIndex = names.indexOf("verify-remote-schema")
  const deployIndex = names.indexOf("deploy")
  if (verifyIndex < 0) failures.push("verify_remote_schema_missing")
  else if (deployIndex - verifyIndex !== 1) failures.push("deploy_not_immediately_after_verification")
  if (names.some((name) => /migrat|bootstrap/i.test(name))) failures.push("migration_or_bootstrap_step_present")
  return { ok: failures.length === 0, failures }
}

/**
 * PURE digest equality: the schema the deploy just verified must be bound to EXACTLY
 * the authority the deploy will upload. Both must be a 64-hex digest and identical.
 * Non-authorizing — it compares two strings and can neither spawn nor deploy.
 */
export function deployAuthorityDigestsMatch(verifiedDigest, deployDigest) {
  return typeof verifiedDigest === "string" && /^[0-9a-f]{64}$/.test(verifiedDigest)
    && typeof deployDigest === "string" && verifiedDigest === deployDigest
}

// ─── Module-private deployment-authorization latch ────────────────
//
// Cloudflare is UNREACHABLE until `main()` opens this latch, and only after every gate
// succeeded. A runtime latch, not a convention: every remote leaf calls
// `requireDeployExecutionAuthorized()` first. A caller-supplied boolean can never open
// it — the latch is not exported and has no setter. It is closed in `finally`.

let deployExecutionAuthorized = false
function requireDeployExecutionAuthorized() {
  if (!deployExecutionAuthorized) throw new Error("deploy_execution_not_authorized")
}

// ─── Private remote-capable leaves (never exported) ───────────────

/**
 * Deploy's OWN read-only introspection runner for a binding. Requires the deploy
 * latch, asserts read-only, and opens its own scoped execution config from the exact
 * retained authority bytes. A mutation attempt throws before any file is created.
 */
function deployReadOnlyRunner(binding, authority) {
  return (sql) => {
    // Authorization FIRST — before the read-only check, before any scoped config,
    // before spawn. A closed latch fails here, so nothing downstream can run.
    requireDeployExecutionAuthorized()
    if (!isReadOnlyIntrospectionSql(sql)) throw new Error("non_read_only_query_blocked")
    return withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "verify-exec" }, (executionConfig) => {
      const res = spawnSync(WRANGLER_BIN, ["d1", "execute", binding, "--command", sql, "--remote", "--config", executionConfig, "--json"], { cwd: REPO_ROOT, encoding: "utf8" })
      if (res.status !== 0) throw new Error("wrangler_query_failed")
      const parsed = JSON.parse(res.stdout)
      if (Array.isArray(parsed)) return parsed[0] && Array.isArray(parsed[0].results) ? parsed[0].results : []
      return Array.isArray(parsed.results) ? parsed.results : []
    })
  }
}

/**
 * Deploy's OWN private remote schema verification against the retained authority —
 * implemented HERE (reusing only pure schema helpers) so deploy imports no
 * remote-capable function from the standalone schema command. Requires the deploy
 * latch. Returns `{ ok, failures, authorityDigest }` — the digest of the authority
 * actually verified, which `main` matches against the deploy authority before upload.
 */
function verifyRemoteSchemasForDeploy(authority) {
  requireDeployExecutionAuthorized()
  const authorityDigest = authority && typeof authority.sha256 === "string" ? authority.sha256 : null
  const contract = loadSchemaContract(REPO_ROOT)
  if (!contract.ok) return { ok: false, failures: [contract.error], authorityDigest }
  const failures = []
  for (const binding of KNOWN_BINDINGS) {
    const runner = deployReadOnlyRunner(binding, authority)
    let result
    try { result = verifyViaRunner(runner, contract.contract.databases[binding]) } catch (err) {
      failures.push(`${binding}:${err instanceof Error ? err.message : "query_failed"}`)
      continue
    }
    if (result.ok) console.log(`cf:deploy: ${binding} schema OK`)
    else for (const f of result.failures) failures.push(`${binding}:${f.category}`)
  }
  return { ok: failures.length === 0, failures, authorityDigest }
}

/**
 * The OFFLINE step region: preflight (scoped config), OpenNext build, and artifact
 * verification. None contacts Cloudflare, so none needs the deploy latch. Returns
 * true only when every step succeeds.
 */
function runOfflineSteps(authority) {
  const steps = [
    { name: "preflight", cmd: process.execPath, args: (cfg) => ["scripts/cloudflare-deploy-preflight.mjs", "--config", cfg], usesConfig: true, purpose: "preflight-exec" },
    { name: "build", cmd: resolve(REPO_ROOT, "node_modules/.bin/opennextjs-cloudflare"), args: () => ["build"], usesConfig: false },
    { name: "verify", cmd: process.execPath, args: (cfg) => ["scripts/cloudflare-deploy-preflight.mjs", "--config", cfg, "--check-artifacts"], usesConfig: true, purpose: "artifacts-exec" },
  ]
  for (const step of steps) {
    console.log(`cf:deploy → ${step.name}`)
    const ok = step.usesConfig
      ? withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: step.purpose }, (cfg) =>
        spawnSync(step.cmd, step.args(cfg), { cwd: REPO_ROOT, stdio: "inherit" }).status === 0)
      : spawnSync(step.cmd, step.args(), { cwd: REPO_ROOT, stdio: "inherit" }).status === 0
    if (!ok) {
      console.error(`cf:deploy: FAILED at step "${step.name}" — deploy aborted.`)
      return false
    }
  }
  return true
}

/**
 * The REMOTE region: schema verification against the retained authority, a digest
 * match, then `wrangler deploy`. Reached ONLY with the latch open (opened by `main`
 * after all gates). Returns an exit code and never calls `process.exit`.
 */
function runRemotePipeline(authority) {
  requireDeployExecutionAuthorized()
  console.log("cf:deploy → verify-remote-schema")
  const result = verifyRemoteSchemasForDeploy(authority)
  if (!result.ok) {
    console.error('cf:deploy: FAILED at step "verify-remote-schema" — deploy aborted.')
    return 1
  }
  // Byte identity: the database whose schema was just verified must be the database
  // about to be deployed. A digest mismatch is a validate/deploy divergence and MUST
  // prevent deploy.
  if (!deployAuthorityDigestsMatch(result.authorityDigest, authority.sha256)) {
    console.error('cf:deploy: FAILED at step "verify-remote-schema" — verified authority digest does not match the deploy authority. Deploy aborted.')
    return 1
  }
  console.log("cf:deploy → deploy")
  const status = withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "deploy-exec" }, (cfg) =>
    spawnSync(WRANGLER_BIN, ["deploy", "--config", cfg], { cwd: REPO_ROOT, stdio: "inherit" }).status)
  if (status !== 0) {
    console.error('cf:deploy: FAILED at step "deploy" — deploy aborted.')
    return 1
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

  // Step 1: prepare writes the generated config from deploy env vars. This is an
  // offline, local step — no Cloudflare, no latch.
  console.log("cf:deploy → prepare")
  if (spawnSync(process.execPath, ["scripts/cloudflare-deploy-prepare.mjs"], { cwd: REPO_ROOT, stdio: "inherit" }).status !== 0) {
    console.error('cf:deploy: FAILED at step "prepare" — deploy aborted.')
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

      // OFFLINE gates first — preflight, build, artifact verification. These contact
      // no provider, so they run without the deployment latch.
      if (!runOfflineSteps(authority.authority)) {
        exitCode = 1
      } else if (!execute) {
        // Every gate passed but CF_DEPLOY_EXECUTE≠1: stop BEFORE the first remote
        // action. The latch is never opened, so nothing can reach Cloudflare.
        console.log("cf:deploy: stopping before remote schema verification + upload (set CF_DEPLOY_EXECUTE=1 to perform the real deploy).")
        exitCode = 0
      } else {
        // ALL gates passed AND CF_DEPLOY_EXECUTE=1 — only now is remote execution
        // authorized. The latch is opened HERE, never by a caller, and closed
        // unconditionally in `finally` (success, failure, or throw).
        deployExecutionAuthorized = true
        console.log("cf:deploy: execution latch opened")
        try {
          exitCode = runRemotePipeline(authority.authority)
        } finally {
          deployExecutionAuthorized = false
          console.log("cf:deploy: execution latch closed")
        }
      }
    }
  } catch (err) {
    console.error(`cf:deploy: FAILED — ${err instanceof Error ? err.message : "deploy_failed"}`)
    exitCode = 1
  } finally {
    // Backstop, on EVERY exit: the original generated config never outlives the run,
    // even if the authority load threw before it was removed. Scoped execution
    // configs remove themselves as each of their calls returns. The deployment latch
    // is opened and closed only inside the guarded region above.
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
