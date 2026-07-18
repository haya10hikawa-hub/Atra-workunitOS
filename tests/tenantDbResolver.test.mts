import test from "node:test"
import assert from "node:assert/strict"
import { D1TenantDbResolver, createFakeTenantDbResolver } from "../app/lib/persistence/tenantDbResolver.ts"
import { resolveRepositories, resetInMemoryReposForTests } from "../app/lib/persistence/repositoryResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { seedTenantDatabaseRow, seedTenantRow } from "./helpers/registrySeed.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { TenantDbResolver, TenantDbResolution } from "../app/lib/persistence/repositories.ts"
import type { D1DatabaseLike } from "../app/lib/persistence/d1/types.ts"

const tA = "tenant-a" as TenantId

async function seedRegistry(
  controlDb: FakeD1Database,
  tenantId: string,
  opts: { tenantStatus?: string | null; dbStatus?: string | null } = {},
) {
  const { tenantStatus = "active", dbStatus = "active" } = opts
  if (tenantStatus !== null) {
    await seedTenantRow(controlDb, tenantId, tenantStatus)
  }
  if (dbStatus !== null) {
    // Seed a COMPLETE registry record (Blocker 3); only the status varies here.
    await seedTenantDatabaseRow(controlDb, tenantId, { status: dbStatus })
  }
}

function makeResolver(overrides: { tenantStatus?: string | null; dbStatus?: string | null } = {}) {
  const controlDb = new FakeD1Database()
  const tenantDb = new FakeD1Database()
  return { resolver: new D1TenantDbResolver({ controlDb, tenantDb }), controlDb, tenantDb, overrides }
}

// ─── §7 Resolver tests ──────────────────────────────────────────

test("1+2. active tenant + active registry row returns TENANT_DB_DEFAULT, not CONTROL_DB", async () => {
  const { resolver, controlDb, tenantDb } = makeResolver()
  await seedRegistry(controlDb, tA)
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.equal(res.ctx.db, tenantDb)
    assert.notEqual(res.ctx.db, controlDb)
  }
})

test("3. inactive (generic non-active) tenant fails", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA, { tenantStatus: "inactive" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.reason, "tenant_inactive")
})

test("4. suspended tenant fails", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA, { tenantStatus: "suspended" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "tenant_inactive")
})

test("5. deleted tenant fails", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA, { tenantStatus: "deleted" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "tenant_inactive")
})

test("6. missing tenant fails", async () => {
  const { resolver } = makeResolver()
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "tenant_not_found")
})

test("7. missing database registry row fails", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA, { dbStatus: null })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_not_found")
})

test("8. migrating database row fails", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA, { dbStatus: "migrating" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_inactive")
})

test("9. failed database row fails", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA, { dbStatus: "failed" })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "database_inactive")
})

test("10. resolver query failure fails closed", async () => {
  const throwingControl: D1DatabaseLike = { prepare() { throw new Error("db down") } }
  const resolver = new D1TenantDbResolver({ controlDb: throwingControl, tenantDb: new FakeD1Database() })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "resolution_failed")
})

test("11. returned context tenant always equals the requested tenant", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA)
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok && res.ctx.tenantId, tA)
})

test("12. tenant A cannot cause resolution of tenant B's context", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, "tenant-b")
  // Only B is registered; resolving A must not fall through to B.
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok === false && res.reason, "tenant_not_found")
})

test("resolver reason never leaks tenantId / db id / SQL", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA, { tenantStatus: "suspended" })
  const res = await resolver.resolveTenantDb(tA)
  const serialized = JSON.stringify(res)
  assert.equal(serialized.includes(tA), false)
  assert.equal(serialized.includes("SELECT"), false)
  assert.equal(serialized.includes("tenant_databases"), false)
})

// ─── §4 Repository resolver validation (production strict path) ──

function productionPersistence(control: D1DatabaseLike, tenant: D1DatabaseLike) {
  return { mode: "d1" as const, CONTROL_DB: control, TENANT_DB_DEFAULT: tenant }
}

function fixedResolver(resolution: TenantDbResolution): TenantDbResolver {
  return { async resolveTenantDb() { return resolution } }
}

test("13. a malformed resolver context (null db) is rejected by the repository resolver", async () => {
  resetInMemoryReposForTests()
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const resolver = fixedResolver({ ok: true, ctx: { tenantId: tA, db: null } , binding: "TENANT_DB_DEFAULT", schemaVersion: "2" })
  const result = await resolveRepositories(tA, { persistence: productionPersistence(control, tenant), resolver })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "tenant_resolution_failed")
})

test("resolver returning the CONTROL DB as tenant storage fails closed", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const resolver = fixedResolver({ ok: true, ctx: { tenantId: tA, db: control } , binding: "TENANT_DB_DEFAULT", schemaVersion: "2" })
  const result = await resolveRepositories(tA, { persistence: productionPersistence(control, tenant), resolver })
  assert.equal(result.ok === false && result.error, "tenant_resolution_failed")
})

test("resolver returning a mismatched tenant context fails closed", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const resolver = fixedResolver({ ok: true, ctx: { tenantId: "other-tenant" as TenantId, db: tenant } , binding: "TENANT_DB_DEFAULT", schemaVersion: "2" })
  const result = await resolveRepositories(tA, { persistence: productionPersistence(control, tenant), resolver })
  assert.equal(result.ok === false && result.error, "tenant_resolution_failed")
})

test("resolver tenant_inactive maps to tenant_forbidden", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const resolver = fixedResolver({ ok: false, reason: "tenant_inactive" })
  const result = await resolveRepositories(tA, { persistence: productionPersistence(control, tenant), resolver })
  assert.equal(result.ok === false && result.error, "tenant_forbidden")
})

