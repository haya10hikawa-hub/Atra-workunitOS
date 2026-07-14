/**
 * P6-FIX-012 (Issue #145): the server-side final runtime authorization gate.
 * A fully valid chain yields exactly one frozen `authorized_not_executed`
 * receipt after — and only after — the exact-binding atomic claim wins, using an
 * authoritative timestamp minted AFTER the async evidence read. RBAC and
 * kill-switch failures block before the claim; a lost claim yields no receipt; a
 * slow resolver that crosses an expiry boundary fails; the claim binding equals
 * the receipt binding; no provider is called.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { authorizeRuntimeCommand, type RuntimeAuthorizationClock } from "../app/lib/security/runtimeAuthorizationGate.ts"
import { buildRuntimeAuthorizationPayload, hashRuntimeAuthorizationPayload } from "../app/lib/phase6/runtimeAuthorization/index.ts"
import { createInMemoryApprovalStore } from "../app/lib/security/approvalStore.ts"
import {
  createInMemoryRuntimeAuthorizationEvidenceResolver,
  defaultDenyRuntimeAuthorizationEvidenceResolver,
  type RuntimeAuthorizationEvidenceResolver,
} from "../app/lib/security/runtimeAuthorizationEvidenceResolver.ts"
import type { Session } from "../app/lib/security/session.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"
import {
  evidenceBundle,
  intendedAction,
  ISSUED_AT,
  SESSION_EXPIRES_AT,
  TEST_CLOCK,
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

function seededResolver() {
  const bundle = evidenceBundle()
  return createInMemoryRuntimeAuthorizationEvidenceResolver([
    { tenantId: "tenant-1", workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1", bundle },
  ])
}

function freshStore() {
  const s = createInMemoryApprovalStore()
  s.addRecord(approvalRow() as never)
  return s
}

function gateInput(over: Record<string, unknown> = {}) {
  return {
    session: session(),
    request: request(),
    approvalStore: freshStore(),
    evidenceResolver: seededResolver(),
    env: ENABLED,
    clock: TEST_CLOCK,
    ...over,
  }
}

test("a fully valid chain returns one frozen authorized_not_executed receipt", async () => {
  const r = await authorizeRuntimeCommand(gateInput())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.state, "authorized_not_executed")
  assert.equal(r.receipt.status, "authorized_not_executed")
  assert.equal(Object.isFrozen(r.receipt), true)
  assert.match(r.receipt.authorization_hash, /^[0-9a-f]{64}$/)
  for (const forbidden of [
    "executed", "externalRef", "external_ref", "provider", "providerRef", "provider_ref",
    "rawTarget", "raw_target", "rawPayload", "raw_payload", "sendableBody", "sendable_body", "token", "credential",
  ]) {
    assert.ok(!(forbidden in r.receipt), `receipt must not carry ${forbidden}`)
  }
  // Exact allowlisted key set — no extra field sneaks in.
  assert.deepEqual(Object.keys(r.receipt).sort(), [
    "action_preview_id", "action_type", "approval_id", "approval_linkage_id",
    "authorization_hash", "authorization_id", "canonicalization_algorithm",
    "executor_id", "expires_at", "hash_algorithm", "hash_domain", "hash_version",
    "idempotency_key", "issued_at", "payload_hash", "status", "target_hash",
    "tenant_id", "workunit_id",
  ])
  // The hash is an integrity digest over the exact-allowlist payload.
  const recomputed = hashRuntimeAuthorizationPayload(buildRuntimeAuthorizationPayload({
    authorization_id: r.receipt.authorization_id, tenant_id: r.receipt.tenant_id,
    workunit_id: r.receipt.workunit_id, action_preview_id: r.receipt.action_preview_id,
    approval_id: r.receipt.approval_id, approval_linkage_id: r.receipt.approval_linkage_id,
    action_type: r.receipt.action_type, target_hash: r.receipt.target_hash,
    payload_hash: r.receipt.payload_hash, executor_id: r.receipt.executor_id,
    idempotency_key: r.receipt.idempotency_key, issued_at: r.receipt.issued_at, expires_at: r.receipt.expires_at,
  }))
  assert.equal(r.receipt.authorization_hash, recomputed)
})

test("the claim binding fields exactly equal the receipt binding fields", async () => {
  // The claim and the receipt both derive from eligibility.evidence, so no
  // getter can verify Action B, claim Approval C, and receipt Action B.
  const ia = intendedAction()
  const r = await authorizeRuntimeCommand(gateInput())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.receipt.tenant_id, ia.tenant_id)
  assert.equal(r.receipt.workunit_id, ia.workunit_id)
  assert.equal(r.receipt.action_preview_id, ia.action_preview_id)
  assert.equal(r.receipt.approval_id, ia.approval_id)
  assert.equal(r.receipt.action_type, ia.action_type)
  assert.equal(r.receipt.target_hash, ia.target_hash)
  assert.equal(r.receipt.payload_hash, ia.payload_hash)
})

test("the claim is consumed: a second identical gate call fails (used)", async () => {
  const store = freshStore()
  const resolver = seededResolver()
  const base = { session: session(), request: request(), approvalStore: store, evidenceResolver: resolver, env: ENABLED, clock: TEST_CLOCK }
  const first = await authorizeRuntimeCommand(base)
  const second = await authorizeRuntimeCommand(base)
  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  if (second.ok) return
  assert.equal(second.state, "used")
})

test("RBAC failure (viewer) blocks before the claim — approval not consumed", async () => {
  const store = freshStore()
  const resolver = seededResolver()
  const denied = await authorizeRuntimeCommand({ session: session("executor-1", "viewer"), request: request(), approvalStore: store, evidenceResolver: resolver, env: ENABLED, clock: TEST_CLOCK })
  assert.equal(denied.ok, false)
  if (denied.ok) return
  assert.equal(denied.state, "forbidden")
  const allowed = await authorizeRuntimeCommand({ session: session(), request: request(), approvalStore: store, evidenceResolver: resolver, env: ENABLED, clock: TEST_CLOCK })
  assert.equal(allowed.ok, true)
})

test("kill switch off blocks before the claim", async () => {
  const r = await authorizeRuntimeCommand(gateInput({ env: {} as NodeJS.ProcessEnv }))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "blocked")
})

test("default-deny resolver → not_ready, no receipt", async () => {
  const r = await authorizeRuntimeCommand(gateInput({ evidenceResolver: defaultDenyRuntimeAuthorizationEvidenceResolver }))
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
  const r = await authorizeRuntimeCommand(gateInput({ session: session("approver-1") }))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "forbidden")
})

test("a lost claim (pre-consumed approval) yields no receipt", async () => {
  const store = freshStore()
  await store.claimApprovalForRuntime({
    tenantId: "tenant-1" as TenantId, workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1",
    actionType: "slack_reply", targetHash: intendedAction().target_hash as string, payloadHash: intendedAction().payload_hash as string,
    claimedAt: "2026-07-05T02:59:00Z",
  })
  const r = await authorizeRuntimeCommand(gateInput({ approvalStore: store }))
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

// ─── Temporal freshness: delayed resolver crosses expiry ────────

/**
 * A resolver whose async read "takes time": the trusted clock advances between
 * the request and the post-resolution instant, so authorization is evaluated at
 * `afterResolution`, not at any earlier time.
 */
