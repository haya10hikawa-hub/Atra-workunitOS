/**
 * P6-FIX-009: isolated tests for the Phase 6 Review Evidence constructors,
 * the compile-time trusted-type boundary, and the module source guards
 * (Issue #142).
 *
 * Imports ONLY node:test, node:assert/strict, the reviewEvidence public
 * surface, the artifacts public surface (for the source Human Decision), and
 * — for the read-only source guards only — node:fs / node:url to READ (never
 * mutate) the module sources. No app runtime, no persistence, no
 * ApprovalStore, no network, no child_process, no secrets, no D1, no SQL, no
 * LLM.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  createHumanDecisionRecord,
  type ValidatedHumanDecisionRecord,
} from "../app/lib/phase6/artifacts/index.ts"
import {
  createCanonicalSessionIdentity,
  type CanonicalIdentity,
} from "../app/lib/phase6/canonicalIdentity/index.ts"
import {
  createReviewAttestation,
  createFourEyesReviewEvidence,
  type ReviewAttestation,
  type FourEyesReviewEvidence,
  type UnvalidatedReviewAttestationInput,
  type UnvalidatedFourEyesReviewEvidenceInput,
  type ReviewEvidenceVerificationResult,
} from "../app/lib/phase6/reviewEvidence/index.ts"

const HASH = "a".repeat(64)
const T = "2026-07-05T00:00:00Z"

/**
 * Canonical reviewer identity fixture (P6-FIX-010): the only way a reviewer
 * identity may reach createReviewAttestation is through the canonical
 * session-identity constructor.
 */
function reviewerIdentityOf(userId: string, tenantId = "tenant-1"): CanonicalIdentity {
  const result = createCanonicalSessionIdentity(
    {
      userId,
      tenantId,
      role: "manager",
      email: `${userId}@example.test`,
      isDevSession: false,
      sessionId: `sess-${userId}`,
      createdAt: "2026-07-04T00:00:00Z",
      expiresAt: "2026-07-06T00:00:00Z",
    },
    { actor_kind: "reviewer", expected_tenant_id: tenantId, observed_at: "2026-07-05T00:30:00Z" },
  )
  if (!result.ok) throw new Error("fixture reviewer identity must construct")
  return result.identity
}

function humanDecisionInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  }
}

function humanDecision(overrides: Record<string, unknown> = {}): ValidatedHumanDecisionRecord {
  const result = createHumanDecisionRecord(humanDecisionInput(overrides))
  assert.equal(result.ok, true, "fixture Human Decision must construct")
  if (!result.ok) throw new Error("unreachable")
  return result.artifact
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

function attestation(
  overrides: Record<string, unknown> = {},
  reviewer: CanonicalIdentity = reviewerIdentityOf("reviewer-alpha"),
  decision: ValidatedHumanDecisionRecord = humanDecision(),
): ReviewAttestation {
  const result = createReviewAttestation(attestationInput(overrides), reviewer, decision)
  assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues))
  if (!result.ok) throw new Error("unreachable")
  return result.artifact
}

function evidenceInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    review_evidence_id: "rev-1",
    review_completed_at: "2026-07-05T02:30:00Z",
    review_expires_at: "2026-07-05T03:30:00Z",
    ...overrides,
  }
}

function attestationPair(): readonly [ReviewAttestation, ReviewAttestation] {
  const first = attestation()
  const second = attestation(
    { review_attestation_id: "att-2", reviewed_at: "2026-07-05T02:00:00Z" },
    reviewerIdentityOf("reviewer-beta"),
  )
  return [first, second]
}

// ─── Compile-time trusted-type boundary (erased at runtime) ─────

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type AssertFalse<T extends false> = T
type IsAssignable<A, B> = A extends B ? true : false

// Raw input shapes are not the constructed artifact types.
type _RawAttestationNotArtifact = AssertFalse<
  Equal<UnvalidatedReviewAttestationInput, ReviewAttestation>
>
type _RawEvidenceNotArtifact = AssertFalse<
  Equal<UnvalidatedFourEyesReviewEvidenceInput, FourEyesReviewEvidence>
