/**
 * Tenant schema compatibility (P0-FIX-D1-CONTRACT-AUTHORITY).
 *
 * Proves REPOSITORY compatibility, not just version-string equality:
 *   - the runtime canonical version cannot drift from the manifest authority;
 *   - a pre-0006 physical schema (registry schema_version "1") is rejected BEFORE
 *     any ActionPreview write, and that write really would fail on such a schema;
 *   - the complete canonical schema (registry "2") resolves AND supports the
 *     ActionPreview insert of created_by_user_id;
 *   - the registry version is coupled to migration evidence (manifest + ledger +
 *     schema contract).
 * No registry value, migration SQL, table contents, or database id is printed.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, cpSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { applyAll, verifyTenantDatabaseCoupling, canonicalTenantSchemaVersion } from "../scripts/lib/d1MigrationRunner.mjs"
import { loadManifest, tenantRegistrySchemaVersion } from "../scripts/lib/d1MigrationManifest.mjs"
import { SqliteD1Database, TENANT_DB_MIGRATIONS } from "./helpers/sqliteD1.ts"
import { seedTenantDatabaseRow } from "./helpers/registrySeed.ts"
import { D1TenantDbResolver } from "../app/lib/persistence/tenantDbResolver.ts"
import { D1ActionPreviewRepository } from "../app/lib/persistence/d1/actionPreviewRepository.ts"
import { CANONICAL_TENANT_SCHEMA_VERSION } from "../app/lib/persistence/tenantSchemaVersion.ts"
import type { TenantDbContext, ActionPreviewRow } from "../app/lib/persistence/types.ts"

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const REPO_ROOT = (() => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "atra-schema-compat-")))
  cpSync(join(SRC_ROOT, "migrations"), join(dir, "migrations"), { recursive: true })
  return dir
})()

const CONTROL_MIGRATIONS = ["migrations/0001_control_db.sql", "migrations/0004_control_auth_workspace.sql"]
const PRE_0006_TENANT_MIGRATIONS = ["migrations/0002_tenant_core.sql", "migrations/0003_tenant_persistence_foundation.sql"]

async function seedTenant(controlD1: SqliteD1Database, id: string, slug: string): Promise<void> {
  await controlD1.prepare("INSERT INTO tenants (id, name, slug, status) VALUES (?, ?, ?, ?)").bind(id, `Tenant ${id}`, slug, "active").run()
}

function preview(id: string, tenantIdLabel: string): ActionPreviewRow {
  return {
    id, tenantId: tenantIdLabel as ActionPreviewRow["tenantId"], workUnitId: "wu-1", actionType: "internal_task",
    targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
    targetHash: "", payloadHash: "", createdAt: "2026-01-01T00:00:00.000Z", creatorUserId: "user-1" as ActionPreviewRow["creatorUserId"],
  }
}

// ─── Phase 2: manifest is the version authority (no drift) ───────

test("canonical runtime version cannot drift from the manifest authority", () => {
  const loaded = loadManifest(REPO_ROOT)
  assert.ok(loaded.ok)
  const registry = loaded.manifest.registry.TENANT_DB_DEFAULT
  assert.ok(registry)
  assert.equal(CANONICAL_TENANT_SCHEMA_VERSION, registry.schemaVersion)
  assert.equal(CANONICAL_TENANT_SCHEMA_VERSION, tenantRegistrySchemaVersion(loaded.manifest))
  assert.equal(CANONICAL_TENANT_SCHEMA_VERSION, canonicalTenantSchemaVersion(REPO_ROOT))
  assert.equal(CANONICAL_TENANT_SCHEMA_VERSION, "2")
})

// ─── Phase 4: pre-0006 rejection (real schema, not FakeD1) ───────

test("pre-0006 schema (registry v1) is rejected before any ActionPreview write", async () => {
  const controlD1 = new SqliteD1Database({ migrations: CONTROL_MIGRATIONS })
  const tenantPre0006 = new SqliteD1Database({ migrations: PRE_0006_TENANT_MIGRATIONS })
  await seedTenant(controlD1, "tenant-A", "tenant-a")
  await seedTenantDatabaseRow(controlD1, "tenant-A", { schemaVersion: "1" })

  const resolver = new D1TenantDbResolver({ controlDb: controlD1, tenantDb: tenantPre0006 })
  const res = await resolver.resolveTenantDb("tenant-A" as never)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.reason, "tenant_database_schema_unsupported")

  // Independent proof the rejection is meaningful: the pre-0006 DB physically
  // cannot accept the ActionPreview insert (missing created_by_user_id column).
  const repo = new D1ActionPreviewRepository(tenantPre0006)
  const ctx = { tenantId: "tenant-A", db: tenantPre0006 } as unknown as TenantDbContext
  await assert.rejects(repo.create(ctx, preview("ap-1", "tenant-A")))

  controlD1.close(); tenantPre0006.close()
})

// ─── Phase 4: canonical schema routes AND supports the write ─────

test("canonical schema (registry v2) resolves and supports the ActionPreview insert", async () => {
  const controlD1 = new SqliteD1Database({ migrations: CONTROL_MIGRATIONS })
  const tenantD1 = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS })
  await seedTenant(controlD1, "tenant-A", "tenant-a")
  await seedTenantDatabaseRow(controlD1, "tenant-A", { schemaVersion: CANONICAL_TENANT_SCHEMA_VERSION })

  const resolver = new D1TenantDbResolver({ controlDb: controlD1, tenantDb: tenantD1 })
  const res = await resolver.resolveTenantDb("tenant-A" as never)
  assert.equal(res.ok, true)
  if (res.ok) assert.equal(res.schemaVersion, CANONICAL_TENANT_SCHEMA_VERSION)

  const repo = new D1ActionPreviewRepository(tenantD1)
  const ctx = { tenantId: "tenant-A", db: tenantD1 } as unknown as TenantDbContext
  await repo.create(ctx, preview("ap-1", "tenant-A"))
  const stored = tenantD1.rawRow("SELECT created_by_user_id FROM action_previews WHERE id = ?", "ap-1") as { created_by_user_id?: string } | null
  assert.ok(stored)
  assert.equal(stored.created_by_user_id, "user-1") // created_by_user_id is writable

  controlD1.close(); tenantD1.close()
})

// ─── Phase 5/6: registry-row coupling reads the ACTUAL CONTROL_DB row ─────

const FIXED_NOW = () => "2026-01-01T00:00:00.000Z"
const SYN_DB_ID = "11111111-1111-4111-8111-111111111111"

/** Fresh CONTROL + TENANT pair with the canonical lanes applied via the ledger. */
function freshPair(): { control: DatabaseSync; tenant: DatabaseSync } {
  const control = new DatabaseSync(":memory:")
  const tenant = new DatabaseSync(":memory:")
  applyAll((b: string) => (b === "CONTROL_DB" ? control : tenant), REPO_ROOT, { now: FIXED_NOW })
  return { control, tenant }
}