function delayedClock(afterResolution: string): { resolver: RuntimeAuthorizationEvidenceResolver; clock: RuntimeAuthorizationClock } {
  const bundle = evidenceBundle()
  const resolver: RuntimeAuthorizationEvidenceResolver = {
    async resolveEvidenceBundle() {
      return bundle
    },
  }
  return { resolver, clock: { now: () => afterResolution } }
}

for (const [label, after] of [
  ["approval expires during resolution", "2026-07-05T05:00:00Z"],   // approval_expires_at
  ["review evidence expires during resolution", "2026-07-05T05:30:00Z"], // review_expires_at
  ["preview expires during resolution", "2026-07-05T06:00:00Z"],    // preview_expires_at
  ["linkage boundary crossed during resolution", "2026-07-05T05:00:00Z"],
] as const) {
  test(`temporal: ${label} → fails, no claim`, async () => {
    const store = freshStore()
    const { resolver, clock } = delayedClock(after)
    const r = await authorizeRuntimeCommand({ session: session(), request: request(), approvalStore: store, evidenceResolver: resolver, env: ENABLED, clock })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.ok(["expired", "stale", "used"].includes(r.state), `state=${r.state}`)
    // Approval was NOT claimed (still claimable at a valid earlier instant).
    const claimable = await store.claimApprovalForRuntime({
      tenantId: "tenant-1" as TenantId, workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1",
      actionType: "slack_reply", targetHash: intendedAction().target_hash as string, payloadHash: intendedAction().payload_hash as string,
      claimedAt: "2026-07-05T03:00:00Z",
    })
    assert.equal(claimable, true, "approval must remain unclaimed after a stale-time rejection")
  })
}

