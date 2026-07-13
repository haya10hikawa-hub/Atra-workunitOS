import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { isIsoUtcTimestamp } from "../app/lib/phase6/shared/isoUtcTimestamp.ts"
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
  resultOf,
  issue,
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
    "forbidden_grant_field_present",
    "missing_tenant_id",
    "invalid_tenant_id",
    "missing_lineage_id",
    "invalid_lineage_id",
    "safety_boundary_not_confirmed",
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

// ─── P6-FIX-007b (Issue #121): frozen ValidationResult runtime snapshot ──────
//
// Every artifact ValidationResult is a completed immutable snapshot: the result
// object is frozen, the issues array is a cloned + frozen snapshot (never the
// caller's mutable accumulator), and neither can be mutated by a caller.
// Freezing grants nothing — a frozen valid result stays valid and a frozen
// invalid result stays invalid.

test("artifact valid and invalid results are frozen with frozen issues arrays", () => {
  for (const c of CASES) {
    const valid = c.validate(c.fixture())
    assert.equal(valid.ok, true, c.name)
    assert.ok(Object.isFrozen(valid), `${c.name}: valid result must be frozen`)
    assert.ok(Object.isFrozen(valid.issues), `${c.name}: valid issues must be frozen`)

    const invalid = c.validate({})
    assert.equal(invalid.ok, false, c.name)
    assert.ok(Object.isFrozen(invalid), `${c.name}: invalid result must be frozen`)
    assert.ok(Object.isFrozen(invalid.issues), `${c.name}: invalid issues must be frozen`)
  }
})

test("artifact result cannot be mutated: ok, issues length, entries, and order hold", () => {
  const result = validateQueryResultRecord({ source_trust_marker: "trusted" })
  assert.equal(result.ok, false)
  const before = {
    ok: result.ok,
    issues: result.issues.map((entry) => ({ ...entry })),
  }

  // Attempt to flip ok.
  try {
    ;(result as { ok: boolean }).ok = !result.ok
  } catch {
    // Expected TypeError for a frozen object in strict mode.
  }
  // Attempt to push / pop / splice / replace an entry.
  try {
    ;(result.issues as ValidationResult["issues"][number][]).push(issue("invalid_record", "(x)"))
  } catch {
    /* expected */
  }
  try {
    ;(result.issues as ValidationResult["issues"][number][]).pop()
  } catch {
    /* expected */
  }
  try {
    ;(result.issues as ValidationResult["issues"][number][]).splice(0, 1)
  } catch {
    /* expected */
  }
  try {
    ;(result.issues as unknown as Record<number, unknown>)[0] = issue("invalid_object", "(y)")
  } catch {
    /* expected */
  }

  assert.equal(result.ok, before.ok)
  assert.equal(result.issues.length, before.issues.length)
  assert.deepEqual(
    result.issues.map((entry) => ({ ...entry })),
    before.issues,
  )
  assert.deepEqual(
    result.issues.map((i) => `${i.code}:${i.field}:${i.message}`),
    before.issues.map((i) => `${i.code}:${i.field}:${i.message}`),
  )
})

test("artifacts resultOf detaches from the supplied source array", () => {
  const source = [issue("invalid_record", "(root)")]
  const result = resultOf(source)
  const before = [...result.issues]

  // Mutating the source after the fact must not change the returned snapshot.
  source.length = 0

  assert.deepEqual([...result.issues], before)
  assert.notEqual(result.issues as unknown, source as unknown)
  assert.equal(result.issues.length, 1)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.issues))
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

// ─── P6-FIX-004 (Issue #115): shared semantic ISO-8601 UTC guard ─────────────
//
// One shared leaf guard (app/lib/phase6/shared/isoUtcTimestamp.ts) now backs
// every Phase 6 timestamp predicate. It validates both the pinned UTC structure
// and real Gregorian calendar/clock semantics, replacing four structural-only
// regex copies that accepted non-existent dates such as 2026-99-99.

