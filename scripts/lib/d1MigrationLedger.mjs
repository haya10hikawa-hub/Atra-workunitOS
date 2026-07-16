/**
 * D1 Migration Ledger — applied-once migration history (P0-PERSIST-015)
 *
 * WHY THIS EXISTS
 * ---------------
 * The original design assumed every active migration is raw-SQL replay-idempotent.
 * That is false for additive migrations: SQLite has no
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The previous workaround — parking
 * 0006 in a `deferred` list — made a REQUIRED migration operationally invisible and
 * produced a "clean" bootstrap whose `action_previews` table the application's own
 * repository cannot INSERT into. This ledger removes the need for that workaround:
 * a `once` migration is an ordered, ACTIVE lane member that is applied exactly once
 * and recorded, so replaying the lane is safe without the SQL being replay-safe.
 *
 * WHY A CUSTOM LEDGER (verified, not assumed)
 * -------------------------------------------
 * Checked against the repository's own pinned Wrangler (4.99.0):
 *   `wrangler d1 migrations apply <database>` applies EVERY file in the migrations
 *   directory to ONE database. This repository interleaves two independent lanes in
 *   a single `migrations/` directory (0001/0004 → CONTROL_DB; 0002/0003/0005/0006 →
 *   TENANT_DB_DEFAULT), so the built-in mechanism would apply control migrations to
 *   the tenant database and vice versa. It also performs no digest pinning and
 *   cannot fail closed on a tampered migration. The manifest-backed ledger below is
 *   therefore the mechanism, per the two permitted options.
 *
 * SAFETY:
 *   - Records ONLY binding/sequence/path/sha256/applied_at. NEVER application row
 *     data, database IDs, secrets, or identities.
 *   - A digest, path, or sequence that disagrees with the manifest FAILS CLOSED.
 *   - Control and Tenant histories cannot mix: every row is checked against the
 *     lane it is read for, and a foreign binding fails closed.
 *   - SQL is never marked applied before it succeeds (see `applyLaneWithLedger`).
 */

import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { buildPlan, KNOWN_BINDINGS, computeDigest, resolveMigrationPath } from "./d1MigrationManifest.mjs"

export const MIGRATION_HISTORY_TABLE = "__atra_d1_migrations"

/**
 * The ledger table. `IF NOT EXISTS` — the ledger itself is replay-safe, and it is
 * infrastructure rather than a migration (it is never a manifest lane member).
 * PRIMARY KEY(binding, sequence) + UNIQUE(binding, path) make a lane position and
 * a migration file each recordable exactly once per binding.
 */
export const CREATE_HISTORY_SQL = `
CREATE TABLE IF NOT EXISTS ${MIGRATION_HISTORY_TABLE} (
  binding    TEXT NOT NULL,
  sequence   INTEGER NOT NULL,
  path       TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (binding, sequence),
  UNIQUE (binding, path)
);
`

/** Reconciliation states for a single planned migration. */
export const LEDGER_STATES = [
  "pending",              // no history, effect absent → apply
  "satisfied",            // history + effect agree → skip
  "history_without_schema", // recorded but the change is not in the schema → fail closed
  "schema_without_history", // change present but unrecorded (crash/manual) → fail closed
  "digest_mismatch",      // recorded digest ≠ manifest digest → fail closed
  "path_mismatch",        // recorded path ≠ manifest path for this sequence → fail closed
  "foreign_binding",      // a row from the other database's lane → fail closed
]

/** Create the ledger table if absent. Safe to call on every run. */
export function ensureHistoryTable(db) {
  db.exec(CREATE_HISTORY_SQL)
}

/**
 * Read the ledger rows for a binding. Returns metadata only, ordered by sequence.
 * Rows belonging to another binding are returned separately so a mixed history
 * (control rows in the tenant DB) fails closed rather than being silently ignored.
 */
export function readHistory(db, binding) {
  ensureHistoryTable(db)
  const all = db.prepare(`SELECT binding, sequence, path, sha256, applied_at FROM ${MIGRATION_HISTORY_TABLE} ORDER BY binding, sequence`).all()
  const own = []
  const foreign = []
  for (const r of all) {
    const row = { binding: String(r.binding), sequence: Number(r.sequence), path: String(r.path), sha256: String(r.sha256), appliedAt: String(r.applied_at) }
    if (row.binding === binding) own.push(row)
    else foreign.push(row)
  }
  return { own, foreign }
}

/** Does the `once` migration's effect probe hold? Metadata-only introspection. */
export function probeEffect(db, effect) {
  if (!effect || effect.type !== "column_exists") return false
  const cols = db.prepare(`SELECT name FROM pragma_table_info('${effect.table}')`).all()
  return cols.some((c) => String(c.name) === effect.column)
}

