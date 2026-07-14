import { getControlDbBinding } from "../../../persistence/cloudflareBindings.ts"
import type { ControlDbContext } from "../../../persistence/types.ts"
import type { D1DatabaseLike } from "../../../persistence/d1/types.ts"
import type { AppEnv } from "../../../../types/cloudflare-env.ts"
import { ControlAuthIdentityRepository } from "./authIdentityRepository.ts"
import { ControlMembershipRepository } from "./membershipRepository.ts"
import { ControlTenantRepository } from "./tenantRepository.ts"
import { ControlUserRepository } from "./userRepository.ts"

export type ControlRepositoryBundle = {
  users: ControlUserRepository
  tenants: ControlTenantRepository
  memberships: ControlMembershipRepository
  authIdentities: ControlAuthIdentityRepository
  ctx: ControlDbContext
}

export type ControlRepositoryResult =
  | { ok: true; bundle: ControlRepositoryBundle }
  | { ok: false; error: "control_db_not_configured"; status: number }

export function resolveControlRepositories(options: { runtimeEnv?: AppEnv; d1Binding?: D1DatabaseLike } = {}): ControlRepositoryResult {
  // The control-DB binding is threaded in explicitly (from the request-scoped
  // validated runtime config). No ambient raw-env read here.
  const db = options.d1Binding ?? (options.runtimeEnv ? getControlDbBinding(options.runtimeEnv) : null)
  if (!db) return { ok: false, error: "control_db_not_configured", status: 503 }
  const ctx: ControlDbContext = { db }
  return {
    ok: true,
    bundle: {
      users: new ControlUserRepository(db),
      tenants: new ControlTenantRepository(db),
      memberships: new ControlMembershipRepository(db),
      authIdentities: new ControlAuthIdentityRepository(db),
      ctx,
    },
  }
}