const SHARED_ISO_VALID: readonly string[] = [
  "2026-01-01T00:00:00Z",
  "2026-12-31T23:59:59Z",
  "2026-01-01T00:00:00.1Z",
  "2026-01-01T00:00:00.12Z",
  "2026-01-01T00:00:00.123Z",
  "2024-02-29T12:34:56Z", // leap year (div by 4, not 100)
  "2000-02-29T00:00:00Z", // leap year (div by 400)
  "1900-02-28T23:59:59Z", // 1900 is NOT a leap year; Feb 28 is valid
]

const SHARED_ISO_INVALID_SEMANTIC: readonly string[] = [
  "2026-00-01T00:00:00Z", // month 00
  "2026-13-01T00:00:00Z", // month 13
  "2026-01-00T00:00:00Z", // day 00
  "2026-02-29T00:00:00Z", // 2026 not a leap year
  "2026-02-30T00:00:00Z", // February 30 never exists
  "2026-04-31T00:00:00Z", // April has 30 days
  "1900-02-29T00:00:00Z", // 1900 not a leap year (div by 100, not 400)
  "2026-01-01T24:00:00Z", // hour 24
  "2026-01-01T25:00:00Z", // hour 25
  "2026-01-01T00:60:00Z", // minute 60
  "2026-01-01T00:00:60Z", // second 60 (leap second rejected)
  "2026-99-99T99:99:99.999Z", // month/day/hour/min/sec 99
  "2026-99-01T00:00:00Z",
  "2026-01-99T00:00:00Z",
  "2026-01-01T99:00:00Z",
]

const SHARED_ISO_INVALID_STRUCTURAL: readonly unknown[] = [
  "2026-01-01T00:00:00z", // lowercase z
  "2026-01-01T00:00:00+09:00", // timezone offset
  "2026-01-01T00:00:00", // missing Z
  "2026-01-01T00:00Z", // missing seconds
  "2026-01-01T00:00:00.1234Z", // four fractional digits
  "2026-01-01T00:00:00Z ", // trailing whitespace
  " 2026-01-01T00:00:00Z", // leading whitespace
  12345, // non-string number
  null,
  undefined,
  ["2026-01-01T00:00:00Z"], // array
  { created_at: "2026-01-01T00:00:00Z" }, // object
]

test("shared isIsoUtcTimestamp accepts valid UTC timestamps", () => {
  for (const t of SHARED_ISO_VALID) {
    assert.equal(isIsoUtcTimestamp(t), true, `expected valid: ${t}`)
  }
})

test("shared isIsoUtcTimestamp rejects semantically invalid calendar/clock values", () => {
  for (const t of SHARED_ISO_INVALID_SEMANTIC) {
    assert.equal(isIsoUtcTimestamp(t), false, `expected rejected (semantic): ${t}`)
  }
})

test("shared isIsoUtcTimestamp rejects structurally invalid values without throwing", () => {
  for (const t of SHARED_ISO_INVALID_STRUCTURAL) {
    assert.doesNotThrow(() => isIsoUtcTimestamp(t))
    assert.equal(isIsoUtcTimestamp(t), false, `expected rejected (structural): ${JSON.stringify(t)}`)
  }
})

// Non-vacuity: a test-local copy of the OLD structural-only regex accepts the
// pinned invalid dates, while the shared semantic guard rejects them. This
// proves the guard (and the tests exercising it) catch the original defect.
test("non-vacuity: old structural regex accepts pinned invalid dates the shared guard rejects", () => {
  const OLD_STRUCTURAL_ONLY = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
  const pinned = [
    "2026-13-01T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-01-01T25:00:00Z",
    "2026-99-99T99:99:99.999Z",
  ]
  for (const t of pinned) {
    assert.equal(OLD_STRUCTURAL_ONLY.test(t), true, `old regex should accept: ${t}`)
    assert.equal(isIsoUtcTimestamp(t), false, `shared guard should reject: ${t}`)
  }
})

