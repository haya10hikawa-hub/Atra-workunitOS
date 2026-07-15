/**
 * Blocker 3 (P0-PERSIST-014): complete tenant registry record validation.
 *
 * The resolver projects and validates the COMPLETE `tenant_databases` record
 * (tenant_id, database_name, database_id, schema_version, status). A malformed or
 * incomplete routing record maps to a typed, disclosure-free reason that higher
 * layers surface as a safe 503 — no tenant id / db id / name / schema / SQL / row
 * ever appears in a client-reachable value.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { D1TenantDbResolver } from "../app/lib/persistence/tenantDbResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { seedTenantRow, seedTenantDatabaseRow, VALID_DB_ID, VALID_DB_NAME, VALID_SCHEMA_VERSION } from "./helpers/registrySeed.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { D1DatabaseLike, D1PreparedStatementLike } from "../app/lib/persistence/d1/types.ts"

const tA = "tenant-a" as TenantId

async function resolverWith(overrides: Parameters<typeof seedTenantDatabaseRow>[2] = {}) {
  const controlDb = new FakeD1Database()
  const tenantDb = new FakeD1Database()
  await seedTenantRow(controlDb, tA, "active")
  await seedTenantDatabaseRow(controlDb, tA, overrides)
  return { resolver: new D1TenantDbResolver({ controlDb, tenantDb }), tenantDb }
}

/** A control DB that returns fixed rows, so we can exercise defensive checks that
 *  a query-filtered FakeD1 could never produce (e.g. a mismatched stored tenant). */
function stubControlDb(dbRow: Record<string, unknown> | null): D1DatabaseLike {
  return {
    prepare(sql: string): D1PreparedStatementLike {
      const isTenantDbQuery = /FROM tenant_databases/i.test(sql)
      const stmt: D1PreparedStatementLike = {
        bind() { return stmt },
        async first<T>() { return (isTenantDbQuery ? dbRow : { status: "active" }) as T },
        async all<T>() { return { results: [] as T[] } },
        async run() { return { success: true } },
      }
      return stmt
    },
  }
}

// ─── 1–5, 7. malformed / incomplete records → database_invalid ──

test("1. missing database name → database_invalid", async () => {
  const { resolver } = await resolverWith({ databaseName: null })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_invalid")
})

test("2. empty database name → database_invalid", async () => {
  const { resolver } = await resolverWith({ databaseName: "" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_invalid")
})

test("3. missing database ID → database_invalid", async () => {
  const { resolver } = await resolverWith({ databaseId: null })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_invalid")
})

test("4. malformed database ID (not UUID-shaped) → database_invalid", async () => {
  const { resolver } = await resolverWith({ databaseId: "not-a-real-d1-id" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_invalid")
})

test("5. missing schema version → database_invalid", async () => {
  const { resolver } = await resolverWith({ schemaVersion: null })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_invalid")
})

test("5b. unsupported schema version form → database_invalid", async () => {
  const { resolver } = await resolverWith({ schemaVersion: "v1.2.3-beta" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_invalid")
})

test("7. unknown registry status → safe failure (database_inactive)", async () => {
  const { resolver } = await resolverWith({ status: "quantum" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.reason, "database_inactive")
})

// ─── 6. mismatched registry tenant ID (defensive) → database_invalid ─

test("6. a stored record whose tenant_id != requested tenant → database_invalid", async () => {
  const resolver = new D1TenantDbResolver({
    controlDb: stubControlDb({ tenant_id: "someone-else", database_name: VALID_DB_NAME, database_id: VALID_DB_ID, schema_version: VALID_SCHEMA_VERSION, status: "active" }),
    tenantDb: new FakeD1Database(),
  })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_invalid")
})

// ─── 8. complete active record succeeds ─────────────────────────

test("8. a complete, well-formed, active record resolves to the tenant DB", async () => {
  const { resolver, tenantDb } = await resolverWith()
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.equal(res.ctx.tenantId, tA)
    assert.equal(res.ctx.db, tenantDb)
  }
})

// ─── 9. serialized failure discloses none of the registry values ─

test("9. a serialized failure contains none of the registry values", async () => {
  // A well-formed record with a KNOWN name/id/schema but an inactive status.
  const { resolver } = await resolverWith({ status: "migrating" })
  const res = await resolver.resolveTenantDb(tA)
  const serialized = JSON.stringify(res)
  for (const secret of [tA, VALID_DB_ID, VALID_DB_NAME, VALID_SCHEMA_VERSION, "tenant_databases", "SELECT"]) {
    assert.equal(serialized.includes(secret), false, `failure must not disclose ${secret}`)
  }
})
