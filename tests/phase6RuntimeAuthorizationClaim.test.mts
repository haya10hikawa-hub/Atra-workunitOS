/**
 * P6-FIX-012 (Issue #145): the exact-binding atomic runtime Approval claim.
 * Proves in-memory / D1 predicate equivalence, that every binding field is
 * required, inclusive-fail expiry, single-winner concurrency, and that the
 * legacy unbound markApprovalUsed remains but is not used by the final gate.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { D1ApprovalRecordRepository } from "../app/lib/persistence/d1/approvalRecordRepository.ts"
import { createInMemoryApprovalRecordRepository } from "../app/lib/persistence/inMemoryRepositories.ts"
import { createRepositoryBackedApprovalStore } from "../app/lib/persistence/approvalStoreAdapter.ts"
import { createInMemoryApprovalStore, type RuntimeApprovalClaimInput } from "../app/lib/security/approvalStore.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { ApprovalRecordRow, TenantDbContext } from "../app/lib/persistence/types.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"

const tenantId = "tenant-a" as TenantId
const GATE_SRC = readFileSync(join(import.meta.dirname!, "../app/lib/security/runtimeAuthorizationGate.ts"), "utf-8")

const T_HASH = "a".repeat(64)
const P_HASH = "b".repeat(64)
const FUTURE = "2026-07-05T05:00:00Z"

function row(overrides: Partial<ApprovalRecordRow> = {}): ApprovalRecordRow {
  return {
    id: "approval-1", tenantId, workUnitId: "wu-1", actionPreviewId: "preview-1",
    actionType: "slack_reply", targetHash: T_HASH, payloadHash: P_HASH, status: "approved",
    approvedByUserId: "approver-1" as ApprovalRecordRow["approvedByUserId"],
    createdAt: "2026-07-05T02:40:00Z", approvedAt: "2026-07-05T02:45:00Z", expiresAt: FUTURE,
    ...overrides,
  }
}

function claim(overrides: Partial<RuntimeApprovalClaimInput> = {}): RuntimeApprovalClaimInput {
  return {
    tenantId, workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval-1",
    actionType: "slack_reply", targetHash: T_HASH, payloadHash: P_HASH,
    claimedAt: "2026-07-05T03:00:00Z", ...overrides,
  }
}

function freshD1() {
  const db = new FakeD1Database()
  const repo = new D1ApprovalRecordRepository(db)
  const ctx: TenantDbContext = { tenantId, db }
  return { db, repo, ctx }
}

// ─── In-memory security ApprovalStore ───────────────────────────

test("in-memory store: exact-binding claim succeeds once, second fails", async () => {
  const store = createInMemoryApprovalStore()
  store.addRecord({ ...row(), tenantId } as never)
  assert.equal(await store.claimApprovalForRuntime(claim()), true)
  assert.equal(await store.claimApprovalForRuntime(claim()), false)
})

const BINDING_MUTATIONS: Array<[keyof RuntimeApprovalClaimInput, string]> = [
  ["tenantId", "tenant-evil"],
  ["workUnitId", "wu-evil"],
  ["actionPreviewId", "preview-evil"],
  ["approvalId", "approval-evil"],
  ["actionType", "github_issue"],
  ["targetHash", "c".repeat(64)],
  ["payloadHash", "d".repeat(64)],
]

for (const [field, value] of BINDING_MUTATIONS) {
  test(`in-memory store: ${field} mismatch claims nothing`, async () => {
    const store = createInMemoryApprovalStore()
    store.addRecord({ ...row(), tenantId } as never)
    assert.equal(await store.claimApprovalForRuntime(claim({ [field]: value } as never)), false)
  })
}

for (const status of ["pending", "rejected", "expired", "used"] as const) {
  test(`in-memory store: status ${status} claims nothing`, async () => {
    const store = createInMemoryApprovalStore()
    store.addRecord({ ...row({ status }), tenantId } as never)
    assert.equal(await store.claimApprovalForRuntime(claim()), false)
  })
}

test("in-memory store: non-null usedAt claims nothing", async () => {
  const store = createInMemoryApprovalStore()
  store.addRecord({ ...row({ usedAt: "2026-07-05T02:55:00Z" }), tenantId } as never)
  assert.equal(await store.claimApprovalForRuntime(claim()), false)
})

test("in-memory store: exactly-at-expiry claims nothing", async () => {
  const store = createInMemoryApprovalStore()
  store.addRecord({ ...row({ expiresAt: FUTURE }), tenantId } as never)
  assert.equal(await store.claimApprovalForRuntime(claim({ claimedAt: FUTURE })), false)
})

test("in-memory store: single winner under concurrent identical claims", async () => {
  const store = createInMemoryApprovalStore()
  store.addRecord({ ...row(), tenantId } as never)
  const results = await Promise.all([
    store.claimApprovalForRuntime(claim()),
    store.claimApprovalForRuntime(claim()),
    store.claimApprovalForRuntime(claim()),
  ])
  assert.equal(results.filter(Boolean).length, 1)
})

// ─── D1 repository — predicate equivalence ──────────────────────

test("D1 repo: exact-binding claim succeeds once, second fails", async () => {
  const { repo, ctx } = freshD1()
  await repo.create(ctx, row())
  const first = await repo.claimForRuntime(ctx, { id: "approval-1", workUnitId: "wu-1", actionPreviewId: "preview-1", actionType: "slack_reply", targetHash: T_HASH, payloadHash: P_HASH, claimedAt: "2026-07-05T03:00:00Z" })
  assert.ok(first)
  assert.equal(first?.status, "used")
  const second = await repo.claimForRuntime(ctx, { id: "approval-1", workUnitId: "wu-1", actionPreviewId: "preview-1", actionType: "slack_reply", targetHash: T_HASH, payloadHash: P_HASH, claimedAt: "2026-07-05T03:00:00Z" })
  assert.equal(second, null)
})

for (const [field, value] of [
  ["workUnitId", "wu-evil"],
  ["actionPreviewId", "preview-evil"],
  ["actionType", "github_issue"],
  ["targetHash", "c".repeat(64)],
  ["payloadHash", "d".repeat(64)],
] as const) {
  test(`D1 repo: ${field} mismatch claims nothing`, async () => {
    const { repo, ctx } = freshD1()
    await repo.create(ctx, row())
    const base = { id: "approval-1", workUnitId: "wu-1", actionPreviewId: "preview-1", actionType: "slack_reply", targetHash: T_HASH, payloadHash: P_HASH, claimedAt: "2026-07-05T03:00:00Z" }
    assert.equal(await repo.claimForRuntime(ctx, { ...base, [field]: value }), null)
  })
}

test("D1 repo: cross-tenant claim claims nothing", async () => {
  const { repo, ctx } = freshD1()
  await repo.create(ctx, row())
  const otherCtx: TenantDbContext = { tenantId: "tenant-b" as TenantId, db: ctx.db }
  assert.equal(await repo.claimForRuntime(otherCtx, { id: "approval-1", workUnitId: "wu-1", actionPreviewId: "preview-1", actionType: "slack_reply", targetHash: T_HASH, payloadHash: P_HASH, claimedAt: "2026-07-05T03:00:00Z" }), null)
})

test("D1 repo: exactly-at-expiry claims nothing (expires_at > claimedAt)", async () => {
  const { repo, ctx } = freshD1()
  await repo.create(ctx, row({ expiresAt: FUTURE }))
  assert.equal(await repo.claimForRuntime(ctx, { id: "approval-1", workUnitId: "wu-1", actionPreviewId: "preview-1", actionType: "slack_reply", targetHash: T_HASH, payloadHash: P_HASH, claimedAt: FUTURE }), null)
})

test("adapter: repository exception fails closed", async () => {
  const repo = createInMemoryApprovalRecordRepository()
  // Poison claimForRuntime to throw.
  ;(repo as { claimForRuntime: unknown }).claimForRuntime = async () => { throw new Error("boom") }
  const store = createRepositoryBackedApprovalStore(repo, { tenantId, db: null })
  assert.equal(await store.claimApprovalForRuntime(claim()), false)
})

// ─── Legacy method boundary ─────────────────────────────────────

test("final gate uses claimApprovalForRuntime, never the legacy markApprovalUsed", () => {
  assert.ok(GATE_SRC.includes("claimApprovalForRuntime"), "gate must use the exact-binding claim")
  assert.ok(!GATE_SRC.includes("markApprovalUsed"), "gate must NOT use the legacy unbound claim")
})