// Integration: every timestamp-bearing artifact field rejects the three pinned
// invalid cases via the module's existing invalid_timestamp code, still points
// at the right field, does not echo the value, and keeps accepting valid
// leap-day / fractional timestamps.
const ARTIFACT_TIMESTAMP_CASES: readonly [
  string,
  (r: Record<string, unknown>) => ValidationResult,
  () => Record<string, unknown>,
  string,
][] = [
  ["query_intent.created_at", validateQueryIntentRecord, validQueryIntent, "created_at"],
  ["safe_query_plan.created_at", validateSafeQueryPlan, validSafeQueryPlan, "created_at"],
  ["compiled_sql.created_at", validateCompiledSqlArtifact, validCompiledSqlArtifact, "created_at"],
  ["query_result.created_at", validateQueryResultRecord, validQueryResultRecord, "created_at"],
  ["rule_review.reviewed_at", validateRuleReviewRecord, validRuleReviewRecord, "reviewed_at"],
  ["evidence_review.reviewed_at", validateEvidenceReviewRecord, validEvidenceReviewRecord, "reviewed_at"],
  ["llm_judgment.judged_at", validateLlmJudgmentRecord, validLlmJudgmentRecord, "judged_at"],
  ["human_decision.reviewed_by_human_at", validateHumanDecisionRecord, validHumanDecisionRecord, "reviewed_by_human_at"],
]

const PINNED_INVALID = ["2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "2026-01-01T25:00:00Z"]

test("artifact timestamp fields reject pinned invalid calendar values with invalid_timestamp", () => {
  for (const [label, validate, build, field] of ARTIFACT_TIMESTAMP_CASES) {
    for (const bad of PINNED_INVALID) {
      const result = validate({ ...build(), [field]: bad })
      const tsIssues = result.issues.filter((i) => i.code === "invalid_timestamp")
      assert.ok(tsIssues.length > 0, `${label}: expected invalid_timestamp for ${bad}`)
      assert.ok(
        tsIssues.some((i) => i.field === field),
        `${label}: invalid_timestamp should point at ${field}`,
      )
      for (const i of result.issues) {
        assert.equal(i.message, `${i.code}:${i.field}`, `${label}: message must not echo value`)
        assert.ok(!i.message.includes(bad), `${label}: message must not echo timestamp`)
      }
    }
    // Valid leap-day and fractional timestamps still pass at this field.
    for (const good of ["2024-02-29T12:34:56Z", "2026-01-01T00:00:00.123Z"]) {
      const result = validate({ ...build(), [field]: good })
      assert.ok(
        !codes(result).includes("invalid_timestamp"),
        `${label}: valid timestamp ${good} must pass`,
      )
    }
  }
})

test("artifact timestamp error ordering stays stable when combined with another error", () => {
  // A record with both an invalid timestamp and an invalid enum: the issue list
  // remains deterministic across repeated validations.
  const build = () => ({ ...validQueryResultRecord(), created_at: "2026-13-01T00:00:00Z", source_trust_marker: "trusted" })
  const first = validateQueryResultRecord(build()).issues.map((i) => `${i.code}:${i.field}`)
  const second = validateQueryResultRecord(build()).issues.map((i) => `${i.code}:${i.field}`)
  assert.deepEqual(first, second)
  assert.ok(first.includes("invalid_timestamp:created_at"))
})

// Definition-deduplication: the shared guard is the single Phase 6 timestamp
// regex definition; the four consumers import it and no longer define their own.
const P6_ROOT = fileURLToPath(new URL("../app/lib/phase6/", import.meta.url))
const SHARED_GUARD_SRC = fileURLToPath(
  new URL("../app/lib/phase6/shared/isoUtcTimestamp.ts", import.meta.url),
)
const CONSUMER_SRCS: readonly string[] = [
  "artifacts/validation.ts",
  "persistenceTargetDecision/validators.ts",
  "persistenceAuditEvidence/validators.ts",
  "recorderAuditSummary/validators.ts",
].map((rel) => fileURLToPath(new URL(`../app/lib/phase6/${rel}`, import.meta.url)))

test("shared timestamp guard file exists and exports the predicate", () => {
  const text = readFileSync(SHARED_GUARD_SRC, "utf8")
  assert.ok(text.includes("export function isIsoUtcTimestamp"))
})

test("four consumers import the shared guard and define no local ISO regex", () => {
  for (const src of CONSUMER_SRCS) {
    const text = readFileSync(src, "utf8")
    assert.ok(
      text.includes('from "../shared/isoUtcTimestamp.ts"'),
      `${src} must import the shared guard`,
    )
    assert.ok(!text.includes("ISO_8601_UTC"), `${src} must not define a local ISO_8601_UTC regex`)
  }
})

test("the pinned ISO timestamp regex is defined in exactly one Phase 6 file", () => {
  // Scan app/lib/phase6/** application source only (not this test file's
  // non-vacuity fixture). The literal digit-placement profile must appear in a
  // single file: the shared guard.
  const NEEDLE = "\\d{4})-(\\d{2})-(\\d{2})T"
  const files = listTsFiles(P6_ROOT)
  const defining = files.filter((f) => readFileSync(f, "utf8").includes(NEEDLE))
  assert.deepEqual(defining, [SHARED_GUARD_SRC], `only the shared guard may define the ISO regex`)
})

// Shared-module source guard: the leaf must carry no runtime capability. The
// needle list is split so this assertion never self-matches its own tokens.
test("shared timestamp guard source contains no forbidden runtime capability", () => {
  const text = readFileSync(SHARED_GUARD_SRC, "utf8")
  const forbidden = [
    ["Date", ".now"],
    ["new ", "Date"],
    ["Date", ".parse"],
    ["Temp", "oral"],
    ["Math", ".random"],
    ["random", "UUID"],
    ["fet", "ch("],
    ["process", ".env"],
    ["node:", "fs"],
    ["child_", "process"],
    ["Approval", "Store"],
    ["append", "EvidenceLedger"],
    ["write", "Graph"],
    ["execute", "External"],
  ]
  for (const [a, b] of forbidden) {
    assert.ok(!text.includes(a + b), `shared guard must not contain: <<<${a + b}>>>`)
  }
})

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = `${dir}${entry}`
    if (statSync(full).isDirectory()) out.push(...listTsFiles(`${full}/`))
    else if (full.endsWith(".ts")) out.push(full)
  }
  return out
}