test("temporal: approval valid before resolution, expired after resolution, no claim", async () => {
  // Before resolution the approval is unexpired (03:00); the resolver "delays"
  // and the fresh instant lands after every upstream expiry.
  const store = freshStore()
  const { resolver, clock } = delayedClock("2026-07-05T06:30:00Z")
  const r = await authorizeRuntimeCommand({ session: session(), request: request(), approvalStore: store, evidenceResolver: resolver, env: ENABLED, clock })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(["expired", "stale"].includes(r.state))
})

test("temporal: executor session expires during resolution → forbidden, no claim", async () => {
  const store = freshStore()
  const { resolver } = delayedClock(ISSUED_AT)
  // Session expires exactly at the fresh instant (inclusive-fail).
  const r = await authorizeRuntimeCommand({
    session: session("executor-1", "owner", { expiresAt: ISSUED_AT }),
    request: request(), approvalStore: store, evidenceResolver: resolver, env: ENABLED, clock: { now: () => ISSUED_AT },
  })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "forbidden")
})

test("temporal: exactly-at-expiry fails", async () => {
  // Fresh instant exactly at the authorization expiry ceiling (approval expiry).
  const store = freshStore()
  const r = await authorizeRuntimeCommand(gateInput({ approvalStore: store, clock: { now: () => "2026-07-05T05:00:00Z" } }))
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(["expired", "stale"].includes(r.state))
})

// ─── F6: audit lifecycle ────────────────────────────────────────

import type { RuntimeAuthorizationAuditSink } from "../app/lib/phase6/runtimeAuthorization/index.ts"

function recordingSink(): { sink: RuntimeAuthorizationAuditSink; kinds: string[]; events: Array<Record<string, unknown>> } {
  const kinds: string[] = []
  const events: Array<Record<string, unknown>> = []
  return {
    sink: {
      flush(evts) {
        for (const e of evts) {
          kinds.push(e.event_kind)
          events.push(e as unknown as Record<string, unknown>)
        }
      },
    },
    kinds,
    events,
  }
}

test("audit lifecycle: requested → eligible → claimed → created on success", async () => {
  const rec = recordingSink()
  const r = await authorizeRuntimeCommand(gateInput({ auditSink: rec.sink }))
  assert.equal(r.ok, true)
  assert.deepEqual(rec.kinds, [
    "runtime_authorization_requested",
    "runtime_authorization_eligible",
    "runtime_authorization_claimed",
    "runtime_authorization_created",
  ])
  // No hash / session / reviewer / token material in any event.
  for (const e of rec.events) {
    for (const forbidden of ["authorization_hash", "target_hash", "payload_hash", "executor_id", "session_id", "reviewer_id", "token", "secret"]) {
      assert.ok(!(forbidden in e), `event must not carry ${forbidden}`)
    }
  }
})

