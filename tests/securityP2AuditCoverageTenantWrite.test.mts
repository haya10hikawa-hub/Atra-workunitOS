/**
 * Security P2 — tools-route persistent audit coverage + in-memory tenant write hardening.
 *
 * Proves:
 *  - the tools route persists an `external_action_blocked` audit row when the kill
 *    switch refuses an external operation (tenant-scoped, redacted), while external
 *    execution stays disabled and the response remains a safe 403;
 *  - the in-memory approval repo derives tenantId from context on create(), so a
 *    caller cannot write an approval into another tenant by spoofing row.tenantId,
 *    and reads/markUsed remain tenant-scoped.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { POST as toolsPost } from "../app/api/workunit/tools/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { createInMemoryApprovalRecordRepository } from "../app/lib/persistence/inMemoryRepositories.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { TenantDbContext, ApprovalRecordRow } from "../app/lib/persistence/types.ts"

const tenantId = "dev-tenant" as TenantId

async function withToolsPersistence(fn: (db: FakeD1Database) => Promise<void>) {
  const db = new FakeD1Database()
  const backup = { ...process.env }
  try {
    process.env.NODE_ENV = "development"
    process.env.AUTH_ADAPTER = "dev"
    process.env.ALLOW_DEV_SESSION = "true"
    process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"
    process.env.PERSISTENCE_MODE = "d1"
    process.env.DEV_SESSION_ROLE = "owner" // owner has workunit.execute_external_action
    delete process.env.EXTERNAL_ACTIONS_ENABLED // kill switch OFF
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    await fn(db)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
    resetTestRuntimeEnvForRequest()
  }
}

function toolsRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/workunit/tools", {
    method: "POST",
    headers: { Host: "localhost:3000", "content-type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  })
}

// ─── P2-a / P2-c: tools route external-action-blocked audit persistence ──

test("1. tools external-action-blocked persists a tenant-scoped audit row; execution stays disabled", async () => {
  await withToolsPersistence(async () => {
    const res = await toolsPost(toolsRequest({
      id: "tool-1", source: "github", operation: "create_issue",
      draft: { id: "draft-1", title: "Issue title" },
    }))
    // External execution remains DISABLED — kill switch returns a safe 403.
    assert.equal(res.status, 403)
    const body = await res.json() as { ok: boolean; requestId: string; error: string }
    assert.equal(body.ok, false)
    assert.equal(body.error, "external_actions_disabled")
    assert.equal("result" in body, false, "no execution result is returned")

    // The blocked attempt was persisted, tenant-scoped.
    const repos = await resolveRouteRepositories(tenantId)
    assert.equal(repos.ok, true)
    if (!repos.ok) return
    const rows = await repos.bundle.auditLogs.listRecent(repos.bundle.ctx)
    const blocked = rows.find((r) => r.eventKind === "external_action_blocked")
    assert.ok(blocked, "external_action_blocked audit row must be persisted")
    assert.equal(blocked!.tenantId, tenantId)
  })
})

test("2. persisted tools audit metadata is redacted (operation only; no secrets/payloads)", async () => {
  await withToolsPersistence(async () => {
    await toolsPost(toolsRequest({
      id: "tool-2", source: "slack", operation: "reply",
      draft: { id: "draft-2", title: "Reply", token: "sk-should-not-persist", rawPayload: { body: "x" } },
    }))
    const repos = await resolveRouteRepositories(tenantId)
    if (!repos.ok) return
    const rows = await repos.bundle.auditLogs.listRecent(repos.bundle.ctx)
    const blocked = rows.find((r) => r.eventKind === "external_action_blocked")
    assert.ok(blocked)
    const meta = blocked!.metadata ?? "{}"
    const parsed = JSON.parse(meta) as Record<string, unknown>
    assert.equal(parsed.operation, "reply") // allowlisted key kept
    for (const bad of ["token", "secret", "rawPayload", "providerPayload", "targetHash", "payloadHash", "tenantId", "draft"]) {
      assert.equal(JSON.stringify(parsed).includes(bad), false, `${bad} must not be persisted`)
    }
    // actorId is in the actor column, not metadata.
    assert.equal(JSON.stringify(parsed).includes("actorId"), false)
  })
})

test("3. tools route source: external_action_blocked persists fail-open and adds no execution", () => {
  const src = readToolsRouteSource()
  // Kill switch present and driven by the request-scoped security config
  // (projected via projectRuntimeAuthorizationEnv), NEVER ambient process.env.
  assert.ok(src.includes("areExternalActionsEnabled(killSwitchEnv)"))
  assert.ok(src.includes("projectRuntimeAuthorizationEnv(runtime.security)"))
  assert.equal(src.includes("areExternalActionsEnabled()"), false)
  // LLM resolution uses the request-scoped config projection, not process.env.
  assert.ok(src.includes("resolveLlmProvider(llmEnv)"))
  assert.equal(src.includes("resolveLlmProvider()"), false)
  // The Runtime Authorization gate receives the request-scoped kill-switch env.
  assert.ok(src.includes("env: projectRuntimeAuthorizationEnv(runtime.security)"))
  // No runtime secret is ever surfaced in a response or audit metadata.
  assert.equal(src.includes("runtime.auth.jwt"), false)
  assert.ok(src.includes('"external_action_blocked"'))
  assert.ok(src.includes("recordAuditEvent") && src.includes("persistAuditEvent"))
  // Persistence helper is fail-open (try/catch) and resolves the bundle on demand.
  assert.ok(/persistAuditEvent[\s\S]*try[\s\S]*catch/.test(src))
  // No new external execution: the external clients are never imported here.
  for (const bad of ["externalToolClients", "realGitHubClient", "chat.postMessage", "messages/send"]) {
    assert.equal(src.includes(bad), false, `tools route must not call ${bad}`)
  }
})

// ─── P2-b / P2-d: in-memory tenant write hardening ──────────────

function approvalRow(over: Partial<ApprovalRecordRow>): ApprovalRecordRow {
  return {
    id: over.id ?? "approval:1", tenantId: (over.tenantId ?? tenantId) as TenantId, workUnitId: "wu1",
    actionPreviewId: "p1", actionType: "internal_task", targetHash: "t", payloadHash: "p",
    status: over.status ?? "approved", approvedByUserId: "u1" as ApprovalRecordRow["approvedByUserId"],
    createdAt: "2026-06-29T00:00:00.000Z", approvedAt: "2026-06-29T00:00:00.000Z",
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), usedAt: undefined,
  }
}
const ctx = (t: string): TenantDbContext => ({ tenantId: t as TenantId, db: null })

test("4. in-memory approval create derives tenantId from ctx — no cross-tenant write", async () => {
  const repo = createInMemoryApprovalRecordRepository()
  // Caller is in tenant-a but spoofs row.tenantId = tenant-b.
  const stored = await repo.create(ctx("tenant-a"), approvalRow({ id: "approval:x", tenantId: "tenant-b" as TenantId }))
  assert.equal(stored.tenantId, "tenant-a", "stored tenantId must come from ctx, not the row")
  // tenant-b cannot read it; tenant-a can.
  assert.equal(await repo.findById(ctx("tenant-b"), "approval:x"), null)
  assert.notEqual(await repo.findById(ctx("tenant-a"), "approval:x"), null)
})

test("5. in-memory approval reads + markUsed remain tenant-scoped", async () => {
  const repo = createInMemoryApprovalRecordRepository()
  await repo.create(ctx("tenant-a"), approvalRow({ id: "approval:y", actionPreviewId: "pv" }))
  // Cross-tenant reads return nothing.
  assert.equal(await repo.findByPreviewId(ctx("tenant-b"), "pv"), null)
  assert.equal((await repo.findByWorkUnitId(ctx("tenant-b"), "wu1")).length, 0)
  // Cross-tenant markUsed is refused; owner tenant succeeds.
  assert.equal(await repo.markUsed(ctx("tenant-b"), "approval:y", new Date().toISOString()), null)
  assert.notEqual(await repo.markUsed(ctx("tenant-a"), "approval:y", new Date().toISOString()), null)
})

function readToolsRouteSource(): string {
  return readFileSync(path.join(process.cwd(), "app/api/workunit/tools/route.ts"), "utf8")
}
