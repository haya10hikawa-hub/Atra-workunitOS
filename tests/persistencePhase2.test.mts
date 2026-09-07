import test from "node:test"
import assert from "node:assert/strict"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { D1WorkUnitRepository } from "../app/lib/persistence/d1/workUnitRepository.ts"
import { D1WorkUnitFeedbackRepository } from "../app/lib/persistence/d1/workUnitFeedbackRepository.ts"
import { D1IntegrationConnectionRepository } from "../app/lib/persistence/d1/integrationConnectionRepository.ts"
import { D1AuditLogRepository } from "../app/lib/persistence/d1/auditLogRepository.ts"
import { D1UsageRepository } from "../app/lib/persistence/d1/usageRepository.ts"
import type { TenantDbContext, InboxWorkUnitRow, AuditLogRow } from "../app/lib/persistence/types.ts"

const ctx: TenantDbContext = { tenantId: "test-tenant" as InboxWorkUnitRow["tenantId"], db: null }
const now = new Date().toISOString()
const today = now.slice(0, 10)

function id(prefix: string) { return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` }

// ─── WorkUnit Repository ────────────────────────────────────────

test("D1WorkUnitRepository: create + findById", async () => {
  const db = new FakeD1Database()
  const repo = new D1WorkUnitRepository(db)
  const row: InboxWorkUnitRow = {
    id: id("wu"), tenantId: ctx.tenantId, sourceSignalId: "signal:1", title: "Test",
    kind: "review_waiting", priority: "high", sourceProvider: "github",
    reason: "Needs review", evidence: "PR requested", nextAction: "Review",
    repository: "acme/api", status: "open", createdAt: now, updatedAt: now,
  }
  await repo.create(ctx, row)
  const found = await repo.findById(ctx, row.id)
  assert.ok(found)
  assert.equal(found.title, "Test")
})

test("D1WorkUnitRepository: listRecent returns items", async () => {
  const db = new FakeD1Database()
  const repo = new D1WorkUnitRepository(db)
  const row: InboxWorkUnitRow = {
    id: id("wu2"), tenantId: ctx.tenantId, sourceSignalId: "signal:2", title: "Recent",
    kind: "assigned_issue", priority: "medium", sourceProvider: "github",
    reason: "Assigned", evidence: "Assigned issue", nextAction: "Triage",
    status: "open", createdAt: now, updatedAt: now,
  }
  await repo.create(ctx, row)
  const list = await repo.listRecent(ctx, 10)
  assert.ok(list.length > 0)
})

test("D1WorkUnitRepository: upsert avoids duplicate rows", async () => {
  const db = new FakeD1Database()
  const repo = new D1WorkUnitRepository(db)
  const row: InboxWorkUnitRow = {
    id: "wu-upsert", tenantId: ctx.tenantId, sourceSignalId: "signal:upsert", title: "Upsert",
    kind: "review_waiting", priority: "high", sourceProvider: "github",
    reason: "Initial", evidence: "PR review", nextAction: "Review",
    status: "open", createdAt: now, updatedAt: now,
  }
  await repo.upsert(ctx, row)
  await repo.upsert(ctx, { ...row, reason: "Updated" })
  const list = await repo.listRecent(ctx, 10)
  assert.equal(list.filter((item) => item.id === "wu-upsert").length, 1)
  assert.equal((await repo.findById(ctx, "wu-upsert"))?.reason, "Updated")
})

// ─── Feedback Repository ────────────────────────────────────────

test("D1WorkUnitFeedbackRepository: create + findByWorkUnitId", async () => {
  const db = new FakeD1Database()
  const repo = new D1WorkUnitFeedbackRepository(db)
  const wuId = id("wu-fb")
  await repo.create(ctx, { id: id("fb"), tenantId: ctx.tenantId, workUnitId: wuId, feedback: "useful", createdAt: now })
  const list = await repo.findByWorkUnitId(ctx, wuId)
  assert.equal(list.length, 1)
  assert.equal(list[0].feedback, "useful")
})

// ─── Integration Connection Repository ──────────────────────────

test("D1IntegrationConnectionRepository: upsert + findByProvider", async () => {
  const db = new FakeD1Database()
  const repo = new D1IntegrationConnectionRepository(db)
  await repo.upsert(ctx, {
    id: id("conn"), tenantId: ctx.tenantId, provider: "github",
    status: "connected", mode: "fake", createdAt: now, updatedAt: now,
  })
  const found = await repo.findByProvider(ctx, "github")
  assert.ok(found)
  assert.equal(found.status, "connected")
})

test("D1IntegrationConnectionRepository: updateStatus", async () => {
  const db = new FakeD1Database()
  const repo = new D1IntegrationConnectionRepository(db)
  await repo.upsert(ctx, {
    id: id("conn2"), tenantId: ctx.tenantId, provider: "slack",
    status: "connected", mode: "real", createdAt: now, updatedAt: now,
  })
  await repo.updateStatus(ctx, "slack", "disconnected", { code: "auth_error", message: "Token expired" })
  const found = await repo.findByProvider(ctx, "slack")
  assert.equal(found?.status, "disconnected")
  assert.equal(found?.lastErrorCode, "auth_error")
})

// ─── Audit Log Repository ───────────────────────────────────────

test("D1AuditLogRepository: append + listRecent", async () => {
  const db = new FakeD1Database()
  const repo = new D1AuditLogRepository(db)
  const row: AuditLogRow = {
    id: id("audit"), tenantId: ctx.tenantId, eventKind: "workunit_created",
    actorId: "user-1" as NonNullable<AuditLogRow["actorId"]>, workUnitId: id("wu"), occurredAt: now,
  }
  await repo.append(ctx, row)
  const list = await repo.listRecent(ctx, 10)
  assert.ok(list.length > 0)
  assert.equal(list[0].eventKind, "workunit_created")
})

test("D1AuditLogRepository: findByWorkUnitId", async () => {
  const db = new FakeD1Database()
  const repo = new D1AuditLogRepository(db)
  const wuId = id("wu-audit")
  await repo.append(ctx, {
    id: id("audit2"), tenantId: ctx.tenantId, eventKind: "preview_created",
    workUnitId: wuId, occurredAt: now,
  })
  const list = await repo.findByWorkUnitId(ctx, wuId)
  assert.ok(list.length > 0)
})

// ─── Usage Repository ───────────────────────────────────────────

test("D1UsageRepository: recordEvent + getCurrentUsage", async () => {
  const db = new FakeD1Database()
  const repo = new D1UsageRepository(db)
  await repo.recordEvent(ctx, {
    id: id("usage"), tenantId: ctx.tenantId, eventType: "workunit_generated",
    quantity: 3, createdAt: now,
  })
  const usage = await repo.getCurrentUsage(ctx, ctx.tenantId as string, "workunit_generated")
  assert.equal(usage, 3)
})

test("D1UsageRepository: daily summary accumulates", async () => {
  const db = new FakeD1Database()
  const repo = new D1UsageRepository(db)
  await repo.recordEvent(ctx, { id: id("us1"), tenantId: ctx.tenantId, eventType: "preview_created", quantity: 1, createdAt: now })
  await repo.recordEvent(ctx, { id: id("us2"), tenantId: ctx.tenantId, eventType: "preview_created", quantity: 2, createdAt: now })
  const summary = await repo.getDailySummary(ctx, ctx.tenantId as string, today)
  assert.ok(summary.length > 0)
})
