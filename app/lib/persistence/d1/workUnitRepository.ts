/**
 * D1 WorkUnit Repository
 */

import type { InboxWorkUnitRow, TenantDbContext } from "../types.ts"
import type { WorkUnitRepository } from "../repositories.ts"
import { D1RepositoryError, type D1DatabaseLike } from "./types.ts"
import { nowISO } from "./rowHelpers.ts"
import { runInsertGuarded } from "./writeGuards.ts"

export class D1WorkUnitRepository implements WorkUnitRepository {
  private db: D1DatabaseLike
  constructor(db: D1DatabaseLike) { this.db = db }

  async create(_ctx: TenantDbContext, row: InboxWorkUnitRow): Promise<InboxWorkUnitRow> {
    // Shared-D1 global object-ID namespace: a cross-tenant id collision fails
    // closed (typed, no disclosure) and never overwrites the existing row.
    await runInsertGuarded(this.db.prepare(
      "INSERT INTO work_units (id,tenant_id,source_signal_id,title,kind,priority,source_provider,reason,evidence,next_action,source_url,actor,assignee,repository,due_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(row.id, _ctx.tenantId, row.sourceSignalId ?? null, row.title, row.kind, row.priority, row.sourceProvider, row.reason, row.evidence, row.nextAction, row.sourceUrl ?? null, row.actor ?? null, row.assignee ?? null, row.repository ?? null, row.dueAt ?? null, row.status, row.createdAt, row.updatedAt))
    return { ...row, tenantId: _ctx.tenantId }
  }

  async upsert(_ctx: TenantDbContext, row: InboxWorkUnitRow): Promise<InboxWorkUnitRow> {
    const owner = await this.db.prepare("SELECT tenant_id FROM work_units WHERE id = ?").bind(row.id).first<{ tenant_id?: unknown }>()
    if (owner && String(owner.tenant_id) !== String(_ctx.tenantId)) {
      throw new D1RepositoryError("tenant_boundary_violation")
    }
    await this.db.prepare(
      `INSERT INTO work_units (id,tenant_id,source_signal_id,title,kind,priority,source_provider,reason,evidence,next_action,source_url,actor,assignee,repository,due_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_signal_id=excluded.source_signal_id,title=excluded.title,kind=excluded.kind,priority=excluded.priority,source_provider=excluded.source_provider,reason=excluded.reason,evidence=excluded.evidence,next_action=excluded.next_action,source_url=excluded.source_url,actor=excluded.actor,assignee=excluded.assignee,repository=excluded.repository,due_at=excluded.due_at,status=excluded.status,updated_at=excluded.updated_at WHERE work_units.tenant_id = excluded.tenant_id`,
    ).bind(row.id, _ctx.tenantId, row.sourceSignalId ?? null, row.title, row.kind, row.priority, row.sourceProvider, row.reason, row.evidence, row.nextAction, row.sourceUrl ?? null, row.actor ?? null, row.assignee ?? null, row.repository ?? null, row.dueAt ?? null, row.status, row.createdAt, row.updatedAt).run()
    return { ...row, tenantId: _ctx.tenantId }
  }

  async findById(_ctx: TenantDbContext, id: string): Promise<InboxWorkUnitRow | null> {
    const row = await this.db.prepare("SELECT * FROM work_units WHERE id = ? AND tenant_id = ?").bind(id, _ctx.tenantId).first<Record<string, unknown>>()
    if (!row) return null
    return mapWorkUnit(row)
  }

  async updateStatus(_ctx: TenantDbContext, id: string, status: InboxWorkUnitRow["status"]): Promise<InboxWorkUnitRow | null> {
    // Phase 6C: tenant-scope the UPDATE so a wrong-tenant call cannot mutate
    // another tenant's row. The previous WHERE id = ? form mutated the row before
    // the post-filtered findById masked it.
    await this.db.prepare("UPDATE work_units SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(status, nowISO(), id, _ctx.tenantId)
      .run()
    return this.findById(_ctx, id)
  }

  async listRecent(_ctx: TenantDbContext, limit = 50): Promise<InboxWorkUnitRow[]> {
    const rows = await this.db.prepare("SELECT * FROM work_units WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").bind(_ctx.tenantId, limit).all<Record<string, unknown>>()
    return (rows.results ?? []).map(mapWorkUnit)
  }
}

function mapWorkUnit(row: Record<string, unknown>): InboxWorkUnitRow {
  return {
    id: row.id as InboxWorkUnitRow["id"],
    tenantId: row.tenant_id as InboxWorkUnitRow["tenantId"],
    sourceSignalId: row.source_signal_id as string | undefined,
    title: row.title as string,
    kind: row.kind as string,
    priority: row.priority as string,
    sourceProvider: row.source_provider as string,
    reason: row.reason as string,
    evidence: row.evidence as string,
    nextAction: row.next_action as string,
    sourceUrl: row.source_url as string | undefined,
    actor: row.actor as string | undefined,
    assignee: row.assignee as string | undefined,
    repository: row.repository as string | undefined,
    dueAt: row.due_at as string | undefined,
    status: row.status as InboxWorkUnitRow["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
