/**
 * Blocker 1 (P0-PERSIST-014): structural production/local repository authority.
 *
 * These tests call the LOWEST-LEVEL resolvers directly to prove that a production
 * D1 bundle is producible ONLY with a resolver (mandatory registry validation),
 * that production cannot opt into a direct binding, that local development has a
 * separate explicitly named API, and that a new production caller cannot bypass
 * the registry.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveRepositories,
  resolveProductionRepositories,
  resolveLocalRepositories,
  resolveRepositoriesForAuthority,
  resetInMemoryReposForTests,
} from "../app/lib/persistence/repositoryResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import { TENANT_DATA_BINDING, type TenantDbResolver, type TenantDbResolution } from "../app/lib/persistence/repositories.ts"
import type { D1DatabaseLike } from "../app/lib/persistence/d1/types.ts"
import { CANONICAL_TENANT_SCHEMA_VERSION } from "../app/lib/persistence/tenantSchemaVersion.ts"

const tA = "tenant-a" as TenantId
const persistence = (control: D1DatabaseLike, tenant: D1DatabaseLike) =>
  ({ mode: "d1" as const, CONTROL_DB: control, TENANT_DB_DEFAULT: tenant })
const fixedResolver = (resolution: TenantDbResolution): TenantDbResolver => ({ async resolveTenantDb() { return resolution } })
const successfulResolution = (tenantId: TenantId, db: D1DatabaseLike | null): TenantDbResolution => ({
  ok: true,
  ctx: { tenantId, db },
  binding: TENANT_DATA_BINDING,
  schemaVersion: CANONICAL_TENANT_SCHEMA_VERSION,
})
const activeResolver = (db: D1DatabaseLike): TenantDbResolver => fixedResolver(successfulResolution(tA, db))

// ─── 1. production D1 without a resolver fails ──────────────────

test("1. production D1 through resolveRepositories WITHOUT a resolver fails closed (no direct bundle)", async () => {
  resetInMemoryReposForTests()
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  // Both bindings present — presence must NOT create a direct production bundle.
  const result = await resolveRepositories(tA, { persistence: persistence(control, tenant) })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

test("1b. production D1 with a valid resolver succeeds and returns the resolved tenant DB", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const result = await resolveProductionRepositories(tA, { persistence: persistence(control, tenant), resolver: activeResolver(tenant) })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.bundle.ctx.db, tenant)
})

// ─── 2. production D1 cannot opt into a direct binding ──────────

test("2. production ignores any hostile d1Binding — ctx.db is authoritative", async () => {
  const control = new FakeD1Database()
  const resolvedDb = new FakeD1Database()  // ctx.db from the resolver
  const overrideDb = new FakeD1Database()  // hostile binding — must be ignored
  // resolveProductionRepositories takes NO d1Binding parameter; even the public
  // resolveRepositories drops it in the production path.
  const result = await resolveRepositories(tA, {
    persistence: persistence(control, resolvedDb),
    resolver: activeResolver(resolvedDb),
    d1Binding: overrideDb,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    await result.bundle.workUnits.create(result.bundle.ctx, {
      id: "wu-1", tenantId: tA, title: "t", kind: "task", priority: "med", sourceProvider: "mock",
      reason: "r", evidence: "e", nextAction: "n", status: "inbox",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    assert.ok(await resolvedDb.prepare("SELECT * FROM work_units WHERE id = ? AND tenant_id = ?").bind("wu-1", tA).first(), "write must land in ctx.db")
    assert.equal(await overrideDb.prepare("SELECT * FROM work_units WHERE id = ? AND tenant_id = ?").bind("wu-1", tA).first(), null, "write must NOT land in the override binding")
  }
})

test("2b. production rejects the control DB returned as tenant storage", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const result = await resolveProductionRepositories(tA, {
    persistence: persistence(control, tenant),
    resolver: fixedResolver(successfulResolution(tA, control)),
  })
  assert.equal(result.ok === false && result.error, "tenant_resolution_failed")
})

test("2c. production fails closed on a context-tenant mismatch", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const result = await resolveProductionRepositories(tA, {
    persistence: persistence(control, tenant),
    resolver: fixedResolver(successfulResolution("other" as TenantId, tenant)),
  })
  assert.equal(result.ok === false && result.error, "tenant_resolution_failed")
})

// ─── 3. local development uses the separate explicit local API ──

test("3. local development can use resolveLocalRepositories with a direct binding", async () => {
  const tenant = new FakeD1Database()
  const result = await resolveLocalRepositories(tA, {
    persistence: { mode: "d1", TENANT_DB_DEFAULT: tenant },
    allowDirectBinding: true,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    // A direct-bound local bundle writes to the supplied binding.
    await result.bundle.auditLogs.append({ tenantId: tA, db: null }, {
      id: "a1", tenantId: tA, eventKind: "test", occurredAt: new Date().toISOString(),
    })
    assert.ok(await tenant.prepare("SELECT * FROM audit_logs WHERE id = ? AND tenant_id = ?").bind("a1", tA).first())
  }
})

test("3b. local development in-memory mode returns an in-memory bundle", async () => {
  resetInMemoryReposForTests()
  const result = await resolveLocalRepositories(tA, { persistence: { mode: "in_memory" }, allowDirectBinding: true })
  assert.equal(result.ok, true)
})

test("3c. resolveRepositoriesForAuthority dispatches on the explicit discriminant", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  const prod = await resolveRepositoriesForAuthority(tA, {
    kind: "cloudflare_production", persistence: persistence(control, tenant), resolver: activeResolver(tenant),
  })
  assert.equal(prod.ok, true)
  const local = await resolveRepositoriesForAuthority(tA, {
    kind: "local_development", persistence: { mode: "d1", TENANT_DB_DEFAULT: tenant }, allowDirectBinding: true,
  })
  assert.equal(local.ok, true)
})

// ─── 4. a newly added production caller cannot bypass the registry ─

test("4. every production resolution consults the resolver — a failing resolver fails production closed", async () => {
  const control = new FakeD1Database(), tenant = new FakeD1Database()
  for (const resolution of [
    { ok: false, reason: "tenant_not_found" } as const,
    { ok: false, reason: "database_not_found" } as const,
    { ok: false, reason: "database_invalid" } as const,
    successfulResolution(tA, null), // malformed ctx (null db)
  ]) {
    const result = await resolveProductionRepositories(tA, { persistence: persistence(control, tenant), resolver: fixedResolver(resolution) })
    assert.equal(result.ok, false, `resolution ${JSON.stringify(resolution)} must not yield a production bundle`)
  }
})

test("4b. production fails closed when required bindings are absent (even with a resolver)", async () => {
  const tenant = new FakeD1Database()
  const result = await resolveProductionRepositories(tA, {
    persistence: { mode: "d1", TENANT_DB_DEFAULT: tenant }, // no CONTROL_DB
    resolver: activeResolver(tenant),
  })
  assert.equal(result.ok === false && result.error, "d1_not_configured")
})
