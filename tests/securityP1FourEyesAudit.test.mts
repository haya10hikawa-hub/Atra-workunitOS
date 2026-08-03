/**
 * Security P1 — four-eyes approval + persistent tenant-scoped audit logging.
 *
 * Proves the load-bearing invariants:
 *  - creator identity is server-set and persisted (D1 + in-memory parity);
 *  - self-approval (and missing-creator) is rejected fail-closed (403);
 *  - a different approver is allowed (RBAC unchanged);
 *  - client cannot supply creator identity;
 *  - audit events persist tenant-scoped, redacted, and fail-open.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { POST as createPreview } from "../app/api/workunit/[id]/action-preview/route.ts"
import { POST as decideApproval } from "../app/api/workunit/[id]/approval/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { hasClientOwnedFields } from "../app/lib/security/routeGuards.ts"
import { toSafeAuditMetadata, recordAuditEvent } from "../app/lib/security/auditPersistence.ts"
import { createInMemoryAuditLogRepository } from "../app/lib/persistence/inMemoryRepositories.ts"
import { SAFE_ERROR_CODES } from "../app/lib/security/safeErrors.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { TenantDbContext } from "../app/lib/persistence/types.ts"

const tenantId = "dev-tenant" as TenantId
const workUnitId = "wu:p1-four-eyes"

async function withPersistence(fn: (db: FakeD1Database) => Promise<void>) {
  const db = new FakeD1Database()
  const backup = { ...process.env }
  try {
    process.env.NODE_ENV = "development"
    process.env.AUTH_ADAPTER = "dev"
    process.env.ALLOW_DEV_SESSION = "true"
    process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"
    process.env.PERSISTENCE_MODE = "d1"
    delete process.env.DEV_SESSION_ROLE
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    await fn(db)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
    resetTestRuntimeEnvForRequest()
  }
}

function previewRequest(body: unknown): Request {
  return new Request(`http://localhost:3000/api/workunit/${workUnitId}/action-preview`, {
    method: "POST",
    headers: { Host: "localhost:3000", "content-type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  })
}

function approvalRequest(body: unknown): Request {
  return new Request(`http://localhost:3000/api/workunit/${workUnitId}/approval`, {
    method: "POST",
    headers: { Host: "localhost:3000", "content-type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  })
}

async function bundle() {
  const repos = await resolveRouteRepositories(tenantId)
  assert.equal(repos.ok, true)
  if (!repos.ok) throw new Error("repos unavailable")
  return repos.bundle
}

async function seedWorkUnit() {
  const b = await bundle()
  await b.workUnits.create(b.ctx, {
    id: workUnitId, tenantId, title: "P1", kind: "review_waiting", priority: "high",
    sourceProvider: "github", reason: "r", evidence: "e", nextAction: "n",
    status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as Parameters<typeof b.workUnits.create>[1])
}

async function seedPreview(id: string, creatorUserId: string | undefined) {
  const b = await bundle()
  await b.actionPreviews.create(b.ctx, {
    id, tenantId, workUnitId, actionType: "internal_task",
    targetPreview: JSON.stringify({ note: "ok" }), payloadPreview: JSON.stringify({ note: "ok" }),
    requiresApproval: 1, status: "preview", targetHash: "t", payloadHash: "p",
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    creatorUserId: creatorUserId as TenantDbContext["tenantId"] | undefined,
  } as Parameters<typeof b.actionPreviews.create>[1])
}

// ─── P1-c: Four-eyes route behavior ─────────────────────────────

test("1. action-preview stores creator from session.userId", async () => {
  await withPersistence(async () => {
    await seedWorkUnit()
    const res = await createPreview(previewRequest({ actionType: "internal_task", target: { a: 1 }, payload: { b: 2 } }), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 201)
    const body = await res.json() as { preview: { id: string } }
    const b = await bundle()
    const stored = await b.actionPreviews.findById(b.ctx, body.preview.id)
    assert.equal(stored?.creatorUserId, "dev-user")
  })
})

test("2. client-supplied creatorUserId is rejected (400)", async () => {
  await withPersistence(async () => {
    await seedWorkUnit()
    for (const field of ["creatorUserId", "createdByUserId", "created_by_user_id", "requestedByUserId"]) {
      const res = await createPreview(previewRequest({ actionType: "internal_task", target: { a: 1 }, payload: { b: 2 }, [field]: "attacker" }), { params: Promise.resolve({ id: workUnitId }) })
      assert.equal(res.status, 400, `field ${field} must be rejected`)
    }
  })
})

test("3. self-approval returns 403 self_approval_forbidden", async () => {
  await withPersistence(async () => {
    await seedWorkUnit()
    const created = await createPreview(previewRequest({ actionType: "internal_task", target: { a: 1 }, payload: { b: 2 } }), { params: Promise.resolve({ id: workUnitId }) })
    const { preview } = await created.json() as { preview: { id: string } }
    const res = await decideApproval(approvalRequest({ actionPreviewId: preview.id, decision: "approve" }), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 403)
    assert.equal((await res.json() as { error: string }).error, "self_approval_forbidden")
  })
})

test("4. different approver succeeds (creator != session.userId); editor RBAC unchanged", async () => {
  await withPersistence(async () => {
    await seedWorkUnit()
    await seedPreview("preview:other-creator", "another-user")
    const res = await decideApproval(approvalRequest({ actionPreviewId: "preview:other-creator", decision: "approve" }), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 201)
    assert.equal((await res.json() as { approval: { status: string } }).approval.status, "approved")
  })
})

test("5. missing creator fails closed (403)", async () => {
  await withPersistence(async () => {
    await seedWorkUnit()
    await seedPreview("preview:no-creator", undefined)
    const res = await decideApproval(approvalRequest({ actionPreviewId: "preview:no-creator", decision: "approve" }), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 403)
    assert.equal((await res.json() as { error: string }).error, "self_approval_forbidden")
  })
})

test("6. double-submit on a decided preview is safe (409 conflict)", async () => {
  await withPersistence(async () => {
    await seedWorkUnit()
    await seedPreview("preview:race", "another-user")
    const first = await decideApproval(approvalRequest({ actionPreviewId: "preview:race", decision: "approve" }), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(first.status, 201)
    const second = await decideApproval(approvalRequest({ actionPreviewId: "preview:race", decision: "approve" }), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(second.status, 409)
  })
})

// ─── P1-a: persistence parity ───────────────────────────────────

test("7. in-memory action-preview creator round-trips + tenant-scoped", async () => {
  const backup = { ...process.env }
  try {
    process.env.NODE_ENV = "development"
    process.env.ALLOW_IN_MEMORY_PERSISTENCE = "true"
    delete process.env.PERSISTENCE_MODE
    const { resolveRepositories } = await import("../app/lib/persistence/repositoryResolver.ts")
    const a = await resolveRepositories("tenant-a" as TenantId)
    assert.equal(a.ok, true)
    if (!a.ok) return
    // A preview must reference a same-tenant WorkUnit (enforced at the bundle boundary).
    await a.bundle.workUnits.upsert(a.bundle.ctx, {
      id: "wu", tenantId: "tenant-a" as TenantId, title: "t", kind: "task", priority: "medium", sourceProvider: "mock",
      reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    await a.bundle.actionPreviews.create(a.bundle.ctx, {
      id: "p:mem", tenantId: "tenant-a" as TenantId, workUnitId: "wu", actionType: "internal_task",
      targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
      targetHash: "t", payloadHash: "p", createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), creatorUserId: "creator-1" as TenantId,
    } as Parameters<typeof a.bundle.actionPreviews.create>[1])
    const own = await a.bundle.actionPreviews.findById(a.bundle.ctx, "p:mem")
    assert.equal(own?.creatorUserId, "creator-1")
    const byWu = await a.bundle.actionPreviews.findByWorkUnitId(a.bundle.ctx, "wu")
    assert.equal(byWu.some((r) => r.creatorUserId === "creator-1"), true)
    // Cross-tenant lookup must not resolve.
    const b = await resolveRepositories("tenant-b" as TenantId)
    if (b.ok) assert.equal(await b.bundle.actionPreviews.findById(b.bundle.ctx, "p:mem"), null)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
    const { resetInMemoryReposForTests } = await import("../app/lib/persistence/repositoryResolver.ts")
    resetInMemoryReposForTests()
  }
})

test("8. D1 action-preview creator round-trips (FakeD1)", async () => {
  await withPersistence(async () => {
    const b = await bundle()
    // A preview must reference a same-tenant WorkUnit (enforced at the bundle boundary).
    await b.workUnits.upsert(b.ctx, {
      id: workUnitId, tenantId, title: "t", kind: "task", priority: "medium", sourceProvider: "mock",
      reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    await b.actionPreviews.create(b.ctx, {
      id: "p:d1", tenantId, workUnitId, actionType: "internal_task",
      targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
      targetHash: "t", payloadHash: "p", createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), creatorUserId: "d1-creator" as TenantId,
    } as Parameters<typeof b.actionPreviews.create>[1])
    const stored = await b.actionPreviews.findById(b.ctx, "p:d1")
    assert.equal(stored?.creatorUserId, "d1-creator")
  })
})

// ─── P1-b: client-owned field guard ─────────────────────────────

test("9. routeGuards rejects all creator/actor ownership field variants", () => {
  for (const f of ["creatorUserId", "creatoruserid", "createdByUserId", "createdbyuserid", "created_by_user_id", "requestedByUserId", "requested_by_user_id"]) {
    assert.equal(hasClientOwnedFields({ [f]: "x" }), true, f)
  }
  assert.equal(hasClientOwnedFields({ decision: "approve", actionPreviewId: "p" }), false)
})

// ─── P1-e/f: audit persistence + redaction ──────────────────────

test("10. recordAuditEvent persists a tenant-scoped row (fail-open, sanitized)", async () => {
  const repo = createInMemoryAuditLogRepository()
  const ctxA = { tenantId: "tenant-a" as TenantId, db: null } as TenantDbContext
  await recordAuditEvent(repo, ctxA, {
    kind: "action_preview_created", timestamp: new Date().toISOString(),
    requestId: "req\r\n-injected", actorId: "u1", workUnitId: "wu1", metadata: { actionPreviewId: "p1" },
  })
  const rows = await repo.listRecent(ctxA)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].eventKind, "action_preview_created")
  assert.equal(rows[0].actorId, "u1")
  assert.equal(/[ -]/.test(rows[0].requestId ?? ""), false, "request id sanitized")
  // Tenant-scoped: another tenant sees nothing.
  const ctxB = { tenantId: "tenant-b" as TenantId, db: null } as TenantDbContext
  assert.equal((await repo.listRecent(ctxB)).length, 0)
})

test("11. recordAuditEvent is fail-open when append throws", async () => {
  const throwingRepo = { append: async () => { throw new Error("db down") }, listRecent: async () => [], findByWorkUnitId: async () => [] } as Parameters<typeof recordAuditEvent>[0]
  await assert.doesNotReject(recordAuditEvent(throwingRepo, { tenantId, db: null } as TenantDbContext, {
    kind: "approval_created", timestamp: new Date().toISOString(), requestId: "r",
  }))
})

test("12. audit metadata redacts secrets/payloads/hashes; keeps allowlisted keys", () => {
  const json = toSafeAuditMetadata({
    actionPreviewId: "p1", actionType: "internal_task", decision: "approve",
    token: "sk-leak", secret: "x", authorization: "Bearer y", cookie: "c", password: "pw",
    rawPayload: { body: "raw" }, providerPayload: { to: "x" }, targetHash: "h", payloadHash: "h2",
    nested: { deep: "drop" },
  })
  const parsed = JSON.parse(json ?? "{}") as Record<string, unknown>
  assert.equal(parsed.actionPreviewId, "p1")
  assert.equal(parsed.actionType, "internal_task")
  assert.equal(parsed.decision, "approve")
  for (const dropped of ["token", "secret", "authorization", "cookie", "password", "rawPayload", "providerPayload", "targetHash", "payloadHash", "nested"]) {
    assert.equal(dropped in parsed, false, `${dropped} must be redacted`)
  }
})

test("13. audit metadata caps long strings", () => {
  const long = "a".repeat(5000)
  const json = toSafeAuditMetadata({ reason: long })
  const parsed = JSON.parse(json ?? "{}") as { reason?: string }
  assert.ok((parsed.reason?.length ?? 0) <= 256)
})

// ─── safe error model ───────────────────────────────────────────

test("14. self_approval_forbidden is a 403 safe error code", () => {
  assert.equal(SAFE_ERROR_CODES.self_approval_forbidden.status, 403)
})
