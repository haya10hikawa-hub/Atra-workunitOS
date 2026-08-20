import type {
  LegacyTenantRole,
  SessionContext,
  SessionResolutionFailureReason,
  TenantRole,
} from "../domain/auth/types.ts"
import type { TenantId, UserId } from "../tenant/types.ts"
import { normalizeRoleInput } from "../domain/auth/roles.ts"

export type Session = SessionContext

/**
 * Transport projection of a session failure. This module no longer resolves a
 * session: assembling the session use case's dependencies is the request
 * composition root's job (`app/lib/composition/requestSession.ts`), and routes
 * call it directly. The security boundary keeps only what is genuinely its own —
 * the failure→status policy and the development session constructors — so the
 * security↔application cycle no longer exists in either direction.
 */
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
