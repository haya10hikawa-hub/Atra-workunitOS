#!/usr/bin/env node
/**
 * cf:d1:migrations:check (P0-PERSIST-015)
 *
 * Validates the migration manifest, migration paths, pinned SHA-256 digests,
 * target lanes, and SQL-safety rules. Performs NO database access, NO network,
 * NO SQL execution. Emits only safe category-level codes (never database IDs,
 * secrets, seed values, or SQL contents).
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { readFileSync } from "node:fs"
import { createPrivateKey, sign as edSign } from "node:crypto"
import { loadManifest, validateManifest, scanMigrationSqlSafety } from "./lib/d1MigrationManifest.mjs"
import { loadSchemaContract } from "./lib/d1SchemaContract.mjs"
import { loadValidatedDeployConfigAuthority } from "./lib/cfDeployConfigAuthority.mjs"
import { sha256Hex } from "./lib/d1OperationalEvidence.mjs"
import {
  openCommandReceiptContext, assembleUnsignedReceipt, persistSignedReceipt,
  deriveMigrationPlanDigest, SESSION_PRIVATE_KEY_BASENAME,
} from "./lib/d1EvidenceReceipts.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export function runCheck(repoRoot = REPO_ROOT) {
  const failures = []
  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) return { ok: false, failures: [loaded.error] }
  const structural = validateManifest(loaded.manifest, repoRoot)
  failures.push(...structural.failures)
  const sql = scanMigrationSqlSafety(repoRoot, loaded.manifest)
  failures.push(...sql.failures)
  const contract = loadSchemaContract(repoRoot)
  if (!contract.ok) failures.push(contract.error)
  return { ok: failures.length === 0, failures }
}

function parseConfigArg(argv) {
  const index = argv.indexOf("--config")
  return index >= 0 && argv[index + 1] ? resolve(argv[index + 1]) : undefined
}

// ─── Command-local evidence emission (private; not exported) ──────
//
// Receipt creation and signing live HERE, inside the command that produced the
// result. Status and proof are derived privately from `runCheck`'s real result; the
// timestamps are captured privately; the session key is read and signed inline. No
// shared function turns a caller-supplied result into a signed receipt.

/** Derive status + proof from the REAL check result — recomputed from the repository. */
function deriveMigrationPlanOutcome(repoRoot, checkResult) {
  if (!checkResult || typeof checkResult.ok !== "boolean" || !Array.isArray(checkResult.failures)) {
    return { ok: false, blocked: ["result_shape_invalid"] }
  }
  let manifestSha256
  try { manifestSha256 = sha256Hex(readFileSync(resolve(repoRoot, "migrations/manifest.json"))) } catch { manifestSha256 = null }
  const planDigest = deriveMigrationPlanDigest(repoRoot)
  if (!manifestSha256 || !planDigest) return { ok: false, blocked: ["proof_underivable"] }
  const succeeded = checkResult.ok === true && checkResult.failures.length === 0
  return {
    ok: true, status: succeeded ? "success" : "failed",
    proof: { manifest_sha256: manifestSha256, plan_digest: planDigest },
    safeCategories: succeeded ? ["manifest_valid", "plan_lanes_verified"] : ["plan_verification_failed"],
  }
}

/** Emit the plan receipt from THIS command's real result path. Private. */
function emitMigrationPlanReceipt(sessionDir, { repoRoot, authority, startedAt, checkResult }) {
  const producer = "cf_d1_migration_plan"
  const operation = "migration_plan_verified"
  const ctx = openCommandReceiptContext(sessionDir, { repoRoot, authority, producer })
  if (!ctx.ok) return ctx
  const outcome = deriveMigrationPlanOutcome(repoRoot, checkResult)
  if (!outcome.ok) return outcome
  const built = assembleUnsignedReceipt(ctx.session, ctx.existingReceipts, {
    operation, producer, authoritySha256: ctx.authoritySha256, producerSourceSha256: ctx.producerSourceSha256,
    startedAt, completedAt: new Date().toISOString(),
    status: outcome.status, proof: outcome.proof, safeCategories: outcome.safeCategories,
  })
  if (!built.ok) return built
  // SIGN — command-local: read the session key and sign the digest inline.
  const pem = readFileSync(resolve(sessionDir, SESSION_PRIVATE_KEY_BASENAME), "utf8")
  built.receipt.receipt_signature = edSign(null, Buffer.from(built.receipt.receipt_sha256, "utf8"), createPrivateKey(pem)).toString("hex")
  return persistSignedReceipt(ctx.session, built.receipt)
}

function main() {
  // Evidence session (optional): the operator exports CF_D1_EVIDENCE_SESSION_DIR
  // and supplies --config so the plan receipt is bound to the SAME validated
  // deploy-config authority the later remote commands will use. The execution
  // boundary opens here; the receipt is emitted from this command's real result
  // path, after the check completed.
  const evidenceSessionDir = process.env.CF_D1_EVIDENCE_SESSION_DIR
  const evidenceStartedAt = evidenceSessionDir ? new Date().toISOString() : null

  const result = runCheck()

  if (evidenceSessionDir) {
    const configPath = parseConfigArg(process.argv.slice(2))
    const authority = loadValidatedDeployConfigAuthority({ configPath, repoRoot: REPO_ROOT, allowPlaceholderIds: false })
    const receipt = emitMigrationPlanReceipt(evidenceSessionDir, {
      repoRoot: REPO_ROOT, authority: authority.ok ? authority.authority : null,
      startedAt: evidenceStartedAt, checkResult: result,
    })
    if (receipt.ok) console.log("evidence: receipt recorded (migration_plan_verified)")
    else console.error(`evidence: receipt FAILED — ${receipt.blocked.join(", ")}`)
  }

  if (result.ok) {
    console.log("cf:d1:migrations:check: OK (manifest valid, digests pinned, lanes safe, SQL is pure DDL).")
    process.exit(0)
  }
  console.error(`cf:d1:migrations:check: FAIL — ${result.failures.join(", ")}`)
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