test("resolver database_inactive maps to tenant_resolution_failed", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const resolver = fixedResolver({ ok: false, reason: "database_inactive" })
  const result = await resolveRepositories(tA, { persistence: productionPersistence(control, tenant), resolver })
  assert.equal(result.ok === false && result.error, "tenant_resolution_failed")
})

test("options.d1Binding does NOT override the resolved ctx.db in the production path", async () => {
  resetInMemoryReposForTests()
  const control = new FakeD1Database()
  const resolvedDb = new FakeD1Database()   // ctx.db from the resolver
  const overrideDb = new FakeD1Database()   // hostile d1Binding — must be ignored
  const resolver = fixedResolver({ ok: true, ctx: { tenantId: tA, db: resolvedDb } , binding: "TENANT_DB_DEFAULT", schemaVersion: "2" })
  const result = await resolveRepositories(tA, {
    persistence: productionPersistence(control, resolvedDb),
    resolver,
    d1Binding: overrideDb,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    // Write through the bundle, then confirm the data landed in ctx.db (resolvedDb),
    // NOT the override binding.
    await result.bundle.workUnits.create(result.bundle.ctx, {
      id: "wu-1", tenantId: tA, title: "t", kind: "task", priority: "med",
      sourceProvider: "mock", reason: "r", evidence: "e", nextAction: "n",
      status: "inbox", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    const fromResolved = await resolvedDb.prepare("SELECT * FROM work_units WHERE id = ? AND tenant_id = ?").bind("wu-1", tA).first()
    const fromOverride = await overrideDb.prepare("SELECT * FROM work_units WHERE id = ? AND tenant_id = ?").bind("wu-1", tA).first()
    assert.ok(fromResolved, "write must land in the resolved ctx.db")
    assert.equal(fromOverride, null, "write must NOT land in the override d1Binding")
  }
})

test("production path with NO resolver + valid registry: fake resolver active tenant resolves", async () => {
  // The fake resolver (used by higher layers/tests) mirrors the D1 resolver.
  const tenants = new Map([[tA, { tenant: { status: "active" }, dbRef: { status: "active" } }]])
  const tenantDb = new FakeD1Database()
  const resolver = createFakeTenantDbResolver(tenants, tenantDb)
  const control = new FakeD1Database()
  const result = await resolveRepositories(tA, { persistence: productionPersistence(control, tenantDb), resolver })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.bundle.ctx.db, tenantDb)
})

// ─── Alpha persistence contract categories (P0-FIX-D1-OPERATIONAL-CONTRACT) ──

test("contract: success carries the allowlisted binding + validated schema version", async () => {
  const { resolver, controlDb } = makeResolver()
  await seedRegistry(controlDb, tA) // registry schema_version defaults to "1" (supported)
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.equal(res.binding, "TENANT_DB_DEFAULT")
    assert.equal(res.schemaVersion, "1")
  }
})

test("contract: canonical schema version 2 is supported", async () => {
  const controlDb = new FakeD1Database()
  const tenantDb = new FakeD1Database()
  await seedTenantRow(controlDb, tA, "active")
  await seedTenantDatabaseRow(controlDb, tA, { schemaVersion: "2" })
  const res = await new D1TenantDbResolver({ controlDb, tenantDb }).resolveTenantDb(tA)
  assert.equal(res.ok, true)
  if (res.ok) assert.equal(res.schemaVersion, "2")
})

test("contract: a well-formed but unsupported schema version fails closed", async () => {
  const controlDb = new FakeD1Database()
  const tenantDb = new FakeD1Database()
  await seedTenantRow(controlDb, tA, "active")
  await seedTenantDatabaseRow(controlDb, tA, { schemaVersion: "3" })
  const res = await new D1TenantDbResolver({ controlDb, tenantDb }).resolveTenantDb(tA)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.reason, "tenant_database_schema_unsupported")
})

test("contract: a missing/blank tenant context fails closed with tenant_context_required", async () => {
  const { resolver } = makeResolver()
  const blank = await resolver.resolveTenantDb("" as TenantId)
  assert.equal(blank.ok, false)
  if (!blank.ok) assert.equal(blank.reason, "tenant_context_required")
  const ws = await resolver.resolveTenantDb("   " as TenantId)
  assert.equal(ws.ok, false)
  if (!ws.ok) assert.equal(ws.reason, "tenant_context_required")
})

test("contract: an absent TENANT_DB_DEFAULT binding fails closed, never a control fallback", async () => {
  const controlDb = new FakeD1Database()
  await seedTenantRow(controlDb, tA, "active")
  await seedTenantDatabaseRow(controlDb, tA, {})
  // Construct the resolver with a null tenant binding (infrastructure fault).
  const resolver = new D1TenantDbResolver({ controlDb, tenantDb: null as unknown as D1DatabaseLike })
  const res = await resolver.resolveTenantDb(tA)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.reason, "tenant_database_binding_missing")
})

test("contract: the fake resolver mirrors the schema-version support gate", async () => {
  const supported = createFakeTenantDbResolver(
    new Map([[tA, { tenant: { status: "active" }, dbRef: { status: "active", schemaVersion: "2" } }]]),
  )
  const okRes = await supported.resolveTenantDb(tA)
  assert.equal(okRes.ok, true)
  const unsupported = createFakeTenantDbResolver(
    new Map([[tA, { tenant: { status: "active" }, dbRef: { status: "active", schemaVersion: "9" } }]]),
  )
  const badRes = await unsupported.resolveTenantDb(tA)
  assert.equal(badRes.ok, false)
  if (!badRes.ok) assert.equal(badRes.reason, "tenant_database_schema_unsupported")
})
