/**
 * Hermetic D1 operational proof (P0-FIX-D1-*).
 *
 * A single, invocation-owned, in-memory proof that the Alpha persistence contract
 * holds end-to-end WITHOUT any network, remote D1, secret, or stored-row
 * disclosure. It uses ONE connected database topology (CONTROL_DB + the routed
 * TENANT_DB_DEFAULT) for the coupling/routing/write/isolation legs — the coupling
 * reads the ACTUAL stored registry row, not a supplied constant — and a separate
 * throwaway pair for the destructive migration-mechanics legs (partial / drift).
 *
 * Emits safe boolean evidence and asserts each is true. No stored row, secret,
 * identity, tenant id, or database id is printed.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, cpSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { applyAll, verifyAll, verifyTenantDatabaseCoupling, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationRunner.mjs"
import { loadManifest } from "../scripts/lib/d1MigrationManifest.mjs"
import { reconcileLane, applyLaneWithLedger } from "../scripts/lib/d1MigrationLedger.mjs"

import { d1OverHandle } from "./helpers/sqliteD1.ts"
import { seedTenantDatabaseRow } from "./helpers/registrySeed.ts"
import { D1TenantDbResolver } from "../app/lib/persistence/tenantDbResolver.ts"
import { D1WorkUnitRepository } from "../app/lib/persistence/d1/workUnitRepository.ts"
import { D1ActionPreviewRepository } from "../app/lib/persistence/d1/actionPreviewRepository.ts"
import type { TenantDbContext, InboxWorkUnitRow, ActionPreviewRow } from "../app/lib/persistence/types.ts"

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
// Isolated COPY of migrations/ — see tests/d1MigrationRunner.test.mts for why.
const REPO_ROOT = (() => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "atra-mig-proof-")))
  cpSync(join(SRC_ROOT, "migrations"), join(dir, "migrations"), { recursive: true })
  return dir
})()
const FIXED_NOW = () => "2026-01-01T00:00:00.000Z"
const TENANT_ID = "tenant-A"

function workUnit(id: string, tenantIdLabel: string): InboxWorkUnitRow {
  return {
    id, tenantId: tenantIdLabel as InboxWorkUnitRow["tenantId"], title: "t", kind: "task", priority: "normal",
    sourceProvider: "test", reason: "r", evidence: "e", nextAction: "n", status: "inbox",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function preview(id: string, tenantIdLabel: string): ActionPreviewRow {
  return {
    id, tenantId: tenantIdLabel as ActionPreviewRow["tenantId"], workUnitId: "wu-1", actionType: "internal_task",
    targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
    targetHash: "", payloadHash: "", createdAt: "2026-01-01T00:00:00.000Z", creatorUserId: "user-1" as ActionPreviewRow["creatorUserId"],
  }
}

function seedTenantRowRaw(control: DatabaseSync, id: string, slug: string): void {
  control.prepare("INSERT INTO tenants (id, name, slug, status) VALUES (?, ?, ?, ?)").run(id, `Tenant ${id}`, slug, "active")
}

function schemaText(db: DatabaseSync): string {
  const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string; sql: string }[]
  return rows.map((r) => `${r.name}::${String(r.sql).replace(/\s+/g, " ")}`).join("\n")
}

test("hermetic operational proof: Alpha persistence contract holds end-to-end", async () => {
  const proof: Record<string, boolean> = {
    fresh_apply: false, replay_noop: false, partial_upgrade: false, checksum_drift_rejected: false,
    control_schema_valid: false, tenant_schema_valid: false,
    registry_row_present: false, registry_mapping_active: false, registry_version_matches_manifest: false,
    ledger_matches_manifest: false, physical_schema_matches_contract: false, binding_matches_contract: false,
    tenant_routing_valid: false, control_db_fallback_absent: false, action_preview_write_ok: false,
    cross_tenant_read_blocked: false, cross_tenant_write_blocked: false, cleanup: false,
  }

  // ── ONE connected topology: CONTROL_DB + TENANT_DB_DEFAULT ──
  const control = new DatabaseSync(":memory:")
  const tenant = new DatabaseSync(":memory:")
  const dbFor = (b: string) => (b === "CONTROL_DB" ? control : tenant)

  // 1+2. Apply the CONTROL and TENANT canonical lanes (via the ledger).
  const fresh = applyAll(dbFor, REPO_ROOT, { now: FIXED_NOW })
  proof.fresh_apply = fresh.ok && KNOWN_BINDINGS.every((b) => fresh.perBinding[b].applied.length > 0)

  // replay is a schema no-op.
  const sigBefore = [schemaText(control), schemaText(tenant)]
  applyAll(dbFor, REPO_ROOT, { now: FIXED_NOW })
  proof.replay_noop = [schemaText(control), schemaText(tenant)].every((s, i) => s === sigBefore[i])

  const verified = verifyAll(dbFor, REPO_ROOT)
  proof.control_schema_valid = verified.ok && verified.perBinding["CONTROL_DB"].schema.ok
  proof.tenant_schema_valid = verified.ok && verified.perBinding["TENANT_DB_DEFAULT"].schema.ok

  // 3+4. Seed one active tenant + one active tenant_databases mapping (canonical).
  const controlD1 = d1OverHandle(control)
  const tenantD1 = d1OverHandle(tenant)
  seedTenantRowRaw(control, TENANT_ID, "tenant-a")
  await seedTenantDatabaseRow(controlD1, TENANT_ID, {}) // schema_version defaults to canonical

  // 5+7+8. Couple the ACTUAL stored registry row to migration evidence for the
  // SAME control/tenant handles the routing proof uses. The function itself reads
  // tenant_databases.schema_version — no constant is passed as the registry value.
  const coupling = verifyTenantDatabaseCoupling({ controlDb: control, tenantDb: tenant, tenantId: TENANT_ID, repoRoot: REPO_ROOT })
  proof.registry_row_present = coupling.registry_row_present
  proof.registry_mapping_active = coupling.registry_mapping_active
  proof.registry_version_matches_manifest = coupling.registry_version_matches_manifest
  proof.ledger_matches_manifest = coupling.ledger_matches_manifest
  proof.physical_schema_matches_contract = coupling.physical_schema_matches_contract
  proof.binding_matches_contract = coupling.binding_matches_contract

  // 6. Resolve that tenant to the SAME TENANT_DB_DEFAULT handle — never CONTROL_DB.
  const resolver = new D1TenantDbResolver({ controlDb: controlD1, tenantDb: tenantD1 })
  const routed = await resolver.resolveTenantDb(TENANT_ID as never)
  proof.tenant_routing_valid = routed.ok === true && routed.binding === "TENANT_DB_DEFAULT" && routed.ctx.db === tenantD1
  seedTenantRowRaw(control, "tenant-nomap", "tenant-nomap")
  const unmapped = await resolver.resolveTenantDb("tenant-nomap" as never)
  proof.control_db_fallback_absent = (routed.ok ? routed.ctx.db !== controlD1 : false) && unmapped.ok === false

  // 9. Execute the current ActionPreview repository write against the routed DB.
  const previews = new D1ActionPreviewRepository(tenantD1)
  const ctxA = { tenantId: TENANT_ID, db: tenantD1 } as unknown as TenantDbContext
  await previews.create(ctxA, preview("ap-1", TENANT_ID))
  const storedCreator = tenant.prepare("SELECT created_by_user_id FROM action_previews WHERE id = ?").get("ap-1") as { created_by_user_id?: string } | undefined
  proof.action_preview_write_ok = storedCreator?.created_by_user_id === "user-1"

  // 10. Cross-tenant isolation on the SHARED tenant DB.
  const work = new D1WorkUnitRepository(tenantD1)
  const ctxB = { tenantId: "tenant-B", db: tenantD1 } as unknown as TenantDbContext
  await work.create(ctxA, workUnit("wu-1", "tenant-B")) // row CLAIMS tenant-B; ctxA writes it
  const storedTenant = tenant.prepare("SELECT tenant_id FROM work_units WHERE id = ?").get("wu-1") as { tenant_id?: string } | undefined
  const serverControlledInsert = storedTenant?.tenant_id === TENANT_ID
  const readByB = await work.findById(ctxB, "wu-1")
  const readByA = await work.findById(ctxA, "wu-1")
  proof.cross_tenant_read_blocked = serverControlledInsert && readByB === null && readByA !== null
  await work.updateStatus(ctxB, "wu-1", "done")
  const afterWrite = tenant.prepare("SELECT status FROM work_units WHERE id = ?").get("wu-1") as { status?: string } | undefined
  proof.cross_tenant_write_blocked = afterWrite?.status === "inbox"

  control.close()
  tenant.close()

  // ── Separate throwaway pair: destructive migration mechanics ──
  const migHandles: Record<string, DatabaseSync> = {}
  for (const b of KNOWN_BINDINGS) migHandles[b] = new DatabaseSync(":memory:")
  applyAll((b: string) => migHandles[b], REPO_ROOT, { now: FIXED_NOW })
  const tenantMig = migHandles["TENANT_DB_DEFAULT"]
  const loaded = loadManifest(REPO_ROOT)
  assert.ok(loaded.ok)
  const manifest = loaded.manifest

  // Partial upgrade: roll to pre-0006, reconcile → pending, re-apply only 0006.
  tenantMig.exec("ALTER TABLE action_previews DROP COLUMN created_by_user_id")
  tenantMig.prepare("DELETE FROM __atra_d1_migrations WHERE binding = ? AND sequence = ?").run("TENANT_DB_DEFAULT", 4)
  const pendingBefore = reconcileLane(tenantMig, manifest, "TENANT_DB_DEFAULT")
    .steps.find((s: { name: string }) => s.name === "0006_action_preview_creator.sql")
  const reapplied = applyLaneWithLedger(tenantMig, manifest, "TENANT_DB_DEFAULT", REPO_ROOT, { now: FIXED_NOW })
  proof.partial_upgrade = pendingBefore?.state === "pending" && reapplied.applied.includes("0006_action_preview_creator.sql")

  // Checksum drift: a mutated applied-migration checksum is rejected.
  const drifted = structuredClone(manifest)
  drifted.lanes["TENANT_DB_DEFAULT"][0].sha256 = "0".repeat(64)
  const driftReconcile = reconcileLane(tenantMig, drifted, "TENANT_DB_DEFAULT")
  let driftThrew = false
  try { applyLaneWithLedger(tenantMig, drifted, "TENANT_DB_DEFAULT", REPO_ROOT, { now: FIXED_NOW }) } catch { driftThrew = true }
  proof.checksum_drift_rejected = !driftReconcile.ok && driftThrew

  for (const b of KNOWN_BINDINGS) migHandles[b].close()
  proof.cleanup = true

  console.log("D1 operational proof:", JSON.stringify(proof))
  for (const [k, v] of Object.entries(proof)) assert.equal(v, true, `proof flag ${k} must be true`)
})
