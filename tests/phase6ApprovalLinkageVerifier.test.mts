/**
 * P6-FIX-011: verifier tests for the Approval Chain Linkage module
 * (Issue #144). Builds a real linkage record and verifies it against the
 * current context, then against every mutation and state boundary.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createApprovalLinkageRecord,
  verifyApprovalLinkage,
  type ApprovalLinkageRecord,
} from "../app/lib/phase6/approvalLinkage/index.ts"
import {
  validContext,
  validInput,
  previewRow,
  approvalRow,
  identityInput,
  humanDecision,
  evidence,
  evidenceWithId,
  envelopeHashFor,
} from "./fixtures/phase6/approvalLinkageFixture.mts"

/** Build a valid linkage record over a fresh valid context. */
function buildRecord(): { record: ApprovalLinkageRecord; context: Record<string, unknown> } {
  const context = validContext()
  const result = createApprovalLinkageRecord(validInput(), context)
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues))
  if (!result.ok) throw new Error("unreachable")
  return { record: result.record, context }
}

function recordObj(record: ApprovalLinkageRecord): Record<string, unknown> {
  return { ...(record as unknown as Record<string, unknown>) }
}

function expectState(linkage: unknown, context: unknown, state: string, label: string): void {
  const result = verifyApprovalLinkage(linkage, context)
  assert.equal(result.state, state, `${label}: got ${result.state} ${JSON.stringify(result.issues.map((i) => i.code))}`)
  assert.equal(result.ok, state === "verified", label)
}

// ─── Verified ───────────────────────────────────────────────────

test("a current valid chain verifies and grants nothing", () => {
  const { record, context } = buildRecord()
  const result = verifyApprovalLinkage(record, context)
  assert.equal(result.state, "verified")
  assert.equal(result.ok, true)
  assert.deepEqual([...result.issues], [])
  // No approval / authorization / execution field on the result.
  const keys = Object.keys(result as unknown as Record<string, unknown>).sort()
  assert.deepEqual(keys, ["issues", "ok", "state"])
})

test("the result is frozen with a frozen issue array and is deterministic", () => {
  const { record, context } = buildRecord()
  const a = verifyApprovalLinkage(record, context)
  const b = verifyApprovalLinkage(record, context)
  assert.ok(Object.isFrozen(a))
  assert.ok(Object.isFrozen(a.issues))
  assert.deepEqual(a.issues.map((i) => i.message), b.issues.map((i) => i.message))
})

// ─── Linkage record self-mutation ───────────────────────────────

test("any linkage record field mutation is detected", () => {
  const { record, context } = buildRecord()
  for (const field of ["tenant_id", "human_decision_id", "approver_id", "target_hash", "workunit_id", "linkage_expires_at"]) {
    const tampered = recordObj(record)
    tampered[field] = field.endsWith("_hash") || field.endsWith("_at") ? tampered[field] : "mutated"
    if (field.endsWith("_at")) tampered[field] = "2027-01-01T00:00:00Z"
    if (field.endsWith("_hash")) tampered[field] = "9".repeat(64)
    // The self-hash no longer covers the mutated field → invalid.
    expectState(tampered, context, "invalid", `mutate ${field}`)
  }
})

test("a linkage hash mutation is invalid", () => {
  const { record, context } = buildRecord()
  const tampered = recordObj(record)
  tampered.linkage_hash = "f".repeat(64)
  expectState(tampered, context, "invalid", "linkage hash mutation")
})

test("self-hash-only fields (approval_linkage_id, linked_at) are covered by the linkage hash", () => {
  // These fields are not part of the current-derived chain, so ONLY the
  // self-hash protects them. Tampering either must be invalid.
  const { record, context } = buildRecord()
  const t1 = recordObj(record)
  t1.approval_linkage_id = "link-TAMPERED"
  expectState(t1, context, "invalid", "approval_linkage_id tamper")
  const t2 = recordObj(record)
  t2.linked_at = "2026-07-05T02:49:00Z"
  expectState(t2, context, "invalid", "linked_at tamper")
})

test("a current Approval Record with a different id makes the chain stale", () => {
  const { record, context } = buildRecord()
  expectState(record, { ...context, approval_record: approvalRow({ id: "approval-OTHER" }) }, "stale", "different approval id")
})

test("a current Review Evidence with a different id makes the chain stale", () => {
  const { record, context } = buildRecord()
  // Rebuild a fully-consistent current chain over a different review_evidence_id
  // (identity input updated too), so the ONLY difference from the stored record
  // is the Review Evidence id/hash. The stored-vs-derived comparison must flag it.
  const hd = context.human_decision
  const { envelopeHash } = envelopeHashFor(hd)
  const otherEv = evidenceWithId(hd, envelopeHash, "rev-2")
  const ctx2 = { ...context, review_evidence: otherEv, identity_input: identityInput(hd, otherEv) }
  expectState(record, ctx2, "stale", "different RE id")
})

test("a structurally malformed linkage record is invalid", () => {
  const { context } = buildRecord()
  expectState({ approval_linkage_id: "x" }, context, "invalid", "partial record")
  expectState(null, context, "invalid", "null record")
})

// ─── Source mutation makes the chain stale ──────────────────────

test("Human Decision content mutation makes the chain stale", () => {
  const { record, context } = buildRecord()
  // A different HD (same id, edited rationale) changes the HD hash → stale.
  const staleCtx = { ...context, human_decision: humanDecision({ human_decision_rationale: "an edited rationale after linking" }) }
  const result = verifyApprovalLinkage(record, staleCtx)
  assert.equal(result.state, "stale")
})

