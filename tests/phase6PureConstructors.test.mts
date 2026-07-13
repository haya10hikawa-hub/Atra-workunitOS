/**
 * P6-I1: behavioral tests for the Phase 6 pure artifact constructors.
 *
 * Imports ONLY the Phase 6 artifact module surface (constructors, construction
 * helpers, and P6-I0 validators/types re-exported through index.ts). No app
 * runtime module outside app/lib/phase6/artifacts/ is imported. No network, no
 * GitHub API, no child_process, no file mutation, no secrets, no P7.1 utilities,
 * no ApprovalStore, no external actions, no D1, no SQL, no LLM.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import type {
  UnvalidatedHumanDecisionRecordInput,
  ValidatedHumanDecisionRecord,
  HumanDecisionRecord,
} from "../app/lib/phase6/artifacts/index.ts"
import {
  createQueryIntentRecord,
  createSafeQueryPlan,
  createCompiledSqlArtifact,
  createRuleReviewRecord,
  createQueryResultRecord,
  createEvidenceReviewRecord,
  createLlmJudgmentRecord,
  createHumanDecisionRecord,
  validateQueryIntentRecord,
  validateSafeQueryPlan,
  validateCompiledSqlArtifact,
  validateRuleReviewRecord,
  validateQueryResultRecord,
  validateEvidenceReviewRecord,
  validateLlmJudgmentRecord,
  validateHumanDecisionRecord,
  snapshotConstructorInput,
  freezeConstructedArtifact,
  validationIssuesToConstructionIssues,
  ensureHumanDecisionJudgmentIdConsistency,
  type ConstructionResult,
  type ValidationResult,
} from "../app/lib/phase6/artifacts/index.ts"

// ─── Fixtures (all values are caller-provided; no clock, no id generation) ──

const TS = "2026-07-05T12:00:00Z"
const SHA = "a".repeat(64)
const CIR = `sha256:${"b".repeat(64)}`

function validQueryIntent(): Record<string, unknown> {
  return {
    query_intent_id: "qi_1",
    tenant_id: "tenant_1",
    actor_id: "actor_1",
    input_signal_id: "sig_1",
    intent_summary: "summary",
    requested_information: ["field_a"],
    allowed_sources: ["table_a"],
    disallowed_sources: [],
    tenant_scope_required: true,
    human_review_required: true,
    created_at: TS,
    no_go_flags: [],
  }
}

function validSafeQueryPlan(): Record<string, unknown> {
  return {
    safe_query_plan_id: "sqp_1",
    tenant_id: "tenant_1",
    source_query_intent_id: "qi_1",
    query_goal: "goal",
    allowed_tables: ["t"],
    selected_columns: ["c"],
    tenant_scope_filter_required: true,
    denied_operations: ["INSERT"],
    estimated_result_shape: "rows",
    human_review_required: true,
    created_at: TS,
    no_go_flags: [],
  }
}

function validCompiledSql(): Record<string, unknown> {
  return {
    compiled_sql_artifact_id: "csa_1",
    tenant_id: "tenant_1",
    source_safe_query_plan_id: "sqp_1",
    source_query_intent_id: "qi_1",
    sql_hash: SHA,
    sql_text_redaction_state: "redacted",
    read_only: true,
    mutation_detected: false,
    tenant_scope_filter_present: true,
    selected_columns: ["c"],
    created_at: TS,
    no_go_flags: [],
  }
}

function validRuleReview(): Record<string, unknown> {
  return {
    rule_review_record_id: "rr_1",
    tenant_id: "tenant_1",
    source_compiled_sql_artifact_id: "csa_1",
    source_safe_query_plan_id: "sqp_1",
    source_query_intent_id: "qi_1",
    rule_review_status: "draft_review",
    rule_review_outcome: "pass",
    read_only_check_result: "ok",
    tenant_scope_check_result: "ok",
    denied_schema_check_result: "ok",
    human_review_required: true,
    reviewed_at: TS,
    no_go_flags: [],
  }
}

function validQueryResult(): Record<string, unknown> {
  return {
    query_result_record_id: "qrr_1",
    tenant_id: "tenant_1",
    source_rule_review_record_id: "rr_1",
    source_compiled_sql_artifact_id: "csa_1",
    source_safe_query_plan_id: "sqp_1",
    source_query_intent_id: "qi_1",
    selected_source_rows: ["row1"],
    selected_columns: ["c"],
    provenance_complete: true,
    evidence_eligible: true,
    result_hash: SHA,
    content_integrity_reference: CIR,
    redaction_state: "not_required",
    aggregation_method: null,
    source_scope: null,
    source_trust_marker: "first_party_system_record",
    conflict_state: "no_conflict",
    human_review_required: true,
    created_at: TS,
    no_go_flags: [],
  }
}

function validEvidenceReview(): Record<string, unknown> {
  return {
    evidence_review_id: "er_1",
    tenant_id: "tenant_1",
    source_query_result_record_id: "qrr_1",
    source_rule_review_record_id: "rr_1",
    source_compiled_sql_artifact_id: "csa_1",
    source_safe_query_plan_id: "sqp_1",
    source_query_intent_id: "qi_1",
    evidence_review_status: "draft_evidence_review",
    evidence_review_outcome: "pass",
    evidence_claim: "claim",
    evidence_type: "type",
    source_trust_marker: "first_party_system_record",
    evidence_eligible: true,
    evidence_accepted: false,
    human_review_required: true,
    result_hash_check_result: "ok",
    content_integrity_check_result: "ok",
    reviewed_at: TS,
    no_go_flags: [],
  }
}

function validLlmJudgment(): Record<string, unknown> {
  return {
    llm_judgment_id: "lj_1",
    tenant_id: "tenant_1",
    source_evidence_review_record_id: "er_1",
    source_query_result_record_id: "qrr_1",
    source_rule_review_record_id: "rr_1",
    source_compiled_sql_artifact_id: "csa_1",
    source_safe_query_plan_id: "sqp_1",
    source_query_intent_id: "qi_1",
    judgment_status: "draft_judgment",
    judgment_outcome: "pass",
    judgment_summary: "summary",
    judgment_claims: ["claim"],
    evidence_references: ["er_1"],
    provenance_references: ["prov"],
    uncertainty_state: "low_uncertainty",
    confidence_explanation: "explanation",
    unsupported_inferences: [],
    conflict_handling_summary: "none",
    human_review_required: true,
    allowed_use: ["review"],
    disallowed_use: ["execution"],
    judged_at: TS,
    no_go_flags: [],
  }
}

function validHumanDecision(): Record<string, unknown> {
  return {
    human_decision_id: "hd_1",
    tenant_id: "tenant_1",
    decision_status: "draft_human_decision",
    decision_outcome: "pass",
    human_reviewer_id: "rev_1",
    human_reviewer_role: "reviewer",
    reviewer_context: "ctx",
    source_evidence_review_record_id: "er_1",
    source_llm_judgment_record_id: "lj_1",
    source_query_result_record_id: "qrr_1",
    source_rule_review_record_id: "rr_1",
    source_compiled_sql_artifact_id: "csa_1",
    source_safe_query_plan_id: "sqp_1",
    source_query_intent_id: "qi_1",
    evidence_accepted: false,
    evidence_claim: "claim",
    evidence_type: "type",
    llm_judgment_id: "lj_1",
    judgment_summary: "summary",
    uncertainty_state: "low_uncertainty",
    human_decision_summary: "decision",
    human_decision_rationale: "rationale",
    decision_impact_scope: "priority_assessment",
    allowed_use: ["review"],
    disallowed_use: ["execution"],
    future_gate_requirements: ["gate"],
    approval_required: true,
    promotion_required: false,
    execution_required: false,
    four_eyes_required: true,
    self_approval_blocked: true,
    reviewed_by_human_at: TS,
    no_go_flags: [],
  }
}

type Case = {
  readonly name: string
  readonly create: (input: unknown) => ConstructionResult<Record<string, unknown>>
  readonly valid: () => Record<string, unknown>
  readonly tenantlessCode: string
  readonly idField: string
  readonly tsField: string
}

const CASES: readonly Case[] = [
  { name: "createQueryIntentRecord", create: createQueryIntentRecord, valid: validQueryIntent, tenantlessCode: "missing_tenant_id", idField: "query_intent_id", tsField: "created_at" },
  { name: "createSafeQueryPlan", create: createSafeQueryPlan, valid: validSafeQueryPlan, tenantlessCode: "missing_tenant_id", idField: "safe_query_plan_id", tsField: "created_at" },
  { name: "createCompiledSqlArtifact", create: createCompiledSqlArtifact, valid: validCompiledSql, tenantlessCode: "missing_tenant_id", idField: "compiled_sql_artifact_id", tsField: "created_at" },
  { name: "createRuleReviewRecord", create: createRuleReviewRecord, valid: validRuleReview, tenantlessCode: "missing_tenant_id", idField: "rule_review_record_id", tsField: "reviewed_at" },
  { name: "createQueryResultRecord", create: createQueryResultRecord, valid: validQueryResult, tenantlessCode: "missing_tenant_id", idField: "query_result_record_id", tsField: "created_at" },
  { name: "createEvidenceReviewRecord", create: createEvidenceReviewRecord, valid: validEvidenceReview, tenantlessCode: "missing_tenant_id", idField: "evidence_review_id", tsField: "reviewed_at" },
  { name: "createLlmJudgmentRecord", create: createLlmJudgmentRecord, valid: validLlmJudgment, tenantlessCode: "missing_tenant_id", idField: "llm_judgment_id", tsField: "judged_at" },
  { name: "createHumanDecisionRecord", create: createHumanDecisionRecord, valid: validHumanDecision, tenantlessCode: "missing_tenant_id", idField: "human_decision_id", tsField: "reviewed_by_human_at" },
]

const ALL_VALIDATORS: readonly ((i: unknown) => ValidationResult)[] = [
  validateQueryIntentRecord,
  validateSafeQueryPlan,
  validateCompiledSqlArtifact,
  validateRuleReviewRecord,
  validateQueryResultRecord,
  validateEvidenceReviewRecord,
  validateLlmJudgmentRecord,
  validateHumanDecisionRecord,
]

const AUTH_KEYS = [
  "approved",
  "approval",
  "authorized",
  "authorization",
  "execution",
  "executionPermission",
  "executed",
  "permitted",
  "promotion",
  "promoted",
  "granted",
]

function expectSuccess<T>(r: ConstructionResult<T>): T {
  assert.equal(r.ok, true)
  if (!r.ok) throw new Error("unreachable: result was not ok")
  return r.artifact
}

// ─── 1-8: valid input returns ok ────────────────────────────────

for (const c of CASES) {
  test(`${c.name} returns ok with valid input`, () => {
    const r = c.create(c.valid())
    const artifact = expectSuccess(r)
    assert.equal(r.issues.length, 0)
    assert.equal(artifact.tenant_id, "tenant_1")
  })
}

// ─── 9: fails closed on non-object input ────────────────────────

test("constructor fails closed on non-object input", () => {
  const nonObjects: unknown[] = [null, undefined, 42, "str", true]
  for (const c of CASES) {
    for (const bad of nonObjects) {
      const r = c.create(bad)
      assert.equal(r.ok, false, `${c.name} must fail on ${String(bad)}`)
      if (r.ok) continue
      assert.equal(r.issues[0]?.code, "invalid_constructor_input")
    }
  }
})

// ─── 10: fails closed on array input ────────────────────────────

test("constructor fails closed on array input", () => {
  for (const c of CASES) {
    const r = c.create([{ tenant_id: "tenant_1" }])
    assert.equal(r.ok, false, `${c.name} must fail on array`)
    if (r.ok) continue
    assert.equal(r.issues[0]?.code, "invalid_constructor_input")
  }
})

// ─── 11: fails when validator fails ─────────────────────────────

test("constructor result fails when validator fails", () => {
  for (const c of CASES) {
    const input = c.valid()
    input[c.tsField] = "not-a-timestamp"
    const r = c.create(input)
    assert.equal(r.ok, false, `${c.name} must fail on bad timestamp`)
    if (r.ok) continue
    assert.ok(r.issues.length > 0)
    assert.ok(
      r.issues.every((i) => i.code === "output_validation_failed"),
      `${c.name} validator failures map to output_validation_failed`,
    )
    assert.ok(
      r.issues.some((i) => i.message.includes("invalid_timestamp")),
      `${c.name} preserves the underlying validation code`,
    )
  }
})

// ─── 12: does not mutate input ──────────────────────────────────

test("constructor does not mutate input", () => {
  for (const c of CASES) {
    const input = c.valid()
    const before = structuredClone(input)
    c.create(input)
    assert.deepEqual(input, before, `${c.name} must not mutate input`)
    assert.equal(Object.isFrozen(input), false, `${c.name} must not freeze caller input`)
  }
})

// ─── 13: output is frozen ───────────────────────────────────────

test("constructor output is frozen", () => {
  for (const c of CASES) {
    const artifact = expectSuccess(c.create(c.valid()))
    assert.ok(Object.isFrozen(artifact), `${c.name} artifact must be frozen`)
    assert.ok(
      Object.isFrozen((artifact as Record<string, unknown>).no_go_flags),
      `${c.name} nested no_go_flags array must be frozen`,
    )
  }
})

// ─── 14: does not add unknown fields ────────────────────────────

test("constructor does not add unknown fields", () => {
  for (const c of CASES) {
    const input = c.valid()
    input.hacker_field = "sk_live_SHOULD_BE_STRIPPED"
    const artifact = expectSuccess(c.create(input)) as Record<string, unknown>
    assert.equal("hacker_field" in artifact, false, `${c.name} must strip unknown fields`)
  }
})

// ─── 15: does not generate missing ids ──────────────────────────

test("constructor does not generate missing ids", () => {
  for (const c of CASES) {
    const input = c.valid()
    delete input[c.idField]
    const r = c.create(input)
    assert.equal(r.ok, false, `${c.name} must fail when its id is absent`)
    assert.equal("artifact" in r, false, `${c.name} must not fabricate an artifact`)
  }
})

// ─── 16: does not generate missing timestamps ───────────────────

test("constructor does not generate missing timestamps", () => {
  for (const c of CASES) {
    const input = c.valid()
    delete input[c.tsField]
    const r = c.create(input)
    assert.equal(r.ok, false, `${c.name} must fail when its timestamp is absent`)
    assert.equal("artifact" in r, false, `${c.name} must not fabricate a timestamp`)
  }
})

function runAllOk(): boolean[] {
  return CASES.map((c) => c.create(c.valid()).ok)
}

// ─── 17: does not call Date.now / new Date ──────────────────────

test("constructor does not call Date.now or new Date", () => {
  const realNow = Date.now
  const RealDate = globalThis.Date
  let results: boolean[] = []
  try {
    Date.now = () => {
      throw new Error("Date.now must not be called by a constructor")
    }
    const throwingDate = function () {
      throw new Error("new Date must not be called by a constructor")
    } as unknown as DateConstructor
    throwingDate.now = Date.now
    globalThis.Date = throwingDate
    results = runAllOk()
  } finally {
    globalThis.Date = RealDate
    Date.now = realNow
  }
  for (const ok of results) assert.equal(ok, true)
})

// ─── 18: does not call crypto.randomUUID ────────────────────────

test("constructor does not call crypto.randomUUID", () => {
  const cryptoObj = globalThis.crypto as unknown as Record<string, unknown> | undefined
  const realUUID = cryptoObj ? cryptoObj["randomUUID"] : undefined
  let patched = false
  let results: boolean[] = []
  try {
    if (cryptoObj && typeof realUUID === "function") {
      try {
        cryptoObj["randomUUID"] = () => {
          throw new Error("crypto.randomUUID must not be called by a constructor")
        }
        patched = true
      } catch {
        patched = false
      }
    }
    results = runAllOk()
  } finally {
    if (patched && cryptoObj) {
      try {
        cryptoObj["randomUUID"] = realUUID
      } catch {
        /* best-effort restore */
      }
    }
  }
  for (const ok of results) assert.equal(ok, true)
})

