/**
 * Role vocabulary and role validity, owned by the domain.
 *
 * This is business semantics, not security enforcement: which role names exist,
 * which legacy names are the same role under an older spelling, and what it means
 * for a stored role to be invalid. Permission sets, RBAC checks and request
 * authorization stay in `app/lib/security` and depend inward on this module.
 *
 * It lives here because the application layer must be able to normalize a role
 * read from the control DB without depending outward on the security layer.
 */

import type { LegacyTenantRole, TenantRole } from "./types.ts"

/** Every role name a stored value may legitimately carry, canonical or legacy. */
export type TenantRoleInput = TenantRole | LegacyTenantRole

const CANONICAL_ROLES: ReadonlySet<string> = new Set(["owner", "manager", "editor", "viewer"])

/** Thrown when a stored or supplied role is not a role this domain recognises. */
export class RoleNormalizationError extends Error {
  public readonly input: unknown
  constructor(input: unknown) {
    super(`Cannot normalize role from input: ${String(input)}`)
    this.name = "RoleNormalizationError"
    this.input = input
  }
}

/**
 * Map a canonical or legacy role name onto its canonical form. An unknown,
 * empty or absent value is a domain-validity failure, never a silent default.
 */
export function normalizeRoleInput(role: TenantRoleInput | undefined): TenantRole {
  if (role === "admin") return "manager"
  if (role === "pm" || role === "member") return "editor"
  if (role !== undefined && CANONICAL_ROLES.has(role)) return role as TenantRole
  throw new RoleNormalizationError(role)
}
