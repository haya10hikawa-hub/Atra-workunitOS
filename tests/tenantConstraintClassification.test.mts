/**
 * Blocker 3 (P0-PERSIST-014): precise constraint-failure classification.
 *
 * ONLY a genuine UNIQUE / PRIMARY KEY collision is an `object_id_conflict`.
 * FOREIGN KEY, CHECK, NOT NULL, and unknown driver errors map to `write_failed`.
 * The generic "constraint failed" substring must NOT be treated as a global-ID
 * collision. No typed error carries the raw driver message, table/column names,
 * SQL, tenant id, or row content. Proven with REAL node:sqlite — never FakeD1.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { SqliteD1Database, TENANT_DB_MIGRATIONS } from "./helpers/sqliteD1.ts"
import { D1WorkUnitRepository } from "../app/lib/persistence/d1/workUnitRepository.ts"
import { D1WorkUnitFeedbackRepository } from "../app/lib/persistence/d1/workUnitFeedbackRepository.ts"
import { D1ActionPreviewRepository } from "../app/lib/persistence/d1/actionPreviewRepository.ts"
import { isUniqueConstraintViolation, runInsertGuarded } from "../app/lib/persistence/d1/writeGuards.ts"
import { D1RepositoryError, type D1PreparedStatementLike } from "../app/lib/persistence/d1/types.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { TenantDbContext } from "../app/lib/persistence/types.ts"

const T = "tenant-a" as TenantId
const ctx: TenantDbContext = { tenantId: T, db: null }
const NOW = "2026-01-01T00:00:00.000Z"
const wuRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, tenantId: T, title: "t", kind: "task", priority: "medium", sourceProvider: "mock",
  reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: NOW, updatedAt: NOW, ...over,
})
const errName = (e: unknown) => (e as Error).name
const errMsg = (e: unknown) => (e as Error).message

// ─── Unit: the matcher is precise ───────────────────────────────

test("isUniqueConstraintViolation matches ONLY UNIQUE / PRIMARY KEY failures", () => {
  assert.equal(isUniqueConstraintViolation(new Error("UNIQUE constraint failed: work_units.id")), true)
  assert.equal(isUniqueConstraintViolation(new Error("PRIMARY KEY constraint failed")), true)
  // NOT a global-ID collision:
  assert.equal(isUniqueConstraintViolation(new Error("FOREIGN KEY constraint failed")), false)
  assert.equal(isUniqueConstraintViolation(new Error("CHECK constraint failed: action_previews")), false)
  assert.equal(isUniqueConstraintViolation(new Error("NOT NULL constraint failed: work_units.title")), false)
  assert.equal(isUniqueConstraintViolation(new Error("some unrelated driver failure")), false)
  // The bare "constraint failed" phrase must NOT be treated as a collision.
  assert.equal(isUniqueConstraintViolation(new Error("constraint failed")), false)
})

// ─── Real SQLite: each constraint class maps correctly ──────────

test("1. duplicate primary ID maps to object_id_conflict", async () => {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS })
  const repo = new D1WorkUnitRepository(db)
  await repo.create(ctx, wuRow("dup"))
  let err: unknown
  await assert.rejects(() => repo.create(ctx, wuRow("dup")), (e: unknown) => { err = e; return e instanceof D1RepositoryError })
  assert.equal(errMsg(err), "object_id_conflict")
  db.close()
})

test("2. foreign-key violation does NOT map to object_id_conflict (write_failed)", async () => {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS, foreignKeys: true })
  const feedback = new D1WorkUnitFeedbackRepository(db)
  // workunit_feedback.work_unit_id REFERENCES work_units(id); the parent is absent.
  let err: unknown
  await assert.rejects(
    () => feedback.create(ctx, { id: "fb", tenantId: T, workUnitId: "no-such-workunit", feedback: "u", actorUserId: "u", createdAt: NOW }),
    (e: unknown) => { err = e; return e instanceof D1RepositoryError },
  )
  assert.equal(errMsg(err), "write_failed")
  assert.notEqual(errMsg(err), "object_id_conflict")
  db.close()
})

test("3. CHECK constraint failure does NOT map to object_id_conflict (write_failed)", async () => {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS })
  const previews = new D1ActionPreviewRepository(db)
  // action_previews.action_type CHECK (action_type IN (...)); this value is not allowed.
  let err: unknown
  await assert.rejects(
    () => previews.create(ctx, {
      id: "pv", tenantId: T, workUnitId: "wu", actionType: "totally_invalid_type",
      targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
      targetHash: "h1", payloadHash: "h2", createdAt: NOW,
    }),
    (e: unknown) => { err = e; return e instanceof D1RepositoryError },
  )
  assert.equal(errMsg(err), "write_failed")
  db.close()
})

test("4. NOT NULL failure does NOT map to object_id_conflict (write_failed)", async () => {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS })
  const repo = new D1WorkUnitRepository(db)
  let err: unknown
  await assert.rejects(
    // title is NOT NULL in the schema.
    () => repo.create(ctx, wuRow("wu", { title: null }) as never),
    (e: unknown) => { err = e; return e instanceof D1RepositoryError },
  )
  assert.equal(errMsg(err), "write_failed")
  db.close()
})

test("5. an unknown driver error maps to write_failed", async () => {
  const stmt: D1PreparedStatementLike = {
    bind() { return stmt },
    async first() { return null },
    async all() { return { results: [] } },
    async run() { throw new Error("ECONN reset: some opaque driver failure") },
  }
  let err: unknown
  await assert.rejects(() => runInsertGuarded(stmt), (e: unknown) => { err = e; return e instanceof D1RepositoryError })
  assert.equal(errMsg(err), "write_failed")
})

test("6. no typed error contains table/column names, SQL, tenant id, or row content", async () => {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS, foreignKeys: true })
  const wu = new D1WorkUnitRepository(db)
  const fb = new D1WorkUnitFeedbackRepository(db)
  const errors: unknown[] = []
  await wu.create(ctx, wuRow("dup", { title: "SECRET-TITLE" }))
  await assert.rejects(() => wu.create(ctx, wuRow("dup")), (e) => { errors.push(e); return true })
  await assert.rejects(() => fb.create(ctx, { id: "fb", tenantId: T, workUnitId: "missing", feedback: "u", createdAt: NOW }), (e) => { errors.push(e); return true })

  for (const e of errors) {
    assert.ok(e instanceof D1RepositoryError)
    assert.ok([errMsg(e)].every((m) => m === "object_id_conflict" || m === "write_failed"), `typed message only: ${errMsg(e)}`)
    const serialized = JSON.stringify({ name: errName(e), message: errMsg(e) })
    for (const leak of ["work_units", "workunit_feedback", "action_previews", "tenant_id", "tenant-a", "SECRET-TITLE", "UNIQUE", "FOREIGN KEY", "constraint", "INSERT", "SELECT", ".id", ".title"]) {
      assert.equal(serialized.includes(leak), false, `error must not disclose ${leak}`)
    }
  }
  db.close()
})