// ─── 19: does not call Math.random ──────────────────────────────

test("constructor does not call Math.random", () => {
  const realRandom = Math.random
  let results: boolean[] = []
  try {
    Math.random = () => {
      throw new Error("Math.random must not be called by a constructor")
    }
    results = runAllOk()
  } finally {
    Math.random = realRandom
  }
  for (const ok of results) assert.equal(ok, true)
})

// ─── 20-22: result carries no approval / execution / promotion ──

test("constructor returns ConstructionResult without approval permission", () => {
  for (const c of CASES) {
    const r = c.create(c.valid())
    assert.deepEqual(Object.keys(r).sort(), ["artifact", "issues", "ok"])
    for (const k of AUTH_KEYS) assert.equal(k in r, false, `${c.name} result must not carry ${k}`)
  }
})

test("constructor returns ConstructionResult without execution permission", () => {
  for (const c of CASES) {
    const r = c.create(c.valid())
    assert.equal("execution" in r, false)
    assert.equal("executionPermission" in r, false)
    assert.equal("executed" in r, false)
  }
})

test("constructor returns ConstructionResult without promotion permission", () => {
  for (const c of CASES) {
    const r = c.create(c.valid())
    assert.equal("promotion" in r, false)
    assert.equal("promoted" in r, false)
  }
})

