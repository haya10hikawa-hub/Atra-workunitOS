/**
 * P0-OPS-016 — D1 operational evidence: contract, recorder, scanner, adapters
 * (Issue #155).
 *
 * The recorder is OBSERVATIONAL ONLY: nothing here (or in the library) spawns
 * Wrangler, runs SQL, contacts a network, or reads/sets an operator execution
 * gate. All values are synthetic.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, existsSync, statSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  loadEvidenceContract, scanSensitiveEvidence, canonicalSerialize, computeEvidenceDigest,
  createEvidenceSession, recordEvidenceOperation, finalizeEvidenceSession, writeEvidencePack,
  validateEvidenceRecord, validateOperationOrdering, isStrictUtcIso, sha256Hex,
  EVIDENCE_CONTRACT_RELPATH, EVIDENCE_DIRNAME,
} from "../scripts/lib/d1OperationalEvidence.mjs"
import {
  buildOperationEvidence, normalizeSafeCategory, SAFE_EVIDENCE_KEYS,
  evidenceFromRemoteSchemaVerification, evidenceFromMigrationApply, evidenceFromWorkerDeploy,
} from "../scripts/lib/d1EvidenceAdapters.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** Synthetic-only values. The authority digest is a digest of a synthetic string. */
const AUTHORITY = sha256Hex("synthetic-authority-bytes")
const COMMIT = "0123456789abcdef0123456789abcdef01234567"
const CONTRACT = (() => {
  const loaded = loadEvidenceContract(REPO_ROOT)
  if (!loaded.ok) throw new Error(`contract must load: ${loaded.blocked.join(",")}`)
  return loaded.contract
})()
const OPS = CONTRACT.required_successful_sequence

/** A temporary repoRoot carrying the committed contract and a git-ignored evidence dir. */
function makeTmpRepo(): string {
  const tmp = mkdtempSync(resolve(tmpdir(), "d1-evidence-recorder-"))
  mkdirSync(resolve(tmp, "contracts/operations"), { recursive: true })
  copyFileSync(resolve(REPO_ROOT, EVIDENCE_CONTRACT_RELPATH), resolve(tmp, EVIDENCE_CONTRACT_RELPATH))
  writeFileSync(resolve(tmp, ".gitignore"), `/${EVIDENCE_DIRNAME}/\n`)
  return tmp
}

const VALID_SESSION_INPUT = (repoRoot: string) => ({
  repoRoot,
  environmentClass: "staging" as const,
  commitSha: COMMIT,
  dirtyTree: false as const,
  nodeVersion: "v22.0.0",
  wranglerVersion: "4.99.0",
  authoritySha256: AUTHORITY,
  controlTenantPhysicallyDistinct: true as const,
  migrationManifestSha256: sha256Hex("synthetic-manifest"),
  migrationPlanDigest: sha256Hex("synthetic-plan"),
  schemaContractSha256: sha256Hex("synthetic-schema-contract"),
  expectedSchemaVersion: "2",
})

function openSession(repoRoot: string) {
  const created = createEvidenceSession(VALID_SESSION_INPUT(repoRoot))
  if (!created.ok) throw new Error(`session must open: ${created.blocked.join(",")}`)
  return created.session
}

let opClock = 0
function opInput(operation: string, over: Record<string, unknown> = {}) {
  const t = opClock++ % 10
  return {
    operation, status: "success",
    startedAt: `2026-07-16T01:00:0${t}.000Z`, completedAt: `2026-07-16T01:00:0${t}.500Z`,
    authoritySha256: AUTHORITY, resultDigest: sha256Hex(`result-${operation}`),
    safeCategories: ["synthetic_ok"],
    ...over,
  }
}

/** Record the full successful 7-operation sequence. */
function recordAll(session: ReturnType<typeof openSession>) {
  for (const operation of OPS) {
    const result = recordEvidenceOperation(session, opInput(operation))
    if (!result.ok) throw new Error(`${operation} must record: ${result.blocked.join(",")}`)
  }
}

