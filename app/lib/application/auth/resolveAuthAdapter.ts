import type { AuthAdapter } from "./authAdapter.ts"
import { DevAuthAdapter } from "./devAuthAdapter.ts"
import { JwtAuthAdapter } from "./jwtAuthAdapter.ts"
import { NoopProductionAuthAdapter } from "./noopProductionAuthAdapter.ts"
import type { AuthRuntimeConfig } from "../../runtime/requestRuntimeConfig.ts"

/**
 * Resolve the auth adapter from the request-scoped validated auth config. This
 * function NEVER reads `process.env`; the adapter selection and all secrets come
 * from the validated config.
 *
 * - `"jwt"`  → JwtAuthAdapter with the injected (immutable) JWT config. A missing
 *   or weak JWT config resolves to an adapter that fails closed (unauthorized).
 * - `"dev"`  → DevAuthAdapter, but ONLY when non-production and dev sessions are
 *   explicitly allowed. Dev is impossible in Cloudflare production.
 * - otherwise → NoopProductionAuthAdapter (fails closed).
 */
export function resolveAuthAdapter(
  auth: AuthRuntimeConfig,
  options: { allowDevSession?: boolean } = {},
): AuthAdapter {
  if (auth.adapter === "jwt") return new JwtAuthAdapter(auth.jwt)
  if (auth.adapter === "dev" && !auth.isProduction && options.allowDevSession === true) {
    return new DevAuthAdapter({ enabled: true })
  }
  return new NoopProductionAuthAdapter()
}
