/**
 * P6-I0: fail-closed validators for the eight Phase 6 artifact records
 * (docs/PHASE6_IMPLEMENTATION_DECISION_RECORD.md §11, grounded in the
 * P6.7–P6.14 contract docs).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. Each validator accepts unknown input,
 * never throws for normal invalid input (a defensive catch maps unexpected
 * failures to `validation_exception`), never mutates its input, performs no
 * I/O of any kind, and returns only { ok, issues }. Validation pass is not
 * approval, not execution permission, not promotion, and not authorization.
 *
 * no_go_flags policy: a non-empty no_go_flags array fails validation unless
 * the artifact's status field is explicitly "blocked_no_go". Artifacts with
 * no status field (Query Intent, Safe Query Plan, Compiled SQL Artifact,
 * Query Result Record) have no representable blocked state, so any non-empty
 * no_go_flags fails closed.
 *
 * cross_tenant_lineage_not_checked is a RESERVED stable code: P6-I0
 * validators verify lineage id presence and shape only — verifying that a
 * referenced upstream artifact belongs to the same tenant requires lookup,
 * which is future-gated (persistence gate). The code exists so later loops
 * report that condition with a stable name.
 */

import {
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
} from "./types.ts"
import {
  issue,
  resultOf,
  isRecordObject,
  isNonEmptyString,
  isIsoTimestampString,
  isSha256Hex,
  isContentIntegrityReference,
  collectUnknownFieldIssues,
  checkPresence,
  validateRequiredString,
  validateRequiredBoolean,
  validateRequiredArray,
  validateEnumValue,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.ts"

// ─── Declarative field specs ────────────────────────────────────

type FieldSpec =
  | { readonly kind: "string" }
  | { readonly kind: "tenant" }
  | { readonly kind: "lineage" }
  | { readonly kind: "boolean" }
  | { readonly kind: "stringArray" }
  | { readonly kind: "timestamp" }
  | { readonly kind: "sha256" }
  | { readonly kind: "contentIntegrityReference" }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "nullableString" }
  | { readonly kind: "noGoFlags" }
  /**
   * Phase-wide required-true safety literal (P6-FIX-006, Issue #120): the
   * field must be present, non-null, boolean, AND exactly true. false is a
   * safety boundary violation (safety_boundary_not_confirmed), never a
   * contextual choice. Apply only to fields an explicit human specification
   * decision has locked for the phase.
   */
  | { readonly kind: "requiredTrueSafety" }

/**
 * Optional cross-field semantic validator (P6-FIX-008, Issue #141). It consumes
 * the already-captured single-read snapshot (never re-reading the caller input),
 * never mutates it, and returns deterministically ordered, de-duplicated issues.
 * It runs after ordinary field validation and the generic no_go_flags policy.
 */
type ArtifactSemanticValidator = (
  snapshot: Readonly<Record<string, unknown>>,
) => readonly ValidationIssue[]

type ArtifactSpec = {
  readonly fields: Readonly<Record<string, FieldSpec>>
  /** Status field consulted by the no_go_flags policy; null = no blocked state. */
  readonly statusField: string | null
  /** Optional cross-field semantic rules (attached only where specified). */
  readonly semanticValidator?: ArtifactSemanticValidator
}

