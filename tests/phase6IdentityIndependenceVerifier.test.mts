/**
 * P6-FIX-010: isolated tests for the pure Phase 6 identity-independence
 * verifier (Issue #143).
 *
 * Imports ONLY node:test, node:assert/strict, and the canonicalIdentity /
 * reviewEvidence / identityIndependence / artifacts public surfaces. No app
 * runtime, no persistence, no ApprovalStore, no network, no child_process,
 * no secrets, no D1, no SQL, no LLM. The verifier is exercised over
 * in-memory objects only; `evaluated_at` is always supplied — no clock is
 * read anywhere.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
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
  verifyIdentityIndependence,
  type IdentityIndependenceResult,
} from "../app/lib/phase6/identityIndependence/index.ts"

const HASH = "a".repeat(64)
const T = "2026-07-05T00:00:00Z"
const OBSERVED_AT = "2026-07-05T00:30:00Z"
const EVALUATED_AT = "2026-07-05T03:00:00Z"

// ─── Fixtures ───────────────────────────────────────────────────

function humanDecision(overrides: Record<string, unknown> = {}): ValidatedHumanDecisionRecord {
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
    ...overrides,
  })
  if (!result.ok) throw new Error("fixture Human Decision must construct")
  return result.artifact
}

function sessionIdentityOf(
  userId: string,
  actorKind: SessionDerivableActorKind,
  overrides: Record<string, unknown> = {},
  expectedTenantId = "tenant-1",
): CanonicalIdentity {
  const result = createCanonicalSessionIdentity(
    {
      userId,
      tenantId: expectedTenantId,
      role: "manager",
      email: `${userId}@example.test`,
      isDevSession: false,
      sessionId: `sess-${userId}-${actorKind}`,
      createdAt: "2026-07-04T00:00:00Z",
      expiresAt: "2026-07-06T00:00:00Z",
      ...overrides,
    },
    { actor_kind: actorKind, expected_tenant_id: expectedTenantId, observed_at: OBSERVED_AT },
  )
  if (!result.ok) {
    throw new Error(`fixture identity must construct: ${JSON.stringify(result.issues)}`)
  }
  return result.identity
}

function creatorIdentityOf(
  creatorUserId = "creator-1",
  tenantId = "tenant-1",
  previewId = "preview-1",
): CanonicalIdentity {
  const result = createCanonicalPreviewCreatorIdentity(
    { id: previewId, tenantId, workUnitId: "wu-1", creatorUserId },
    { expected_tenant_id: tenantId, observed_at: OBSERVED_AT },
  )
  if (!result.ok) {
    throw new Error(`fixture creator identity must construct: ${JSON.stringify(result.issues)}`)
  }
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
    creator_identity: creatorIdentityOf(),
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

function expectCode(
  result: IdentityIndependenceResult,
  code: string,
  fieldIncludes: string,
  label: string,
): void {
  assert.equal(result.ok, false, label)
  assert.ok(
    result.issues.some((i) => i.code === code && i.field.includes(fieldIncludes)),
    `${label}: expected ${code} on ${fieldIncludes}; got ${JSON.stringify(result.issues)}`,
  )
}

// ─── Independent identities pass ────────────────────────────────

test("fully independent identities from trusted sources pass", () => {
  const result = verifyIdentityIndependence(independentInput())
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.deepEqual([...result.issues], [])
})

test("the result carries only { ok, issues } and is frozen with frozen issues", () => {
  for (const input of [independentInput(), independentInput({ approver_identity: undefined })]) {
    const result = verifyIdentityIndependence(input)
    assert.deepEqual(Object.keys(result as unknown as Record<string, unknown>).sort(), [
      "issues",
      "ok",
    ])
    assert.ok(Object.isFrozen(result))
    assert.ok(Object.isFrozen(result.issues))
  }
})

// ─── Self-approval comparisons (canonical user, never role) ─────

test("requester equal to approver fails with self_approval_forbidden", () => {
  const result = verifyIdentityIndependence(
    independentInput({ approver_identity: sessionIdentityOf("requester-1", "approver") }),
  )
  expectCode(result, "self_approval_forbidden", "(requester_identity)", "requester=approver")
})

test("creator equal to approver fails with self_approval_forbidden", () => {
  const result = verifyIdentityIndependence(
    independentInput({ approver_identity: sessionIdentityOf("creator-1", "approver") }),
  )
  expectCode(result, "self_approval_forbidden", "(creator_identity)", "creator=approver")
})

test("first reviewer equal to approver fails with self_approval_forbidden", () => {
  const result = verifyIdentityIndependence(
    independentInput({ approver_identity: sessionIdentityOf("reviewer-one", "approver") }),
  )
  expectCode(result, "self_approval_forbidden", "(first_reviewer_identity)", "reviewer1=approver")
})

test("second reviewer equal to approver fails with self_approval_forbidden", () => {
  const result = verifyIdentityIndependence(
    independentInput({ approver_identity: sessionIdentityOf("reviewer-two", "approver") }),
  )
  expectCode(result, "self_approval_forbidden", "(second_reviewer_identity)", "reviewer2=approver")
})

test("first reviewer equal to second reviewer fails with duplicate_reviewer_identity", () => {
  const result = verifyIdentityIndependence(
    independentInput({ second_reviewer_identity: sessionIdentityOf("reviewer-one", "reviewer") }),
  )
  expectCode(
    result,
    "duplicate_reviewer_identity",
    "(second_reviewer_identity)",
    "reviewer1=reviewer2",
  )
})

test("the same user under a different role and session still fails (role is not identity)", () => {
  // Same canonical user "requester-1", different role, different session ID.
  const differentRole = sessionIdentityOf("requester-1", "approver", {
    role: "owner",
    sessionId: "sess-completely-different",
    email: "other-alias@example.test",
  })
  const result = verifyIdentityIndependence(
    independentInput({ approver_identity: differentRole }),
  )
  expectCode(result, "self_approval_forbidden", "(requester_identity)", "role difference")
})

test("issue fields name the conflicting position and never echo the user ID", () => {
  const result = verifyIdentityIndependence(
    independentInput({ approver_identity: sessionIdentityOf("requester-1", "approver") }),
  )
  assert.equal(result.ok, false)
  const serialized = JSON.stringify(result.issues)
  assert.ok(!serialized.includes("requester-1"), "user ID never appears in issues")
})

// ─── Missing identities ─────────────────────────────────────────

test("every missing required identity fails closed", () => {
  for (const key of [
    "requester_identity",
    "creator_identity",
    "first_reviewer_identity",
    "second_reviewer_identity",
    "approver_identity",
  ]) {
    const result = verifyIdentityIndependence(independentInput({ [key]: undefined }))
    expectCode(result, "identity_state_missing", `(${key})`, key)
  }
})

// ─── Tenant / kind / source / provenance ────────────────────────

test("a cross-tenant identity in any position fails closed", () => {
  for (const [key, identity] of [
    ["requester_identity", sessionIdentityOf("requester-1", "requester", {}, "tenant-OTHER")],
    ["creator_identity", creatorIdentityOf("creator-1", "tenant-OTHER")],
    ["first_reviewer_identity", sessionIdentityOf("reviewer-one", "reviewer", {}, "tenant-OTHER")],
    ["second_reviewer_identity", sessionIdentityOf("reviewer-two", "reviewer", {}, "tenant-OTHER")],
    ["approver_identity", sessionIdentityOf("approver-1", "approver", {}, "tenant-OTHER")],
  ] as const) {
    const result = verifyIdentityIndependence(independentInput({ [key]: identity }))
    expectCode(result, "identity_tenant_mismatch", `(${key}).tenant_id`, key)
  }
})

test("an actor kind that does not match its position fails closed", () => {
  const result = verifyIdentityIndependence(
    independentInput({ requester_identity: sessionIdentityOf("requester-1", "approver") }),
  )
  expectCode(result, "identity_actor_kind_mismatch", "(requester_identity).actor_kind", "kind")
})

test("an identity source that does not match its position fails closed", () => {
  // A session-derived identity in the creator position: wrong kind AND wrong
  // source — the stored-preview provenance cannot be replaced by a session.
  const sessionAsCreator = verifyIdentityIndependence(
    independentInput({ creator_identity: sessionIdentityOf("creator-1", "requester") }),
  )
  expectCode(
    sessionAsCreator,
    "identity_source_untrusted",
    "(creator_identity).identity_source",
    "session as creator",
  )
  // A stored-preview creator identity in a reviewer position: wrong source.
  const creatorAsReviewer = verifyIdentityIndependence(
    independentInput({ first_reviewer_identity: creatorIdentityOf("reviewer-one") }),
  )
  expectCode(
    creatorAsReviewer,
    "identity_source_untrusted",
    "(first_reviewer_identity).identity_source",
    "creator as reviewer",
  )
})

test("a forged untrusted identity source fails structural validation", () => {
  const forged = {
    tenant_id: "tenant-1",
    user_id: "approver-1",
    actor_kind: "approver",
    identity_source: "client_supplied",
    source_record_id: "sess-x",
    observed_at: OBSERVED_AT,
    subject_type: "human_user",
  }
  const result = verifyIdentityIndependence(independentInput({ approver_identity: forged }))
  expectCode(
    result,
    "identity_source_untrusted",
    "(approver_identity).identity_source",
    "forged source",
  )
})

// ─── Evidence and record binding ────────────────────────────────

test("reviewer identities must match the reviewer IDs in the Review Evidence", () => {
  const result = verifyIdentityIndependence(
    independentInput({ first_reviewer_identity: sessionIdentityOf("reviewer-999", "reviewer") }),
  )
  expectCode(
    result,
    "identity_evidence_mismatch",
    "(review_evidence).first_reviewer_id",
    "first reviewer mismatch",
  )
  const second = verifyIdentityIndependence(
    independentInput({ second_reviewer_identity: sessionIdentityOf("reviewer-999", "reviewer") }),
  )
  expectCode(
    second,
    "identity_evidence_mismatch",
    "(review_evidence).second_reviewer_id",
    "second reviewer mismatch",
  )
})

test("Human Decision, WorkUnit, and ActionPreview binding mismatches fail closed", () => {
  const decisionMismatch = verifyIdentityIndependence(
    independentInput({ expected_human_decision_id: "hdr-OTHER" }),
  )
  expectCode(
    decisionMismatch,
    "identity_evidence_mismatch",
    "(human_decision).human_decision_id",
    "decision id",
  )
  expectCode(
    decisionMismatch,
    "identity_evidence_mismatch",
    "(review_evidence).source_human_decision_id",
    "evidence decision id",
  )
  const workunitMismatch = verifyIdentityIndependence(
    independentInput({ expected_workunit_id: "wu-OTHER" }),
  )
  expectCode(
    workunitMismatch,
    "identity_evidence_mismatch",
    "(review_evidence).source_workunit_id",
    "workunit id",
  )
  const previewMismatch = verifyIdentityIndependence(
    independentInput({ expected_action_preview_id: "preview-OTHER" }),
  )
  expectCode(
    previewMismatch,
    "identity_evidence_mismatch",
    "(creator_identity).source_record_id",
    "action preview id",
  )
})

test("a different Human Decision artifact than expected fails closed", () => {
  const otherDecision = humanDecision({ human_decision_id: "hdr-2" })
  const result = verifyIdentityIndependence(independentInput({ human_decision: otherDecision }))
  expectCode(
    result,
    "identity_evidence_mismatch",
    "(human_decision).human_decision_id",
    "other decision",
  )
})

test("cross-tenant Human Decision and Review Evidence fail closed", () => {
  const result = verifyIdentityIndependence(
    independentInput({
      expected_tenant_id: "tenant-2",
      // Identities from tenant-2 so only the artifact tenants mismatch.
      requester_identity: sessionIdentityOf("requester-1", "requester", {}, "tenant-2"),
      creator_identity: creatorIdentityOf("creator-1", "tenant-2"),
      first_reviewer_identity: sessionIdentityOf("reviewer-one", "reviewer", {}, "tenant-2"),
      second_reviewer_identity: sessionIdentityOf("reviewer-two", "reviewer", {}, "tenant-2"),
      approver_identity: sessionIdentityOf("approver-1", "approver", {}, "tenant-2"),
    }),
  )
  expectCode(result, "identity_tenant_mismatch", "(human_decision).tenant_id", "decision tenant")
  expectCode(result, "identity_tenant_mismatch", "(review_evidence).tenant_id", "evidence tenant")
})

// ─── Service accounts and delegation ────────────────────────────

test("service-account reviewer or approver identities fail closed", () => {
  const serviceMarked = {
    tenant_id: "tenant-1",
    user_id: "svc-bot",
    actor_kind: "approver",
    identity_source: "authenticated_session",
    source_record_id: "sess-svc",
    observed_at: OBSERVED_AT,
    subject_type: "human_user",
    is_service_account: true,
  }
  const result = verifyIdentityIndependence(
    independentInput({ approver_identity: serviceMarked }),
  )
  expectCode(result, "identity_subject_unsupported", "(approver_identity)", "service approver")
  const nonHuman = {
    ...serviceMarked,
    subject_type: "service_account",
  }
  delete (nonHuman as Record<string, unknown>).is_service_account
  const subjectResult = verifyIdentityIndependence(
    independentInput({ approver_identity: nonHuman }),
  )
  expectCode(
    subjectResult,
    "identity_subject_unsupported",
    "(approver_identity).subject_type",
    "non-human subject",
  )
})

test("a delegation attempt fails closed and creates no independence", () => {
  const delegated = {
    tenant_id: "tenant-1",
    user_id: "requester-1",
    actor_kind: "approver",
    identity_source: "authenticated_session",
    source_record_id: "sess-delegate",
    observed_at: OBSERVED_AT,
    subject_type: "human_user",
    delegated_for_user_id: "someone-else",
  }
  const result = verifyIdentityIndependence(independentInput({ approver_identity: delegated }))
  expectCode(result, "delegation_not_supported", "(approver_identity)", "delegated approver")
})

// ─── Executor: represented, validated, deferred ─────────────────

test("a valid optional executor identity passes and grants nothing", () => {
  const result = verifyIdentityIndependence(
    independentInput({ executor_identity: sessionIdentityOf("executor-1", "executor") }),
  )
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  const serialized = JSON.stringify(result)
  for (const grant of ["authorized", "execution_permission", "execution_token", "approved"]) {
    assert.ok(!serialized.includes(grant), grant)
  }
})

test("executor equal to approver still passes: the separation rule is deferred to #145", () => {
  const result = verifyIdentityIndependence(
    independentInput({ executor_identity: sessionIdentityOf("approver-1", "executor") }),
  )
  assert.equal(result.ok, true, "executor-versus-approver comparison is Issue #145 scope")
})

test("an invalid executor identity is still validated fail-closed when present", () => {
  const wrongKind = verifyIdentityIndependence(
    independentInput({ executor_identity: sessionIdentityOf("executor-1", "requester") }),
  )
  expectCode(wrongKind, "identity_actor_kind_mismatch", "(executor_identity).actor_kind", "kind")
  const malformed = verifyIdentityIndependence(independentInput({ executor_identity: 42 }))
  expectCode(malformed, "invalid_identity_input", "(executor_identity)", "malformed executor")
  const crossTenant = verifyIdentityIndependence(
    independentInput({
      executor_identity: sessionIdentityOf("executor-1", "executor", {}, "tenant-OTHER"),
    }),
  )
  expectCode(crossTenant, "identity_tenant_mismatch", "(executor_identity).tenant_id", "tenant")
})

// ─── No fabricated results, determinism, totality ───────────────

test("a caller-supplied result object is never accepted as a decision", () => {
  const fabricated = { ok: true, issues: [] }
  const result = verifyIdentityIndependence(fabricated)
  assert.equal(result.ok, false, "a fabricated { ok: true } input must not verify")
})

test("malformed containers fail closed and never throw", () => {
  for (const bad of [null, undefined, 42, "input", [], () => {}]) {
    const result = verifyIdentityIndependence(bad)
    assert.equal(result.ok, false, String(bad))
  }
  const missingContext = verifyIdentityIndependence({})
  expectCode(missingContext, "identity_state_missing", "expected_tenant_id", "empty input")
})

test("issue ordering is deterministic for identical inputs", () => {
  const hostile = independentInput({
    approver_identity: sessionIdentityOf("requester-1", "approver"),
    second_reviewer_identity: sessionIdentityOf("reviewer-one", "reviewer"),
  })
  const a = verifyIdentityIndependence(hostile)
  const b = verifyIdentityIndependence(hostile)
  assert.deepEqual(
    a.issues.map((i) => i.message),
    b.issues.map((i) => i.message),
  )
  // Fixed stage order: evidence-binding issues precede the equality issues,
  // and within equality the duplicate-reviewer check precedes self-approval.
  const codes = a.issues.map((i) => i.code)
  const duplicateIndex = codes.indexOf("duplicate_reviewer_identity")
  const selfApprovalIndex = codes.indexOf("self_approval_forbidden")
  assert.ok(duplicateIndex >= 0 && selfApprovalIndex >= 0)
  assert.ok(duplicateIndex < selfApprovalIndex, "duplicate check runs before self-approval")
})

test("the verifier never mutates its input", () => {
  const input = independentInput()
  const before = JSON.stringify(input)
  verifyIdentityIndependence(input)
  assert.equal(JSON.stringify(input), before)
})

// ─── Snapshot consistency (getter/Proxy TOCTOU) ─────────────────

/**
 * Wrap a genuine identity/artifact so one scalar field returns `first` on its
 * first read and `later` afterwards, counting reads of that field. If the
 * verifier snapshots once, `later` is never observed and reads === 1.
 */