test("audit lifecycle: a false CAS emits replayed and never claimed/created", async () => {
  const store = freshStore()
  await store.claimApprovalForRuntime({
    tenantId: "tenant-1" as TenantId, workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1",
    actionType: "slack_reply", targetHash: intendedAction().target_hash as string, payloadHash: intendedAction().payload_hash as string,
    claimedAt: "2026-07-05T02:59:00Z",
  })
  const rec = recordingSink()
  const r = await authorizeRuntimeCommand(gateInput({ approvalStore: store, auditSink: rec.sink }))
  assert.equal(r.ok, false)
  assert.ok(rec.kinds.includes("runtime_authorization_eligible"))
  assert.ok(rec.kinds.includes("runtime_authorization_replayed"))
  assert.ok(!rec.kinds.includes("runtime_authorization_claimed"))
  assert.ok(!rec.kinds.includes("runtime_authorization_created"))
})

test("audit lifecycle: a blocked kill switch emits requested → blocked, never eligible", async () => {
  const rec = recordingSink()
  const r = await authorizeRuntimeCommand(gateInput({ env: {} as NodeJS.ProcessEnv, auditSink: rec.sink }))
  assert.equal(r.ok, false)
  assert.deepEqual(rec.kinds, ["runtime_authorization_requested", "runtime_authorization_blocked"])
})

test("audit sink whose flush throws never breaks the gate", async () => {
  const r = await authorizeRuntimeCommand(gateInput({ auditSink: { flush() { throw new Error("audit boom") } } }))
  assert.equal(r.ok, true)
})

// ─── F1 mutation anchor: the clock is read AFTER the resolver ────

test("the authorization instant is minted AFTER resolution (resolver advances the clock)", async () => {
  // The resolver flips `resolved` as its async effect; the clock returns a valid
  // time before resolution and an EXPIRED time after. Correct code reads the
  // clock after resolution (expired ⇒ fail); a stale (pre-resolution) read would
  // see the valid time and wrongly succeed.
  let resolved = false
  const bundle = evidenceBundle()
  const resolver: RuntimeAuthorizationEvidenceResolver = {
    async resolveEvidenceBundle() { resolved = true; return bundle },
  }
  const clock: RuntimeAuthorizationClock = { now: () => (resolved ? "2026-07-05T06:30:00Z" : "2026-07-05T03:00:00Z") }
  const store = freshStore()
  const r = await authorizeRuntimeCommand({ session: session(), request: request(), approvalStore: store, evidenceResolver: resolver, env: ENABLED, clock })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(["expired", "stale"].includes(r.state), `state=${r.state}`)
  // And no claim happened.
  const claimable = await store.claimApprovalForRuntime({
    tenantId: "tenant-1" as TenantId, workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1",
    actionType: "slack_reply", targetHash: intendedAction().target_hash as string, payloadHash: intendedAction().payload_hash as string,
    claimedAt: "2026-07-05T03:00:00Z",
  })
  assert.equal(claimable, true)
})

// ─── MB1/MB2: claim-adjacency & malicious audit sink ────────────

test("a malicious audit sink cannot disable the kill switch before the claim (flush is post-claim)", async () => {
  const env = { EXTERNAL_ACTIONS_ENABLED: "true" } as Record<string, string>
  const sink: RuntimeAuthorizationAuditSink = { flush() { env.EXTERNAL_ACTIONS_ENABLED = "false" } }
  const r = await authorizeRuntimeCommand(gateInput({ env: env as unknown as NodeJS.ProcessEnv, auditSink: sink }))
  // The sink runs only AFTER the claim; the claim used the enabled switch.
  assert.equal(r.ok, true)
})

