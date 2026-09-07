/**
 * Phase 6C: D1 repository invariant enforcement + tenant-boundary regression.
 *
 * Behavioral tests (against FakeD1) prove tenant-owned reads/writes fail closed on
 * wrong tenant and that the Phase 5B CAS / 5C binding / 5D JSON guarantees hold at
 * the repository boundary. Source-scan tests pin the Phase 5C/5D/5E/6A/6B guards.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { D1ApprovalRecordRepository } from "../app/lib/persistence/d1/approvalRecordRepository.ts"
import { D1ActionPreviewRepository } from "../app/lib/persistence/d1/actionPreviewRepository.ts"
import { D1WorkUnitRepository } from "../app/lib/persistence/d1/workUnitRepository.ts"
import { createApprovalPreview } from "../app/lib/security/actionApproval.ts"
import { approvalRecordDomainToRow } from "../app/lib/persistence/mappers.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { ActionApprovalRecord } from "../app/lib/domain/types.ts"
import type { ActionPreviewRow, ApprovalRecordRow, InboxWorkUnitRow, TenantDbContext } from "../app/lib/persistence/types.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"

const TA = "tenant-a" as TenantId
const TB = "tenant-b" as TenantId

function ctx(t: TenantId, db: FakeD1Database): TenantDbContext { return { tenantId: t, db } }

function approvalRow(over: Partial<ActionApprovalRecord> & { tenantId: TenantId }): ApprovalRecordRow {
  const rec = createApprovalPreview({
    tenantId: over.tenantId, workUnitId: over.workUnitId ?? "wu-1", actionPreviewId: over.actionPreviewId ?? "p1",
    actionType: "slack_reply", target: "#g", payload: { body: "x" },
    ttlMinutes: over.expiresAt ? undefined : 30,
  })
  return approvalRecordDomainToRow({ ...rec, status: "approved", ...over })
}

function previewRow(t: TenantId, over: Partial<ActionPreviewRow> = {}): ActionPreviewRow {
  return {
    id: "p1", tenantId: t, workUnitId: "wu-1", actionType: "slack_reply",
    targetPreview: JSON.stringify({ provider: "slack" }), payloadPreview: JSON.stringify({ body: "x" }),
    requiresApproval: 1, status: "preview", targetHash: "th", payloadHash: "ph",
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), ...over,
  }
}

function workUnitRow(t: TenantId, over: Partial<InboxWorkUnitRow> = {}): InboxWorkUnitRow {
  const now = new Date().toISOString()
  return {
    id: "wu-1", tenantId: t, title: "T", kind: "task", priority: "medium", sourceProvider: "slack",
    reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: now, updatedAt: now, ...over,
  }
}

// ─── ApprovalRecord tenant boundary (1-5) ───────────────────────

test("1 & 2. approval findById: correct tenant returns row, wrong tenant null", async () => {
  const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
  const r = approvalRow({ tenantId: TA }); await repo.create(ctx(TA, db), r)
  assert.ok(await repo.findById(ctx(TA, db), r.id))
  assert.equal(await repo.findById(ctx(TB, db), r.id), null)
})

test("3 & 4. approval findByPreviewId: correct tenant returns row, wrong tenant null", async () => {
  const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
  const r = approvalRow({ tenantId: TA, actionPreviewId: "pX" }); await repo.create(ctx(TA, db), r)
  assert.ok(await repo.findByPreviewId(ctx(TA, db), "pX"))
  assert.equal(await repo.findByPreviewId(ctx(TB, db), "pX"), null)
})

test("5. approval findByWorkUnitId returns only correct-tenant rows", async () => {
  const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
  await repo.create(ctx(TA, db), approvalRow({ tenantId: TA, workUnitId: "wuZ" }))
  assert.equal((await repo.findByWorkUnitId(ctx(TA, db), "wuZ")).length, 1)
  assert.equal((await repo.findByWorkUnitId(ctx(TB, db), "wuZ")).length, 0)
})

// ─── Approval updateStatus tenant boundary (6,7) ────────────────

test("6 & 7. approval updateStatus mutates correct tenant only, not wrong tenant", async () => {
  const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
  const r = approvalRow({ tenantId: TA }); await repo.create(ctx(TA, db), r)
  // wrong tenant: no mutation
  await repo.updateStatus(ctx(TB, db), r.id, "rejected")
  assert.equal((await repo.findById(ctx(TA, db), r.id))?.status, "approved")
  // correct tenant: mutates
  await repo.updateStatus(ctx(TA, db), r.id, "rejected")
  assert.equal((await repo.findById(ctx(TA, db), r.id))?.status, "rejected")
})

// ─── Approval markUsed CAS (8-13) ───────────────────────────────

test("8 & 9. markUsed succeeds for correct tenant, fails for wrong tenant", async () => {
  const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
  const r = approvalRow({ tenantId: TA }); await repo.create(ctx(TA, db), r)
  assert.equal(await repo.markUsed(ctx(TB, db), r.id, new Date().toISOString()), null)
  assert.ok(await repo.markUsed(ctx(TA, db), r.id, new Date().toISOString()))
})

test("10. markUsed fails for already-used row", async () => {
  const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
  const r = approvalRow({ tenantId: TA }); await repo.create(ctx(TA, db), r)
  await repo.markUsed(ctx(TA, db), r.id, new Date().toISOString())
  assert.equal(await repo.markUsed(ctx(TA, db), r.id, new Date().toISOString()), null)
})

test("11. markUsed fails for pending/rejected row", async () => {
  for (const status of ["pending", "rejected"] as const) {
    const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
    const r = approvalRow({ tenantId: TA, status }); await repo.create(ctx(TA, db), r)
    assert.equal(await repo.markUsed(ctx(TA, db), r.id, new Date().toISOString()), null, status)
  }
})

test("12. markUsed fails for expired row", async () => {
  const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
  const past = new Date(Date.now() - 60_000).toISOString()
  const r = approvalRow({ tenantId: TA, expiresAt: past }); await repo.create(ctx(TA, db), r)
  assert.equal(await repo.markUsed(ctx(TA, db), r.id, new Date().toISOString()), null)
})

test("13. concurrent markUsed yields exactly one success", async () => {
  const db = new FakeD1Database(); const repo = new D1ApprovalRecordRepository(db)
  const r = approvalRow({ tenantId: TA }); await repo.create(ctx(TA, db), r)
  const res = await Promise.all([
    repo.markUsed(ctx(TA, db), r.id, new Date().toISOString()),
    repo.markUsed(ctx(TA, db), r.id, new Date().toISOString()),
  ])
  assert.equal(res.filter((x) => x !== null).length, 1)
})

// ─── ActionPreview tenant boundary + malformed (14-17) ──────────

test("14 & 15. actionPreview findById: correct tenant row, wrong tenant null", async () => {
  const db = new FakeD1Database(); const repo = new D1ActionPreviewRepository(db)
  await repo.create(ctx(TA, db), previewRow(TA));
  assert.ok(await repo.findById(ctx(TA, db), "p1"))
  assert.equal(await repo.findById(ctx(TB, db), "p1"), null)
})

test("16. actionPreview findByWorkUnitId returns only correct-tenant rows", async () => {
  const db = new FakeD1Database(); const repo = new D1ActionPreviewRepository(db)
  await repo.create(ctx(TA, db), previewRow(TA))
  assert.equal((await repo.findByWorkUnitId(ctx(TA, db), "wu-1")).length, 1)
  assert.equal((await repo.findByWorkUnitId(ctx(TB, db), "wu-1")).length, 0)
})

test("17. actionPreview malformed JSON row remains fail-safe (null)", async () => {
  const db = new FakeD1Database(); const repo = new D1ActionPreviewRepository(db)
  db.seedRow("action_previews", {
    id: "bad", tenant_id: TA, work_unit_id: "wu-1", action_type: "slack_reply",
    target_preview: '{"x": NOT JSON', payload_preview: "{}", requires_approval: 1, status: "preview",
    target_hash: "th", payload_hash: "ph", created_at: new Date().toISOString(),
  })
  assert.equal(await repo.findById(ctx(TA, db), "bad"), null)
})

// ─── WorkUnit tenant boundary (18) — proves the Phase 6C fix ─────

test("18a. workUnit findById fails closed for wrong tenant", async () => {
  const db = new FakeD1Database(); const repo = new D1WorkUnitRepository(db)
  await repo.create(ctx(TA, db), workUnitRow(TA))
  assert.ok(await repo.findById(ctx(TA, db), "wu-1"))
  assert.equal(await repo.findById(ctx(TB, db), "wu-1"), null)
})

test("18b. workUnit updateStatus does NOT mutate a wrong-tenant row", async () => {
  const db = new FakeD1Database(); const repo = new D1WorkUnitRepository(db)
  await repo.create(ctx(TA, db), workUnitRow(TA, { status: "open" }))
  // Wrong tenant attempts to close it — must not mutate.
  await repo.updateStatus(ctx(TB, db), "wu-1", "completed")
  assert.equal((await repo.findById(ctx(TA, db), "wu-1"))?.status, "open")
  // Correct tenant succeeds.
  await repo.updateStatus(ctx(TA, db), "wu-1", "completed")
  assert.equal((await repo.findById(ctx(TA, db), "wu-1"))?.status, "completed")
})

test("18c. workUnit upsert cannot overwrite another tenant with the same id", async () => {
  const db = new FakeD1Database(); const repo = new D1WorkUnitRepository(db)
  await repo.create(ctx(TA, db), workUnitRow(TA, { title: "tenant-a-title" }))
  await assert.rejects(repo.upsert(ctx(TB, db), workUnitRow(TB, { title: "attacker-title" })), /tenant_boundary_violation/)
  assert.equal((await repo.findById(ctx(TA, db), "wu-1"))?.title, "tenant-a-title")
  assert.equal(await repo.findById(ctx(TB, db), "wu-1"), null)
})

// ─── Source guards (19-28) ──────────────────────────────────────

const APPROVAL_REPO = "app/lib/persistence/d1/approvalRecordRepository.ts"
const PREVIEW_REPO = "app/lib/persistence/d1/actionPreviewRepository.ts"
const WORKUNIT_REPO = "app/lib/persistence/d1/workUnitRepository.ts"
const BINDING = "app/lib/security/approvalPreviewBinding.ts"
const STORE = "app/lib/security/approvalStore.ts"
const HASH = "app/lib/security/hash.ts"
const ROW_HELPERS = "app/lib/persistence/d1/rowHelpers.ts"
const DRY_RUN = "app/api/workunit/[id]/execution/dry-run/route.ts"
const MIGRATION = "migrations/0005_tenant_scoped_indexes.sql"
const DOC = "docs/legacy/PHASE_6C_D1_REPOSITORY_INVARIANT_ENFORCEMENT.md"
async function read(p: string): Promise<string> { return readFile(p, "utf8") }

test("20. tenant-owned approval/preview/workUnit update paths bind tenant_id", async () => {
  const approval = await read(APPROVAL_REPO)
  assert.ok(/UPDATE approval_records[\s\S]*?WHERE tenant_id = \?/.test(approval))
  const wu = await read(WORKUNIT_REPO)
  assert.ok(/UPDATE work_units[\s\S]*?WHERE id = \? AND tenant_id = \?/.test(wu), "workUnit updateStatus must be tenant-scoped")
})

test("21. no approval verification path uses latest/workUnit-only approval lookup", async () => {
  const dry = await read(DRY_RUN)
  assert.equal(dry.includes("findByWorkUnitId"), false)
  assert.ok(dry.includes("verifyApprovalPreviewBinding"))
})

test("22. Phase 5C binding source guard still passes", async () => {
  assert.ok((await read(BINDING)).includes("verifyApprovalPreviewBinding"))
  assert.ok((await read(STORE)).includes("record.actionPreviewId !== input.actionPreviewId"))
})

test("23. Phase 5D readJsonColumn/toJsonColumn guard still passes", async () => {
  const repo = await read(PREVIEW_REPO)
  assert.ok(repo.includes("readJsonColumn") && repo.includes("toJsonColumn"))
  assert.equal(repo.includes("JSON.parse"), false)
  assert.ok((await read(ROW_HELPERS)).includes("export function readJsonColumn"))
})

test("24. Phase 5E HMAC no-env guard still passes", async () => {
  const src = await read(HASH)
  assert.equal(src.includes("process.env"), false)
  assert.ok(src.includes("computeTenantHmacSha256Hash"))
})

test("25. Phase 6B migration remains additive and unchanged (CREATE INDEX only)", async () => {
  const sql = (await read(MIGRATION)).split("\n").filter((l) => !l.trim().startsWith("--") && l.trim()).join(" ")
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    assert.match(stmt, /^CREATE (UNIQUE )?INDEX IF NOT EXISTS/i)
  }
})

test("26. package.json has no Electron dependency", async () => {
  assert.equal(/"electron"\s*:/.test(await read("package.json")), false)
})

test("27. docs preserve local-desktop-state-not-approval-source rule", async () => {
  const doc = await read(DOC)
  assert.ok(/desktop state.*approval source/i.test(doc))
  assert.ok(/server-authoritative/i.test(doc))
})

test("28. external execution remains disabled (dry-run non-consuming)", async () => {
  const dry = await read(DRY_RUN)
  assert.equal(dry.includes("markApprovalUsed"), false)
  assert.ok(dry.includes("areExternalActionsEnabled"))
})
