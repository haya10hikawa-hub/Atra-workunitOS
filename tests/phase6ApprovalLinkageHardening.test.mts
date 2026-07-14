/**
 * P6-FIX-011 hardening (PR #162 repair): regression tests for the six
 * security-boundary repairs — single Linkage snapshot, content-bound outer
 * artifacts, present-invalid executor, unified replay/revoke snapshot, redacted
 * invalid audit events, and Human-Decision nested-array snapshot depth.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createApprovalLinkageRecord,
  verifyApprovalLinkage,
  createApprovalLinkageAuditEvent,
  type ApprovalLinkageRecord,
} from "../app/lib/phase6/approvalLinkage/index.ts"
import { hashField } from "../app/lib/security/hash.ts"
import {
  validContext,
  validInput,
  humanDecision,
  evidence,
  buildEvidence,
  envelopeHashFor,
  identityInput,
  sessionIdentity,
} from "./fixtures/phase6/approvalLinkageFixture.mts"

function buildRecord(): { record: ApprovalLinkageRecord; context: Record<string, unknown> } {
  const context = validContext()
  const result = createApprovalLinkageRecord(validInput(), context)
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues))
  if (!result.ok) throw new Error("unreachable")
  return { record: result.record, context }
}

function expectConstructFail(ctx: Record<string, unknown>, code: string, label: string): void {
  const result = createApprovalLinkageRecord(validInput(), ctx)
  assert.equal(result.ok, false, label)
  if (result.ok) return
  assert.ok(
    result.issues.some((i) => i.code === code),
    `${label}: expected ${code}; got ${JSON.stringify(result.issues.map((i) => i.code))}`,
  )
}

// ─── Repair 2: single Linkage snapshot in the verifier ──────────

function countingProxy(obj: Record<string, unknown>): { proxy: unknown; counts: Record<string, number> } {
  const counts: Record<string, number> = {}
  const proxy = new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === "string") counts[prop] = (counts[prop] ?? 0) + 1
      return Reflect.get(target, prop)
    },
  })
  return { proxy, counts }
}

test("Repair 2: the verifier reads each Linkage scalar from the original at most once", () => {
  const { record, context } = buildRecord()
  const { proxy, counts } = countingProxy({ ...(record as unknown as Record<string, unknown>) })
  const result = verifyApprovalLinkage(proxy, context)
  assert.equal(result.state, "verified")
  for (const [key, n] of Object.entries(counts)) {
    assert.ok(n <= 1, `Linkage.${key} read ${n} times (expected at most once)`)
  }
})

test("Repair 2: a Linkage field cannot validate as one value and be used as another", () => {
  const { record, context } = buildRecord()
  const plain = { ...(record as unknown as Record<string, unknown>) }
  for (const field of ["linkage_hash", "approval_id", "linked_at", "approval_expires_at"]) {
    let reads = 0
    const original = plain[field]
    const forged = new Proxy(plain, {
      get(t, p) {
        if (p === field) {
          reads += 1
          return reads === 1 ? original : (typeof original === "string" && original.length === 64 ? "f".repeat(64) : "2099-01-01T00:00:00Z")
        }
        return Reflect.get(t, p)
      },
    })
    const result = verifyApprovalLinkage(forged, context)
    assert.equal(reads, 1, `${field} read exactly once`)
    // The decision matches the first (validated) read — the later value is unused.
    assert.equal(result.state, "verified", `${field}: later getter value must not change the decision`)
  }
})

test("Repair 2: a throwing getter or ownKeys trap on the Linkage fails closed without throwing", () => {
  const { context } = buildRecord()
  const hostileGet = new Proxy({ approval_linkage_id: "x" }, { get() { throw new Error("hostile") } })
  const hostileKeys = new Proxy({}, { ownKeys() { throw new Error("keys") }, getOwnPropertyDescriptor() { throw new Error("d") } })
  for (const hostile of [hostileGet, hostileKeys]) {
    let result: ReturnType<typeof verifyApprovalLinkage> | undefined
    assert.doesNotThrow(() => { result = verifyApprovalLinkage(hostile, context) })
    assert.ok(result && result.state === "invalid")
  }
})

// ─── Repair 3: content-bind outer HD / RE to Identity Independence

test("Repair 3: nested Human Decision with same id but different rationale fails", () => {
  const hd = humanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev = evidence(hd, envelopeHash)
  const differentHd = humanDecision({ human_decision_rationale: "an entirely different rationale" })
  const ctx = validContext({
    human_decision: hd, review_evidence: ev,
    identity_input: identityInput(differentHd, ev),
  })
  expectConstructFail(ctx, "approval_linkage_human_decision_mismatch", "same-id different-content HD")
})

test("Repair 3: nested Review Evidence with same id but different reviewers/attestations/hash fails", () => {
  const hd = humanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev = evidence(hd, envelopeHash)
  // (a) different reviewers, same id
  const diffReviewers = buildEvidence(hd, envelopeHash, { firstReviewer: "reviewer-x", secondReviewer: "reviewer-y" })
  expectConstructFail(
    validContext({ human_decision: hd, review_evidence: ev, identity_input: identityInput(hd, diffReviewers) }),
    "approval_linkage_review_evidence_mismatch", "different reviewers")
  // (b) different attestation ids, same id + reviewers
  const diffAtt = buildEvidence(hd, envelopeHash, { firstAttId: "att-9", secondAttId: "att-8" })
  expectConstructFail(
    validContext({ human_decision: hd, review_evidence: ev, identity_input: identityInput(hd, diffAtt) }),
    "approval_linkage_review_evidence_mismatch", "different attestation ids")
  // (c) different reviewed (envelope) hash, same id
  const otherEnvelope = envelopeHashFor(hd, { payloadHash: "9".repeat(64) }).envelopeHash
  const diffHash = buildEvidence(hd, otherEnvelope, {})
  expectConstructFail(
    validContext({ human_decision: hd, review_evidence: ev, identity_input: identityInput(hd, diffHash) }),
    "approval_linkage_review_evidence_mismatch", "different reviewed hash")
})

test("Repair 3: individually valid nested artifacts that differ from the outer artifacts still fail", () => {
  // The nested HD is a real, valid HD and Identity Independence would succeed
  // over it, but it differs from the authoritative outer HD → content mismatch.
  const outerHd = humanDecision()
  const { envelopeHash } = envelopeHashFor(outerHd)
  const ev = evidence(outerHd, envelopeHash)
  const nestedHd = humanDecision({ human_decision_summary: "a different but valid summary" })
  const ctx = validContext({
    human_decision: outerHd, review_evidence: ev,
    identity_input: identityInput(nestedHd, ev),
  })
  expectConstructFail(ctx, "approval_linkage_human_decision_mismatch", "valid-but-different nested HD")
})

test("Repair 3: a mismatched identity_input.evaluated_at fails", () => {
  const hd = humanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev = evidence(hd, envelopeHash)
  const ctx = validContext({
    human_decision: hd, review_evidence: ev,
    identity_input: identityInput(hd, ev, { evaluated_at: "2026-07-05T02:59:00Z" }),
  })
  expectConstructFail(ctx, "approval_linkage_identity_mismatch", "different evaluated_at")
})

// ─── Repair 4: a present executor must validate ─────────────────

function withExecutor(exec: unknown): Record<string, unknown> {
  const hd = humanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev = evidence(hd, envelopeHash)
  return validContext({
    human_decision: hd, review_evidence: ev,
    identity_input: identityInput(hd, ev, { executor_identity: exec }),
  })
}

test("Repair 4: an absent executor still constructs (executor is optional)", () => {
  const result = createApprovalLinkageRecord(validInput(), validContext())
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues))
})

test("Repair 4: a valid executor constructs and grants nothing", () => {
  const result = createApprovalLinkageRecord(validInput(), withExecutor(sessionIdentity("executor-1", "executor")))
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues))
  if (!result.ok) return
  const s = JSON.stringify(result.record)
  for (const grant of ["authorized", "execution_permission", "execution_token", "runtime_authorization"]) {
    assert.ok(!s.includes(grant), grant)
  }
  // The record carries no ApprovalStore-style status/grant field.
  assert.equal(Object.prototype.hasOwnProperty.call(result.record, "status"), false)
})

test("Repair 4: a present-but-invalid executor fails closed and is never silently omitted", () => {
  const base = { tenant_id: "tenant-1", user_id: "e", actor_kind: "executor", identity_source: "authenticated_session", source_record_id: "s", observed_at: "2026-07-05T00:30:00Z", subject_type: "human_user" }
  const cases: [unknown, string][] = [
    [null, "null executor"],
    [{ nope: true }, "structural invalid"],
    [{ ...base, tenant_id: "tenant-OTHER" }, "wrong tenant"],
    [{ ...base, actor_kind: "reviewer" }, "wrong actor kind"],
    [{ ...base, identity_source: "model_output" }, "wrong identity source"],
    [{ ...base, delegated_for_user_id: "x" }, "delegation marker"],
    [{ ...base, is_service_account: true }, "service-account marker"],
    [new Proxy({}, { get() { throw new Error("boom") } }), "getter failure"],
  ]
  for (const [exec, label] of cases) {
    expectConstructFail(withExecutor(exec), "approval_linkage_identity_mismatch", label)
  }
})

// ─── Repair 5: one replay/revocation snapshot ───────────────────

test("Repair 5: constructing an already-revoked linkage id fails", () => {
  expectConstructFail(validContext({ revoked_approval_linkage_ids: ["link-1"] }), "approval_linkage_revoked", "revoked linkage id")
})

test("Repair 5: constructing an already-consumed linkage id fails as replay", () => {
  expectConstructFail(validContext({ consumed_approval_linkage_ids: ["link-1"] }), "approval_linkage_replayed", "consumed linkage id")
})

test("Repair 5: verification classifies revoke/replay from the same frozen snapshot; a mutating array cannot change the decision", () => {
  const { record, context } = buildRecord()
  // A getter-backed array that would flip to include the id on a later read.
  let reads = 0
  const trap = new Proxy([] as string[], {
    get(t, p) {
      if (p === "length") return reads++ === 0 ? 0 : 1
      if (p === "0") return "link-1"
      return Reflect.get(t, p)
    },
  })
  const result = verifyApprovalLinkage(record, { ...context, consumed_approval_linkage_ids: trap })
  // snapshotStringArrayOrNull reads the array once into a frozen copy; the
  // later "length 1" read never reaches classification.
  assert.notEqual(result.state, "replayed", "a post-snapshot array mutation must not flip the decision")
})

// ─── Repair 6: fully redact invalid audit input ─────────────────

test("Repair 6: an invalid-state audit event exposes no identifier from the hostile Linkage", () => {
  const { context } = buildRecord()
  const hostile = {
    approval_linkage_id: "secret-token-value",
    human_decision_id: "access-token",
    review_evidence_id: "session-secret",
    workunit_id: "user-approver-1",
    action_preview_id: "a".repeat(64),
    approval_id: "b".repeat(64),
    // ...deliberately not a valid linkage record → state invalid
  }
  const event = createApprovalLinkageAuditEvent(hostile, context)
  assert.equal(event.state, "invalid")
  assert.equal(event.event_kind, "approval_linkage_rejected")
  for (const id of ["approval_linkage_id", "human_decision_id", "review_evidence_id", "workunit_id", "action_preview_id", "approval_id", "evaluated_at"]) {
    assert.equal((event as unknown as Record<string, string>)[id], "(invalid)", `${id} must be redacted`)
  }
  const s = JSON.stringify(event)
  for (const leak of ["secret-token-value", "access-token", "session-secret", "user-approver-1", "a".repeat(64), "b".repeat(64)]) {
    assert.ok(!s.includes(leak), `invalid event must not leak: ${leak}`)
  }
})

test("Repair 6: a fabricated result-like input produces an event with every identifier (invalid)", () => {
  const { context } = buildRecord()
  const event = createApprovalLinkageAuditEvent({ ok: true, state: "verified", issues: [] }, context)
  assert.equal(event.ok, false)
  assert.equal(event.state, "invalid")
  for (const id of ["approval_linkage_id", "human_decision_id", "review_evidence_id", "workunit_id", "action_preview_id", "approval_id"]) {
    assert.equal((event as unknown as Record<string, string>)[id], "(invalid)")
  }
})

// ─── Snapshot-depth: Human Decision nested arrays ───────────────

test("snapshot-depth: a getter-backed HD array cannot change between validation and hashing", () => {
  // Build a plain HD whose `allowed_use` returns a valid value first and a
  // different value on later reads. The HD hash must reflect the first
  // (validated) read only — a shallow snapshot would hash the later value.
  const plainHd = { ...(humanDecision() as unknown as Record<string, unknown>) }
  let reads = 0
  const trapArray = new Proxy(["priority_assessment input"], {
    get(t, p) {
      if (p === "0") { reads += 1; return reads === 1 ? "priority_assessment input" : "MUTATED-AFTER-VALIDATION" }
      return Reflect.get(t, p)
    },
  })
  const hostileHd = { ...plainHd, allowed_use: trapArray }
  const cleanHd = { ...plainHd, allowed_use: ["priority_assessment input"] }

  const { envelopeHash } = envelopeHashFor(cleanHd)
  const ev = evidence(cleanHd, envelopeHash)
  const ctx = validContext({
    human_decision: hostileHd, review_evidence: ev,
    identity_input: identityInput(cleanHd, ev),
  })
  const result = createApprovalLinkageRecord(validInput(), ctx)
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues))
  if (!result.ok) return
  // The stored human_decision_hash must equal the hash of the CLEAN HD
  // (first-read content), proving the later "MUTATED" value never reached
  // hashing. hashField sorts keys, so field order is irrelevant.
  const expected = hashField(cleanHd)
  assert.equal((result.record as unknown as Record<string, unknown>).human_decision_hash, expected,
    "HD hash must reflect the validated first-read array content")
})