// ─── P6-FIX-005 (Issue #116): canonical shared grant-like denylist ───────────
//
// One canonical shared leaf (app/lib/phase6/shared/forbiddenGrantFields.ts) now
// backs every Phase 6 grant-like field classification, replacing three drifted
// local copies (13/17/20 names) and giving the eight artifact validators a
// dedicated forbidden_grant_field_present code instead of the generic
// unknown_field. The 20 expected names below are hardcoded independently of
// the production constant (rather than imported and reflected back), so a
// production-list regression — a dropped, renamed, or misspelled name — is
// detectable here.

const CANONICAL_FORBIDDEN_GRANT_FIELDS = [
  "approval",
  "approved",
  "authorized",
  "execution_permission",
  "executed",
  "promotion_permission",
  "promoted",
  "persistence_permission",
  "persisted",
  "storage_permission",
  "stored",
  "durable_storage_permission",
  "evidence_ledger_append_permission",
  "graph_write_permission",
  "external_action_permission",
  "formal_workunit_promotion",
  "approvalstore_approval",
  "summary_runtime_permission",
  "audit_emission_permission",
  "starthub_execution_permission",
] as const

test("all eight artifact validators reject every canonical grant-like field with the dedicated code", () => {
  assert.equal(CANONICAL_FORBIDDEN_GRANT_FIELDS.length, 20)
  const suppliedValue = "grant-value-must-not-echo"
  for (const c of CASES) {
    // Valid-fixture behavior is retained.
    assert.equal(c.validate(c.fixture()).ok, true, c.name)
    for (const grant of CANONICAL_FORBIDDEN_GRANT_FIELDS) {
      const build = () => ({ ...c.fixture(), [grant]: suppliedValue })
      const result = c.validate(build())
      assert.equal(result.ok, false, `${c.name}.${grant}`)
      const dedicated = result.issues.filter(
        (i) => i.code === "forbidden_grant_field_present" && i.field === grant,
      )
      assert.equal(dedicated.length, 1, `${c.name}.${grant}: exactly one dedicated grant issue`)
      assert.ok(
        !result.issues.some((i) => i.code === "unknown_field" && i.field === grant),
        `${c.name}.${grant}: must not also be reported as unknown_field`,
      )
      for (const i of result.issues) {
        assert.equal(i.message, `${i.code}:${i.field}`, `${c.name}.${grant}`)
        assert.ok(
          !i.message.includes(suppliedValue),
          `${c.name}.${grant}: message must not echo the value`,
        )
      }
      // Deterministic: repeated validation yields the identical issue list.
      const second = c.validate(build())
      assert.deepEqual(
        second.issues.map((i) => `${i.code}:${i.field}`),
        result.issues.map((i) => `${i.code}:${i.field}`),
        `${c.name}.${grant}: issue list must be deterministic`,
      )
    }
    // An ordinary unrelated unknown key keeps the generic classification.
    const unknown = c.validate({ ...c.fixture(), unrelated_mystery_key: "x" })
    assert.equal(unknown.ok, false, c.name)
    assert.ok(codes(unknown).includes("unknown_field"), c.name)
    assert.ok(!codes(unknown).includes("forbidden_grant_field_present"), c.name)
  }
})

