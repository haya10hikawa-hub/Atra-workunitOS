/**
 * P0-FIX-018 — the `.d1-evidence` root and session directories must be plain, private
 * directories (Issue #155).
 *
 * `mkdirSync(path, { recursive: true, mode: 0o700 })` does NOT correct an existing
 * directory: a pre-placed `.d1-evidence` at 0755 (or a symlink, or a regular file) was
 * silently accepted, exposing session private keys. One shared validator now enforces
 * a plain, non-symlink 0700 directory for BOTH session initialization and pack writing.
 *
 * All temporary; nothing here contacts a network or a database.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, chmodSync, symlinkSync, writeFileSync, statSync, readdirSync, readFileSync, existsSync, rmSync } from "node:fs"
import { createPrivateKey, sign as edSign } from "node:crypto"
import { resolve } from "node:path"
import {
  ensureEvidenceRootSecure, createSecureSessionDir, hasGroupOrOtherPermissionBits, writeEvidencePack, sha256Hex,
} from "../scripts/lib/d1OperationalEvidence.mjs"
import {
  initializeEvidenceSession, openCommandReceiptContext, assembleUnsignedReceipt,
  persistSignedReceipt, assembleEvidencePackFromSession, deriveMigrationPlanDigest, SESSION_PRIVATE_KEY_BASENAME,
} from "../scripts/lib/d1EvidenceReceipts.mjs"
import { makeEvidenceGitRepo, makeAuthority } from "./evidenceTestRepo.mts"

const AUTH = makeAuthority()

function initIn(repoRoot: string) {
  return initializeEvidenceSession({ repoRoot, environmentClass: "staging" })
}

/** Emit ONE signed receipt into a session and assemble the pack (returns the record). */
function buildPackRecord(repoRoot: string, sessionDir: string) {
  const ctx = openCommandReceiptContext(sessionDir, { repoRoot, authority: AUTH, producer: "cf_d1_migration_plan" })
  if (!ctx.ok) throw new Error(`ctx: ${ctx.blocked.join(",")}`)
  const built = assembleUnsignedReceipt(ctx.session, ctx.existingReceipts, {
    operation: "migration_plan_verified", producer: "cf_d1_migration_plan",
    authoritySha256: ctx.authoritySha256, producerSourceSha256: ctx.producerSourceSha256,
    startedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:00.500Z", status: "success",
    proof: { manifest_sha256: sha256Hex(readFileSync(resolve(repoRoot, "migrations/manifest.json"))), plan_digest: deriveMigrationPlanDigest(repoRoot)! },
    safeCategories: ["manifest_valid", "plan_lanes_verified"],
  })
  if (!built.ok) throw new Error(`assemble: ${built.blocked.join(",")}`)
  const pem = readFileSync(resolve(sessionDir, SESSION_PRIVATE_KEY_BASENAME), "utf8")
  built.receipt.receipt_signature = edSign(null, Buffer.from(built.receipt.receipt_sha256, "utf8"), createPrivateKey(pem)).toString("hex")
  persistSignedReceipt(ctx.session, built.receipt)
  const pack = assembleEvidencePackFromSession(sessionDir, { repoRoot })
  if (!pack.ok) throw new Error(`pack: ${pack.blocked.join(",")}`)
  return pack.record
}

// ─── The shared validator (unit) ──────────────────────────────────

test("hasGroupOrOtherPermissionBits flags any group/other bit", () => {
  assert.equal(hasGroupOrOtherPermissionBits(0o700), false)
  assert.equal(hasGroupOrOtherPermissionBits(0o600), false)
  for (const m of [0o755, 0o770, 0o750, 0o707, 0o701, 0o640, 0o604]) assert.equal(hasGroupOrOtherPermissionBits(m), true, `${m.toString(8)}`)
})

test("24 + 25 + 26 + 27 + 28. ensureEvidenceRootSecure creates 0700 and rejects 0755/0770/symlink/file", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const root = resolve(repo.repoRoot, ".d1-evidence")
    // 24. absent → created 0700.
    const created = ensureEvidenceRootSecure(repo.repoRoot)
    assert.equal(created.ok, true)
    assert.equal(statSync(root).mode & 0o777, 0o700)
    // 25 + 26. an existing 0755 / 0770 root is rejected with the single safe category.
    for (const mode of [0o755, 0o770, 0o750, 0o704]) {
      chmodSync(root, mode)
      const res = ensureEvidenceRootSecure(repo.repoRoot)
      assert.equal(res.ok, false, `mode ${mode.toString(8)} must be rejected`)
      assert.deepEqual((res as { blocked: string[] }).blocked, ["evidence_directory_permissions_invalid"])
    }
    rmSync(root, { recursive: true, force: true })
  } finally { repo.cleanup() }
  // 27. symlinked root → rejected.
  const repo2 = makeEvidenceGitRepo()
  try {
    const root = resolve(repo2.repoRoot, ".d1-evidence")
    const target = resolve(repo2.repoRoot, "evtarget"); mkdirSync(target, { mode: 0o700 }); symlinkSync(target, root)
    const res = ensureEvidenceRootSecure(repo2.repoRoot)
    assert.equal(res.ok, false)
    assert.deepEqual((res as { blocked: string[] }).blocked, ["evidence_directory_permissions_invalid"])
  } finally { repo2.cleanup() }
  // 28. regular file at .d1-evidence (even a private 0600 one) → rejected because it
  // is not a directory.
  const repo3 = makeEvidenceGitRepo()
  try {
    writeFileSync(resolve(repo3.repoRoot, ".d1-evidence"), "x", { mode: 0o600 })
    const res = ensureEvidenceRootSecure(repo3.repoRoot)
    assert.equal(res.ok, false)
    assert.deepEqual((res as { blocked: string[] }).blocked, ["evidence_directory_permissions_invalid"])
  } finally { repo3.cleanup() }
})