function validateField(
  record: Record<string, unknown>,
  field: string,
  spec: FieldSpec,
): ValidationIssue[] {
  switch (spec.kind) {
    case "string":
      return validateRequiredString(record, field)
    case "tenant": {
      const presence = checkPresence(record, field)
      if (!presence.present) return [issue("missing_tenant_id", field)]
      if (!isNonEmptyString(presence.value)) return [issue("invalid_tenant_id", field)]
      return []
    }
    case "lineage": {
      const presence = checkPresence(record, field)
      if (!presence.present) return [issue("missing_lineage_id", field)]
      if (!isNonEmptyString(presence.value)) return [issue("invalid_lineage_id", field)]
      return []
    }
    case "boolean":
      return validateRequiredBoolean(record, field)
    case "stringArray":
    case "noGoFlags":
      return validateRequiredArray(record, field)
    case "timestamp": {
      const presence = checkPresence(record, field)
      if (!presence.present) return [issue("missing_required_field", field)]
      if (presence.value === null) return [issue("null_required_field", field)]
      if (!isIsoTimestampString(presence.value)) return [issue("invalid_timestamp", field)]
      return []
    }
    case "sha256": {
      const presence = checkPresence(record, field)
      if (!presence.present) return [issue("missing_required_field", field)]
      if (presence.value === null) return [issue("null_required_field", field)]
      if (!isSha256Hex(presence.value)) return [issue("invalid_sha256_hex", field)]
      return []
    }
    case "contentIntegrityReference": {
      const presence = checkPresence(record, field)
      if (!presence.present) return [issue("missing_required_field", field)]
      if (presence.value === null) return [issue("null_required_field", field)]
      if (!isContentIntegrityReference(presence.value)) {
        return [issue("invalid_content_integrity_reference", field)]
      }
      return []
    }
    case "enum":
      return validateEnumValue(record, field, spec.values)
    case "requiredTrueSafety": {
      const presence = checkPresence(record, field)
      if (!presence.present) return [issue("missing_required_field", field)]
      if (presence.value === null) return [issue("null_required_field", field)]
      if (typeof presence.value !== "boolean") return [issue("invalid_field_type", field)]
      if (presence.value !== true) return [issue("safety_boundary_not_confirmed", field)]
      return []
    }
    case "nullableString": {
      // Explicit null is documented as allowed; missing stays rejected.
      const presence = checkPresence(record, field)
      if (!presence.present) return [issue("missing_required_field", field)]
      if (presence.value === null) return []
      if (!isNonEmptyString(presence.value)) return [issue("invalid_field_type", field)]
      return []
    }
  }
}

function validateArtifact(input: unknown, spec: ArtifactSpec): ValidationResult {
  try {
    if (!isRecordObject(input)) {
      return resultOf([issue("invalid_record", "(record)")])
    }
    // Single-read snapshot (getter-TOCTOU hardening, P7.1 F1 precedent): every
    // own enumerable top-level property is read exactly once into a plain
    // object; the unknown-field check, every field check, and the no_go_flags
    // policy all read the snapshot, so a getter-bearing input cannot show one
    // value to the field check and another to the policy. The input itself is
    // never mutated.
    const snapshot: Record<string, unknown> = {}
    for (const key of Object.keys(input)) {
      snapshot[key] = input[key]
    }
    const allowedFields = Object.keys(spec.fields)
    const issues: ValidationIssue[] = [
      ...collectUnknownFieldIssues(snapshot, allowedFields),
    ]
    for (const [field, fieldSpec] of Object.entries(spec.fields)) {
      issues.push(...validateField(snapshot, field, fieldSpec))
    }
    // no_go_flags policy: non-empty fails unless status is explicitly blocked_no_go.
    const flags = snapshot.no_go_flags
    if (Array.isArray(flags) && flags.length > 0) {
      const status = spec.statusField === null ? undefined : snapshot[spec.statusField]
      if (status !== "blocked_no_go") {
        issues.push(issue("no_go_flags_present", "no_go_flags"))
      }
    }
    // Cross-field semantic rules run last, against the same snapshot — never a
    // second read of the caller input, never a mutation.
    if (spec.semanticValidator) {
      issues.push(...spec.semanticValidator(snapshot))
    }
    return resultOf(issues)
  } catch {
    return resultOf([issue("validation_exception", "(record)")])
  }
}

// ─── Artifact specs ─────────────────────────────────────────────

const QUERY_INTENT_SPEC: ArtifactSpec = {
  statusField: null,
  fields: {
    query_intent_id: { kind: "string" },
    tenant_id: { kind: "tenant" },
    actor_id: { kind: "string" },
    input_signal_id: { kind: "lineage" },
    intent_summary: { kind: "string" },
    requested_information: { kind: "stringArray" },
    allowed_sources: { kind: "stringArray" },
    disallowed_sources: { kind: "stringArray" },
    tenant_scope_required: { kind: "boolean" },
    human_review_required: { kind: "boolean" },
    created_at: { kind: "timestamp" },
    no_go_flags: { kind: "noGoFlags" },
  },
}

const SAFE_QUERY_PLAN_SPEC: ArtifactSpec = {
  statusField: null,
  fields: {
    safe_query_plan_id: { kind: "string" },
    tenant_id: { kind: "tenant" },
    source_query_intent_id: { kind: "lineage" },
    query_goal: { kind: "string" },
    allowed_tables: { kind: "stringArray" },
    selected_columns: { kind: "stringArray" },
    tenant_scope_filter_required: { kind: "boolean" },
    denied_operations: { kind: "stringArray" },
    estimated_result_shape: { kind: "string" },
    human_review_required: { kind: "boolean" },
    created_at: { kind: "timestamp" },
    no_go_flags: { kind: "noGoFlags" },
  },
}