// Definition-deduplication and consumer wiring (read-only source checks).

const SHARED_DENYLIST_SRC = fileURLToPath(
  new URL("../app/lib/phase6/shared/forbiddenGrantFields.ts", import.meta.url),
)
const ARTIFACTS_VALIDATION_SRC = fileURLToPath(
  new URL("../app/lib/phase6/artifacts/validation.ts", import.meta.url),
)
const DENYLIST_CONSUMER_SRCS: readonly string[] = [
  "artifacts/validation.ts",
  "persistenceTargetDecision/validators.ts",
  "persistenceAuditEvidence/validators.ts",
  "recorderAuditSummary/validators.ts",
].map((rel) => fileURLToPath(new URL(`../app/lib/phase6/${rel}`, import.meta.url)))
const LINKAGE_DIR = fileURLToPath(
  new URL("../app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/", import.meta.url),
)

test("shared grant denylist pins all 20 canonical names and exports constant and predicate", () => {
  const text = readFileSync(SHARED_DENYLIST_SRC, "utf8")
  assert.ok(text.includes("export const PHASE6_FORBIDDEN_GRANT_FIELDS"))
  assert.ok(text.includes("export function isPhase6ForbiddenGrantField"))
  for (const name of CANONICAL_FORBIDDEN_GRANT_FIELDS) {
    assert.ok(text.includes(`"${name}"`), `shared denylist must pin: ${name}`)
  }
})

test("the canonical grant denylist is defined in exactly one Phase 6 production file", () => {
  const files = listTsFiles(P6_ROOT)
  // The canonical constant is defined once.
  const constDefiners = files.filter((f) =>
    readFileSync(f, "utf8").includes("PHASE6_FORBIDDEN_GRANT_FIELDS = ["),
  )
  assert.deepEqual(constDefiners, [SHARED_DENYLIST_SRC])
  // No other production file carries the complete 20-literal union.
  const fullListCarriers = files.filter((f) => {
    const text = readFileSync(f, "utf8")
    return CANONICAL_FORBIDDEN_GRANT_FIELDS.every((name) => text.includes(`"${name}"`))
  })
  assert.deepEqual(fullListCarriers, [SHARED_DENYLIST_SRC])
})

test("four consumers import the shared grant denylist and define no local list", () => {
  for (const src of DENYLIST_CONSUMER_SRCS) {
    const text = readFileSync(src, "utf8")
    assert.ok(
      text.includes('from "../shared/forbiddenGrantFields.ts"'),
      `${src} must import the shared denylist`,
    )
    assert.ok(
      !text.includes("const FORBIDDEN_GRANT_FIELDS"),
      `${src} must not define a local FORBIDDEN_GRANT_FIELDS list`,
    )
  }
  // The artifacts common validation path uses the dedicated classification, so
  // all eight artifact validators inherit it.
  const validationText = readFileSync(ARTIFACTS_VALIDATION_SRC, "utf8")
  assert.ok(validationText.includes('"forbidden_grant_field_present"'))
  assert.ok(validationText.includes("isPhase6ForbiddenGrantField"))
})

test("local-denylist detector is non-vacuous: a synthetic local list is detected", () => {
  const synthetic = 'const FORBIDDEN_GRANT_FIELDS: readonly string[] = ["approval"]\n'
  assert.ok(synthetic.includes("const FORBIDDEN_GRANT_FIELDS"))
  const clean = "// no local grant list here\n"
  assert.ok(!clean.includes("const FORBIDDEN_GRANT_FIELDS"))
})

