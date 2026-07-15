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
import type { TenantDbResolver, TenantDbResolution, TenantDbResolutionReason } from "./repositories.ts"
import type { D1DatabaseLike } from "./d1/types.ts"

// ─── SQL (registry validation only; reads routing metadata, not secrets) ──

const FIND_TENANT_SQL = `SELECT status FROM tenants WHERE id = ?`
// Blocker 3: project the COMPLETE routing record so the resolver can validate
// every field declared by the registry contract — not just status.
const FIND_TENANT_DB_SQL = `SELECT tenant_id, database_name, database_id, schema_version, status FROM tenant_databases WHERE tenant_id = ?`

// ─── Registry record shape + validation ─────────────────────────
//
// The raw registry row is untrusted `unknown` until every field is validated.
// None of these values (tenant id, database id/name, schema version) is ever
// returned or logged — a malformed record maps to the opaque `database_invalid`
// reason, which higher layers surface as a safe 503 with no disclosure.

export type TenantDatabaseRegistryRow = {
  tenant_id?: unknown
  database_name?: unknown
  database_id?: unknown
  schema_version?: unknown
  status?: unknown
}

const MAX_DB_NAME_LENGTH = 128
const MAX_DB_ID_LENGTH = 64
const MAX_SCHEMA_VERSION_LENGTH = 32
// A D1 database id is a UUID (8-4-4-4-12 hex). Bounded + shape-checked so a
// malformed/oversized routing value can never flow downstream.
const D1_DATABASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Supported schema-version form: a bounded positive integer string (migration
// default is "1"). Anything else is treated as an unsupported/malformed record.
const SCHEMA_VERSION_PATTERN = /^[0-9]{1,10}$/

function isNonEmptyBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

/**
 * Validate the COMPLETE registry record against the requested tenant. Returns a
 * typed, disclosure-free reason on any problem:
 *   - `database_invalid` — the row's tenant_id does not match, or a required
 *     field (database_name / database_id / schema_version) is missing, malformed,
 *     or out of bounds;
 *   - `database_inactive` — the record is well-formed but not exactly "active".
 */
function validateRegistryRecord(
  tenantId: TenantId,
  row: TenantDatabaseRegistryRow,
): { ok: true } | { ok: false; reason: TenantDbResolutionReason } {
  // The stored routing tenant must be exactly the requested tenant (defense in
  // depth even though the query filters on tenant_id).
  if (typeof row.tenant_id !== "string" || row.tenant_id !== tenantId) {
    return { ok: false, reason: "database_invalid" }
  }
  if (!isNonEmptyBoundedString(row.database_name, MAX_DB_NAME_LENGTH)) {
    return { ok: false, reason: "database_invalid" }
  }
  if (!isNonEmptyBoundedString(row.database_id, MAX_DB_ID_LENGTH) || !D1_DATABASE_ID_PATTERN.test(row.database_id)) {
    return { ok: false, reason: "database_invalid" }
  }
  if (!isNonEmptyBoundedString(row.schema_version, MAX_SCHEMA_VERSION_LENGTH) || !SCHEMA_VERSION_PATTERN.test(row.schema_version)) {
    return { ok: false, reason: "database_invalid" }
  }
  // Reject migrating / failed / unknown / any non-active registry state.
  if (row.status !== "active") return { ok: false, reason: "database_inactive" }
  return { ok: true }
}

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

      // 2. A COMPLETE, well-formed, ACTIVE `tenant_databases` record must exist
      //    for this tenant. Every field is validated; a malformed record maps to
      //    `database_invalid` (surfaced as a safe 503 with no disclosure).
      const dbRef = await this.controlDb
        .prepare(FIND_TENANT_DB_SQL)
        .bind(tenantId)
        .first<TenantDatabaseRegistryRow>()
      if (!dbRef) return { ok: false, reason: "database_not_found" }
      const validation = validateRegistryRecord(tenantId, dbRef)
      if (!validation.ok) return { ok: false, reason: validation.reason }

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
