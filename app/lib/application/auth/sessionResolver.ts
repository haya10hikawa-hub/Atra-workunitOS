import type { SessionContext } from "../../domain/auth/types.ts"
import type { TenantId, UserId } from "../../tenant/types.ts"
import { normalizeRoleInput, RoleNormalizationError, type WorkUnitRole, type WorkUnitRoleInput } from "../../security/policy.ts"
import { resolveControlRepositories, type ControlRepositoryBundle } from "../../infrastructure/persistence/control/controlRepositoryResolver.ts"
import type { D1DatabaseLike } from "../../persistence/d1/types.ts"
import type { VerifiedAuthIdentity, AuthAdapter } from "./authAdapter.ts"
import { resolveAuthAdapter } from "./resolveAuthAdapter.ts"
import {
  resolveValidatedRequestRuntimeConfig,
  type AuthRuntimeConfig,
  type SecurityRuntimeConfig,
} from "../../runtime/requestRuntimeConfig.ts"

export type SessionResolutionFailureReason = "unauthorized" | "forbidden" | "expired" | "invalid_tenant" | "invalid_role" | "internal_error"

export type SessionResolutionResult =
  | { ok: true; session: SessionContext }
  | { ok: false; reason: SessionResolutionFailureReason }

export type ResolveSessionOptions = {
  adapter?: AuthAdapter
  auth?: AuthRuntimeConfig
  security?: SecurityRuntimeConfig
  controlDbBinding?: D1DatabaseLike
}

// Fail-closed defaults when no validated config is available.
const LOCKED_SECURITY: SecurityRuntimeConfig = Object.freeze({
  externalActionsEnabled: false,
  allowLegacyIngestFallback: false,
  allowDevSession: false,
  allowDevWorkspaceBootstrap: false,
  allowControlLessDevSession: false,
  // No origin is trusted when no validated config is available — the
  // fail-closed value for the mutation guard's trusted-origin authority.
  trustedOrigins: Object.freeze([]),
})

/**
 * Resolve the authoritative auth + security sections and the control-DB binding.
 * Explicit options (threaded from the route's single runtime-config resolution)
 * take precedence; otherwise the request-scoped config is resolved here. No
 * `process.env` is read directly.
 */
function resolveRuntimeSections(
  options: ResolveSessionOptions,
): { auth: AuthRuntimeConfig; security: SecurityRuntimeConfig; controlDbBinding?: D1DatabaseLike } {
  if (options.auth && options.security) {
    return { auth: options.auth, security: options.security, controlDbBinding: options.controlDbBinding }
  }
  const result = resolveValidatedRequestRuntimeConfig()
  if (result.ok) {
    return {
      auth: result.runtime.auth,
      security: result.runtime.security,
      controlDbBinding: options.controlDbBinding ?? result.runtime.persistence.CONTROL_DB,
    }
  }
  return { auth: { adapter: "none", isProduction: true }, security: LOCKED_SECURITY, controlDbBinding: options.controlDbBinding }
}

