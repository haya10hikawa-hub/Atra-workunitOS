/**
 * P6-FIX-009: isolated tests for the Phase 6 Review Evidence structural
 * validators and validation primitives (Issue #142).
 *
 * Imports ONLY node:test, node:assert/strict, and the reviewEvidence module
 * public surface. No app runtime, no persistence, no ApprovalStore, no
 * network, no child_process, no file mutation, no secrets, no D1, no SQL, no
 * LLM. Validators are exercised over in-memory objects only. Expected literals
 * (issue codes, field names) are hardcoded independently of the production
 * constants so a production regression is detectable here.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  validateReviewAttestation,
  validateFourEyesReviewEvidence,
  compareIsoUtc,
  REVIEW_EVIDENCE_ISSUE_CODES,
} from "../app/lib/phase6/reviewEvidence/index.ts"

const HASH = "a".repeat(64)

function validAttestationShape(): Record<string, unknown> {
  return {
    review_attestation_id: "att-1",
    tenant_id: "tenant-1",
    reviewer_id: "reviewer-alpha",
    source_human_decision_id: "hdr-1",
    source_workunit_id: "wu-1",
    reviewed_payload_hash: HASH,
    reviewed_at: "2026-07-05T01:00:00Z",
  }
}

function validEvidenceShape(): Record<string, unknown> {
  return {
    review_evidence_id: "rev-1",
    tenant_id: "tenant-1",
    source_human_decision_id: "hdr-1",
    source_workunit_id: "wu-1",
    reviewed_payload_hash: HASH,
    first_review_attestation_id: "att-1",
    second_review_attestation_id: "att-2",
    first_reviewer_id: "reviewer-alpha",
    second_reviewer_id: "reviewer-beta",
    first_reviewed_at: "2026-07-05T01:00:00Z",
    second_reviewed_at: "2026-07-05T02:00:00Z",
    review_completed_at: "2026-07-05T02:30:00Z",
    review_expires_at: "2026-07-05T03:30:00Z",
  }
}

function codes(result: { issues: readonly { code: string }[] }): string[] {
  return result.issues.map((i) => i.code)
}

// ─── Attestation structural validation ──────────────────────────

test("valid attestation shape passes with a frozen empty-issue result", () => {
  const result = validateReviewAttestation(validAttestationShape())
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.deepEqual([...result.issues], [])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.issues))
})

test("non-object attestation input fails closed with invalid_input", () => {
  for (const bad of [null, undefined, 42, "x", true, []]) {
    const result = validateReviewAttestation(bad)
    assert.equal(result.ok, false, JSON.stringify(bad))
    assert.equal(result.issues[0]?.code, "invalid_input")
  }
})

test("every attestation field is required and missing/null are distinct", () => {
  const fields = [
    "review_attestation_id",
    "tenant_id",
    "reviewer_id",
    "source_human_decision_id",
    "source_workunit_id",
    "reviewed_payload_hash",
    "reviewed_at",
  ]
  for (const field of fields) {
    const missing = validAttestationShape()
    delete missing[field]
    const missingResult = validateReviewAttestation(missing)
    assert.ok(
      missingResult.issues.some((i) => i.code === "missing_required_field" && i.field === field),
      `${field}: missing`,
    )
    const withNull = { ...validAttestationShape(), [field]: null }
    const nullResult = validateReviewAttestation(withNull)
    assert.ok(
      nullResult.issues.some((i) => i.code === "null_required_field" && i.field === field),
      `${field}: null`,
    )
  }
})

test("malformed attestation identifiers, hash, and timestamp fail with dedicated codes", () => {
  for (const idField of [
    "review_attestation_id",
    "tenant_id",
    "reviewer_id",
    "source_human_decision_id",
    "source_workunit_id",
  ]) {
    const result = validateReviewAttestation({ ...validAttestationShape(), [idField]: "" })
    assert.ok(
      result.issues.some((i) => i.code === "invalid_identifier" && i.field === idField),
      idField,
    )
  }
  for (const badHash of ["", "xyz", "A".repeat(64), "a".repeat(63), "a".repeat(65), 42]) {
    const result = validateReviewAttestation({
      ...validAttestationShape(),
      reviewed_payload_hash: badHash,
    })
    assert.ok(
      result.issues.some(
        (i) => i.code === "invalid_payload_hash" && i.field === "reviewed_payload_hash",
      ),
      JSON.stringify(badHash),
    )
  }
  for (const badTs of ["2026/07/05", "2026-07-05T01:00:00+09:00", "2026-13-01T00:00:00Z", 42]) {
    const result = validateReviewAttestation({ ...validAttestationShape(), reviewed_at: badTs })
    assert.ok(
      result.issues.some((i) => i.code === "invalid_timestamp" && i.field === "reviewed_at"),
      JSON.stringify(badTs),
    )
  }
})

test("unknown and grant-like attestation fields fail closed", () => {
  const unknown = validateReviewAttestation({ ...validAttestationShape(), surprise_field: "x" })
  assert.ok(unknown.issues.some((i) => i.code === "unknown_field" && i.field === "surprise_field"))
  for (const grant of ["approval", "approved", "authorized", "execution_permission"]) {
    const result = validateReviewAttestation({ ...validAttestationShape(), [grant]: true })
    assert.ok(
      result.issues.some((i) => i.code === "forbidden_grant_field_present" && i.field === grant),
      grant,
    )
  }
})

test("attestation validator does not mutate input and reads getters once", () => {
  const input = validAttestationShape()
  const before = JSON.stringify(input)
  validateReviewAttestation(input)
  assert.equal(JSON.stringify(input), before)

  const toctou = validAttestationShape()
  delete toctou.reviewer_id
  let reads = 0
  Object.defineProperty(toctou, "reviewer_id", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return "reviewer-alpha"
    },
  })
  const result = validateReviewAttestation(toctou)
  assert.equal(reads, 1, "reviewer_id read exactly once")
  assert.equal(result.ok, true, JSON.stringify(result.issues))
})

test("attestation validator maps a throwing getter to the exception code", () => {
  const hostile = validAttestationShape()
  Object.defineProperty(hostile, "tenant_id", {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error("boom-should-not-leak")
    },
  })
  const result = validateReviewAttestation(hostile)
  assert.equal(result.ok, false)
  assert.ok(codes(result).includes("review_evidence_validation_exception"))
  for (const i of result.issues) assert.ok(!i.message.includes("boom"))
})

// ─── Evidence structural validation ─────────────────────────────

test("valid evidence shape passes with a frozen empty-issue result", () => {
  const result = validateFourEyesReviewEvidence(validEvidenceShape())
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.deepEqual([...result.issues], [])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.issues))
})

test("identical attestation ids and identical reviewer ids fail with dedicated codes", () => {
  const dupAttestation = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    second_review_attestation_id: "att-1",
  })
  assert.ok(
    dupAttestation.issues.some(
      (i) => i.code === "duplicate_review_attestation" && i.field === "second_review_attestation_id",
    ),
  )
  const dupReviewer = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    second_reviewer_id: "reviewer-alpha",
  })
  assert.ok(
    dupReviewer.issues.some(
      (i) => i.code === "duplicate_reviewer_identity" && i.field === "second_reviewer_id",
    ),
  )
})

test("review timeline violations fail with invalid_review_timeline on the exact field", () => {
  // First review after second.
  const reversed = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    first_reviewed_at: "2026-07-05T02:30:00Z",
    second_reviewed_at: "2026-07-05T01:00:00Z",
    review_completed_at: "2026-07-05T02:30:00Z",
  })
  assert.ok(
    reversed.issues.some(
      (i) => i.code === "invalid_review_timeline" && i.field === "second_reviewed_at",
    ),
  )
  // Equal timestamps with non-deterministic (descending) attestation-id order.
  const tie = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    first_review_attestation_id: "att-9",
    second_review_attestation_id: "att-1",
    first_reviewed_at: "2026-07-05T01:00:00Z",
    second_reviewed_at: "2026-07-05T01:00:00Z",
  })
  assert.ok(
    tie.issues.some(
      (i) => i.code === "invalid_review_timeline" && i.field === "second_review_attestation_id",
    ),
  )
  // Equal timestamps with ascending id order stay valid.
  const tieOk = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    first_reviewed_at: "2026-07-05T01:00:00Z",
    second_reviewed_at: "2026-07-05T01:00:00Z",
  })
  assert.equal(tieOk.ok, true, JSON.stringify(tieOk.issues))
  // Completion before the second review.
  const earlyCompletion = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    review_completed_at: "2026-07-05T01:30:00Z",
  })
  assert.ok(
    earlyCompletion.issues.some(
      (i) => i.code === "invalid_review_timeline" && i.field === "review_completed_at",
    ),
  )
  // Expiry exactly at completion (must be strictly later).
  const expiryAtCompletion = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    review_expires_at: "2026-07-05T02:30:00Z",
  })
  assert.ok(
    expiryAtCompletion.issues.some(
      (i) => i.code === "invalid_review_timeline" && i.field === "review_expires_at",
    ),
  )
  // Expiry before completion.
  const expiryBefore = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    review_expires_at: "2026-07-05T02:00:00Z",
  })
  assert.ok(
    expiryBefore.issues.some(
      (i) => i.code === "invalid_review_timeline" && i.field === "review_expires_at",
    ),
  )
})

test("timeline rules do not cascade when a prerequisite timestamp is invalid", () => {
  const result = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    second_reviewed_at: "not-a-timestamp",
  })
  assert.ok(result.issues.some((i) => i.code === "invalid_timestamp"))
  assert.ok(!codes(result).includes("invalid_review_timeline"))
})

test("evidence validator is deterministic and non-mutating", () => {
  const build = () => ({
    ...validEvidenceShape(),
    second_reviewer_id: "reviewer-alpha",
    review_expires_at: "2026-07-05T02:00:00Z",
  })
  const input = build()
  const before = JSON.stringify(input)
  const first = validateFourEyesReviewEvidence(input)
  const second = validateFourEyesReviewEvidence(build())
  assert.deepEqual(
    first.issues.map((i) => `${i.code}:${i.field}`),
    second.issues.map((i) => `${i.code}:${i.field}`),
  )
  assert.equal(JSON.stringify(input), before)
})

test("issue messages are exactly code:field and never echo supplied values", () => {
  const secret = "SECRET-VALUE-should-not-leak"
  const result = validateFourEyesReviewEvidence({
    ...validEvidenceShape(),
    reviewed_payload_hash: secret,
    tenant_id: "",
  })
  assert.equal(result.ok, false)
  for (const i of result.issues) {
    assert.equal(i.message, `${i.code}:${i.field}`)
    assert.ok(!i.message.includes(secret))
  }
})

// ─── compareIsoUtc ──────────────────────────────────────────────

test("compareIsoUtc handles mixed fractional precision correctly", () => {
  assert.equal(compareIsoUtc("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"), 0)
  assert.equal(compareIsoUtc("2026-01-01T00:00:00.1Z", "2026-01-01T00:00:00.100Z"), 0)
  assert.equal(compareIsoUtc("2026-01-01T00:00:00.2Z", "2026-01-01T00:00:00.15Z"), 1)
  assert.equal(compareIsoUtc("2026-01-01T00:00:00.15Z", "2026-01-01T00:00:00.2Z"), -1)
  assert.equal(compareIsoUtc("2026-01-01T00:00:00Z", "2026-01-01T00:00:00.001Z"), -1)
  assert.equal(compareIsoUtc("2026-01-01T00:00:01Z", "2026-01-01T00:00:00.999Z"), 1)
  assert.equal(compareIsoUtc("2025-12-31T23:59:59Z", "2026-01-01T00:00:00Z"), -1)
})

// ─── Stable issue-code surface ──────────────────────────────────

test("issue codes are the stable exported set (pinned independently)", () => {
  assert.deepEqual(
    [...REVIEW_EVIDENCE_ISSUE_CODES],
    [
      "invalid_input",
      "missing_required_field",
      "null_required_field",
      "invalid_identifier",
      "invalid_payload_hash",
      "invalid_timestamp",
      "unknown_field",
      "forbidden_grant_field_present",
      "client_owned_identity_field",
      "invalid_source_human_decision",
      "invalid_review_attestation",
      "duplicate_review_attestation",
      "duplicate_reviewer_identity",
      "review_tenant_mismatch",
      "review_source_human_decision_mismatch",
      "review_source_workunit_mismatch",
      "review_payload_hash_mismatch",
      "invalid_review_timeline",
      "review_evidence_expired",
      "review_evidence_revoked",
      "review_evidence_replayed",
      "review_evidence_state_missing",
      "review_evidence_validation_exception",
    ],
  )
})
