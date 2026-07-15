/**
 * P6-FIX-012 (Issue #145): dry-run integration. The dry-run now runs the SAME
 * Phase 6 runtime eligibility core as the real gate (resolver, post-resolution
 * timestamp, current executor, verifyApprovalLinkage, Human Decision matrix,
 * executor-vs-approver, execute RBAC, kill switch, exact intended-action
 * envelope) but never claims, consumes, constructs a receipt, or calls a
 * provider. Preview↔Approval binding is a local defense and is NOT sufficient
 * for `verified`. Route-level tests prove parity with the real gate.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { POST } from "../app/api/workunit/[id]/execution/dry-run/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { resolveControlRepositories } from "../app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import {
  authorizeRuntimeCommand,
  evaluateRuntimeAuthorizationDryRun,
  setRuntimeAuthorizationClockForTests,
  resetRuntimeAuthorizationClockForTests,
} from "../app/lib/security/runtimeAuthorizationGate.ts"
import {
  setRuntimeAuthorizationEvidenceResolverForTests,
  resetRuntimeAuthorizationEvidenceResolverForTests,
  createInMemoryRuntimeAuthorizationEvidenceResolver,
  defaultDenyRuntimeAuthorizationEvidenceResolver,
} from "../app/lib/security/runtimeAuthorizationEvidenceResolver.ts"
import { createInMemoryApprovalStore } from "../app/lib/security/approvalStore.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { ApprovalRecordRow } from "../app/lib/persistence/types.ts"
import type { Session } from "../app/lib/security/session.ts"
import {
  evidenceBundle,
  runtimeContext,
  runtimeLinkage,
  evidenceSources,
  intendedAction,
  ISSUED_AT,
  TEST_CLOCK,
} from "./fixtures/phase6/runtimeAuthorizationFixture.mts"
import { validContext as linkageValidContext } from "./fixtures/phase6/approvalLinkageFixture.mts"

const tenantId = "tenant-1" as TenantId
const DEV_TENANT = "dev-tenant" as TenantId
const workUnitId = "wu-1"
const previewId = "preview-1"
const approvalId = "approval:preview-1"
const actionType = "slack_reply"

const JWT_SECRET = "test-jwt-secret-with-at-least-32-bytes"
const JWT_ISSUER = "atra-test"
const JWT_AUDIENCE = "atra-test-aud"

const ENV = process.env as Record<string, string | undefined>
const ENV_KEYS = ["NODE_ENV", "AUTH_ADAPTER", "JWT_AUTH_SECRET", "JWT_AUTH_ISSUER", "JWT_AUTH_AUDIENCE", "ALLOW_DEV_SESSION", "ALLOW_DEV_WORKSPACE_BOOTSTRAP", "DEV_SESSION_ROLE", "PERSISTENCE_MODE", "EXTERNAL_ACTIONS_ENABLED"] as const

// ─── Dev-session harness (executor derivation fails ⇒ pre-executor paths) ──

async function withDevPersistence(role: string, testFn: () => Promise<void>) {
  const db = new FakeD1Database()
  const backup: Record<string, string | undefined> = {}
  for (const k of ENV_KEYS) backup[k] = ENV[k]
  try {
    ENV.NODE_ENV = "development"; ENV.AUTH_ADAPTER = "dev"; ENV.ALLOW_DEV_SESSION = "true"
    ENV.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"; ENV.PERSISTENCE_MODE = "d1"; ENV.DEV_SESSION_ROLE = role
    delete ENV.EXTERNAL_ACTIONS_ENABLED
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    await testFn()
  } finally {
    for (const [k, v] of Object.entries(backup)) { if (v === undefined) delete ENV[k]; else ENV[k] = v }
    resetTestRuntimeEnvForRequest()
    resetRuntimeAuthorizationEvidenceResolverForTests()
    resetRuntimeAuthorizationClockForTests()
  }
}

// ─── JWT (non-dev) harness (executor derives ⇒ full eligibility) ──

async function withJwtPersistence(
  opts: { killSwitch?: boolean; userId?: string },
  testFn: (authHeader: string) => Promise<void>,
) {
  const db = new FakeD1Database()
  const backup: Record<string, string | undefined> = {}
  for (const k of ENV_KEYS) backup[k] = ENV[k]
  try {
    ENV.NODE_ENV = "production"; ENV.AUTH_ADAPTER = "jwt"
    ENV.JWT_AUTH_SECRET = JWT_SECRET; ENV.JWT_AUTH_ISSUER = JWT_ISSUER; ENV.JWT_AUTH_AUDIENCE = JWT_AUDIENCE
    delete ENV.ALLOW_DEV_SESSION; delete ENV.ALLOW_DEV_WORKSPACE_BOOTSTRAP; delete ENV.DEV_SESSION_ROLE
    ENV.PERSISTENCE_MODE = "d1"
    if (opts.killSwitch) ENV.EXTERNAL_ACTIONS_ENABLED = "true"; else delete ENV.EXTERNAL_ACTIONS_ENABLED
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)

    const repos = resolveControlRepositories({ d1Binding: db })
    if (!repos.ok) throw new Error("control repos failed")
    const now = new Date().toISOString()
    const uid = (opts.userId ?? "executor-1") as UserId
    await repos.bundle.users.create(repos.bundle.ctx, { id: uid, email: "e@x.test", createdAt: now, updatedAt: now })
    await repos.bundle.tenants.create(repos.bundle.ctx, { id: tenantId, name: "T1", slug: "tenant-1", createdAt: now, updatedAt: now })
    await repos.bundle.memberships.create(repos.bundle.ctx, { id: "m1", tenantId, userId: uid, role: "owner", status: "active", createdAt: now, updatedAt: now })
    await repos.bundle.authIdentities.create(repos.bundle.ctx, { id: "id1", userId: uid, provider: "jwt", providerSubject: "sub1", email: "e@x.test", createdAt: now, updatedAt: now })
    const token = await signHs256Jwt({ sub: "sub1", email: "e@x.test", iss: JWT_ISSUER, aud: JWT_AUDIENCE }, JWT_SECRET)

    // Pin the post-resolution instant to the fixture evaluation time.
    setRuntimeAuthorizationClockForTests(TEST_CLOCK)
    await testFn(`Bearer ${token}`)
  } finally {
    for (const [k, v] of Object.entries(backup)) { if (v === undefined) delete ENV[k]; else ENV[k] = v }
    resetTestRuntimeEnvForRequest()
    resetRuntimeAuthorizationEvidenceResolverForTests()
    resetRuntimeAuthorizationClockForTests()
  }
}

async function seedApproval(tenant: TenantId = tenantId, status: ApprovalRecordRow["status"] = "approved") {
  const repoResult = await resolveRouteRepositories(tenant)
  if (!repoResult.ok) throw new Error("repo failed")
  const { approvalRecords: repo, actionPreviews: previewRepo, workUnits, ctx } = repoResult.bundle
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 60 * 60_000).toISOString()
  // Parent-ownership order (enforcing bundle): WorkUnit → matching Preview → Approval.
  await workUnits.upsert(ctx, { id: workUnitId, tenantId: tenant, title: "t", kind: "task", priority: "medium", sourceProvider: "mock", reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: now, updatedAt: now })
  await previewRepo.create(ctx, { id: previewId, tenantId: tenant, workUnitId, actionType, targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview", targetHash: "t-hash", payloadHash: "p-hash", createdAt: now, expiresAt: future })
  await repo.create(ctx, { id: approvalId, tenantId: tenant, workUnitId, actionPreviewId: previewId, actionType, targetHash: "t-hash", payloadHash: "p-hash", status, createdAt: now, approvedAt: status === "approved" ? now : undefined, expiresAt: future })
  return { repo, ctx }
}

function request(auth?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: "http://localhost:3000" }
  if (auth) headers.Authorization = auth
  return new Request(`http://localhost/api/workunit/${workUnitId}/execution/dry-run`, {
    method: "POST", headers, body: JSON.stringify({ workUnitId, previewRefs: [{ actionId: "a1", previewId }], requestedActionType: actionType }),
  })
}

function seedResolver(bundle: ReturnType<typeof evidenceBundle>) {
  setRuntimeAuthorizationEvidenceResolverForTests(
    createInMemoryRuntimeAuthorizationEvidenceResolver([{ tenantId, workUnitId, actionPreviewId: previewId, approvalId, bundle }]),
  )
}

// ─── Dev-session route tests (pre-executor dispositions) ────────

test("dry-run requires the real execute permission (editor is denied)", async () => {
  await withDevPersistence("editor", async () => {
    await seedApproval(DEV_TENANT)
    const res = await POST(request(), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 403)
    assert.equal((await res.json()).error, "forbidden")
  })
})

test("kill switch off → blocked (before any resolution)", async () => {
  await withDevPersistence("owner", async () => {
    await seedApproval(DEV_TENANT)
    const res = await POST(request(), { params: Promise.resolve({ id: workUnitId }) })
    const body = await res.json()
    assert.equal(body.status, "blocked")
  })
})

test("valid Preview+Approval but default-deny evidence resolver + kill switch ON → not_ready", async () => {
  await withDevPersistence("owner", async () => {
    ENV.EXTERNAL_ACTIONS_ENABLED = "true"
    setRuntimeAuthorizationEvidenceResolverForTests(defaultDenyRuntimeAuthorizationEvidenceResolver)
    await seedApproval(DEV_TENANT)
    const res = await POST(request(), { params: Promise.resolve({ id: workUnitId }) })
    const body = await res.json()
    assert.equal(body.status, "not_ready")
  })
})

test("repeated dry-runs never consume the approval", async () => {
  await withDevPersistence("owner", async () => {
    const { repo, ctx } = await seedApproval(DEV_TENANT)
    await POST(request(), { params: Promise.resolve({ id: workUnitId }) })
    await POST(request(), { params: Promise.resolve({ id: workUnitId }) })
    const stored = await repo.findById(ctx, approvalId)
    assert.equal(stored?.status, "approved")
    assert.equal(stored?.usedAt, undefined)
  })
})

test("dry-run never emits executed/sent/posted wording", async () => {
  await withDevPersistence("owner", async () => {
    await seedApproval(DEV_TENANT)
    const res = await POST(request(), { params: Promise.resolve({ id: workUnitId }) })
    const body = await res.json()
    assert.ok(["verified", "blocked", "not_ready"].includes(body.status))
    for (const w of ["executed", "sent", "posted", "scheduled", "created_on_provider"]) {
      assert.ok(!JSON.stringify(body).includes(w))
    }
  })
})

// ─── JWT-session route tests (full runtime eligibility) ─────────

test("fully valid Phase 6 evidence + kill switch ON → verified (no claim/consume)", async () => {
  await withJwtPersistence({ killSwitch: true }, async (auth) => {
    const { repo, ctx } = await seedApproval()
    seedResolver(evidenceBundle())
    const res = await POST(request(auth), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, "verified")
    // Non-consumption: the approval remains approved/unused.
    const stored = await repo.findById(ctx, approvalId)
    assert.equal(stored?.status, "approved")
    assert.equal(stored?.usedAt, undefined)
  })
})

test("runtime-ineligible Human Decision → not_ready", async () => {
  await withJwtPersistence({ killSwitch: true }, async (auth) => {
    await seedApproval()
    // A linkage-valid but runtime-INELIGIBLE decision (evidence_acceptance scope).
    seedResolver(evidenceBundle(linkageValidContext() as Record<string, unknown>))
    const res = await POST(request(auth), { params: Promise.resolve({ id: workUnitId }) })
    const body = await res.json()
    assert.equal(body.status, "not_ready")
  })
})

test("stale/revoked Linkage → not_ready", async () => {
  await withJwtPersistence({ killSwitch: true }, async (auth) => {
    await seedApproval()
    const clean = runtimeContext()
    const linkage = runtimeLinkage(clean)
    const staleSources = evidenceSources(runtimeContext({ revoked_approval_linkage_ids: ["link-1"] }))
    const ia = intendedAction()
    seedResolver({
      linkage,
      sources: staleSources as never,
      intendedAction: {
        tenantId, workUnitId, actionPreviewId: previewId, approvalId, actionType,
        targetHash: ia.target_hash as string, payloadHash: ia.payload_hash as string,
      },
    })
    const res = await POST(request(auth), { params: Promise.resolve({ id: workUnitId }) })
    const body = await res.json()
    assert.equal(body.status, "not_ready")
  })
})

test("executor equals approver → forbidden", async () => {
  await withJwtPersistence({ killSwitch: true, userId: "approver-1" }, async (auth) => {
    await seedApproval()
    seedResolver(evidenceBundle())
    const res = await POST(request(auth), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 403)
    assert.equal((await res.json()).error, "forbidden")
  })
})

// ─── Parity: dry-run and the real gate agree before any claim ───

test("dry-run and real gate classify the same evidence consistently before claim", async () => {
  const resolver = createInMemoryRuntimeAuthorizationEvidenceResolver([
    { tenantId, workUnitId, actionPreviewId: previewId, approvalId, bundle: evidenceBundle() },
  ])
  const session = {
    userId: "executor-1" as UserId, tenantId, role: "owner" as Session["role"], email: "e@x.test",
    isDevSession: false, sessionId: "s", createdAt: "2026-07-04T00:00:00Z", expiresAt: "2026-07-06T00:00:00Z",
  } as Session
  const req = { tenantId, workUnitId, actionPreviewId: previewId, approvalId, actionType }
  const env = { EXTERNAL_ACTIONS_ENABLED: "true" } as unknown as NodeJS.ProcessEnv

  const dry = await evaluateRuntimeAuthorizationDryRun({ session, request: req, evidenceResolver: resolver, env, clock: TEST_CLOCK })
  const real = await authorizeRuntimeCommand({ session, request: req, approvalStore: createInMemoryApprovalStore(), evidenceResolver: resolver, env, clock: TEST_CLOCK })
  // Dry-run says "verified"; the real gate reaches the claim (which then fails on
  // the empty store) — i.e. both agreed the evidence was eligible pre-claim.
  assert.equal(dry.disposition, "verified")
  assert.equal(real.ok, false)
  if (real.ok) return
  assert.equal(real.state, "used") // claim lost on empty store — NOT a pre-claim rejection
  assert.equal(ISSUED_AT, "2026-07-05T03:00:00Z")
})
