import test from "node:test"
import assert from "node:assert/strict"
import { resolveRepositories, resetInMemoryReposForTests } from "../app/lib/persistence/repositoryResolver.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { InboxWorkUnitRow, WorkUnitFeedbackRow } from "../app/lib/persistence/types.ts"

const tenantId = "test-tenant" as TenantId
const ctx = { tenantId, db: null }
const now = new Date().toISOString()
const mutableProcessEnv = process.env as Record<string, string | undefined>

function restoreNodeEnv(nodeEnv: string | undefined): void {
  if (nodeEnv === undefined) delete mutableProcessEnv.NODE_ENV
  else mutableProcessEnv.NODE_ENV = nodeEnv
}

// ─── Repository Resolver ────────────────────────────────────────

test("in-memory bundle exposes all 7 repos", async () => {
  const envBackup = process.env.NODE_ENV
  try {
    mutableProcessEnv.NODE_ENV = "development"
    const result = await resolveRepositories(tenantId, {
      env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.ok(result.bundle.workUnits)
    assert.ok(result.bundle.workUnitFeedback)
    assert.ok(result.bundle.integrationConnections)
    assert.ok(result.bundle.auditLogs)
    assert.ok(result.bundle.usage)
    assert.ok(result.bundle.actionPreviews)
    assert.ok(result.bundle.approvalRecords)
  } finally {
    restoreNodeEnv(envBackup)
  }
})

test("production blocks in-memory even with flag", async () => {
  const envBackup = process.env.NODE_ENV
  try {
    mutableProcessEnv.NODE_ENV = "production"
    const result = await resolveRepositories(tenantId, {
      env: { NODE_ENV: "production", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
    })
    assert.equal(result.ok, false)
  } finally {
    restoreNodeEnv(envBackup)
  }
})

// ─── WorkUnit Repo ──────────────────────────────────────────────

test("workUnit repo create + findById", async () => {
  resetInMemoryReposForTests()
  const envBackup = process.env.NODE_ENV
  try {
    mutableProcessEnv.NODE_ENV = "development"
    const result = await resolveRepositories(tenantId, {
      env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return

    const row: InboxWorkUnitRow = {
      id: "wu-test", tenantId, sourceSignalId: "signal:1", title: "Test", kind: "review_waiting",
      priority: "high", sourceProvider: "github", reason: "Needs review", evidence: "PR review requested",
      nextAction: "Review today", sourceUrl: "https://example.com", repository: "acme/api",
      status: "open", createdAt: now, updatedAt: now,
    }
    await result.bundle.workUnits.upsert(ctx, row)
    const found = await result.bundle.workUnits.findById(ctx, "wu-test")
    assert.ok(found)
    assert.equal(found!.title, "Test")
  } finally {
    restoreNodeEnv(envBackup)
  }
})

// ─── Feedback Repo ─────────────────────────────────────────────

test("feedback repo create + findByWorkUnitId", async () => {
  resetInMemoryReposForTests()
  const envBackup = process.env.NODE_ENV
  try {
    mutableProcessEnv.NODE_ENV = "development"
    const result = await resolveRepositories(tenantId, {
      env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return

    // Feedback must reference a same-tenant WorkUnit (enforced at the bundle boundary).
    await result.bundle.workUnits.upsert(ctx, {
      id: "wu-test", tenantId, title: "t", kind: "task", priority: "medium", sourceProvider: "mock",
      reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: now, updatedAt: now,
    })
    const fb: WorkUnitFeedbackRow = {
      id: "fb-1", tenantId, workUnitId: "wu-test", feedback: "useful",
      actorUserId: "user-1", createdAt: now,
    }
    await result.bundle.workUnitFeedback.create(ctx, fb)
    const list = await result.bundle.workUnitFeedback.findByWorkUnitId(ctx, "wu-test")
    assert.equal(list.length, 1)
    assert.equal(list[0].feedback, "useful")
  } finally {
    restoreNodeEnv(envBackup)
  }
})

// ─── Integration Connection Repo ────────────────────────────────

test("integration connection repo upsert + findByProvider", async () => {
  resetInMemoryReposForTests()
  const envBackup = process.env.NODE_ENV
  try {
    mutableProcessEnv.NODE_ENV = "development"
    const result = await resolveRepositories(tenantId, {
      env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return

    await result.bundle.integrationConnections.upsert(ctx, {
      id: "conn-gh", tenantId, provider: "github", status: "fake", mode: "fake",
      createdAt: now, updatedAt: now,
    })
    const conn = await result.bundle.integrationConnections.findByProvider(ctx, "github")
    assert.ok(conn)
    assert.equal(conn!.status, "fake")
  } finally {
    restoreNodeEnv(envBackup)
  }
})

// ─── Audit Log Repo ────────────────────────────────────────────

test("audit log repo append + listRecent", async () => {
  resetInMemoryReposForTests()
  const envBackup = process.env.NODE_ENV
  try {
    mutableProcessEnv.NODE_ENV = "development"
    const result = await resolveRepositories(tenantId, {
      env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return

    await result.bundle.auditLogs.append(ctx, {
      id: "audit-1", tenantId, eventKind: "workunit_created",
      workUnitId: "wu-test", occurredAt: now,
    })
    const list = await result.bundle.auditLogs.listRecent(ctx, 10)
    assert.ok(list.length > 0)
    assert.equal(list[0].eventKind, "workunit_created")
  } finally {
    restoreNodeEnv(envBackup)
  }
})

// ─── Usage Repo ────────────────────────────────────────────────

test("usage repo recordEvent + getCurrentUsage", async () => {
  resetInMemoryReposForTests()
  const envBackup = process.env.NODE_ENV
  try {
    mutableProcessEnv.NODE_ENV = "development"
    const result = await resolveRepositories(tenantId, {
      env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
    })
    assert.equal(result.ok, true)
    if (!result.ok) return

    await result.bundle.usage.recordEvent(ctx, {
      id: "usage-1", tenantId, eventType: "workunit_generated", quantity: 3, createdAt: now,
    })
    const total = await result.bundle.usage.getCurrentUsage(ctx, tenantId as string, "workunit_generated")
    assert.equal(total, 3)
  } finally {
    restoreNodeEnv(envBackup)
  }
})