test("linkage contract module is insulated from the shared grant denylist", () => {
  // The Recorder Summary Evidence Ledger Linkage module pins its own contract
  // field list and must not consume (or be altered by) the shared denylist.
  const linkageFiles = listTsFiles(LINKAGE_DIR)
  assert.ok(linkageFiles.length >= 3, "linkage module files must be present")
  for (const src of linkageFiles) {
    const text = readFileSync(src, "utf8")
    assert.ok(!text.includes("forbiddenGrantFields"), `${src} must not consume the shared denylist`)
    assert.ok(!text.includes("PHASE6_FORBIDDEN_GRANT_FIELDS"), `${src} must stay contract-pinned`)
  }
  const linkageTypes = readFileSync(`${LINKAGE_DIR}types.ts`, "utf8")
  assert.ok(linkageTypes.includes("LINKAGE_CANDIDATE_FORBIDDEN_GRANT_FIELDS = ["))
})

// ─── P6-FIX-006 (Issue #120): human decision phase-wide safety literals ──────
//
// Explicit human specification decision: four_eyes_required and
// self_approval_blocked must be exactly true on every valid Human Decision
// Record in this phase; approval_required, promotion_required, and
// execution_required deliberately remain contextual booleans. None of the five
// fields authorizes approval, promotion, execution, persistence, external
// action, or Formal WorkUnit promotion — validation pass stays non-authorizing.

const SAFETY_LITERAL_FIELDS = ["four_eyes_required", "self_approval_blocked"] as const
const CONTEXTUAL_GATE_FIELDS = [
  "approval_required",
  "promotion_required",
  "execution_required",
] as const

test("human decision valid fixture retains contextual false values and passes", () => {
  const fixture = validHumanDecisionRecord()
  assert.equal(fixture.approval_required, true)
  assert.equal(fixture.promotion_required, false)
  assert.equal(fixture.execution_required, false)
  assert.equal(fixture.four_eyes_required, true)
  assert.equal(fixture.self_approval_blocked, true)
  const result = validateHumanDecisionRecord(fixture)
  assert.deepEqual(result.issues, [])
  assert.equal(result.ok, true)
})

test("human decision safety literals reject false with exactly one dedicated issue", () => {
  for (const field of SAFETY_LITERAL_FIELDS) {
    const other = field === "four_eyes_required" ? "self_approval_blocked" : "four_eyes_required"
    const build = () => ({ ...validHumanDecisionRecord(), [field]: false })
    const input = build()
    const before = JSON.stringify(input)
    const result = validateHumanDecisionRecord(input)
    assert.equal(result.ok, false, field)
    const dedicated = result.issues.filter(
      (i) => i.code === "safety_boundary_not_confirmed" && i.field === field,
    )
    assert.equal(dedicated.length, 1, `${field}: exactly one safety_boundary_not_confirmed`)
    assert.equal(
      result.issues.length,
      1,
      `${field}: an otherwise-valid record must carry no other issue`,
    )
    assert.ok(
      !result.issues.some((i) => i.field === other),
      `${field}: the valid ${other} must not be flagged`,
    )
    for (const i of result.issues) {
      assert.equal(i.message, `${i.code}:${i.field}`, field)
      assert.ok(!i.message.includes("false"), `${field}: message must not echo the value`)
    }
    // Deterministic: repeated validation yields the identical issue list.
    const second = validateHumanDecisionRecord(build())
    assert.deepEqual(
      second.issues.map((i) => `${i.code}:${i.field}`),
      result.issues.map((i) => `${i.code}:${i.field}`),
      `${field}: repeated validation must be deterministic`,
    )
    // The input is never mutated.
    assert.equal(JSON.stringify(input), before, `${field}: input must not be mutated`)
  }
})

