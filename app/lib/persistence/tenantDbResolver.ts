/**
 * Tenant DB Resolver (P0-PERSIST-014)
 *
 * Architecture: explicit SHARED tenant D1.
 *   CONTROL_DB          → global tenant/registry lookup (validation only)
 *   TENANT_DB_DEFAULT   → the single statically bound physical tenant-data D1
 *
 * The resolver validates an ACTIVE tenant and an ACTIVE `tenant_databases`
 * registry row in CONTROL_DB, then returns the statically bound
 * TENANT_DB_DEFAULT. It NEVER returns the control DB, never treats a stored
 * `database_id` as a constructible binding, and never fetches a database over
 * the network. Per-tenant physical D1 routing is deferred (Issue #155).
 *
 * Failures are typed, deterministic reasons — no raw tenantId / database id /
 * name / SQL / binding object is placed anywhere client-reachable.
 */

import type { TenantId } from "../tenant/types.ts"
import type { TenantDbResolver, TenantDbResolution } from "./repositories.ts"
import type { D1DatabaseLike } from "./d1/types.ts"

// ─── SQL (registry validation only; reads status, not secrets) ──

const FIND_TENANT_SQL = `SELECT status FROM tenants WHERE id = ?`
const FIND_TENANT_DB_SQL = `SELECT status FROM tenant_databases WHERE tenant_id = ?`

// ─── D1 Implementation ──────────────────────────────────────────

export type D1TenantDbResolverDeps = {
  /** Control/registry D1 — used ONLY to validate tenant + registry rows. */
  readonly controlDb: D1DatabaseLike
  /** The statically bound shared tenant-data D1 returned on success. */
  readonly tenantDb: D1DatabaseLike
}

export class D1TenantDbResolver implements TenantDbResolver {
  private readonly controlDb: D1DatabaseLike
  private readonly tenantDb: D1DatabaseLike

  constructor(deps: D1TenantDbResolverDeps) {
    this.controlDb = deps.controlDb
    this.tenantDb = deps.tenantDb
  }

  async resolveTenantDb(tenantId: TenantId): Promise<TenantDbResolution> {
    try {
      // 1. Tenant must exist and be exactly "active".
      const tenant = await this.controlDb
        .prepare(FIND_TENANT_SQL)
        .bind(tenantId)
        .first<{ status?: unknown }>()
      if (!tenant) return { ok: false, reason: "tenant_not_found" }
      if (tenant.status !== "active") return { ok: false, reason: "tenant_inactive" }

      // 2. An active `tenant_databases` registry row must exist for this tenant.
      const dbRef = await this.controlDb
        .prepare(FIND_TENANT_DB_SQL)
        .bind(tenantId)
        .first<{ status?: unknown }>()
      if (!dbRef) return { ok: false, reason: "database_not_found" }
      // Reject migrating / failed / any non-active registry state.
      if (dbRef.status !== "active") return { ok: false, reason: "database_inactive" }

      // 3. Return the statically bound shared tenant DB — NEVER the control DB.
      return { ok: true, ctx: { tenantId, db: this.tenantDb } }
    } catch {
      // Any control-DB query error fails closed with a generic reason.
      return { ok: false, reason: "resolution_failed" }
    }
  }
}

// ─── Fake Implementation for Tests ──────────────────────────────

/**
 * Creates a fake TenantDbResolver for tests, backed by a predetermined map.
 * Mirrors the D1 resolver's validation order and typed reasons. The success
 * context carries the supplied `tenantDb` handle (never a control DB).
 */
export function createFakeTenantDbResolver(
  tenants: Map<string, { tenant: { status?: string }; dbRef: { status?: string } }>,
  tenantDb: D1DatabaseLike | null = null,
): TenantDbResolver {
  return {
    async resolveTenantDb(tenantId: TenantId): Promise<TenantDbResolution> {
      const entry = tenants.get(tenantId)
      if (!entry) return { ok: false, reason: "tenant_not_found" }
      if (entry.tenant?.status !== "active") return { ok: false, reason: "tenant_inactive" }
      if (!entry.dbRef) return { ok: false, reason: "database_not_found" }
      if (entry.dbRef.status !== "active") return { ok: false, reason: "database_inactive" }
      return { ok: true, ctx: { tenantId, db: tenantDb } }
    },
  }
}
