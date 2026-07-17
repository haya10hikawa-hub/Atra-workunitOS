/**
 * P0-OPS-016 repair — evidence contract, scanner, and the LOW-LEVEL signed-receipt
 * recorder (Issue #155).
 *
 * The low-level recorder (`createEvidenceSession` / `recordEvidenceOperation` /
 * `finalizeEvidenceSession` / `writeEvidencePack`) is an ASSEMBLER API: it can
 * only append receipts whose recomputed digest and session signature verify, so
 * the pre-repair fabrication path — arbitrary success objects in, `evidence_valid`
 * out — no longer exists at any layer. All values are synthetic; nothing here
 * contacts a network or database.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync, createPrivateKey, sign as edSign } from "node:crypto"
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, existsSync, statSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  loadEvidenceContract, scanSensitiveEvidence, canonicalSerialize, computeEvidenceDigest,
  computeReceiptDigest, verifyReceiptSignature,
  createEvidenceSession, recordEvidenceOperation, finalizeEvidenceSession, writeEvidencePack,
  validateEvidenceRecord, validateOperationOrdering, sha256Hex,
  EVIDENCE_CONTRACT_RELPATH, EVIDENCE_DIRNAME,
} from "../scripts/lib/d1OperationalEvidence.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Sign a receipt digest as a command does — inline, via node:crypto. The production
 * signing helper (`signReceiptDigest`) was part of the forgeable surface and is gone;
 * tests do their own signing with node builtins, which any holder of the key can.
 */
const signDigest = (privateKeyPem: string, receiptSha256: string) =>
  edSign(null, Buffer.from(receiptSha256, "utf8"), createPrivateKey(privateKeyPem)).toString("hex")
const AUTHORITY = sha256Hex("synthetic-authority-bytes")
const COMMIT = "0123456789abcdef0123456789abcdef01234567"
const CONTRACT = (() => {
  const loaded = loadEvidenceContract(REPO_ROOT)
  if (!loaded.ok) throw new Error(`contract must load: ${loaded.blocked.join(",")}`)
  return loaded.contract
})()
const OPS = CONTRACT.required_successful_sequence

/** One synthetic session keypair for the whole suite. */
const KEYS = generateKeyPairSync("ed25519")
const PUBLIC_HEX = Buffer.from(KEYS.publicKey.export({ format: "jwk" }).x as string, "base64url").toString("hex")
const PRIVATE_PEM = KEYS.privateKey.export({ type: "pkcs8", format: "pem" }) as string
const SESSION_ID = `evs-${"ab".repeat(16)}`

/** A temporary repoRoot carrying the committed contract and an ignored evidence dir. */
function makeTmpRepo(): string {
  const tmp = mkdtempSync(resolve(tmpdir(), "d1-evidence-recorder-"))
  mkdirSync(resolve(tmp, "contracts/operations"), { recursive: true })
  copyFileSync(resolve(REPO_ROOT, EVIDENCE_CONTRACT_RELPATH), resolve(tmp, EVIDENCE_CONTRACT_RELPATH))
  writeFileSync(resolve(tmp, ".gitignore"), `/${EVIDENCE_DIRNAME}/\n`)
  return tmp
}

function openSession(repoRoot: string) {
  const created = createEvidenceSession({
    repoRoot, environmentClass: "staging", commitSha: COMMIT, dirtyTree: false,
    nodeVersion: "v22.0.0", wranglerVersion: "4.99.0",
    authoritySha256: AUTHORITY, controlTenantPhysicallyDistinct: true,
    migrationManifestSha256: sha256Hex("synthetic-manifest"),
    migrationPlanDigest: sha256Hex("synthetic-plan"),
    schemaContractSha256: sha256Hex("synthetic-schema-contract"),
    expectedSchemaVersion: "2",
    sessionId: SESSION_ID, sessionPublicKey: PUBLIC_HEX,
  })
  if (!created.ok) throw new Error(`session must open: ${created.blocked.join(",")}`)
  return created.session
}

