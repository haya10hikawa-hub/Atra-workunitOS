#!/usr/bin/env node
/**
 * cf:d1:schema:verify:remote (P0-PERSIST-015; hardened P0-FIX-018) — OPERATOR-GATED,
 * READ-ONLY, ENTRYPOINT-ONLY.
 *
 * Verifies the production D1 schemas against the committed schema contract WITHOUT
 * writing. Runs ONLY when gated:
 *   - a validated generated deploy config (`--config wrangler.deploy*.json`) with
 *     REAL, non-placeholder IDs and EXACTLY the approved bindings;
 *   - explicit remote verification (`--remote`).
 * Issues ONLY read-only introspection queries (SELECT on sqlite_master; read-only
 * PRAGMA). NEVER mutates, seeds, runs migrations, prints database IDs, or reads
 * application row data. This patch never invokes it remotely.
 *
 * P0-FIX-018 — remote schema verification is NOT reachable from an imported function.
 * The Wrangler-backed runner and the multi-binding verifier are PRIVATE to this
 * module; there is no exported `makeWranglerReadOnlyRunner`/`verifyRemoteSchemasWithAuthority`.
 * Remote provider access is guarded by a module-private authorization latch that ONLY
 * `main()` opens, and only AFTER `--remote` and the validated deploy-config authority
 * are confirmed. Every remote-capable leaf calls `requireSchemaVerificationAuthorized()`
 * BEFORE creating a scoped execution config or spawning Wrangler. The latch is closed
 * in `finally`. Read-only provider access is still remote execution, so it must be
 * operator-gated at the command entrypoint — a caller-supplied object never authorizes it.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createPrivateKey, sign as edSign } from "node:crypto"
import { loadSchemaContract, verifyViaRunner, isReadOnlyIntrospectionSql } from "./lib/d1SchemaContract.mjs"
import { KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
// ONE shared config-authority implementation, used by every remote D1 command.
import {
  loadValidatedDeployConfigAuthority, withPrivateExecutionConfig,
} from "./lib/cfDeployConfigAuthority.mjs"
import { sha256Hex, canonicalSerialize } from "./lib/d1OperationalEvidence.mjs"
import {
  openCommandReceiptContext, assembleUnsignedReceipt, persistSignedReceipt,
  SESSION_PRIVATE_KEY_BASENAME,
} from "./lib/d1EvidenceReceipts.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/**
 * Evaluate remote-verify gates and RETAIN the deploy-config authority.
 * Returns the authority ONLY when every gate passed. Pure — no network, no SQL.
 */
export function evaluateRemoteVerifyGates({ argv = [], repoRoot = REPO_ROOT, configPath } = {}) {
  const blocked = []
  if (!argv.includes("--remote")) blocked.push("missing_remote_flag")
  // Loaded + validated ONCE through the SHARED authority library — including the
  // physical-separation rule, so a same-id config issues ZERO queries.
  const config = loadValidatedDeployConfigAuthority({ configPath, repoRoot, allowPlaceholderIds: false })
  if (!config.ok) blocked.push(...config.blocked)

  const ok = blocked.length === 0
  return { ok, blocked: [...new Set(blocked)], configAuthority: ok ? config.authority : null }
}

// ─── Module-private remote-verification authorization latch ───────
//
// Read-only provider access is still remote execution. Wrangler is UNREACHABLE until
// `main()` opens this latch, and only after `--remote` and the validated deploy-config
// authority are confirmed. This is a runtime latch, not a convention: every
// remote-capable leaf calls `requireSchemaVerificationAuthorized()` FIRST, and only
// `main()` opens it. A future caller that reaches a leaf without the entrypoint's
// gates therefore fails closed. The latch is NOT exported and has no setter.

let schemaVerificationAuthorized = false
function requireSchemaVerificationAuthorized() {
  if (!schemaVerificationAuthorized) throw new Error("schema_verification_not_authorized")
}

/**
 * A wrangler-backed read-only runner for a binding, bound to the retained `authority`.
 * PRIVATE — never exported. Every query requires the authorization latch, is asserted
 * read-only, and opens its OWN short-lived scoped execution config from the exact
 * authority bytes (removed when the call returns). A mutation attempt throws before any
 * file is created and never reaches Wrangler; a modified or leaked earlier scoped file
 * cannot redirect the next query, which mints a fresh one from the retained bytes.
 */
function wranglerReadOnlyRunner(binding, authority) {
  return (sql) => {
    // Authorization FIRST — before the read-only check, before any scoped config,
    // before spawn. A closed latch fails here, so nothing downstream can run.
    requireSchemaVerificationAuthorized()
    if (!isReadOnlyIntrospectionSql(sql)) throw new Error("non_read_only_query_blocked")
    return withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "verify-exec" }, (executionConfig) => {
      const res = spawnSync(WRANGLER_BIN, ["d1", "execute", binding, "--command", sql, "--remote", "--config", executionConfig, "--json"], { cwd: REPO_ROOT, encoding: "utf8" })
      if (res.status !== 0) throw new Error("wrangler_query_failed")
      const parsed = JSON.parse(res.stdout)
      // wrangler --json returns [{ results: [...] }] (or { results }).
      if (Array.isArray(parsed)) return parsed[0] && Array.isArray(parsed[0].results) ? parsed[0].results : []
      return Array.isArray(parsed.results) ? parsed.results : []
    })
  }
}