>
// A brandless object literal (all string-keyed fields, no private brand)
// cannot satisfy the opaque evidence type.
type BrandlessEvidence = {
  [K in keyof FourEyesReviewEvidence as K extends string ? K : never]: FourEyesReviewEvidence[K]
}
type _EvidenceBrandRequired = AssertFalse<IsAssignable<BrandlessEvidence, FourEyesReviewEvidence>>
type BrandlessAttestation = {
  [K in keyof ReviewAttestation as K extends string ? K : never]: ReviewAttestation[K]
}
type _AttestationBrandRequired = AssertFalse<
  IsAssignable<BrandlessAttestation, ReviewAttestation>
>
// Constructor success returns the intended validated artifact types.
type AttestationSuccessArtifact = Extract<
  ReturnType<typeof createReviewAttestation>,
  { ok: true }
>["artifact"]
type _AttestationConstructorType = Assert<Equal<AttestationSuccessArtifact, ReviewAttestation>>
type EvidenceSuccessArtifact = Extract<
  ReturnType<typeof createFourEyesReviewEvidence>,
  { ok: true }
>["artifact"]
type _EvidenceConstructorType = Assert<Equal<EvidenceSuccessArtifact, FourEyesReviewEvidence>>
// A verification result is not assignable to approval-like or runtime
// authorization-like shapes.
type ApprovalLike = { readonly approved: true; readonly approval_id: string }
type RuntimeAuthorizationLike = { readonly authorized: true; readonly execution_token: string }
type _ResultNotApproval = AssertFalse<
  IsAssignable<ReviewEvidenceVerificationResult, ApprovalLike>
>
type _ResultNotAuthorization = AssertFalse<
  IsAssignable<ReviewEvidenceVerificationResult, RuntimeAuthorizationLike>
>

test("compile-time trusted-type assertions are wired (runtime no-op)", () => {
  const witnesses: unknown[] = [
    null as unknown as _RawAttestationNotArtifact,
    null as unknown as _RawEvidenceNotArtifact,
    null as unknown as _EvidenceBrandRequired,
    null as unknown as _AttestationBrandRequired,
    null as unknown as _AttestationConstructorType,
    null as unknown as _EvidenceConstructorType,
    null as unknown as _ResultNotApproval,
    null as unknown as _ResultNotAuthorization,
  ]
  assert.equal(witnesses.length, 8)
})

// ─── Attestation construction ───────────────────────────────────

test("valid attestation constructs a frozen artifact with server-owned identity", () => {
  const decision = humanDecision()
  const result = createReviewAttestation(
    attestationInput(),
    reviewerIdentityOf("reviewer-alpha"),
    decision,
  )
  assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues))
  if (!result.ok) return
  const artifact = result.artifact as unknown as Record<string, unknown>
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.issues))
  assert.ok(Object.isFrozen(artifact))
  // Server context values are used; the decision supplies its own id.
  assert.equal(artifact.tenant_id, "tenant-1")
  assert.equal(artifact.reviewer_id, "reviewer-alpha")
  assert.equal(artifact.source_human_decision_id, "hdr-1")
  // Exactly the seven contract fields; no grant-like or unknown key.
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
  assert.equal(Object.getOwnPropertySymbols(artifact).length, 0, "no runtime brand symbol")
})

test("attestation constructor drops unknown fields and never mutates input", () => {
  const input = attestationInput({ harmless_extra: "x" })
  const before = JSON.stringify(input)
  const result = createReviewAttestation(
    input,
    reviewerIdentityOf("reviewer-alpha"),
    humanDecision(),
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.artifact, "harmless_extra"),
    false,
    "unknown fields are dropped",
  )
  assert.equal(JSON.stringify(input), before)
})

test("client-owned identity fields on attestation input fail closed and observably", () => {
  for (const field of ["tenant_id", "reviewer_id", "source_human_decision_id"]) {
    const result = createReviewAttestation(
      attestationInput({ [field]: "attacker-controlled" }),
      reviewerIdentityOf("reviewer-alpha"),
      humanDecision(),
    )
    assert.equal(result.ok, false, field)
    if (result.ok) return
    assert.ok(
      result.issues.some((i) => i.code === "client_owned_identity_field" && i.field === field),
      `${field} must be rejected as client-owned`,
    )
    for (const i of result.issues) assert.ok(!i.message.includes("attacker-controlled"))
  }
})

