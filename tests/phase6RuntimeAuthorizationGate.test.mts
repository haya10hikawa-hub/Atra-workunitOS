/**
 * P6-FIX-012 (Issue #145): the server-side final runtime authorization gate.
 * A fully valid chain yields exactly one frozen `authorized_not_executed`
 * receipt after — and only after — the exact-binding atomic claim wins. RBAC and
 * kill-switch failures block before the claim; a lost claim yields no receipt; no
 * provider is called and no ExecutionResult / externalRef is produced.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { authorizeRuntimeCommand } from "../app/lib/security/runtimeAuthorizationGate.ts"
import { createInMemoryApprovalStore } from "../app/lib/security/approvalStore.ts"
import { createInMemoryRuntimeAuthorizationEvidenceResolver, defaultDenyRuntimeAuthorizationEvidenceResolver } from "../app/lib/security/runtimeAuthorizationEvidenceResolver.ts"
import type { Session } from "../app/lib/security/session.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"
import {
  runtimeContext,
  runtimeLinkage,
  intendedAction,
  ISSUED_AT,
  SESSION_EXPIRES_AT,
} from "./fixtures/phase6/runtimeAuthorizationFixture.mts"
import { approvalRow } from "./fixtures/phase6/approvalLinkageFixture.mts"

const ENABLED = { EXTERNAL_ACTIONS_ENABLED: "true" } as unknown as NodeJS.ProcessEnv

function session(userId = "executor-1", role = "owner", overrides: Record<string, unknown> = {}): Session {
  return {
    userId: userId as UserId, tenantId: "tenant-1" as TenantId, role: role as Session["role"],
    email: `${userId}@x.test`, isDevSession: false, sessionId: `s-${userId}`,
    createdAt: "2026-07-04T00:00:00Z", expiresAt: SESSION_EXPIRES_AT, ...overrides,
  } as Session
}

function request() {
  return { tenantId: "tenant-1", workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1", actionType: "slack_reply" }
}

function setup() {
  const context = runtimeContext()
  const linkage = runtimeLinkage(context)
  const ia = intendedAction()
  const evidenceResolver = createInMemoryRuntimeAuthorizationEvidenceResolver([
    {
      tenantId: "tenant-1", workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1",
      bundle: {
        linkage,
        linkageContext: context,
        intendedAction: {
          tenantId: "tenant-1", workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1",
          actionType: "slack_reply", targetHash: ia.target_hash as string, payloadHash: ia.payload_hash as string,
        },
      },
    },
  ])
  const approvalStore = createInMemoryApprovalStore()
  approvalStore.addRecord(approvalRow() as never)
  return { approvalStore, evidenceResolver }
}

function gateInput(over: Record<string, unknown> = {}) {
  const { approvalStore, evidenceResolver } = setup()
  return { session: session(), request: request(), evaluatedAt: ISSUED_AT, approvalStore, evidenceResolver, env: ENABLED, ...over }
}

test("a fully valid chain returns one frozen authorized_not_executed receipt", async () => {
  const r = await authorizeRuntimeCommand(gateInput())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.state, "authorized_not_executed")
  assert.equal(r.receipt.status, "authorized_not_executed")
  assert.equal(Object.isFrozen(r.receipt), true)
  assert.match(r.receipt.authorization_hash, /^[0-9a-f]{64}$/)
  // No execution / provider material.
  for (const forbidden of ["executed", "externalRef", "provider", "providerRef"]) {
    assert.ok(!(forbidden in r.receipt))
  }
})

test("the claim is consumed: a second identical gate call fails (used)", async () => {
  const { approvalStore, evidenceResolver } = setup()
  const base = { session: session(), request: request(), evaluatedAt: ISSUED_AT, approvalStore, evidenceResolver, env: ENABLED }
  const first = await authorizeRuntimeCommand(base)
  const second = await authorizeRuntimeCommand(base)
  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  if (second.ok) return
  assert.equal(second.state, "used")
})

test("RBAC failure (viewer) blocks before the claim — approval not consumed", async () => {
  const { approvalStore, evidenceResolver } = setup()
  const denied = await authorizeRuntimeCommand({ session: session("executor-1", "viewer"), request: request(), evaluatedAt: ISSUED_AT, approvalStore, evidenceResolver, env: ENABLED })
  assert.equal(denied.ok, false)
  if (denied.ok) return
  assert.equal(denied.state, "forbidden")
  // Approval was not consumed: an owner can still claim it.
  const allowed = await authorizeRuntimeCommand({ session: session(), request: request(), evaluatedAt: ISSUED_AT, approvalStore, evidenceResolver, env: ENABLED })
  assert.equal(allowed.ok, true)
})

test("kill switch off blocks before the claim", async () => {
  const { approvalStore, evidenceResolver } = setup()
  const r = await authorizeRuntimeCommand({ session: session(), request: request(), evaluatedAt: ISSUED_AT, approvalStore, evidenceResolver, env: {} as NodeJS.ProcessEnv })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "blocked")
})

test("default-deny resolver → not_ready, no receipt", async () => {
  const approvalStore = createInMemoryApprovalStore()
  approvalStore.addRecord(approvalRow() as never)
  const r = await authorizeRuntimeCommand({ session: session(), request: request(), evaluatedAt: ISSUED_AT, approvalStore, evidenceResolver: defaultDenyRuntimeAuthorizationEvidenceResolver, env: ENABLED })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "not_ready")
})

test("dev session → forbidden (executor cannot be derived)", async () => {
  const r = await authorizeRuntimeCommand(gateInput({ session: session("executor-1", "owner", { isDevSession: true }) }))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "forbidden")
})

test("executor equals approver → forbidden, no claim", async () => {
  const { approvalStore, evidenceResolver } = setup()
  const r = await authorizeRuntimeCommand({ session: session("approver-1"), request: request(), evaluatedAt: ISSUED_AT, approvalStore, evidenceResolver, env: ENABLED })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "forbidden")
})

test("a lost claim (pre-consumed approval) yields no receipt", async () => {
  const { approvalStore, evidenceResolver } = setup()
  // Pre-consume via the exact-binding claim.
  await approvalStore.claimApprovalForRuntime({
    tenantId: "tenant-1" as TenantId, workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1",
    actionType: "slack_reply", targetHash: (intendedAction().target_hash as string), payloadHash: (intendedAction().payload_hash as string),
    claimedAt: "2026-07-05T02:59:00Z",
  })
  const r = await authorizeRuntimeCommand({ session: session(), request: request(), evaluatedAt: ISSUED_AT, approvalStore, evidenceResolver, env: ENABLED })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "used")
})

test("deterministic authorization identity for the same claimed envelope", async () => {
  const a = await authorizeRuntimeCommand(gateInput())
  const b = await authorizeRuntimeCommand(gateInput())
  assert.equal(a.ok && b.ok, true)
  if (!a.ok || !b.ok) return
  assert.equal(a.receipt.authorization_id, b.receipt.authorization_id)
})

test("changed executor changes idempotency identity", async () => {
  const a = await authorizeRuntimeCommand(gateInput())
  const b = await authorizeRuntimeCommand(gateInput({ session: session("executor-2") }))
  assert.equal(a.ok && b.ok, true)
  if (!a.ok || !b.ok) return
  assert.notEqual(a.receipt.authorization_id, b.receipt.authorization_id)
})