// ─── 23: HumanDecision fails on mismatched judgment id ──────────

test("createHumanDecisionRecord fails when source_llm_judgment_record_id differs from llm_judgment_id", () => {
  const input = validHumanDecision()
  input.source_llm_judgment_record_id = "lj_DIFFERENT"
  const r = createHumanDecisionRecord(input)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(r.issues.some((i) => i.code === "mismatched_llm_judgment_id"))
})

// ─── 24: HumanDecision passes on matching judgment id ───────────

test("createHumanDecisionRecord passes when source_llm_judgment_record_id equals llm_judgment_id", () => {
  // Distinct-but-consistent ids (not the fixture default) so the positive case
  // stands on its own rather than merely preserving equal fixture values.
  const matched = "lj_consistent_777"
  const input = validHumanDecision()
  input.source_llm_judgment_record_id = matched
  input.llm_judgment_id = matched
  const artifact = expectSuccess(createHumanDecisionRecord(input)) as Record<string, unknown>
  assert.equal(artifact.source_llm_judgment_record_id, matched)
  assert.equal(artifact.llm_judgment_id, matched)
  // Standalone helper agrees on the same consistent pair.
  const snap = snapshotConstructorInput(input)
  assert.equal(snap.ok, true)
  if (!snap.ok) return
  assert.equal(ensureHumanDecisionJudgmentIdConsistency(snap.snapshot).ok, true)
})

