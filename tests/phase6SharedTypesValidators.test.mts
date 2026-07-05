import test from "node:test"
import assert from "node:assert/strict"
import {
  validateQueryIntentRecord,
  validateSafeQueryPlan,
  validateCompiledSqlArtifact,
  validateRuleReviewRecord,
  validateQueryResultRecord,
  validateEvidenceReviewRecord,
  validateLlmJudgmentRecord,
  validateHumanDecisionRecord,
  VALIDATION_ISSUE_CODES,
  RULE_REVIEW_STATUSES,
  EVIDENCE_REVIEW_STATUSES,
  LLM_JUDGMENT_STATUSES,
  HUMAN_DECISION_STATUSES,
  OUTCOMES,
  REDACTION_STATES,
  SOURCE_TRUST_MARKERS,
  CONFLICT_STATES,
  UNCERTAINTY_STATES,
  DECISION_IMPACT_SCOPES,
  type ValidationResult,
} from "../app/lib/phase6/artifacts/index.ts"

const HEX = "a".repeat(64)
const T = "2026-07-05T00:00:00Z"

// ─── Valid fixtures for all eight artifacts ─────────────────────

const validQueryIntent = () => ({
  query_intent_id: "qi-1",
  tenant_id: "tenant-1",
  actor_id: "actor-1",
  input_signal_id: "sig-1",
  intent_summary: "count open workunits",
  requested_information: ["open workunit count"],
  allowed_sources: ["work_units"],
  disallowed_sources: ["auth_identities"],
  tenant_scope_required: true,
  human_review_required: true,
  created_at: T,
  no_go_flags: [],
})

const validSafeQueryPlan = () => ({
  safe_query_plan_id: "sqp-1",
  tenant_id: "tenant-1",
  source_query_intent_id: "qi-1",
  query_goal: "count open workunits for tenant",
  allowed_tables: ["work_units"],
  selected_columns: ["status"],
  tenant_scope_filter_required: true,
  denied_operations: ["INSERT", "UPDATE", "DELETE"],
  estimated_result_shape: "count_result",
  human_review_required: true,
  created_at: T,
  no_go_flags: [],
})

const validCompiledSqlArtifact = () => ({
  compiled_sql_artifact_id: "csa-1",
  tenant_id: "tenant-1",
  source_safe_query_plan_id: "sqp-1",
  source_query_intent_id: "qi-1",
  sql_hash: HEX,
  sql_text_redaction_state: "not_required",
  read_only: true,
  mutation_detected: false,
  tenant_scope_filter_present: true,
  selected_columns: ["status"],
  created_at: T,
  no_go_flags: [],
})

const validRuleReviewRecord = () => ({
  rule_review_record_id: "rrr-1",
  tenant_id: "tenant-1",
  source_compiled_sql_artifact_id: "csa-1",
  source_safe_query_plan_id: "sqp-1",
  source_query_intent_id: "qi-1",
  rule_review_status: "ready_for_future_execution_gate_review",
  rule_review_outcome: "pass",
  read_only_check_result: "pass",
  tenant_scope_check_result: "pass",
  denied_schema_check_result: "pass",
  human_review_required: false,
  reviewed_at: T,
  no_go_flags: [],
})

const validQueryResultRecord = () => ({
  query_result_record_id: "qrr-1",
  tenant_id: "tenant-1",
  source_rule_review_record_id: "rrr-1",
  source_compiled_sql_artifact_id: "csa-1",
  source_safe_query_plan_id: "sqp-1",
  source_query_intent_id: "qi-1",
  selected_source_rows: ["work_units:rowid-strategy"],
  selected_columns: ["work_units.status"],
  provenance_complete: true,
  evidence_eligible: true,
  result_hash: HEX,
  content_integrity_reference: `sha256:${HEX}`,
  redaction_state: "not_required",
  aggregation_method: "count",
  source_scope: "tenant-1 open work_units",
  source_trust_marker: "derived_query_result",
  conflict_state: "no_conflict",
  human_review_required: true,
  created_at: T,
  no_go_flags: [],
})