test("malformed attestation input fields fail closed", () => {
  const cases: readonly [Record<string, unknown>, string][] = [
    [{ review_attestation_id: "" }, "invalid_identifier"],
    [{ source_workunit_id: "" }, "invalid_identifier"],
    [{ reviewed_payload_hash: "XYZ" }, "invalid_payload_hash"],
    [{ reviewed_payload_hash: "A".repeat(64) }, "invalid_payload_hash"],
    [{ reviewed_at: "2026/07/05" }, "invalid_timestamp"],
    [{ reviewed_at: "2026-13-01T00:00:00Z" }, "invalid_timestamp"],
  ]
  for (const [override, expected] of cases) {
    const result = createReviewAttestation(
      attestationInput(override),
      reviewerIdentityOf("reviewer-alpha"),
      humanDecision(),
    )
    assert.equal(result.ok, false, JSON.stringify(override))
    if (result.ok) return
    assert.ok(
      result.issues.some((i) => i.code === expected),
      `${JSON.stringify(override)} → ${expected}`,
    )
  }
})

test("missing, malformed, or structural reviewer identity fails closed (no default identity)", () => {
  // P6-FIX-010: the old structural `{ tenant_id, reviewer_id }` context — and
  // every other non-constructor-produced value — is rejected fail-closed.
  for (const badIdentity of [
    null,
    undefined,
    {},
    { tenant_id: "tenant-1", reviewer_id: "reviewer-alpha" },
    { tenant_id: "tenant-1" },
    { reviewer_id: "reviewer-alpha" },
    { tenant_id: "", reviewer_id: "reviewer-alpha" },
    { tenant_id: "tenant-1", reviewer_id: 42 },
    {
      tenant_id: "tenant-1",
      user_id: "reviewer-alpha",
      actor_kind: "reviewer",
      identity_source: "client_supplied",
      source_record_id: "sess-x",
      observed_at: "2026-07-05T00:30:00Z",
      subject_type: "human_user",
    },
  ]) {
    const result = createReviewAttestation(
      attestationInput(),
      badIdentity as unknown as CanonicalIdentity,
      humanDecision(),
    )
    assert.equal(result.ok, false, JSON.stringify(badIdentity))
    if (result.ok) return
    assert.ok(
      result.issues.some((i) => i.code === "invalid_reviewer_identity"),
      JSON.stringify(badIdentity),
    )
    for (const issue of result.issues) {
      assert.ok(!issue.message.includes("reviewer-alpha"), "no identity value is echoed")
    }
  }
})

test("a structurally invalid Human Decision fails attestation construction", () => {
  const invalidDecision = { human_decision_id: "hdr-1", tenant_id: "tenant-1" }
  const result = createReviewAttestation(
    attestationInput(),
    reviewerIdentityOf("reviewer-alpha"),
    invalidDecision as unknown as ValidatedHumanDecisionRecord,
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((i) => i.code === "invalid_source_human_decision"))
})

test("cross-tenant reviewer identity versus Human Decision fails closed", () => {
  const result = createReviewAttestation(
    attestationInput(),
    reviewerIdentityOf("reviewer-alpha", "tenant-OTHER"),
    humanDecision(),
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((i) => i.code === "review_tenant_mismatch"))
})

test("attestation constructor reads untrusted input getters exactly once", () => {
  const input = attestationInput()
  delete input.reviewed_payload_hash
  let reads = 0
  Object.defineProperty(input, "reviewed_payload_hash", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return HASH
    },
  })
  const result = createReviewAttestation(
    input,
    reviewerIdentityOf("reviewer-alpha"),
    humanDecision(),
  )
  assert.equal(reads, 1, "reviewed_payload_hash read exactly once")
  assert.equal(result.ok, true)
})

// ─── Evidence construction ──────────────────────────────────────

test("two distinct reviewers with the same binding construct frozen evidence", () => {
  const [first, second] = attestationPair()
  const result = createFourEyesReviewEvidence(evidenceInput(), first, second, humanDecision())
  assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues))
  if (!result.ok) return
  const artifact = result.artifact as unknown as Record<string, unknown>
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(artifact))
  assert.equal(artifact.first_reviewer_id, "reviewer-alpha")
  assert.equal(artifact.second_reviewer_id, "reviewer-beta")
  assert.equal(artifact.tenant_id, "tenant-1")
  assert.equal(artifact.reviewed_payload_hash, HASH)
  assert.equal(Object.getOwnPropertySymbols(artifact).length, 0, "no runtime brand symbol")
  // Exactly the thirteen contract fields.
  assert.equal(Object.keys(artifact).length, 13)
})