// ─── 25: single-read snapshot defeats getter-TOCTOU ─────────────

test("constructor takes a single-read snapshot against getter-TOCTOU input", () => {
  let reads = 0
  const base = validQueryIntent()
  delete base.tenant_id
  const input: Record<string, unknown> = { ...base }
  Object.defineProperty(input, "tenant_id", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return reads === 1 ? "tenant_first" : "tenant_MUTATED"
    },
  })
  const artifact = expectSuccess(createQueryIntentRecord(input)) as Record<string, unknown>
  assert.equal(reads, 1, "hostile getter must be read exactly once (snapshot)")
  assert.equal(artifact.tenant_id, "tenant_first")
})

// ─── 26: issues never echo secret-like values ───────────────────

test("construction issues do not echo secret-like values", () => {
  const secret = "sk_live_TOPSECRET_should_never_appear"
  // Invalid array field carrying the secret string, plus a secret no_go flag.
  const input = validQueryIntent()
  input.requested_information = secret
  input.no_go_flags = [secret]
  const r = createQueryIntentRecord(input)
  assert.equal(r.ok, false)
  if (r.ok) return
  const serialized = JSON.stringify(r.issues)
  assert.equal(serialized.includes(secret), false, "issue output must not echo input values")
  // Dropped unknown fields cannot leak either.
  const input2 = validQueryIntent()
  input2.password = secret
  const r2 = createQueryIntentRecord(input2)
  assert.equal(JSON.stringify(r2).includes(secret), false)
})