/**
 * Reconcile the manifest lane against the ledger and the real schema.
 *
 * Returns `{ ok, steps, failures }` where each step carries a deterministic state
 * from LEDGER_STATES. Any state other than `pending`/`satisfied` is an operator
 * action category and makes the whole reconciliation fail closed. Performs NO
 * writes and reads NO application rows.
 */
export function reconcileLane(db, manifest, binding) {
  const { own, foreign } = readHistory(db, binding)
  return reconcileFromState(manifest, binding, { own, foreign }, (effect) => probeEffect(db, effect))
}

/**
 * Pure reconciliation core: manifest lane × ledger rows × schema probe → states.
 *
 * Separated from any database handle so the SAME logic reconciles a local
 * node:sqlite database and a remote D1 read through Wrangler's JSON output.
 * `probe(effect) => boolean` answers "did this `once` migration's change land?".
 */
export function reconcileFromState(manifest, binding, history, probe) {
  const plan = buildPlan(manifest, binding)
  const { own, foreign } = history
  const failures = []
  const steps = []

  // A history belonging to another binding means a control and a tenant database
  // have been crossed — never reconcilable, always fail closed.
  if (foreign.length > 0) failures.push(`foreign_binding:${binding}`)

  const bySeq = new Map(own.map((r) => [r.sequence, r]))
  for (const step of plan) {
    const row = bySeq.get(step.sequence)
    const effectPresent = step.apply === "once" ? probe(step.effect) : null
    let state

    if (!row) {
      // Unrecorded. For `once`, the schema decides whether this is a clean pending
      // apply or an interrupted/manual one.
      if (step.apply === "once" && effectPresent) state = "schema_without_history"
      else state = "pending"
    } else if (row.path !== step.path) {
      state = "path_mismatch"
    } else if (row.sha256 !== step.sha256) {
      state = "digest_mismatch"
    } else if (step.apply === "once" && !effectPresent) {
      state = "history_without_schema"
    } else {
      state = "satisfied"
    }

    if (state !== "pending" && state !== "satisfied") failures.push(`${state}:${binding}:${step.name}`)
    steps.push({ binding, sequence: step.sequence, name: step.name, apply: step.apply, state })
  }

  // A recorded sequence with no manifest counterpart means the ledger is ahead of
  // (or divergent from) the committed manifest.
  for (const row of own) {
    if (!plan.some((s) => s.sequence === row.sequence)) failures.push(`unknown_history_sequence:${binding}:${row.sequence}`)
  }

  // Ordering: a later migration may not be satisfied while an earlier one is not.
  // This makes "a later migration cannot execute before all prior entries are
  // satisfied" a checked invariant rather than an emergent property of the loop.
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].state !== "satisfied") continue
    for (let j = 0; j < i; j++) {
      if (steps[j].state !== "satisfied") { failures.push(`out_of_order_history:${binding}:${steps[i].name}`); break }
    }
  }

  return { ok: failures.length === 0, steps, failures }
}

/**
 * Split a migration file into statements. Deliberately simple: migrations are pure
 * DDL (enforced by `scanMigrationSqlSafety`) with no `;` inside string literals.
 */
