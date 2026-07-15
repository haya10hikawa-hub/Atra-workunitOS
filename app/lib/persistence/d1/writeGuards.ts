/**
 * Shared-D1 write guards (P0-PERSIST-014)
 *
 * The current schema uses GLOBAL `id PRIMARY KEY` columns while multiple tenants
 * share one physical D1 (per-tenant physical routing is deferred to Issue #155).
 * Persisted object IDs are therefore globally unique across ALL tenants; tenant
 * isolation is enforced by tenant predicates IN ADDITION TO global uniqueness.
 *
 * A cross-tenant global-ID collision must FAIL CLOSED: it must not overwrite,
 * update, reveal, or delete the existing tenant's row, and the failure must not
 * disclose which tenant owns the ID or any stored data. The raw driver error
 * (e.g. "UNIQUE constraint failed: work_units.id") is mapped here to an opaque,
 * typed repository failure so no owner/row detail can ever reach a caller.
 *
 * Constraint failures are classified PRECISELY (Blocker 3): ONLY a genuine
 * UNIQUE / PRIMARY KEY collision is an object-ID conflict. FOREIGN KEY, CHECK,
 * NOT NULL, and any other driver error map to the generic `write_failed` — never
 * to `object_id_conflict`. (Cross-tenant / missing parent relationships are
 * rejected earlier, at the persistence-service boundary, as
 * `parent_boundary_violation`; they never reach the driver.)
 */

import { D1RepositoryError, type D1PreparedStatementLike } from "./types.ts"

/**
 * True ONLY for a genuine UNIQUE / PRIMARY KEY constraint violation.
 *
 * SQLite (and Cloudflare D1) report a primary-key collision as
 * "UNIQUE constraint failed: <table>.<col>"; a composite/without-rowid primary
 * key surfaces as "PRIMARY KEY constraint failed". Both forms are matched. The
 * generic "constraint failed" substring is deliberately NOT matched, because it
 * also covers FOREIGN KEY / CHECK / NOT NULL failures, which are NOT global-ID
 * collisions.
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /unique constraint failed|primary key constraint failed/i.test(message)
}

/**
 * Execute an INSERT that participates in the shared tenant D1's global object-ID
 * namespace. A UNIQUE / PRIMARY KEY collision → `object_id_conflict`; any other
 * driver failure (FOREIGN KEY / CHECK / NOT NULL / unknown) → `write_failed`.
 * Neither error carries the raw driver message, tenant id, SQL, or row content.
 */
export async function runInsertGuarded(statement: D1PreparedStatementLike): Promise<void> {
  try {
    await statement.run()
  } catch (error) {
    if (isUniqueConstraintViolation(error)) throw new D1RepositoryError("object_id_conflict")
    throw new D1RepositoryError("write_failed")
  }
}