/**
 * Verify BOTH bindings' schemas against the committed contract using ONE retained
 * authority. PRIVATE — never exported, never given a spawn/runner seam. Requires the
 * authorization latch before touching Wrangler. Every introspection query opens its
 * own scoped execution config from the authority, so Control and Tenant verification
 * are one logical authority (`authority.sha256`) even across distinct ephemeral files.
 *
 * Returns `{ ok, failures, authorityDigest }` — safe evidence only: `authorityDigest`
 * is the SHA-256 of the authority actually verified; never a database ID, config
 * content, path, or row data.
 */
function verifyRemoteSchemas(authority) {
  requireSchemaVerificationAuthorized()
  const authorityDigest = authority && typeof authority.sha256 === "string" ? authority.sha256 : null
  const contract = loadSchemaContract(REPO_ROOT)
  if (!contract.ok) return { ok: false, failures: [contract.error], authorityDigest }

  const failures = []
  for (const binding of KNOWN_BINDINGS) {
    const runner = wranglerReadOnlyRunner(binding, authority)
    let result
    try { result = verifyViaRunner(runner, contract.contract.databases[binding]) } catch (err) {
      failures.push(`${binding}:${err instanceof Error ? err.message : "query_failed"}`)
      continue
    }
    if (result.ok) console.log(`cf:d1:schema:verify:remote: ${binding} OK`)
    else {
      for (const f of result.failures) failures.push(`${binding}:${f.category}:${f.table || ""}${f.name ? ":" + f.name : ""}`)
    }
  }
  return { ok: failures.length === 0, failures, authorityDigest }
}

function parseConfigArg(argv) {
  const i = argv.indexOf("--config")
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : undefined
}

// ─── Command-local evidence emission (private; not exported) ──────
//
// Receipt creation and signing live HERE, after the gates and the real verification
// result. Status is derived from the result (whose own `authorityDigest` must equal
// the session authority); the session key is read and signed inline.

/** Derive status + proof from the REAL verification result. */
function deriveRemoteSchemaOutcome(repoRoot, verificationResult, authoritySha256) {
  const result = verificationResult
  if (!result || typeof result.ok !== "boolean" || !Array.isArray(result.failures) || typeof result.authorityDigest !== "string") {
    return { ok: false, blocked: ["result_shape_invalid"] }
  }
  // The verification must have run against THIS session's authority.
  if (result.authorityDigest !== authoritySha256) return { ok: false, blocked: ["authority_mismatch"] }
  let schemaContractSha256
  try { schemaContractSha256 = sha256Hex(readFileSync(resolve(repoRoot, "migrations/schema-contract.json"))) } catch { schemaContractSha256 = null }
  if (!schemaContractSha256) return { ok: false, blocked: ["proof_underivable"] }
  const summary = sha256Hex(canonicalSerialize({
    control_db_schema_ok: result.ok, failure_count: result.failures.length, tenant_db_schema_ok: result.ok,
  }))
  return {
    ok: true, status: result.ok ? "success" : "failed",
    proof: { schema_contract_sha256: schemaContractSha256, verification_summary_sha256: summary },
    safeCategories: result.ok ? ["control_db_schema_ok", "tenant_db_schema_ok"] : ["schema_verification_failed"],
  }
}

/** Emit the remote-schema receipt from THIS command's real result path. Private. */
function emitRemoteSchemaVerificationReceipt(sessionDir, { repoRoot, authority, startedAt, verificationResult }) {
  const producer = "cf_d1_schema_verify_remote"
  const operation = "remote_schema_verified"
  const ctx = openCommandReceiptContext(sessionDir, { repoRoot, authority, producer })
  if (!ctx.ok) return ctx
  const outcome = deriveRemoteSchemaOutcome(repoRoot, verificationResult, ctx.authoritySha256)
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
  const argv = process.argv.slice(2)
  const configPath = parseConfigArg(argv)
  const gates = evaluateRemoteVerifyGates({ argv, repoRoot: REPO_ROOT, configPath })
  if (!gates.ok) {
    console.error(`cf:d1:schema:verify:remote: STOPPED — gate(s) not satisfied: ${gates.blocked.join(", ")}`)
    process.exit(1)
  }
  // Evidence session (optional): the execution boundary starts after the gates,
  // immediately before the verification runs.
  const evidenceSessionDir = process.env.CF_D1_EVIDENCE_SESSION_DIR
  const evidenceStartedAt = evidenceSessionDir ? new Date().toISOString() : null

  // EVERY gate passed — only now may Wrangler be reached. The latch is opened HERE,
  // never by a caller, and closed unconditionally in `finally`.
  let result
  schemaVerificationAuthorized = true
  console.log("cf:d1:schema:verify:remote: verification latch opened")
  try {
    // One retained authority → a fresh scoped config per query → every Control and
    // Tenant introspection. Each scoped config is removed as its own call returns.
    result = verifyRemoteSchemas(gates.configAuthority)
  } finally {
    schemaVerificationAuthorized = false
    console.log("cf:d1:schema:verify:remote: verification latch closed")
  }
  if (!result.ok) console.error(`cf:d1:schema:verify:remote: FAIL — ${result.failures.join(", ")}`)

  // Command-local receipt from THIS result path.
  if (evidenceSessionDir) {
    const receipt = emitRemoteSchemaVerificationReceipt(evidenceSessionDir, {
      repoRoot: REPO_ROOT, authority: gates.configAuthority, startedAt: evidenceStartedAt, verificationResult: result,
    })
    if (receipt.ok) console.log("evidence: receipt recorded (remote_schema_verified)")
    else console.error(`evidence: receipt FAILED — ${receipt.blocked.join(", ")}`)
  }
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
