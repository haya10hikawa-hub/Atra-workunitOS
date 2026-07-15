/**
 * Local Persistence Fallback Authority (Blocker 2, P0-PERSIST-014)
 *
 * A single, central authority for the ONLY circumstance in which an API route may
 * substitute generated / empty / default data for a real persistence failure:
 * explicit, non-production local development.
 *
 * Production — Cloudflare (`source: "cloudflare"`) AND Node (`source: "local"` with
 * `auth.isProduction === true`) — must NEVER return generated, empty, or fake
 * success data after a persistence failure. Gating on `runtime.source` alone is
 * insufficient (a local runtime can be production), so routes MUST call this
 * helper rather than deciding for themselves.
 *
 * The fallback is authorized only when ALL of the following hold:
 *   - the request runtime source is local (not a Cloudflare production request);
 *   - the runtime is explicitly non-production (`auth.isProduction === false`);
 *   - the active auth adapter is the explicitly enabled development adapter;
 *   - an explicit development capability is enabled (`allowDevSession`);
 *   - no genuine Cloudflare request context is active (defense in depth).
 *
 * This helper adds NO new `ALLOW_*` capability and reads NO `process.env.NODE_ENV`;
 * it consumes only the already-validated, frozen request runtime config.
 */

import type { ValidatedRequestRuntimeConfig } from "./requestRuntimeConfig.ts"
import { getRequestRuntimeEnv } from "./cloudflareRuntimeEnv.ts"

export function canUseLocalPersistenceFallback(
  runtime: ValidatedRequestRuntimeConfig,
): boolean {
  // Cloudflare production request → never.
  if (runtime.source !== "local") return false
  // Node production (local source but production auth) → never.
  if (runtime.auth.isProduction !== false) return false
  // Must be the explicitly enabled development auth adapter…
  if (runtime.auth.adapter !== "dev") return false
  // …with an explicit development capability enabled (not a broad prod flag).
  if (runtime.security.allowDevSession !== true) return false
  // Defense in depth: a genuine Cloudflare context must not be active. In
  // production this always returns null; a real worker context forbids fallback
  // even if the projection above were somehow misclassified.
  if (getRequestRuntimeEnv() !== null) return false
  return true
}
