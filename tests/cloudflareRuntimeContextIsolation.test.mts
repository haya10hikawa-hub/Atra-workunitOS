import test from "node:test"
import assert from "node:assert/strict"
import {
  runWithInjectedRuntimeEnv,
  peekInjectedRuntimeEnv,
  resetTestRuntimeEnvForRequest,
} from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { resolveValidatedRequestRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"

function cloudflareEnv(tag: string): AppEnv {
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

// A simulated request: resolve the config before and after an await, returning
// the resolved persistence bindings each time.
async function handleRequest(env: AppEnv, waitMs: number) {
  return runWithInjectedRuntimeEnv(env, async () => {
    const before = resolveValidatedRequestRuntimeConfig()
    await delay(waitMs)
    const after = resolveValidatedRequestRuntimeConfig()
    return { before, after }
  })
}

test("concurrent overlapping requests observe only their own D1 bindings", async () => {
  const envA = cloudflareEnv("A")
  const envB = cloudflareEnv("B")
  // B finishes first while A is suspended → real overlap.
  const [a, b] = await Promise.all([handleRequest(envA, 40), handleRequest(envB, 5)])

  assert.ok(a.before.ok && a.after.ok && b.before.ok && b.after.ok)
  if (a.after.ok && b.after.ok) {
    assert.equal(a.after.runtime.persistence.CONTROL_DB, envA.CONTROL_DB)
    assert.equal(b.after.runtime.persistence.CONTROL_DB, envB.CONTROL_DB)
    assert.notEqual(a.after.runtime.persistence.CONTROL_DB, envB.CONTROL_DB)
    assert.notEqual(b.after.runtime.persistence.TENANT_DB_DEFAULT, envA.TENANT_DB_DEFAULT)
  }
})

test("completion order does not affect binding selection", async () => {
  const envA = cloudflareEnv("A")
  const envB = cloudflareEnv("B")
  const results = await Promise.all([handleRequest(envA, 5), handleRequest(envB, 40)])
  if (results[0].after.ok && results[1].after.ok) {
    assert.equal(results[0].after.runtime.persistence.CONTROL_DB, envA.CONTROL_DB)
    assert.equal(results[1].after.runtime.persistence.CONTROL_DB, envB.CONTROL_DB)
  }
})

test("a request without an injector scope never reuses a previous request's env", async () => {
  resetTestRuntimeEnvForRequest()
  await handleRequest(cloudflareEnv("A"), 5)
  // Outside any injector scope → no leftover injected env.
  assert.equal(peekInjectedRuntimeEnv(), undefined)
})

test("a concurrent request without a context stays isolated (fails closed to local)", async () => {
  const envA = cloudflareEnv("A")
  const withEnv = handleRequest(envA, 30)
  const withoutEnv = (async () => {
    const before = peekInjectedRuntimeEnv()
    await delay(5)
    const after = peekInjectedRuntimeEnv()
    return { before, after }
  })()
  const [a, none] = await Promise.all([withEnv, withoutEnv])
  if (a.after.ok) assert.equal(a.after.runtime.persistence.CONTROL_DB, envA.CONTROL_DB)
  assert.equal(none.before, undefined)
  assert.equal(none.after, undefined)
})

test("the injected env is async-context scoped, not a shared global", () => {
  // Two synchronous injector scopes do not bleed into each other.
  const a = runWithInjectedRuntimeEnv(cloudflareEnv("A"), () => peekInjectedRuntimeEnv())
  const b = runWithInjectedRuntimeEnv(cloudflareEnv("B"), () => peekInjectedRuntimeEnv())
  assert.notEqual(a, b)
  // Outside every scope, nothing is injected.
  assert.equal(peekInjectedRuntimeEnv(), undefined)
})