function withMutatingField(
  genuine: unknown,
  field: string,
  first: unknown,
  later: unknown,
): { forged: unknown; reads: () => number } {
  const base: Record<string, unknown> = { ...(genuine as Record<string, unknown>) }
  let count = 0
  const forged = new Proxy(base, {
    get(target, prop) {
      if (prop === field) {
        count += 1
        return count === 1 ? first : later
      }
      return target[prop as string]
    },
  })
  return { forged, reads: () => count }
}

/** Count every own-property `get` on a genuine object across the whole verify. */
function countingProxy(genuine: unknown): { proxy: unknown; counts: Record<string, number> } {
  const base: Record<string, unknown> = { ...(genuine as Record<string, unknown>) }
  const counts: Record<string, number> = {}
  const proxy = new Proxy(base, {
    get(target, prop) {
      if (typeof prop === "string") counts[prop] = (counts[prop] ?? 0) + 1
      return Reflect.get(target, prop)
    },
  })
  return { proxy, counts }
}

test("requester-vs-approver self-approval cannot be bypassed by a post-validation user_id flip", () => {
  // The approver is truly the requester ("requester-1"); the getter tries to
  // present an independent "approver-1" on later reads. Single-read snapshot
  // captures the self-approving value, so the conflict is still caught.
  const { forged, reads } = withMutatingField(
    sessionIdentityOf("approver-1", "approver"),
    "user_id",
    "requester-1",
    "approver-1",
  )
  const result = verifyIdentityIndependence(independentInput({ approver_identity: forged }))
  expectCode(result, "self_approval_forbidden", "(requester_identity)", "requester=approver flip")
  assert.equal(reads(), 1, "approver user_id read once")
})

