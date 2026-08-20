import type { Tenant, TenantId, UserId } from "../tenant/types.ts"

export type TenantRole = "owner" | "manager" | "editor" | "viewer"
export type LegacyTenantRole = "admin" | "pm" | "member"
export type SessionRole = TenantRole
export type TenantMembershipStatus = "active" | "invited" | "suspended"

export type AuthenticatedUser = {
  id: UserId
  email: string
  displayName?: string
  avatarUrl?: string
  createdAt: string
  updatedAt: string
}

export type TenantMembership = {
  id: string
  tenantId: TenantId
  userId: UserId
  role: TenantRole
  status: TenantMembershipStatus
  createdAt: string
  updatedAt: string
}

export type AuthProviderIdentity = {
  id: string
  userId: UserId
  provider: string
  providerSubject: string
  email?: string
  createdAt: string
  updatedAt: string
}

/**
 * Why a session could not be established. Owned by the domain so the security
 * boundary can map it to a transport status without depending on the
 * application use case that produces it.
 */
export type SessionResolutionFailureReason =
  | "unauthorized"
  | "forbidden"
  | "expired"
  | "invalid_tenant"
  | "invalid_role"
  | "internal_error"

export type SessionContext = {
  userId: UserId
  tenantId: TenantId
  role: SessionRole
  email: string
  isDevSession: boolean
  sessionId: string
  createdAt: string
  expiresAt: string
}

export type AuthenticatedWorkspace = {
  user: AuthenticatedUser
  tenant: Tenant
  membership: TenantMembership
}