test("human decision safety literals preserve presence and type semantics", () => {
  for (const field of SAFETY_LITERAL_FIELDS) {
    const missing: Record<string, unknown> = { ...validHumanDecisionRecord() }
    delete missing[field]
    const missingResult = validateHumanDecisionRecord(missing)
    assert.ok(
      missingResult.issues.some((i) => i.code === "missing_required_field" && i.field === field),
      `${field}: missing → missing_required_field`,
    )
    assert.ok(
      !codes(missingResult).includes("safety_boundary_not_confirmed"),
      `${field}: missing must not be conflated with the safety violation`,
    )

    const nullResult = validateHumanDecisionRecord({ ...validHumanDecisionRecord(), [field]: null })
    assert.ok(
      nullResult.issues.some((i) => i.code === "null_required_field" && i.field === field),
      `${field}: null → null_required_field`,
    )
    assert.ok(
      !codes(nullResult).includes("safety_boundary_not_confirmed"),
      `${field}: null must not be conflated with the safety violation`,
    )

    for (const badType of ["true", 1]) {
      const typeResult = validateHumanDecisionRecord({
        ...validHumanDecisionRecord(),
        [field]: badType,
      })
      assert.ok(
        typeResult.issues.some((i) => i.code === "invalid_field_type" && i.field === field),
        `${field}: ${JSON.stringify(badType)} → invalid_field_type`,
      )
      assert.ok(
        !codes(typeResult).includes("safety_boundary_not_confirmed"),
        `${field}: wrong type must not be conflated with the safety violation`,
      )
    }

    const falseResult = validateHumanDecisionRecord({
      ...validHumanDecisionRecord(),
      [field]: false,
    })
    assert.ok(
      falseResult.issues.some((i) => i.code === "safety_boundary_not_confirmed" && i.field === field),
      `${field}: false → safety_boundary_not_confirmed`,
    )
    assert.ok(
      !falseResult.issues.some((i) => i.code === "invalid_field_type" && i.field === field),
      `${field}: false is a boolean, not a type error`,
    )

    const trueResult = validateHumanDecisionRecord({ ...validHumanDecisionRecord(), [field]: true })
    assert.ok(
      !trueResult.issues.some((i) => i.field === field),
      `${field}: true passes the field-level invariant`,
    )
  }
})

test("contextual gate descriptors accept both true and false and stay type-checked", () => {
  for (const field of CONTEXTUAL_GATE_FIELDS) {
    for (const value of [true, false]) {
      const result = validateHumanDecisionRecord({ ...validHumanDecisionRecord(), [field]: value })
      assert.equal(result.ok, true, `${field}=${value}: ${JSON.stringify(result.issues)}`)
    }
    const badType = validateHumanDecisionRecord({ ...validHumanDecisionRecord(), [field]: "yes" })
    assert.equal(badType.ok, false, field)
    assert.ok(
      badType.issues.some((i) => i.code === "invalid_field_type" && i.field === field),
      `${field}: non-boolean must remain invalid_field_type`,
    )
    assert.ok(
      !codes(badType).includes("safety_boundary_not_confirmed"),
      `${field}: contextual descriptor must not be safety-locked`,
    )
  }
})

const ARTIFACTS_VALIDATORS_SRC = fileURLToPath(
  new URL("../app/lib/phase6/artifacts/validators.ts", import.meta.url),
)

test("safety literal field specs are pinned in source and scoped to the two safety fields", () => {
  const text = readFileSync(ARTIFACTS_VALIDATORS_SRC, "utf8")
  assert.ok(text.includes('four_eyes_required: { kind: "requiredTrueSafety" }'))
  assert.ok(text.includes('self_approval_blocked: { kind: "requiredTrueSafety" }'))
  assert.ok(text.includes('approval_required: { kind: "boolean" }'))
  assert.ok(text.includes('promotion_required: { kind: "boolean" }'))
  assert.ok(text.includes('execution_required: { kind: "boolean" }'))
  const validationText = readFileSync(ARTIFACTS_VALIDATION_SRC, "utf8")
  assert.ok(validationText.includes('"safety_boundary_not_confirmed"'))
  // The required-true safety kind is used by exactly one Phase 6 production
  // file — no constructor, fixture, linkage, persistence, or shared leaf file
  // consumes it.
  const files = listTsFiles(P6_ROOT)
  const users = files.filter((f) => readFileSync(f, "utf8").includes("requiredTrueSafety"))
  assert.deepEqual(users, [ARTIFACTS_VALIDATORS_SRC])
})