test("the audit sink is invoked only AFTER the claim (instrumented ordering)", async () => {
  const log: string[] = []
  const inner = freshStore()
  const store = {
    findApprovalById: inner.findApprovalById.bind(inner),
    markApprovalUsed: inner.markApprovalUsed.bind(inner),
    async claimApprovalForRuntime(i: Parameters<typeof inner.claimApprovalForRuntime>[0]) {
      log.push("CLAIM")
      return inner.claimApprovalForRuntime(i)
    },
  }
  const sink: RuntimeAuthorizationAuditSink = { flush() { log.push("SINK") } }
  const r = await authorizeRuntimeCommand({
    session: session(), request: request(), approvalStore: store as never,
    evidenceResolver: seededResolver(), env: ENABLED, clock: TEST_CLOCK, auditSink: sink,
  })
  assert.equal(r.ok, true)
  assert.deepEqual(log, ["CLAIM", "SINK"])
})

test("a microtask that flips the kill switch mid-flight is caught by the fresh final check", async () => {
  const env = { EXTERNAL_ACTIONS_ENABLED: "true" } as Record<string, string>
  const bundle = evidenceBundle()
  const resolver: RuntimeAuthorizationEvidenceResolver = {
    async resolveEvidenceBundle() {
      // Schedule a microtask that disables the switch during completion.
      Promise.resolve().then(() => { env.EXTERNAL_ACTIONS_ENABLED = "false" })
      return bundle
    },
  }
  const store = freshStore()
  const r = await authorizeRuntimeCommand({
    session: session(), request: request(), approvalStore: store, evidenceResolver: resolver,
    env: env as unknown as NodeJS.ProcessEnv, clock: TEST_CLOCK,
  })
  // A disabled switch must NEVER result in a successful claim: the microtask runs
  // at the resolver await (before the final check), so the fresh check blocks.
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.state, "blocked")
  // The approval was not claimed.
  const claimable = await store.claimApprovalForRuntime({
    tenantId: "tenant-1" as TenantId, workUnitId: "wu-1", actionPreviewId: "preview-1", approvalId: "approval:preview-1",
    actionType: "slack_reply", targetHash: intendedAction().target_hash as string, payloadHash: intendedAction().payload_hash as string,
    claimedAt: "2026-07-05T03:00:00Z",
  })
  assert.equal(claimable, true)
})

test("a role change on the original session after snapshot cannot subvert (snapshot is authoritative)", async () => {
  const sess = session()
  const sink: RuntimeAuthorizationAuditSink = { flush() { (sess as { role: string }).role = "viewer" } }
  const r = await authorizeRuntimeCommand(gateInput({ session: sess, auditSink: sink }))
  assert.equal(r.ok, true)
})

test("the durable audit flush is awaited before the gate returns", async () => {
  let flushed = false
  const sink: RuntimeAuthorizationAuditSink = { async flush() { await Promise.resolve(); await Promise.resolve(); flushed = true } }
  const r = await authorizeRuntimeCommand(gateInput({ auditSink: sink }))
  assert.equal(r.ok, true)
  assert.equal(flushed, true, "flush must complete before the gate returns")
})

test("blocked and RBAC-denied audit events carry one allowlisted reason code (no raw values)", async () => {
  const recBlocked = recordingSink()
  await authorizeRuntimeCommand(gateInput({ env: {} as NodeJS.ProcessEnv, auditSink: recBlocked.sink }))
  const blocked = recBlocked.events.find((e) => e.event_kind === "runtime_authorization_blocked")
  assert.ok(blocked)
  assert.deepEqual(blocked!.issue_codes, ["runtime_authorization_kill_switch_off"])

  const recRbac = recordingSink()
  await authorizeRuntimeCommand(gateInput({ session: session("executor-1", "viewer"), auditSink: recRbac.sink }))
  const rejected = recRbac.events.find((e) => e.event_kind === "runtime_authorization_rejected")
  assert.ok(rejected)
  assert.deepEqual(rejected!.issue_codes, ["runtime_authorization_rbac_denied"])
})