// ─── 27: validation issue codes preserved / traceable ───────────

test("validation issue codes are preserved or traceable", () => {
  const input = validRuleReview()
  input.rule_review_outcome = "not_a_valid_outcome"
  const r = createRuleReviewRecord(input)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(r.issues.some((i) => i.message.includes("invalid_enum_value")))
  // Direct mapping helper preserves the stable validation code.
  const mapped = validationIssuesToConstructionIssues([
    { code: "missing_tenant_id", field: "tenant_id", message: "missing_tenant_id:tenant_id" },
  ])
  assert.equal(mapped[0]?.code, "output_validation_failed")
  assert.ok(mapped[0]?.message.includes("missing_tenant_id"))
})

// ─── 28: all exported constructors are functions ────────────────

test("all exported constructors are functions", () => {
  for (const c of CASES) assert.equal(typeof c.create, "function", `${c.name} must be a function`)
  assert.equal(typeof freezeConstructedArtifact, "function")
  assert.equal(typeof snapshotConstructorInput, "function")
  assert.equal(typeof ensureHumanDecisionJudgmentIdConsistency, "function")
})

// ─── 29: each constructor calls its matching validator ──────────

test("each constructor calls its matching validator", () => {
  for (const c of CASES) {
    const input = c.valid()
    delete input.tenant_id
    const r = c.create(input)
    assert.equal(r.ok, false, `${c.name} must reject a tenant-less record via its validator`)
    if (r.ok) continue
    assert.ok(
      r.issues.some((i) => i.message.includes(c.tenantlessCode)),
      `${c.name} must surface the matching validator's ${c.tenantlessCode}`,
    )
  }
})

