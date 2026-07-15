/**
 * D1 ActionPreview Repository
 *
 * Implements ActionPreviewRepository backed by a D1 database.
 * Uses parameter binding — never string-concatenates untrusted values into SQL.
 */

import type { TenantDbContext, ActionPreviewRow } from "../types.ts"
import type { ActionPreviewRepository } from "../repositories.ts"
import type { D1DatabaseLike } from "./types.ts"
import { toJsonColumn, readJsonColumn, nowISO } from "./rowHelpers.ts"
import { runInsertGuarded } from "./writeGuards.ts"

// ─── SQL ────────────────────────────────────────────────────────

const INSERT_SQL = `
  INSERT INTO action_previews
    (id, tenant_id, work_unit_id, action_type,
     target_preview, payload_preview, requires_approval, status,
     target_hash, payload_hash, created_at, expires_at, created_by_user_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

const FIND_BY_ID_SQL = `
  SELECT * FROM action_previews WHERE tenant_id = ? AND id = ?
`

const FIND_BY_WORK_UNIT_SQL = `
  SELECT * FROM action_previews WHERE tenant_id = ? AND work_unit_id = ? ORDER BY created_at DESC
`

// ─── Implementation ─────────────────────────────────────────────

export class D1ActionPreviewRepository implements ActionPreviewRepository {
  private db: D1DatabaseLike
  constructor(db: D1DatabaseLike) {
    this.db = db
  }

  async create(ctx: TenantDbContext, row: ActionPreviewRow): Promise<ActionPreviewRow> {
    // Shared-D1 global object-ID namespace: a cross-tenant id collision fails
    // closed (typed, no disclosure) and never overwrites the existing row.
    await runInsertGuarded(this.db.prepare(INSERT_SQL)
      .bind(
        row.id,
        ctx.tenantId,
        row.workUnitId,
        row.actionType,
        // Phase 5D: serialize JSON columns exactly once (no double-encoding).
        toJsonColumn(row.targetPreview),
        toJsonColumn(row.payloadPreview),
        row.requiresApproval ? 1 : 0,
        row.status,
        row.targetHash,
        row.payloadHash,
        row.createdAt ?? nowISO(),
        row.expiresAt ?? null,
        // Security P1: server-set creator for four-eyes enforcement.
        row.creatorUserId ?? null,
      ))
    // The INSERT binds ctx.tenantId; the returned row must reflect it too, so a
    // spoofed row.tenantId controls neither storage nor the return value.
    return { ...row, tenantId: ctx.tenantId }
  }

  async findById(ctx: TenantDbContext, id: string): Promise<ActionPreviewRow | null> {
    const row = await this.db.prepare(FIND_BY_ID_SQL).bind(ctx.tenantId, id).first<Record<string, unknown>>()
    if (!row) return null
    // A malformed stored row is treated as absent (fail-safe), never fabricated.
    return this.mapRow(row)
  }

  async findByWorkUnitId(ctx: TenantDbContext, workUnitId: string): Promise<ActionPreviewRow[]> {
    const result = await this.db.prepare(FIND_BY_WORK_UNIT_SQL)
      .bind(ctx.tenantId, workUnitId)
      .all<Record<string, unknown>>()
    // Skip rows whose stored JSON is malformed rather than fabricating defaults.
    return result.results
      .map((r) => this.mapRow(r))
      .filter((r): r is ActionPreviewRow => r !== null)
  }

  // ── Private ──────────────────────────────────────────────────

  /**
   * Map a D1 row to an ActionPreviewRow (Phase 5D).
   *
   * targetPreview / payloadPreview are JSON-string columns. They are returned
   * verbatim only when they parse as JSON, preserving content exactly. If either
   * is missing or malformed, the row is unusable and mapRow returns null — the
   * repository never fabricates a default/executable target or payload, and never
   * exposes the raw stored content. targetHash / payloadHash are preserved exactly.
   */
  private mapRow(row: Record<string, unknown>): ActionPreviewRow | null {
    const targetPreview = readJsonColumn(row.target_preview)
    const payloadPreview = readJsonColumn(row.payload_preview)
    if (targetPreview === null || payloadPreview === null) return null

    return {
      id: row.id as string,
      tenantId: row.tenant_id as ActionPreviewRow["tenantId"],
      workUnitId: row.work_unit_id as string,
      actionType: row.action_type as string,
      targetPreview,
      payloadPreview,
      requiresApproval: row.requires_approval === 1 || row.requires_approval === "1" ? 1 : 0,
      status: (row.status as string) ?? "preview",
      targetHash: (row.target_hash as string) ?? "",
      payloadHash: (row.payload_hash as string) ?? "",
      createdAt: (row.created_at as string) ?? nowISO(),
      expiresAt: (row.expires_at as string) ?? undefined,
      // Security P1: read the server-set creator (NULL on pre-P1 rows → undefined).
      creatorUserId: (row.created_by_user_id as ActionPreviewRow["creatorUserId"]) ?? undefined,
    }
  }
}
