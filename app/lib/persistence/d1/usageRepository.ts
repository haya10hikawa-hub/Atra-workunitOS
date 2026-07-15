/**
 * D1 Usage Repository
 */

import type { TenantDbContext, UsageEventRow, UsageDailySummaryRow } from "../types.ts"
import type { UsageRepository } from "../repositories.ts"
import type { D1DatabaseLike } from "./types.ts"
import { nowISO } from "./rowHelpers.ts"
import { runInsertGuarded } from "./writeGuards.ts"

export class D1UsageRepository implements UsageRepository {
  private db: D1DatabaseLike
  constructor(db: D1DatabaseLike) { this.db = db }

  async recordEvent(_ctx: TenantDbContext, row: UsageEventRow): Promise<UsageEventRow> {
    // Shared-D1 global object-ID namespace: a cross-tenant usage-event id collision
    // fails closed (typed, no disclosure) and never overwrites the existing row.
    await runInsertGuarded(this.db.prepare(
      "INSERT INTO usage_events (id,tenant_id,event_type,quantity,resource_type,resource_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(row.id, _ctx.tenantId, row.eventType, row.quantity, row.resourceType ?? null, row.resourceId ?? null, row.metadataJson ?? null, row.createdAt))

    // Upsert daily summary
    const date = row.createdAt.slice(0, 10)
    const now = nowISO()
    await this.db.prepare(
      `INSERT INTO usage_daily_summary (tenant_id,date,event_type,quantity,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(tenant_id,date,event_type) DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at`,
    ).bind(_ctx.tenantId, date, row.eventType, row.quantity, now).run()

    return { ...row, tenantId: _ctx.tenantId }
  }

  async getDailySummary(_ctx: TenantDbContext, tenantId: string, date: string): Promise<UsageDailySummaryRow[]> {
    // The redundant tenant argument must equal ctx.tenantId, else fail closed
    // (parity with the in-memory repo; a caller cannot read another tenant's usage).
    if (tenantId !== _ctx.tenantId) return []
    const rows = await this.db.prepare(
      "SELECT * FROM usage_daily_summary WHERE tenant_id = ? AND date = ?",
    ).bind(_ctx.tenantId, date).all<Record<string, unknown>>()
    return (rows.results ?? []).map(mapSummary)
  }

  async getCurrentUsage(_ctx: TenantDbContext, tenantId: string, eventType: string): Promise<number> {
    if (tenantId !== _ctx.tenantId) return 0
    const rows = await this.db.prepare(
      "SELECT * FROM usage_events WHERE tenant_id = ? AND event_type = ?",
    ).bind(_ctx.tenantId, eventType).all<Record<string, unknown>>()
    return (rows.results ?? [])
      .filter((row) => String(row.event_type) === eventType)
      .reduce((total, row) => total + Number(row.quantity ?? 0), 0)
  }
}

function mapSummary(row: Record<string, unknown>): UsageDailySummaryRow {
  return {
    tenantId: row.tenant_id as UsageDailySummaryRow["tenantId"],
    date: row.date as string,
    eventType: row.event_type as string,
    quantity: row.quantity as number,
    updatedAt: row.updated_at as string,
  }
}
