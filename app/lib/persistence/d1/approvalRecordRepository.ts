/**
 * D1 Approval Record Repository
 *
 * Implements ApprovalRecordRepository backed by a D1 database.
 * Uses parameter binding — never string-concatenates untrusted values into SQL.
 */

import type { TenantDbContext, ApprovalRecordRow } from "../types.ts"
import type { ApprovalRecordRepository, RuntimeApprovalClaimFields } from "../repositories.ts"
import type { D1DatabaseLike } from "./types.ts"
import { nowISO } from "./rowHelpers.ts"
import { isIsoUtcTimestamp } from "../../phase6/shared/isoUtcTimestamp.ts"

// ─── SQL ────────────────────────────────────────────────────────

const INSERT_SQL = `
  INSERT INTO approval_records
    (id, tenant_id, work_unit_id, action_preview_id, action_type,
     target_hash, payload_hash, status, approved_by_user_id,
     created_at, approved_at, expires_at, used_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

const FIND_BY_ID_SQL = `
  SELECT * FROM approval_records WHERE tenant_id = ? AND id = ?
`

const FIND_BY_PREVIEW_ID_SQL = `
  SELECT * FROM approval_records WHERE tenant_id = ? AND action_preview_id = ? ORDER BY created_at DESC LIMIT 1
`

const FIND_BY_WORK_UNIT_ID_SQL = `
  SELECT * FROM approval_records WHERE tenant_id = ? AND work_unit_id = ? ORDER BY created_at DESC
`

const UPDATE_STATUS_SQL = `
  UPDATE approval_records SET status = ? WHERE tenant_id = ? AND id = ?
`

// Phase 5B: atomic compare-and-set. The row only transitions to 'used' when it
// is currently approved, unused, unexpired, and tenant-scoped. A concurrent or
// replayed call matches 0 rows and therefore does not claim the one-time use.
const MARK_USED_SQL = `
  UPDATE approval_records
     SET status = 'used', used_at = ?
   WHERE tenant_id = ?
     AND id = ?
     AND status = 'approved'
     AND used_at IS NULL
     AND expires_at > ?
`

// Issue #145: exact-binding atomic compare-and-set. Every binding field must
// match the stored row — a substituted target/payload/action-type/WorkUnit/
// ActionPreview/Approval/tenant matches 0 rows and claims nothing. `expires_at >
// ?` keeps expiry inclusive-fail (claimedAt == expires_at ⇒ 0 rows).
const CLAIM_FOR_RUNTIME_SQL = `
  UPDATE approval_records
     SET status = 'used', used_at = ?
   WHERE tenant_id = ?
     AND id = ?
     AND work_unit_id = ?
     AND action_preview_id = ?
     AND action_type = ?
     AND target_hash = ?
     AND payload_hash = ?
     AND status = 'approved'
     AND used_at IS NULL
     AND expires_at > ?
`

// ─── Implementation ─────────────────────────────────────────────

export class D1ApprovalRecordRepository implements ApprovalRecordRepository {
  private db: D1DatabaseLike
  constructor(db: D1DatabaseLike) {
    this.db = db
  }

  async create(ctx: TenantDbContext, row: ApprovalRecordRow): Promise<ApprovalRecordRow> {
    await this.db.prepare(INSERT_SQL)
      .bind(
        row.id,
        ctx.tenantId,
        row.workUnitId,
        row.actionPreviewId,
        row.actionType,
        row.targetHash,
        row.payloadHash,
        row.status,
        row.approvedByUserId ?? null,
        row.createdAt ?? nowISO(),
        row.approvedAt ?? null,
        row.expiresAt,
        row.usedAt ?? null,
      )
      .run()
    return row
  }

  async findById(ctx: TenantDbContext, id: string): Promise<ApprovalRecordRow | null> {
    const row = await this.db.prepare(FIND_BY_ID_SQL).bind(ctx.tenantId, id).first<Record<string, unknown>>()
    if (!row) return null
    return this.mapRow(row)
  }

  async findByPreviewId(ctx: TenantDbContext, actionPreviewId: string): Promise<ApprovalRecordRow | null> {
    const row = await this.db.prepare(FIND_BY_PREVIEW_ID_SQL)
      .bind(ctx.tenantId, actionPreviewId)
      .first<Record<string, unknown>>()
    if (!row) return null
    return this.mapRow(row)
  }

  async findByWorkUnitId(ctx: TenantDbContext, workUnitId: string): Promise<ApprovalRecordRow[]> {
    const result = await this.db.prepare(FIND_BY_WORK_UNIT_ID_SQL)
      .bind(ctx.tenantId, workUnitId)
      .all<Record<string, unknown>>()
    if (!result.results) return []
    return result.results.map((row) => this.mapRow(row))
  }

  async updateStatus(ctx: TenantDbContext, id: string, status: ApprovalRecordRow["status"]): Promise<ApprovalRecordRow | null> {
    await this.db.prepare(UPDATE_STATUS_SQL).bind(status, ctx.tenantId, id).run()
    return this.findById(ctx, id)
  }

  /**
   * Atomic compare-and-set one-time-use claim (Phase 5B).
   *
   * Returns the updated row only when THIS call claimed the approval
   * (the conditional UPDATE changed exactly one row). Returns null when the
   * approval was already used, expired, not approved, or belongs to another
   * tenant — i.e. the caller did NOT win the claim and must not proceed.
   */
  async markUsed(ctx: TenantDbContext, id: string, usedAt: string): Promise<ApprovalRecordRow | null> {
    const result = await this.db.prepare(MARK_USED_SQL).bind(usedAt, ctx.tenantId, id, usedAt).run()
    if ((result.meta?.rows_written ?? 0) < 1) return null
    return this.findById(ctx, id)
  }

  /**
   * Issue #145 exact-binding atomic claim. The conditional UPDATE requires every
   * binding field; a mismatch matches 0 rows and returns null (claim lost). Only
   * on a winning single-row update is the fresh row returned.
   */
  async claimForRuntime(ctx: TenantDbContext, input: RuntimeApprovalClaimFields): Promise<ApprovalRecordRow | null> {
    // Reject a malformed/non-ISO claimedAt before touching the database, keeping
    // predicate behaviour equivalent to the in-memory claim.
    if (!isIsoUtcTimestamp(input.claimedAt)) return null
    const result = await this.db.prepare(CLAIM_FOR_RUNTIME_SQL)
      .bind(
        input.claimedAt,
        ctx.tenantId,
        input.id,
        input.workUnitId,
        input.actionPreviewId,
        input.actionType,
        input.targetHash,
        input.payloadHash,
        input.claimedAt,
      )
      .run()
    if ((result.meta?.rows_written ?? 0) < 1) return null
    return this.findById(ctx, input.id)
  }

  // ── Private ──────────────────────────────────────────────────

  private mapRow(row: Record<string, unknown>): ApprovalRecordRow {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as ApprovalRecordRow["tenantId"],
      workUnitId: row.work_unit_id as string,
      actionPreviewId: row.action_preview_id as string,
      actionType: row.action_type as string,
      targetHash: (row.target_hash as string) ?? "",
      payloadHash: (row.payload_hash as string) ?? "",
      status: (row.status as ApprovalRecordRow["status"]) ?? "pending",
      approvedByUserId: (row.approved_by_user_id as ApprovalRecordRow["approvedByUserId"]) ?? undefined,
      createdAt: (row.created_at as string) ?? nowISO(),
      approvedAt: (row.approved_at as string) ?? undefined,
      expiresAt: (row.expires_at as string) ?? "",
      usedAt: (row.used_at as string) ?? undefined,
    }
  }
}