const validEvidenceReviewRecord = () => ({
  evidence_review_id: "err-1",
  tenant_id: "tenant-1",
  source_query_result_record_id: "qrr-1",
  source_rule_review_record_id: "rrr-1",
  source_compiled_sql_artifact_id: "csa-1",
  source_safe_query_plan_id: "sqp-1",
  source_query_intent_id: "qi-1",
  evidence_review_status: "ready_for_human_evidence_review",
  evidence_review_outcome: "pass",
  evidence_claim: "there are 12 open workunits",
  evidence_type: "count_result supports",
  source_trust_marker: "derived_query_result",
  evidence_eligible: true,
  evidence_accepted: false,
  human_review_required: true,
  result_hash_check_result: "pass",
  content_integrity_check_result: "pass",
  reviewed_at: T,
  no_go_flags: [],
})

const validLlmJudgmentRecord = () => ({
  llm_judgment_id: "ljr-1",
  tenant_id: "tenant-1",
  source_evidence_review_record_id: "err-1",
  source_query_result_record_id: "qrr-1",
  source_rule_review_record_id: "rrr-1",
  source_compiled_sql_artifact_id: "csa-1",
  source_safe_query_plan_id: "sqp-1",
  source_query_intent_id: "qi-1",
  judgment_status: "ready_for_human_judgment_review",
  judgment_outcome: "pass",
  judgment_summary: "the open workunit count appears stable",
  judgment_claims: ["count is 12"],
  evidence_references: ["err-1"],
  provenance_references: ["qrr-1"],
  uncertainty_state: "low_uncertainty",
  confidence_explanation: "single first-party source, no conflict",
  unsupported_inferences: [],
  conflict_handling_summary: "no conflict detected",
  human_review_required: true,
  allowed_use: ["human review support"],
  disallowed_use: ["action authorization"],
  judged_at: T,
  no_go_flags: [],
})

