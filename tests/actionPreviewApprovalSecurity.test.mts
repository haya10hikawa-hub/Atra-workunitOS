import test from "node:test"
import assert from "node:assert/strict"
import { POST as createPreview } from "../app/api/workunit/[id]/action-preview/route.ts"
import { GET as listPreviews, POST as decideApproval } from "../app/api/workunit/[id]/approval/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"

const tenantId = "dev-tenant" as TenantId
const workUnitId = "wu:security-preview"

async function withPersistence(fn: (db: FakeD1Database) => Promise<void>) {
  const db = new FakeD1Database()
  const backup = { ...process.env }
  try {
    process.env.NODE_ENV = "development"
    process.env.AUTH_ADAPTER = "dev"
    process.env.ALLOW_DEV_SESSION = "true"
    process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"
    process.env.PERSISTENCE_MODE = "d1"
    delete process.env.DEV_SESSION_ROLE
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    await fn(db)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
    resetTestRuntimeEnvForRequest()
  }
}

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  })
}

async function seedWorkUnit() {
  const repos = await resolveRouteRepositories(tenantId)
  assert.equal(repos.ok, true)
  if (!repos.ok) throw new Error("repository unavailable")
  const now = new Date().toISOString()
  await repos.bundle.workUnits.create(repos.bundle.ctx, {
    id: workUnitId,
    tenantId,
    title: "Security preview",
    kind: "review_waiting",
    priority: "high",
    sourceProvider: "github",
    reason: "review",
    evidence: "evidence",
    nextAction: "review",
    status: "open",
    createdAt: now,
    updatedAt: now,
  })
  return repos.bundle
}

test("action preview requires an existing tenant-scoped WorkUnit", async () => {
  await withPersistence(async () => {
    const response = await createPreview(
      request(`/api/workunit/${workUnitId}/action-preview`, {
        actionType: "slack_reply",
        target: { provider: "slack", destination: "channel-1" },
        payload: { body: "draft" },
      }),
      { params: Promise.resolve({ id: workUnitId }) },
    )
    assert.equal(response.status, 400)
  })
})

test("action preview rejects nested secret-bearing fields", async () => {
  await withPersistence(async () => {
    await seedWorkUnit()
    const response = await createPreview(
      request(`/api/workunit/${workUnitId}/action-preview`, {
        actionType: "slack_reply",
        target: { provider: "slack", destination: "channel-1" },
        payload: { body: "draft", metadata: { access_token: "secret-value" } },
      }),
      { params: Promise.resolve({ id: workUnitId }) },
    )
    assert.equal(response.status, 400)
  })
})

test("approval is single-decision, rejects expired previews, and GET omits internal fields", async () => {
  await withPersistence(async () => {
    const bundle = await seedWorkUnit()
    const previewResponse = await createPreview(
      request(`/api/workunit/${workUnitId}/action-preview`, {
        actionType: "slack_reply",
        target: { provider: "slack", destination: "channel-1" },
        payload: { body: "editable draft" },
      }),
      { params: Promise.resolve({ id: workUnitId }) },
    )
    assert.equal(previewResponse.status, 201)

    // Four-eyes (Security P1): the approver must differ from the creator, so approve
    // a preview created by a DIFFERENT user. (Self-approval is covered separately.)
    const actionPreviewId = "preview:single-decision"
    await bundle.actionPreviews.create(bundle.ctx, {
      id: actionPreviewId, tenantId, workUnitId, actionType: "slack_reply",
      targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
      targetHash: "t", payloadHash: "p", createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      creatorUserId: "another-user",
    } as Parameters<typeof bundle.actionPreviews.create>[1])

    const approvalRequest = () => request(`/api/workunit/${workUnitId}/approval`, { actionPreviewId, decision: "approve" })
    assert.equal((await decideApproval(approvalRequest(), { params: Promise.resolve({ id: workUnitId }) })).status, 201)
    assert.equal((await decideApproval(approvalRequest(), { params: Promise.resolve({ id: workUnitId }) })).status, 409)

    const listResponse = await listPreviews(new Request(`http://localhost/api/workunit/${workUnitId}/approval`), { params: Promise.resolve({ id: workUnitId }) })
    assert.equal(listResponse.status, 200)
    const serialized = JSON.stringify(await listResponse.json())
    for (const forbidden of ["targetHash", "payloadHash", "tenantId"]) assert.equal(serialized.includes(forbidden), false)

    const expiredPreviewId = "preview:expired"
    await bundle.actionPreviews.create(bundle.ctx, {
      id: expiredPreviewId,
      tenantId,
      workUnitId,
      actionType: "slack_reply",
      targetPreview: "{}",
      payloadPreview: "{}",
      requiresApproval: 1,
      status: "preview",
      targetHash: "target",
      payloadHash: "payload",
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    const expired = await decideApproval(
      request(`/api/workunit/${workUnitId}/approval`, { actionPreviewId: expiredPreviewId, decision: "approve" }),
      { params: Promise.resolve({ id: workUnitId }) },
    )
    assert.equal(expired.status, 400)
  })
})

test("approval rejects self-approval and missing-creator previews with self_approval_forbidden", async () => {
  // P6-FIX-010 route regression (Issue #143): the route's LOCAL four-eyes
  // defense — stored creator versus session approver — must keep failing
  // closed. The broader Phase 6 identity-independence gate is deliberately
  // NOT wired here before Issue #144.
  await withPersistence(async () => {
    const bundle = await seedWorkUnit()

    // Same user: the dev session user is the stored creator.
    const selfPreviewId = "preview:self-approval"
    await bundle.actionPreviews.create(bundle.ctx, {
      id: selfPreviewId, tenantId, workUnitId, actionType: "slack_reply",
      targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
      targetHash: "t", payloadHash: "p", createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      creatorUserId: "dev-user",
    } as Parameters<typeof bundle.actionPreviews.create>[1])
    const selfResponse = await decideApproval(
      request(`/api/workunit/${workUnitId}/approval`, { actionPreviewId: selfPreviewId, decision: "approve" }),
      { params: Promise.resolve({ id: workUnitId }) },
    )
    assert.equal(selfResponse.status, 403)
    assert.equal(((await selfResponse.json()) as { error?: string }).error, "self_approval_forbidden")

    // Missing creator: a pre-P1 row cannot prove distinct actors — fail closed.
    const orphanPreviewId = "preview:missing-creator"
    await bundle.actionPreviews.create(bundle.ctx, {
      id: orphanPreviewId, tenantId, workUnitId, actionType: "slack_reply",
      targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
      targetHash: "t", payloadHash: "p", createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    const orphanResponse = await decideApproval(
      request(`/api/workunit/${workUnitId}/approval`, { actionPreviewId: orphanPreviewId, decision: "approve" }),
      { params: Promise.resolve({ id: workUnitId }) },
    )
    assert.equal(orphanResponse.status, 403)
    assert.equal(((await orphanResponse.json()) as { error?: string }).error, "self_approval_forbidden")
  })
})