// ─── Contract ─────────────────────────────────────────────────────

test("the committed contract loads, is frozen, and declares the 7-operation canonical sequence", () => {
  assert.equal(CONTRACT.contract_version, "1")
  assert.equal(Object.isFrozen(CONTRACT), true)
  assert.deepEqual([...OPS], [
    "migration_plan_verified", "migration_apply_completed", "remote_schema_verified",
    "bootstrap_apply_completed", "bootstrap_counts_verified", "worker_preflight_completed",
    "worker_deploy_completed",
  ])
  assert.deepEqual(CONTRACT.hard_prerequisites.remote_schema_verified, ["migration_apply_completed"])
  assert.deepEqual(CONTRACT.hard_prerequisites.bootstrap_counts_verified, ["bootstrap_apply_completed"])
  assert.deepEqual(CONTRACT.hard_prerequisites.worker_deploy_completed, ["remote_schema_verified"])
  assert.deepEqual([...CONTRACT.environment_classes], ["staging", "production"])
})

// ─── Session creation ─────────────────────────────────────────────

test("a session refuses a dirty tree, a non-distinct attestation, and every malformed input", () => {
  const tmp = makeTmpRepo()
  try {
    const base = VALID_SESSION_INPUT(tmp)
    assert.equal(createEvidenceSession(base).ok, true)
    for (const [over, category] of [
      [{ dirtyTree: true }, "repository_dirty"],
      [{ controlTenantPhysicallyDistinct: false }, "authority_not_physically_distinct"],
      [{ environmentClass: "local" }, "environment_class_invalid"],
      [{ commitSha: "not-a-sha" }, "commit_sha_invalid"],
      [{ commitSha: COMMIT.slice(0, 39) }, "commit_sha_invalid"],
      [{ nodeVersion: "22" }, "node_version_invalid"],
      [{ wranglerVersion: "wrangler 4" }, "wrangler_version_invalid"],
      [{ authoritySha256: "XYZ" }, "authority_sha256_invalid"],
      [{ authoritySha256: AUTHORITY.toUpperCase() }, "authority_sha256_invalid"],
      [{ migrationManifestSha256: "abc" }, "migration_manifest_sha256_invalid"],
      [{ migrationPlanDigest: undefined }, "migration_plan_digest_invalid"],
      [{ schemaContractSha256: 42 }, "schema_contract_sha256_invalid"],
      [{ expectedSchemaVersion: "two" }, "expected_schema_version_invalid"],
      [{ previousRecordSha256: "short" }, "previous_record_sha256_invalid"],
    ] as const) {
      const result = createEvidenceSession({ ...base, ...(over as object) })
      assert.equal(result.ok, false, `${JSON.stringify(over)} must be refused`)
      assert.ok(!result.ok && result.blocked.includes(category), `expected ${category}, got ${!result.ok ? result.blocked.join(",") : ""}`)
    }
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

// ─── Sensitive scanner (defence in depth under the allowlist) ─────

test("the scanner rejects UUIDs, hex blobs, emails, tokens, SQL, subjects, paths, raw output, and structured blobs", () => {
  const scan = (value: unknown) => scanSensitiveEvidence(value, CONTRACT)
  assert.ok(scan("3f2504e0-4f89-41d3-9a0c-0305e82c3300").includes("sensitive_value_uuid"), "a D1 database UUID must be rejected")
  assert.ok(scan("3f2504e0_4f89_41d3_9a0c_0305e82c3300").includes("sensitive_value_uuid"), "a separator-swapped UUID must still be rejected")
  assert.ok(scan("deadbeefdeadbeefdeadbeefdeadbeefdead").includes("sensitive_value_hex_blob"), "an embedded hex identifier must be rejected")
  assert.ok(scan("ops@example.com").includes("sensitive_value_email"), "an email must be rejected")
  assert.ok(scan("Bearer abcdef123456").includes("sensitive_value_bearer"))
  assert.ok(scan("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345").includes("sensitive_value_token"), "a token-like value must be rejected")
  assert.ok(scan("sk-abcdefghijklmnop").includes("sensitive_value_token"))
  assert.ok(scan("eyJhbGciOiJIUzI1NiJ9.payload").includes("sensitive_value_jwt"))
  assert.ok(scan("authorization: something").includes("sensitive_value_authorization_header"))
  assert.ok(scan("Set-Cookie: session=1").length > 0, "a cookie must be rejected")
  assert.ok(scan("CF_D1_MIGRATE_EXECUTE=1").includes("sensitive_value_env_assignment"), "a raw env assignment must be rejected")
  assert.ok(scan("INSERT INTO tenants VALUES ('x')").includes("sensitive_value_sql"), "raw SQL must be rejected")
  assert.ok(scan("auth0|abc123").includes("sensitive_value_provider_subject"), "a provider subject must be rejected")
  assert.ok(scan("/home/operator/wrangler.deploy.json").includes("sensitive_value_filesystem_path"), "a filesystem path must be rejected")
  assert.ok(scan("line one\nline two").includes("sensitive_value_raw_output"), "raw multi-line output must be rejected")
  assert.ok(scan('{"d1_databases":[]}').length > 0, "a raw deploy-config blob must be rejected")
  assert.ok(scan("x".repeat(500)).includes("sensitive_value_oversized"), "an oversized value must be rejected")
})

test("the scanner rejects sensitive KEYS outside the allowlist, and passes every legitimate record value", () => {
  const scan = (value: unknown) => scanSensitiveEvidence(value, CONTRACT)
  for (const [key, token] of [
    ["database_id", "database"], ["database_name", "database"], ["databaseName", "database"],
    ["user_email", "email"], ["tenant_id", "tenant"], ["membership_role", "membership"],
    ["identity_subject", "identity"], ["provider_subject", "subject"], ["api_token", "token"],
    ["stdout", "stdout"], ["raw_sql", "sql"], ["config_path", "path"], ["env", "env"],
  ] as const) {
    assert.ok(scan({ [key]: "x" }).includes(`sensitive_key_${token}`), `key ${key} must be rejected`)
  }
  // Legitimate values pass: digests, commit, evidence id, timestamps, versions,
  // categories, and the allowlisted attestation key that contains "tenant".
  assert.deepEqual(scan({
    evidence_id: "evd-0123456789abcdef0123456789abcdef",
    created_at: "2026-07-16T01:00:00.000Z",
    authority: { sha256: AUTHORITY, control_tenant_physically_distinct: true },
    repository: { commit_sha: COMMIT, dirty_tree: false },
    toolchain: { node_version: "v22.0.0", wrangler_version: "4.99.0" },
    operations: [{ safe_categories: ["control_db_ok", "tenant_lane_applied"] }],
  }), [])
})

// ─── Recording rules ──────────────────────────────────────────────

test("a full successful sequence records with contiguous sequences 1..7", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    for (let i = 0; i < OPS.length; i++) {
      const result = recordEvidenceOperation(session, opInput(OPS[i]))
      assert.equal(result.ok, true, `${OPS[i]} must record`)
      assert.ok(result.ok && result.sequence === i + 1, "sequences are contiguous from 1")
    }
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("10. an operation with a DIFFERENT authority digest than the session is refused", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    const other = sha256Hex("a-different-authority")
    const result = recordEvidenceOperation(session, opInput(OPS[0], { authoritySha256: other }))
    assert.equal(result.ok, false, "evidence can never mix authorities")
    assert.ok(!result.ok && result.blocked.includes("authority_mismatch"))
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("11. a duplicate operation is refused", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    assert.equal(recordEvidenceOperation(session, opInput(OPS[0])).ok, true)
    const dup = recordEvidenceOperation(session, opInput(OPS[0]))
    assert.equal(dup.ok, false)
    assert.ok(!dup.ok && dup.blocked.includes("operation_duplicate"))
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("8 + 9. hard prerequisites: deploy before schema verification, counts before bootstrap apply, verify before migration apply — all refused", () => {
  const tmp = makeTmpRepo()
  try {
    for (const [op, setup] of [
      ["worker_deploy_completed", ["migration_plan_verified"]],
      ["bootstrap_counts_verified", ["migration_plan_verified"]],
      ["remote_schema_verified", ["migration_plan_verified"]],
    ] as const) {
      const session = openSession(tmp)
      for (const pre of setup) assert.equal(recordEvidenceOperation(session, opInput(pre)).ok, true)
      const result = recordEvidenceOperation(session, opInput(op))
      assert.equal(result.ok, false, `${op} without its prerequisite must be refused`)
      assert.ok(!result.ok && result.blocked.includes("operation_prerequisite_missing"))
    }
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("7. a successful operation may only advance in canonical order", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    // Jumping ahead to preflight (no prerequisites of its own) is allowed…
    assert.equal(recordEvidenceOperation(session, opInput("worker_preflight_completed")).ok, true)
    // …but a later success can never move BACKWARDS in the canonical sequence.
    const backwards = recordEvidenceOperation(session, opInput("bootstrap_apply_completed"))
    assert.equal(backwards.ok, false, "a success behind the canonical high-water mark must be refused")
    assert.ok(!backwards.ok && backwards.blocked.includes("operation_order_invalid"))
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("12. a failed operation prevents every later SUCCESS from being appended", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    assert.equal(recordEvidenceOperation(session, opInput("migration_plan_verified", { status: "failed" })).ok, true)
    const after = recordEvidenceOperation(session, opInput("migration_apply_completed"))
    assert.equal(after.ok, false, "no success may follow a recorded failure")
    assert.ok(!after.ok && after.blocked.includes("operation_after_failure"))
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("4 + 5. malformed timestamps and malformed digests are refused at record time", () => {
  const tmp = makeTmpRepo()
  try {
    for (const [over, category] of [
      [{ startedAt: "2026-07-16 01:00:00" }, "started_at_invalid"],
      [{ startedAt: "2026-13-01T00:00:00.000Z" }, "started_at_invalid"],
      [{ completedAt: "2026-07-16T01:00:00Z" }, "completed_at_invalid"],
      [{ completedAt: "2026-07-16T00:59:59.000Z" }, "completed_before_started"],
      [{ resultDigest: "not-a-digest" }, "result_digest_invalid"],
      [{ resultDigest: AUTHORITY.slice(0, 63) }, "result_digest_invalid"],
      [{ authoritySha256: AUTHORITY.toUpperCase() }, "authority_sha256_invalid"],
      [{ safeCategories: ["Not_Safe"] }, "safe_categories_invalid"],
      [{ safeCategories: "nope" }, "safe_categories_invalid"],
      [{ operation: "made_up_operation" }, "operation_unknown"],
      [{ status: "partial" }, "status_invalid"],
    ] as const) {
      const session = openSession(tmp)
      const result = recordEvidenceOperation(session, opInput(OPS[0], over as Record<string, unknown>))
      assert.equal(result.ok, false, `${JSON.stringify(over)} must be refused`)
      assert.ok(!result.ok && result.blocked.includes(category), `expected ${category}, got ${!result.ok ? result.blocked.join(",") : ""}`)
    }
    assert.equal(isStrictUtcIso("2026-07-16T01:00:00.000Z"), true)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("an operation carrying sensitive content in its categories is refused before it is stored", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    // Contract-shaped but sensitive: a lowercase hex identifier smuggled as a category.
    const result = recordEvidenceOperation(session, opInput(OPS[0], { safeCategories: ["deadbeefdeadbeefdeadbeefdeadbeefdead"] }))
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.blocked.some((b) => b.startsWith("sensitive_")))
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

// ─── Finalization ─────────────────────────────────────────────────

test("24. finalization computes a verifiable digest, freezes the record recursively, and seals the session", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    recordAll(session)
    const finalized = finalizeEvidenceSession(session)
    assert.equal(finalized.ok, true)
    if (!finalized.ok) return
    const record = finalized.record
    // The digest is over canonical bytes and recomputes identically.
    assert.equal(computeEvidenceDigest(record), record.chain.evidence_sha256)
    assert.match(record.chain.evidence_sha256, /^[0-9a-f]{64}$/)
    // Recursively immutable — mutation attempts throw in strict mode.
    assert.equal(Object.isFrozen(record), true)
    assert.equal(Object.isFrozen(record.operations), true)
    assert.equal(Object.isFrozen(record.operations[0]), true)
    assert.equal(Object.isFrozen(record.operations[0].safe_categories), true)
    assert.throws(() => { (record as { evidence_id: string }).evidence_id = "evd-" + "0".repeat(32) }, TypeError)
    assert.throws(() => { (record.operations as unknown as unknown[]).push({}) }, TypeError)
    // The session accepts nothing afterwards — finalization is terminal.
    const after = recordEvidenceOperation(session, opInput("migration_plan_verified"))
    assert.equal(after.ok, false)
    assert.ok(!after.ok && after.blocked.includes("session_finalized"))
    assert.equal(finalizeEvidenceSession(session).ok, false, "finalizing twice is refused")
    // The finalized record validates and orders cleanly.
    assert.deepEqual(validateEvidenceRecord(record, CONTRACT).failures, [])
    assert.deepEqual(validateOperationOrdering(record.operations, CONTRACT).failures, [])
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("canonical serialization is deterministic and key-order independent", () => {
  const a = canonicalSerialize({ b: 1, a: [{ d: 2, c: 3 }], e: null })
  const b = canonicalSerialize({ e: null, a: [{ c: 3, d: 2 }], b: 1 })
  assert.equal(a, b)
  assert.equal(a, '{"a":[{"c":3,"d":2}],"b":1,"e":null}')
})

// ─── Writing packs ────────────────────────────────────────────────

test("23. the evidence file is created exclusively, mode 0600, with a collision-resistant secret-free name, in the git-ignored directory", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    recordAll(session)
    const finalized = finalizeEvidenceSession(session)
    assert.equal(finalized.ok, true)
    if (!finalized.ok) return
    const written = writeEvidencePack(finalized.record, { repoRoot: tmp })
    assert.equal(written.ok, true, `pack must write: ${written.ok ? "" : written.blocked.join(",")}`)
    if (!written.ok) return
    assert.equal(statSync(written.path).mode & 0o777, 0o600, "the evidence file must be private")
    assert.match(written.path.slice(tmp.length + 1), new RegExp(`^\\${EVIDENCE_DIRNAME.slice(0)}/d1-operational-evidence-evd-[0-9a-f]{32}\\.json$`.replace("\\.d1", "\\.d1")))
    // Exclusive creation: writing the SAME record again must refuse, not overwrite.
    const again = writeEvidencePack(finalized.record, { repoRoot: tmp })
    assert.equal(again.ok, false)
    assert.ok(!again.ok && again.blocked.includes("evidence_file_exists"))
    // The file round-trips to the same digest.
    const reread = JSON.parse(readFileSync(written.path, "utf8"))
    assert.equal(computeEvidenceDigest(reread), reread.chain.evidence_sha256)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test("a pack is refused when the evidence directory is not git-ignored, and a tampered record is refused before writing", () => {
  const tmp = makeTmpRepo()
  try {
    const session = openSession(tmp)
    recordAll(session)
    const finalized = finalizeEvidenceSession(session)
    if (!finalized.ok) throw new Error("must finalize")
    // 1. Remove the ignore rule — privacy fails closed.
    writeFileSync(resolve(tmp, ".gitignore"), "# nothing ignored\n")
    const notIgnored = writeEvidencePack(finalized.record, { repoRoot: tmp })
    assert.equal(notIgnored.ok, false)
    assert.ok(!notIgnored.ok && notIgnored.blocked.includes("evidence_directory_not_ignored"))
    writeFileSync(resolve(tmp, ".gitignore"), `/${EVIDENCE_DIRNAME}/\n`)
    // 2. A digest-tampered copy is refused before a byte is written.
    const tampered = JSON.parse(JSON.stringify(finalized.record))
    tampered.environment_class = "production"
    const refused = writeEvidencePack(tampered, { repoRoot: tmp })
    assert.equal(refused.ok, false)
    assert.ok(!refused.ok && refused.blocked.includes("evidence_digest_mismatch"))
    assert.equal(existsSync(resolve(tmp, EVIDENCE_DIRNAME, `d1-operational-evidence-${tampered.evidence_id}.json`)), false)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

// ─── Adapters ─────────────────────────────────────────────────────

test("adapters return EXACTLY the five safe keys and never anything else", () => {
  const built = buildOperationEvidence("remote_schema_verified", {
    status: "success", authorityDigest: AUTHORITY, safeCategories: ["CONTROL_DB:ok"],
  }, { repoRoot: REPO_ROOT })
  assert.equal(built.ok, true)
  if (!built.ok) return
  assert.deepEqual(Object.keys(built.evidence).sort(), [...SAFE_EVIDENCE_KEYS].sort(),
    "an adapter result carries the five safe keys and nothing else — no path, no ID, no raw output")
  assert.equal(built.evidence.operation, "remote_schema_verified")
  assert.match(built.evidence.resultDigest, /^[0-9a-f]{64}$/)
  assert.deepEqual([...built.evidence.safeCategories], ["control_db_ok"], "categories are normalized to the safe form")
  assert.equal(Object.isFrozen(built.evidence), true)
  // Deterministic result digest over the SAFE result — not raw output.
  const rebuilt = buildOperationEvidence("remote_schema_verified", { status: "success", authorityDigest: AUTHORITY, safeCategories: ["CONTROL_DB:ok"] }, { repoRoot: REPO_ROOT })
  assert.ok(rebuilt.ok && rebuilt.evidence.resultDigest === built.evidence.resultDigest)
})

test("adapters scan RAW inputs before normalization — a sensitive value cannot be laundered", () => {
  for (const raw of [
    "3f2504e0-4f89-41d3-9a0c-0305e82c3300",
    "ops@example.com",
    "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
    "auth0|abc123",
    "INSERT INTO tenants VALUES ('x')",
  ]) {
    const result = buildOperationEvidence("migration_apply_completed", { status: "success", authorityDigest: AUTHORITY, safeCategories: [raw] }, { repoRoot: REPO_ROOT })
    assert.equal(result.ok, false, `${raw} must be refused`)
    assert.ok(!result.ok && result.blocked.some((b) => b.startsWith("sensitive_")))
  }
  // Invalid authority digest is refused.
  const bad = buildOperationEvidence("migration_apply_completed", { status: "success", authorityDigest: "nope" }, { repoRoot: REPO_ROOT })
  assert.equal(bad.ok, false)
  assert.ok(!bad.ok && bad.blocked.includes("authority_digest_invalid"))
})

test("the per-command adapters map existing safe results without inventing fields", () => {
  const verify = evidenceFromRemoteSchemaVerification({ ok: true, failures: [], authorityDigest: AUTHORITY }, { repoRoot: REPO_ROOT })
  assert.ok(verify.ok && verify.evidence.operation === "remote_schema_verified" && verify.evidence.status === "success")
  const applyFailed = evidenceFromMigrationApply({ exitCode: 1, authorityDigest: AUTHORITY }, { repoRoot: REPO_ROOT })
  assert.ok(applyFailed.ok && applyFailed.evidence.status === "failed")
  const deploy = evidenceFromWorkerDeploy({ exitCode: 0, authorityDigest: AUTHORITY }, { repoRoot: REPO_ROOT })
  assert.ok(deploy.ok && deploy.evidence.operation === "worker_deploy_completed")
  assert.equal(normalizeSafeCategory("CONTROL_DB:missing_table:x"), "control_db_missing_table_x")
})

// ─── Architecture guards ──────────────────────────────────────────

/** Source with comments stripped — prose must never satisfy or trip a guard. */
const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")

const EVIDENCE_SOURCES = [
  "scripts/lib/d1OperationalEvidence.mjs",
  "scripts/lib/d1EvidenceAdapters.mjs",
  "scripts/cf-d1-evidence-verify.mjs",
]

test("GUARD: the evidence layer is observational — no spawn, no network, no SQL, no Wrangler binary", () => {
  for (const file of EVIDENCE_SOURCES) {
    const src = codeOf(file)
    assert.doesNotMatch(src, /child_process|spawnSync|execSync|\bfetch\s*\(|node:net|node:http|node:https|node:sqlite|DatabaseSync/i,
      `${file} must never spawn, query, or reach a network`)
    // `wrangler_version` is a legitimate FIELD; invoking the wrangler BINARY is not.
    assert.doesNotMatch(src, /WRANGLER_BIN|\.bin\/wrangler|"wrangler"|'wrangler'|`wrangler`/,
      `${file} must never reference the Wrangler binary`)
  }
})

test("GUARD: the evidence layer never reads or sets an operator execution gate", () => {
  for (const file of EVIDENCE_SOURCES) {
    const src = codeOf(file)
    assert.doesNotMatch(src, /CF_D1_MIGRATE_EXECUTE|CF_D1_MIGRATE_CONFIRM|CF_D1_BOOTSTRAP_EXECUTE|CF_D1_BOOTSTRAP_CONFIRM|CF_DEPLOY_EXECUTE/,
      `${file} must not touch an existing execution gate`)
    assert.doesNotMatch(src, /process\.env\b/, `${file} must not read the environment at all`)
  }
})

test("GUARD: the recorder library prints nothing — evidence contents can never reach a log", () => {
  for (const file of ["scripts/lib/d1OperationalEvidence.mjs", "scripts/lib/d1EvidenceAdapters.mjs"]) {
    assert.doesNotMatch(codeOf(file), /console\./, `${file} must not log`)
  }
})

test("GUARD: the evidence directory is git-ignored in THIS repository", () => {
  assert.match(readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8"), /^\/\.d1-evidence\/$/m)
})

test("GUARD: the existing operator gates are untouched by this patch", () => {
  // The gated commands still carry their own execute flags + confirmation phrases.
  assert.match(codeOf("scripts/cf-d1-migrations-apply.mjs"), /CF_D1_MIGRATE_EXECUTE/)
  assert.match(codeOf("scripts/cf-d1-migrations-apply.mjs"), /CF_D1_MIGRATE_CONFIRM/)
  assert.match(codeOf("scripts/cf-d1-bootstrap-apply.mjs"), /CF_D1_BOOTSTRAP_EXECUTE/)
  assert.match(codeOf("scripts/cf-d1-bootstrap-apply.mjs"), /CF_D1_BOOTSTRAP_CONFIRM/)
  assert.match(codeOf("scripts/cloudflare-deploy.mjs"), /CF_DEPLOY_EXECUTE/)
  // And EXTERNAL_ACTIONS stays disabled.
  const wrangler = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  assert.equal(wrangler.vars.EXTERNAL_ACTIONS_ENABLED, "false")
})