// ─── 30: P6-I0 validators still behave (source of truth) ────────

test("P6-I0 validators still pass their own behavior", () => {
  const validInputs = CASES.map((c) => c.valid())
  ALL_VALIDATORS.forEach((validate, i) => {
    assert.equal(validate(validInputs[i]).ok, true, `validator ${i} accepts a valid record`)
    const tenantless = CASES[i].valid()
    delete tenantless.tenant_id
    assert.equal(validate(tenantless).ok, false, `validator ${i} rejects a tenant-less record`)
  })
})

// ─── P6-FIX-008 (Issue #141): trusted Human Decision type boundary ───────────
//
// Compile-time provenance assertions. These are erased at runtime (pure type
// aliases). The TypeScript compiler fails if either safety literal widens to
// boolean, if the opaque brand is removed, or if the constructor returns the
// unvalidated type — proven by the mutation checks. They reference no undeclared
// runtime variable.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type AssertFalse<T extends false> = T

// four_eyes_required is exactly `true` (not boolean) on the validated artifact.
type _AssertFourEyesTrue = Assert<Equal<ValidatedHumanDecisionRecord["four_eyes_required"], true>>
// self_approval_blocked is exactly `true` (not boolean) on the validated artifact.
type _AssertSelfApprovalTrue = Assert<
  Equal<ValidatedHumanDecisionRecord["self_approval_blocked"], true>
>
// HumanDecisionRecord is exactly the validated artifact type.
type _AssertAlias = Assert<Equal<HumanDecisionRecord, ValidatedHumanDecisionRecord>>
// The unvalidated input is NOT the validated artifact, and is not assignable to it
// (it lacks the literal-true narrowing and the private brand).
type _AssertDistinct = AssertFalse<
  Equal<UnvalidatedHumanDecisionRecordInput, ValidatedHumanDecisionRecord>
>
type IsAssignable<A, B> = A extends B ? true : false
type _AssertNotAssignable = AssertFalse<
  IsAssignable<UnvalidatedHumanDecisionRecordInput, ValidatedHumanDecisionRecord>
>
// A forged object carrying BOTH literal-true safety fields but lacking the
// private brand must still NOT be assignable to the validated artifact. This
// assertion depends specifically on the opaque brand: if the brand is removed
// from ValidatedHumanDecisionRecord, this forged shape becomes structurally
// equal and assignable, and the compile-time assertion fails.
type ForgedWithoutBrand = Omit<
  UnvalidatedHumanDecisionRecordInput,
  "four_eyes_required" | "self_approval_blocked"
> & { readonly four_eyes_required: true; readonly self_approval_blocked: true }
type _AssertBrandRequired = AssertFalse<
  IsAssignable<ForgedWithoutBrand, ValidatedHumanDecisionRecord>
>
// The success artifact of createHumanDecisionRecord is the validated type.
type HumanDecisionSuccessArtifact = Extract<
  ReturnType<typeof createHumanDecisionRecord>,
  { ok: true }
>["artifact"]
type _AssertConstructorArtifact = Assert<
  Equal<HumanDecisionSuccessArtifact, ValidatedHumanDecisionRecord>
>

// Keep the compile-time assertions referenced so they are not dead-elided; the
// values are never inspected at runtime.
test("compile-time trusted-type assertions are wired (runtime no-op)", () => {
  const witnesses: unknown[] = [
    null as unknown as _AssertFourEyesTrue,
    null as unknown as _AssertSelfApprovalTrue,
    null as unknown as _AssertAlias,
    null as unknown as _AssertDistinct,
    null as unknown as _AssertNotAssignable,
    null as unknown as _AssertBrandRequired,
    null as unknown as _AssertConstructorArtifact,
  ]
  assert.equal(witnesses.length, 7)
})

// ─── Constructor semantic behavior ──────────────────────────────

