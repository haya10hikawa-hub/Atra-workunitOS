/**
 * Request Runtime Env Injection (test seam — structurally separate)
 *
 * Provides a request-scoped AsyncLocalStorage seam so tests can supply a fake
 * Cloudflare runtime env WITHOUT any mutable module/process global in the
 * production accessor. The injected value lives in async-context storage — never
 * a plain module-global variable — and is scoped to the injector.
 *
 * BOUNDARY (enforced by tests/cloudflareRuntimeEnvArchitecture.test.mts):
 *   - The production accessor `getRequestRuntimeEnv()` (cloudflareRuntimeEnv.ts)
 *     does NOT import this module and is NOT reachable to it.
 *   - Application routes do NOT import this module.
 *   - Only the request runtime config resolver reads it (via `peekInjectedRuntimeEnv`,
 *     which is production-safe: it returns `undefined` outside an injector scope),
 *     and only tests drive it.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import type { AppEnv } from "../../types/cloudflare-env.ts"

export type InjectedRuntimeEnv = {
  readonly env: AppEnv
  /**
   * When true, the injected env is an authoritative Cloudflare production request
   * (strict validation; dev impossible; process.env never consulted). When false,
   * it simulates local development where persistence D1 bindings come from the
   * injected env but auth/security/llm come from the explicit process.env path.
   */
  readonly production: boolean
}

const store = new AsyncLocalStorage<InjectedRuntimeEnv | undefined>()

/**
 * Production-safe read of any active injected env. Returns `undefined` in
 * production (no injector scope is ever entered there).
 */
export function peekInjectedRuntimeEnv(): InjectedRuntimeEnv | undefined {
  return store.getStore()
}

/**
 * Test-only request-scoped injector (callback form). Concurrent invocations are
 * isolated: each async execution observes only its own injected env.
 */
export function runWithInjectedRuntimeEnv<T>(
  env: AppEnv,
  fn: () => T,
  options: { production?: boolean } = {},
): T {
  return store.run({ env, production: options.production ?? true }, fn)
}

// ─── Sequential test shims (test-only) ──────────────────────────
//
// Backed by AsyncLocalStorage.enterWith (async-context scoped, auto-cleared when
// the async context unwinds) — NOT a mutable module-global variable. Default
// mode is LOCAL (dev auth from process.env + injected D1), matching dev-session
// route tests; pass `{ production: true }` to simulate a Cloudflare request.

export function setTestRuntimeEnvForRequest(env: AppEnv, options: { production?: boolean } = {}): void {
  store.enterWith({ env, production: options.production ?? false })
}

export function resetTestRuntimeEnvForRequest(): void {
  store.enterWith(undefined)
}
