/**
 * P6-FIX-012 (Issue #145): current executor identity and the executor-versus-
 * approver separation rule. Identity equality is canonical tenant + user id —
 * never role, email, display name, or session id.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { evaluateRuntimeAuthorizationEligibility } from "../app/lib/phase6/runtimeAuthorization/index.ts"
import { createCanonicalSessionIdentity } from "../app/lib/phase6/canonicalIdentity/index.ts"
import {
  eligibilityInput,
  executorIdentity,
  ISSUED_AT,
} from "./fixtures/phase6/runtimeAuthorizationFixture.mts"

function session(overrides: Record<string, unknown> = {}) {
  return {
    userId: "executor-1", tenantId: "tenant-1", role: "owner", email: "executor-1@x.test",
    isDevSession: false, sessionId: "s-exec", createdAt: "2026-07-04T00:00:00Z",
    expiresAt: "2026-07-06T00:00:00Z", ...overrides,
  }
}

function executorFromSession(overrides: Record<string, unknown> = {}) {
  const r = createCanonicalSessionIdentity(session(overrides), {
    actor_kind: "executor", expected_tenant_id: "tenant-1", observed_at: ISSUED_AT,
  })
  return r
}

function stateFor(executor_identity: unknown): string {
  const r = evaluateRuntimeAuthorizationEligibility(eligibilityInput({ executor_identity }))
  return r.ok ? "eligible" : r.state
}

test("a current authenticated human session constructs an eligible executor", () => {
  const r = executorFromSession()
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(stateFor(r.identity), "eligible")
})

test("dev session fails to construct an executor", () => {
  assert.equal(executorFromSession({ isDevSession: true }).ok, false)
})

test("anonymous session (no user) fails", () => {
  assert.equal(executorFromSession({ userId: "" }).ok, false)
})

test("expired session fails (inclusive-fail at expiry)", () => {
  assert.equal(executorFromSession({ expiresAt: ISSUED_AT }).ok, false)
})

test("cross-tenant session fails", () => {
  assert.equal(executorFromSession({ tenantId: "tenant-2" }).ok, false)
})

test("malformed session fails", () => {
  assert.equal(createCanonicalSessionIdentity("not-an-object", {
    actor_kind: "executor", expected_tenant_id: "tenant-1", observed_at: ISSUED_AT,
  }).ok, false)
})

test("service-account marker fails", () => {
  assert.equal(executorFromSession({ is_service_account: true }).ok, false)
})

test("delegation marker fails", () => {
  assert.equal(executorFromSession({ on_behalf_of: "someone-else" }).ok, false)
})

test("executor equals approver fails at eligibility", () => {
  assert.equal(stateFor(executorIdentity("approver-1")), "forbidden")
})

test("same email but a different canonical user id is a different identity", () => {
  // executor-2 shares no canonical user id with approver-1 → separation holds.
  assert.equal(stateFor(executorIdentity("executor-2")), "eligible")
})

test("wrong executor actor_kind is rejected (approver identity as executor)", () => {
  // An identity built with a non-executor actor_kind fails the executor gate.
  const approverAsExecutor = {
    tenant_id: "tenant-1", user_id: "executor-9", actor_kind: "approver",
    identity_source: "authenticated_session", source_record_id: "s", observed_at: ISSUED_AT,
    subject_type: "human_user",
  }
  assert.equal(stateFor(approverAsExecutor), "forbidden")
})

test("a caller-supplied executor id string (not a canonical identity) is rejected", () => {
  assert.equal(stateFor("executor-1"), "forbidden")
})
