/**
 * Control-registry seed helpers (test-only).
 *
 * Blocker 3: the tenant DB resolver now validates the COMPLETE `tenant_databases`
 * record (tenant_id, database_name, database_id, schema_version, status). Valid
 * tests must therefore seed complete rows. These helpers write full records to a
 * FakeD1-backed control DB so a valid registry entry actually validates.
 *
 * The database id below is a SYNTHETIC UUID (not a real Cloudflare D1 id/secret).
 */

import type { D1DatabaseLike } from "../../app/lib/persistence/d1/types.ts"

/** Synthetic, well-formed D1 database id (UUID shape). NOT a real id. */
export const VALID_DB_ID = "11111111-1111-4111-8111-111111111111"
export const VALID_DB_NAME = "tenant-db-test"
export const VALID_SCHEMA_VERSION = "1"

export type RegistryRowOverrides = {
  tenantId?: string
  databaseName?: unknown
  databaseId?: unknown
  schemaVersion?: unknown
  status?: unknown
}

/**
 * Seed a COMPLETE `tenant_databases` record (all columns). Overrides let a test
 * omit/corrupt exactly one field to exercise a specific validation failure. Pass
 * a field as `null` to omit it from the INSERT column list entirely.
 */
export async function seedTenantDatabaseRow(
  controlDb: D1DatabaseLike,
  tenantId: string,
  overrides: RegistryRowOverrides = {},
): Promise<void> {
  const stored: Record<string, unknown> = {
    tenant_id: overrides.tenantId ?? tenantId,
    database_name: "databaseName" in overrides ? overrides.databaseName : VALID_DB_NAME,
    database_id: "databaseId" in overrides ? overrides.databaseId : VALID_DB_ID,
    schema_version: "schemaVersion" in overrides ? overrides.schemaVersion : VALID_SCHEMA_VERSION,
    status: "status" in overrides ? overrides.status : "active",
  }
  const cols = Object.entries(stored).filter(([, v]) => v !== null)
  const columnList = cols.map(([k]) => k).join(", ")
  const placeholders = cols.map(() => "?").join(", ")
  await controlDb
    .prepare(`INSERT INTO tenant_databases (${columnList}) VALUES (${placeholders})`)
    .bind(...cols.map(([, v]) => v))
    .run()
}

/** Seed a tenant row (control registry) with the given status (default active). */
export async function seedTenantRow(
  controlDb: D1DatabaseLike,
  tenantId: string,
  status: string = "active",
): Promise<void> {
  await controlDb.prepare("INSERT INTO tenants (id, status) VALUES (?, ?)").bind(tenantId, status).run()
}
