/**
 * Cloudflare Runtime Environment Bridge
 *
 * Provides a safe, request-scoped way to access the Cloudflare runtime
 * environment (D1 bindings + vars) from route handlers.
 *
 * PRODUCTION (Cloudflare Workers / OpenNext):
 *   - The generated OpenNext worker (`.open-next/worker.js`) installs the
 *     per-request Cloudflare context on the global scope for the duration of
 *     each request. We read it through the officially supported accessor
 *     `getCloudflareContext()` from `@opennextjs/cloudflare`.
 *   - The bridge NEVER stores per-request bindings in mutable module/process
 *     global state, so one request can never observe another request's env.
 *   - A missing or malformed context fails closed (returns null); consumers
 *     map that to a safe integration error.
 *
 * LOCAL DEV / Next.js (`next dev`) and unit tests:
 *   - No Cloudflare worker context is present, so `getCloudflareContext()`
 *     throws. We catch it and fall back to null (→ in-memory when explicitly
 *     allowed, otherwise disabled).
 *   - Tests inject a fake env through a clearly separated, request-scoped
 *     mechanism (`runWithTestRuntimeEnv`, backed by AsyncLocalStorage) so
 *     concurrent async "requests" stay isolated. A legacy sequential helper
 *     (`setTestRuntimeEnvForRequest`) is retained for existing tests.
 *
 * SAFETY INVARIANT:
 *   A genuine Cloudflare request context ALWAYS takes precedence over any test
 *   injection, so a test override can never leak into a production request.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { AppEnv } from "../../types/cloudflare-env.ts"

// ─── Production accessor (request-scoped, no global caching) ─────

/**
 * Read the request-scoped Cloudflare env from OpenNext.
 *
 * Returns null when:
 *   - no worker context is active (local dev / SSG / tests), or
 *   - the context is malformed (missing/invalid `env`).
 *
 * Never throws; never caches the result in module state.
 */
function readCloudflareContextEnv(): AppEnv | null {
  try {
    // Sync mode: valid inside a request handler where OpenNext has installed
    // the per-request context on the global scope. Throws otherwise.
    const context = getCloudflareContext() as { env?: unknown } | undefined
    const env = context?.env
    if (env && typeof env === "object") return env as AppEnv
    return null
  } catch {
    // No active request context / malformed context → fail closed.
    return null
  }
}

/**
 * Production env provider. Swappable ONLY by tests that need to simulate a
 * genuine Cloudflare request context (to prove test overrides cannot shadow a
 * real request). Production code never swaps this.
 */
let productionEnvProvider: () => AppEnv | null = readCloudflareContextEnv

/** Test seam: install/clear a fake production context provider. Test-only. */
export function __setProductionRuntimeEnvProviderForTests(
  provider: (() => AppEnv | null) | null,
): void {
  productionEnvProvider = provider ?? readCloudflareContextEnv
}

// ─── Request-scoped test injection (AsyncLocalStorage) ──────────

const testEnvStore = new AsyncLocalStorage<AppEnv | null>()

/**
 * Run `fn` with a request-scoped fake runtime env. Concurrent invocations are
 * isolated: each async execution observes only its own injected env. Test-only.
 */
export function runWithTestRuntimeEnv<T>(env: AppEnv | null, fn: () => T): T {
  return testEnvStore.run(env, fn)
}

// ─── Legacy sequential test injection (test-only) ───────────────
//
// Retained for existing tests that set/reset synchronously around a single
// call. This is a TEST-ONLY seam: it is consulted only AFTER the production
// provider returns null, so it can never shadow a genuine Cloudflare request.

let legacyTestEnv: AppEnv | null = null

/** Set a fake runtime env for the current (sequential) test. Test-only. */
export function setTestRuntimeEnvForRequest(env: AppEnv | null): void {
  legacyTestEnv = env
}

/** Clear the fake runtime env between tests. Test-only. */
export function resetTestRuntimeEnvForRequest(): void {
  legacyTestEnv = null
}

// ─── Public accessor ────────────────────────────────────────────

/**
 * Get the Cloudflare runtime environment for the current request.
 *
 * Resolution order (production always wins over test injection):
 *   1. Genuine Cloudflare request context (production).
 *   2. Request-scoped test injection (AsyncLocalStorage).
 *   3. Legacy sequential test injection.
 *   4. null (no runtime env available).
 */
export function getRequestRuntimeEnv(): AppEnv | null {
  const production = productionEnvProvider()
  if (production) return production

  const scoped = testEnvStore.getStore()
  if (scoped !== undefined) return scoped

  return legacyTestEnv
}
