import test from "node:test"
import assert from "node:assert/strict"
import { GET } from "../app/api/workunit/[id]/approval/status/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import type { ApprovalRecordRow } from "../app/lib/persistence/types.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { seedDevControlWorkspace } from "./helpers/devControlWorkspace.ts"

const tenantId = "dev-tenant" as TenantId
const testSafeFutureExpiresAt = "2999-01-01T00:00:00.000Z"

test("approval status route does not expose approvalId or hashes", async () => {
  await withPersistence(async () => {
    const repoResult = await resolveRouteRepositories(tenantId)
    assert.equal(repoResult.ok, true)
    if (!repoResult.ok) return
    const { workUnits, actionPreviews, approvalRecords, ctx } = repoResult.bundle
    const ar = approvalRow()
    // Parent-ownership order (enforcing bundle): WorkUnit → matching Preview → Approval.
    await workUnits.upsert(ctx, { id: ar.workUnitId, tenantId, title: "t", kind: "task", priority: "medium", sourceProvider: "mock", reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: ar.createdAt, updatedAt: ar.createdAt })
    await actionPreviews.create(ctx, { id: ar.actionPreviewId, tenantId, workUnitId: ar.workUnitId, actionType: ar.actionType, targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview", targetHash: ar.targetHash, payloadHash: ar.payloadHash, createdAt: ar.createdAt, expiresAt: testSafeFutureExpiresAt })
    await approvalRecords.create(ctx, ar)

    const response = await GET(new Request("http://localhost/api/workunit/wu:status/approval/status"), {
      params: Promise.resolve({ id: "wu:status" }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    const flat = JSON.stringify(body)
    assert.equal(flat.includes("approvalId"), false)
    assert.equal(flat.includes("approval:status"), false)
    assert.equal(flat.includes("targetHash"), false)
    assert.equal(flat.includes("payloadHash"), false)
    assert.equal(flat.includes("tenantId"), false)
    assert.equal(body.status, "approved")
  })
})

async function withPersistence(testFn: () => Promise<void>) {
  const db = new FakeD1Database()
  const backup = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_ADAPTER: process.env.AUTH_ADAPTER,
    ALLOW_DEV_SESSION: process.env.ALLOW_DEV_SESSION,
    ALLOW_DEV_WORKSPACE_BOOTSTRAP: process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
  }
  try {
    process.env.NODE_ENV = "development"
    process.env.AUTH_ADAPTER = "dev"
    process.env.ALLOW_DEV_SESSION = "true"
    process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"
    process.env.PERSISTENCE_MODE = "d1"
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    // WU-06: explicit workspace seed — the GET under test no longer bootstraps.
    await seedDevControlWorkspace(db, "owner")
    await testFn()
  } finally {
    for (const [key, value] of Object.entries(backup)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    resetTestRuntimeEnvForRequest()
  }
}

function approvalRow(): ApprovalRecordRow {
  return {
    id: "approval:status",
    tenantId,
    workUnitId: "wu:status",
    actionPreviewId: "preview:status",
    actionType: "internal_task",
    targetHash: "target-hash",
    payloadHash: "payload-hash",
    status: "approved",
    createdAt: "2026-06-22T00:00:00.000Z",
    approvedAt: "2026-06-22T00:00:00.000Z",
    expiresAt: testSafeFutureExpiresAt,
  }
}
