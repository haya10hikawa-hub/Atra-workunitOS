/**
 * Domain role-normalization authority.
 *
 * Owns the canonical role vocabulary and the normalization rule that maps legacy
 * role inputs onto the current tenant roles. This lives in the DOMAIN so that
 * application use cases (e.g. session resolution) can depend on role rules
 * without importing the security layer. This module must not import security,
 * runtime, infrastructure, or persistence.
 */

import type { LegacyTenantRole, TenantRole } from "./types.ts"

export type WorkUnitRole = TenantRole
export type WorkUnitRoleInput = TenantRole | LegacyTenantRole

const VALID_ROLES: ReadonlySet<string> = new Set(["owner", "manager", "editor", "viewer"])

export class RoleNormalizationError extends Error {
  public readonly input: unknown
  constructor(input: unknown) {
    super(`Cannot normalize role from input: ${String(input)}`)
    this.name = "RoleNormalizationError"
    this.input = input
  }
}

/** Normalize a role input to a current tenant role. Throws on an unknown value. */
export function normalizeRoleInput(role: WorkUnitRoleInput | undefined): WorkUnitRole {
  if (role === "admin") return "manager"
  if (role === "pm" || role === "member") return "editor"
  if (role !== undefined && VALID_ROLES.has(role)) return role as WorkUnitRole
  throw new RoleNormalizationError(role)
}
