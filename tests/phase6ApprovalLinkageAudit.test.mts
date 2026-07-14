/**
 * P6-FIX-011: audit-projection tests for the Approval Chain Linkage module
 * (Issue #144). The factory runs the verifier internally and emits a frozen,
 * fully redacted event.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  createApprovalLinkageRecord,
  createApprovalLinkageAuditEvent,
  sanitizeApprovalLinkageAuditIssueCodes,
  verifyApprovalLinkage,
  type ApprovalLinkageRecord,
  type ApprovalLinkageAuditEvent,
} from "../app/lib/phase6/approvalLinkage/index.ts"
import {
  validContext,
  validInput,
  approvalRow,
  previewRow,
  TARGET_HASH,
  PAYLOAD_HASH,
} from "./fixtures/phase6/approvalLinkageFixture.mts"

function build(): { record: ApprovalLinkageRecord; context: Record<string, unknown> } {
  const context = validContext()
  const result = createApprovalLinkageRecord(validInput(), context)
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues))
  if (!result.ok) throw new Error("unreachable")
  return { record: result.record, context }
}

test("only a real internal verification emits the verified event", () => {
  const { record, context } = build()
  const check = verifyApprovalLinkage(record, context)
  assert.equal(check.ok, true)
  const event = createApprovalLinkageAuditEvent(record, context)
  assert.equal(event.event_kind, "approval_linkage_verified")
  assert.equal(event.state, "verified")
  assert.equal(event.ok, true)
  assert.deepEqual([...event.issue_codes], [])
  assert.equal(event.approval_linkage_id, "link-1")
  assert.equal(event.human_decision_id, "hdr-1")
  assert.equal(event.review_evidence_id, "rev-1")
  assert.equal(event.workunit_id, "wu-1")
  assert.equal(event.action_preview_id, "preview-1")
  assert.equal(event.approval_id, "approval:preview-1")
})

test("a fabricated result-like input can never produce a verified event", () => {
  const { context } = build()
  for (const forged of [
    { ok: true, state: "verified", issues: [] },
    { approval_linkage_id: "link-1", verification_result: { ok: true, state: "verified" } },
  ]) {
    const event = createApprovalLinkageAuditEvent(forged, context)
    assert.notEqual(event.event_kind, "approval_linkage_verified")
    assert.equal(event.ok, false)
  }
})

test("stale chains emit the stale event, consumed linkage emits replayed, others rejected", () => {
  const { record, context } = build()
  const stale = createApprovalLinkageAuditEvent(record, { ...context, action_preview: previewRow({ payloadPreview: JSON.stringify({ body: "EDITED" }), payloadHash: PAYLOAD_HASH }) })
  assert.equal(stale.event_kind, "approval_linkage_stale")
  assert.equal(stale.state, "stale")
  const replayed = createApprovalLinkageAuditEvent(record, { ...context, consumed_approval_linkage_ids: ["link-1"] })
  assert.equal(replayed.event_kind, "approval_linkage_replayed")
  const rejectedUsed = createApprovalLinkageAuditEvent(record, { ...context, approval_record: approvalRow({ usedAt: "2026-07-05T02:55:00Z" }) })
  assert.equal(rejectedUsed.event_kind, "approval_linkage_rejected")
  assert.equal(rejectedUsed.state, "used")
  const rejectedExpired = createApprovalLinkageAuditEvent(record, { ...context, evaluated_at: "2026-07-05T05:00:00Z" })
  assert.equal(rejectedExpired.event_kind, "approval_linkage_rejected")
})

test("only canonical issue codes are emitted; unknown codes never echo", () => {
  const sanitized = sanitizeApprovalLinkageAuditIssueCodes([
    { code: "approval_linkage_stale", field: "x" },
    { code: "totally_made_up", field: "y" },
    { code: "approval_linkage_expired", field: "z" },
    "not-an-object",
  ])
  assert.deepEqual([...sanitized.issue_codes], ["approval_linkage_stale", "approval_linkage_expired", "approval_linkage_validation_exception"])
  assert.equal(sanitized.all_canonical, false)
  assert.ok(!JSON.stringify(sanitized).includes("totally_made_up"))
  assert.ok(Object.isFrozen(sanitized.issue_codes))
})

test("no hash, user identity, or raw content appears in any event", () => {
  const { record, context } = build()
  const events: ApprovalLinkageAuditEvent[] = [
    createApprovalLinkageAuditEvent(record, context),
    createApprovalLinkageAuditEvent(record, { ...context, approval_record: approvalRow({ approvedByUserId: "someone" }) }),
    createApprovalLinkageAuditEvent(null, context),
  ]
  for (const event of events) {
    const s = JSON.stringify(event)
    for (const secret of [
      TARGET_HASH, PAYLOAD_HASH,
      (record as unknown as Record<string, unknown>).linkage_hash as string,
      (record as unknown as Record<string, unknown>).human_decision_hash as string,
      (record as unknown as Record<string, unknown>).review_envelope_hash as string,
      (record as unknown as Record<string, unknown>).identity_chain_hash as string,
      "approver-1", "requester-1", "creator-1", "reviewer-one", "reviewer-two",
      "s-approver-1", "@x.test", "manager", "channel-1", "hello reviewers",
    ]) {
      assert.ok(!s.includes(secret), `event must not contain: ${secret}`)
    }
    assert.deepEqual(Object.keys(event as unknown as Record<string, unknown>).sort(), [
      "action_preview_id", "approval_id", "approval_linkage_id", "evaluated_at",
      "event_kind", "human_decision_id", "issue_codes", "ok", "review_evidence_id",
      "state", "workunit_id",
    ])
  }
})

test("malformed input never throws and yields a redacted rejected event", () => {
  for (const bad of [null, undefined, 42, "x", [], () => {}]) {
    let event: ApprovalLinkageAuditEvent | undefined
    assert.doesNotThrow(() => { event = createApprovalLinkageAuditEvent(bad, bad) })
    assert.ok(event && event.ok === false)
    if (event) {
      assert.equal(event.event_kind, "approval_linkage_rejected")
      assert.equal(event.approval_linkage_id, "(invalid)")
    }
  }
  const hostile = new Proxy({}, { ownKeys() { throw new Error("keys") }, getOwnPropertyDescriptor() { throw new Error("d") } })
  const event = createApprovalLinkageAuditEvent(hostile, hostile)
  assert.equal(event.ok, false)
})

test("the event and issue-code array are frozen and deterministic", () => {
  const { record, context } = build()
  const a = createApprovalLinkageAuditEvent(record, context)
  const b = createApprovalLinkageAuditEvent(record, context)
  assert.ok(Object.isFrozen(a))
  assert.ok(Object.isFrozen(a.issue_codes))
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)))
})

test("source guard: the audit factory never calls a runtime audit logger", () => {
  const src = readFileSync(fileURLToPath(new URL("../app/lib/phase6/approvalLinkage/audit.ts", import.meta.url)), "utf8")
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
  for (const forbidden of ["writeAuditLog", "recordAuditEvent", "auditPersistence", "auditLog.ts"]) {
    assert.ok(!code.includes(forbidden), `audit.ts must not reference ${forbidden}`)
  }
})
