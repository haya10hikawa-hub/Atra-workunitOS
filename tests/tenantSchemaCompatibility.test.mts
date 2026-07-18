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

import { applyAll, verifyRegistryCoupling, canonicalTenantSchemaVersion, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationRunner.mjs"
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

// ─── Phase 5: registry version coupled to migration evidence ─────

test("registry coupling: canonical version + ledger + schema contract must all agree", () => {
  const handles: Record<string, DatabaseSync> = {}
  for (const b of KNOWN_BINDINGS) handles[b] = new DatabaseSync(":memory:")
  const dbFor = (b: string) => handles[b]
  applyAll(dbFor, REPO_ROOT, { now: () => "2026-01-01T00:00:00.000Z" })

  const good = verifyRegistryCoupling(dbFor, REPO_ROOT, CANONICAL_TENANT_SCHEMA_VERSION)
  assert.equal(good.ok, true)
  assert.equal(good.registry_version_matches_manifest, true)
  assert.equal(good.ledger_matches_manifest, true)
  assert.equal(good.physical_schema_matches_contract, true)

  // A registry claiming v1 does NOT match the manifest → coupling fails closed.
  const bad = verifyRegistryCoupling(dbFor, REPO_ROOT, "1")
  assert.equal(bad.ok, false)
  assert.equal(bad.registry_version_matches_manifest, false)

  for (const b of KNOWN_BINDINGS) handles[b].close()
})