test("createHumanDecisionRecord produces a frozen validated artifact with runtime-true safety fields", () => {
  const artifact = expectSuccess(createHumanDecisionRecord(validHumanDecision())) as Record<string, unknown>
  assert.ok(Object.isFrozen(artifact))
  assert.equal(artifact.four_eyes_required, true)
  assert.equal(artifact.self_approval_blocked, true)
  // No runtime brand field leaks onto the object (compile-time only).
  const symbolKeys = Object.getOwnPropertySymbols(artifact)
  assert.equal(symbolKeys.length, 0, "no symbol-keyed brand on the runtime artifact")
})

test("createHumanDecisionRecord rejects contradictory status/outcome input", () => {
  for (const [status, outcome] of [
    ["ready_for_future_gate_review", "warn"],
    ["blocked_no_go", "pass"],
    ["draft_human_decision", "no_go"],
  ] as const) {
    const input = { ...validHumanDecision(), decision_status: status, decision_outcome: outcome }
    const r = createHumanDecisionRecord(input)
    assert.equal(r.ok, false, `${status}+${outcome}`)
  }
})

test("createHumanDecisionRecord rejects non-action scope with a true gate descriptor", () => {
  const input = {
    ...validHumanDecision(),
    decision_impact_scope: "no_action_decision",
    approval_required: true,
    promotion_required: false,
    execution_required: false,
  }
  assert.equal(createHumanDecisionRecord(input).ok, false)
})

test("createHumanDecisionRecord rejects promotion-without-approval and execution-without-approval", () => {
  const promo = {
    ...validHumanDecision(),
    decision_impact_scope: "action_readiness_assessment",
    approval_required: false,
    promotion_required: true,
    execution_required: false,
  }
  assert.equal(createHumanDecisionRecord(promo).ok, false)
  const exec = {
    ...validHumanDecision(),
    decision_impact_scope: "action_readiness_assessment",
    approval_required: false,
    promotion_required: false,
    execution_required: true,
  }
  assert.equal(createHumanDecisionRecord(exec).ok, false)
})

test("createHumanDecisionRecord accepts the allowed actionable descriptor combinations", () => {
  const allowed = [
    [false, false, false],
    [true, false, false],
    [true, true, false],
    [true, false, true],
    [true, true, true],
  ] as const
  for (const [approval, promotion, execution] of allowed) {
    const input = {
      ...validHumanDecision(),
      decision_impact_scope: "action_readiness_assessment",
      approval_required: approval,
      promotion_required: promotion,
      execution_required: execution,
    }
    assert.equal(
      createHumanDecisionRecord(input).ok,
      true,
      `${approval}/${promotion}/${execution}`,
    )
  }
})

