import type { SessionContext, SessionResolutionFailureReason } from "../../domain/auth/types.ts"
import type { TenantId, UserId } from "../../tenant/types.ts"
import { normalizeRoleInput, RoleNormalizationError, type TenantRoleInput } from "../../domain/auth/roles.ts"
import type { ControlDirectoryReadPort, DevWorkspaceBootstrapPort } from "./controlDirectory.ts"
import type { VerifiedAuthIdentity, AuthAdapter } from "./authAdapter.ts"

export type { SessionResolutionFailureReason }

export type SessionResolutionResult =
  | { ok: true; session: SessionContext }
  | { ok: false; reason: SessionResolutionFailureReason }

/**
 * The dev capability gates this use case reads. Structurally a subset of the
 * runtime security projection, but declared here so the use case owns the
 * contract it consumes rather than naming the runtime configuration layer.
 */
export type DevSessionPolicy = {
  readonly allowDevSession: boolean
  readonly allowDevWorkspaceBootstrap: boolean
  readonly allowControlLessDevSession: boolean
  readonly devSessionRole?: string
}

/**
 * Everything this use case needs, already resolved. It selects no runtime
 * environment, no auth adapter implementation, no repository implementation and
 * no database binding: the request composition root owns every one of those
 * choices and passes the result in.
 *
 * `controlDirectory` is null when the control DB is not configured for this
 * request. That is not an error the use case reports on its own — it is only
 * reachable after the control-less dev gate has already declined.
 *
 * `devBootstrap` is the durable dev-workspace write capability, and it is
 * OPTIONAL because the composition root omits it entirely for safe HTTP methods.
 * Absence is not a flag the use case is asked to honour: with the field absent
 * there is no object here through which a create could be reached, whatever the
 * dev policy says. `controlDirectory` is typed as the READ port for the same
 * reason — resolving a session confers lookup authority and nothing else.
 */
export type SessionDependencies = {
  readonly authAdapter: AuthAdapter
  readonly controlDirectory: ControlDirectoryReadPort | null
  readonly devPolicy: DevSessionPolicy
  readonly devBootstrap?: DevWorkspaceBootstrapPort
}

export async function resolveSession(
  request: Request,
  dependencies: SessionDependencies,
): Promise<SessionResolutionResult> {
  const { authAdapter, controlDirectory, devPolicy, devBootstrap } = dependencies
  try {
    const authResult = await authAdapter.verify(request)
    if (!authResult.ok) return { ok: false, reason: "unauthorized" }
    const identity = authResult.identity

    // ─── Control-less dev session ───────────────────────────
    // In dev sandbox with no D1/Control DB, return a session directly. Checked
    // before the control directory is consulted, exactly as before.
    if (shouldUseControlLessDevSession(identity, devPolicy)) {
      return { ok: true, session: createControlLessDevSession(identity, devPolicy) }
    }

    if (!controlDirectory) return { ok: false, reason: "unauthorized" }
    // The dev gates are unchanged and still all required. What changed is that
    // they are no longer sufficient: without the capability there is nothing to
    // bootstrap THROUGH, so a safe request falls straight to the lookups below
    // and produces whatever result an uninitialized directory already produced.
    if (devBootstrap && shouldBootstrapDevWorkspace(identity, devPolicy)) {
      await bootstrapDevWorkspace(devBootstrap, identity, devPolicy)
    }

    const identityRow = await controlDirectory.findAuthIdentity(identity.provider, identity.providerSubject)
    if (!identityRow) return { ok: false, reason: "unauthorized" }

    const user = await controlDirectory.findUserById(identityRow.userId)
    if (!user) return { ok: false, reason: "unauthorized" }

    const membership = (await controlDirectory.listMembershipsByUser(user.id))
      .find((row) => row.status === "active")
    if (!membership) return { ok: false, reason: "forbidden" }

    const tenant = await controlDirectory.findTenantById(membership.tenantId)
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

// Dev-only default role. Gated by the dev policy (dev impossible in prod).
const DEV_DEFAULT_ROLE: TenantRoleInput = "owner"

function resolveDevSessionRole(devPolicy: DevSessionPolicy): SessionContext["role"] {
  return normalizeRoleInput((devPolicy.devSessionRole as TenantRoleInput | undefined) ?? DEV_DEFAULT_ROLE)
}

function shouldBootstrapDevWorkspace(identity: VerifiedAuthIdentity, devPolicy: DevSessionPolicy): boolean {
  return devPolicy.allowDevSession
    && devPolicy.allowDevWorkspaceBootstrap
    && identity.provider === "dev"
}

async function bootstrapDevWorkspace(
  control: DevWorkspaceBootstrapPort,
  identity: VerifiedAuthIdentity,
  devPolicy: DevSessionPolicy,
): Promise<void> {
  const now = new Date().toISOString()
  const userId = identity.providerSubject as UserId
  const tenantId = "dev-tenant" as TenantId

  const user = await control.findUserById(userId)
  if (!user) {
    await control.createUser({
      id: userId,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      createdAt: now,
      updatedAt: now,
    })
  }

  const tenant = await control.findTenantById(tenantId)
  if (!tenant) {
    await control.createTenant({
      id: tenantId,
      name: "Development Tenant",
      slug: "dev-tenant",
      createdAt: now,
      updatedAt: now,
    })
  }

  const membership = await control.findMembership(userId, tenantId)
  if (!membership) {
    await control.createMembership({
      id: "membership:dev-user:dev-tenant",
      tenantId,
      userId,
      role: resolveDevSessionRole(devPolicy),
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
  }

  const existingIdentity = await control.findAuthIdentity(identity.provider, identity.providerSubject)
  if (!existingIdentity) {
    await control.createAuthIdentity({
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
 * True ONLY when the request-scoped dev policy explicitly enables both dev
 * sessions and control-less dev sessions (both are false in Cloudflare
 * production) and the identity is a dev identity.
 */
function shouldUseControlLessDevSession(identity: VerifiedAuthIdentity, devPolicy: DevSessionPolicy): boolean {
  return devPolicy.allowDevSession
    && devPolicy.allowControlLessDevSession
    && identity.provider === "dev"
}

function createControlLessDevSession(identity: VerifiedAuthIdentity, devPolicy: DevSessionPolicy): SessionContext {
  const now = new Date()
  return {
    userId: "dev-user" as UserId,
    tenantId: "dev-tenant" as TenantId,
    role: resolveDevSessionRole(devPolicy),
    email: identity.email,
    isDevSession: true,
    sessionId: `dev:${identity.providerSubject}:${Date.now()}`,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }
}
