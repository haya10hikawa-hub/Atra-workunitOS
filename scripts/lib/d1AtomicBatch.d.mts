/**
 * Type declarations for D1 atomic batch semantics (P0-PERSIST-015).
 * The implementation is `d1AtomicBatch.mjs`.
 */

import type { DatabaseSync } from "node:sqlite"

export type AtomicBatchResult =
  | { ok: true; statements: number }
  | { ok: false; error: string }

/**
 * True if the SQL contains explicit transaction control (BEGIN/COMMIT/ROLLBACK/
 * SAVEPOINT/RELEASE). D1 REJECTS such a batch, so generated SQL must never contain
 * it — the single `d1 execute --file` invocation is the atomic boundary.
 */
export declare function hasExplicitTransactionControl(sql: string): boolean

/**
 * Apply `sql` with D1's batch semantics (one implicit transaction, all-or-nothing,
 * foreign keys enforced). On failure the database is unchanged.
 */
export declare function applyAtomicBatch(db: DatabaseSync, sql: string): AtomicBatchResult