test("creator-vs-approver self-approval cannot be bypassed by a post-validation flip", () => {
  const { forged, reads } = withMutatingField(
    sessionIdentityOf("approver-1", "approver"),
    "user_id",
    "creator-1",
    "approver-1",
  )
  const result = verifyIdentityIndependence(independentInput({ approver_identity: forged }))
  expectCode(result, "self_approval_forbidden", "(creator_identity)", "creator=approver flip")
  assert.equal(reads(), 1)
})

test("reviewer-vs-approver self-approval cannot be bypassed by a post-validation flip", () => {
  const { forged, reads } = withMutatingField(
    sessionIdentityOf("approver-1", "approver"),
    "user_id",
    "reviewer-one",
    "approver-1",
  )
  const result = verifyIdentityIndependence(independentInput({ approver_identity: forged }))
  expectCode(result, "self_approval_forbidden", "(first_reviewer_identity)", "reviewer=approver flip")
  assert.equal(reads(), 1)
})

test("first-vs-second reviewer duplication cannot be bypassed by a post-validation flip", () => {
  // Second reviewer is truly reviewer-one; the getter presents reviewer-two
  // later. The snapshot binds reviewer-one, so duplication is still caught and
  // the evidence-binding check (second reviewer id) also fails.
  const { forged, reads } = withMutatingField(
    sessionIdentityOf("reviewer-two", "reviewer"),
    "user_id",
    "reviewer-one",
    "reviewer-two",
  )
  const result = verifyIdentityIndependence(
    independentInput({ second_reviewer_identity: forged }),
  )
  expectCode(
    result,
    "duplicate_reviewer_identity",
    "(second_reviewer_identity)",
    "reviewer duplication flip",
  )
  assert.equal(reads(), 1)
})

