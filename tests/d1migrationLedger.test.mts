/**
 * P0-PERSIST-015 — applied-once migration ledger (Issue #155).
 *
 * The `deferred` workaround existed because the architecture assumed every active
 * migration is raw-SQL replay-idempotent. That is false for additive migrations
 * (SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), and hiding the
 * migration produced a bootstrap schema the application could not use.
 *
 * The ledger replaces that assumption: a `once` migration is an ordered, ACTIVE
 * lane member applied exactly once and recorded. These tests prove the guarantees
 * that make replaying the lane safe, and that every disagreement between the ledger
 * and the real schema fails closed with an operator action category.
 *
 * Real SQLite (node:sqlite) throughout.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync, writeFileSync, rmSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, buildPlan } from "../scripts/lib/d1MigrationManifest.mjs"
import {
  MIGRATION_HISTORY_TABLE, applyLaneWithLedger, reconcileLane, readHistory,
  ensureHistoryTable, probeEffect, buildAtomicMigrationBatchSql, buildHistoryInsertSql,
} from "../scripts/lib/d1MigrationLedger.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const TENANT = "TENANT_DB_DEFAULT"
const CONTROL = "CONTROL_DB"
const SIX = "0006_action_preview_creator.sql"

function manifest() {
  const r = loadManifest(REPO_ROOT)
  if (!r.ok) throw new Error(`manifest unreadable: ${r.error}`)
  return r.manifest
}
const sixStep = () => buildPlan(manifest(), TENANT).find((s) => s.name === SIX)!
const columns = (db: DatabaseSync, table: string) =>
  db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((c) => (c as { name: string }).name)

/** An empty DB with the tenant lane fully applied through the ledger. */
function migratedTenantDb() {
  const db = new DatabaseSync(":memory:")
  applyLaneWithLedger(db, manifest(), TENANT, REPO_ROOT)
  return db
}

// ─── 4. an empty database gets EVERY required migration ──────────

test("4. an empty database applies every required migration — the bootstrapped schema includes created_by_user_id", () => {
  const db = migratedTenantDb()
  assert.ok(columns(db, "action_previews").includes("created_by_user_id"), "a clean bootstrap MUST produce the column the repository inserts")
  const history = readHistory(db, TENANT).own
  assert.deepEqual(history.map((h) => h.sequence), [1, 2, 3, 4], "every lane step is recorded, in order")
  db.close()
})

// ─── 5. a second run SKIPS the once-only migration ───────────────

test("5. an already-applied once-only migration is skipped safely — replaying the lane never attempts 0006 again", () => {
  const db = migratedTenantDb()
  const second = applyLaneWithLedger(db, manifest(), TENANT, REPO_ROOT)
  assert.deepEqual(second.skipped, [SIX])
  assert.equal(second.applied.includes(SIX), false)
  // A third run behaves identically — the skip is stable, not a one-off.
  assert.deepEqual(applyLaneWithLedger(db, manifest(), TENANT, REPO_ROOT).skipped, [SIX])
  // Still exactly one history row for 0006 (no duplicate records).
  assert.equal(readHistory(db, TENANT).own.filter((h) => h.path.includes("0006")).length, 1)
  db.close()
})

// ─── 7. schema/history disagreements resolve deterministically ───

test("7. a MISSING history entry with the column already present is handled deterministically (schema_without_history)", () => {
  const db = migratedTenantDb()
  // The column exists, but its ledger row is gone — e.g. a crash between the DDL
  // and the record, or a manual apply. Adopting it silently could mask a partial
  // migration, so it fails closed with an operator action category.
  db.exec(`DELETE FROM ${MIGRATION_HISTORY_TABLE} WHERE sequence = 4`)
  const result = reconcileLane(db, manifest(), TENANT)
  assert.equal(result.ok, false)
  assert.deepEqual(result.failures, [`schema_without_history:${TENANT}:${SIX}`])
  assert.equal(result.steps.find((s) => s.name === SIX)!.state, "schema_without_history")
  // Deterministic: the same input always yields the same state, and applying the
  // lane refuses rather than raw-replaying 0006 (which would throw).
  assert.equal(reconcileLane(db, manifest(), TENANT).steps.find((s) => s.name === SIX)!.state, "schema_without_history")
  assert.throws(() => applyLaneWithLedger(db, manifest(), TENANT, REPO_ROOT), /migration_ledger_unreconciled:schema_without_history/)
  db.close()
})

