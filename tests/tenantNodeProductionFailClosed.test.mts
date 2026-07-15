/**
 * Round 3 (P0-PERSIST-014): Node production must NEVER enter local direct-binding
 * resolution through the legacy env/process.env seam.
 *
 * The legacy `env` branch of resolveRepositories() is LOCAL/TEST ONLY: a
 * production config fails closed BEFORE any mode handling, so Node production can
 * never reach resolveLocalRepositories, consume options.d1Binding, or infer
 * authority from a supplied/omitted resolver. Node production D1 must use the
 * explicit resolveProductionRepositories() with a tenant resolver.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveRepositories,
  resolveProductionRepositories,
  resolveRepositoriesForAuthority,
  resolveLocalRepositories,
  resetInMemoryReposForTests,
} from "../app/lib/persistence/repositoryResolver.ts"
import { createFakeTenantDbResolver } from "../app/lib/persistence/tenantDbResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { TenantDbResolution, TenantDbResolver } from "../app/lib/persistence/repositories.ts"
import type { D1DatabaseLike } from "../app/lib/persistence/d1/types.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"

const T = "test-tenant" as TenantId
const activeResolver = (tenantDb: D1DatabaseLike): TenantDbResolver =>
  createFakeTenantDbResolver(new Map([[T, { tenant: { status: "active" }, dbRef: { status: "active" } }]]), tenantDb)
const fixedResolver = (r: TenantDbResolution): TenantDbResolver => ({ async resolveTenantDb() { return r } })
const cfEnv = (control: D1DatabaseLike, tenant: D1DatabaseLike) => ({ CONTROL_DB: control, TENANT_DB_DEFAULT: tenant, PERSISTENCE_MODE: "d1" }) as AppEnv

// 1. Node production D1 with d1Binding and NO resolver fails closed.
test("1. Node production D1 (env) with d1Binding + no resolver fails closed", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(T, { env: { NODE_ENV: "production", PERSISTENCE_MODE: "d1" }, d1Binding: new FakeD1Database() })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

// 2. Node production D1 with BOTH a resolver and d1Binding still fails through the legacy env API.
test("2. Node production D1 (env) with resolver + d1Binding STILL fails closed", async () => {
  resetInMemoryReposForTests()
  const tenantDb = new FakeD1Database()
  const result = await resolveRepositories(T, {
    env: { NODE_ENV: "production", PERSISTENCE_MODE: "d1" },
    resolver: activeResolver(tenantDb),
    d1Binding: tenantDb,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

// 3. Node production D1 cannot use a hostile d1Binding (no bundle is ever produced).
test("3. Node production D1 (env) cannot use a hostile d1Binding", async () => {
  resetInMemoryReposForTests()
  const hostile = new FakeD1Database()
  const result = await resolveRepositories(T, { env: { NODE_ENV: "production", PERSISTENCE_MODE: "d1" }, d1Binding: hostile })
  assert.equal(result.ok, false)
  // The hostile binding never became a repository store.
  assert.equal(hostile.debugTable("work_units").length, 0)
})

// 4. Node production D1 succeeds ONLY through resolveProductionRepositories().
test("4. Node production D1 succeeds through resolveProductionRepositories with resolver + persistence projection", async () => {
  const control = new FakeD1Database(), tenantDb = new FakeD1Database()
  const result = await resolveProductionRepositories(T, {
    persistence: { mode: "d1", CONTROL_DB: control, TENANT_DB_DEFAULT: tenantDb },
    resolver: activeResolver(tenantDb),
  })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.bundle.ctx.db, tenantDb)
})

// 5. local_development authority is explicit-local-only; production never uses it.
test("5. resolveRepositoriesForAuthority local_development is explicit local (needs allowDirectBinding); production uses cloudflare_production", async () => {
  const tenantDb = new FakeD1Database()
  // The local_development authority is a deliberate, explicit local API.
  const local = await resolveRepositoriesForAuthority(T, { kind: "local_development", persistence: { mode: "d1", TENANT_DB_DEFAULT: tenantDb }, allowDirectBinding: true })
  assert.equal(local.ok, true)
  // The cloudflare_production authority requires a resolver at the type level.
  const control = new FakeD1Database()
  const prod = await resolveRepositoriesForAuthority(T, { kind: "cloudflare_production", persistence: { mode: "d1", CONTROL_DB: control, TENANT_DB_DEFAULT: tenantDb }, resolver: activeResolver(tenantDb) })
  assert.equal(prod.ok, true)
})

// 6. Development D1 direct binding remains available through the explicit local API.
test("6. Development D1 direct binding remains available via resolveLocalRepositories", async () => {
  const tenantDb = new FakeD1Database()
  const viaEnv = await resolveRepositories(T, { env: { NODE_ENV: "development", PERSISTENCE_MODE: "d1" }, d1Binding: tenantDb })
  assert.equal(viaEnv.ok, true)
  const direct = await resolveLocalRepositories(T, { persistence: { mode: "d1", TENANT_DB_DEFAULT: tenantDb }, allowDirectBinding: true })
  assert.equal(direct.ok, true)
})

// 7. Development in-memory behavior remains unchanged.
test("7. Development in-memory remains available", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(T, { env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" } })
  assert.equal(result.ok, true)
})

// 8. Production in-memory remains disabled.
test("8. Production in-memory remains disabled", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(T, { env: { NODE_ENV: "production", ALLOW_IN_MEMORY_PERSISTENCE: "true" } })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "persistence_disabled")
})

// 9. Cloudflare runtimeEnv WITHOUT a resolver still fails.
test("9. Cloudflare runtimeEnv without a resolver fails closed", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(T, { runtimeEnv: cfEnv(new FakeD1Database(), new FakeD1Database()) })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

// 10. Cloudflare runtimeEnv WITH a resolver uses exactly ctx.db (control DB rejected).
test("10. Cloudflare runtimeEnv with a resolver resolves to exactly ctx.db", async () => {
  const control = new FakeD1Database(), tenantDb = new FakeD1Database()
  const result = await resolveRepositories(T, { runtimeEnv: cfEnv(control, tenantDb), resolver: activeResolver(tenantDb) })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.bundle.ctx.db, tenantDb)
  // A resolver returning the control DB as tenant storage fails closed.
  const bad = await resolveRepositories(T, { runtimeEnv: cfEnv(control, tenantDb), resolver: fixedResolver({ ok: true, ctx: { tenantId: T, db: control } }) })
  assert.equal(bad.ok, false)
})
