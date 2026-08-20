/**
 * Adapts the concrete control-DB repository bundle onto the narrow
 * `ControlDirectoryPort` the session use case consumes.
 *
 * The database context is bound here, once, rather than threaded through the
 * use case: the request composition root already knows which control database
 * this request is talking to, and the use case has no business restating it.
 */

import type {
  ControlAuthIdentityRecord,
  ControlDirectoryPort,
  ControlMembershipRecord,
  ControlTenantRecord,
  ControlUserRecord,
} from "../application/auth/controlDirectory.ts"
import type { TenantId, UserId } from "../domain/tenant/types.ts"
import type { ControlRepositoryBundle } from "../infrastructure/persistence/control/controlRepositoryResolver.ts"

export function toControlDirectory(bundle: ControlRepositoryBundle): ControlDirectoryPort {
  const ctx = bundle.ctx
  return {
    findAuthIdentity: (provider: string, providerSubject: string): Promise<ControlAuthIdentityRecord | null> =>
      bundle.authIdentities.findByProviderSubject(ctx, provider, providerSubject),
    createAuthIdentity: async (record: ControlAuthIdentityRecord): Promise<void> => {
      await bundle.authIdentities.create(ctx, record)
    },
    findUserById: (userId: UserId): Promise<ControlUserRecord | null> =>
      bundle.users.findById(ctx, userId),
    createUser: async (record: ControlUserRecord): Promise<void> => {
      await bundle.users.create(ctx, record)
    },
    listMembershipsByUser: (userId: UserId): Promise<ControlMembershipRecord[]> =>
      bundle.memberships.listByUser(ctx, userId),
    findMembership: (userId: UserId, tenantId: TenantId): Promise<ControlMembershipRecord | null> =>
      bundle.memberships.findByUserAndTenant(ctx, userId, tenantId),
    createMembership: async (record: ControlMembershipRecord): Promise<void> => {
      await bundle.memberships.create(ctx, record)
    },
    findTenantById: (tenantId: TenantId): Promise<ControlTenantRecord | null> =>
      bundle.tenants.findById(ctx, tenantId),
    createTenant: async (record: ControlTenantRecord): Promise<void> => {
      await bundle.tenants.create(ctx, record)
    },
  }
}