test("identical reviewer identities fail evidence construction", () => {
  const first = attestation()
  const sameReviewer = attestation(
    { review_attestation_id: "att-2", reviewed_at: "2026-07-05T02:00:00Z" },
    reviewerIdentityOf("reviewer-alpha"),
  )
  const result = createFourEyesReviewEvidence(evidenceInput(), first, sameReviewer, humanDecision())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((i) => i.code === "duplicate_reviewer_identity"))
})

test("identical attestation ids fail evidence construction", () => {
  const first = attestation()
  const sameId = attestation(
    { review_attestation_id: "att-1", reviewed_at: "2026-07-05T02:00:00Z" },
    reviewerIdentityOf("reviewer-beta"),
  )
  const result = createFourEyesReviewEvidence(evidenceInput(), first, sameId, humanDecision())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((i) => i.code === "duplicate_review_attestation"))
})

test("tenant, Human Decision, WorkUnit, and payload-hash mismatches fail evidence construction", () => {
  const decision = humanDecision()
  const first = attestation({}, undefined, decision)

  // Tenant mismatch: second attestation bound to the same decision id but in
  // another tenant (via a tenant-2 decision sharing the id).
  const tenant2Decision = humanDecision({ tenant_id: "tenant-2" })
  const otherTenant = attestation(
    { review_attestation_id: "att-2", reviewed_at: "2026-07-05T02:00:00Z" },
    reviewerIdentityOf("reviewer-beta", "tenant-2"),
    tenant2Decision,
  )
  const tenantResult = createFourEyesReviewEvidence(evidenceInput(), first, otherTenant, decision)
  assert.equal(tenantResult.ok, false)
  if (tenantResult.ok) return
  assert.ok(tenantResult.issues.some((i) => i.code === "review_tenant_mismatch"))

  // Human Decision mismatch: same tenant, different decision id.
  const otherDecision = humanDecision({ human_decision_id: "hdr-2" })
  const otherDecisionAttestation = attestation(
    { review_attestation_id: "att-2", reviewed_at: "2026-07-05T02:00:00Z" },
    reviewerIdentityOf("reviewer-beta"),
    otherDecision,
  )
  const decisionResult = createFourEyesReviewEvidence(
    evidenceInput(),
    first,
    otherDecisionAttestation,
    decision,
  )
  assert.equal(decisionResult.ok, false)
  if (decisionResult.ok) return
  assert.ok(
    decisionResult.issues.some((i) => i.code === "review_source_human_decision_mismatch"),
  )

  // WorkUnit mismatch.
  const otherWorkunit = attestation(
    {
      review_attestation_id: "att-2",
      reviewed_at: "2026-07-05T02:00:00Z",
      source_workunit_id: "wu-OTHER",
    },
    reviewerIdentityOf("reviewer-beta"),
    decision,
  )
  const workunitResult = createFourEyesReviewEvidence(evidenceInput(), first, otherWorkunit, decision)
  assert.equal(workunitResult.ok, false)
  if (workunitResult.ok) return
  assert.ok(workunitResult.issues.some((i) => i.code === "review_source_workunit_mismatch"))

  // Payload-hash mismatch.
  const otherHash = attestation(
    {
      review_attestation_id: "att-2",
      reviewed_at: "2026-07-05T02:00:00Z",
      reviewed_payload_hash: "b".repeat(64),
    },
    reviewerIdentityOf("reviewer-beta"),
    decision,
  )
  const hashResult = createFourEyesReviewEvidence(evidenceInput(), first, otherHash, decision)
  assert.equal(hashResult.ok, false)
  if (hashResult.ok) return
  assert.ok(hashResult.issues.some((i) => i.code === "review_payload_hash_mismatch"))
})

test("client-owned binding fields on evidence input fail closed", () => {
  const [first, second] = attestationPair()
  for (const field of [
    "tenant_id",
    "source_human_decision_id",
    "source_workunit_id",
    "reviewed_payload_hash",
    "first_reviewer_id",
    "second_reviewer_id",
  ]) {
    const result = createFourEyesReviewEvidence(
      evidenceInput({ [field]: "attacker-controlled" }),
      first,
      second,
      humanDecision(),
    )
    assert.equal(result.ok, false, field)
    if (result.ok) return
    assert.ok(
      result.issues.some((i) => i.code === "client_owned_identity_field" && i.field === field),
      field,
    )
  }
})

