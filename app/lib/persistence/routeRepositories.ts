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
import {
  resolveProductionRepositories,
  resolveLocalRepositories,
  type RepositoryResolutionResult,
  type TenantRepositoryBundle,
} from "./repositoryResolver.ts"
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

  // Authority is chosen STRUCTURALLY from the frozen runtime source (Blocker 1):
  //   - Cloudflare production → resolveProductionRepositories with a MANDATORY
  //     tenant DB resolver. The resolver validates the control registry (active
  //     tenant + complete active tenant_databases record) and returns the
  //     statically bound TENANT_DB_DEFAULT — never the control DB, never a direct
  //     binding. It is built from the SAME frozen snapshot, never process.env.
  //   - Local development → resolveLocalRepositories (explicitly named), the only
  //     API that permits a direct binding.
  let result: RepositoryResolutionResult
  if (rt.source === "cloudflare") {
    if (rt.persistence.mode !== "d1" || !rt.persistence.CONTROL_DB || !rt.persistence.TENANT_DB_DEFAULT) {
      return { ok: false, error: "integration_missing", status: 503 }
    }
    const resolver = new D1TenantDbResolver({
      controlDb: rt.persistence.CONTROL_DB,
      tenantDb: rt.persistence.TENANT_DB_DEFAULT,
    })
    result = await resolveProductionRepositories(tenantId, { persistence: rt.persistence, resolver })
  } else {
    result = await resolveLocalRepositories(tenantId, { persistence: rt.persistence, allowDirectBinding: true })
  }

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