const COMPILED_SQL_ARTIFACT_SPEC: ArtifactSpec = {
  statusField: null,
  fields: {
    compiled_sql_artifact_id: { kind: "string" },
    tenant_id: { kind: "tenant" },
    source_safe_query_plan_id: { kind: "lineage" },
    source_query_intent_id: { kind: "lineage" },
    sql_hash: { kind: "sha256" },
    sql_text_redaction_state: { kind: "enum", values: REDACTION_STATES },
    read_only: { kind: "boolean" },
    mutation_detected: { kind: "boolean" },
    tenant_scope_filter_present: { kind: "boolean" },
    selected_columns: { kind: "stringArray" },
    created_at: { kind: "timestamp" },
    no_go_flags: { kind: "noGoFlags" },
  },
}

const RULE_REVIEW_RECORD_SPEC: ArtifactSpec = {
  statusField: "rule_review_status",
  fields: {
    rule_review_record_id: { kind: "string" },
    tenant_id: { kind: "tenant" },
    source_compiled_sql_artifact_id: { kind: "lineage" },
    source_safe_query_plan_id: { kind: "lineage" },
    source_query_intent_id: { kind: "lineage" },
    rule_review_status: { kind: "enum", values: RULE_REVIEW_STATUSES },
    rule_review_outcome: { kind: "enum", values: OUTCOMES },
    read_only_check_result: { kind: "string" },
    tenant_scope_check_result: { kind: "string" },
    denied_schema_check_result: { kind: "string" },
    human_review_required: { kind: "boolean" },
    reviewed_at: { kind: "timestamp" },
    no_go_flags: { kind: "noGoFlags" },
  },
}

const QUERY_RESULT_RECORD_SPEC: ArtifactSpec = {
  statusField: null,
  fields: {
    query_result_record_id: { kind: "string" },
    tenant_id: { kind: "tenant" },
    source_rule_review_record_id: { kind: "lineage" },
    source_compiled_sql_artifact_id: { kind: "lineage" },
    source_safe_query_plan_id: { kind: "lineage" },
    source_query_intent_id: { kind: "lineage" },
    selected_source_rows: { kind: "stringArray" },
    selected_columns: { kind: "stringArray" },
    provenance_complete: { kind: "boolean" },
    evidence_eligible: { kind: "boolean" },
    result_hash: { kind: "sha256" },
    content_integrity_reference: { kind: "contentIntegrityReference" },
    redaction_state: { kind: "enum", values: REDACTION_STATES },
    aggregation_method: { kind: "nullableString" },
    source_scope: { kind: "nullableString" },
    source_trust_marker: { kind: "enum", values: SOURCE_TRUST_MARKERS },
    conflict_state: { kind: "enum", values: CONFLICT_STATES },
    human_review_required: { kind: "boolean" },
    created_at: { kind: "timestamp" },
    no_go_flags: { kind: "noGoFlags" },
  },
}

const EVIDENCE_REVIEW_RECORD_SPEC: ArtifactSpec = {
  statusField: "evidence_review_status",
  fields: {
    evidence_review_id: { kind: "string" },
    tenant_id: { kind: "tenant" },
    source_query_result_record_id: { kind: "lineage" },
    source_rule_review_record_id: { kind: "lineage" },
    source_compiled_sql_artifact_id: { kind: "lineage" },
    source_safe_query_plan_id: { kind: "lineage" },
    source_query_intent_id: { kind: "lineage" },
    evidence_review_status: { kind: "enum", values: EVIDENCE_REVIEW_STATUSES },
    evidence_review_outcome: { kind: "enum", values: OUTCOMES },
    evidence_claim: { kind: "string" },
    evidence_type: { kind: "string" },
    source_trust_marker: { kind: "enum", values: SOURCE_TRUST_MARKERS },
    evidence_eligible: { kind: "boolean" },
    evidence_accepted: { kind: "boolean" },
    human_review_required: { kind: "boolean" },
    result_hash_check_result: { kind: "string" },
    content_integrity_check_result: { kind: "string" },
    reviewed_at: { kind: "timestamp" },
    no_go_flags: { kind: "noGoFlags" },
  },
}