test("a history entry whose schema change is ABSENT fails closed (history_without_schema)", () => {
  const db = new DatabaseSync(":memory:")
  applyLaneWithLedger(db, manifest(), TENANT, REPO_ROOT)
  // Recorded as applied, but the column is not there (an interrupted execution
  // that was wrongly recorded, or an out-of-band schema rollback).
  db.exec("ALTER TABLE action_previews DROP COLUMN created_by_user_id")
  const result = reconcileLane(db, manifest(), TENANT)
  assert.equal(result.ok, false)
  assert.deepEqual(result.failures, [`history_without_schema:${TENANT}:${SIX}`])
  db.close()
})

// ─── 8. digest / path / sequence integrity ───────────────────────

test("8. a history entry with the WRONG digest fails closed", () => {
  const db = migratedTenantDb()
  db.prepare(`UPDATE ${MIGRATION_HISTORY_TABLE} SET sha256 = ? WHERE sequence = 4`).run("f".repeat(64))
  const result = reconcileLane(db, manifest(), TENANT)
  assert.equal(result.ok, false)
  assert.deepEqual(result.failures, [`digest_mismatch:${TENANT}:${SIX}`])
  assert.throws(() => applyLaneWithLedger(db, manifest(), TENANT, REPO_ROOT), /migration_ledger_unreconciled:digest_mismatch/)
  db.close()
})

test("a history entry with the wrong PATH or an unknown SEQUENCE fails closed", () => {
  const wrongPath = migratedTenantDb()
  wrongPath.prepare(`UPDATE ${MIGRATION_HISTORY_TABLE} SET path = ? WHERE sequence = 4`).run("migrations/0006_renamed_behind_our_back.sql")
  assert.deepEqual(reconcileLane(wrongPath, manifest(), TENANT).failures, [`path_mismatch:${TENANT}:${SIX}`])
  wrongPath.close()

  // The ledger's own UNIQUE(binding, path) makes recording one migration file
  // twice in a lane impossible in the first place.
  const dupPath = migratedTenantDb()
  assert.throws(
    () => dupPath.prepare(`UPDATE ${MIGRATION_HISTORY_TABLE} SET path = ? WHERE sequence = 4`).run("migrations/0002_tenant_core.sql"),
    /UNIQUE constraint failed/,
  )
  dupPath.close()

  const unknownSeq = migratedTenantDb()
  unknownSeq.prepare(`INSERT INTO ${MIGRATION_HISTORY_TABLE} (binding, sequence, path, sha256, applied_at) VALUES (?, ?, ?, ?, ?)`)
    .run(TENANT, 99, "migrations/9999_from_the_future.sql", "a".repeat(64), "2026-07-16T00:00:00.000Z")
  assert.ok(reconcileLane(unknownSeq, manifest(), TENANT).failures.includes(`unknown_history_sequence:${TENANT}:99`))
  unknownSeq.close()
})

// ─── ordering ────────────────────────────────────────────────────

test("migration order is deterministic and a later migration cannot be satisfied before its predecessors", () => {
  const db = migratedTenantDb()
  assert.deepEqual(reconcileLane(db, manifest(), TENANT).steps.map((s) => s.sequence), [1, 2, 3, 4])

  // 0006 recorded while an EARLIER step is not: the ledger is out of order.
  db.exec(`DELETE FROM ${MIGRATION_HISTORY_TABLE} WHERE sequence = 2`)
  const result = reconcileLane(db, manifest(), TENANT)
  assert.equal(result.ok, false)
  assert.ok(result.failures.some((f) => f.startsWith(`out_of_order_history:${TENANT}:`)), `expected an ordering failure, got ${result.failures.join(",")}`)
  db.close()
})

// ─── control / tenant histories cannot mix ───────────────────────

test("Control DB and Tenant DB histories cannot be mixed", () => {
  const db = migratedTenantDb()
  // A control-lane row appearing in the tenant database means the two databases
  // have been crossed — never reconcilable.
  db.prepare(`INSERT INTO ${MIGRATION_HISTORY_TABLE} (binding, sequence, path, sha256, applied_at) VALUES (?, ?, ?, ?, ?)`)
    .run(CONTROL, 1, "migrations/0001_control_db.sql", "b".repeat(64), "2026-07-16T00:00:00.000Z")
  const result = reconcileLane(db, manifest(), TENANT)
  assert.equal(result.ok, false)
  assert.ok(result.failures.includes(`foreign_binding:${TENANT}`))
  assert.throws(() => applyLaneWithLedger(db, manifest(), TENANT, REPO_ROOT), /migration_ledger_unreconciled/)
  db.close()

  // The two lanes are independent: a control database's history contains only
  // control rows, and knows nothing of the tenant lane.
  const control = new DatabaseSync(":memory:")
  applyLaneWithLedger(control, manifest(), CONTROL, REPO_ROOT)
  const history = readHistory(control, CONTROL)
  assert.deepEqual(history.foreign, [])
  for (const row of history.own) assert.equal(row.binding, CONTROL)
  assert.equal(history.own.some((h) => h.path.includes("0006")), false, "the control lane never sees a tenant migration")
  control.close()
})

