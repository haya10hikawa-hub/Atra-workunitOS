/**
 * Session authority contracts (domain).
 *
 * Authentication reads and development-only workspace mutation are deliberately
 * represented as separate capabilities. Application code can therefore receive
 * the minimum authority needed for each step instead of a single port that mixes
 * read-side session resolution with write-side bootstrap behavior.
 *
 * These contracts expose only session-relevant domain shapes — never D1 bindings,
 * control repository bundles, Cloudflare runtime types, or unrelated SQL rows.
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

/** Read-only control-plane authority required to resolve a session. */
export interface SessionAuthorityPort {
  findAuthIdentity(provider: string, providerSubject: string): Promise<SessionAuthIdentity | null>
  findUser(userId: UserId): Promise<SessionUser | null>
  /** Memberships for the user, in control-plane order (the resolver selects the
   *  first active one). */
  listMemberships(userId: UserId): Promise<readonly SessionMembership[]>
  findTenant(tenantId: TenantId): Promise<SessionTenant | null>
}

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

/**
 * Development-only write capability. It is separate from SessionAuthorityPort so
 * ordinary session resolution never receives workspace-provisioning authority.
 */
export interface DevelopmentWorkspaceBootstrapPort {
  bootstrapDevelopmentWorkspace(input: DevWorkspaceBootstrapInput): Promise<void>
}
