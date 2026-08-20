/**
 * RBAC role and permission definitions for WorkUnit OS.
 *
 * Roles represent a user's organizational position within a tenant.
 * Permissions represent discrete actions that can be checked via policy functions.
 *
 * This module defines the *permission* vocabulary and the role ordering used by
 * enforcement in `rbac.ts`. The role vocabulary itself — which role names exist,
 * which legacy names map onto them, and what an invalid role is — is domain
 * semantics and is owned by `app/lib/domain/auth/roles.ts`. The two aliases
 * below name that domain vocabulary in this layer's own words; they add no
 * declaration and no behaviour.
 */

import type { TenantRole } from "../domain/auth/types.ts"
import type { TenantRoleInput } from "../domain/auth/roles.ts"

export type WorkUnitRole = TenantRole
export type WorkUnitRoleInput = TenantRoleInput

export type WorkUnitPermission =
  | "workunit.read"
  | "workunit.create"
  | "workunit.edit"
  | "workunit.review"
  | "workunit.approve_external_action"
  | "workunit.execute_external_action"
  | "workunit.create_action_preview"
  | "integration.read"
  | "integration.manage"
  | "audit.read"
  | "tenant.manage"

export const ROLE_HIERARCHY: Record<WorkUnitRole, number> = {
  owner: 3,
  manager: 2,
  editor: 1,
  viewer: 0,
}

export const DEFAULT_ROLE_PERMISSIONS: Record<WorkUnitRole, ReadonlySet<WorkUnitPermission>> = {
  owner: new Set([
    "workunit.read",
    "workunit.create",
    "workunit.edit",
    "workunit.review",
    "workunit.approve_external_action",
    "workunit.execute_external_action",
    "workunit.create_action_preview",
    "integration.read",
    "integration.manage",
    "audit.read",
    "tenant.manage",
  ]),
  manager: new Set([
    "workunit.read",
    "workunit.create",
    "workunit.edit",
    "workunit.review",
    "workunit.approve_external_action",
    "workunit.create_action_preview",
    "integration.read",
    "integration.manage",
    "audit.read",
  ]),
  editor: new Set([
    "workunit.read",
    "workunit.create",
    "workunit.edit",
    "workunit.review",
    "workunit.create_action_preview",
    "workunit.approve_external_action",
    "integration.read",
  ]),
  viewer: new Set(["workunit.read", "integration.read"]),
}