export function splitStatements(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Apply a binding's ordered lane through the ledger.
 *
 * Guarantees:
 *   - an empty database applies every required migration, 0006 included;
 *   - a `once` migration already recorded is skipped (never raw-replayed);
 *   - the DDL and its history row commit together (single transaction) — so a
 *     migration is NEVER recorded before it succeeds, and a failed migration is
 *     never recorded as successful;
 *   - order is deterministic (sequence order) and a reconciliation failure stops
 *     the lane before anything is applied.
 *
 * `now` is injectable so tests are deterministic. Returns applied step names.
 */
export function applyLaneWithLedger(db, manifest, binding, repoRoot, options = {}) {
  const { now = () => new Date().toISOString() } = options
  ensureHistoryTable(db)

  const reconciled = reconcileLane(db, manifest, binding)
  if (!reconciled.ok) {
    const err = new Error(`migration_ledger_unreconciled:${reconciled.failures.join(",")}`)
    err.failures = reconciled.failures
    throw err
  }

  const stateBySeq = new Map(reconciled.steps.map((s) => [s.sequence, s.state]))
  const applied = []
  const skipped = []

  for (const step of buildPlan(manifest, binding)) {
    // A `once` migration that is already satisfied must never be raw-replayed.
    if (step.apply === "once" && stateBySeq.get(step.sequence) === "satisfied") { skipped.push(step.name); continue }

    // Digest is re-verified at apply time against the pinned manifest value: the
    // bytes about to execute are the bytes that were reviewed.
    const resolved = resolveMigrationPath(repoRoot, step.path)
    if (!resolved.ok) throw new Error(`migration_path_unsafe:${resolved.failure}:${step.name}`)
    if (computeDigest(resolved.absPath) !== step.sha256) throw new Error(`migration_digest_mismatch:${step.name}`)
    const sql = readFileSync(resolved.absPath, "utf8")

    if (step.apply === "replay_safe") {
      // Replay-safe SQL needs no ledger row to be correct, but recording it keeps
      // the history complete and lets ordering be verified.
      db.exec(sql)
      if (stateBySeq.get(step.sequence) !== "satisfied") recordApplied(db, step, now())
      applied.push(step.name)
      continue
    }

    // `once`: DDL + history row in ONE transaction. If the DDL throws, the ledger
    // row is rolled back with it — nothing is recorded as applied that did not run.
    db.exec("BEGIN IMMEDIATE")
    try {
      for (const statement of splitStatements(sql)) db.exec(statement)
      recordApplied(db, step, now())
      db.exec("COMMIT")
    } catch (err) {
      try { db.exec("ROLLBACK") } catch { /* transaction already unwound */ }
      throw err
    }
    applied.push(step.name)
  }
  return { applied, skipped }
}

/** Insert the history row for a successfully applied migration. Metadata only. */
function recordApplied(db, step, appliedAt) {
  db.prepare(`INSERT INTO ${MIGRATION_HISTORY_TABLE} (binding, sequence, path, sha256, applied_at) VALUES (?, ?, ?, ?, ?)`)
    .run(step.binding, step.sequence, step.path, step.sha256, appliedAt)
}

const sqlLiteral = (v) => `'${String(v).replace(/'/g, "''")}'`

/**
 * The ledger INSERT as a literal statement, for the remote batch path (Wrangler's
 * `d1 execute --file` takes no bind parameters). Only manifest metadata is
 * interpolated — binding/sequence/path/sha256 come from the validated manifest and
 * are structurally constrained, never operator or application input.
 */
export function buildHistoryInsertSql(step, appliedAt) {
  return `INSERT INTO ${MIGRATION_HISTORY_TABLE} (binding, sequence, path, sha256, applied_at) VALUES (` +
    `${sqlLiteral(step.binding)}, ${Number(step.sequence)}, ${sqlLiteral(step.path)}, ${sqlLiteral(step.sha256)}, ${sqlLiteral(appliedAt)});`
}

/**
 * The atomic remote batch for one pending migration: the pinned migration SQL plus
 * its ledger row, in a single file. Used for `once` steps (where atomicity is
 * load-bearing) and for the first application of a `replay_safe` step.
 *
 * MECHANISM (verified against this repository's pinned Wrangler 4.99.0, not assumed):
 *   - D1 REJECTS explicit transaction control. `BEGIN IMMEDIATE; …; COMMIT;` in a
 *     `--file` fails with "To execute a transaction, please use the
 *     state.storage.transaction() … APIs instead of the SQL BEGIN TRANSACTION or
 *     SAVEPOINT statements". So the SQL must NOT contain BEGIN/COMMIT.
 *   - A multi-statement `--file` IS applied as ONE implicit atomic batch: a probe
 *     whose third statement violated a PRIMARY KEY left zero rows from the first
 *     two. Foreign keys are enforced (`PRAGMA foreign_keys` reports 1) and an
 *     orphan insert likewise rolls the whole batch back.
 * Therefore the atomic boundary is the single `--file` invocation itself, and the
 * migration is never marked applied unless its DDL committed in the same batch.
 */
export function buildAtomicMigrationBatchSql(migrationSql, step, appliedAt) {
  return [
    `-- P0-PERSIST-015 atomic once-migration batch: ${step.name} (GENERATED, TEMPORARY).`,
    "-- Single wrangler `d1 execute --file` = one implicit atomic D1 batch.",
    "-- No BEGIN/COMMIT: D1 rejects explicit transaction control (verified, Wrangler 4.99.0).",
    migrationSql.trimEnd(),
    buildHistoryInsertSql(step, appliedAt),
    "",
  ].join("\n")
}

/**
 * The ordered set of migrations a fresh remote apply would execute for a binding,
 * given a reconciliation. Safe: names + modes only, no IDs, no SQL.
 */
export function pendingSteps(reconciled) {
  return reconciled.steps.filter((s) => s.state === "pending").map((s) => ({ sequence: s.sequence, name: s.name, apply: s.apply }))
}

/** Every known binding's lane, applied through the ledger. */
export function applyAllLanesWithLedger(db, manifest, binding, repoRoot, options) {
  if (!KNOWN_BINDINGS.includes(binding)) throw new Error(`unknown_binding:${binding}`)
  return applyLaneWithLedger(db, manifest, binding, repoRoot, options)
}

/** Absolute path of a lane step (path-safety enforced). Used by the apply command. */
export function laneStepAbsPath(repoRoot, step) {
  const resolved = resolveMigrationPath(repoRoot, step.path)
  if (!resolved.ok) throw new Error(`migration_path_unsafe:${resolved.failure}:${step.name}`)
  return resolvePath(resolved.absPath)
}
