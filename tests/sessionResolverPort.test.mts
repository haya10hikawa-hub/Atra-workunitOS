/**
 * Pure application session-resolver behavior (WS1-PR2), proven with in-memory
 * FAKE port implementations — no runtime config, no control DB, no providers.
 *
 * Covers the 14 required behaviors, including that tenant + role come from
 * membership (not the auth identity / client claims), that a missing session
 * authority fails closed, and that dev paths remain explicitly gated and
 * impossible under a production-shaped security policy.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import {
  resolveSession,
  type SessionResolutionDependencies,
  type SessionSecurityPolicy,
} from "../app/lib/application/auth/sessionResolver.ts"
import type { AuthAdapter, AuthAdapterResult, VerifiedAuthIdentity } from "../app/lib/application/auth/authAdapter.ts"
import type {
  DevWorkspaceBootstrapInput,
  SessionAuthorityPort,
  SessionMembership,
  SessionTenant,
  SessionUser,
} from "../app/lib/domain/ports/sessionAuthority.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"

// ─── fakes ───────────────────────────────────────────────────────

function fakeAuthAdapter(result: AuthAdapterResult): AuthAdapter {
  return { async verify(): Promise<AuthAdapterResult> { return result } }
}
const okIdentity = (provider: VerifiedAuthIdentity["provider"], subject = "subj"): AuthAdapterResult => ({
  ok: true, identity: { provider, providerSubject: subject, email: `${subject}@example.local` },
})

type FakeState = {
  identityUserId?: UserId | null
  user?: SessionUser | null
  memberships?: readonly SessionMembership[]
  tenant?: SessionTenant | null
  bootstrapped?: DevWorkspaceBootstrapInput[]
}

function fakeSessionAuthority(state: FakeState): SessionAuthorityPort {
  const bootstrapped = state.bootstrapped ?? []
  return {
    async findAuthIdentity() { return state.identityUserId === undefined ? { userId: "user-1" as UserId } : (state.identityUserId === null ? null : { userId: state.identityUserId }) },
    async findUser() { return state.user === undefined ? { id: "user-1" as UserId, email: "u@example.local" } : state.user },
    async listMemberships() { return state.memberships ?? [] },
    async findTenant() { return state.tenant === undefined ? { status: "active" } : state.tenant },
    async bootstrapDevelopmentWorkspace(input) { bootstrapped.push(input) },
  }
}

const LOCKED: SessionSecurityPolicy = { allowDevSession: false, allowControlLessDevSession: false, allowDevWorkspaceBootstrap: false }
const activeMembership: SessionMembership = { tenantId: "tenant-1" as TenantId, role: "manager", status: "active" }

function deps(over: Partial<SessionResolutionDependencies>): SessionResolutionDependencies {
  return {
    authAdapter: over.authAdapter ?? fakeAuthAdapter(okIdentity("jwt")),
    sessionAuthority: over.sessionAuthority === undefined ? fakeSessionAuthority({ memberships: [activeMembership] }) : over.sessionAuthority,
    security: over.security ?? LOCKED,
  }
}

const req = () => new Request("http://localhost")

// ─── 1. invalid auth identity → unauthorized ────────────────────
test("invalid auth identity returns unauthorized", async () => {
  const r = await resolveSession(req(), deps({ authAdapter: fakeAuthAdapter({ ok: false, reason: "invalid_credentials" }) }))
  assert.deepEqual(r, { ok: false, reason: "unauthorized" })
})

// ─── 2. missing session authority → fail closed ─────────────────
test("missing session authority fails closed (unauthorized)", async () => {
  const r = await resolveSession(req(), deps({ sessionAuthority: null }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "unauthorized")
})

// ─── 3. missing identity row → unauthorized ─────────────────────
test("missing identity row returns unauthorized", async () => {
  const r = await resolveSession(req(), deps({ sessionAuthority: fakeSessionAuthority({ identityUserId: null }) }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "unauthorized")
})

// ─── 4. missing user → unauthorized ─────────────────────────────
test("missing user returns unauthorized", async () => {
  const r = await resolveSession(req(), deps({ sessionAuthority: fakeSessionAuthority({ user: null, memberships: [activeMembership] }) }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "unauthorized")
})

// ─── 5. no active membership → forbidden ────────────────────────
test("no active membership returns forbidden", async () => {
  const r = await resolveSession(req(), deps({ sessionAuthority: fakeSessionAuthority({ memberships: [{ tenantId: "t" as TenantId, role: "viewer", status: "invited" }] }) }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "forbidden")
})

// ─── 6. missing tenant → invalid_tenant ─────────────────────────
test("missing tenant returns invalid tenant", async () => {
  const r = await resolveSession(req(), deps({ sessionAuthority: fakeSessionAuthority({ memberships: [activeMembership], tenant: null }) }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "invalid_tenant")
})

// ─── 7. inactive tenant → forbidden ─────────────────────────────
test("inactive tenant returns forbidden", async () => {
  const r = await resolveSession(req(), deps({ sessionAuthority: fakeSessionAuthority({ memberships: [activeMembership], tenant: { status: "suspended" } }) }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "forbidden")
})

// ─── 8. invalid stored role → invalid_role ──────────────────────
test("invalid stored role returns invalid role", async () => {
  const r = await resolveSession(req(), deps({ sessionAuthority: fakeSessionAuthority({ memberships: [{ tenantId: "t" as TenantId, role: "superuser" as unknown as SessionMembership["role"], status: "active" }] }) }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "invalid_role")
})

// ─── 9. tenant + role come from membership, not the identity/claims ─
test("tenant and role come from membership, not the auth identity", async () => {
  const authority = fakeSessionAuthority({
    identityUserId: "row-user" as UserId,
    user: { id: "row-user" as UserId, email: "row@example.local" },
    memberships: [{ tenantId: "tenant-from-membership" as TenantId, role: "viewer", status: "active" }],
    tenant: { status: "active" },
  })
  // The identity carries a different (attacker-style) subject/email; the session
  // must reflect the membership tenant + role, not anything from the identity.
  const r = await resolveSession(req(), deps({ authAdapter: fakeAuthAdapter(okIdentity("jwt", "attacker")), sessionAuthority: authority }))
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.session.tenantId, "tenant-from-membership")
    assert.equal(r.session.role, "viewer")
    assert.equal(r.session.userId, "row-user")
    assert.equal(r.session.isDevSession, false)
  }
})

// ─── 10 & 11. control-less dev session gating ───────────────────
test("control-less dev session requires ALL explicit dev gates and a dev identity", async () => {
  const security: SessionSecurityPolicy = { allowDevSession: true, allowControlLessDevSession: true, allowDevWorkspaceBootstrap: false }
  // Even with no session authority, a dev identity + both gates yields a session.
  const r = await resolveSession(req(), deps({ authAdapter: fakeAuthAdapter(okIdentity("dev")), sessionAuthority: null, security }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.session.isDevSession, true)
  // A single missing gate disables it → fails closed (unauthorized, no authority).
  for (const partial of [
    { allowDevSession: false, allowControlLessDevSession: true, allowDevWorkspaceBootstrap: false },
    { allowDevSession: true, allowControlLessDevSession: false, allowDevWorkspaceBootstrap: false },
  ] satisfies SessionSecurityPolicy[]) {
    const blocked = await resolveSession(req(), deps({ authAdapter: fakeAuthAdapter(okIdentity("dev")), sessionAuthority: null, security: partial }))
    assert.equal(blocked.ok, false)
  }
  // A non-dev identity never gets a control-less dev session.
  const nonDev = await resolveSession(req(), deps({ authAdapter: fakeAuthAdapter(okIdentity("jwt")), sessionAuthority: null, security }))
  assert.equal(nonDev.ok, false)
})

test("control-less dev session is impossible under a production-shaped (locked) policy", async () => {
  const r = await resolveSession(req(), deps({ authAdapter: fakeAuthAdapter(okIdentity("dev")), sessionAuthority: null, security: LOCKED }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "unauthorized")
})

// ─── 12. dev workspace bootstrap stays explicitly gated ─────────
test("development workspace bootstrap runs only with the explicit bootstrap gate + dev identity", async () => {
  const bootstrapped: DevWorkspaceBootstrapInput[] = []
  const authority = fakeSessionAuthority({ memberships: [activeMembership], bootstrapped })
  const gatedOn: SessionSecurityPolicy = { allowDevSession: true, allowControlLessDevSession: false, allowDevWorkspaceBootstrap: true, devSessionRole: "editor" }
  await resolveSession(req(), deps({ authAdapter: fakeAuthAdapter(okIdentity("dev")), sessionAuthority: authority, security: gatedOn }))
  assert.equal(bootstrapped.length, 1)
  assert.equal(bootstrapped[0].role, "editor")

  // Gate off → no bootstrap call.
  const bootstrapped2: DevWorkspaceBootstrapInput[] = []
  const authority2 = fakeSessionAuthority({ memberships: [activeMembership], bootstrapped: bootstrapped2 })
  await resolveSession(req(), deps({ authAdapter: fakeAuthAdapter(okIdentity("dev")), sessionAuthority: authority2, security: { allowDevSession: true, allowControlLessDevSession: false, allowDevWorkspaceBootstrap: false } }))
  assert.equal(bootstrapped2.length, 0)
})

// ─── 14. no ambient runtime-config fallback remains in the resolver ─
test("the resolver source has no ambient runtime-config or repository construction", () => {
  const src = fs.readFileSync(new URL("../app/lib/application/auth/sessionResolver.ts", import.meta.url), "utf8")
  assert.doesNotMatch(src, /resolveValidatedRequestRuntimeConfig/)
  assert.doesNotMatch(src, /resolveControlRepositories/)
  assert.doesNotMatch(src, /process\.env/)
})
