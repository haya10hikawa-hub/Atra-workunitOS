import test from "node:test"
import assert from "node:assert/strict"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { D1ActionPreviewRepository } from "../app/lib/persistence/d1/actionPreviewRepository.ts"
import { D1ApprovalRecordRepository } from "../app/lib/persistence/d1/approvalRecordRepository.ts"
import type { TenantDbContext } from "../app/lib/persistence/types.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"

const tenantId = "test-tenant" as TenantId
const ctx: TenantDbContext = { tenantId, db: null }

// ─── D1 ActionPreview Repository ────────────────────────────────

test("D1ActionPreviewRepository: create + findById", async () => {
  const db = new FakeD1Database()
  const repo = new D1ActionPreviewRepository(db)

  const preview = {
    id: "preview:wu-1:slack_reply:1",
    tenantId,
    workUnitId: "wu-1",
    actionType: "slack_reply",
    targetPreview: JSON.stringify({ channel: "#general" }),
    payloadPreview: JSON.stringify({ body: "Hello" }),
    requiresApproval: 1,
    status: "preview",
    targetHash: "h1".padEnd(64, "0"),
    payloadHash: "h2".padEnd(64, "0"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  }

  const created = await repo.create(ctx, preview)
  assert.equal(created.id, preview.id)

  const found = await repo.findById(ctx, preview.id)
  assert.ok(found)
  assert.equal(found.targetHash, preview.targetHash)
  assert.equal(found.payloadHash, preview.payloadHash)
  assert.equal(found.status, "preview")
})

test("D1ActionPreviewRepository: findById returns null for missing", async () => {
  const db = new FakeD1Database()
  const repo = new D1ActionPreviewRepository(db)
  const found = await repo.findById(ctx, "nonexistent")
  assert.equal(found, null)
})

test("D1ActionPreviewRepository: findByWorkUnitId", async () => {
  const db = new FakeD1Database()
  const repo = new D1ActionPreviewRepository(db)

  await repo.create(ctx, {
    id: "preview:wu-2:slack_reply:1",
    tenantId, workUnitId: "wu-2", actionType: "slack_reply",
    targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1,
    status: "preview", targetHash: "h1".padEnd(64), payloadHash: "h2".padEnd(64),
    createdAt: new Date().toISOString(),
  })

  const results = await repo.findByWorkUnitId(ctx, "wu-2")
  assert.equal(results.length, 1)
  assert.equal(results[0].id, "preview:wu-2:slack_reply:1")
})

// ─── D1 Approval Record Repository ─────────────────────────────

test("D1ApprovalRecordRepository: create + findById", async () => {
  const db = new FakeD1Database()
  const repo = new D1ApprovalRecordRepository(db)

  const approval = {
    id: "approval:wu-1:slack_reply:1",
    tenantId,
    workUnitId: "wu-1",
    actionPreviewId: "preview:wu-1:slack_reply:1",
    actionType: "slack_reply",
    targetHash: "h1".padEnd(64, "0"),
    payloadHash: "h2".padEnd(64, "0"),
    status: "approved" as const,
    approvedByUserId: "user-pm" as UserId,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  }

  const created = await repo.create(ctx, approval)
  assert.equal(created.id, approval.id)

  const found = await repo.findById(ctx, approval.id)
  assert.ok(found)
  assert.equal(found.status, "approved")
  assert.equal(found.targetHash, approval.targetHash)
})

test("D1ApprovalRecordRepository: findById returns null for missing", async () => {
  const db = new FakeD1Database()
  const repo = new D1ApprovalRecordRepository(db)
  const found = await repo.findById(ctx, "nonexistent")
  assert.equal(found, null)
})

test("D1ApprovalRecordRepository: findByPreviewId", async () => {
  const db = new FakeD1Database()
  const repo = new D1ApprovalRecordRepository(db)

  await repo.create(ctx, {
    id: "approval:wu-3:gmail_reply:1",
    tenantId, workUnitId: "wu-3", actionPreviewId: "preview:wu-3:gmail_reply:1",
    actionType: "gmail_reply", targetHash: "h1".padEnd(64), payloadHash: "h2".padEnd(64),
    status: "approved", createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  })

  const found = await repo.findByPreviewId(ctx, "preview:wu-3:gmail_reply:1")
  assert.ok(found)
  assert.equal(found.actionPreviewId, "preview:wu-3:gmail_reply:1")
})

test("D1ApprovalRecordRepository: updateStatus", async () => {
  const db = new FakeD1Database()
  const repo = new D1ApprovalRecordRepository(db)

  await repo.create(ctx, {
    id: "approval:wu-4:slack_reply:1",
    tenantId, workUnitId: "wu-4", actionPreviewId: "preview:wu-4:slack_reply:1",
    actionType: "slack_reply", targetHash: "h1".padEnd(64), payloadHash: "h2".padEnd(64),
    status: "pending", createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  })

  const updated = await repo.updateStatus(ctx, "approval:wu-4:slack_reply:1", "approved")
  assert.ok(updated)
  assert.equal(updated.status, "approved")
})

test("D1ApprovalRecordRepository: markUsed", async () => {
  const db = new FakeD1Database()
  const repo = new D1ApprovalRecordRepository(db)

  await repo.create(ctx, {
    id: "approval:wu-5:github_issue:1",
    tenantId, workUnitId: "wu-5", actionPreviewId: "preview:wu-5:github_issue:1",
    actionType: "github_issue", targetHash: "h1".padEnd(64), payloadHash: "h2".padEnd(64),
    status: "approved", createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  })

  const used = await repo.markUsed(ctx, "approval:wu-5:github_issue:1", new Date().toISOString())
  assert.ok(used)
  assert.equal(used.status, "used")
  assert.ok(used.usedAt)
})

test("D1ApprovalRecordRepository: preserve targetHash/payloadHash", async () => {
  const db = new FakeD1Database()
  const repo = new D1ApprovalRecordRepository(db)

  await repo.create(ctx, {
    id: "approval:wu-6:slack_reply:1",
    tenantId, workUnitId: "wu-6", actionPreviewId: "preview:wu-6:slack_reply:1",
    actionType: "slack_reply", targetHash: "abc123".padEnd(64, "0"), payloadHash: "def456".padEnd(64, "0"),
    status: "approved", createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  })

  const found = await repo.findById(ctx, "approval:wu-6:slack_reply:1")
  assert.ok(found)
  assert.equal(found.targetHash, "abc123".padEnd(64, "0"))
  assert.equal(found.payloadHash, "def456".padEnd(64, "0"))
})
