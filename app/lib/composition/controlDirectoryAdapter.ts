/**
 * Adapts the concrete control-DB repository bundle onto the two narrow session
 * capabilities the use case consumes.
 *
 * The database context is bound here, once, rather than threaded through the
 * use case: the request composition root already knows which control database
 * this request is talking to, and the use case has no business restating it.
 *
 * TWO FACTORIES, NOT ONE OBJECT WITH TWO FACES
 *   `toControlDirectoryRead` builds an object whose OWN properties are the four
 *   lookups and nothing else. It is not the bootstrap object narrowed by a type
 *   annotation: a narrowed type still leaves the create closures present at
 *   runtime, reachable by a dynamically-keyed access or a structural cast. There
 *   is no create closure on the returned object to reach.
 */

import type {
  ControlAuthIdentityRecord,
  ControlDirectoryReadPort,
  ControlMembershipRecord,
  ControlTenantRecord,
  ControlUserRecord,
  DevWorkspaceBootstrapPort,
} from "../application/auth/controlDirectory.ts"
import type { TenantId, UserId } from "../domain/tenant/types.ts"
import type { ControlRepositoryBundle } from "../infrastructure/persistence/control/controlRepositoryResolver.ts"

/**
 * The read capability every authenticated request receives. Four own properties,
 * no create closure captured.
 */
export function toControlDirectoryRead(bundle: ControlRepositoryBundle): ControlDirectoryReadPort {
  const ctx = bundle.ctx
  return {
    findAuthIdentity: (provider: string, providerSubject: string): Promise<ControlAuthIdentityRecord | null> =>
      bundle.authIdentities.findByProviderSubject(ctx, provider, providerSubject),
    findUserById: (userId: UserId): Promise<ControlUserRecord | null> =>
      bundle.users.findById(ctx, userId),
    listMembershipsByUser: (userId: UserId): Promise<ControlMembershipRecord[]> =>
      bundle.memberships.listByUser(ctx, userId),
    findTenantById: (tenantId: TenantId): Promise<ControlTenantRecord | null> =>
      bundle.tenants.findById(ctx, tenantId),
  }
}

/**
 * The durable dev-workspace bootstrap capability. Built ONLY when the request
 * composition root has already established that this request may carry it.
 */
export function toDevWorkspaceBootstrap(bundle: ControlRepositoryBundle): DevWorkspaceBootstrapPort {
  const ctx = bundle.ctx
  return {
    ...toControlDirectoryRead(bundle),
    findMembership: (userId: UserId, tenantId: TenantId): Promise<ControlMembershipRecord | null> =>
      bundle.memberships.findByUserAndTenant(ctx, userId, tenantId),
    createAuthIdentity: async (record: ControlAuthIdentityRecord): Promise<void> => {
      await bundle.authIdentities.create(ctx, record)
    },
    createUser: async (record: ControlUserRecord): Promise<void> => {
      await bundle.users.create(ctx, record)
    },
    createMembership: async (record: ControlMembershipRecord): Promise<void> => {
      await bundle.memberships.create(ctx, record)
    },
    createTenant: async (record: ControlTenantRecord): Promise<void> => {
      await bundle.tenants.create(ctx, record)
    },
  }
}