const PROOFS: Record<string, Record<string, string>> = {
  migration_plan_verified: { manifest_sha256: sha256Hex("m"), plan_digest: sha256Hex("p") },
  migration_apply_completed: { plan_digest: sha256Hex("p"), applied_steps_sha256: sha256Hex("a"), reconciliation: "ledger_reconciled" },
  remote_schema_verified: { schema_contract_sha256: sha256Hex("s"), verification_summary_sha256: sha256Hex("v") },
  bootstrap_apply_completed: { bootstrap_artifact_sha256: sha256Hex("b"), apply_result: "bootstrap_batch_committed" },
  bootstrap_counts_verified: { assertions_sha256: sha256Hex("c") },
  worker_preflight_completed: { worker_artifact_sha256: sha256Hex("w"), preflight_contract_sha256: sha256Hex("pc") },
  worker_deploy_completed: { worker_artifact_sha256: sha256Hex("w"), deploy_result: "worker_deployed" },
}
const CATS: Record<string, string[]> = {
  migration_plan_verified: ["manifest_valid", "plan_lanes_verified"],
  migration_apply_completed: ["control_lane_applied", "ledger_reconciled", "tenant_lane_applied"],
  remote_schema_verified: ["control_db_schema_ok", "tenant_db_schema_ok"],
  bootstrap_apply_completed: ["bootstrap_batch_committed"],
  bootstrap_counts_verified: ["identity_row_verified", "membership_row_verified", "registry_row_verified", "tenant_row_verified", "user_row_verified"],
  worker_preflight_completed: ["artifacts_verified", "preflight_ok"],
  worker_deploy_completed: ["worker_deployed"],
}

interface SessionLike { operations: Array<{ receipt_sha256: string }> }
let opClock = 0
/** Build a fully signed receipt INPUT for the low-level recorder. */
function receiptInput(session: unknown, operation: string, over: Record<string, unknown> = {}) {
  const ops = (session as SessionLike).operations
  const previous = ops.length > 0 ? ops[ops.length - 1].receipt_sha256 : null
  const t = opClock++
  const producer = (CONTRACT.producers_by_operation as Record<string, string>)[operation]
  const base = {
    sequence: ops.length + 1,
    operation, status: "success",
    started_at: `2030-01-01T01:${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}.000Z`,
    completed_at: `2030-01-01T01:${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}.500Z`,
    authority_sha256: AUTHORITY, session_id: SESSION_ID, repository_commit_sha: COMMIT,
    producer, producer_source_sha256: sha256Hex(`source-${producer}`),
    input_digest: sha256Hex("input"), result_digest: sha256Hex("result"),
    proof: { ...PROOFS[operation] }, safe_categories: [...CATS[operation]],
    previous_receipt_sha256: previous, receipt_sha256: "", receipt_signature: "",
    ...over,
  }
  base.receipt_sha256 = computeReceiptDigest(base)
  base.receipt_signature = signDigest(PRIVATE_PEM, base.receipt_sha256)
  return {
    operation: base.operation, status: base.status,
    startedAt: base.started_at, completedAt: base.completed_at,
    authoritySha256: base.authority_sha256, resultDigest: base.result_digest,
    safeCategories: base.safe_categories,
    producer: base.producer, producerSourceSha256: base.producer_source_sha256,
    inputDigest: base.input_digest, proof: base.proof,
    previousReceiptSha256: base.previous_receipt_sha256,
    receiptSha256: base.receipt_sha256, receiptSignature: base.receipt_signature,
  }
}

function recordAll(session: ReturnType<typeof openSession>) {
  for (const operation of OPS) {
    const result = recordEvidenceOperation(session, receiptInput(session, operation))
    if (!result.ok) throw new Error(`${operation} must record: ${result.blocked.join(",")}`)
  }
}

// ─── Contract ─────────────────────────────────────────────────────

