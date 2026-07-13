/**
 * P6-FIX-009: isolated tests for the pure Four-Eyes Review Evidence verifier
 * (Issue #142).
 *
 * Imports ONLY node:test, node:assert/strict, the reviewEvidence public
 * surface, and the artifacts public surface (to construct the source Human
 * Decision). No app runtime, no persistence, no ApprovalStore, no network, no
 * child_process, no secrets, no D1, no SQL, no LLM. The verifier is exercised
 * over in-memory objects only; `evaluated_at` is always supplied — no clock is
 * read anywhere.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { createHumanDecisionRecord } from "../app/lib/phase6/artifacts/index.ts"
import {
  createReviewAttestation,
  createFourEyesReviewEvidence,
  verifyFourEyesReviewEvidence,
  type FourEyesReviewEvidence,
} from "../app/lib/phase6/reviewEvidence/index.ts"

const HASH = "a".repeat(64)
const T = "2026-07-05T00:00:00Z"

function buildEvidence(): FourEyesReviewEvidence {
  const decisionResult = createHumanDecisionRecord({
    human_decision_id: "hdr-1",
    tenant_id: "tenant-1",
    decision_status: "ready_for_future_gate_review",
    decision_outcome: "pass",
    human_reviewer_id: "user-1",
    human_reviewer_role: "pm",
    reviewer_context: "weekly triage review",
    source_evidence_review_record_id: "err-1",
    source_llm_judgment_record_id: "ljr-1",
    source_query_result_record_id: "qrr-1",
    source_rule_review_record_id: "rrr-1",
    source_compiled_sql_artifact_id: "csa-1",
    source_safe_query_plan_id: "sqp-1",
    source_query_intent_id: "qi-1",
    evidence_accepted: true,
    evidence_claim: "there are 12 open workunits",
    evidence_type: "count_result supports",
    llm_judgment_id: "ljr-1",
    judgment_summary: "the open workunit count appears stable",
    uncertainty_state: "low_uncertainty",
    human_decision_summary: "accept the count as evidence for priority review",
    human_decision_rationale: "matches board state; no conflicting source",
    decision_impact_scope: "evidence_acceptance",
    allowed_use: ["priority_assessment input"],
    disallowed_use: ["action authorization", "promotion"],
    future_gate_requirements: ["approval gate", "promotion gate"],
    approval_required: true,
    promotion_required: false,
    execution_required: false,
    four_eyes_required: true,
    self_approval_blocked: true,
    reviewed_by_human_at: T,
    no_go_flags: [],
  })
  assert.equal(decisionResult.ok, true)
  if (!decisionResult.ok) throw new Error("unreachable")
  const decision = decisionResult.artifact

  const first = createReviewAttestation(
    {
      review_attestation_id: "att-1",
      source_workunit_id: "wu-1",
      reviewed_payload_hash: HASH,
      reviewed_at: "2026-07-05T01:00:00Z",
    },
    { tenant_id: "tenant-1", reviewer_id: "reviewer-alpha" },
    decision,
  )
  const second = createReviewAttestation(
    {
      review_attestation_id: "att-2",
      source_workunit_id: "wu-1",
      reviewed_payload_hash: HASH,
      reviewed_at: "2026-07-05T02:00:00Z",
    },
    { tenant_id: "tenant-1", reviewer_id: "reviewer-beta" },
    decision,
  )
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  if (!first.ok || !second.ok) throw new Error("unreachable")

  const evidence = createFourEyesReviewEvidence(
    {
      review_evidence_id: "rev-1",
      review_completed_at: "2026-07-05T02:30:00Z",
      review_expires_at: "2026-07-05T03:30:00Z",
    },
    first.artifact,
    second.artifact,
    decision,
  )
  assert.equal(evidence.ok, true, JSON.stringify(evidence.ok ? [] : evidence.issues))
  if (!evidence.ok) throw new Error("unreachable")
  return evidence.artifact
}

function matchingContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: "tenant-1",
    human_decision_id: "hdr-1",
    workunit_id: "wu-1",
    current_payload_hash: HASH,
    evaluated_at: "2026-07-05T03:00:00Z",
    revoked_review_evidence_ids: [],
    consumed_review_evidence_ids: [],
    ...overrides,
  }
}

function issueCodes(result: { issues: readonly { code: string }[] }): string[] {
  return result.issues.map((i) => i.code)
}

const EVIDENCE = buildEvidence()

// ─── Happy path ─────────────────────────────────────────────────

test("current matching evidence verifies with a frozen empty-issue result", () => {
  const result = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext())
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.deepEqual([...result.issues], [])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.issues))
})

test("verification success is explicitly non-authorizing", () => {
  const result = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext()) as unknown as Record<
    string,
    unknown
  >
  assert.deepEqual(Object.keys(result).sort(), ["issues", "ok"])
  for (const key of [
    "approval",
    "approved",
    "authorized",
    "authorization",
    "execution_permission",
    "execution_token",
    "executed",
    "persisted",
    "promoted",
    "production_ready",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(result, key), false, key)
  }
})

// ─── Binding mismatches ─────────────────────────────────────────

test("each current-context binding mismatch fails on its exact field", () => {
  const cases: readonly [Record<string, unknown>, string, string][] = [
    [{ tenant_id: "tenant-OTHER" }, "review_tenant_mismatch", "tenant_id"],
    [
      { human_decision_id: "hdr-OTHER" },
      "review_source_human_decision_mismatch",
      "source_human_decision_id",
    ],
    [{ workunit_id: "wu-OTHER" }, "review_source_workunit_mismatch", "source_workunit_id"],
    [
      { current_payload_hash: "b".repeat(64) },
      "review_payload_hash_mismatch",
      "reviewed_payload_hash",
    ],
  ]
  for (const [override, code, field] of cases) {
    const result = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext(override))
    assert.equal(result.ok, false, JSON.stringify(override))
    const dedicated = result.issues.filter((i) => i.code === code && i.field === field)
    assert.equal(dedicated.length, 1, `${code}:${field}`)
    assert.equal(result.issues.length, 1, `${code}: exactly one issue`)
    assert.equal(dedicated[0].message, `${code}:${field}`)
  }
})

test("a changed payload hash invalidates prior evidence without mutating it", () => {
  const before = JSON.stringify(EVIDENCE)
  const result = verifyFourEyesReviewEvidence(
    EVIDENCE,
    matchingContext({ current_payload_hash: "c".repeat(64) }),
  )
  assert.equal(result.ok, false)
  assert.ok(issueCodes(result).includes("review_payload_hash_mismatch"))
  assert.equal(JSON.stringify(EVIDENCE), before, "historical evidence is untouched")
  assert.ok(Object.isFrozen(EVIDENCE))
})

// ─── Expiry boundary ────────────────────────────────────────────

test("expiry boundary: before passes, exactly-at fails, after fails", () => {
  const beforeExpiry = verifyFourEyesReviewEvidence(
    EVIDENCE,
    matchingContext({ evaluated_at: "2026-07-05T03:29:59Z" }),
  )
  assert.equal(beforeExpiry.ok, true, JSON.stringify(beforeExpiry.issues))

  const atExpiry = verifyFourEyesReviewEvidence(
    EVIDENCE,
    matchingContext({ evaluated_at: "2026-07-05T03:30:00Z" }),
  )
  assert.equal(atExpiry.ok, false, "evaluation exactly at expiry must fail")
  assert.deepEqual(issueCodes(atExpiry), ["review_evidence_expired"])

  const afterExpiry = verifyFourEyesReviewEvidence(
    EVIDENCE,
    matchingContext({ evaluated_at: "2026-07-06T00:00:00Z" }),
  )
  assert.equal(afterExpiry.ok, false)
  assert.deepEqual(issueCodes(afterExpiry), ["review_evidence_expired"])
})

// ─── Revocation and replay ──────────────────────────────────────

test("revoked evidence fails closed", () => {
  const result = verifyFourEyesReviewEvidence(
    EVIDENCE,
    matchingContext({ revoked_review_evidence_ids: ["rev-1"] }),
  )
  assert.equal(result.ok, false)
  assert.deepEqual(issueCodes(result), ["review_evidence_revoked"])
})

test("consumed (replayed) evidence fails closed", () => {
  const result = verifyFourEyesReviewEvidence(
    EVIDENCE,
    matchingContext({ consumed_review_evidence_ids: ["rev-1"] }),
  )
  assert.equal(result.ok, false)
  assert.deepEqual(issueCodes(result), ["review_evidence_replayed"])
})

test("revoked and consumed together report both, in deterministic order", () => {
  const result = verifyFourEyesReviewEvidence(
    EVIDENCE,
    matchingContext({
      revoked_review_evidence_ids: ["rev-1"],
      consumed_review_evidence_ids: ["rev-1"],
    }),
  )
  assert.equal(result.ok, false)
  assert.deepEqual(issueCodes(result), ["review_evidence_revoked", "review_evidence_replayed"])
})

// ─── Missing / malformed state fails closed ─────────────────────

test("missing or malformed context fails closed with review_evidence_state_missing", () => {
  for (const [override, field] of [
    [{ tenant_id: undefined }, "(context).tenant_id"],
    [{ human_decision_id: "" }, "(context).human_decision_id"],
    [{ workunit_id: 42 }, "(context).workunit_id"],
    [{ current_payload_hash: undefined }, "(context).current_payload_hash"],
    [{ current_payload_hash: "not-a-hash" }, "(context).current_payload_hash"],
    [{ evaluated_at: "2026/07/05" }, "(context).evaluated_at"],
    [{ revoked_review_evidence_ids: "rev-1" }, "(context).revoked_review_evidence_ids"],
    [{ revoked_review_evidence_ids: ["rev-1", 42] }, "(context).revoked_review_evidence_ids"],
    [{ consumed_review_evidence_ids: null }, "(context).consumed_review_evidence_ids"],
  ] as const) {
    const result = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext(override))
    assert.equal(result.ok, false, JSON.stringify(override))
    assert.ok(
      result.issues.some(
        (i) => i.code === "review_evidence_state_missing" && i.field === field,
      ),
      `${field}: ${JSON.stringify(result.issues)}`,
    )
  }
  const nonObject = verifyFourEyesReviewEvidence(EVIDENCE, null)
  assert.equal(nonObject.ok, false)
  assert.deepEqual(issueCodes(nonObject), ["review_evidence_state_missing"])
})

test("structurally invalid evidence fails closed before any binding comparison", () => {
  for (const bad of [null, 42, "evidence", [], {}, { review_evidence_id: "rev-1" }]) {
    const result = verifyFourEyesReviewEvidence(bad, matchingContext())
    assert.equal(result.ok, false, JSON.stringify(bad))
    assert.ok(result.issues.length > 0)
  }
})

// ─── Determinism, immutability, single-read ─────────────────────

test("verification is deterministic and issue order is stable", () => {
  const context = matchingContext({
    tenant_id: "tenant-OTHER",
    current_payload_hash: "b".repeat(64),
    evaluated_at: "2026-07-06T00:00:00Z",
    revoked_review_evidence_ids: ["rev-1"],
    consumed_review_evidence_ids: ["rev-1"],
  })
  const first = verifyFourEyesReviewEvidence(EVIDENCE, context)
  const second = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext({
    tenant_id: "tenant-OTHER",
    current_payload_hash: "b".repeat(64),
    evaluated_at: "2026-07-06T00:00:00Z",
    revoked_review_evidence_ids: ["rev-1"],
    consumed_review_evidence_ids: ["rev-1"],
  }))
  assert.deepEqual(issueCodes(first), issueCodes(second))
  assert.deepEqual(issueCodes(first), [
    "review_tenant_mismatch",
    "review_payload_hash_mismatch",
    "review_evidence_expired",
    "review_evidence_revoked",
    "review_evidence_replayed",
  ])
})

test("the issues array is a frozen defensive copy, detached from later state changes", () => {
  const revoked: string[] = ["rev-1"]
  const context = matchingContext({ revoked_review_evidence_ids: revoked })
  const result = verifyFourEyesReviewEvidence(EVIDENCE, context)
  assert.equal(result.ok, false)
  assert.ok(Object.isFrozen(result.issues))
  const codesBefore = issueCodes(result)
  // Later mutation of the caller's revocation array cannot change the result.
  revoked.length = 0
  assert.deepEqual(issueCodes(result), codesBefore)
})

test("verifier does not mutate evidence or context and reads context getters once", () => {
  const context = matchingContext()
  const beforeContext = JSON.stringify(context)
  verifyFourEyesReviewEvidence(EVIDENCE, context)
  assert.equal(JSON.stringify(context), beforeContext)

  const toctou = matchingContext()
  delete toctou.tenant_id
  let reads = 0
  Object.defineProperty(toctou, "tenant_id", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return "tenant-1"
    },
  })
  const result = verifyFourEyesReviewEvidence(EVIDENCE, toctou)
  assert.equal(reads, 1, "context tenant_id read exactly once")
  assert.equal(result.ok, true)
})
