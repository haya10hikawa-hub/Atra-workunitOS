import test from "node:test"
import assert from "node:assert/strict"
import { resolveRepositories, resolveProductionRepositories, resetInMemoryReposForTests } from "../app/lib/persistence/repositoryResolver.ts"
import { createFakeTenantDbResolver } from "../app/lib/persistence/tenantDbResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import {
  hashActionTarget,
  hashActionPayload,
} from "../app/lib/security/hash.ts"
import {
  verifyApproval,
} from "../app/lib/security/approvalStore.ts"
import { createRepositoryBackedApprovalStore } from "../app/lib/persistence/approvalStoreAdapter.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { ActionApprovalRecord } from "../app/lib/domain/types.ts"
import type { AppEnv } from "../app/types/cloudflare-env"

const tenantId = "test-tenant" as TenantId

// ─── D1 Mode: Binding Resolution ────────────────────────────────

test("D1 mode: d1_not_configured when no options provided", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", PERSISTENCE_MODE: "d1" },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

test("D1 mode: d1_not_configured when runtimeEnv is empty", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", PERSISTENCE_MODE: "d1" },
    runtimeEnv: {} as AppEnv,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

test("D1 mode: returns bundle with explicit resolver + d1Binding (test path)", async () => {
  resetInMemoryReposForTests()
  const fakeDb = new FakeD1Database()
  const tenants = new Map()
  tenants.set(tenantId, {
    tenant: { id: tenantId, status: "active" },
    dbRef: { tenant_id: tenantId, database_name: "test-db", status: "active" },
  })
  const resolver = createFakeTenantDbResolver(tenants)

  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", PERSISTENCE_MODE: "d1" },
    resolver,
    d1Binding: fakeDb,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.ok(result.bundle.actionPreviews)
    assert.ok(result.bundle.approvalRecords)
    assert.ok(result.bundle.ctx)
  }
})

// ─── D1 Lifecycle through Resolver ──────────────────────────────

test("D1 lifecycle: create preview + approve + verify through resolver (explicit path)", async () => {
  resetInMemoryReposForTests()
  const fakeDb = new FakeD1Database()
  const tenants = new Map()
  tenants.set(tenantId, {
    tenant: { id: tenantId, status: "active" },
    dbRef: { tenant_id: tenantId, database_name: "test-db", status: "active" },
  })
  const resolver = createFakeTenantDbResolver(tenants)

  const repoResult = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", PERSISTENCE_MODE: "d1" },
    resolver,
    d1Binding: fakeDb,
  })
  assert.equal(repoResult.ok, true)
  if (!repoResult.ok) return
  const { actionPreviews: previewRepo, approvalRecords: approvalRepo, workUnits, ctx } = repoResult.bundle

  // Persist the parent WorkUnit (a preview must reference a same-tenant WorkUnit).
  await workUnits.upsert(ctx, {
    id: "wu-d1", tenantId, title: "t", kind: "task", priority: "medium", sourceProvider: "mock",
    reason: "r", evidence: "e", nextAction: "n", status: "open",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })

  // Create preview
  const target = { channel: "#ops" }
  const payload = { body: "Deploy ready" }
  const targetHash = hashActionTarget(target)
  const payloadHash = hashActionPayload(payload)
  const previewId = `preview:wu-d1:slack_reply:${Date.now()}`

  await previewRepo.create(ctx, {
    id: previewId, tenantId, workUnitId: "wu-d1", actionType: "slack_reply",
    targetPreview: JSON.stringify(target), payloadPreview: JSON.stringify(payload),
    requiresApproval: 1, status: "preview",
    targetHash, payloadHash,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  })

  // Create approval
  const approvalId = `approval:wu-d1:slack_reply:${Date.now() + 1}`
  const now = new Date().toISOString()

  await approvalRepo.create(ctx, {
    id: approvalId, tenantId, workUnitId: "wu-d1", actionPreviewId: previewId,
    actionType: "slack_reply", targetHash, payloadHash,
    status: "approved",
    approvedByUserId: "user-admin" as ActionApprovalRecord["approvedByUserId"],
    createdAt: now, approvedAt: now,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    usedAt: undefined,
  })

  // Verify through repository-backed store
  const approvalStore = createRepositoryBackedApprovalStore(approvalRepo, ctx)
  const verifyResult = await verifyApproval(approvalStore, {
    tenantId, workUnitId: "wu-d1", actionPreviewId: previewId,
    approvalId, actionType: "slack_reply",
    targetHash, payloadHash,
    now: new Date().toISOString(),
  })
  assert.equal(verifyResult.ok, true)

  // Mark used → second fails
  await approvalStore.markApprovalUsed(approvalId, new Date().toISOString())
  const secondResult = await verifyApproval(approvalStore, {
    tenantId, workUnitId: "wu-d1", actionPreviewId: previewId,
    approvalId, actionType: "slack_reply",
    targetHash, payloadHash,
    now: new Date().toISOString(),
  })
  assert.equal(secondResult.ok, false)
  if (!secondResult.ok) assert.equal(secondResult.error, "approval_used")
})

// ─── Production Safety ──────────────────────────────────────────

test("production: in-memory still blocked with D1 mode available", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "production", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "persistence_disabled")
})

test("production: the legacy env API fails closed for D1 even WITH a resolver + d1Binding (round 3)", async () => {
  resetInMemoryReposForTests()
  const fakeDb = new FakeD1Database()
  const tenants = new Map()
  tenants.set(tenantId, {
    tenant: { id: tenantId, status: "active" },
    dbRef: { tenant_id: tenantId, database_name: "prod-db", status: "active" },
  })
  const resolver = createFakeTenantDbResolver(tenants, fakeDb)

  // A supplied resolver + d1Binding is NOT sufficient to promote the legacy
  // env/process.env seam to production authority — it fails closed.
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "production", PERSISTENCE_MODE: "d1" },
    resolver,
    d1Binding: fakeDb,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

test("production: Node production D1 succeeds ONLY through resolveProductionRepositories", async () => {
  resetInMemoryReposForTests()
  const control = new FakeD1Database()
  const tenantDb = new FakeD1Database()
  const tenants = new Map()
  tenants.set(tenantId, {
    tenant: { id: tenantId, status: "active" },
    dbRef: { tenant_id: tenantId, database_name: "prod-db", status: "active" },
  })
  const resolver = createFakeTenantDbResolver(tenants, tenantDb)

  const result = await resolveProductionRepositories(tenantId, {
    persistence: { mode: "d1", CONTROL_DB: control, TENANT_DB_DEFAULT: tenantDb },
    resolver,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.bundle.ctx.db, tenantDb) // ctx.db is authoritative
    assert.ok(result.bundle.actionPreviews)
    assert.ok(result.bundle.approvalRecords)
  }
})
