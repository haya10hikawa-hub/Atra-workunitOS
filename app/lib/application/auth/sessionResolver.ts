/**
 * Application session resolver (pure, injected use case).
 *
 * Orchestrates the session flow from injected dependencies only. It does NOT
 * resolve ambient runtime configuration, select auth adapters, or construct
 * repositories — those live in the request composition root and infrastructure
 * adapters. It depends only on domain/application/tenant contracts.
 *
 * Invariant preserved: tenantId and role come from control-DB membership (via the
 * session authority port), never from JWT claims or client fields.
 */

import type { SessionContext } from "../../domain/auth/types.ts"
import type { TenantId, UserId } from "../../tenant/types.ts"
import { normalizeRoleInput, RoleNormalizationError, type WorkUnitRole, type WorkUnitRoleInput } from "../../domain/auth/role.ts"
import type { AuthAdapter, VerifiedAuthIdentity } from "./authAdapter.ts"
import type { SessionAuthorityPort } from "../../domain/ports/sessionAuthority.ts"

export type SessionResolutionFailureReason = "unauthorized" | "forbidden" | "expired" | "invalid_tenant" | "invalid_role" | "internal_error"

export type SessionResolutionResult =
  | { ok: true; session: SessionContext }
  | { ok: false; reason: SessionResolutionFailureReason }

/**
 * Application-level security policy for session resolution — decoupled from the
 * runtime config shape. The composition root maps the runtime security section
 * into this narrow contract.
 */
export type SessionSecurityPolicy = {
  readonly allowDevSession: boolean
  readonly allowControlLessDevSession: boolean
  readonly allowDevWorkspaceBootstrap: boolean
  readonly devSessionRole?: string
}

export type SessionResolutionDependencies = {
  readonly authAdapter: AuthAdapter
  readonly sessionAuthority: SessionAuthorityPort | null
  readonly security: SessionSecurityPolicy
}

export async function resolveSession(
  request: Request,
  dependencies: SessionResolutionDependencies,
): Promise<SessionResolutionResult> {
  const { authAdapter, sessionAuthority, security } = dependencies
  try {
    const authResult = await authAdapter.verify(request)
    if (!authResult.ok) return { ok: false, reason: "unauthorized" }
    const identity = authResult.identity

    // ─── Control-less dev session ───────────────────────────
    // Explicitly-gated dev sandbox with no control DB: return a session directly.
    if (shouldUseControlLessDevSession(identity, security)) {
      return { ok: true, session: createControlLessDevSession(identity, security) }
    }

    // Fail closed when no session authority is available (e.g. control DB absent).
    if (!sessionAuthority) return { ok: false, reason: "unauthorized" }

    if (shouldBootstrapDevWorkspace(identity, security)) {
      await sessionAuthority.bootstrapDevelopmentWorkspace({
        identity: {
          provider: identity.provider,
          providerSubject: identity.providerSubject,
          email: identity.email,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
        },
        role: resolveDevSessionRole(security),
      })
    }

    const identityRow = await sessionAuthority.findAuthIdentity(identity.provider, identity.providerSubject)
    if (!identityRow) return { ok: false, reason: "unauthorized" }

    const user = await sessionAuthority.findUser(identityRow.userId)
    if (!user) return { ok: false, reason: "unauthorized" }

    const membership = (await sessionAuthority.listMemberships(user.id)).find((row) => row.status === "active")
    if (!membership) return { ok: false, reason: "forbidden" }

    const tenant = await sessionAuthority.findTenant(membership.tenantId)
    if (!tenant) return { ok: false, reason: "invalid_tenant" }
    if (tenant.status !== "active") return { ok: false, reason: "forbidden" }

    return {
      ok: true,
      session: {
        userId: user.id,
        // Tenant + role come from the control DB membership — NEVER JWT claims.
        tenantId: membership.tenantId,
        role: normalizeRoleInput(membership.role),
        email: identity.email || user.email,
        isDevSession: identity.provider === "dev",
        sessionId: `${identity.provider}:${identity.providerSubject}:${Date.now()}`,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    }
  } catch (err) {
    if (err instanceof RoleNormalizationError) return { ok: false, reason: "invalid_role" }
    return { ok: false, reason: "internal_error" }
  }
}

// Dev-only default role. Gated by the security policy (dev impossible in prod).
const DEV_DEFAULT_ROLE: WorkUnitRoleInput = "owner"

function resolveDevSessionRole(security: SessionSecurityPolicy): WorkUnitRole {
  return normalizeRoleInput((security.devSessionRole as WorkUnitRoleInput | undefined) ?? DEV_DEFAULT_ROLE)
}

function shouldBootstrapDevWorkspace(identity: VerifiedAuthIdentity, security: SessionSecurityPolicy): boolean {
  return security.allowDevSession
    && security.allowDevWorkspaceBootstrap
    && identity.provider === "dev"
}

// ─── Control-less dev session helpers ───────────────────────

/**
 * True ONLY when the security policy explicitly enables both dev sessions and
 * control-less dev sessions (both false in Cloudflare production) and the
 * identity is a dev identity.
 */
function shouldUseControlLessDevSession(identity: VerifiedAuthIdentity, security: SessionSecurityPolicy): boolean {
  return security.allowDevSession
    && security.allowControlLessDevSession
    && identity.provider === "dev"
}

function createControlLessDevSession(identity: VerifiedAuthIdentity, security: SessionSecurityPolicy): SessionContext {
  const now = new Date()
  return {
    userId: "dev-user" as UserId,
    tenantId: "dev-tenant" as TenantId,
    role: resolveDevSessionRole(security),
    email: identity.email,
    isDevSession: true,
    sessionId: `dev:${identity.providerSubject}:${Date.now()}`,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }
}