test("tenant matching uses the same value that was validated", () => {
  // tenant validates as tenant-1 then flips to a foreign tenant; the snapshot
  // binds tenant-1, so no tenant mismatch is (spuriously) introduced and the
  // later value is never used.
  const { forged, reads } = withMutatingField(
    sessionIdentityOf("approver-1", "approver"),
    "tenant_id",
    "tenant-1",
    "tenant-EVIL",
  )
  const result = verifyIdentityIndependence(independentInput({ approver_identity: forged }))
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.equal(reads(), 1, "approver tenant_id read once")
})

test("evidence reviewer binding uses the same evidence snapshot that was validated", () => {
  // The evidence's first_reviewer_id validates as reviewer-one (matching the
  // canonical first-reviewer identity) then flips; the snapshot keeps the
  // validated binding so no spurious mismatch appears and the flip is unused.
  const { forged, reads } = withMutatingField(
    EVIDENCE,
    "first_reviewer_id",
    "reviewer-one",
    "reviewer-EVIL",
  )
  const result = verifyIdentityIndependence(independentInput({ review_evidence: forged }))
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.equal(reads(), 1, "evidence first_reviewer_id read once")
})

test("Human Decision id cannot change after validation", () => {
  const { forged, reads } = withMutatingField(DECISION, "human_decision_id", "hdr-1", "hdr-EVIL")
  const result = verifyIdentityIndependence(independentInput({ human_decision: forged }))
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.equal(reads(), 1, "human_decision_id read once")
})

