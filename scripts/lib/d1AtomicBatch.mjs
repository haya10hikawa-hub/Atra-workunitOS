/**
 * D1 atomic batch semantics (P0-PERSIST-015)
 *
 * THE MECHANISM, VERIFIED — NOT ASSUMED
 * -------------------------------------
 * Probed against this repository's pinned Wrangler (4.99.0) on a local D1:
 *
 *   1. D1 REJECTS explicit transaction control. A `--file` containing
 *      `BEGIN IMMEDIATE; …; COMMIT;` fails with: "To execute a transaction, please
 *      use the state.storage.transaction() or state.storage.transactionSync() APIs
 *      instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements."
 *      So the textbook `BEGIN IMMEDIATE … COMMIT` shape CANNOT be used on D1.
 *
 *   2. A multi-statement `wrangler d1 execute --file` IS applied as ONE implicit
 *      atomic batch. A probe file whose third statement violated a PRIMARY KEY left
 *      ZERO rows from the first two statements.
 *
 *   3. Foreign keys are ENFORCED (`PRAGMA foreign_keys` → 1); an orphan insert
 *      likewise rolls the entire batch back.
 *
 * Therefore the atomic boundary for a bootstrap is THE SINGLE `--file` INVOCATION
 * ITSELF, and the generated SQL must contain no explicit transaction control.
 *
 * This module models exactly those semantics over `node:sqlite` so the rollback
 * guarantees can be PROVEN offline against a real SQLite engine, with the same SQL
 * text that would be handed to Wrangler.
 */

import { splitStatements } from "./d1MigrationLedger.mjs"

/** Statements D1 rejects outright — the generated SQL must never contain them. */
const EXPLICIT_TX_RE = /\b(begin\s+(immediate|deferred|exclusive|transaction)?|commit|rollback|savepoint|release)\b/i

/**
 * Does this SQL wrongly try to control transactions itself? D1 rejects such a
 * batch, so a generated file containing BEGIN/COMMIT would fail closed at apply
 * time rather than being atomic.
 */
export function hasExplicitTransactionControl(sql) {
  return splitStatements(sql).some((s) => EXPLICIT_TX_RE.test(s))
}

/**
 * Apply `sql` to an open node:sqlite database with D1's batch semantics: every
 * statement in one implicit transaction, all-or-nothing, foreign keys enforced.
 *
 * Returns `{ ok: true, statements }` or `{ ok: false, error }` — on failure the
 * database is guaranteed to be exactly as it was before the call.
 */
export function applyAtomicBatch(db, sql) {
  if (hasExplicitTransactionControl(sql)) {
    // Mirrors D1's real refusal rather than silently succeeding where D1 would not.
    return { ok: false, error: "explicit_transaction_control_rejected" }
  }
  // D1 enforces foreign keys; node:sqlite does not by default.
  db.exec("PRAGMA foreign_keys = ON")
  const statements = splitStatements(sql)
  db.exec("BEGIN IMMEDIATE")
  try {
    for (const statement of statements) db.exec(statement)
    db.exec("COMMIT")
    return { ok: true, statements: statements.length }
  } catch (err) {
    try { db.exec("ROLLBACK") } catch { /* already unwound */ }
    return { ok: false, error: err instanceof Error ? err.message : "batch_failed" }
  }
}
