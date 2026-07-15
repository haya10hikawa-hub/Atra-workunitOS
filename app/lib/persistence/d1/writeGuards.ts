/**
 * Shared-D1 write guards (Blocker 4, P0-PERSIST-014)
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
 */

import { D1RepositoryError, type D1PreparedStatementLike } from "./types.ts"

/** True when the driver error is a PRIMARY KEY / UNIQUE constraint violation. */
export function isUniqueConstraintViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /unique constraint failed|primary\s*key|constraint failed/i.test(message)
}

/**
 * Execute an INSERT that participates in the shared tenant D1's global object-ID
 * namespace. A collision fails closed with an opaque typed error that carries no
 * tenant id, database id/name, SQL, or stored row content.
 */
export async function runInsertGuarded(statement: D1PreparedStatementLike): Promise<void> {
  try {
    await statement.run()
  } catch (error) {
    if (isUniqueConstraintViolation(error)) throw new D1RepositoryError("object_id_conflict")
    throw new D1RepositoryError("write_failed")
  }
}