test("createHumanDecisionRecord drops unknown fields and grants nothing", () => {
  const input = { ...validHumanDecision(), sneaky_unknown_field: "x", approved: true }
  const artifact = expectSuccess(createHumanDecisionRecord(input)) as Record<string, unknown>
  assert.equal(Object.prototype.hasOwnProperty.call(artifact, "sneaky_unknown_field"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(artifact, "approved"), false)
})

test("createHumanDecisionRecord does not mutate its input", () => {
  const input = validHumanDecision()
  const before = JSON.stringify(input)
  createHumanDecisionRecord(input)
  assert.equal(JSON.stringify(input), before)
})

// ─── Source-structure guards (read-only) ────────────────────────

const ARTIFACTS_DIR = "../app/lib/phase6/artifacts/"
function readArtifactSrc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`${ARTIFACTS_DIR}${rel}`, import.meta.url)), "utf8")
}
/** Strip block and line comments so a comment cannot satisfy a structural check. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

test("source guard: opaque brand is declared in types.ts and not exported", () => {
  const code = stripComments(readArtifactSrc("types.ts"))
  assert.ok(
    /declare const validatedHumanDecisionRecordBrand: unique symbol/.test(code),
    "brand must be declared as a private unique symbol",
  )
  assert.ok(
    !/export\s+(?:const|type|\{[^}]*)\s*.*validatedHumanDecisionRecordBrand/.test(code),
    "brand symbol must not be exported",
  )
})

test("source guard: ValidatedHumanDecisionRecord carries both literal-true fields and the alias", () => {
  const code = stripComments(readArtifactSrc("types.ts"))
  assert.ok(code.includes("readonly four_eyes_required: true"))
  assert.ok(code.includes("readonly self_approval_blocked: true"))
  assert.ok(code.includes("readonly [validatedHumanDecisionRecordBrand]: true"))
  assert.ok(code.includes("export type HumanDecisionRecord = ValidatedHumanDecisionRecord"))
})

test("source guard: createHumanDecisionRecord returns ConstructionResult<ValidatedHumanDecisionRecord>", () => {
  const code = stripComments(readArtifactSrc("constructors.ts"))
  assert.ok(
    /createHumanDecisionRecord\([\s\S]*?\):\s*ConstructionResult<ValidatedHumanDecisionRecord>/.test(code),
    "constructor must be typed to return the validated artifact",
  )
  // No public branding helper exists.
  assert.ok(!/export\s+function\s+\w*[Bb]rand/.test(code), "no exported branding helper")
})

test("source guard: validateHumanDecisionRecord is non-narrowing (not a type predicate)", () => {
  const code = stripComments(readArtifactSrc("validators.ts"))
  assert.ok(
    /export function validateHumanDecisionRecord\(input: unknown\): ValidationResult/.test(code),
    "validator must return ValidationResult",
  )
  assert.ok(
    !code.includes("input is ValidatedHumanDecisionRecord"),
    "validator must not be a type predicate",
  )
})

test("source guard: no serialized brand field is added to HUMAN_DECISION_RECORD_FIELDS", () => {
  const code = stripComments(readArtifactSrc("constructors.ts"))
  const m = code.match(/HUMAN_DECISION_RECORD_FIELDS = \[([\s\S]*?)\] as const/)
  assert.ok(m, "field list must be present")
  assert.ok(
    !(m as RegExpMatchArray)[1].includes("Brand") && !(m as RegExpMatchArray)[1].includes("brand"),
    "the serialized field list must not include any brand field",
  )
})

test("source guard: semantic validation consumes the existing snapshot with no second input read", () => {
  const code = stripComments(readArtifactSrc("validators.ts"))
  assert.ok(
    code.includes("spec.semanticValidator(snapshot)"),
    "semantic validator must run against the captured snapshot",
  )
  // validateArtifact takes exactly one snapshot: one Object.keys(input) loop.
  const inputKeyReads = (code.match(/for \(const key of Object\.keys\(input\)\)/g) ?? []).length
  assert.equal(inputKeyReads, 1, "exactly one single-read snapshot of the caller input")
  // The semantic validator's parameter is the snapshot, not the raw input.
  assert.ok(
    /function validateHumanDecisionSemantics\(\s*snapshot: Readonly<Record<string, unknown>>,?\s*\)/.test(
      code,
    ),
    "semantic validator consumes a readonly snapshot",
  )
})

test("source guard: no production file outside artifacts/ consumes the validated type as authority", () => {
  // The validated type name must not appear in app/ outside the artifact module.
  // This test reads the artifact module's own files only (allowed set); a repo
  // scan for external consumers is part of the pre-implementation audit and the
  // architecture audit. Here we pin that the type is defined in exactly one file.
  const typesCode = readArtifactSrc("types.ts")
  assert.ok(typesCode.includes("export type ValidatedHumanDecisionRecord = "))
  const validatorsCode = readArtifactSrc("validators.ts")
  assert.ok(
    !validatorsCode.includes("ValidatedHumanDecisionRecord"),
    "validators.ts must not reference the validated type (validation is non-narrowing)",
  )
})

test("source guard: no capability-bearing import is added to the artifact production files", () => {
  const forbidden = [
    ["fet", "ch("],
    ["process", ".env"],
    ["child_", "process"],
    ["node:", "fs"],
    ['from "', 'fs"'],
    ["require", "("],
    ["import", "("],
    ["Approval", "Store"],
    ["execute", "External"],
    ["append", "EvidenceLedger"],
    ["write", "Graph"],
  ]
  for (const rel of ["types.ts", "validation.ts", "validators.ts", "constructors.ts"]) {
    // Strip comments: non-authorization boundary comments legitimately name
    // ApprovalStore etc.; only real code (imports/calls) must be capability-free.
    const code = stripComments(readArtifactSrc(rel))
    for (const [a, b] of forbidden) {
      assert.ok(!code.includes(a + b), `${rel} must not contain: <<<${a + b}>>>`)
    }
  }
})
