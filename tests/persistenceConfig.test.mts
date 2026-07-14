import test from "node:test"
import assert from "node:assert/strict"
import { resolvePersistenceConfig } from "../app/lib/persistence/persistenceConfig.ts"
import { createFakeTenantDbResolver } from "../app/lib/persistence/tenantDbResolver.ts"
import {
  resolveRepositories,
  resetInMemoryReposForTests,
} from "../app/lib/persistence/repositoryResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"

const tenantId = "test-tenant" as TenantId

// ─── Persistence Config ────────────────────────────────────────

test("production: blocks in-memory even with flag set", () => {
  const config = resolvePersistenceConfig({
    NODE_ENV: "production",
    ALLOW_IN_MEMORY_PERSISTENCE: "true",
  })
  assert.equal(config.mode, "disabled")
  assert.equal(config.isInMemoryAllowed, false)
})

test("production: allows D1 when requested", () => {
  const config = resolvePersistenceConfig({
    NODE_ENV: "production",
    PERSISTENCE_MODE: "d1",
  })
  assert.equal(config.mode, "d1")
})

test("production: default is disabled", () => {
  const config = resolvePersistenceConfig({
    NODE_ENV: "production",
  })
  assert.equal(config.mode, "disabled")
})

test("development: in-memory only with flag", () => {
  const config = resolvePersistenceConfig({
    NODE_ENV: "development",
    ALLOW_IN_MEMORY_PERSISTENCE: "true",
  })
  assert.equal(config.mode, "in_memory")
  assert.equal(config.isInMemoryAllowed, true)
})

test("development: D1 when requested", () => {
  const config = resolvePersistenceConfig({
    NODE_ENV: "development",
    PERSISTENCE_MODE: "d1",
  })
  assert.equal(config.mode, "d1")
})

test("development: default is disabled", () => {
  const config = resolvePersistenceConfig({
    NODE_ENV: "development",
  })
  assert.equal(config.mode, "disabled")
})

// ─── Tenant DB Resolver ────────────────────────────────────────

test("fake resolver resolves active tenant", async () => {
  const tenants = new Map()
  tenants.set(tenantId, {
    tenant: { status: "active" },
    dbRef: { status: "active" },
  })
  const resolver = createFakeTenantDbResolver(tenants)
  const resolution = await resolver.resolveTenantDb(tenantId)
  assert.equal(resolution.ok, true)
  if (resolution.ok) assert.equal(resolution.ctx.tenantId, tenantId)
})

test("fake resolver fails for missing tenant", async () => {
  const resolver = createFakeTenantDbResolver(new Map())
  const resolution = await resolver.resolveTenantDb("missing-tenant" as TenantId)
  assert.equal(resolution.ok, false)
  if (!resolution.ok) assert.equal(resolution.reason, "tenant_not_found")
})

test("fake resolver fails for inactive tenant", async () => {
  const tenants = new Map()
  tenants.set(tenantId, {
    tenant: { status: "suspended" },
    dbRef: { status: "active" },
  })
  const resolver = createFakeTenantDbResolver(tenants)
  const resolution = await resolver.resolveTenantDb(tenantId)
  assert.equal(resolution.ok, false)
  if (!resolution.ok) assert.equal(resolution.reason, "tenant_inactive")
})

// ─── Repository Bundle Resolver ────────────────────────────────

test("resolveRepositories returns in-memory in dev with flag", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.ok(result.bundle.actionPreviews)
    assert.ok(result.bundle.approvalRecords)
  }
})

test("resolveRepositories returns disabled in production", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "production", ALLOW_IN_MEMORY_PERSISTENCE: "true" },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "persistence_disabled")
})

test("resolveRepositories returns persistence_disabled for default", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development" },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "persistence_disabled")
})

test("resolveRepositories returns d1_not_configured without resolver", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", PERSISTENCE_MODE: "d1" },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

test("resolveRepositories returns D1 repos with resolver", async () => {
  const tenants = new Map()
  tenants.set(tenantId, {
    tenant: { id: tenantId, status: "active" },
    dbRef: { tenant_id: tenantId, database_name: "test-db", status: "active" },
  })
  const resolver = createFakeTenantDbResolver(tenants)
  const fakeDb = new FakeD1Database()

  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", PERSISTENCE_MODE: "d1" },
    resolver,
    d1Binding: fakeDb,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.ok(result.bundle.actionPreviews)
    assert.ok(result.bundle.approvalRecords)
    assert.ok(result.bundle.ctx)
  }
})

test("resolveRepositories fails on tenant_resolution_failed with bad resolver", async () => {
  const badResolver = {
    async resolveTenantDb() {
      throw new Error("boom")
    },
  }
  const result = await resolveRepositories(tenantId, {
    env: { NODE_ENV: "development", PERSISTENCE_MODE: "d1" },
    resolver: badResolver,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "tenant_resolution_failed")
})