// Artifacts validator sources must carry no runtime capability. The needle
// list is split so this assertion never self-matches its own tokens.
test("artifacts validator sources contain no forbidden runtime capability", () => {
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
    ["Math", ".random"],
    ["random", "UUID"],
    ["Approval", "Store"],
    ["append", "EvidenceLedger"],
    ["write", "Graph"],
    ["execute", "External"],
  ]
  for (const src of [ARTIFACTS_VALIDATION_SRC, ARTIFACTS_VALIDATORS_SRC]) {
    const text = readFileSync(src, "utf8")
    for (const [a, b] of forbidden) {
      assert.ok(!text.includes(a + b), `${src} must not contain: <<<${a + b}>>>`)
    }
  }
})

// Shared-module source guard: the leaf must carry no runtime capability and no
// imports at all. The needle list is split so this assertion never self-matches
// its own tokens.
test("shared grant denylist source contains no forbidden runtime capability", () => {
  const text = readFileSync(SHARED_DENYLIST_SRC, "utf8")
  const forbidden = [
    ["import", " {"],
    ["import", "("],
    ["require", "("],
    ["from", ' "'],
    ["globalThis", "["],
    ["Date", ".now"],
    ["new ", "Date"],
    ["Date", ".parse"],
    ["Math", ".random"],
    ["random", "UUID"],
    ["fet", "ch("],
    ["process", ".env"],
    ["node:", "fs"],
    ["child_", "process"],
    ["Approval", "Store"],
    ["append", "EvidenceLedger"],
    ["write", "Graph"],
    ["execute", "External"],
  ]
  for (const [a, b] of forbidden) {
    assert.ok(!text.includes(a + b), `shared denylist must not contain: <<<${a + b}>>>`)
  }
})

// ─── P6-FIX-007b (Issue #121): frozen-snapshot resultOf source guards ────────
//
// Each in-scope resultOf must return a frozen result whose issues array is a
// frozen clone. The four in-scope production files are exactly the linkage
// pattern's siblings; the linkage validator itself is out of scope and is not
// checked here.

const RESULT_OF_SRCS: readonly string[] = [
  "artifacts/validation.ts",
  "persistenceTargetDecision/validators.ts",
  "persistenceAuditEvidence/validators.ts",
  "recorderAuditSummary/validators.ts",
].map((rel) => fileURLToPath(new URL(`../app/lib/phase6/${rel}`, import.meta.url)))

/** Extract the body of the `resultOf` function's `return` statement. */
function resultOfReturnLine(sourceText: string): string {
  // Strip line comments so a comment can never satisfy the structural checks.
  const codeOnly = sourceText
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//")
      return idx === -1 ? line : line.slice(0, idx)
    })
    .join("\n")
  const match = codeOnly.match(/function resultOf\([\s\S]*?\{\s*return ([\s\S]*?)\n\}/)
  assert.ok(match, "resultOf function with a return must be present")
  return (match as RegExpMatchArray)[1]
}

test("each in-scope resultOf returns a frozen result with a cloned frozen issues array", () => {
  for (const src of RESULT_OF_SRCS) {
    const ret = resultOfReturnLine(readFileSync(src, "utf8"))
    // Outer result frozen.
    assert.ok(
      ret.includes("Object.freeze({"),
      `${src}: resultOf must Object.freeze the outer result`,
    )
    // Cloned issues array (spread clone), then frozen.
    assert.ok(
      ret.includes("Object.freeze([...issues])"),
      `${src}: resultOf must freeze a [...issues] clone`,
    )
    // Must not return the original issues reference directly.
    assert.ok(
      !/issues:\s*issues\b/.test(ret),
      `${src}: resultOf must not alias the original issues array`,
    )
    // Must not use JSON serialization as a clone mechanism.
    assert.ok(!ret.includes("JSON."), `${src}: resultOf must not clone via JSON`)
    // Must not recursively deep-freeze issue entries (only one freeze of the
    // array itself; no per-entry map(Object.freeze) or structuredClone).
    assert.ok(
      !ret.includes(".map(") && !ret.includes("structuredClone"),
      `${src}: resultOf must not deep-freeze or deep-clone issue entries`,
    )
  }
})