function seedRegistry(control: DatabaseSync, opts: { status?: string; schemaVersion?: string } = {}): void {
  const { status = "active", schemaVersion = CANONICAL_TENANT_SCHEMA_VERSION } = opts
  control.prepare("INSERT INTO tenants (id, name, slug, status) VALUES (?, ?, ?, ?)").run("tenant-A", "T", "tenant-a", "active")
  control.prepare("INSERT INTO tenant_databases (tenant_id, database_name, database_id, schema_version, status) VALUES (?, ?, ?, ?, ?)")
    .run("tenant-A", "tenant-db", SYN_DB_ID, schemaVersion, status)
}

function couple(control: DatabaseSync, tenant: DatabaseSync) {
  return verifyTenantDatabaseCoupling({ controlDb: control, tenantDb: tenant, tenantId: "tenant-A", repoRoot: REPO_ROOT })
}

test("coupling 8. canonical registry + ledger + schema all aligned → ok", () => {
  const { control, tenant } = freshPair()
  seedRegistry(control)
  const r = couple(control, tenant)
  assert.deepEqual(r, {
    ok: true, registry_row_present: true, registry_mapping_active: true, registry_version_matches_manifest: true,
    ledger_matches_manifest: true, physical_schema_matches_contract: true, binding_matches_contract: true,
  })
  control.close(); tenant.close()
})

