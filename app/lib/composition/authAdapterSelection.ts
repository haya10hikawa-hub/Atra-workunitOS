import type { AuthAdapter } from "../application/auth/authAdapter.ts"
import { DevAuthAdapter } from "../application/auth/devAuthAdapter.ts"
import { JwtAuthAdapter } from "../application/auth/jwtAuthAdapter.ts"
import { NoopProductionAuthAdapter } from "../application/auth/noopProductionAuthAdapter.ts"
import type { AuthRuntimeConfig } from "../runtime/requestRuntimeConfig.ts"

/**
 * Resolve the auth adapter from the request-scoped validated auth config. This
 * selection is composition-owned: the application session path receives the
 * chosen `AuthAdapter` and can no longer pick an implementation itself. This
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
