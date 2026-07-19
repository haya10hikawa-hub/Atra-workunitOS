/**
 * Control-plane session authority adapter (infrastructure).
 *
 * Implements the domain `SessionAuthorityPort` over the control repositories.
 * All control-repository-specific knowledge (D1DatabaseLike, the control bundle,
 * repository classes) stays here — never in `app/lib/application/**`.
 *
 * Repository-resolution failure fails CLOSED: when no control DB is available the
 * factory returns `null`, and the application resolver treats a null authority as
 * unauthorized (mirrors the previous `resolveControlRepositories` !ok path).
 */

import { resolveControlRepositories, type ControlRepositoryBundle } from "./controlRepositoryResolver.ts"
import type { D1DatabaseLike } from "../../../persistence/d1/types.ts"
import type { TenantId, UserId } from "../../../tenant/types.ts"
import type {
  DevWorkspaceBootstrapInput,
  SessionAuthIdentity,
  SessionAuthorityPort,
  SessionMembership,
  SessionTenant,
  SessionUser,
} from "../../../domain/ports/sessionAuthority.ts"

/**
 * Construct a session authority backed by the control repositories, or `null`
 * when the control DB is not configured (fail closed).
 */
export function createControlSessionAuthority(controlDbBinding?: D1DatabaseLike): SessionAuthorityPort | null {
  const repos = resolveControlRepositories({ d1Binding: controlDbBinding })
  if (!repos.ok) return null
  const { bundle } = repos
  const { ctx } = bundle

  return {
    async findAuthIdentity(provider, providerSubject): Promise<SessionAuthIdentity | null> {
      const row = await bundle.authIdentities.findByProviderSubject(ctx, provider, providerSubject)
      return row ? { userId: row.userId } : null
    },
    async findUser(userId): Promise<SessionUser | null> {
      const user = await bundle.users.findById(ctx, userId)
      return user ? { id: user.id, email: user.email } : null
    },
    async listMemberships(userId): Promise<readonly SessionMembership[]> {
      const rows = await bundle.memberships.listByUser(ctx, userId)
      return rows.map((row) => ({ tenantId: row.tenantId, role: row.role, status: row.status }))
    },
    async findTenant(tenantId): Promise<SessionTenant | null> {
      const tenant = await bundle.tenants.findById(ctx, tenantId)
      return tenant ? { status: tenant.status } : null
    },
    async bootstrapDevelopmentWorkspace(input): Promise<void> {
      await bootstrapDevelopmentWorkspace(bundle, input)
    },
  }
}

/** Idempotently provision the explicitly-authorized development workspace. */
async function bootstrapDevelopmentWorkspace(
  bundle: ControlRepositoryBundle,
  input: DevWorkspaceBootstrapInput,
): Promise<void> {
  const now = new Date().toISOString()
  const userId = input.identity.providerSubject as UserId
  const tenantId = "dev-tenant" as TenantId

  const user = await bundle.users.findById(bundle.ctx, userId)
  if (!user) {
    await bundle.users.create(bundle.ctx, {
      id: userId,
      email: input.identity.email,
      displayName: input.identity.displayName,
      avatarUrl: input.identity.avatarUrl,
      createdAt: now,
      updatedAt: now,
    })
  }

  const tenant = await bundle.tenants.findById(bundle.ctx, tenantId)
  if (!tenant) {
    await bundle.tenants.create(bundle.ctx, {
      id: tenantId,
      name: "Development Tenant",
      slug: "dev-tenant",
      createdAt: now,
      updatedAt: now,
    })
  }

  const membership = await bundle.memberships.findByUserAndTenant(bundle.ctx, userId, tenantId)
  if (!membership) {
    await bundle.memberships.create(bundle.ctx, {
      id: "membership:dev-user:dev-tenant",
      tenantId,
      userId,
      role: input.role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
  }

  const existingIdentity = await bundle.authIdentities.findByProviderSubject(bundle.ctx, input.identity.provider, input.identity.providerSubject)
  if (!existingIdentity) {
    await bundle.authIdentities.create(bundle.ctx, {
      id: `identity:${input.identity.provider}:${input.identity.providerSubject}`,
      userId,
      provider: input.identity.provider,
      providerSubject: input.identity.providerSubject,
      email: input.identity.email,
      createdAt: now,
      updatedAt: now,
    })
  }
}
