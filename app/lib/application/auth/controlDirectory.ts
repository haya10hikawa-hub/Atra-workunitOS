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
 * The contract is deliberately narrow and request-scoped: it carries no database
 * context parameter, because binding the context is the composition root's job
 * rather than the caller's.
 *
 * CAPABILITY SPLIT (WU-06 safe-method closure)
 *   A single nine-operation port meant that whoever held the control directory
 *   held CREATE authority, so a safe `GET` acquired durable write capability
 *   merely by resolving a session. The contract is therefore two contracts:
 *
 *     ControlDirectoryReadPort   — the four lookups the session path performs.
 *                                  Names no create operation at all, so a holder
 *                                  cannot construct one.
 *     DevWorkspaceBootstrapPort  — the dev-only workspace bootstrap capability:
 *                                  the four creates plus the reads bootstrap
 *                                  needs to stay idempotent, including
 *                                  `findMembership`, which ONLY bootstrap uses.
 *
 *   Removal, not convention, is what makes the safe path safe: the read port has
 *   no write member to forget not to call.
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

/**
 * The identity -> user -> membership -> tenant lookups the session path performs.
 * Exactly four operations: `findMembership` is deliberately absent, because the
 * session path reads memberships through `listMembershipsByUser` and only the
 * dev bootstrap ever looks one up by pair.
 */
export interface ControlDirectoryReadPort {
  findAuthIdentity(provider: string, providerSubject: string): Promise<ControlAuthIdentityRecord | null>
  findUserById(userId: UserId): Promise<ControlUserRecord | null>
  listMembershipsByUser(userId: UserId): Promise<ControlMembershipRecord[]>
  findTenantById(tenantId: TenantId): Promise<ControlTenantRecord | null>
}

/**
 * The dev-only workspace bootstrap capability. It extends the read port because
 * bootstrap is idempotent — it looks each row up before creating it — and adds
 * the pairwise membership lookup only it performs.
 *
 * This type is the ONLY place in the session contract where a durable create is
 * nameable. A dependency object that omits it cannot reach one.
 */
export interface DevWorkspaceBootstrapPort extends ControlDirectoryReadPort {
  findMembership(userId: UserId, tenantId: TenantId): Promise<ControlMembershipRecord | null>
  createAuthIdentity(record: ControlAuthIdentityRecord): Promise<void>
  createUser(record: ControlUserRecord): Promise<void>
  createMembership(record: ControlMembershipRecord): Promise<void>
  createTenant(record: ControlTenantRecord): Promise<void>
}