test("invalid timestamp ordering and expiry rules fail evidence construction", () => {
  const [first, second] = attestationPair()
  const decision = humanDecision()
  // Attestations passed in reverse review order.
  const reversed = createFourEyesReviewEvidence(evidenceInput(), second, first, decision)
  assert.equal(reversed.ok, false)
  if (reversed.ok) return
  assert.ok(reversed.issues.some((i) => i.code === "invalid_review_timeline"))
  // Completion before both reviews.
  const earlyCompletion = createFourEyesReviewEvidence(
    evidenceInput({ review_completed_at: "2026-07-05T00:30:00Z" }),
    first,
    second,
    decision,
  )
  assert.equal(earlyCompletion.ok, false)
  // Expiry exactly at completion.
  const expiryAtCompletion = createFourEyesReviewEvidence(
    evidenceInput({ review_expires_at: "2026-07-05T02:30:00Z" }),
    first,
    second,
    decision,
  )
  assert.equal(expiryAtCompletion.ok, false)
  if (expiryAtCompletion.ok) return
  assert.ok(expiryAtCompletion.issues.some((i) => i.code === "invalid_review_timeline"))
  // Expiry before completion.
  const expiryBefore = createFourEyesReviewEvidence(
    evidenceInput({ review_expires_at: "2026-07-05T02:00:00Z" }),
    first,
    second,
    decision,
  )
  assert.equal(expiryBefore.ok, false)
})

test("a structurally invalid attestation argument fails evidence construction", () => {
  const [first] = attestationPair()
  const forged = { review_attestation_id: "att-2" } as unknown as ReviewAttestation
  const result = createFourEyesReviewEvidence(evidenceInput(), first, forged, humanDecision())
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(
    result.issues.some(
      (i) => i.code === "invalid_review_attestation" && i.field === "(second_review_attestation)",
    ),
  )
})

test("evidence construction is deterministic and never mutates its inputs", () => {
  const [first, second] = attestationPair()
  const decision = humanDecision()
  const input = evidenceInput()
  const beforeInput = JSON.stringify(input)
  const beforeFirst = JSON.stringify(first)
  const a = createFourEyesReviewEvidence(input, first, second, decision)
  const b = createFourEyesReviewEvidence(evidenceInput(), first, second, decision)
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (!a.ok || !b.ok) return
  assert.deepEqual(
    JSON.parse(JSON.stringify(a.artifact)),
    JSON.parse(JSON.stringify(b.artifact)),
  )
  assert.equal(JSON.stringify(input), beforeInput)
  assert.equal(JSON.stringify(first), beforeFirst)
})

test("construction results carry no grant-like or authority fields", () => {
  const [first, second] = attestationPair()
  const result = createFourEyesReviewEvidence(evidenceInput(), first, second, humanDecision())
  assert.equal(result.ok, true)
  const asRecord = result as unknown as Record<string, unknown>
  assert.deepEqual(Object.keys(asRecord).sort(), ["artifact", "issues", "ok"])
  for (const key of [
    "approval",
    "approved",
    "authorized",
    "execution_permission",
    "executed",
    "persisted",
    "promoted",
    "production_ready",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(asRecord, key), false, key)
    if (result.ok) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(result.artifact, key),
        false,
        `artifact.${key}`,
      )
    }
  }
})

// ─── Source guards (read-only) ──────────────────────────────────

const MODULE_DIR = fileURLToPath(new URL("../app/lib/phase6/reviewEvidence/", import.meta.url))
const MODULE_FILES = [
  "types.ts",
  "validation.ts",
  "validators.ts",
  "constructors.ts",
  "verifier.ts",
  "audit.ts",
  "index.ts",
] as const

function readModuleSrc(rel: string): string {
  return readFileSync(`${MODULE_DIR}${rel}`, "utf8")
}

