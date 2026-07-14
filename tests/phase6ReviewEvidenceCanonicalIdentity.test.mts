/**
 * P6-FIX-010: isolated tests for the hardened Review Attestation identity
 * boundary (Issue #143) — createReviewAttestation now requires a
 * constructor-produced canonical reviewer identity; the old structural
 * `ReviewAttestationServerContext` (`{ tenant_id, reviewer_id }`) is removed
 * from the public surface and rejected at runtime.
 *
 * Imports ONLY node:test, node:assert/strict, the canonicalIdentity /
 * reviewEvidence / artifacts public surfaces, and — for the read-only source
 * guard — node:fs / node:url to READ (never mutate) the module sources. No
 * app runtime, no persistence, no ApprovalStore, no network, no
 * child_process, no secrets, no D1, no SQL, no LLM.
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
import * as reviewEvidenceModule from "../app/lib/phase6/reviewEvidence/index.ts"
import { createReviewAttestation } from "../app/lib/phase6/reviewEvidence/index.ts"

const HASH = "a".repeat(64)
const T = "2026-07-05T00:00:00Z"
const OBSERVED_AT = "2026-07-05T00:30:00Z"

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

function sessionOf(userId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId,
    tenantId: "tenant-1",
    role: "manager",
    email: `${userId}@example.test`,
    isDevSession: false,
    sessionId: `sess-${userId}`,
    createdAt: "2026-07-04T00:00:00Z",
    expiresAt: "2026-07-06T00:00:00Z",
    ...overrides,
  }
}

function sessionIdentityOf(
  userId: string,
  actorKind: SessionDerivableActorKind,
  sessionOverrides: Record<string, unknown> = {},
  expectedTenantId = "tenant-1",
): CanonicalIdentity {
  const result = createCanonicalSessionIdentity(sessionOf(userId, sessionOverrides), {
    actor_kind: actorKind,
    expected_tenant_id: expectedTenantId,
    observed_at: OBSERVED_AT,
  })
  if (!result.ok) {
    throw new Error(`fixture identity must construct: ${JSON.stringify(result.issues)}`)
  }
  return result.identity
}

function attestationInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    review_attestation_id: "att-1",
    source_workunit_id: "wu-1",
    reviewed_payload_hash: HASH,
    reviewed_at: "2026-07-05T01:00:00Z",
    ...overrides,
  }
}

// ─── Compile-time boundary (erased at runtime) ──────────────────

type IsAssignable<A, B> = A extends B ? true : false
type AssertFalse<T extends false> = T

// The old structural reviewer context is not assignable to the parameter
// type of createReviewAttestation: only a canonical identity can enter.
type OldStructuralContext = { readonly tenant_id: string; readonly reviewer_id: string }
type ReviewerParam = Parameters<typeof createReviewAttestation>[1]
type _OldContextNotAccepted = AssertFalse<IsAssignable<OldStructuralContext, ReviewerParam>>
// A raw seven-field structural identity (no brand) cannot enter either.
type StructuralIdentity = {
  readonly tenant_id: string
  readonly user_id: string
  readonly actor_kind: "reviewer"
  readonly identity_source: "authenticated_session"
  readonly source_record_id: string
  readonly observed_at: string
  readonly subject_type: "human_user"
}
type _StructuralIdentityNotAccepted = AssertFalse<IsAssignable<StructuralIdentity, ReviewerParam>>

test("compile-time attestation boundary assertions are wired (runtime no-op)", () => {
  const witnesses: unknown[] = [
    null as unknown as _OldContextNotAccepted,
    null as unknown as _StructuralIdentityNotAccepted,
  ]
  assert.equal(witnesses.length, 2)
})

// ─── Canonical reviewer identity is the only accepted input ─────

test("a canonical reviewer identity produces an attestation bound to its user", () => {
  const result = createReviewAttestation(
    attestationInput(),
    sessionIdentityOf("reviewer-alpha", "reviewer"),
    humanDecision(),
  )
  assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues))
  if (!result.ok) return
  const artifact = result.artifact as unknown as Record<string, unknown>
  assert.equal(artifact.reviewer_id, "reviewer-alpha")
  assert.equal(artifact.tenant_id, "tenant-1")
  // No session data, email, role, or identity-source material is stored.
  assert.deepEqual(
    Object.keys(artifact).sort(),
    [
      "review_attestation_id",
      "reviewed_at",
      "reviewed_payload_hash",
      "reviewer_id",
      "source_human_decision_id",
      "source_workunit_id",
      "tenant_id",
    ],
  )
})

test("requester, approver, and executor identities cannot be used as reviewer", () => {
  for (const kind of ["requester", "approver", "executor"] as const) {
    const result = createReviewAttestation(
      attestationInput(),
      sessionIdentityOf("user-x", kind),
      humanDecision(),
    )
    assert.equal(result.ok, false, kind)
    if (result.ok) return
    assert.ok(
      result.issues.some(
        (i) =>
          i.code === "invalid_reviewer_identity" &&
          i.field === "(reviewer_identity).actor_kind",
      ),
      kind,
    )
  }
})

test("a creator identity (stored-preview source) cannot be used as reviewer", () => {
  const creatorResult = createCanonicalPreviewCreatorIdentity(
    {
      id: "preview-1",
      tenantId: "tenant-1",
      workUnitId: "wu-1",
      creatorUserId: "creator-1",
    },
    { expected_tenant_id: "tenant-1", observed_at: OBSERVED_AT },
  )
  assert.equal(creatorResult.ok, true)
  if (!creatorResult.ok) return
  const result = createReviewAttestation(
    attestationInput(),
    creatorResult.identity,
    humanDecision(),
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  // Both the position and the provenance are wrong for a reviewer.
  assert.ok(
    result.issues.some(
      (i) =>
        i.code === "invalid_reviewer_identity" && i.field === "(reviewer_identity).actor_kind",
    ),
  )
  assert.ok(
    result.issues.some(
      (i) =>
        i.code === "invalid_reviewer_identity" &&
        i.field === "(reviewer_identity).identity_source",
    ),
  )
})

test("a reviewer identity from the wrong tenant fails closed", () => {
  const result = createReviewAttestation(
    attestationInput(),
    sessionIdentityOf("reviewer-alpha", "reviewer", { tenantId: "tenant-OTHER" }, "tenant-OTHER"),
    humanDecision(),
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((i) => i.code === "review_tenant_mismatch"))
})

test("development or expired sessions fail before any attestation exists", () => {
  // The canonical constructor is the gate: a dev session or an expired
  // session never yields an identity, so no attestation can be built from it.
  const dev = createCanonicalSessionIdentity(
    sessionOf("reviewer-alpha", { isDevSession: true }),
    { actor_kind: "reviewer", expected_tenant_id: "tenant-1", observed_at: OBSERVED_AT },
  )
  assert.equal(dev.ok, false)
  if (!dev.ok) {
    assert.ok(dev.issues.some((i) => i.code === "identity_source_untrusted"))
  }
  const expired = createCanonicalSessionIdentity(
    sessionOf("reviewer-alpha", { expiresAt: "2026-07-05T00:00:00Z" }),
    { actor_kind: "reviewer", expected_tenant_id: "tenant-1", observed_at: OBSERVED_AT },
  )
  assert.equal(expired.ok, false)
  if (!expired.ok) {
    assert.ok(expired.issues.some((i) => i.code === "identity_session_expired"))
  }
})

test("plain structural reviewer objects are rejected at runtime (cast cannot lie)", () => {
  for (const forged of [
    { tenant_id: "tenant-1", reviewer_id: "reviewer-alpha" },
    {
      tenant_id: "tenant-1",
      user_id: "reviewer-alpha",
      actor_kind: "reviewer",
      identity_source: "authenticated_session",
      source_record_id: "sess-x",
      observed_at: OBSERVED_AT,
      subject_type: "human_user",
      extra_grant: true,
    },
    {
      tenant_id: "tenant-1",
      user_id: "reviewer-alpha",
      actor_kind: "reviewer",
      identity_source: "model_output",
      source_record_id: "sess-x",
      observed_at: OBSERVED_AT,
      subject_type: "human_user",
    },
  ]) {
    const result = createReviewAttestation(
      attestationInput(),
      forged as unknown as CanonicalIdentity,
      humanDecision(),
    )
    assert.equal(result.ok, false, JSON.stringify(forged))
    if (result.ok) return
    assert.ok(
      result.issues.some((i) => i.code === "invalid_reviewer_identity"),
      JSON.stringify(forged),
    )
  }
})

test("a structurally perfect literal passes shape checks but stays position-bound", () => {
  // A cast can lie about the brand: a literal with exactly the seven valid
  // fields does construct an attestation. This is the documented compile-time
  // provenance limit — the runtime boundary still enforces reviewer position,
  // trusted source, subject type, and tenant binding, and future runtime
  // gates (Issue #145) must re-check identity server-side.
  const literal = {
    tenant_id: "tenant-1",
    user_id: "reviewer-alpha",
    actor_kind: "reviewer",
    identity_source: "authenticated_session",
    source_record_id: "sess-forged",
    observed_at: OBSERVED_AT,
    subject_type: "human_user",
  }
  const result = createReviewAttestation(
    attestationInput(),
    literal as unknown as CanonicalIdentity,
    humanDecision(),
  )
  assert.equal(result.ok, true, "structural validity is the documented cast limit")
})

// ─── Snapshot consistency (getter/Proxy TOCTOU) ─────────────────

/**
 * Build a plain seven-field reviewer-identity object equal to a genuine
 * canonical reviewer identity, then wrap a chosen scalar field in a getter
 * that returns `first` on its first read and `later` on every subsequent read,
 * counting reads. Proves the constructor reads each field at most once and
 * uses the validated value.
 */
