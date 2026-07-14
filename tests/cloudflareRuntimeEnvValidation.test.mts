import test from "node:test"
import assert from "node:assert/strict"
import { validateCloudflareRuntimeEnv } from "../app/lib/runtime/validatedRuntimeEnv.ts"
import { resolveRepositories } from "../app/lib/persistence/repositoryResolver.ts"
import { resetInMemoryReposForTests } from "../app/lib/persistence/repositoryResolver.ts"
import { D1ApprovalRecordRepository } from "../app/lib/persistence/d1/approvalRecordRepository.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"

const tenantId = "tenant-x" as TenantId

function fullEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    CONTROL_DB: new FakeD1Database(),
    TENANT_DB_DEFAULT: new FakeD1Database(),
    PERSISTENCE_MODE: "d1",
    EXTERNAL_ACTIONS_ENABLED: "false",
    ALLOW_LEGACY_INGEST_FALLBACK: "false",
    ...overrides,
  } as AppEnv
}

// ─── Snapshot validation ────────────────────────────────────────

test("valid runtime env produces a frozen d1 snapshot", () => {
  const res = validateCloudflareRuntimeEnv(fullEnv({ LLM_PROVIDER: "deepseek" }))
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.equal(res.env.PERSISTENCE_MODE, "d1")
    assert.equal(res.env.EXTERNAL_ACTIONS_ENABLED, "false")
    assert.equal(res.env.LLM_PROVIDER, "deepseek")
    assert.ok(Object.isFrozen(res.env))
  }
})

test("missing CONTROL_DB fails closed", () => {
  const env = fullEnv()
  delete (env as Record<string, unknown>).CONTROL_DB
  const res = validateCloudflareRuntimeEnv(env)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.error, "missing_control_db")
})

test("missing TENANT_DB_DEFAULT fails closed", () => {
  const env = fullEnv()
  delete (env as Record<string, unknown>).TENANT_DB_DEFAULT
  const res = validateCloudflareRuntimeEnv(env)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.error, "missing_tenant_db")
})

test("a non-D1 binding value does not grant capability", () => {
  const res = validateCloudflareRuntimeEnv(fullEnv({ CONTROL_DB: "REPLACE_WITH_CONTROL_DB_ID" } as unknown as Partial<AppEnv>))
  assert.equal(res.ok, false)
})

test("PERSISTENCE_MODE other than d1 fails closed (never in-memory)", () => {
  const res = validateCloudflareRuntimeEnv(fullEnv({ PERSISTENCE_MODE: "in_memory" }))
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.error, "malformed_persistence_mode")
})

test("absent PERSISTENCE_MODE is inferred as d1 when bindings are valid", () => {
  const env = fullEnv()
  delete (env as Record<string, unknown>).PERSISTENCE_MODE
  const res = validateCloudflareRuntimeEnv(env)
  assert.equal(res.ok, true)
  if (res.ok) assert.equal(res.env.PERSISTENCE_MODE, "d1")
})

test("non-literal boolean var fails closed", () => {
  assert.equal(validateCloudflareRuntimeEnv(fullEnv({ EXTERNAL_ACTIONS_ENABLED: "1" as unknown as "true" })).ok, false)
  assert.equal(validateCloudflareRuntimeEnv(fullEnv({ ALLOW_LEGACY_INGEST_FALLBACK: "YES" as unknown as "true" })).ok, false)
})

test("over-long string var fails closed", () => {
  assert.equal(validateCloudflareRuntimeEnv(fullEnv({ LLM_PROVIDER: "x".repeat(300) })).ok, false)
})

test("snapshot is immutable after later source mutation", () => {
  const env = fullEnv()
  const res = validateCloudflareRuntimeEnv(env)
  assert.equal(res.ok, true)
  if (res.ok) {
    // Mutate the source and attempt to mutate the snapshot.
    env.EXTERNAL_ACTIONS_ENABLED = "true"
    assert.throws(() => {
      ;(res.env as { EXTERNAL_ACTIONS_ENABLED: string }).EXTERNAL_ACTIONS_ENABLED = "true"
    })
    assert.equal(res.env.EXTERNAL_ACTIONS_ENABLED, "false")
  }
})

// ─── Repository resolution coherence (mode + binding from one snapshot) ──

test("runtime env with valid D1 yields d1 repositories", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, { runtimeEnv: fullEnv() })
  assert.equal(result.ok, true)
})

test("process.env cannot override the request-scoped persistence mode", async () => {
  resetInMemoryReposForTests()
  // Hostile config source that tries to force in-memory. Because a runtime env
  // is present, this must be ignored entirely (never even consulted).
  const hostileEnv = {
    NODE_ENV: "development",
    PERSISTENCE_MODE: "in_memory",
    ALLOW_IN_MEMORY_PERSISTENCE: "true",
  }
  const result = await resolveRepositories(tenantId, { runtimeEnv: fullEnv(), env: hostileEnv })
  assert.equal(result.ok, true)
  // If the hostile config had won we'd get in-memory repos; assert the genuine
  // D1-backed repository type was selected instead.
  if (result.ok) {
    assert.ok(result.bundle.approvalRecords instanceof D1ApprovalRecordRepository)
    assert.equal(result.bundle.ctx.tenantId, tenantId)
  }
})

test("runtime env with missing binding fails closed (d1_not_configured)", async () => {
  resetInMemoryReposForTests()
  const env = fullEnv()
  delete (env as Record<string, unknown>).TENANT_DB_DEFAULT
  const result = await resolveRepositories(tenantId, { runtimeEnv: env })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "d1_not_configured")
})

test("runtime env selecting in_memory mode fails closed (never in-memory)", async () => {
  resetInMemoryReposForTests()
  const result = await resolveRepositories(tenantId, { runtimeEnv: fullEnv({ PERSISTENCE_MODE: "in_memory" }) })
  assert.equal(result.ok, false)
})

test("production without runtime env never returns in-memory repositories", async () => {
  resetInMemoryReposForTests()
  // Production config that requests in-memory: production must refuse it.
  const prodEnv = {
    NODE_ENV: "production",
    ALLOW_IN_MEMORY_PERSISTENCE: "true",
  }
  const result = await resolveRepositories(tenantId, { env: prodEnv })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "persistence_disabled")
})