/** Strip block and line comments so a comment cannot satisfy a structural check. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

test("source guard: module file set is exactly the declared seven files", () => {
  assert.deepEqual(readdirSync(MODULE_DIR).sort(), [...MODULE_FILES].sort())
})

test("source guard: opaque brands are declared in types.ts and never exported", () => {
  const code = stripComments(readModuleSrc("types.ts"))
  assert.ok(/declare const reviewAttestationBrand: unique symbol/.test(code))
  assert.ok(/declare const fourEyesReviewEvidenceBrand: unique symbol/.test(code))
  assert.ok(!/export\s+(?:declare\s+)?const\s+\w*[Bb]rand/.test(code), "brands are not exported")
  for (const rel of MODULE_FILES) {
    const fileCode = stripComments(readModuleSrc(rel))
    assert.ok(!/export\s+function\s+\w*[Bb]rand/.test(fileCode), `${rel}: no branding helper`)
  }
})

test("source guard: validators are non-narrowing (no type predicates to branded types)", () => {
  const code = stripComments(readModuleSrc("validators.ts"))
  assert.ok(!code.includes("is ReviewAttestation"), "no attestation type predicate")
  assert.ok(!code.includes("is FourEyesReviewEvidence"), "no evidence type predicate")
})

test("source guard: the artifacts module is consumed only through its public index", () => {
  for (const rel of MODULE_FILES) {
    const code = stripComments(readModuleSrc(rel))
    const artifactImports = code.match(/from "\.\.\/artifacts\/[^"]*"/g) ?? []
    for (const found of artifactImports) {
      assert.equal(
        found,
        'from "../artifacts/index.ts"',
        `${rel}: artifacts must be imported via index.ts only`,
      )
    }
  }
})

test("source guard: no capability-bearing import or call in the module", () => {
  const forbidden = [
    ["fet", "ch("],
    ["process", ".env"],
    ["child_", "process"],
    ["node:", "fs"],
    ['from "', 'fs"'],
    ["require", "("],
    ["import", "("],
    ["globalThis", "["],
    ["Date", ".now"],
    ["new ", "Date"],
    ["Date", ".parse"],
    ["Math", ".random"],
    ["random", "UUID"],
    ["Approval", "Store"],
    ["approval", "Mac"],
    ["append", "EvidenceLedger"],
    ["write", "Graph"],
    ["execute", "External"],
    ["D1", "Database"],
    [".prep", "are("],
  ]
  for (const rel of MODULE_FILES) {
    const code = stripComments(readModuleSrc(rel))
    for (const [a, b] of forbidden) {
      assert.ok(!code.includes(a + b), `${rel} must not contain: <<<${a + b}>>>`)
    }
  }
})

test("source guard: no serialized brand field in the constructor allowlists", () => {
  const code = stripComments(readModuleSrc("constructors.ts"))
  const lists = code.match(/const \w+_FIELDS: readonly string\[\] = \[[\s\S]*?\]/g) ?? []
  assert.ok(lists.length >= 4, "field allowlists must be present")
  for (const list of lists) {
    assert.ok(!/[Bb]rand/.test(list), "no brand field is serialized")
  }
})

test("source guard: no production file outside the module consumes the branded types", () => {
  // The two branded type names must appear in app/ only inside the module
  // directory, the Phase 6 identity-independence gate (the P6-FIX-010
  // sanctioned consumer), and the Phase 6 approval-chain linkage module (the
  // P6-FIX-011 sanctioned consumer) — both re-validate the evidence through
  // this module's own validator. Nothing else may treat them as authority yet.
  const appDir = fileURLToPath(new URL("../app", import.meta.url))
  const results: string[] = []
  walk(appDir, results)
  const offenders = results.filter((file) => {
    if (file.includes("/reviewEvidence/")) return false
    if (file.includes("/identityIndependence/")) return false
    if (file.includes("/approvalLinkage/")) return false
    const text = readFileSync(file, "utf8")
    return text.includes("ReviewAttestation") || text.includes("FourEyesReviewEvidence")
  })
  assert.deepEqual(offenders, [], `unexpected consumers: ${offenders.join(", ")}`)
})

function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) =>
      e.isDirectory() ? `${e.name}/` : e.name,
    )
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.endsWith("/")) {
      const name = entry.slice(0, -1)
      if (name === "node_modules" || name === ".next" || name === ".open-next") continue
      walk(`${dir}/${name}`, out)
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry)) {
      out.push(`${dir}/${entry}`)
    }
  }
}