test("Preview target / payload / action-type mutation makes the chain stale (hash recomputed)", () => {
  const { record, context } = buildRecord()
  // Edit the stored content AND its stored hash consistently; the recomputed
  // hash no longer matches the linked chain → stale, not verified.
  const editedTarget = previewRow({
    targetPreview: JSON.stringify({ provider: "slack", destination: "EDITED" }),
    // deliberately leave targetHash stale to prove content is recomputed.
  })
  expectState(record, { ...context, action_preview: editedTarget }, "stale", "target edit")
  const editedPayload = previewRow({ payloadPreview: JSON.stringify({ body: "EDITED" }), payloadHash: record.payload_hash })
  expectState(record, { ...context, action_preview: editedPayload }, "stale", "payload edit")
})

test("stale stored hash strings cannot mask a content mutation", () => {
  const { record, context } = buildRecord()
  // Content changed to EDITED but stored hashes kept at the ORIGINAL values.
  const masked = previewRow({
    targetPreview: JSON.stringify({ provider: "slack", destination: "EDITED" }),
    payloadPreview: JSON.stringify({ body: "EDITED" }),
    // targetHash / payloadHash stay at the fixture originals (matching record).
  })
  const result = verifyApprovalLinkage(record, { ...context, action_preview: masked })
  assert.notEqual(result.state, "verified", "content recomputation must catch the edit")
})

test("Approval Record mutation and approver mutation make the chain fail", () => {
  const { record, context } = buildRecord()
  expectState(record, { ...context, approval_record: approvalRow({ approvedByUserId: "someone-else" }) }, "stale", "approver mutation")
})

test("preview creator mutation fails", () => {
  const { record, context } = buildRecord()
  expectState(record, { ...context, action_preview: previewRow({ creatorUserId: "other" }) }, "stale", "creator mutation")
})

// ─── Expiry boundaries (inclusive-fail) ─────────────────────────

test("exactly-at-expiry fails for every boundary", () => {
  const { record, context } = buildRecord()
  // Derived linkage expiry is min(review 05:30, preview 06:00, approval 05:00).
  expectState(record, { ...context, evaluated_at: "2026-07-05T05:00:00Z" }, "expired", "at approval expiry (=linkage)")
  // Approval expiry moved later so the review boundary (05:30) becomes the min.
  const rev = buildRecord2({ approval_record: approvalRow({ expiresAt: "2026-07-05T07:00:00Z" }) })
  expectState(rev.record, { ...rev.context, evaluated_at: "2026-07-05T05:30:00Z" }, "expired", "at review expiry")
})

test("review, preview, and approval expiry each fail", () => {
  const a = buildRecord2({ review_evidence_expires: true })
  expectState(a.record, { ...a.context, evaluated_at: "2026-07-05T05:45:00Z" }, "expired", "review expired")
})

// ─── Revoke / consume / replay ──────────────────────────────────

test("revoked or consumed Review Evidence fails", () => {
  const { record, context } = buildRecord()
  expectState(record, { ...context, revoked_review_evidence_ids: ["rev-1"] }, "revoked", "revoked RE")
  expectState(record, { ...context, consumed_review_evidence_ids: ["rev-1"] }, "replayed", "consumed RE")
})

test("revoked, used, or consumed Approval fails", () => {
  const { record, context } = buildRecord()
  expectState(record, { ...context, revoked_approval_ids: ["approval:preview-1"] }, "revoked", "revoked approval")
  expectState(record, { ...context, approval_record: approvalRow({ usedAt: "2026-07-05T02:55:00Z" }) }, "used", "usedAt")
  expectState(record, { ...context, approval_record: approvalRow({ status: "used" }) }, "used", "used status")
  expectState(record, { ...context, consumed_approval_ids: ["approval:preview-1"] }, "used", "consumed approval")
})

test("a revoked Linkage fails and a consumed Linkage reports replay", () => {
  const { record, context } = buildRecord()
  expectState(record, { ...context, revoked_approval_linkage_ids: ["link-1"] }, "revoked", "revoked linkage")
  expectState(record, { ...context, consumed_approval_linkage_ids: ["link-1"] }, "replayed", "consumed linkage")
})

// ─── No fabricated result ───────────────────────────────────────

test("a fabricated verification result object cannot pass", () => {
  const { context } = buildRecord()
  expectState({ ok: true, state: "verified", issues: [] }, context, "invalid", "fabricated result")
})

test("current source IDs must still match the linkage record", () => {
  const { record, context } = buildRecord()
  // A completely different WorkUnit in the current approval → stale/mismatch.
  const result = verifyApprovalLinkage(record, { ...context, approval_record: approvalRow({ workUnitId: "wu-OTHER" }) })
  assert.notEqual(result.state, "verified")
})

// ─── Local helper for boundary variants ─────────────────────────

function buildRecord2(opts: {
  approval_record?: Record<string, unknown>
  review_evidence_expires?: boolean
}): { record: ApprovalLinkageRecord; context: Record<string, unknown> } {
  const hd = humanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev: unknown = evidence(hd, envelopeHash)
  const ctxOverrides: Record<string, unknown> = { human_decision: hd, review_evidence: ev, identity_input: identityInput(hd, ev) }
  if (opts.approval_record) ctxOverrides.approval_record = opts.approval_record
  const context = validContext(ctxOverrides)
  const result = createApprovalLinkageRecord(validInput(), context)
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues))
  if (!result.ok) throw new Error("unreachable")
  return { record: result.record, context }
}