const validHumanDecisionRecord = () => ({
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

type Case = {
  readonly name: string
  readonly validate: (input: unknown) => ValidationResult
  readonly fixture: () => Record<string, unknown>
  readonly lineageField: string
  readonly statusField: string | null
}

const CASES: readonly Case[] = [
  { name: "QueryIntentRecord", validate: validateQueryIntentRecord, fixture: validQueryIntent, lineageField: "input_signal_id", statusField: null },
  { name: "SafeQueryPlan", validate: validateSafeQueryPlan, fixture: validSafeQueryPlan, lineageField: "source_query_intent_id", statusField: null },
  { name: "CompiledSqlArtifact", validate: validateCompiledSqlArtifact, fixture: validCompiledSqlArtifact, lineageField: "source_safe_query_plan_id", statusField: null },
  { name: "RuleReviewRecord", validate: validateRuleReviewRecord, fixture: validRuleReviewRecord, lineageField: "source_compiled_sql_artifact_id", statusField: "rule_review_status" },
  { name: "QueryResultRecord", validate: validateQueryResultRecord, fixture: validQueryResultRecord, lineageField: "source_rule_review_record_id", statusField: null },
  { name: "EvidenceReviewRecord", validate: validateEvidenceReviewRecord, fixture: validEvidenceReviewRecord, lineageField: "source_query_result_record_id", statusField: "evidence_review_status" },
  { name: "LlmJudgmentRecord", validate: validateLlmJudgmentRecord, fixture: validLlmJudgmentRecord, lineageField: "source_evidence_review_record_id", statusField: "judgment_status" },
  { name: "HumanDecisionRecord", validate: validateHumanDecisionRecord, fixture: validHumanDecisionRecord, lineageField: "source_evidence_review_record_id", statusField: "decision_status" },
]

function codes(result: ValidationResult): string[] {
  return result.issues.map((i) => i.code)
}

// ─── 1-8: valid fixtures pass ───────────────────────────────────

for (const c of CASES) {
  test(`valid ${c.name} passes`, () => {
    const result = c.validate(c.fixture())
    assert.deepEqual(result.issues, [])
    assert.equal(result.ok, true)
  })
}

// ─── 9-22: fail-closed behaviors (table-driven per artifact) ────

for (const c of CASES) {
  test(`${c.name}: non-object and array input fail closed`, () => {
    for (const bad of [null, undefined, "text", 42, true]) {
      const result = c.validate(bad)
      assert.equal(result.ok, false)
      assert.ok(codes(result).includes("invalid_record"))
    }
    const arrayResult = c.validate([c.fixture()])
    assert.equal(arrayResult.ok, false)
    assert.ok(codes(arrayResult).includes("invalid_record"))
  })

  test(`${c.name}: missing and empty tenant_id fail closed`, () => {
    const missing: Record<string, unknown> = { ...c.fixture() }
    delete missing.tenant_id
    assert.ok(codes(c.validate(missing)).includes("missing_tenant_id"))

    const empty = { ...c.fixture(), tenant_id: "" }
    assert.ok(codes(c.validate(empty)).includes("invalid_tenant_id"))
  })

  test(`${c.name}: missing lineage id fails closed`, () => {
    const record: Record<string, unknown> = { ...c.fixture() }
    delete record[c.lineageField]
    assert.ok(codes(c.validate(record)).includes("missing_lineage_id"))
  })

  test(`${c.name}: unknown top-level field fails closed`, () => {
    const result = c.validate({ ...c.fixture(), display_only_label: "mutable ui" })
    assert.equal(result.ok, false)
    assert.ok(codes(result).includes("unknown_field"))
  })

  test(`${c.name}: non-empty no_go_flags fails unless status is blocked_no_go`, () => {
    const flagged = { ...c.fixture(), no_go_flags: ["cross_tenant_lineage"] }
    const result = c.validate(flagged)
    assert.equal(result.ok, false)
    assert.ok(codes(result).includes("no_go_flags_present"))

    if (c.statusField !== null) {
      const blocked = {
        ...c.fixture(),
        [c.statusField]: "blocked_no_go",
        no_go_flags: ["cross_tenant_lineage"],
      }
      assert.ok(!codes(c.validate(blocked)).includes("no_go_flags_present"))
    }
  })

  test(`${c.name}: validator does not mutate input`, () => {
    const input = c.fixture()
    const snapshot = JSON.stringify(input)
    c.validate(input)
    assert.equal(JSON.stringify(input), snapshot)
  })
}

// ─── Format-specific fail-closed cases ──────────────────────────

test("invalid sha256 hex fails closed", () => {
  const badHash = { ...validCompiledSqlArtifact(), sql_hash: "ABC" }
  assert.ok(codes(validateCompiledSqlArtifact(badHash)).includes("invalid_sha256_hex"))

  const upper = { ...validQueryResultRecord(), result_hash: HEX.toUpperCase() }
  assert.ok(codes(validateQueryResultRecord(upper)).includes("invalid_sha256_hex"))
})

test("invalid content_integrity_reference fails closed", () => {
  for (const bad of [HEX, `sha256:${HEX.slice(0, 63)}`, `md5:${HEX}`]) {
    const record = { ...validQueryResultRecord(), content_integrity_reference: bad }
    assert.ok(
      codes(validateQueryResultRecord(record)).includes("invalid_content_integrity_reference"),
    )
  }
})

test("invalid enum value fails closed", () => {
  const badTrust = { ...validQueryResultRecord(), source_trust_marker: "trusted" }
  assert.ok(codes(validateQueryResultRecord(badTrust)).includes("invalid_enum_value"))

  const badScope = { ...validHumanDecisionRecord(), decision_impact_scope: "auto_execute" }
  assert.ok(codes(validateHumanDecisionRecord(badScope)).includes("invalid_enum_value"))
})

test("invalid timestamp fails closed", () => {
  for (const bad of ["2026/07/05", "2026-07-05T00:00:00+09:00", "not-a-time"]) {
    const record = { ...validQueryIntent(), created_at: bad }
    assert.ok(codes(validateQueryIntentRecord(record)).includes("invalid_timestamp"))
  }
})

test("null required field is distinguished from missing field", () => {
  const withNull = { ...validQueryIntent(), intent_summary: null }
  assert.ok(codes(validateQueryIntentRecord(withNull)).includes("null_required_field"))

  const missing: Record<string, unknown> = { ...validQueryIntent() }
  delete missing.intent_summary
  assert.ok(codes(validateQueryIntentRecord(missing)).includes("missing_required_field"))

  // Documented explicit-null allowance: aggregation_method / source_scope.
  const nullAggregation = {
    ...validQueryResultRecord(),
    aggregation_method: null,
    source_scope: null,
  }
  assert.equal(validateQueryResultRecord(nullAggregation).ok, true)
})

test("object where array expected fails closed", () => {
  const record = { ...validSafeQueryPlan(), allowed_tables: { table: "work_units" } }
  assert.ok(codes(validateSafeQueryPlan(record)).includes("invalid_array"))
})

test("array where string expected fails closed", () => {
  const record = { ...validQueryIntent(), intent_summary: ["not", "a", "string"] }
  assert.ok(codes(validateQueryIntentRecord(record)).includes("invalid_field_type"))
})

// ─── Stability, boundary, and hygiene cases ─────────────────────

test("validation issue codes are stable and include all required codes", () => {
  const required = [
    "invalid_record",
    "missing_required_field",
    "null_required_field",
    "invalid_field_type",
    "invalid_enum_value",
    "invalid_timestamp",
    "invalid_sha256_hex",
    "invalid_content_integrity_reference",
    "invalid_array",
    "invalid_object",
    "unknown_field",
    "missing_tenant_id",
    "invalid_tenant_id",
    "missing_lineage_id",
    "invalid_lineage_id",
    "no_go_flags_present",
    "cross_tenant_lineage_not_checked",
    "validation_exception",
  ]
  for (const code of required) {
    assert.ok(
      (VALIDATION_ISSUE_CODES as readonly string[]).includes(code),
      `missing code ${code}`,
    )
  }
})

test("action_readiness_assessment does not imply execution", () => {
  const record = {
    ...validHumanDecisionRecord(),
    decision_impact_scope: "action_readiness_assessment",
    execution_required: false,
  }
  const result = validateHumanDecisionRecord(record)
  assert.equal(result.ok, true)
  // Validation output carries no execution grant of any kind.
  assert.deepEqual(Object.keys(result).sort(), ["issues", "ok"])
})

test("promotion_readiness_assessment does not imply Formal WorkUnit promotion", () => {
  const record = {
    ...validHumanDecisionRecord(),
    decision_impact_scope: "promotion_readiness_assessment",
    promotion_required: false,
  }
  const result = validateHumanDecisionRecord(record)
  assert.equal(result.ok, true)
  assert.deepEqual(Object.keys(result).sort(), ["issues", "ok"])
})

test("validation pass does not include approval or execution permission", () => {
  for (const c of CASES) {
    const result = c.validate(c.fixture())
    assert.equal(result.ok, true)
    assert.deepEqual(Object.keys(result).sort(), ["issues", "ok"])
    const serialized = JSON.stringify(result)
    for (const grantWord of ["approved", "authorized", "execution_permission", "promoted"]) {
      assert.ok(!serialized.includes(grantWord), `${c.name} result contains ${grantWord}`)
    }
  }
})

test("validators do not expose secret-like values in issue messages", () => {
  const secret = "SECRET-TOKEN-VALUE-XYZ"
  const record = { ...validCompiledSqlArtifact(), sql_hash: secret, tenant_id: secret + "-t" }
  const result = validateCompiledSqlArtifact(record)
  assert.equal(result.ok, false)
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes(secret))
})

test("getter-based TOCTOU cannot bypass the no_go_flags policy", () => {
  // A hostile input whose no_go_flags getter returns [] on the first read and
  // ["x"] afterwards (or vice versa) must not diverge: the single-read
  // snapshot means whichever value the one read observes governs the whole
  // validation. With first-read = non-empty flags, the record must fail.
  let reads = 0
  const hostile: Record<string, unknown> = { ...validRuleReviewRecord() }
  Object.defineProperty(hostile, "no_go_flags", {
    enumerable: true,
    get() {
      reads += 1
      return reads <= 1 ? ["cross_tenant_lineage"] : []
    },
  })
  const result = validateRuleReviewRecord(hostile)
  assert.equal(result.ok, false)
  assert.ok(codes(result).includes("no_go_flags_present"))
  // The snapshot read the getter exactly once.
  assert.equal(reads, 1)
})

test("all exported validators are functions", () => {
  for (const c of CASES) {
    assert.equal(typeof c.validate, "function")
  }
})

test("all literal union values are represented", () => {
  assert.deepEqual([...RULE_REVIEW_STATUSES], [
    "draft_review",
    "clarification_needed",
    "blocked_no_go",
    "ready_for_future_execution_gate_review",
  ])
  assert.deepEqual([...EVIDENCE_REVIEW_STATUSES], [
    "draft_evidence_review",
    "clarification_needed",
    "blocked_no_go",
    "ready_for_human_evidence_review",
  ])
  assert.deepEqual([...LLM_JUDGMENT_STATUSES], [
    "draft_judgment",
    "clarification_needed",
    "blocked_no_go",
    "ready_for_human_judgment_review",
  ])
  assert.deepEqual([...HUMAN_DECISION_STATUSES], [
    "draft_human_decision",
    "clarification_needed",
    "blocked_no_go",
    "ready_for_future_gate_review",
  ])
  assert.deepEqual([...OUTCOMES], ["pass", "warn", "fail", "no_go"])
  assert.deepEqual([...REDACTION_STATES], [
    "not_required",
    "redacted",
    "partially_redacted",
    "redaction_required",
    "redaction_unknown",
    "redaction_failed",
  ])
  assert.deepEqual([...SOURCE_TRUST_MARKERS], [
    "first_party_system_record",
    "integration_provided_record",
    "user_provided_record",
    "derived_query_result",
    "aggregated_result",
    "unknown_source",
    "untrusted_source",
  ])
  assert.deepEqual([...CONFLICT_STATES], [
    "no_conflict",
    "conflict_detected",
    "unresolved_conflict",
    "source_disagreement",
    "missing_information",
    "unknown",
  ])
  assert.deepEqual([...UNCERTAINTY_STATES], [
    "low_uncertainty",
    "medium_uncertainty",
    "high_uncertainty",
    "unknown_uncertainty",
    "conflicting_evidence",
    "insufficient_evidence",
  ])
  assert.deepEqual([...DECISION_IMPACT_SCOPES], [
    "priority_assessment",
    "risk_assessment",
    "action_readiness_assessment",
    "promotion_readiness_assessment",
    "evidence_acceptance",
    "judgment_acceptance",
    "no_action_decision",
    "clarification_request",
    "defer_decision",
  ])

  // Every enum value passes through its validator where the enum is used.
  for (const state of REDACTION_STATES) {
    const record = { ...validQueryResultRecord(), redaction_state: state }
    assert.ok(!codes(validateQueryResultRecord(record)).includes("invalid_enum_value"))
  }
  for (const marker of SOURCE_TRUST_MARKERS) {
    const record = { ...validQueryResultRecord(), source_trust_marker: marker }
    assert.ok(!codes(validateQueryResultRecord(record)).includes("invalid_enum_value"))
  }
  for (const state of CONFLICT_STATES) {
    const record = { ...validQueryResultRecord(), conflict_state: state }
    assert.ok(!codes(validateQueryResultRecord(record)).includes("invalid_enum_value"))
  }
  for (const state of UNCERTAINTY_STATES) {
    const record = { ...validLlmJudgmentRecord(), uncertainty_state: state }
    assert.ok(!codes(validateLlmJudgmentRecord(record)).includes("invalid_enum_value"))
  }
  for (const scope of DECISION_IMPACT_SCOPES) {
    const record = { ...validHumanDecisionRecord(), decision_impact_scope: scope }
    assert.ok(!codes(validateHumanDecisionRecord(record)).includes("invalid_enum_value"))
  }
  for (const status of RULE_REVIEW_STATUSES) {
    const record = { ...validRuleReviewRecord(), rule_review_status: status }
    assert.ok(!codes(validateRuleReviewRecord(record)).includes("invalid_enum_value"))
  }
  for (const status of EVIDENCE_REVIEW_STATUSES) {
    const record = { ...validEvidenceReviewRecord(), evidence_review_status: status }
    assert.ok(!codes(validateEvidenceReviewRecord(record)).includes("invalid_enum_value"))
  }
  for (const status of LLM_JUDGMENT_STATUSES) {
    const record = { ...validLlmJudgmentRecord(), judgment_status: status }
    assert.ok(!codes(validateLlmJudgmentRecord(record)).includes("invalid_enum_value"))
  }
  for (const status of HUMAN_DECISION_STATUSES) {
    const record = { ...validHumanDecisionRecord(), decision_status: status }
    assert.ok(!codes(validateHumanDecisionRecord(record)).includes("invalid_enum_value"))
  }
  for (const outcome of OUTCOMES) {
    const record = { ...validRuleReviewRecord(), rule_review_outcome: outcome }
    assert.ok(!codes(validateRuleReviewRecord(record)).includes("invalid_enum_value"))
  }
})
