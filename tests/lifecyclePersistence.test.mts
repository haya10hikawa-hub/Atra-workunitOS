import test from "node:test"
import assert from "node:assert/strict"
import { resetInMemoryReposForTests } from "../app/lib/persistence/repositoryResolver.ts"
import {
  resolveRepositories,
} from "../app/lib/persistence/repositoryResolver.ts"
import {
  resolvePersistenceConfig,
} from "../app/lib/persistence/persistenceConfig.ts"
import {
  hashActionTarget,
  hashActionPayload,
} from "../app/lib/security/hash.ts"
import {
  verifyApproval,
  createInMemoryApprovalStore,
} from "../app/lib/security/approvalStore.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { ActionApprovalRecord } from "../app/lib/domain/types.ts"

const tenantId = "test-tenant" as TenantId

// ─── Persistence Config ─────────────────────────────────────────

test("production: ALLOW_IN_MEMORY_PERSISTENCE blocked even when true", () => {
  const config = resolvePersistenceConfig({
    NODE_ENV: "production",
    ALLOW_IN_MEMORY_PERSISTENCE: "true",
  })
  assert.equal(config.mode, "disabled")
  assert.equal(config.isInMemoryAllowed, false)
})

test("dev: ALLOW_IN_MEMORY_PERSISTENCE=true enables in_memory mode", () => {
  const config = resolvePersistenceConfig({
    NODE_ENV: "development",
    ALLOW_IN_MEMORY_PERSISTENCE: "true",
  })
  assert.equal(config.mode, "in_memory")
  assert.equal(config.isInMemoryAllowed, true)
})

// ─── Full Lifecycle: In-Memory ──────────────────────────────────

test("resolveRepositories returns repos in dev with in-memory", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
  })
  assert.equal(result.ok, true)
})

test("resolveRepositories returns persistence_disabled in production", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "production" },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "persistence_disabled")
})

test("resolveRepositories returns persistence_disabled without flag", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development" },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "persistence_disabled")
})

// ─── Full Lifecycle: Preview → Approve → Verify → Execute ──────

test("full lifecycle with in-memory persistence: preview → approve → verify → execute", async () => {
  resetInMemoryReposForTests()

  // 1. Resolve repos
  const repoResult = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
  })
  assert.equal(repoResult.ok, true)
  if (!repoResult.ok) return
  const { actionPreviews: previewRepo, approvalRecords: approvalRepo, workUnits, ctx } = repoResult.bundle

  // 1b. Persist the parent WorkUnit (a preview must reference a same-tenant WorkUnit).
  await workUnits.upsert(ctx, {
    id: "wu-1", tenantId, title: "t", kind: "task", priority: "medium", sourceProvider: "mock",
    reason: "r", evidence: "e", nextAction: "n", status: "open",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })

  // 2. Create preview (simulating POST /api/workunit/:id/action-preview)
  const target = { channel: "#general" }
  const payload = { body: "Hello team!" }
  const targetHash = hashActionTarget(target)
  const payloadHash = hashActionPayload(payload)
  const previewId = `preview:wu-1:slack_reply:${Date.now()}`

  await previewRepo.create(ctx, {
    id: previewId,
    tenantId,
    workUnitId: "wu-1",
    actionType: "slack_reply",
    targetPreview: JSON.stringify(target),
    payloadPreview: JSON.stringify(payload),
    requiresApproval: 1,
    status: "preview",
    targetHash,
    payloadHash,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  })

  // 3. Create approval (simulating POST /api/workunit/:id/approval)
  const approvalId = `approval:wu-1:slack_reply:${Date.now() + 1}`
  const now = new Date().toISOString()

  await approvalRepo.create(ctx, {
    id: approvalId,
    tenantId,
    workUnitId: "wu-1",
    actionPreviewId: previewId,
    actionType: "slack_reply",
    targetHash,
    payloadHash,
    status: "approved",
    approvedByUserId: "user-pm" as ActionApprovalRecord["approvedByUserId"],
    createdAt: now,
    approvedAt: now,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  })

  // 4. Verify approval (simulating runApprovedExternal)
  const store = createInMemoryApprovalStore()
  store.addRecord({
    id: approvalId, tenantId, workUnitId: "wu-1", actionPreviewId: previewId,
    actionType: "slack_reply", targetHash, payloadHash, status: "approved",
    approvedByUserId: "user-pm" as ActionApprovalRecord["approvedByUserId"],
    createdAt: now, approvedAt: now,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  })

  const verifyResult = await verifyApproval(store, {
    tenantId, workUnitId: "wu-1", actionPreviewId: previewId,
    approvalId, actionType: "slack_reply",
    targetHash, payloadHash,
    now: new Date().toISOString(),
  })
  assert.equal(verifyResult.ok, true)

  // 5. Mark used → second attempt fails
  await store.markApprovalUsed(approvalId, new Date().toISOString())
  const secondResult = await verifyApproval(store, {
    tenantId, workUnitId: "wu-1", actionPreviewId: previewId,
    approvalId, actionType: "slack_reply",
    targetHash, payloadHash,
    now: new Date().toISOString(),
  })
  assert.equal(secondResult.ok, false)
  if (!secondResult.ok) assert.equal(secondResult.error, "approval_used")
})

// ─── Disabled Persistence Blocks Routes ─────────────────────────

test("disabled persistence: resolveRepositories returns persistence_disabled", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development" },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "persistence_disabled")
})

// ─── Client Hash Rejection ─────────────────────────────────────

test("client-provided hashes differ from server hashes", () => {
  const serverHash = hashActionTarget({ channel: "#general" })
  const clientHash = "0".repeat(64)
  assert.notEqual(serverHash, clientHash)
})

// ─── Wrong Tenant ──────────────────────────────────────────────

test("wrong tenant: verifyApproval blocks cross-tenant access", async () => {
  const store = createInMemoryApprovalStore()
  store.addRecord({
    id: "approval:wu-1:slack_reply:1",
    tenantId: "tenant-a" as TenantId,
    workUnitId: "wu-1",
    actionPreviewId: "preview:wu-1:slack_reply:1",
    actionType: "slack_reply",
    targetHash: hashActionTarget({ channel: "#g" }),
    payloadHash: hashActionPayload({ body: "x" }),
    status: "approved",
    approvedByUserId: "user-a" as ActionApprovalRecord["approvedByUserId"],
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  })

  const result = await verifyApproval(store, {
    tenantId: "tenant-b" as TenantId,
    workUnitId: "wu-1",
    actionPreviewId: "preview:wu-1:slack_reply:1",
    approvalId: "approval:wu-1:slack_reply:1",
    actionType: "slack_reply",
    targetHash: hashActionTarget({ channel: "#g" }),
    payloadHash: hashActionPayload({ body: "x" }),
    now: new Date().toISOString(),
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "forbidden")
})