function reviewerWithMutatingField(
  field: string,
  first: string,
  later: string,
): { forged: CanonicalIdentity; reads: () => number } {
  const base: Record<string, unknown> = {
    tenant_id: "tenant-1",
    user_id: "reviewer-good",
    actor_kind: "reviewer",
    identity_source: "authenticated_session",
    source_record_id: "sess-good",
    observed_at: OBSERVED_AT,
    subject_type: "human_user",
  }
  let count = 0
  const forged = new Proxy(base, {
    get(target, prop) {
      if (prop === field) {
        count += 1
        return count === 1 ? first : later
      }
      return target[prop as string]
    },
  }) as unknown as CanonicalIdentity
  return { forged, reads: () => count }
}

test("a getter-backed reviewer identity can never store a value different from the one validated", () => {
  // user_id validates as "reviewer-good" but later reads yield "reviewer-EVIL".
  const { forged, reads } = reviewerWithMutatingField("user_id", "reviewer-good", "reviewer-EVIL")
  const result = createReviewAttestation(attestationInput(), forged, humanDecision())
  assert.equal(result.ok, true, "the validated identity constructs")
  if (!result.ok) return
  assert.equal(reads(), 1, "user_id is read at most once by the constructor boundary")
  assert.equal(
    (result.artifact as unknown as Record<string, unknown>).reviewer_id,
    "reviewer-good",
    "the stored reviewer id is the validated snapshot value, never the later getter value",
  )
})

