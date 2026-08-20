/**
 * Seed the dev workspace into a fake Control DB.
 *
 * WHY THIS EXISTS
 *   Before WU-06's safe-method closure, a route harness could set
 *   `ALLOW_DEV_WORKSPACE_BOOTSTRAP=true`, hand the route an EMPTY control DB and
 *   still get a 200 from a `GET`: session resolution created the user, tenant,
 *   membership and auth identity as a side effect of the read. That side effect
 *   is now removed, so a harness that wants an authenticated dev session over
 *   the control-DB path has to establish the workspace explicitly.
 *
 *   This is the harness analogue of the documented operator path
 *   (`npm run cf:d1:bootstrap:jwt-local`, README): the workspace is created by an
 *   explicit act, not by whoever happens to issue the first read.
 *
 * The rows match what `bootstrapDevWorkspace` produced, so a harness switching to
 * this helper exercises the same session chain it did before — identity -> user
 * -> active membership -> active tenant — with the same ids, and the assertions
 * on top of it keep their original meaning.
 */

import assert from "node:assert/strict"
import { resolveControlRepositories } from "../../app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"
import type { D1DatabaseLike } from "../../app/lib/persistence/d1/types.ts"
import type { TenantId, UserId } from "../../app/lib/domain/tenant/types.ts"
import type { TenantRole } from "../../app/lib/domain/auth/types.ts"

/** The identity the dev auth adapter returns, and the ids the old bootstrap used. */
export const DEV_WORKSPACE = Object.freeze({
  userId: "dev-user" as UserId,
  tenantId: "dev-tenant" as TenantId,
  provider: "dev",
  providerSubject: "dev-user",
  email: "dev@example.local",
})

/**
 * Create the four control rows an authenticated dev session resolves through.
 * `role` must match the harness's `DEV_SESSION_ROLE`, because tenant and role
 * come from the membership row — never from the dev policy or a JWT claim.
 */
export async function seedDevControlWorkspace(
  db: D1DatabaseLike,
  role: TenantRole = "owner",
): Promise<void> {
  const repos = resolveControlRepositories({ d1Binding: db })
  assert.equal(repos.ok, true, "the control repositories must resolve for the dev workspace seed")
  if (!repos.ok) return
  const { ctx, users, tenants, memberships, authIdentities } = repos.bundle
  const now = new Date().toISOString()

  await users.create(ctx, {
    id: DEV_WORKSPACE.userId, email: DEV_WORKSPACE.email, createdAt: now, updatedAt: now,
  })
  await tenants.create(ctx, {
    id: DEV_WORKSPACE.tenantId, name: "Development Tenant", slug: "dev-tenant",
    createdAt: now, updatedAt: now,
  })
  await memberships.create(ctx, {
    id: "membership:dev-user:dev-tenant", tenantId: DEV_WORKSPACE.tenantId,
    userId: DEV_WORKSPACE.userId, role, status: "active", createdAt: now, updatedAt: now,
  })
  await authIdentities.create(ctx, {
    id: `identity:${DEV_WORKSPACE.provider}:${DEV_WORKSPACE.providerSubject}`,
    userId: DEV_WORKSPACE.userId, provider: DEV_WORKSPACE.provider,
    providerSubject: DEV_WORKSPACE.providerSubject, email: DEV_WORKSPACE.email,
    createdAt: now, updatedAt: now,
  })
}
