/**
 * Cloudflare Runtime Environment Accessor (production, pure)
 *
 * The ONLY production source of the per-request Cloudflare environment. It reads
 * the request-scoped context installed by the generated OpenNext worker
 * (`.open-next/worker.js`) through the officially supported accessor
 * `getCloudflareContext()` from `@opennextjs/cloudflare`.
 *
 * SAFETY INVARIANTS (enforced by tests/cloudflareRuntimeEnvArchitecture.test.mts):
 *   - NO mutable module/process-global env variable.
 *   - NO exported setter.
 *   - NO fallback to a process/module-global env object.
 *   - Absence or malformation of the request context returns null (fail closed).
 *
 * Test injection lives in a STRUCTURALLY SEPARATE module
 * (`requestRuntimeEnvInjection.ts`) and is NOT reachable from this accessor.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { AppEnv } from "../../types/cloudflare-env.ts"

/**
 * Get the Cloudflare runtime environment for the current request.
 *
 * Returns null when no worker context is active (local dev / SSG / tests) or the
 * context is malformed. Never throws; never caches; never falls back to a global.
 */
export function getRequestRuntimeEnv(): AppEnv | null {
  try {
    // Sync mode: valid inside a request handler where OpenNext has installed the
    // per-request context on the global scope. Throws otherwise.
    const context = getCloudflareContext() as { env?: unknown } | undefined
    const env = context?.env
    if (env && typeof env === "object") return env as AppEnv
    return null
  } catch {
    // No active request context / malformed context → fail closed.
    return null
  }
}
