import test from "node:test"
import assert from "node:assert/strict"
import { getRequestRuntimeEnv } from "../app/lib/runtime/cloudflareRuntimeEnv.ts"
import {
  runWithInjectedRuntimeEnv,
  setTestRuntimeEnvForRequest,
  resetTestRuntimeEnvForRequest,
} from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { resetInMemoryReposForTests } from "../app/lib/persistence/repositoryResolver.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"

const tenantId = "test-tenant" as TenantId

// ─── Pure production accessor ───────────────────────────────────

test("getRequestRuntimeEnv returns null outside a Cloudflare request (tests/local)", () => {
  assert.equal(getRequestRuntimeEnv(), null)
})

test("getRequestRuntimeEnv is unaffected by test injection (accessor is pure)", () => {
  // The injector drives the CONFIG resolver, never the raw production accessor.
  runWithInjectedRuntimeEnv({ CONTROL_DB: new FakeD1Database() } as AppEnv, () => {
    assert.equal(getRequestRuntimeEnv(), null)
  })
})

// ─── Route repository helper via the validated runtime config ───

test("resolveRouteRepositories returns in-memory repos in local dev when allowed", async () => {
  resetInMemoryReposForTests()
  const backup = { NODE_ENV: process.env.NODE_ENV, MEM: process.env.ALLOW_IN_MEMORY_PERSISTENCE }
  try {
    ;(process.env as Record<string, string>).ALLOW_IN_MEMORY_PERSISTENCE = "true"
    delete (process.env as Record<string, string | undefined>).PERSISTENCE_MODE
    const result = await resolveRouteRepositories(tenantId)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.ok(result.bundle.actionPreviews)
      assert.ok(result.bundle.approvalRecords)
    }
  } finally {
    if (backup.MEM === undefined) delete (process.env as Record<string, string | undefined>).ALLOW_IN_MEMORY_PERSISTENCE
    else (process.env as Record<string, string>).ALLOW_IN_MEMORY_PERSISTENCE = backup.MEM
    if (backup.NODE_ENV !== undefined) (process.env as Record<string, string>).NODE_ENV = backup.NODE_ENV
  }
})

test("resolveRouteRepositories returns integration_missing when d1 requested without bindings", async () => {
  resetInMemoryReposForTests()
  const backup = { MEM: process.env.ALLOW_IN_MEMORY_PERSISTENCE, MODE: process.env.PERSISTENCE_MODE }
  try {
    ;(process.env as Record<string, string>).ALLOW_IN_MEMORY_PERSISTENCE = "false"
    ;(process.env as Record<string, string>).PERSISTENCE_MODE = "d1"
    const result = await resolveRouteRepositories(tenantId)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error, "integration_missing")
      assert.equal(result.status, 503)
    }
  } finally {
    if (backup.MEM === undefined) delete (process.env as Record<string, string | undefined>).ALLOW_IN_MEMORY_PERSISTENCE
    else (process.env as Record<string, string>).ALLOW_IN_MEMORY_PERSISTENCE = backup.MEM
    if (backup.MODE === undefined) delete (process.env as Record<string, string | undefined>).PERSISTENCE_MODE
    else (process.env as Record<string, string>).PERSISTENCE_MODE = backup.MODE
  }
})

test("resolveRouteRepositories returns D1 repos with an injected local runtime env", async () => {
  resetInMemoryReposForTests()
  const db = new FakeD1Database()
  const backup = { MODE: process.env.PERSISTENCE_MODE }
  try {
    ;(process.env as Record<string, string>).PERSISTENCE_MODE = "d1"
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    const result = await resolveRouteRepositories(tenantId)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.ok(result.bundle.actionPreviews)
      assert.ok(result.bundle.approvalRecords)
    }
  } finally {
    if (backup.MODE === undefined) delete (process.env as Record<string, string | undefined>).PERSISTENCE_MODE
    else (process.env as Record<string, string>).PERSISTENCE_MODE = backup.MODE
    resetTestRuntimeEnvForRequest()
  }
})
