/**
 * D1 Audit Log Repository
 */

import type { TenantDbContext, AuditLogRow } from "../types.ts"
import type { AuditLogRepository } from "../repositories.ts"
import type { D1DatabaseLike } from "./types.ts"
import { runInsertGuarded } from "./writeGuards.ts"

export class D1AuditLogRepository implements AuditLogRepository {
  private db: D1DatabaseLike
  constructor(db: D1DatabaseLike) { this.db = db }

  async append(_ctx: TenantDbContext, row: AuditLogRow): Promise<AuditLogRow> {
    // Shared-D1 global object-ID namespace: a cross-tenant id collision fails
    // closed (typed, no disclosure) and never overwrites the existing row.
    await runInsertGuarded(this.db.prepare(
      "INSERT INTO audit_logs (id,tenant_id,actor_user_id,event_type,resource_type,resource_id,status,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(row.id, _ctx.tenantId, row.actorId ?? null, row.eventKind, row.workUnitId ? "work_unit" : null, row.workUnitId ?? row.requestId ?? null, row.reason ?? null, row.metadata ?? null, row.occurredAt))
    return { ...row, tenantId: _ctx.tenantId }
  }

  async listRecent(_ctx: TenantDbContext, limit = 50): Promise<AuditLogRow[]> {
    const rows = await this.db.prepare(
      "SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
    ).bind(_ctx.tenantId, limit).all<Record<string, unknown>>()
    return (rows.results ?? []).map(mapAudit)
  }

  async findByWorkUnitId(_ctx: TenantDbContext, workUnitId: string): Promise<AuditLogRow[]> {
    const rows = await this.db.prepare(
      "SELECT * FROM audit_logs WHERE tenant_id = ? AND resource_id = ? ORDER BY created_at DESC",
    ).bind(_ctx.tenantId, workUnitId).all<Record<string, unknown>>()
    return (rows.results ?? []).map(mapAudit)
  }
}

function mapAudit(row: Record<string, unknown>): AuditLogRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as AuditLogRow["tenantId"],
    eventKind: row.event_type as string,
    actorId: row.actor_user_id as AuditLogRow["actorId"],
    requestId: row.resource_id as string | undefined,
    workUnitId: row.resource_id as string | undefined,
    reason: row.status as string | undefined,
    metadata: row.metadata_json as string | undefined,
    occurredAt: row.created_at as string,
  }
}