test("a getter-backed reviewer tenant is read once and binds to the validated value", () => {
  // tenant_id validates as "tenant-1" (matches the decision) but later reads
  // yield a foreign tenant. The single-read snapshot binds tenant-1.
  const { forged, reads } = reviewerWithMutatingField("tenant_id", "tenant-1", "tenant-EVIL")
  const result = createReviewAttestation(attestationInput(), forged, humanDecision())
  assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues))
  if (!result.ok) return
  assert.equal(reads(), 1, "tenant_id is read at most once")
  assert.equal(
    (result.artifact as unknown as Record<string, unknown>).tenant_id,
    "tenant-1",
    "the stored tenant is the validated snapshot value",
  )
})

test("a getter-backed actor_kind cannot validate as reviewer then flip position", () => {
  // actor_kind validates as "reviewer" then flips to "approver". The single
  // snapshot means the flip is never observed; construction stays consistent.
  const { forged, reads } = reviewerWithMutatingField("actor_kind", "reviewer", "approver")
  const result = createReviewAttestation(attestationInput(), forged, humanDecision())
  assert.equal(result.ok, true)
  assert.equal(reads(), 1, "actor_kind is read at most once")
})

test("a throwing reviewer-identity getter fails closed without throwing", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("hostile identity getter")
      },
      ownKeys() {
        throw new Error("hostile ownKeys")
      },
    },
  ) as unknown as CanonicalIdentity
  let result: ReturnType<typeof createReviewAttestation> | undefined
  assert.doesNotThrow(() => {
    result = createReviewAttestation(attestationInput(), hostile, humanDecision())
  })
  assert.ok(result && result.ok === false)
  if (result && !result.ok) {
    assert.ok(result.issues.some((i) => i.code === "invalid_reviewer_identity"))
  }
})

// ─── Old structural API is gone ─────────────────────────────────

test("the old structural reviewer-context API is absent from the public namespace", () => {
  // Runtime namespace: no export mentions the old context name.
  for (const name of Object.keys(reviewEvidenceModule)) {
    assert.ok(
      !name.includes("ServerContext"),
      `unexpected server-context export: ${name}`,
    )
  }
  // Source level: the type itself is removed from the module sources, so it
  // cannot be imported as a type either.
  const moduleDir = fileURLToPath(
    new URL("../app/lib/phase6/reviewEvidence/", import.meta.url),
  )
  for (const rel of ["types.ts", "constructors.ts", "index.ts"]) {
    const src = readFileSync(`${moduleDir}${rel}`, "utf8")
    assert.ok(
      !src.includes("export type ReviewAttestationServerContext"),
      `${rel}: old structural context must not be exported`,
    )
  }
})