const LLM_JUDGMENT_RECORD_SPEC: ArtifactSpec = {
  statusField: "judgment_status",
  fields: {
    llm_judgment_id: { kind: "string" },
    tenant_id: { kind: "tenant" },
    source_evidence_review_record_id: { kind: "lineage" },
    source_query_result_record_id: { kind: "lineage" },
    source_rule_review_record_id: { kind: "lineage" },
    source_compiled_sql_artifact_id: { kind: "lineage" },
    source_safe_query_plan_id: { kind: "lineage" },
    source_query_intent_id: { kind: "lineage" },
    judgment_status: { kind: "enum", values: LLM_JUDGMENT_STATUSES },
    judgment_outcome: { kind: "enum", values: OUTCOMES },
    judgment_summary: { kind: "string" },
    judgment_claims: { kind: "stringArray" },
    evidence_references: { kind: "stringArray" },
    provenance_references: { kind: "stringArray" },
    uncertainty_state: { kind: "enum", values: UNCERTAINTY_STATES },
    confidence_explanation: { kind: "string" },
    unsupported_inferences: { kind: "stringArray" },
    conflict_handling_summary: { kind: "string" },
    human_review_required: { kind: "boolean" },
    allowed_use: { kind: "stringArray" },
    disallowed_use: { kind: "stringArray" },
    judged_at: { kind: "timestamp" },
    no_go_flags: { kind: "noGoFlags" },
  },
}

// ─── Human Decision cross-field semantics (P6-FIX-008, Issue #141) ──────────

/** Impact scopes that forbid any actionable gate descriptor being true. */
const NON_ACTION_IMPACT_SCOPES: readonly string[] = [
  "no_action_decision",
  "clarification_request",
  "defer_decision",
]

/**
 * Cross-field Human Decision semantics. Consumes the single-read snapshot only.
 *
 * Cascade prevention: each rule runs only when its prerequisite fields already
 * hold valid primitive/enum values, so a missing/wrong-type/unknown-enum field
 * yields only its ordinary field error, never secondary semantic noise.
 *
 * Deterministic order (then de-duplicated by code+field):
 *   1. status/outcome         → invalid_decision_status_outcome:decision_status
 *   2. approval impact        → invalid_gate_requirement_combination:approval_required
 *   3. promotion impact       → invalid_gate_requirement_combination:promotion_required
 *   4. execution impact       → invalid_gate_requirement_combination:execution_required
 *   5. promotion→approval dep → invalid_gate_requirement_combination:promotion_required
 *   6. execution→approval dep → invalid_gate_requirement_combination:execution_required
 */