test("coupling 1. registry row absent → fails closed", () => {
  const { control, tenant } = freshPair() // no registry seeded
  const r = couple(control, tenant)
  assert.equal(r.ok, false)
  assert.equal(r.registry_row_present, false)
  control.close(); tenant.close()
})

test("coupling 2. registry row inactive → fails closed", () => {
  const { control, tenant } = freshPair()
  seedRegistry(control, { status: "migrating" })
  const r = couple(control, tenant)
  assert.equal(r.ok, false)
  assert.equal(r.registry_row_present, true)
  assert.equal(r.registry_mapping_active, false)
  control.close(); tenant.close()
})

test("coupling 3. registry version 1 with canonical physical DB → fails closed", () => {
  const { control, tenant } = freshPair()
  seedRegistry(control, { schemaVersion: "1" })
  const r = couple(control, tenant)
  assert.equal(r.ok, false)
  assert.equal(r.registry_version_matches_manifest, false)
  control.close(); tenant.close()
})

test("coupling 4. registry version 2 with pre-0006 physical DB → fails closed", () => {
  const { control, tenant } = freshPair()
  seedRegistry(control) // canonical version
  // Roll the tenant DB back to pre-0006: drop the column + its ledger row.
  tenant.exec("ALTER TABLE action_previews DROP COLUMN created_by_user_id")
  tenant.prepare("DELETE FROM __atra_d1_migrations WHERE binding = ? AND sequence = ?").run("TENANT_DB_DEFAULT", 4)
  const r = couple(control, tenant)
  assert.equal(r.ok, false)
  assert.equal(r.registry_version_matches_manifest, true) // registry claims v2…
  assert.equal(r.physical_schema_matches_contract, false) // …but the physical schema disagrees
  control.close(); tenant.close()
})

test("coupling 5. canonical registry with missing ledger history → fails closed", () => {
  const { control, tenant } = freshPair()
  seedRegistry(control)
  tenant.prepare("DELETE FROM __atra_d1_migrations WHERE binding = ?").run("TENANT_DB_DEFAULT")
  const r = couple(control, tenant)
  assert.equal(r.ok, false)
  assert.equal(r.ledger_matches_manifest, false)
  control.close(); tenant.close()
})

test("coupling 6. canonical registry with checksum drift → fails closed", () => {
  const { control, tenant } = freshPair()
  seedRegistry(control)
  tenant.prepare("UPDATE __atra_d1_migrations SET sha256 = ? WHERE binding = ? AND sequence = ?")
    .run("0".repeat(64), "TENANT_DB_DEFAULT", 1)
  const r = couple(control, tenant)
  assert.equal(r.ok, false)
  assert.equal(r.ledger_matches_manifest, false)
  control.close(); tenant.close()
})

test("coupling 7. canonical registry with wrong-lane schema → fails closed", () => {
  // A tenant handle that was given the CONTROL lane instead of the TENANT lane.
  const control = new DatabaseSync(":memory:")
  const wrongLaneTenant = new DatabaseSync(":memory:")
  applyAll((b: string) => (b === "CONTROL_DB" ? control : wrongLaneTenant), REPO_ROOT, { now: FIXED_NOW })
  // Re-open the "tenant" as the control lane so it holds control tables.
  const controlSchemaTenant = new DatabaseSync(":memory:")
  applyAll((b: string) => (b === "CONTROL_DB" ? controlSchemaTenant : new DatabaseSync(":memory:")), REPO_ROOT, { now: FIXED_NOW })
  seedRegistry(control)
  const r = couple(control, controlSchemaTenant)
  assert.equal(r.ok, false)
  assert.equal(r.physical_schema_matches_contract, false)
  assert.equal(r.binding_matches_contract, false)
  control.close(); wrongLaneTenant.close(); controlSchemaTenant.close()
})
