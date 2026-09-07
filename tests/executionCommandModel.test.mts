import test from "node:test"
import assert from "node:assert/strict"
import {
  buildExecutionCommandEnvelope,
  approvalIdUnavailableReason,
  type ExecutionCommandInput,
} from "../app/lib/application/dashboard/executionCommandModel.ts"

// ─── Fixtures ───────────────────────────────────────────────────

function baseInput(overrides: Partial<ExecutionCommandInput> = {}): ExecutionCommandInput {
  return {
    workUnitId: "wu:1",
    previewRefs: [{ actionId: "action:1", previewId: "preview:1" }],
    requestedActionType: "slack_reply",
    approvalId: "approval:1",
    ...overrides,
  }
}

// ─── Blocked mode ──────────────────────────────────────────────

test("envelope is always blocked in current phase", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput())
  assert.equal(envelope.mode, "blocked")
})

test("envelope includes workUnitId", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput())
  assert.equal(envelope.workUnitId, "wu:1")
})

test("envelope includes safe previewRefs only", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    previewRefs: [
      { actionId: "a1", previewId: "p1" },
      { actionId: "a2", previewId: "p2" },
    ],
  }))
  assert.equal(envelope.previewRefs.length, 2)
  assert.equal(envelope.previewRefs[0].actionId, "a1")
  assert.equal(envelope.previewRefs[0].previewId, "p1")
  // Only actionId and previewId are present
  const keys = Object.keys(envelope.previewRefs[0]).sort()
  assert.deepEqual(keys, ["actionId", "previewId"])
})

test("envelope includes requestedActionType", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    requestedActionType: "github_issue",
  }))
  assert.equal(envelope.requestedActionType, "github_issue")
})

test("envelope handles null requestedActionType", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    requestedActionType: null,
  }))
  assert.equal(envelope.requestedActionType, null)
})

test("envelope includes approvalId when available", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    approvalId: "approval:xyz",
  }))
  assert.equal(envelope.approvalId, "approval:xyz")
  assert.equal(envelope.approvalIdAvailable, true)
})

test("envelope handles null approvalId", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    approvalId: null,
  }))
  assert.equal(envelope.approvalId, null)
  assert.equal(envelope.approvalIdAvailable, false)
})

test("envelope blocked reason mentions approval ID unavailable when null", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    approvalId: null,
  }))
  assert.equal(envelope.blockedReason?.includes("unavailable"), true)
})

// ─── Forbidden fields ──────────────────────────────────────────

test("envelope has no forbidden fields", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput())
  const flat = JSON.stringify(envelope)
  assert.equal(flat.includes("targetHash"), false)
  assert.equal(flat.includes("payloadHash"), false)
  assert.equal(flat.includes("tenantId"), false)
  assert.equal(flat.includes("actorUserId"), false)
  assert.equal(flat.includes("approvedByUserId"), false)
  assert.equal(flat.includes("role"), false)
  assert.equal(flat.includes('"status"'), false)
  assert.equal(flat.includes("usedAt"), false)
  assert.equal(flat.includes("token"), false)
  assert.equal(flat.includes("secret"), false)
  assert.equal(flat.includes("rawPayload"), false)
  assert.equal(flat.includes("rawBody"), false)
})

test("envelope only has expected top-level fields", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput())
  const keys = Object.keys(envelope).sort()
  assert.deepEqual(keys, [
    "approvalId",
    "approvalIdAvailable",
    "blockedReason",
    "mode",
    "previewRefs",
    "requestedActionType",
    "workUnitId",
  ])
})

// ─── approvalId is not fabricated ──────────────────────────────

test("approvalId is null when not provided (not fabricated)", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    approvalId: undefined,
  }))
  assert.equal(envelope.approvalId, null)
  assert.equal(envelope.approvalIdAvailable, false)
})

// ─── approvalIdUnavailableReason ───────────────────────────────

test("approvalIdUnavailableReason returns correct constant", () => {
  assert.equal(approvalIdUnavailableReason(), "approval_id_unavailable")
})

// ─── Empty preview refs ────────────────────────────────────────

test("envelope handles empty previewRefs", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    previewRefs: [],
  }))
  assert.equal(envelope.previewRefs.length, 0)
  assert.equal(envelope.mode, "blocked")
})

// ─── Display-safe subset (for UI binding) ─────────────────────

test("envelope does not expose approvalId when not provided", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    approvalId: null,
  }))
  assert.equal(envelope.approvalId, null)
  assert.equal(envelope.approvalIdAvailable, false)
})

test("previewRefs reduced to safe actionId + previewId only — no extra keys", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({
    previewRefs: [{ actionId: "a1", previewId: "p1" }],
  }))
  const ref = envelope.previewRefs[0]
  const keys = Object.keys(ref).sort()
  assert.deepEqual(keys, ["actionId", "previewId"])
  // Count is correctly derivable
  assert.equal(envelope.previewRefs.length, 1)
})

test("blockedReason is always non-null string when blocked", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({ approvalId: "ap:1" }))
  const blockedReason = envelope.blockedReason
  assert.ok(typeof blockedReason === "string")
  assert.ok(blockedReason.length > 0)
})

test("blockedReason mentions unavailability when approvalId is null", () => {
  const envelope = buildExecutionCommandEnvelope(baseInput({ approvalId: null }))
  assert.equal(envelope.blockedReason?.includes("unavailable"), true)
})
