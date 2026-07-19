/**
 * Session authority port (domain).
 *
 * The minimal contract an application session resolver needs to establish an
 * authoritative session from the control plane. It exposes ONLY session-relevant
 * domain shapes — never D1DatabaseLike, control repository bundles, D1 repository
 * classes, Cloudflare env types, or unrelated SQL rows. Infrastructure adapters
 * implement this port; the application resolver depends only on it.
 *
 * Invariant preserved by every implementation: tenantId and role come from
 * control-DB membership, never from JWT claims or client fields.
 */

import type { TenantId, UserId } from "../tenant/types.ts"
import type { TenantMembershipStatus, TenantRole } from "../auth/types.ts"

export type SessionAuthIdentity = { readonly userId: UserId }
export type SessionUser = { readonly id: UserId; readonly email: string }
export type SessionMembership = {
  readonly tenantId: TenantId
  readonly role: TenantRole
  readonly status: TenantMembershipStatus
}
export type SessionTenant = { readonly status?: "active" | "suspended" | "deleted" }

/** The fields required to bootstrap the explicitly-authorized dev workspace. */
export type SessionBootstrapIdentity = {
  readonly provider: string
  readonly providerSubject: string
  readonly email: string
  readonly displayName?: string
  readonly avatarUrl?: string
}
export type DevWorkspaceBootstrapInput = {
  readonly identity: SessionBootstrapIdentity
  readonly role: TenantRole
}

export interface SessionAuthorityPort {
  findAuthIdentity(provider: string, providerSubject: string): Promise<SessionAuthIdentity | null>
  findUser(userId: UserId): Promise<SessionUser | null>
  /** Memberships for the user, in control-plane order (the resolver selects the
   *  first active one). */
  listMemberships(userId: UserId): Promise<readonly SessionMembership[]>
  findTenant(tenantId: TenantId): Promise<SessionTenant | null>
  /** Idempotently provision the explicitly-authorized development workspace. */
  bootstrapDevelopmentWorkspace(input: DevWorkspaceBootstrapInput): Promise<void>
}