test("the committed contract declares receipts: producers, sources, per-operation categories and proof fields", () => {
  assert.equal(CONTRACT.contract_version, "1")
  assert.equal(Object.isFrozen(CONTRACT), true)
  assert.equal(OPS.length, 7)
  for (const operation of OPS) {
    assert.match((CONTRACT.producers_by_operation as Record<string, string>)[operation], /^cf_[a-z0-9_]+$/)
    assert.ok(((CONTRACT.safe_categories_by_operation as Record<string, string[]>)[operation] ?? []).length >= 1)
    assert.ok(((CONTRACT.proof_fields_by_operation as Record<string, string[]>)[operation] ?? []).length >= 1)
  }
  for (const producer of CONTRACT.producers) {
    assert.match((CONTRACT.producer_sources as Record<string, string>)[producer], /^scripts\//)
  }
  assert.ok((CONTRACT.fields as Record<string, string[]>).operation.includes("receipt_signature"))
  assert.ok((CONTRACT.fields as Record<string, string[]>).session.includes("public_key"))
})

// ─── Scanner (defence in depth — unchanged coverage, new exemptions) ──

test("the scanner rejects UUIDs, hex blobs, emails, tokens, SQL, subjects, paths, raw output, and structured blobs", () => {
  const scan = (value: unknown) => scanSensitiveEvidence(value, CONTRACT)
  assert.ok(scan("3f2504e0-4f89-41d3-9a0c-0305e82c3300").includes("sensitive_value_uuid"))
  assert.ok(scan("3f2504e0_4f89_41d3_9a0c_0305e82c3300").includes("sensitive_value_uuid"))
  assert.ok(scan("deadbeefdeadbeefdeadbeefdeadbeefdead").includes("sensitive_value_hex_blob"))
  assert.ok(scan("ops@example.com").includes("sensitive_value_email"))
  assert.ok(scan("Bearer abcdef123456").includes("sensitive_value_bearer"))
  assert.ok(scan("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345").includes("sensitive_value_token"))
  assert.ok(scan("eyJhbGciOiJIUzI1NiJ9.payload").includes("sensitive_value_jwt"))
  assert.ok(scan("authorization: something").includes("sensitive_value_authorization_header"))
  assert.ok(scan("CF_D1_MIGRATE_EXECUTE=1").includes("sensitive_value_env_assignment"))
  assert.ok(scan("INSERT INTO tenants VALUES ('x')").includes("sensitive_value_sql"))
  assert.ok(scan("auth0|abc123").includes("sensitive_value_provider_subject"))
  assert.ok(scan("/home/operator/wrangler.deploy.json").includes("sensitive_value_filesystem_path"))
  assert.ok(scan("line one\nline two").includes("sensitive_value_raw_output"))
  assert.ok(scan('{"d1_databases":[]}').length > 0)
  assert.ok(scan("x".repeat(500)).includes("sensitive_value_oversized"))
  // New receipt-layer value shapes are exempt as digest-shaped.
  assert.deepEqual(scan("evs-0123456789abcdef0123456789abcdef"), [])
  assert.deepEqual(scan("0".repeat(128)), [], "an Ed25519 signature (128-hex) is digest-shaped")
})

test("the scanner rejects sensitive KEYS outside the allowlist, and passes a full receipt-shaped record", () => {
  const scan = (value: unknown) => scanSensitiveEvidence(value, CONTRACT)
  for (const [key, token] of [
    ["database_id", "database"], ["database_name", "database"], ["user_email", "email"],
    ["tenant_id", "tenant"], ["identity_subject", "identity"], ["api_token", "token"],
    ["stdout", "stdout"], ["raw_sql", "sql"], ["config_path", "path"],
  ] as const) {
    assert.ok(scan({ [key]: "x" }).includes(`sensitive_key_${token}`), `key ${key} must be rejected`)
  }
  const repo = makeTmpRepo()
  try {
    const session = openSession(repo)
    recordAll(session)
    const finalized = finalizeEvidenceSession(session)
    assert.ok(finalized.ok)
    if (finalized.ok) assert.deepEqual(scan(finalized.record), [], "a legitimate finalized record scans clean")
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── REGRESSION (Finding 1): the pre-repair fabrication paths are gone ──

test("REGRESSION 1. an unsigned or foreign-key receipt cannot be appended — exit-code fabrication has no remaining path", () => {
  const repo = makeTmpRepo()
  try {
    // (a) Unsigned receipt → refused.
    const s1 = openSession(repo)
    const unsigned = receiptInput(s1, OPS[0])
    unsigned.receiptSignature = "not-a-signature"
    const refusedUnsigned = recordEvidenceOperation(s1, unsigned)
    assert.equal(refusedUnsigned.ok, false)
    assert.ok(!refusedUnsigned.ok && refusedUnsigned.blocked.includes("receipt_unsigned"))
    // (b) Signed with a FOREIGN key → refused.
    const foreign = generateKeyPairSync("ed25519")
    const foreignPem = foreign.privateKey.export({ type: "pkcs8", format: "pem" }) as string
    const s2 = openSession(repo)
    const forged = receiptInput(s2, OPS[0])
    forged.receiptSignature = signDigest(foreignPem, forged.receiptSha256)
    const refusedForged = recordEvidenceOperation(s2, forged)
    assert.equal(refusedForged.ok, false)
    assert.ok(!refusedForged.ok && refusedForged.blocked.includes("receipt_signature_invalid"))
    // (c) The OLD pre-repair operation shape (no receipt fields at all) → refused.
    const s3 = openSession(repo)
    const oldShape = recordEvidenceOperation(s3, {
      operation: OPS[0], status: "success",
      startedAt: "2030-01-01T01:00:00.000Z", completedAt: "2030-01-01T01:00:00.500Z",
      authoritySha256: AUTHORITY, resultDigest: sha256Hex("fabricated"), safeCategories: ["manifest_valid"],
    } as never)
    assert.equal(oldShape.ok, false, "the pre-repair generic-input path no longer records anything")
    // (d) A digest-tampered receipt → refused before signature is even relevant.
    const s4 = openSession(repo)
    const tampered = receiptInput(s4, OPS[0])
    tampered.receiptSha256 = sha256Hex("forged")
    tampered.receiptSignature = signDigest(PRIVATE_PEM, tampered.receiptSha256)
    const refusedTampered = recordEvidenceOperation(s4, tampered)
    assert.ok(!refusedTampered.ok && refusedTampered.blocked.includes("receipt_digest_mismatch"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── REGRESSION (Finding 2): arbitrary strings are not categories ──

test("REGRESSION 2. a database-name string can NEVER become a safe category — per-operation allowlists only", () => {
  const repo = makeTmpRepo()
  try {
    // "atra-control-prod" normalized (`atra_control_prod`) is format-valid but NOT
    // allowlisted — the pre-repair normalization path accepted it.
    const s1 = openSession(repo)
    const leak = recordEvidenceOperation(s1, receiptInput(s1, OPS[0], { safe_categories: ["atra_control_prod", "manifest_valid"].sort() }))
    assert.equal(leak.ok, false)
    assert.ok(!leak.ok && leak.blocked.includes("category_not_allowlisted"))
    // Unknown categories fail the same way; unsorted allowlisted categories fail too.
    const s2 = openSession(repo)
    const unknown = recordEvidenceOperation(s2, receiptInput(s2, OPS[0], { safe_categories: ["made_up_category"] }))
    assert.ok(!unknown.ok && unknown.blocked.includes("category_not_allowlisted"))
    const s3 = openSession(repo)
    const unsorted = recordEvidenceOperation(s3, receiptInput(s3, OPS[0], { safe_categories: ["plan_lanes_verified", "manifest_valid"] }))
    assert.ok(!unsorted.ok && unsorted.blocked.includes("safe_categories_unsorted"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── REGRESSION (Finding 3): temporal contradictions are refused ──

test("REGRESSION 3. a receipt starting before its predecessor completed is refused at append time", () => {
  const repo = makeTmpRepo()
  try {
    const session = openSession(repo)
    assert.equal(recordEvidenceOperation(session, receiptInput(session, OPS[0], {
      started_at: "2030-01-01T12:00:00.000Z", completed_at: "2030-01-01T12:05:00.000Z",
    })).ok, true)
    const contradiction = recordEvidenceOperation(session, receiptInput(session, OPS[1], {
      started_at: "2030-01-01T11:00:00.000Z", completed_at: "2030-01-01T11:05:00.000Z",
    }))
    assert.equal(contradiction.ok, false)
    assert.ok(!contradiction.ok && contradiction.blocked.includes("temporal_order_invalid"))
    // …and validateOperationOrdering rejects it structurally too.
    const ops = [
      { sequence: 1, operation: OPS[0], status: "success", started_at: "2030-01-01T12:00:00.000Z", completed_at: "2030-01-01T12:05:00.000Z" },
      { sequence: 2, operation: OPS[1], status: "success", started_at: "2030-01-01T11:00:00.000Z", completed_at: "2030-01-01T11:05:00.000Z" },
    ]
    const ordering = validateOperationOrdering(ops, CONTRACT)
    assert.equal(ordering.ok, false)
    assert.ok(ordering.failures.includes("temporal_order_invalid"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── Low-level recorder rules (retained invariants) ───────────────

test("authority mismatch, duplicates, prerequisites, canonical order, and failure-blocks-success still hold", () => {
  const repo = makeTmpRepo()
  try {
    const s1 = openSession(repo)
    const foreignAuthority = recordEvidenceOperation(s1, receiptInput(s1, OPS[0], { authority_sha256: sha256Hex("other-authority") }))
    assert.ok(!foreignAuthority.ok && foreignAuthority.blocked.includes("authority_mismatch"))

    const s2 = openSession(repo)
    assert.equal(recordEvidenceOperation(s2, receiptInput(s2, OPS[0])).ok, true)
    const dup = recordEvidenceOperation(s2, receiptInput(s2, OPS[0]))
    assert.ok(!dup.ok && dup.blocked.includes("operation_duplicate"))

    const s3 = openSession(repo)
    const noPrereq = recordEvidenceOperation(s3, receiptInput(s3, "worker_deploy_completed"))
    assert.ok(!noPrereq.ok && noPrereq.blocked.includes("operation_prerequisite_missing"))

    const s4 = openSession(repo)
    assert.equal(recordEvidenceOperation(s4, receiptInput(s4, "worker_preflight_completed")).ok, true)
    const backwards = recordEvidenceOperation(s4, receiptInput(s4, "bootstrap_apply_completed"))
    assert.ok(!backwards.ok && backwards.blocked.includes("operation_order_invalid"))

    const s5 = openSession(repo)
    assert.equal(recordEvidenceOperation(s5, receiptInput(s5, OPS[0], { status: "failed", safe_categories: ["plan_verification_failed"] })).ok, true)
    const afterFailure = recordEvidenceOperation(s5, receiptInput(s5, OPS[1]))
    assert.ok(!afterFailure.ok && afterFailure.blocked.includes("operation_after_failure"))

    // Chain break: wrong previous digest.
    const s6 = openSession(repo)
    assert.equal(recordEvidenceOperation(s6, receiptInput(s6, OPS[0])).ok, true)
    const brokenChain = recordEvidenceOperation(s6, receiptInput(s6, OPS[1], { previous_receipt_sha256: sha256Hex("wrong-link") }))
    assert.ok(!brokenChain.ok && brokenChain.blocked.includes("receipt_chain_invalid"))

    // Producer mismatch: a producer that is not the contract's for the operation.
    const s7 = openSession(repo)
    const wrongProducer = recordEvidenceOperation(s7, receiptInput(s7, OPS[0], { producer: "cf_worker_deploy" }))
    assert.ok(!wrongProducer.ok && wrongProducer.blocked.includes("producer_mismatch"))

    // Proof shape: missing/foreign proof fields fail.
    const s8 = openSession(repo)
    const badProof = recordEvidenceOperation(s8, receiptInput(s8, OPS[0], { proof: { manifest_sha256: sha256Hex("m") } }))
    assert.ok(!badProof.ok && badProof.blocked.includes("proof_invalid"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── Finalization + writing (retained invariants) ─────────────────

test("finalization computes a verifiable digest, freezes recursively, seals the session; the writer stays exclusive and 0600", () => {
  const repo = makeTmpRepo()
  try {
    const session = openSession(repo)
    recordAll(session)
    const finalized = finalizeEvidenceSession(session)
    assert.equal(finalized.ok, true)
    if (!finalized.ok) return
    const record = finalized.record
    assert.equal(computeEvidenceDigest(record), record.chain.evidence_sha256)
    assert.equal(Object.isFrozen(record), true)
    assert.equal(Object.isFrozen(record.operations[0]), true)
    assert.throws(() => { (record.operations as unknown as unknown[]).push({}) }, TypeError)
    assert.equal(recordEvidenceOperation(session, receiptInput(session, OPS[0])).ok, false, "the session is sealed")
    assert.deepEqual(validateEvidenceRecord(record, CONTRACT).failures, [])
    // Signatures embedded in the pack verify against the pack's own session key.
    for (const op of record.operations) {
      assert.equal(verifyReceiptSignature(record.session.public_key, op.receipt_sha256, op.receipt_signature), true)
    }

    const written = writeEvidencePack(record, { repoRoot: repo })
    assert.equal(written.ok, true, `pack must write: ${written.ok ? "" : written.blocked.join(",")}`)
    if (!written.ok) return
    assert.equal(statSync(written.path).mode & 0o777, 0o600)
    const again = writeEvidencePack(record, { repoRoot: repo })
    assert.ok(!again.ok && again.blocked.includes("evidence_file_exists"), "exclusive creation is preserved")
    // The tampered copy is refused before a byte is written (fresh id, so the
    // refusal is about the DIGEST, not a filename collision with the original).
    const tampered = JSON.parse(JSON.stringify(record))
    tampered.evidence_id = `evd-${"ef".repeat(16)}`
    tampered.environment_class = "production"
    const refused = writeEvidencePack(tampered, { repoRoot: repo })
    assert.ok(!refused.ok && refused.blocked.includes("evidence_digest_mismatch"))
    assert.equal(existsSync(resolve(repo, EVIDENCE_DIRNAME, `d1-operational-evidence-${tampered.evidence_id}.json`)), false)
    // Ignore-rule enforcement is preserved.
    writeFileSync(resolve(repo, ".gitignore"), "# nothing ignored\n")
    const record2 = JSON.parse(JSON.stringify(record))
    record2.evidence_id = `evd-${"cd".repeat(16)}`
    record2.chain.evidence_sha256 = computeEvidenceDigest(record2)
    const notIgnored = writeEvidencePack(record2, { repoRoot: repo })
    assert.ok(!notIgnored.ok && notIgnored.blocked.includes("evidence_directory_not_ignored"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test("canonical serialization is deterministic and key-order independent", () => {
  const a = canonicalSerialize({ b: 1, a: [{ d: 2, c: 3 }], e: null })
  const b = canonicalSerialize({ e: null, a: [{ c: 3, d: 2 }], b: 1 })
  assert.equal(a, b)
  assert.equal(a, '{"a":[{"c":3,"d":2}],"b":1,"e":null}')
})

test("a session refuses malformed derived inputs, and never opens without a session id + public key", () => {
  const repo = makeTmpRepo()
  try {
    const base = {
      repoRoot: repo, environmentClass: "staging", commitSha: COMMIT, dirtyTree: false as const,
      nodeVersion: "v22.0.0", wranglerVersion: "4.99.0", authoritySha256: AUTHORITY,
      controlTenantPhysicallyDistinct: true as const,
      migrationManifestSha256: sha256Hex("m"), migrationPlanDigest: sha256Hex("p"),
      schemaContractSha256: sha256Hex("s"), expectedSchemaVersion: "2",
      sessionId: SESSION_ID, sessionPublicKey: PUBLIC_HEX,
    }
    assert.equal(createEvidenceSession(base).ok, true)
    for (const [over, category] of [
      [{ dirtyTree: true }, "repository_dirty"],
      [{ controlTenantPhysicallyDistinct: false }, "authority_not_physically_distinct"],
      [{ commitSha: "not-a-sha" }, "commit_sha_invalid"],
      [{ sessionId: "session-1" }, "session_id_invalid"],
      [{ sessionPublicKey: "XYZ" }, "session_public_key_invalid"],
      [{ environmentClass: "local" }, "environment_class_invalid"],
    ] as const) {
      const result = createEvidenceSession({ ...base, ...(over as object) })
      assert.equal(result.ok, false, `${JSON.stringify(over)} must be refused`)
      assert.ok(!result.ok && result.blocked.includes(category), `expected ${category}, got ${!result.ok ? result.blocked.join(",") : ""}`)
    }
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test("no evidence output survives this suite's temporary repos, and no console output exists in the libraries", () => {
  const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")
  for (const rel of ["scripts/lib/d1OperationalEvidence.mjs", "scripts/lib/d1EvidenceReceipts.mjs"]) {
    assert.doesNotMatch(codeOf(rel), /console\./, `${rel} must not log`)
  }
  assert.deepEqual(readdirSync(REPO_ROOT).filter((name) => name.startsWith("d1-operational-evidence-")), [])
})
