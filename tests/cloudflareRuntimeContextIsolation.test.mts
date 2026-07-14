import test from "node:test"
import assert from "node:assert/strict"
import {
  getRequestRuntimeEnv,
  runWithTestRuntimeEnv,
  resetTestRuntimeEnvForRequest,
  __setProductionRuntimeEnvProviderForTests,
} from "../app/lib/runtime/cloudflareRuntimeEnv.ts"
import { validateCloudflareRuntimeEnv } from "../app/lib/runtime/validatedRuntimeEnv.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"

function envFor(tag: string): AppEnv {
  return {
    __tag: tag,
    CONTROL_DB: new FakeD1Database(),
    TENANT_DB_DEFAULT: new FakeD1Database(),
    PERSISTENCE_MODE: "d1",
    EXTERNAL_ACTIONS_ENABLED: "false",
    ALLOW_LEGACY_INGEST_FALLBACK: "false",
  } as unknown as AppEnv
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Simulated request that reads its env before and after an await ──
async function handleRequest(env: AppEnv, waitMs: number) {
  return runWithTestRuntimeEnv(env, async () => {
    const before = getRequestRuntimeEnv()
    await delay(waitMs)
    const after = getRequestRuntimeEnv()
    return { before, after }
  })
}

test("concurrent overlapping requests observe only their own bindings", async () => {
  const envA = envFor("A")
  const envB = envFor("B")

  // B finishes first (shorter delay) while A is still suspended → overlap.
  const [a, b] = await Promise.all([handleRequest(envA, 40), handleRequest(envB, 5)])

  // A only ever sees A.
  assert.equal(a.before, envA)
  assert.equal(a.after, envA)
  assert.equal((a.after as unknown as { CONTROL_DB: unknown }).CONTROL_DB, envA.CONTROL_DB)
  // B only ever sees B.
  assert.equal(b.before, envB)
  assert.equal(b.after, envB)
  // Cross-request isolation.
  assert.notEqual(a.after, envB)
  assert.notEqual(b.after, envA)
  assert.notEqual((a.after as unknown as { CONTROL_DB: unknown }).CONTROL_DB, envB.CONTROL_DB)
})

test("completion order does not affect binding selection", async () => {
  const envA = envFor("A")
  const envB = envFor("B")
  // A completes first this time.
  const results = await Promise.all([handleRequest(envA, 5), handleRequest(envB, 40)])
  assert.equal(results[0].after, envA)
  assert.equal(results[1].after, envB)
})

test("a request without context does not reuse a previous request's env", async () => {
  resetTestRuntimeEnvForRequest()
  const envA = envFor("A")
  await handleRequest(envA, 5)
  // Outside any injection scope → no leftover env.
  assert.equal(getRequestRuntimeEnv(), null)
})

test("missing context inside a concurrent request stays null (fails closed)", async () => {
  const envA = envFor("A")
  const withEnv = handleRequest(envA, 30)
  // This "request" never injects an env; it must never observe A's env.
  const withoutEnv = (async () => {
    const before = getRequestRuntimeEnv()
    await delay(5)
    const after = getRequestRuntimeEnv()
    return { before, after }
  })()
  const [a, none] = await Promise.all([withEnv, withoutEnv])
  assert.equal(a.after, envA)
  assert.equal(none.before, null)
  assert.equal(none.after, null)
})

test("a genuine production context always wins over a test override", async () => {
  const prodEnv = envFor("PROD")
  const testEnv = envFor("TEST")
  try {
    __setProductionRuntimeEnvProviderForTests(() => prodEnv)
    // Even inside a test injection scope, production context takes precedence.
    const observed = runWithTestRuntimeEnv(testEnv, () => getRequestRuntimeEnv())
    assert.equal(observed, prodEnv)
    assert.notEqual(observed, testEnv)
  } finally {
    __setProductionRuntimeEnvProviderForTests(null)
  }
})

test("resetting test state cannot mutate an already-created validated snapshot", async () => {
  const envA = envFor("A")
  const res = validateCloudflareRuntimeEnv(envA)
  assert.equal(res.ok, true)
  if (res.ok) {
    const controlBefore = res.env.CONTROL_DB
    // Mutate/clear source env and reset injection state.
    ;(envA as unknown as { CONTROL_DB: unknown }).CONTROL_DB = new FakeD1Database()
    resetTestRuntimeEnvForRequest()
    __setProductionRuntimeEnvProviderForTests(null)
    // Snapshot is frozen and still references the original binding.
    assert.equal(res.env.CONTROL_DB, controlBefore)
    assert.ok(Object.isFrozen(res.env))
  }
})