// ─── never recorded before success ───────────────────────────────

test("a FAILED once-only migration is not recorded as successful, and its partial DDL is rolled back", () => {
  // A synthetic `once` migration whose FIRST statement succeeds and whose SECOND
  // fails. Atomicity requires both that no history row survives AND that the first
  // statement's column is gone — otherwise a half-applied migration would look
  // pending forever, or (worse) be recorded as done.
  const probeFile = resolve(REPO_ROOT, "migrations/_once_failure_probe_test.sql")
  const probeSql = "ALTER TABLE action_previews ADD COLUMN probe_col TEXT;\nALTER TABLE no_such_table ADD COLUMN x TEXT;\n"
  try {
    writeFileSync(probeFile, probeSql)
    const variant = JSON.parse(JSON.stringify(manifest()))
    variant.lanes[TENANT] = [
      variant.lanes[TENANT][0], // 0002 (replay_safe) creates action_previews
      {
        sequence: 2, binding: TENANT, path: "migrations/_once_failure_probe_test.sql",
        sha256: createHash("sha256").update(readFileSync(probeFile)).digest("hex"),
        kind: "schema", apply: "once",
        effect: { type: "column_exists", table: "action_previews", column: "probe_col" },
      },
    ]

    const db = new DatabaseSync(":memory:")
    assert.throws(() => applyLaneWithLedger(db, variant, TENANT, REPO_ROOT), /no such table/i)

    // Never recorded: SQL is not marked applied before it succeeds.
    const recorded = db.prepare(`SELECT COUNT(*) AS c FROM ${MIGRATION_HISTORY_TABLE} WHERE sequence = 2`).get() as { c: number }
    assert.equal(Number(recorded.c), 0, "a migration that did not succeed must NEVER be recorded as applied")
    // And rolled back: the successful first statement did not survive either.
    assert.equal(columns(db, "action_previews").includes("probe_col"), false, "a failed once-migration must leave no partial schema change")
    db.close()
  } finally {
    rmSync(probeFile, { force: true })
  }
})

test("the effect probe answers the real schema question", () => {
  const db = migratedTenantDb()
  assert.equal(probeEffect(db, sixStep().effect), true)
  assert.equal(probeEffect(db, { type: "column_exists", table: "action_previews", column: "no_such_column" }), false)
  assert.equal(probeEffect(db, undefined), false)
  db.close()
})

// ─── the remote atomic batch ─────────────────────────────────────

test("the remote once-migration batch pairs the pinned SQL with its ledger row in ONE file", () => {
  const step = sixStep()
  const batch = buildAtomicMigrationBatchSql("ALTER TABLE action_previews ADD COLUMN created_by_user_id TEXT;", step, "2026-07-16T00:00:00.000Z")
  assert.match(batch, /ALTER TABLE action_previews ADD COLUMN created_by_user_id TEXT;/)
  assert.match(batch, new RegExp(`INSERT INTO ${MIGRATION_HISTORY_TABLE}`))
  // D1 rejects explicit transaction control — the single --file batch IS the
  // atomic boundary, so the file must not try to open one itself.
  assert.doesNotMatch(batch.split("\n").filter((l) => !l.startsWith("--")).join("\n"), /\bBEGIN\b|\bCOMMIT\b/i)
  // The recorded row is manifest metadata only.
  const insert = buildHistoryInsertSql(step, "2026-07-16T00:00:00.000Z")
  assert.match(insert, /'TENANT_DB_DEFAULT', 4, 'migrations\/0006_action_preview_creator\.sql'/)
  assert.match(insert, /'334c2b08abd361454d00d09d29dcbd12a379701a3da9a0451a985859614e13b9'/)
})

test("applying the remote batch really does record the migration exactly once (real SQLite)", () => {
  const db = new DatabaseSync(":memory:")
  ensureHistoryTable(db)
  db.exec(readFileSync(resolve(REPO_ROOT, "migrations/0002_tenant_core.sql"), "utf8"))
  const step = sixStep()
  const batch = buildAtomicMigrationBatchSql(
    readFileSync(resolve(REPO_ROOT, step.path), "utf8"), step, "2026-07-16T00:00:00.000Z")
  for (const statement of batch.replace(/--[^\n]*/g, "").split(";").map((s) => s.trim()).filter(Boolean)) db.exec(statement)
  assert.ok(columns(db, "action_previews").includes("created_by_user_id"))
  const rows = readHistory(db, TENANT).own
  assert.equal(rows.length, 1)
  assert.equal(rows[0].sha256, step.sha256)
  db.close()
})
