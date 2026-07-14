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
import type { TenantDbResolver } from "./repositories.ts"
import { D1TenantDbResolver } from "./tenantDbResolver.ts"
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

  // In genuine Cloudflare production, D1 access MUST go through the tenant DB
  // resolver: it validates the control registry (active tenant + active
  // tenant_databases row) and returns the statically bound TENANT_DB_DEFAULT —
  // never the control DB. The resolver is built from the SAME frozen runtime
  // snapshot, never from ambient process.env. Local dev/test keeps the direct
  // binding path (no resolver) for convenience.
  let resolver: TenantDbResolver | undefined
  if (rt.source === "cloudflare" && rt.persistence.mode === "d1" && rt.persistence.CONTROL_DB && rt.persistence.TENANT_DB_DEFAULT) {
    resolver = new D1TenantDbResolver({
      controlDb: rt.persistence.CONTROL_DB,
      tenantDb: rt.persistence.TENANT_DB_DEFAULT,
    })
  }

  const result = await resolveRepositories(tenantId, { persistence: rt.persistence, resolver })

  if (!result.ok) {
    // Inactive/invalid tenant authorization → forbidden; unavailable/failed
    // tenant-DB routing → integration_missing. Neither discloses registry detail.
    if (result.error === "tenant_forbidden") {
      return { ok: false, error: "forbidden", status: 403 }
    }
    return { ok: false, error: "integration_missing", status: 503 }
  }

  return { ok: true, bundle: result.bundle }
}