test("Review Evidence source ids cannot change after validation", () => {
  const { forged, reads } = withMutatingField(
    EVIDENCE,
    "source_workunit_id",
    "wu-1",
    "wu-EVIL",
  )
  const result = verifyIdentityIndependence(independentInput({ review_evidence: forged }))
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.equal(reads(), 1, "evidence source_workunit_id read once")
})

test("every nested scalar field used by the verifier is read at most once", () => {
  const approver = countingProxy(sessionIdentityOf("approver-1", "approver"))
  const decision = countingProxy(DECISION)
  const evidence = countingProxy(EVIDENCE)
  const result = verifyIdentityIndependence(
    independentInput({
      approver_identity: approver.proxy,
      human_decision: decision.proxy,
      review_evidence: evidence.proxy,
    }),
  )
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  for (const counts of [approver.counts, decision.counts, evidence.counts]) {
    for (const [key, n] of Object.entries(counts)) {
      assert.ok(n <= 1, `${key} read ${n} times (expected at most once)`)
    }
  }
})

test("throwing getter or ownKeys traps on nested objects fail closed without throwing", () => {
  const hostileGetter = new Proxy(
    {},
    {
      get() {
        throw new Error("hostile nested getter")
      },
    },
  )
  const hostileKeys = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("hostile ownKeys")
      },
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor")
      },
    },
  )
  for (const key of [
    "human_decision",
    "review_evidence",
    "requester_identity",
    "approver_identity",
  ]) {
    for (const hostile of [hostileGetter, hostileKeys]) {
      let result: ReturnType<typeof verifyIdentityIndependence> | undefined
      assert.doesNotThrow(() => {
        result = verifyIdentityIndependence(independentInput({ [key]: hostile }))
      }, `${key} hostile trap must not throw`)
      assert.ok(result && result.ok === false, `${key} hostile trap must fail closed`)
    }
  }
})
