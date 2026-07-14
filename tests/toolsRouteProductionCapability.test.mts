import test from "node:test"
import assert from "node:assert/strict"
import { POST } from "../app/api/workunit/tools/route.ts"
import { runWithInjectedRuntimeEnv } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"

// A genuine-Cloudflare-shaped env with the forbidden legacy-fallback capability on.
function cloudflareEnvWithLegacyFallback(): AppEnv {
  return {
    CONTROL_DB: new FakeD1Database(),
    TENANT_DB_DEFAULT: new FakeD1Database(),
    PERSISTENCE_MODE: "d1",
    EXTERNAL_ACTIONS_ENABLED: "false",
    ALLOW_LEGACY_INGEST_FALLBACK: "true", // forbidden in production
    AUTH_ADAPTER: "jwt",
    JWT_AUTH_SECRET: "a-request-scoped-secret-of-at-least-32b",
    JWT_AUTH_ISSUER: "https://iss.test",
    JWT_AUTH_AUDIENCE: "workunit-os",
  } as AppEnv
}

function ingestRequest(): Request {
  return new Request("http://localhost/api/workunit/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({
      id: "sig-1",
      source: "slack",
      operation: "ingest",
      event: { id: "evt-1", timestamp: new Date().toISOString(), text: "hello" },
    }),
  })
}

test("Cloudflare production with ALLOW_LEGACY_INGEST_FALLBACK=true fails closed and never reaches the backend", async () => {
  await runWithInjectedRuntimeEnv(cloudflareEnvWithLegacyFallback(), async () => {
    const res = await POST(ingestRequest())
    // The request-scoped runtime config is rejected → safe integration error.
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, "integration_missing")
    // It never reached runToolBackendRequest / the LLM pipeline: no candidate,
    // draft, sanitized signal, legacy output, or hopper target is produced.
    const serialized = JSON.stringify(body)
    for (const leaked of ["candidate", "draft", "sanitizedSignal", "hopper", "evaluation"]) {
      assert.equal(serialized.includes(leaked), false, `response must not contain ${leaked}`)
    }
    // No secret leaks into the error surface.
    assert.equal(serialized.includes("a-request-scoped-secret-of-at-least-32b"), false)
  }, { production: true })
})

test("Cloudflare production with ALLOW_MOCK_LLM=true also fails closed at the route", async () => {
  const env = cloudflareEnvWithLegacyFallback()
  ;(env as Record<string, unknown>).ALLOW_LEGACY_INGEST_FALLBACK = "false"
  ;(env as Record<string, unknown>).ALLOW_MOCK_LLM = "true"
  await runWithInjectedRuntimeEnv(env, async () => {
    const res = await POST(ingestRequest())
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, "integration_missing")
  }, { production: true })
})
