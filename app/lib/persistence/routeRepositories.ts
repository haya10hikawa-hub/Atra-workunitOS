/**
 * Route Repository Helper
 *
 * Centralizes repository resolution for API route handlers. All lifecycle routes
 * use this instead of calling resolveRepositories() directly.
 *
 * This helper:
 *   - Uses the request-scoped validated runtime config's PERSISTENCE projection
 *     (mode + D1 bindings from ONE validated snapshot). The raw Cloudflare env is
 *     never read here; process.env can never override the active request env.
 *   - Maps persistence failures to safe API-level errors (never raw binding/config).
 */

import type { TenantId } from "../tenant/types.ts"
import { resolveRepositories } from "./repositoryResolver.ts"
import type { TenantRepositoryBundle } from "./repositoryResolver.ts"
import type { SafeErrorCode } from "../security/safeErrors.ts"
import {
  resolveValidatedRequestRuntimeConfig,
  type ValidatedRequestRuntimeConfig,
} from "../runtime/requestRuntimeConfig.ts"

// ─── Types ──────────────────────────────────────────────────────

export type RouteRepositoryResult =
  | { ok: true; bundle: TenantRepositoryBundle }
  | { ok: false; error: SafeErrorCode; status: number }

// ─── Resolution ─────────────────────────────────────────────────

/**
 * Resolve repositories for the current route context.
 *
 * Call from within a route handler after session resolution. Prefer threading in
 * the runtime config the route already resolved (so the raw env is read once per
 * request); otherwise it is resolved here. Returns a repository bundle or a safe
 * API error.
 */
export async function resolveRouteRepositories(
  tenantId: TenantId,
  runtime?: ValidatedRequestRuntimeConfig,
): Promise<RouteRepositoryResult> {
  let rt = runtime
  if (!rt) {
    const resolved = resolveValidatedRequestRuntimeConfig()
    if (!resolved.ok) return { ok: false, error: "integration_missing", status: 503 }
    rt = resolved.runtime
  }

  const result = await resolveRepositories(tenantId, { persistence: rt.persistence })

  if (!result.ok) {
    return { ok: false, error: "integration_missing", status: 503 }
  }

  return { ok: true, bundle: result.bundle }
}
