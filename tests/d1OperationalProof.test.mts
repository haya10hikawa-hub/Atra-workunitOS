/**
 * Hermetic D1 operational proof (P0-FIX-D1-OPERATIONAL-CONTRACT).
 *
 * A single, invocation-owned, in-memory proof that the Alpha persistence contract
 * holds end-to-end WITHOUT any network, remote D1, secret, or stored-row
 * disclosure. It emits the required boolean evidence and asserts each is true:
 *
 *   fresh_apply, replay_noop, partial_upgrade, checksum_drift_rejected,
 *   control_schema_valid, tenant_schema_valid, tenant_routing_valid,
 *   control_db_fallback_absent, cross_tenant_read_blocked,
 *   cross_tenant_write_blocked, cleanup
 *
 * The JWT identity bootstrap + authenticated Worker request legs of the operator
 * proof are covered by tests/localJwtSmokeRunner.test.mts (the merged hermetic
 * smoke runner); this file proves the persistence-contract legs.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, cpSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { applyAll, verifyAll, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationRunner.mjs"
import { loadManifest } from "../scripts/lib/d1MigrationManifest.mjs"
import { reconcileLane, applyLaneWithLedger } from "../scripts/lib/d1MigrationLedger.mjs"

import { SqliteD1Database, TENANT_DB_MIGRATIONS } from "./helpers/sqliteD1.ts"
import { seedTenantDatabaseRow } from "./helpers/registrySeed.ts"
import { D1TenantDbResolver } from "../app/lib/persistence/tenantDbResolver.ts"
import { D1WorkUnitRepository } from "../app/lib/persistence/d1/workUnitRepository.ts"
import type { TenantDbContext, InboxWorkUnitRow } from "../app/lib/persistence/types.ts"

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
// Isolated COPY of migrations/ — see tests/d1MigrationRunner.test.mts for why.
const REPO_ROOT = (() => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "atra-mig-proof-")))
  cpSync(join(SRC_ROOT, "migrations"), join(dir, "migrations"), { recursive: true })
  return dir
})()
const FIXED_NOW = () => "2026-01-01T00:00:00.000Z"

const CONTROL_MIGRATIONS = ["migrations/0001_control_db.sql", "migrations/0004_control_auth_workspace.sql"]

function workUnit(id: string, tenantIdLabel: string): InboxWorkUnitRow {
  return {
    id,
    tenantId: tenantIdLabel as InboxWorkUnitRow["tenantId"],
    title: "t",
    kind: "task",
    priority: "normal",
    sourceProvider: "test",
    reason: "r",
    evidence: "e",
    nextAction: "n",
    status: "inbox",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

test("hermetic operational proof: Alpha persistence contract holds end-to-end", async () => {
  const proof: Record<string, boolean> = {
    fresh_apply: false,
    replay_noop: false,
    partial_upgrade: false,
    checksum_drift_rejected: false,
    control_schema_valid: false,
    tenant_schema_valid: false,
    tenant_routing_valid: false,
    control_db_fallback_absent: false,
    cross_tenant_read_blocked: false,
    cross_tenant_write_blocked: false,
    cleanup: false,
  }

  // ── Migration reproducibility (fresh / replay / partial / drift / schema) ──
  const migHandles: Record<string, DatabaseSync> = {}
  for (const b of KNOWN_BINDINGS) migHandles[b] = new DatabaseSync(":memory:")
  const dbFor = (b: string) => migHandles[b]

  const fresh = applyAll(dbFor, REPO_ROOT, { now: FIXED_NOW })
  proof.fresh_apply = fresh.ok && KNOWN_BINDINGS.every((b) => fresh.perBinding[b].applied.length > 0)

  const sigBefore = KNOWN_BINDINGS.map((b) => schemaText(migHandles[b]))
  applyAll(dbFor, REPO_ROOT, { now: FIXED_NOW })
  const sigAfter = KNOWN_BINDINGS.map((b) => schemaText(migHandles[b]))
  proof.replay_noop = sigBefore.every((s, i) => s === sigAfter[i])

  const verified = verifyAll(dbFor, REPO_ROOT)
  proof.control_schema_valid = verified.ok && verified.perBinding["CONTROL_DB"].schema.ok
  proof.tenant_schema_valid = verified.ok && verified.perBinding["TENANT_DB_DEFAULT"].schema.ok

  // Partial upgrade: roll the tenant DB to pre-0006, reconcile → pending, re-apply.
  const tenantMig = migHandles["TENANT_DB_DEFAULT"]
  tenantMig.exec("ALTER TABLE action_previews DROP COLUMN created_by_user_id")
  tenantMig.prepare("DELETE FROM __atra_d1_migrations WHERE binding = ? AND sequence = ?").run("TENANT_DB_DEFAULT", 4)
  const loadedManifest = loadManifest(REPO_ROOT)
  assert.ok(loadedManifest.ok)
  const manifest = loadedManifest.manifest
  const pendingBefore = reconcileLane(tenantMig, manifest, "TENANT_DB_DEFAULT")
    .steps.find((s: { name: string }) => s.name === "0006_action_preview_creator.sql")
  const reapplied = applyLaneWithLedger(tenantMig, manifest, "TENANT_DB_DEFAULT", REPO_ROOT, { now: FIXED_NOW })
  proof.partial_upgrade = pendingBefore?.state === "pending" && reapplied.applied.includes("0006_action_preview_creator.sql")

  // Checksum drift: a mutated manifest checksum for an applied migration is rejected.
  const drifted = structuredClone(manifest)
  drifted.lanes["TENANT_DB_DEFAULT"][0].sha256 = "0".repeat(64)
  const driftReconcile = reconcileLane(tenantMig, drifted, "TENANT_DB_DEFAULT")
  let driftThrew = false
  try { applyLaneWithLedger(tenantMig, drifted, "TENANT_DB_DEFAULT", REPO_ROOT, { now: FIXED_NOW }) } catch { driftThrew = true }
  proof.checksum_drift_rejected = !driftReconcile.ok && driftThrew

  for (const b of KNOWN_BINDINGS) migHandles[b].close()

  // ── Tenant routing + no CONTROL_DB fallback (resolver) ──
  const controlD1 = new SqliteD1Database({ migrations: CONTROL_MIGRATIONS })
  const tenantD1 = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS })
  await seedTenant(controlD1, "tenant-A", "tenant-a")
  await seedTenantDatabaseRow(controlD1, "tenant-A", { schemaVersion: "2" })

  const resolver = new D1TenantDbResolver({ controlDb: controlD1, tenantDb: tenantD1 })
  const routed = await resolver.resolveTenantDb("tenant-A" as never)
  proof.tenant_routing_valid =
    routed.ok === true &&
    routed.binding === "TENANT_DB_DEFAULT" &&
    routed.schemaVersion === "2" &&
    routed.ctx.db === tenantD1
  // A tenant with NO registry mapping must fail closed — never the control DB.
  await seedTenant(controlD1, "tenant-nomap", "tenant-nomap")
  const unmapped = await resolver.resolveTenantDb("tenant-nomap" as never)
  proof.control_db_fallback_absent =
    (routed.ok ? routed.ctx.db !== controlD1 : false) && unmapped.ok === false

  // ── Cross-tenant isolation on the SHARED tenant DB ──
  const repo = new D1WorkUnitRepository(tenantD1)
  const ctxA = { tenantId: "tenant-A", db: tenantD1 } as unknown as TenantDbContext
  const ctxB = { tenantId: "tenant-B", db: tenantD1 } as unknown as TenantDbContext

  // Server-controlled tenant id on insert: the row CLAIMS tenant-B, but ctxA writes it.
  await repo.create(ctxA, workUnit("wu-1", "tenant-B"))
  const storedTenant = (tenantD1.rawRow("SELECT tenant_id FROM work_units WHERE id = ?", "wu-1") ?? {}) as { tenant_id?: string }
  const serverControlledInsert = storedTenant.tenant_id === "tenant-A"

  const readByB = await repo.findById(ctxB, "wu-1")
  const readByA = await repo.findById(ctxA, "wu-1")
  proof.cross_tenant_read_blocked = serverControlledInsert && readByB === null && readByA !== null

  // Cross-tenant write: tenant B cannot mutate tenant A's row.
  await repo.updateStatus(ctxB, "wu-1", "done")
  const afterWrite = (tenantD1.rawRow("SELECT status FROM work_units WHERE id = ?", "wu-1") ?? {}) as { status?: string }
  proof.cross_tenant_write_blocked = afterWrite.status === "inbox"

  controlD1.close()
  tenantD1.close()
  proof.cleanup = true

  // Emit safe evidence (booleans only — no IDs, secrets, identities, or rows).
  console.log("D1 operational proof:", JSON.stringify(proof))
  for (const [k, v] of Object.entries(proof)) assert.equal(v, true, `proof flag ${k} must be true`)
})

/** Seed a full tenants row (real control schema requires name + unique slug). */
async function seedTenant(controlD1: SqliteD1Database, id: string, slug: string): Promise<void> {
  await controlD1
    .prepare("INSERT INTO tenants (id, name, slug, status) VALUES (?, ?, ?, ?)")
    .bind(id, `Tenant ${id}`, slug, "active")
    .run()
}

function schemaText(db: DatabaseSync): string {
  const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string; sql: string }[]
  return rows.map((r) => `${r.name}::${String(r.sql).replace(/\s+/g, " ")}`).join("\n")
}
