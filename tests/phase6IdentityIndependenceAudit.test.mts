/**
 * P6-FIX-010: isolated tests for the pure, redacted identity-independence
 * audit projection (Issue #143).
 *
 * The factory accepts only the raw evaluation input — never an externally
 * supplied verification result — and produces the decision internally through
 * verifyIdentityIndependence. Issue codes must pass the canonical
 * CANONICAL_IDENTITY_ISSUE_CODES allowlist before they may be emitted, and no
 * user ID, session ID, email, role, payload, hash, token, or secret may
 * appear anywhere in the event.
 *
 * Imports ONLY node:test, node:assert/strict, the canonicalIdentity /
 * reviewEvidence / identityIndependence / artifacts public surfaces, and —
 * for the read-only source guard — node:fs / node:url to READ (never mutate)
 * the module sources. No app runtime, no audit logger, no persistence, no
 * ApprovalStore, no network, no child_process, no secrets, no D1, no SQL, no
 * LLM. The factory is I/O-free and exercised over in-memory objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  createHumanDecisionRecord,
  type ValidatedHumanDecisionRecord,
} from "../app/lib/phase6/artifacts/index.ts"
import {
  createCanonicalSessionIdentity,
  createCanonicalPreviewCreatorIdentity,
  type CanonicalIdentity,
  type SessionDerivableActorKind,
} from "../app/lib/phase6/canonicalIdentity/index.ts"
import {
  createReviewAttestation,
  createFourEyesReviewEvidence,
  type FourEyesReviewEvidence,
} from "../app/lib/phase6/reviewEvidence/index.ts"
import {
  createIdentityIndependenceAuditEvent,
  sanitizeIdentityIndependenceAuditIssueCodes,
  verifyIdentityIndependence,
  IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS,
  type IdentityIndependenceAuditEvent,
} from "../app/lib/phase6/identityIndependence/index.ts"

const HASH = "a".repeat(64)
const T = "2026-07-05T00:00:00Z"
const OBSERVED_AT = "2026-07-05T00:30:00Z"
const EVALUATED_AT = "2026-07-05T03:00:00Z"

function humanDecision(): ValidatedHumanDecisionRecord {
  const result = createHumanDecisionRecord({
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
  if (!result.ok) throw new Error("fixture Human Decision must construct")
  return result.artifact
}

function sessionIdentityOf(
  userId: string,
  actorKind: SessionDerivableActorKind,
): CanonicalIdentity {
  const result = createCanonicalSessionIdentity(
    {
      userId,
      tenantId: "tenant-1",
      role: "manager",
      email: `${userId}@example.test`,
      isDevSession: false,
      sessionId: `sess-${userId}-${actorKind}`,
      createdAt: "2026-07-04T00:00:00Z",
      expiresAt: "2026-07-06T00:00:00Z",
    },
    { actor_kind: actorKind, expected_tenant_id: "tenant-1", observed_at: OBSERVED_AT },
  )
  if (!result.ok) throw new Error("fixture identity must construct")
  return result.identity
}

function creatorIdentity(): CanonicalIdentity {
  const result = createCanonicalPreviewCreatorIdentity(
    { id: "preview-1", tenantId: "tenant-1", workUnitId: "wu-1", creatorUserId: "creator-1" },
    { expected_tenant_id: "tenant-1", observed_at: OBSERVED_AT },
  )
  if (!result.ok) throw new Error("fixture creator identity must construct")
  return result.identity
}

function buildEvidence(decision: ValidatedHumanDecisionRecord): FourEyesReviewEvidence {
  const first = createReviewAttestation(
    {
      review_attestation_id: "att-1",
      source_workunit_id: "wu-1",
      reviewed_payload_hash: HASH,
      reviewed_at: "2026-07-05T01:00:00Z",
    },
    sessionIdentityOf("reviewer-one", "reviewer"),
    decision,
  )
  const second = createReviewAttestation(
    {
      review_attestation_id: "att-2",
      source_workunit_id: "wu-1",
      reviewed_payload_hash: HASH,
      reviewed_at: "2026-07-05T02:00:00Z",
    },
    sessionIdentityOf("reviewer-two", "reviewer"),
    decision,
  )
  if (!first.ok || !second.ok) throw new Error("fixture attestations must construct")
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
  if (!evidence.ok) throw new Error("fixture evidence must construct")
  return evidence.artifact
}

const DECISION = humanDecision()
const EVIDENCE = buildEvidence(DECISION)

function independentInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    human_decision: DECISION,
    review_evidence: EVIDENCE,
    requester_identity: sessionIdentityOf("requester-1", "requester"),
    creator_identity: creatorIdentity(),
    first_reviewer_identity: sessionIdentityOf("reviewer-one", "reviewer"),
    second_reviewer_identity: sessionIdentityOf("reviewer-two", "reviewer"),
    approver_identity: sessionIdentityOf("approver-1", "approver"),
    expected_tenant_id: "tenant-1",
    expected_human_decision_id: "hdr-1",
    expected_workunit_id: "wu-1",
    expected_action_preview_id: "preview-1",
    evaluated_at: EVALUATED_AT,
    ...overrides,
  }
}

// ─── Internal decision only ─────────────────────────────────────

test("only a real internal verification success produces the verified event", () => {
  const check = verifyIdentityIndependence(independentInput())
  assert.equal(check.ok, true, "fixture must verify")
  const event = createIdentityIndependenceAuditEvent(independentInput())
  assert.equal(event.event_kind, "identity_independence_verified")
  assert.equal(event.ok, true)
  assert.deepEqual([...event.issue_codes], [])
  assert.equal(event.human_decision_id, "hdr-1")
  assert.equal(event.workunit_id, "wu-1")
  assert.equal(event.action_preview_id, "preview-1")
  assert.equal(event.evaluated_at, EVALUATED_AT)
})

test("a fabricated result-like input can never produce a verified event", () => {
  for (const forged of [
    { ok: true, issues: [] },
    { ...independentInput(), verification_result: { ok: true } },
    // A fully-formed fabricated result with an empty canonical issue array:
    // if the factory ever consumed it instead of running the verifier, the
    // sanitizer alone could not force rejection.
    {
      ...independentInput({ approver_identity: sessionIdentityOf("requester-1", "approver") }),
      verification_result: { ok: true, issues: [] },
    },
    { result: { ok: true, issues: [] } },
  ]) {
    const event = createIdentityIndependenceAuditEvent(forged)
    assert.equal(event.ok, false, JSON.stringify(Object.keys(forged)))
    assert.notEqual(event.event_kind, "identity_independence_verified")
  }
})

// ─── Event kinds ────────────────────────────────────────────────

test("every self-approval conflict produces the self_approval_forbidden event kind", () => {
  for (const [key, userId] of [
    ["approver=requester", "requester-1"],
    ["approver=creator", "creator-1"],
    ["approver=first-reviewer", "reviewer-one"],
    ["approver=second-reviewer", "reviewer-two"],
  ] as const) {
    const event = createIdentityIndependenceAuditEvent(
      independentInput({ approver_identity: sessionIdentityOf(userId, "approver") }),
    )
    assert.equal(event.event_kind, "self_approval_forbidden", key)
    assert.equal(event.ok, false, key)
    assert.ok(event.issue_codes.includes("self_approval_forbidden"), key)
  }
})

test("non-conflict identity failures produce the generic rejected event", () => {
  const missing = createIdentityIndependenceAuditEvent(
    independentInput({ approver_identity: undefined }),
  )
  assert.equal(missing.event_kind, "identity_independence_rejected")
  assert.ok(missing.issue_codes.includes("identity_state_missing"))
  const mismatch = createIdentityIndependenceAuditEvent(
    independentInput({ expected_workunit_id: "wu-OTHER" }),
  )
  assert.equal(mismatch.event_kind, "identity_independence_rejected")
  assert.ok(mismatch.issue_codes.includes("identity_evidence_mismatch"))
})

test("event kinds are exactly the three declared kinds", () => {
  assert.deepEqual(
    [...IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS],
    ["identity_independence_verified", "self_approval_forbidden", "identity_independence_rejected"],
  )
})

// ─── Canonical allowlist ────────────────────────────────────────

test("only canonical issue codes are emitted; unknown codes never echo", () => {
  const sanitized = sanitizeIdentityIndependenceAuditIssueCodes([
    { code: "identity_tenant_mismatch", field: "x" },
    { code: "totally_made_up_code", field: "y" },
    { code: "self_approval_forbidden", field: "z" },
    "not-an-object",
    { code: 42 },
  ])
  assert.deepEqual(
    [...sanitized.issue_codes],
    ["identity_tenant_mismatch", "self_approval_forbidden", "identity_validation_exception"],
  )
  assert.equal(sanitized.all_canonical, false)
  assert.ok(!JSON.stringify(sanitized).includes("totally_made_up_code"))
})

test("sanitizer deduplicates in first-occurrence order and freezes output", () => {
  const sanitized = sanitizeIdentityIndependenceAuditIssueCodes([
    { code: "identity_state_missing", field: "a" },
    { code: "identity_state_missing", field: "b" },
    { code: "identity_tenant_mismatch", field: "c" },
  ])
  assert.deepEqual(
    [...sanitized.issue_codes],
    ["identity_state_missing", "identity_tenant_mismatch"],
  )
  assert.equal(sanitized.all_canonical, true)
  assert.ok(Object.isFrozen(sanitized))
  assert.ok(Object.isFrozen(sanitized.issue_codes))
})

// ─── Redaction ──────────────────────────────────────────────────

test("no user ID, session ID, email, role, hash, or secret appears in any event", () => {
  const events: IdentityIndependenceAuditEvent[] = [
    createIdentityIndependenceAuditEvent(independentInput()),
    createIdentityIndependenceAuditEvent(
      independentInput({ approver_identity: sessionIdentityOf("requester-1", "approver") }),
    ),
    createIdentityIndependenceAuditEvent(
      independentInput({ first_reviewer_identity: sessionIdentityOf("reviewer-999", "reviewer") }),
    ),
    createIdentityIndependenceAuditEvent(null),
  ]
  for (const event of events) {
    const serialized = JSON.stringify(event)
    for (const secret of [
      "requester-1",
      "creator-1",
      "reviewer-one",
      "reviewer-two",
      "reviewer-999",
      "approver-1",
      "sess-",
      "@example.test",
      "manager",
      "owner",
      HASH,
      "token",
      "secret",
    ]) {
      assert.ok(!serialized.includes(secret), `event must not contain: ${secret}`)
    }
    // Exactly the declared event fields — nothing extra can smuggle identity.
    assert.deepEqual(Object.keys(event as unknown as Record<string, unknown>).sort(), [
      "action_preview_id",
      "evaluated_at",
      "event_kind",
      "human_decision_id",
      "issue_codes",
      "ok",
      "workunit_id",
    ])
  }
})

test("oversized or malformed identifiers project as the invalid placeholder", () => {
  const event = createIdentityIndependenceAuditEvent(
    independentInput({
      expected_human_decision_id: "x".repeat(300),
      expected_workunit_id: 42,
      evaluated_at: "not-a-time",
    }),
  )
  assert.equal(event.human_decision_id, "(invalid)")
  assert.equal(event.workunit_id, "(invalid)")
  assert.equal(event.evaluated_at, "(invalid)")
  assert.ok(!JSON.stringify(event).includes("x".repeat(300)))
})

// ─── Totality and freezing ──────────────────────────────────────

test("malformed input never throws and produces a rejected, redacted event", () => {
  for (const bad of [null, undefined, 42, "input", [], () => {}, Symbol("x")]) {
    const event = createIdentityIndependenceAuditEvent(bad)
    assert.equal(event.ok, false, String(typeof bad))
    assert.equal(event.event_kind, "identity_independence_rejected")
    assert.equal(event.human_decision_id, "(invalid)")
    assert.equal(event.workunit_id, "(invalid)")
    assert.equal(event.action_preview_id, "(invalid)")
  }
  // A hostile getter-throwing object is also absorbed.
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("hostile getter")
      },
      ownKeys() {
        throw new Error("hostile keys")
      },
    },
  )
  const event = createIdentityIndependenceAuditEvent(hostile)
  assert.equal(event.ok, false)
  assert.deepEqual([...event.issue_codes], ["identity_validation_exception"])
})

test("the event and its issue-code array are frozen and deterministic", () => {
  const a = createIdentityIndependenceAuditEvent(independentInput())
  const b = createIdentityIndependenceAuditEvent(independentInput())
  assert.ok(Object.isFrozen(a))
  assert.ok(Object.isFrozen(a.issue_codes))
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)))
})

test("the factory never mutates its input", () => {
  const input = independentInput()
  const before = JSON.stringify(input)
  createIdentityIndependenceAuditEvent(input)
  assert.equal(JSON.stringify(input), before)
})

// ─── Source guard (read-only) ───────────────────────────────────

test("source guard: the audit factory never calls the runtime audit logger", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../app/lib/phase6/identityIndependence/audit.ts", import.meta.url)),
    "utf8",
  )
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
  for (const forbidden of [
    "writeAuditLog",
    "recordAuditEvent",
    "auditPersistence",
    "auditLog.ts",
  ]) {
    assert.ok(!code.includes(forbidden), `audit.ts must not reference ${forbidden}`)
  }
  assert.ok(
    code.includes("CANONICAL_IDENTITY_ISSUE_CODES"),
    "the canonical allowlist gates the audit issue codes",
  )
})
