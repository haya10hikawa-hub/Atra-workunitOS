/**
 * P6-FIX-011: constructor tests for the Approval Chain Linkage module
 * (Issue #144). Exercises the real production constructor over a fully valid
 * chain and every fail-closed path.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createApprovalLinkageRecord,
  type ApprovalLinkageRecord,
  type ApprovalLinkageConstructionResult,
} from "../app/lib/phase6/approvalLinkage/index.ts"
import {
  validContext,
  validInput,
  previewRow,
  approvalRow,
  identityInput,
  sessionIdentity,
  humanDecision,
  evidence,
  envelopeHashFor,
  TARGET_HASH,
  PAYLOAD_HASH,
} from "./fixtures/phase6/approvalLinkageFixture.mts"

function construct(inputOverrides: Record<string, unknown> = {}, ctxOverrides: Record<string, unknown> = {}) {
  return createApprovalLinkageRecord(validInput(inputOverrides), validContext(ctxOverrides))
}

function asRecord(result: ApprovalLinkageConstructionResult): Record<string, unknown> {
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues))
  if (!result.ok) throw new Error("unreachable")
  return result.record as unknown as Record<string, unknown>
}

function expectFail(result: ApprovalLinkageConstructionResult, code: string, label: string): void {
  assert.equal(result.ok, false, label)
  if (result.ok) return
  assert.ok(
    result.issues.some((i) => i.code === code),
    `${label}: expected ${code}; got ${JSON.stringify(result.issues.map((i) => i.code))}`,
  )
}

// ─── Compile-time boundary (erased at runtime) ──────────────────

type IsAssignable<A, B> = A extends B ? true : false
type AssertFalse<T extends false> = T
type StructuralLinkage = { readonly approval_linkage_id: string; readonly linkage_hash: string }
type _RawNotAssignable = AssertFalse<IsAssignable<StructuralLinkage, ApprovalLinkageRecord>>
type SuccessRecord = Extract<ApprovalLinkageConstructionResult, { ok: true }>["record"]
type _ConstructorType = IsAssignable<SuccessRecord, ApprovalLinkageRecord> extends true ? true : never
type ApprovalLike = { readonly status: "approved"; readonly approvedByUserId: string }
type ExecutionLike = { readonly execution_permission: true }
type _NotApproval = AssertFalse<IsAssignable<ApprovalLinkageRecord, ApprovalLike>>
type _NotExecution = AssertFalse<IsAssignable<ApprovalLinkageRecord, ExecutionLike>>

test("compile-time boundary assertions are wired (runtime no-op)", () => {
  const witnesses: unknown[] = [
    null as unknown as _RawNotAssignable,
    null as unknown as _ConstructorType,
    null as unknown as _NotApproval,
    null as unknown as _NotExecution,
  ]
  assert.equal(witnesses.length, 4)
})

// ─── Valid construction ─────────────────────────────────────────

test("one fully valid chain constructs a frozen opaque record", () => {
  const result = construct()
  const record = asRecord(result)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(record))
  assert.match(record.linkage_hash as string, /^[0-9a-f]{64}$/)
  assert.equal(record.hash_algorithm, "sha256")
  assert.equal(record.canonicalization_algorithm, "atra-sorted-json-v1")
  assert.equal(Object.getOwnPropertySymbols(record).length, 0, "no runtime brand symbol")
})

test("all derived binding fields match the validated sources", () => {
  const record = asRecord(construct())
  assert.equal(record.approval_linkage_id, "link-1")
  assert.equal(record.tenant_id, "tenant-1")
  assert.equal(record.human_decision_id, "hdr-1")
  assert.equal(record.review_evidence_id, "rev-1")
  assert.equal(record.workunit_id, "wu-1")
  assert.equal(record.action_preview_id, "preview-1")
  assert.equal(record.approval_id, "approval:preview-1")
  assert.equal(record.action_type, "slack_reply")
  assert.equal(record.target_hash, TARGET_HASH)
  assert.equal(record.payload_hash, PAYLOAD_HASH)
  assert.equal(record.approver_id, "approver-1")
  assert.equal(record.first_review_attestation_id, "att-1")
  assert.equal(record.second_review_attestation_id, "att-2")
  // Derived expiry = min(review 05:30, preview 06:00, approval 05:00).
  assert.equal(record.linkage_expires_at, "2026-07-05T05:00:00Z")
})

// ─── Untrusted-input rejection ──────────────────────────────────

test("untrusted binding fields on the input are rejected fail-closed", () => {
  for (const field of ["tenant_id", "approver_id", "target_hash", "linkage_hash", "approval_id", "linkage_expires_at"]) {
    const result = createApprovalLinkageRecord(
      validInput({ [field]: "attacker-controlled" }),
      validContext(),
    )
    expectFail(result, "invalid_approval_linkage_input", field)
    if (!result.ok) for (const i of result.issues) assert.ok(!i.message.includes("attacker-controlled"))
  }
})

test("missing linkage id or linked_at fails closed", () => {
  expectFail(createApprovalLinkageRecord({ linked_at: "2026-07-05T02:50:00Z" }, validContext()), "invalid_approval_linkage_input", "missing id")
  expectFail(createApprovalLinkageRecord({ approval_linkage_id: "l" }, validContext()), "invalid_approval_linkage_input", "missing linked_at")
  expectFail(createApprovalLinkageRecord({ approval_linkage_id: "l", linked_at: "not-a-time" }, validContext()), "invalid_approval_linkage_input", "bad linked_at")
})

// ─── Approval record ────────────────────────────────────────────

test("a non-approved Approval Record fails", () => {
  for (const status of ["pending", "rejected", "expired", "used"]) {
    expectFail(construct({}, { approval_record: approvalRow({ status }) }), "approval_linkage_approval_record_mismatch", status === "used" ? "approval_linkage_used" : status)
  }
})

test("a used Approval Record (status or usedAt) fails", () => {
  expectFail(construct({}, { approval_record: approvalRow({ usedAt: "2026-07-05T02:55:00Z" }) }), "approval_linkage_used", "usedAt")
})

test("missing approver and approver mismatch fail", () => {
  expectFail(construct({}, { approval_record: approvalRow({ approvedByUserId: undefined }) }), "approval_linkage_approver_mismatch", "missing approver")
  // Approver identity user id differs from the Approval Record approvedByUserId.
  const hd = humanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev = evidence(hd, envelopeHash)
  const ii = identityInput(hd, ev, { approver_identity: sessionIdentity("someone-else", "approver") })
  expectFail(
    createApprovalLinkageRecord(validInput(), validContext({ human_decision: hd, review_evidence: ev, identity_input: ii })),
    "approval_linkage_approver_mismatch",
    "approver mismatch",
  )
})

// ─── Identity independence ──────────────────────────────────────

test("preview creator mismatch against the canonical creator identity fails", () => {
  expectFail(construct({}, { action_preview: previewRow({ creatorUserId: "different-creator" }) }), "approval_linkage_identity_mismatch", "creator mismatch")
})

test("a self-approval chain (approver == requester) fails identity independence", () => {
  const hd = humanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev = evidence(hd, envelopeHash)
  const ii = identityInput(hd, ev, { approver_identity: sessionIdentity("requester-1", "approver") })
  expectFail(
    createApprovalLinkageRecord(
      validInput(),
      validContext({ human_decision: hd, review_evidence: ev, identity_input: ii, approval_record: approvalRow({ approvedByUserId: "requester-1" }) }),
    ),
    "approval_linkage_identity_mismatch",
    "self-approval",
  )
})

test("a fabricated identity-independence result object cannot pass", () => {
  // The context carries the RAW identity input, never a result. Passing a
  // pre-computed { ok: true } object as identity_input fails structurally.
  expectFail(construct({}, { identity_input: { ok: true, issues: [] } }), "approval_linkage_identity_mismatch", "fabricated II result")
})

// ─── Review evidence ────────────────────────────────────────────

test("a fabricated review-evidence result object cannot pass", () => {
  expectFail(construct({}, { review_evidence: { ok: true, issues: [] } }), "approval_linkage_review_evidence_mismatch", "fabricated RE result")
})

test("review-envelope hash mismatch fails (evidence reviewed a different value)", () => {
  // Build evidence over a DIFFERENT envelope hash than the current chain yields.
  const hd = humanDecision()
  const wrong = envelopeHashFor(hd, { payloadHash: "9".repeat(64) })
  const ev = evidence(hd, wrong.envelopeHash)
  expectFail(
    createApprovalLinkageRecord(validInput(), validContext({ human_decision: hd, review_evidence: ev })),
    "approval_linkage_review_envelope_mismatch",
    "envelope mismatch",
  )
})

// ─── Preview integrity ──────────────────────────────────────────

test("malformed preview JSON fails", () => {
  expectFail(construct({}, { action_preview: previewRow({ targetPreview: "{not json" }) }), "approval_linkage_action_preview_mismatch", "bad target JSON")
  expectFail(construct({}, { action_preview: previewRow({ payloadPreview: "\"a string\"" }) }), "approval_linkage_action_preview_mismatch", "non-object payload JSON")
})

test("recomputed target/payload hash mismatch fails (stale stored hash)", () => {
  expectFail(construct({}, { action_preview: previewRow({ targetHash: "9".repeat(64) }) }), "approval_linkage_target_hash_mismatch", "stale target hash")
  expectFail(construct({}, { action_preview: previewRow({ payloadHash: "9".repeat(64) }) }), "approval_linkage_payload_hash_mismatch", "stale payload hash")
})

test("Approval Record hashes must match the recomputed preview hashes", () => {
  expectFail(construct({}, { approval_record: approvalRow({ targetHash: "9".repeat(64) }) }), "approval_linkage_target_hash_mismatch", "approval target hash")
  expectFail(construct({}, { approval_record: approvalRow({ payloadHash: "9".repeat(64) }) }), "approval_linkage_payload_hash_mismatch", "approval payload hash")
})

// ─── Cross-record binding ───────────────────────────────────────

test("cross-tenant sources fail", () => {
  expectFail(construct({}, { action_preview: previewRow({ tenantId: "tenant-2" }) }), "approval_linkage_tenant_mismatch", "preview tenant")
  expectFail(construct({}, { approval_record: approvalRow({ tenantId: "tenant-2" }) }), "approval_linkage_tenant_mismatch", "approval tenant")
})

test("WorkUnit, ActionPreview, and action-type mismatches fail", () => {
  expectFail(construct({}, { approval_record: approvalRow({ workUnitId: "wu-2" }) }), "approval_linkage_workunit_mismatch", "workunit")
  expectFail(construct({}, { approval_record: approvalRow({ actionPreviewId: "preview-2" }) }), "approval_linkage_action_preview_mismatch", "action preview")
  expectFail(construct({}, { approval_record: approvalRow({ actionType: "gmail_reply" }) }), "approval_linkage_action_type_mismatch", "action type")
})

test("an unsupported preview action type fails", () => {
  expectFail(construct({}, { action_preview: previewRow({ actionType: "internal_task" }) }), "approval_linkage_action_type_mismatch", "internal_task")
})

// ─── Timeline and expiry ────────────────────────────────────────

test("a timeline violation fails (linked_at before review completion)", () => {
  expectFail(construct({ linked_at: "2026-07-05T02:00:00Z" }), "approval_linkage_stale", "linked before review")
})

test("expiry equality fails (evaluated_at == derived linkage expiry)", () => {
  expectFail(construct({}, { evaluated_at: "2026-07-05T05:00:00Z" }), "approval_linkage_expired", "at expiry")
})

// ─── Revoke / consume ───────────────────────────────────────────

test("revoked or consumed sources fail", () => {
  expectFail(construct({}, { revoked_review_evidence_ids: ["rev-1"] }), "approval_linkage_revoked", "revoked RE")
  expectFail(construct({}, { consumed_review_evidence_ids: ["rev-1"] }), "approval_linkage_replayed", "consumed RE")
  expectFail(construct({}, { revoked_approval_ids: ["approval:preview-1"] }), "approval_linkage_revoked", "revoked approval")
  expectFail(construct({}, { consumed_approval_ids: ["approval:preview-1"] }), "approval_linkage_used", "consumed approval")
})

test("malformed revoke/consume collections fail closed", () => {
  expectFail(construct({}, { revoked_approval_ids: "not-an-array" }), "approval_linkage_state_missing", "non-array")
  expectFail(construct({}, { consumed_approval_linkage_ids: [42] }), "approval_linkage_state_missing", "non-string entries")
})

// ─── Purity + snapshot consistency ──────────────────────────────

test("construction never mutates its inputs and is deterministic", () => {
  const input = validInput()
  const ctx = validContext()
  const before = JSON.stringify({ input, ctx })
  const a = createApprovalLinkageRecord(input, ctx)
  const b = createApprovalLinkageRecord(validInput(), validContext())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (!a.ok || !b.ok) return
  assert.equal((a.record as unknown as Record<string, unknown>).linkage_hash, (b.record as unknown as Record<string, unknown>).linkage_hash)
  assert.equal(JSON.stringify({ input, ctx }), before)
})

test("a getter-backed approval record cannot construct one value and store another", () => {
  const ctx = validContext()
  let reads = 0
  const original = ctx.approval_record as Record<string, unknown>
  const plain = { ...original }
  ctx.approval_record = new Proxy(plain, {
    get(t, p) {
      if (p === "approvedByUserId") { reads += 1; return reads === 1 ? "approver-1" : "attacker" }
      return t[p as string]
    },
  })
  const result = createApprovalLinkageRecord(validInput(), ctx)
  assert.equal(reads, 1, "approvedByUserId read at most once")
  assert.equal(result.ok, true)
})

test("a throwing getter / ownKeys trap on a source fails closed without throwing", () => {
  const hostileGet = new Proxy({ id: "x" }, { get() { throw new Error("hostile") } })
  const hostileKeys = new Proxy({}, { ownKeys() { throw new Error("keys") }, getOwnPropertyDescriptor() { throw new Error("d") } })
  for (const hostile of [hostileGet, hostileKeys]) {
    let result: ApprovalLinkageConstructionResult | undefined
    assert.doesNotThrow(() => { result = construct({}, { action_preview: hostile }) })
    assert.ok(result && result.ok === false)
  }
})