function validateHumanDecisionSemantics(
  snapshot: Readonly<Record<string, unknown>>,
): readonly ValidationIssue[] {
  const ordered: ValidationIssue[] = []

  const status = snapshot.decision_status
  const outcome = snapshot.decision_outcome
  const scope = snapshot.decision_impact_scope
  const approval = snapshot.approval_required
  const promotion = snapshot.promotion_required
  const execution = snapshot.execution_required

  const statusValid =
    typeof status === "string" && (HUMAN_DECISION_STATUSES as readonly string[]).includes(status)
  const outcomeValid =
    typeof outcome === "string" && (OUTCOMES as readonly string[]).includes(outcome)

  // 1. Status/outcome matrix, expressed as its two equivalent invariants:
  //    (a) decision_outcome === no_go  iff  decision_status === blocked_no_go
  //    (b) decision_status === ready_for_future_gate_review  implies  outcome === pass
  if (statusValid && outcomeValid) {
    const isNoGo = outcome === "no_go"
    const isBlocked = status === "blocked_no_go"
    const isReady = status === "ready_for_future_gate_review"
    if (isNoGo !== isBlocked || (isReady && outcome !== "pass")) {
      ordered.push(issue("invalid_decision_status_outcome", "decision_status"))
    }
  }

  const scopeValid =
    typeof scope === "string" && (DECISION_IMPACT_SCOPES as readonly string[]).includes(scope)
  const isNonAction = scopeValid && NON_ACTION_IMPACT_SCOPES.includes(scope as string)
  const approvalBool = typeof approval === "boolean"
  const promotionBool = typeof promotion === "boolean"
  const executionBool = typeof execution === "boolean"

  // 2-4. Non-action scopes require every actionable descriptor to be false.
  if (isNonAction) {
    if (approvalBool && approval === true) {
      ordered.push(issue("invalid_gate_requirement_combination", "approval_required"))
    }
    if (promotionBool && promotion === true) {
      ordered.push(issue("invalid_gate_requirement_combination", "promotion_required"))
    }
    if (executionBool && execution === true) {
      ordered.push(issue("invalid_gate_requirement_combination", "execution_required"))
    }
  }

  // 5. promotion_required === true implies approval_required === true.
  if (scopeValid && promotionBool && approvalBool && promotion === true && approval !== true) {
    ordered.push(issue("invalid_gate_requirement_combination", "promotion_required"))
  }
  // 6. execution_required === true implies approval_required === true.
  if (scopeValid && executionBool && approvalBool && execution === true && approval !== true) {
    ordered.push(issue("invalid_gate_requirement_combination", "execution_required"))
  }

  // De-duplicate by code+field, preserving the first (deterministic) occurrence,
  // so a descriptor violating both an impact rule and a dependency rule produces
  // exactly one dedicated issue for that field.
  const seen = new Set<string>()
  const deduped: ValidationIssue[] = []
  for (const entry of ordered) {
    const key = `${entry.code}:${entry.field}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(entry)
  }
  return deduped
}

const HUMAN_DECISION_RECORD_SPEC: ArtifactSpec = {
  statusField: "decision_status",
  semanticValidator: validateHumanDecisionSemantics,
  fields: {
    human_decision_id: { kind: "string" },
    tenant_id: { kind: "tenant" },
    decision_status: { kind: "enum", values: HUMAN_DECISION_STATUSES },
    decision_outcome: { kind: "enum", values: OUTCOMES },
    human_reviewer_id: { kind: "string" },
    human_reviewer_role: { kind: "string" },
    reviewer_context: { kind: "string" },
    source_evidence_review_record_id: { kind: "lineage" },
    source_llm_judgment_record_id: { kind: "lineage" },
    source_query_result_record_id: { kind: "lineage" },
    source_rule_review_record_id: { kind: "lineage" },
    source_compiled_sql_artifact_id: { kind: "lineage" },
    source_safe_query_plan_id: { kind: "lineage" },
    source_query_intent_id: { kind: "lineage" },
    evidence_accepted: { kind: "boolean" },
    evidence_claim: { kind: "string" },
    evidence_type: { kind: "string" },
    llm_judgment_id: { kind: "lineage" },
    judgment_summary: { kind: "string" },
    uncertainty_state: { kind: "enum", values: UNCERTAINTY_STATES },
    human_decision_summary: { kind: "string" },
    human_decision_rationale: { kind: "string" },
    decision_impact_scope: { kind: "enum", values: DECISION_IMPACT_SCOPES },
    allowed_use: { kind: "stringArray" },
    disallowed_use: { kind: "stringArray" },
    future_gate_requirements: { kind: "stringArray" },
    // Contextual workflow descriptors: true and false are both valid, and
    // neither value authorizes approval, promotion, or execution.
    approval_required: { kind: "boolean" },
    promotion_required: { kind: "boolean" },
    execution_required: { kind: "boolean" },
    // Phase-wide safety literals (P6-FIX-006, Issue #120): must be exactly
    // true on every valid record; false fails safety_boundary_not_confirmed.
    four_eyes_required: { kind: "requiredTrueSafety" },
    self_approval_blocked: { kind: "requiredTrueSafety" },
    reviewed_by_human_at: { kind: "timestamp" },
    no_go_flags: { kind: "noGoFlags" },
  },
}

// ─── Public validators ──────────────────────────────────────────

export function validateQueryIntentRecord(input: unknown): ValidationResult {
  return validateArtifact(input, QUERY_INTENT_SPEC)
}

export function validateSafeQueryPlan(input: unknown): ValidationResult {
  return validateArtifact(input, SAFE_QUERY_PLAN_SPEC)
}

export function validateCompiledSqlArtifact(input: unknown): ValidationResult {
  return validateArtifact(input, COMPILED_SQL_ARTIFACT_SPEC)
}

export function validateRuleReviewRecord(input: unknown): ValidationResult {
  return validateArtifact(input, RULE_REVIEW_RECORD_SPEC)
}

export function validateQueryResultRecord(input: unknown): ValidationResult {
  return validateArtifact(input, QUERY_RESULT_RECORD_SPEC)
}

export function validateEvidenceReviewRecord(input: unknown): ValidationResult {
  return validateArtifact(input, EVIDENCE_REVIEW_RECORD_SPEC)
}

export function validateLlmJudgmentRecord(input: unknown): ValidationResult {
  return validateArtifact(input, LLM_JUDGMENT_RECORD_SPEC)
}

export function validateHumanDecisionRecord(input: unknown): ValidationResult {
  return validateArtifact(input, HUMAN_DECISION_RECORD_SPEC)
}