test("createSecureSessionDir makes 0700 dirs and re-checks the mode", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const root = ensureEvidenceRootSecure(repo.repoRoot)
    assert.ok(root.ok)
    if (!root.ok) return
    const dir = createSecureSessionDir(root.root, "evs-" + "ab".repeat(16))
    assert.ok(dir.ok)
    if (dir.ok) assert.equal(statSync(dir.sessionDir).mode & 0o777, 0o700)
  } finally { repo.cleanup() }
})

// ─── Session initialization (real command path) ───────────────────

test("24 + 29 + 30. a fresh session creates .d1-evidence at 0700, the session dir at 0700, and all files at 0600", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const init = initIn(repo.repoRoot)
    assert.ok(init.ok, init.ok ? "" : (init as { blocked: string[] }).blocked.join(","))
    if (!init.ok) return
    assert.equal(statSync(resolve(repo.repoRoot, ".d1-evidence")).mode & 0o777, 0o700, "root is 0700")
    assert.equal(statSync(init.sessionDir).mode & 0o777, 0o700, "session dir is 0700")
    assert.equal(statSync(resolve(init.sessionDir, "session.json")).mode & 0o777, 0o600)
    assert.equal(statSync(resolve(init.sessionDir, SESSION_PRIVATE_KEY_BASENAME)).mode & 0o777, 0o600)
    // Emit a receipt + assemble a pack — receipt and pack files are 0600 too.
    buildPackRecord(repo.repoRoot, init.sessionDir)
    for (const f of readdirSync(init.sessionDir)) assert.equal(statSync(resolve(init.sessionDir, f)).mode & 0o777, 0o600, `${f} is 0600`)
    const packFile = readdirSync(resolve(repo.repoRoot, ".d1-evidence")).find((f) => f.startsWith("d1-operational-evidence-"))!
    assert.equal(statSync(resolve(repo.repoRoot, ".d1-evidence", packFile)).mode & 0o777, 0o600, "pack file is 0600")
  } finally { repo.cleanup() }
})

test("25 + 32. session initialization REJECTS a pre-existing 0755 root and creates NO key or manifest (A3 closed)", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const root = resolve(repo.repoRoot, ".d1-evidence")
    mkdirSync(root, { mode: 0o700 }); chmodSync(root, 0o755)
    const init = initIn(repo.repoRoot)
    assert.equal(init.ok, false, "a 0755 root must be rejected")
    assert.ok(!init.ok && init.blocked.includes("evidence_directory_permissions_invalid"))
    // 32. Nothing was written — no session key, no manifest, no session dir.
    assert.deepEqual(readdirSync(root), [], "failed validation must create no key/manifest/session dir")
  } finally { repo.cleanup() }
})

test("26. session initialization rejects a pre-existing 0770 root", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const root = resolve(repo.repoRoot, ".d1-evidence")
    mkdirSync(root, { mode: 0o700 }); chmodSync(root, 0o770)
    const init = initIn(repo.repoRoot)
    assert.equal(init.ok, false)
    assert.ok(!init.ok && init.blocked.includes("evidence_directory_permissions_invalid"))
  } finally { repo.cleanup() }
})

// ─── Pack writing independently rejects an unsafe root ────────────

test("31. writeEvidencePack INDEPENDENTLY rejects an unsafe root (0755, symlink) even for a valid record", () => {
  // Build a valid record in a clean repo.
  const source = makeEvidenceGitRepo()
  let record: unknown
  try {
    const init = initIn(source.repoRoot)
    assert.ok(init.ok)
    if (!init.ok) return
    record = buildPackRecord(source.repoRoot, init.sessionDir)
  } finally { /* keep source until record captured */ source.cleanup() }

  // A repo whose .d1-evidence root is 0755 → pack writing fails closed.
  const unsafe = makeEvidenceGitRepo()
  try {
    const root = resolve(unsafe.repoRoot, ".d1-evidence")
    mkdirSync(root, { mode: 0o700 }); chmodSync(root, 0o755)
    const res = writeEvidencePack(record as never, { repoRoot: unsafe.repoRoot })
    assert.equal(res.ok, false)
    assert.ok(!res.ok && res.blocked.includes("evidence_directory_permissions_invalid"))
    assert.deepEqual(readdirSync(root), [], "no pack is written into an unsafe root")
  } finally { unsafe.cleanup() }

  // A repo whose .d1-evidence root is a symlink → also rejected.
  const linked = makeEvidenceGitRepo()
  try {
    const root = resolve(linked.repoRoot, ".d1-evidence")
    const target = resolve(linked.repoRoot, "evtarget"); mkdirSync(target, { mode: 0o700 }); symlinkSync(target, root)
    const res = writeEvidencePack(record as never, { repoRoot: linked.repoRoot })
    assert.equal(res.ok, false)
    assert.ok(!res.ok && res.blocked.includes("evidence_directory_permissions_invalid"))
    assert.equal(existsSync(resolve(target, "" as string)) && readdirSync(target).length === 0, true, "no pack is written through the symlink")
  } finally { linked.cleanup() }
})
