/**
 * Blocker 2 (P0-PERSIST-014): tenant-local parent relationships.
 *
 * Even though object IDs are GLOBALLY unique across the shared tenant D1, a
 * tenant-scoped child may reference ONLY parents owned by the same ctx.tenantId.
 * Enforcement lives at the persistence-SERVICE boundary (the repository bundle),
 * proven here with REAL node:sqlite over the committed migration schema — never
 * FakeD1. A foreign-tenant parent and a missing parent fail IDENTICALLY, with an
 * opaque typed error that discloses no tenant id or parent data.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { SqliteD1Database, TENANT_DB_MIGRATIONS } from "./helpers/sqliteD1.ts"
import { resolveLocalRepositories, type TenantRepositoryBundle } from "../app/lib/persistence/repositoryResolver.ts"
import { D1ActionPreviewRepository } from "../app/lib/persistence/d1/actionPreviewRepository.ts"
import { D1RepositoryError } from "../app/lib/persistence/d1/types.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"

const A = "tenant-a" as TenantId
const B = "tenant-b" as TenantId
const NOW = "2026-01-01T00:00:00.000Z"
const FUTURE = "2026-01-01T01:00:00.000Z"

async function sharedBundles(): Promise<{ db: SqliteD1Database; a: TenantRepositoryBundle; b: TenantRepositoryBundle }> {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS, foreignKeys: true })
  const a = await resolveLocalRepositories(A, { persistence: { mode: "d1", TENANT_DB_DEFAULT: db }, allowDirectBinding: true })
  const b = await resolveLocalRepositories(B, { persistence: { mode: "d1", TENANT_DB_DEFAULT: db }, allowDirectBinding: true })
  if (!a.ok || !b.ok) throw new Error("bundle failed")
  return { db, a: a.bundle, b: b.bundle }
}

const wuRow = (id: string, tenantId: TenantId, title = "t") => ({
  id, tenantId, title, kind: "task", priority: "medium", sourceProvider: "mock",
  reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: NOW, updatedAt: NOW,
})
const pvRow = (id: string, tenantId: TenantId, workUnitId: string, over: Partial<{ actionType: string; targetHash: string; payloadHash: string }> = {}) => ({
  id, tenantId, workUnitId, actionType: over.actionType ?? "slack_reply", targetPreview: "{}", payloadPreview: "{}",
  requiresApproval: 1, status: "preview", targetHash: over.targetHash ?? "h1", payloadHash: over.payloadHash ?? "h2", createdAt: NOW, expiresAt: FUTURE,
})
const apprRow = (id: string, tenantId: TenantId, workUnitId: string, actionPreviewId: string, over: Partial<{ actionType: string; targetHash: string; payloadHash: string }> = {}) => ({
  id, tenantId, workUnitId, actionPreviewId, actionType: over.actionType ?? "slack_reply",
  targetHash: over.targetHash ?? "h1", payloadHash: over.payloadHash ?? "h2", status: "approved" as const, createdAt: NOW, expiresAt: FUTURE,
})
const fbRow = (id: string, tenantId: TenantId, workUnitId: string) => ({ id, tenantId, workUnitId, feedback: "useful", actorUserId: "u", createdAt: NOW })
const isParentViolation = (e: unknown) => e instanceof D1RepositoryError && (e as Error).message === "parent_boundary_violation"

// ─── 1–9. WorkUnit Feedback parent ownership ────────────────────

test("1-9. cross-tenant / missing-parent feedback fails closed identically; same-tenant succeeds", async () => {
  const { db, a, b } = await sharedBundles()
  // 1. tenant A creates WorkUnit wu-a.
  await a.workUnits.create(a.ctx, wuRow("wu-a", A, "A-secret"))
  const before = db.rawRow("SELECT * FROM work_units WHERE id = ?", "wu-a")

  // 2-3. tenant B feedback referencing wu-a → opaque typed failure.
  let foreignErr: unknown
  await assert.rejects(() => b.workUnitFeedback.create(b.ctx, fbRow("fb-b", B, "wu-a")), (e: unknown) => { foreignErr = e; return isParentViolation(e) })

  // 6. a MISSING parent fails identically in shape.
  let missingErr: unknown
  await assert.rejects(() => b.workUnitFeedback.create(b.ctx, fbRow("fb-b2", B, "does-not-exist")), (e: unknown) => { missingErr = e; return isParentViolation(e) })
  assert.deepEqual(
    { name: (foreignErr as Error).name, message: (foreignErr as Error).message },
    { name: (missingErr as Error).name, message: (missingErr as Error).message },
  )

  // 7. no tenant id / parent data appears in the error.
  for (const err of [foreignErr, missingErr]) {
    const serialized = JSON.stringify({ name: (err as Error).name, message: (err as Error).message })
    for (const secret of ["tenant-a", "tenant-b", "wu-a", "A-secret"]) assert.equal(serialized.includes(secret), false)
  }

  // 4. tenant A's WorkUnit remains byte-equivalent.
  assert.deepEqual(db.rawRow("SELECT * FROM work_units WHERE id = ?", "wu-a"), before)
  // 5. no feedback row inserted for tenant B.
  assert.equal(db.rawRow("SELECT * FROM workunit_feedback WHERE id = ?", "fb-b"), null)
  assert.deepEqual(await b.workUnitFeedback.findByWorkUnitId(b.ctx, "wu-a"), [])

  // 8. tenant A can create feedback for wu-a.
  await a.workUnitFeedback.create(a.ctx, fbRow("fb-a", A, "wu-a"))
  assert.deepEqual((await a.workUnitFeedback.findByWorkUnitId(a.ctx, "wu-a")).map((f) => f.id), ["fb-a"])

  // 9. tenant B can create feedback for its OWN WorkUnit.
  await b.workUnits.create(b.ctx, wuRow("wu-b", B))
  await b.workUnitFeedback.create(b.ctx, fbRow("fb-bb", B, "wu-b"))
  assert.deepEqual((await b.workUnitFeedback.findByWorkUnitId(b.ctx, "wu-b")).map((f) => f.id), ["fb-bb"])
  db.close()
})

// ─── 10. ActionPreview parent ownership ─────────────────────────

test("10. ActionPreview cannot reference another tenant's WorkUnit", async () => {
  const { db, a, b } = await sharedBundles()
  await a.workUnits.create(a.ctx, wuRow("wu-a", A))
  await assert.rejects(() => b.actionPreviews.create(b.ctx, pvRow("pv-b", B, "wu-a")), isParentViolation)
  // Missing parent fails identically.
  await assert.rejects(() => b.actionPreviews.create(b.ctx, pvRow("pv-b2", B, "missing")), isParentViolation)
  // Same-tenant preview succeeds.
  await b.workUnits.create(b.ctx, wuRow("wu-b", B))
  const created = await b.actionPreviews.create(b.ctx, pvRow("pv-b", B, "wu-b"))
  assert.equal(created.tenantId, B)
  db.close()
})

// ─── 11. Approval parent ownership ──────────────────────────────

test("11. Approval cannot reference another tenant's Preview or WorkUnit", async () => {
  const { db, a, b } = await sharedBundles()
  // Tenant A: wu-a + pv-a. Tenant B: wu-b + pv-b.
  await a.workUnits.create(a.ctx, wuRow("wu-a", A))
  await a.actionPreviews.create(a.ctx, pvRow("pv-a", A, "wu-a"))
  await b.workUnits.create(b.ctx, wuRow("wu-b", B))
  await b.actionPreviews.create(b.ctx, pvRow("pv-b", B, "wu-b"))

  // B approval referencing A's preview → violation (preview not under B).
  await assert.rejects(() => b.approvalRecords.create(b.ctx, apprRow("ap1", B, "wu-a", "pv-a")), isParentViolation)
  // B approval referencing A's WorkUnit (with B's own preview id but wrong wu) → violation.
  await assert.rejects(() => b.approvalRecords.create(b.ctx, apprRow("ap2", B, "wu-a", "pv-b")), isParentViolation)
  // Same-tenant, matching preview → succeeds.
  const ok = await b.approvalRecords.create(b.ctx, apprRow("ap-ok", B, "wu-b", "pv-b"))
  assert.equal(ok.tenantId, B)
  db.close()
})

test("11b. Approval verifies WorkUnit ownership even when the Preview references a foreign WorkUnit", async () => {
  const { db, a, b } = await sharedBundles()
  await a.workUnits.create(a.ctx, wuRow("wu-a", A)) // A owns wu-a
  // Directly seed a preview UNDER TENANT B (raw repo, bypassing preview enforcement)
  // that points at A's WorkUnit — a corrupted/foreign relationship the Approval
  // create must still reject via its own WorkUnit-ownership check.
  await new D1ActionPreviewRepository(db).create(b.ctx, pvRow("pv-x", B, "wu-a"))
  await assert.rejects(() => b.approvalRecords.create(b.ctx, apprRow("ap", B, "wu-a", "pv-x")), isParentViolation)
  db.close()
})

// ─── 12. Approval cannot substitute the WorkUnit/Preview relationship ─

test("12. Approval cannot combine a same-tenant Preview with a substituted WorkUnit", async () => {
  const { db, a } = await sharedBundles()
  await a.workUnits.create(a.ctx, wuRow("wu-a", A))
  await a.workUnits.create(a.ctx, wuRow("wu-a2", A))
  await a.actionPreviews.create(a.ctx, pvRow("pv-a", A, "wu-a")) // preview belongs to wu-a
  // Approval references pv-a but claims wu-a2 → preview.work_unit_id mismatch.
  await assert.rejects(() => a.approvalRecords.create(a.ctx, apprRow("ap", A, "wu-a2", "pv-a")), isParentViolation)
  // Approval references pv-a with a substituted target/payload hash → mismatch.
  await assert.rejects(() => a.approvalRecords.create(a.ctx, apprRow("ap3", A, "wu-a", "pv-a", { targetHash: "SUBSTITUTED" })), isParentViolation)
  db.close()
})

// ─── 13. foreign-parent attempts leave no audit / usage success ──

test("13. a foreign-parent attempt records no audit or usage success rows", async () => {
  const { db, a, b } = await sharedBundles()
  await a.workUnits.create(a.ctx, wuRow("wu-a", A))
  await assert.rejects(() => b.workUnitFeedback.create(b.ctx, fbRow("fb-b", B, "wu-a")), isParentViolation)
  await assert.rejects(() => b.actionPreviews.create(b.ctx, pvRow("pv-b", B, "wu-a")), isParentViolation)
  // The rejected creates never touched the child tables; and no audit/usage rows
  // were written for tenant B as a side effect of the failed attempts.
  assert.equal(db.rawRow("SELECT * FROM workunit_feedback WHERE id = ?", "fb-b"), null)
  assert.equal(db.rawRow("SELECT * FROM action_previews WHERE id = ?", "pv-b"), null)
  assert.deepEqual(await b.auditLogs.listRecent(b.ctx, 50), [])
  assert.equal(await b.usage.getCurrentUsage(b.ctx, B, "feedback_create"), 0)
  db.close()
})