export async function resolveSession(
  request: Request,
  options: ResolveSessionOptions = {},
): Promise<SessionResolutionResult> {
  try {
    const { auth, security, controlDbBinding } = resolveRuntimeSections(options)
    const adapter = options.adapter ?? resolveAuthAdapter(auth, { allowDevSession: security.allowDevSession })

    const authResult = await adapter.verify(request)
    if (!authResult.ok) return { ok: false, reason: "unauthorized" }
    const identity = authResult.identity

    // ─── Control-less dev session ───────────────────────────
    // In dev sandbox with no D1/Control DB, return a session directly.
    if (shouldUseControlLessDevSession(identity, security)) {
      return { ok: true, session: createControlLessDevSession(identity, security) }
    }

    const repos = resolveControlRepositories({ d1Binding: controlDbBinding })
    if (!repos.ok) return { ok: false, reason: "unauthorized" }
    if (shouldBootstrapDevWorkspace(identity, security)) await bootstrapDevWorkspace(repos.bundle, identity, security)

    const identityRow = await repos.bundle.authIdentities.findByProviderSubject(
      repos.bundle.ctx,
      identity.provider,
      identity.providerSubject,
    )
    if (!identityRow) return { ok: false, reason: "unauthorized" }

    const user = await repos.bundle.users.findById(repos.bundle.ctx, identityRow.userId)
    if (!user) return { ok: false, reason: "unauthorized" }

    const membership = (await repos.bundle.memberships.listByUser(repos.bundle.ctx, user.id))
      .find((row) => row.status === "active")
    if (!membership) return { ok: false, reason: "forbidden" }

    const tenant = await repos.bundle.tenants.findById(repos.bundle.ctx, membership.tenantId)
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
    if (err instanceof RoleNormalizationError) return { ok: false, reason: "invalid_role" as SessionResolutionFailureReason }
    return { ok: false, reason: "internal_error" }
  }
}

// Dev-only default role. Gated by the security config (dev impossible in prod).
const DEV_DEFAULT_ROLE: WorkUnitRoleInput = "owner"

function resolveDevSessionRole(security: SecurityRuntimeConfig): WorkUnitRole {
  return normalizeRoleInput((security.devSessionRole as WorkUnitRoleInput | undefined) ?? DEV_DEFAULT_ROLE)
}

function shouldBootstrapDevWorkspace(identity: VerifiedAuthIdentity, security: SecurityRuntimeConfig): boolean {
  return security.allowDevSession
    && security.allowDevWorkspaceBootstrap
    && identity.provider === "dev"
}

async function bootstrapDevWorkspace(
  repos: ControlRepositoryBundle,
  identity: VerifiedAuthIdentity,
  security: SecurityRuntimeConfig,
): Promise<void> {
  const now = new Date().toISOString()
  const userId = identity.providerSubject as UserId
  const tenantId = "dev-tenant" as TenantId

  const user = await repos.users.findById(repos.ctx, userId)
  if (!user) {
    await repos.users.create(repos.ctx, {
      id: userId,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      createdAt: now,
      updatedAt: now,
    })
  }

  const tenant = await repos.tenants.findById(repos.ctx, tenantId)
  if (!tenant) {
    await repos.tenants.create(repos.ctx, {
      id: tenantId,
      name: "Development Tenant",
      slug: "dev-tenant",
      createdAt: now,
      updatedAt: now,
    })
  }

  const membership = await repos.memberships.findByUserAndTenant(repos.ctx, userId, tenantId)
  if (!membership) {
    await repos.memberships.create(repos.ctx, {
      id: "membership:dev-user:dev-tenant",
      tenantId,
      userId,
      role: resolveDevSessionRole(security),
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
  }

  const existingIdentity = await repos.authIdentities.findByProviderSubject(repos.ctx, identity.provider, identity.providerSubject)
  if (!existingIdentity) {
    await repos.authIdentities.create(repos.ctx, {
      id: `identity:${identity.provider}:${identity.providerSubject}`,
      userId,
      provider: identity.provider,
      providerSubject: identity.providerSubject,
      email: identity.email,
      createdAt: now,
      updatedAt: now,
    })
  }
}

// ─── Control-less dev session helpers ───────────────────────

/**
 * True ONLY when the request-scoped security config explicitly enables both dev
 * sessions and control-less dev sessions (both are false in Cloudflare
 * production) and the identity is a dev identity.
 */
function shouldUseControlLessDevSession(identity: VerifiedAuthIdentity, security: SecurityRuntimeConfig): boolean {
  return security.allowDevSession
    && security.allowControlLessDevSession
    && identity.provider === "dev"
}

function createControlLessDevSession(identity: VerifiedAuthIdentity, security: SecurityRuntimeConfig): SessionContext {
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
