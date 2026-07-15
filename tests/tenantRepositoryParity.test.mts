/**
 * Tenant-isolation PARITY matrix (P0-PERSIST-014).
 *
 * The SAME behavioral assertions run against the in-memory and D1/FakeD1
 * implementations of every active-bundle repository. Two tenants A and B use
 * identical row IDs to prove:
 *   - writes derive tenant from ctx (a spoofed row.tenantId is never authoritative);
 *   - wrong-tenant reads/lists return nothing;
 *   - wrong-tenant updates return null and leave data unchanged;
 *   - the correct tenant still succeeds.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  createInMemoryWorkUnitRepository,
  createInMemoryWorkUnitFeedbackRepository,
  createInMemoryIntegrationConnectionRepository,
  createInMemoryAuditLogRepository,
  createInMemoryUsageRepository,
  createInMemoryApprovalRecordRepository,
} from "../app/lib/persistence/inMemoryRepositories.ts"
import { D1WorkUnitRepository } from "../app/lib/persistence/d1/workUnitRepository.ts"
import { D1WorkUnitFeedbackRepository } from "../app/lib/persistence/d1/workUnitFeedbackRepository.ts"
import { D1IntegrationConnectionRepository } from "../app/lib/persistence/d1/integrationConnectionRepository.ts"
import { D1AuditLogRepository } from "../app/lib/persistence/d1/auditLogRepository.ts"
import { D1UsageRepository } from "../app/lib/persistence/d1/usageRepository.ts"
import { D1ApprovalRecordRepository } from "../app/lib/persistence/d1/approvalRecordRepository.ts"
import { resolveRepositories, resolveLocalRepositories, resetInMemoryReposForTests } from "../app/lib/persistence/repositoryResolver.ts"
import type { ActionPreviewRepository, WorkUnitRepository } from "../app/lib/persistence/repositories.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { TenantDbContext } from "../app/lib/persistence/types.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"

const A = "tenant-a" as TenantId
const B = "tenant-b" as TenantId
const ctx = (t: TenantId): TenantDbContext => ({ tenantId: t, db: null })
const now = () => new Date().toISOString()
const KINDS = ["in-memory", "d1"] as const

// ─── WorkUnit ───────────────────────────────────────────────────

function workUnitRepo(kind: (typeof KINDS)[number]) {
  return kind === "in-memory" ? createInMemoryWorkUnitRepository() : new D1WorkUnitRepository(new FakeD1Database())
}
const wuRow = (id: string, tenantId: TenantId) => ({
  id, tenantId, title: "t", kind: "task", priority: "med", sourceProvider: "mock",
  reason: "r", evidence: "e", nextAction: "n", status: "inbox" as const, createdAt: now(), updatedAt: now(),
})

for (const kind of KINDS) {
  test(`[${kind}] WorkUnit: spoofed-tenant create + wrong-tenant find/list/update isolation`, async () => {
    const repo = workUnitRepo(kind)
    // A creates id "wu" but spoofs row.tenantId = B → must store under A (ctx).
    const created = await repo.create(ctx(A), wuRow("wu", B))
    assert.equal(created.tenantId, A)
    // Correct tenant reads it; wrong tenant cannot.
    assert.equal((await repo.findById(ctx(A), "wu"))?.tenantId, A)
    assert.equal(await repo.findById(ctx(B), "wu"), null)
    // Wrong-tenant list excludes it.
    assert.equal((await repo.listRecent(ctx(B))).length, 0)
    assert.equal((await repo.listRecent(ctx(A))).length, 1)
    // Wrong-tenant update returns null and does not mutate A's row.
    assert.equal(await repo.updateStatus(ctx(B), "wu", "archived"), null)
    assert.equal((await repo.findById(ctx(A), "wu"))?.status, "inbox")
    // Correct tenant update succeeds.
    assert.equal((await repo.updateStatus(ctx(A), "wu", "archived"))?.status, "archived")
  })
}

test("[in-memory] WorkUnit: identical IDs across tenants remain isolated", async () => {
  const repo = createInMemoryWorkUnitRepository()
  await repo.create(ctx(A), wuRow("dup", A))
  await repo.create(ctx(B), wuRow("dup", B))
  assert.equal((await repo.findById(ctx(A), "dup"))?.tenantId, A)
  assert.equal((await repo.findById(ctx(B), "dup"))?.tenantId, B)
})

// ─── WorkUnit Feedback ──────────────────────────────────────────

function feedbackRepo(kind: (typeof KINDS)[number]) {
  return kind === "in-memory" ? createInMemoryWorkUnitFeedbackRepository() : new D1WorkUnitFeedbackRepository(new FakeD1Database())
}
const fbRow = (id: string, tenantId: TenantId, wu: string) => ({ id, tenantId, workUnitId: wu, feedback: "up", actorUserId: "u", createdAt: now() })

for (const kind of KINDS) {
  test(`[${kind}] Feedback: spoofed-tenant create + wrong-tenant read isolation`, async () => {
    const repo = feedbackRepo(kind)
    const created = await repo.create(ctx(A), fbRow("fb", B, "wuX"))
    assert.equal(created.tenantId, A)
    assert.equal((await repo.findByWorkUnitId(ctx(A), "wuX")).length, 1)
    // A tenant must not read another tenant's feedback for the same WorkUnit ID.
    assert.equal((await repo.findByWorkUnitId(ctx(B), "wuX")).length, 0)
  })
}

// ─── Integration Connection ─────────────────────────────────────

function integrationRepo(kind: (typeof KINDS)[number]) {
  return kind === "in-memory" ? createInMemoryIntegrationConnectionRepository() : new D1IntegrationConnectionRepository(new FakeD1Database())
}
const connRow = (id: string, tenantId: TenantId, provider: string, status = "connected") => ({
  id, tenantId, provider, status, mode: "real", createdAt: now(), updatedAt: now(),
})

for (const kind of KINDS) {
  test(`[${kind}] Integration: spoofed-tenant upsert does not overwrite another tenant`, async () => {
    const repo = integrationRepo(kind)
    // B genuinely connects github.
    await repo.upsert(ctx(B), connRow("conn-b", B, "github", "connected"))
    // A upserts with a spoofed row.tenantId = B → must store under A, not clobber B.
    await repo.upsert(ctx(A), connRow("conn-a", B, "github", "disconnected"))
    assert.equal((await repo.findByProvider(ctx(B), "github"))?.status, "connected")
    assert.equal((await repo.findByProvider(ctx(A), "github"))?.status, "disconnected")
    // Wrong-tenant list isolation.
    assert.equal((await repo.listByTenant(ctx(B))).every((c) => c.tenantId === B), true)
    // Wrong-tenant update returns null.
    assert.equal(await repo.updateStatus(ctx(A), "slack", "connected"), null)
  })
}

// ─── Audit Log ──────────────────────────────────────────────────

function auditRepo(kind: (typeof KINDS)[number]) {
  return kind === "in-memory" ? createInMemoryAuditLogRepository() : new D1AuditLogRepository(new FakeD1Database())
}
const auditRow = (id: string, tenantId: TenantId, wu: string) => ({
  id, tenantId, eventKind: "test.event", actorId: "u" as UserId, workUnitId: wu, reason: "ok", metadata: "{}", occurredAt: now(),
})

for (const kind of KINDS) {
  test(`[${kind}] Audit: append derives ctx tenant + cross-tenant list/find isolation`, async () => {
    const repo = auditRepo(kind)
    const appended = await repo.append(ctx(A), auditRow("a1", B, "wuA"))
    assert.equal(appended.tenantId, A)
    assert.equal((await repo.listRecent(ctx(A))).length, 1)
    assert.equal((await repo.listRecent(ctx(B))).length, 0)
    assert.equal((await repo.findByWorkUnitId(ctx(A), "wuA")).length, 1)
    assert.equal((await repo.findByWorkUnitId(ctx(B), "wuA")).length, 0)
  })
}

// ─── Usage ──────────────────────────────────────────────────────

function usageRepo(kind: (typeof KINDS)[number]) {
  return kind === "in-memory" ? createInMemoryUsageRepository() : new D1UsageRepository(new FakeD1Database())
}
const usageRow = (id: string, tenantId: TenantId) => ({
  id, tenantId, eventType: "inbox_fetch", quantity: 2, resourceType: "inbox", resourceId: "r", metadataJson: "{}", createdAt: now(),
})

for (const kind of KINDS) {
  test(`[${kind}] Usage: record derives ctx tenant + argument cannot cross tenants`, async () => {
    const repo = usageRepo(kind)
    const rec = await repo.recordEvent(ctx(A), usageRow("u1", B))
    assert.equal(rec.tenantId, A)
    // Correct tenant reads its own usage.
    assert.equal(await repo.getCurrentUsage(ctx(A), A, "inbox_fetch"), 2)
    // A caller must not read another tenant's usage by changing the argument.
    assert.equal(await repo.getCurrentUsage(ctx(A), B, "inbox_fetch"), 0)
    assert.equal(await repo.getCurrentUsage(ctx(B), B, "inbox_fetch"), 0)
    // Summary is keyed by ctx tenant; mismatched argument fails closed.
    const date = new Date().toISOString().slice(0, 10)
    assert.equal((await repo.getDailySummary(ctx(A), A, date)).length >= 1, true)
    assert.equal((await repo.getDailySummary(ctx(A), B, date)).length, 0)
  })
}

// ─── Approval Record ────────────────────────────────────────────

function approvalRepo(kind: (typeof KINDS)[number]) {
  return kind === "in-memory" ? createInMemoryApprovalRecordRepository() : new D1ApprovalRecordRepository(new FakeD1Database())
}
const apprRow = (id: string, tenantId: TenantId) => ({
  id, tenantId, workUnitId: "wu", actionPreviewId: "pv", actionType: "slack_reply",
  targetHash: "h1", payloadHash: "h2", status: "approved" as const,
  createdAt: now(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
})

for (const kind of KINDS) {
  test(`[${kind}] Approval: spoofed create + wrong-tenant find/update isolation, mark-used preserved`, async () => {
    const repo = approvalRepo(kind)
    const created = await repo.create(ctx(A), apprRow("ap", B))
    assert.equal(created.tenantId, A)
    assert.equal((await repo.findById(ctx(A), "ap"))?.tenantId, A)
    assert.equal(await repo.findById(ctx(B), "ap"), null)
    // Wrong-tenant updateStatus returns null and leaves the row unchanged.
    assert.equal(await repo.updateStatus(ctx(B), "ap", "rejected"), null)
    assert.equal((await repo.findById(ctx(A), "ap"))?.status, "approved")
    // Wrong-tenant runtime claim wins nothing.
    const claim = await repo.claimForRuntime(ctx(B), {
      id: "ap", workUnitId: "wu", actionPreviewId: "pv", actionType: "slack_reply",
      targetHash: "h1", payloadHash: "h2", claimedAt: now(),
    })
    assert.equal(claim, null)
    assert.equal((await repo.findById(ctx(A), "ap"))?.status, "approved")
    // Correct tenant claim succeeds exactly once.
    const first = await repo.claimForRuntime(ctx(A), {
      id: "ap", workUnitId: "wu", actionPreviewId: "pv", actionType: "slack_reply",
      targetHash: "h1", payloadHash: "h2", claimedAt: now(),
    })
    assert.equal(first?.status, "used")
    const second = await repo.markUsed(ctx(A), "ap", now())
    assert.equal(second, null)
  })
}

// ─── Action Preview ─────────────────────────────────────────────

// Both kinds go through the ENFORCING bundle (parents are tenant-scoped), so the
// parity assertions include parent-ownership. A shared store lets us seed the
// parent WorkUnit that the preview must reference.
async function actionPreviewSetup(kind: (typeof KINDS)[number]): Promise<{ previews: ActionPreviewRepository; workUnits: WorkUnitRepository }> {
  if (kind === "d1") {
    const db = new FakeD1Database()
    const result = await resolveLocalRepositories(A, { persistence: { mode: "d1", TENANT_DB_DEFAULT: db }, allowDirectBinding: true })
    if (!result.ok) throw new Error("d1 bundle failed")
    return { previews: result.bundle.actionPreviews, workUnits: result.bundle.workUnits }
  }
  resetInMemoryReposForTests()
  const result = await resolveRepositories(A, { persistence: { mode: "in_memory" } })
  if (!result.ok) throw new Error("in-memory bundle failed")
  return { previews: result.bundle.actionPreviews, workUnits: result.bundle.workUnits }
}
const pvRow = (id: string, tenantId: TenantId, wu: string) => ({
  id, tenantId, workUnitId: wu, actionType: "slack_reply", targetPreview: "{}", payloadPreview: "{}",
  requiresApproval: 1, status: "preview", targetHash: "h1", payloadHash: "h2", createdAt: now(), creatorUserId: "u" as UserId,
})

for (const kind of KINDS) {
  test(`[${kind}] ActionPreview: spoofed-tenant create + wrong-tenant find/list isolation`, async () => {
    const { previews, workUnits } = await actionPreviewSetup(kind)
    // Seed the parent WorkUnit under tenant A — a preview must reference a
    // same-tenant WorkUnit (enforced at the persistence-service boundary).
    await workUnits.create(ctx(A), wuRow("wuP", A))
    const created = await previews.create(ctx(A), pvRow("pv", B, "wuP"))
    assert.equal(created.tenantId, A)
    assert.equal((await previews.findById(ctx(A), "pv"))?.tenantId, A)
    assert.equal(await previews.findById(ctx(B), "pv"), null)
    assert.equal((await previews.findByWorkUnitId(ctx(A), "wuP")).length, 1)
    assert.equal((await previews.findByWorkUnitId(ctx(B), "wuP")).length, 0)
  })
}
