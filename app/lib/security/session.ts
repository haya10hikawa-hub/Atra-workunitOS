import type { LegacyTenantRole, SessionContext, TenantRole } from "../domain/auth/types.ts"
import type { TenantId, UserId } from "../tenant/types.ts"
import { normalizeRoleInput } from "./policy.ts"
import {
  resolveSession,
  type SessionResolutionFailureReason,
  type SessionResolutionResult,
} from "../application/auth/sessionResolver.ts"
import { composeRequestServices } from "../runtime/composeRequestServices.ts"
import {
  resolveValidatedRequestRuntimeConfig,
  type ValidatedRequestRuntimeConfig,
} from "../runtime/requestRuntimeConfig.ts"

export type Session = SessionContext

export type SessionVerificationResult = SessionResolutionResult

/**
 * Require an authenticated session. The auth adapter, JWT config, dev gates, and
 * control-DB binding all come from the request-scoped validated runtime config —
 * never ambient `process.env` (the config's local path owns that seam). Routes
 * resolve the config ONCE and thread it in; a config error fails closed.
 *
 * The ENTIRE facade flow (runtime resolution → composeRequestServices → pure
 * resolveSession) runs inside a single fail-closed envelope: an ORDINARY invalid
 * runtime config returns `unauthorized`, while any UNEXPECTED exception from
 * runtime resolution, config projection, or auth/session-authority adapter
 * construction resolves to `internal_error` instead of rejecting the route
 * promise. The exception, runtime config, secrets, DB bindings, and tenant data
 * are never logged or exposed.
 */
export async function requireSession(
  request: Request = new Request("http://localhost"),
  runtime?: ValidatedRequestRuntimeConfig,
): Promise<SessionVerificationResult> {
  try {
    let rt = runtime
    if (!rt) {
      const resolved = resolveValidatedRequestRuntimeConfig()
      if (!resolved.ok) return { ok: false, reason: "unauthorized" }
      rt = resolved.runtime
    }
    // Compose the request-scoped session dependencies (auth adapter, control
    // session-authority adapter, security policy), then invoke the pure resolver.
    return await resolveSession(request, composeRequestServices(rt))
  } catch {
    return { ok: false, reason: "internal_error" }
  }
}

export function getSessionErrorStatus(reason: SessionResolutionFailureReason): number {
  if (reason === "forbidden" || reason === "invalid_tenant" || reason === "invalid_role") return 403
  if (reason === "internal_error") return 500
  return 401
}

function createDevSession(role?: TenantRole | LegacyTenantRole): Session {
  return {
    userId: "dev-user" as UserId,
    tenantId: "dev-tenant" as TenantId,
    role: normalizeRoleInput(role),
    email: "dev@example.local",
    isDevSession: true,
    sessionId: `dev-session:${Date.now()}`,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export function createDevSessionWithRole(role: TenantRole | LegacyTenantRole): Session {
  return createDevSession(role)
}

export function createAnonymousDevelopmentTenantContext(): Session {
  return createDevSession("viewer")
}
