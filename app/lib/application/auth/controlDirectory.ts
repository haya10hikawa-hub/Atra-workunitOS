/**
 * The control-directory capability the session use case actually consumes.
 *
 * The control DB holds the identity → user → membership → tenant chain that is
 * the ONLY authority for a session's tenant and role. Before this port, the use
 * case named the concrete `ControlRepositoryBundle` and, through it, the D1
 * driver type — so the storage decision was fixed one layer below the capability
 * the use case needs.
 *
 * It is declared beside the use case that requires it, rather than under
 * `app/lib/ports`: that layer is maintained as a zero-edge leaf — three
 * independent ratchets assert every port module imports nothing at all — while
 * this contract legitimately names the domain's branded identifiers and role
 * vocabulary. What matters is the direction, and it is inward either way.
 *
 * The contract is deliberately narrow and request-scoped: it declares the nine
 * operations the session path performs and nothing else, and it carries no
 * database context parameter, because binding the context is the composition
 * root's job rather than the caller's.
 */

import type { TenantMembershipStatus, TenantRole } from "../../domain/auth/types.ts"
import type { TenantId, UserId } from "../../domain/tenant/types.ts"

export type ControlUserRecord = {
  id: UserId
  email: string
  displayName?: string
  avatarUrl?: string
  createdAt: string
  updatedAt: string
}

export type ControlTenantRecord = {
  id: TenantId
  name: string
  slug: string
  /** Absent is not active: the session path treats anything but "active" as forbidden. */
  status?: "active" | "suspended" | "deleted"
  createdAt: string
  updatedAt: string
}

export type ControlMembershipRecord = {
  id: string
  tenantId: TenantId
  userId: UserId
  role: TenantRole
  status: TenantMembershipStatus
  createdAt: string
  updatedAt: string
}

export type ControlAuthIdentityRecord = {
  id: string
  userId: UserId
  provider: string
  providerSubject: string
  email?: string
  createdAt: string
  updatedAt: string
}

export interface ControlDirectoryPort {
  findAuthIdentity(provider: string, providerSubject: string): Promise<ControlAuthIdentityRecord | null>
  createAuthIdentity(record: ControlAuthIdentityRecord): Promise<void>
  findUserById(userId: UserId): Promise<ControlUserRecord | null>
  createUser(record: ControlUserRecord): Promise<void>
  listMembershipsByUser(userId: UserId): Promise<ControlMembershipRecord[]>
  findMembership(userId: UserId, tenantId: TenantId): Promise<ControlMembershipRecord | null>
  createMembership(record: ControlMembershipRecord): Promise<void>
  findTenantById(tenantId: TenantId): Promise<ControlTenantRecord | null>
  createTenant(record: ControlTenantRecord): Promise<void>
}
