/**
 * P6-FIX-012 (Issue #145): dry-run integration. The dry-run reports whether the
 * REAL execution decision would permit attempting the claim, so it now requires
 * the real execute permission (`workunit.execute_external_action`), never claims
 * or consumes Approval/Linkage, never constructs a receipt, never calls a
 * provider, and never produces executed/sent wording. The default-deny resolver
 * proves the shared eligibility returns not-ready.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { POST } from "../app/api/workunit/[id]/execution/dry-run/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/cloudflareRuntimeEnv.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { authorizeRuntimeCommand } from "../app/lib/security/runtimeAuthorizationGate.ts"
import { createInMemoryApprovalStore } from "../app/lib/security/approvalStore.ts"
import { defaultDenyRuntimeAuthorizationEvidenceResolver } from "../app/lib/security/runtimeAuthorizationEvidenceResolver.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { ApprovalRecordRow } from "../app/lib/persistence/types.ts"
import type { Session } from "../app/lib/security/session.ts"

const tenantId = "dev-tenant" as TenantId
const workUnitId = "wu:dry-run-ra"
const actionType = "slack_reply"
const previewId = "preview:dry-run-ra:slack_reply:1"
const approvalId = "approval:dry-run-ra:slack_reply:1"

// Route all env writes through a cast so `NODE_ENV` (typed readonly by
// @types/node) does not trip TS2540 in this new file.
const ENV = process.env as Record<string, string | undefined>
const ENV_KEYS = ["NODE_ENV", "AUTH_ADAPTER", "ALLOW_DEV_SESSION", "ALLOW_DEV_WORKSPACE_BOOTSTRAP", "PERSISTENCE_MODE", "EXTERNAL_ACTIONS_ENABLED", "DEV_SESSION_ROLE"] as const

async function withPersistence(role: string, testFn: () => Promise<void>) {
  const db = new FakeD1Database()
  const backup: Record<string, string | undefined> = {}
  for (const k of ENV_KEYS) backup[k] = ENV[k]
  try {
    ENV.NODE_ENV = "development"
    ENV.AUTH_ADAPTER = "dev"
    ENV.ALLOW_DEV_SESSION = "true"
    ENV.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"
    ENV.PERSISTENCE_MODE = "d1"
    ENV.DEV_SESSION_ROLE = role
    delete ENV.EXTERNAL_ACTIONS_ENABLED
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    await testFn()
  } finally {
    for (const [k, v] of Object.entries(backup)) { if (v === undefined) delete ENV[k]; else ENV[k] = v }
    resetTestRuntimeEnvForRequest()
  }
}

async function seedApproval(status: ApprovalRecordRow["status"] = "approved") {
  const repoResult = await resolveRouteRepositories(tenantId)
  if (!repoResult.ok) throw new Error("repo failed")
  const { approvalRecords: repo, actionPreviews: previewRepo, ctx } = repoResult.bundle
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 30 * 60_000).toISOString()
  await repo.create(ctx, {
    id: approvalId, tenantId, workUnitId, actionPreviewId: previewId, actionType,
    targetHash: "t-hash", payloadHash: "p-hash", status,
    createdAt: now, approvedAt: status === "approved" ? now : undefined, expiresAt: future,
  })
  await previewRepo.create(ctx, {
    id: previewId, tenantId, workUnitId, actionType, targetPreview: "{}", payloadPreview: "{}",
    requiresApproval: 1, status: "preview", targetHash: "t-hash", payloadHash: "p-hash", createdAt: now, expiresAt: future,
  })
  return { repo, ctx }
}

function request(body: unknown): Request {
  return new Request(`http://localhost/api/workunit/${workUnitId}/execution/dry-run`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify(body),
  })
}

function validBody() {
  return { workUnitId, previewRefs: [{ actionId: "action:1", previewId }], requestedActionType: actionType }
}

test("dry-run requires the real execute permission (editor is denied)", async () => {
  await withPersistence("editor", async () => {
    await seedApproval()
    const res = await POST(request(validBody()), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error, "forbidden")
  })
})

test("dry-run with the execute permission (owner) reaches the blocked kill-switch outcome", async () => {
  await withPersistence("owner", async () => {
    await seedApproval()
    const res = await POST(request(validBody()), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.status, "blocked") // kill switch off
  })
})

test("repeated dry-runs never consume the approval", async () => {
  await withPersistence("owner", async () => {
    const { repo, ctx } = await seedApproval()
    await POST(request(validBody()), { params: Promise.resolve({ id: workUnitId }) })
    await POST(request(validBody()), { params: Promise.resolve({ id: workUnitId }) })
    const stored = await repo.findById(ctx, approvalId)
    assert.equal(stored?.status, "approved")
    assert.equal(stored?.usedAt, undefined)
  })
})

test("dry-run never produces executed/sent/posted wording", async () => {
  await withPersistence("owner", async () => {
    await seedApproval()
    const res = await POST(request(validBody()), { params: Promise.resolve({ id: workUnitId }) })
    const body = await res.json()
    assert.ok(["verified", "blocked", "not_ready"].includes(body.status))
    for (const w of ["executed", "sent", "posted", "scheduled", "created_on_provider"]) {
      assert.ok(!JSON.stringify(body).includes(w), `dry-run must not say ${w}`)
    }
  })
})

test("shared eligibility: a default-deny resolver would return not_ready (never a claim)", async () => {
  // The dry-run and the real gate share the same execute permission and the same
  // server-authoritative resolver contract. With a default-deny resolver the gate
  // fails closed as not_ready and NEVER claims — the property a dry-run relies on.
  const approvalStore = createInMemoryApprovalStore()
  const session = { userId: "executor-1" as UserId, tenantId: "tenant-1" as TenantId, role: "owner" as Session["role"], email: "e@x.test", isDevSession: false, sessionId: "s", createdAt: "2026-07-04T00:00:00Z", expiresAt: "2026-07-06T00:00:00Z" } as Session
  const r = await authorizeRuntimeCommand({
    session,
    request: { tenantId: "tenant-1", workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval-1", actionType: "slack_reply" },
    evaluatedAt: "2026-07-05T03:00:00Z",
    approvalStore,
    evidenceResolver: defaultDenyRuntimeAuthorizationEvidenceResolver,
    env: { EXTERNAL_ACTIONS_ENABLED: "true" } as unknown as NodeJS.ProcessEnv,
  })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "not_ready")
})
