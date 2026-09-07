# Evidence Review Gate

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.12. **Baseline:** `main` @ `727244f`.

Defines how a Query Result Record with `result_status` `ready_for_evidence_review`
([`QUERY_RESULT_RECORD_CONTRACT.md`](./QUERY_RESULT_RECORD_CONTRACT.md)) may be reviewed
before it is allowed to support human decision-making as evidence. Discharges the forward
reference left by [`D1_READ_ONLY_EXECUTION_GATE.md`](./D1_READ_ONLY_EXECUTION_GATE.md) §16
("Future evidence use requires complete provenance and human-review compatibility") and
grounds it in [`EVIDENCE_STANDARD.md`](./archive/v0/EVIDENCE_STANDARD.md) and
[`PROVENANCE_MODEL.md`](./archive/v0/PROVENANCE_MODEL.md). Pairs with
[`EVIDENCE_REVIEW_RECORD_CONTRACT.md`](./EVIDENCE_REVIEW_RECORD_CONTRACT.md). Documentation
and a static test only.

> This gate **describes** how evidence review must behave. It implements no reviewer,
> stores no evidence, stores no provenance, accesses no database, and assigns no truth.
> Evidence ≠ Truth; Evidence ≠ Approval; Evidence ≠ Execution Authorization; Evidence
> Review ≠ Automated Decision.

---

## 1. Purpose

Close the last consumer gap of the query spine: Query Intent → Safe Query Plan → Compiled
SQL Artifact → Rule Review Record → Query Result Record → **this gate** → Evidence Review
Record. This is where a provenance-complete result earns the right to be *offered* to a
human as evidence — never the right to be believed, approved, or acted on.

Evidence Review is not truth assignment and not action authorization. It is a provenance-aware, tenant-scoped, conflict-explicit review of a Query Result Record before the result may support human decision-making as evidence.

Evidence Reviewとは真偽判定そのものでもaction authorizationでもない。Query Result Recordが人間の意思決定を支えるevidenceとして扱われる前に、provenance・tenant scope・conflict・redaction・source trust・lineage・content integrityを確認するreviewである。

## 2. Scope

- **In scope:** the gate's inputs, outputs, the Query Result Record → Evidence Review
  Record flow, pre-review validation, lineage/result-hash/content-integrity checks,
  provenance/source-row checks, tenant/denied-schema checks, redaction/aggregation/
  source-trust checks, conflict and human-review boundaries, and No-Go conditions.
- **Out of scope:** any runtime evidence storage, runtime provenance storage, runtime
  query result storage, GraphRAG, vectorization, real LLM, LLM judgment, database access,
  D1 execution, SQL execution, ApprovalStore change, or P7.1 TSP utility wiring.

## 3. Definition of Evidence Review Gate

The Evidence Review Gate allows a valid Query Result Record to be reviewed only into an Evidence Review Record, clarification_needed, or No-Go, not truth assignment, not action authorization, and not Formal WorkUnit promotion.

## 4. What Evidence Review Is Not

Evidence Review is **not**:

- truth assignment
- automated decision
- action authorization
- approval
- external action
- Formal WorkUnit promotion
- GraphRAG implementation
- LLM judgment
- runtime evidence storage
- runtime provenance storage
- database access
- D1 execution
- SQL execution
- model-confidence shortcut

## 5. Gate Principles

- Rules review; humans decide what evidence means. The model never assigns truth, never
  clears a conflict, and never lowers a review requirement. AI proposes; Rules guard;
  Humans decide.
- Fail closed: missing provenance, missing source rows, unknown trust, unresolved
  redaction, or broken integrity resolve to clarification or No-Go, never to a permissive
  record.
- An Evidence Review Record is review material for humans, never an authorization.

Fixed rules, always:

An Evidence Review Record must be non-executing.

An Evidence Review Record must not authorize execution.

An Evidence Review Record must not authorize external action.

An Evidence Review Record must not approve anything.

An Evidence Review Record must not promote a WorkUnit Candidate into a Formal WorkUnit.

An Evidence Review Record must not be treated as truth by default.

Model confidence must not be used as evidence.

Model confidence must not be used as truth.

Model confidence must not bypass human review.

Evidence Review pass must not authorize action.

Evidence Review pass must not authorize Formal WorkUnit promotion.

## 6. Allowed Inputs

- valid_query_result_record
- tenant_id
- source_rule_review_record_id
- source_compiled_sql_artifact_id
- source_safe_query_plan_id
- source_query_intent_id
- selected_source_rows
- selected_columns
- provenance_complete
- evidence_eligible
- tenant_scope_filter_used
- denied_schema_absence
- redaction_state
- aggregation_method
- source_scope
- source_trust_marker
- conflict_state
- result_hash
- content_integrity_reference
- human_review_required
- no_go_flags

`source_trust_marker`, `content_integrity_reference`, and `denied_schema_absence` are
review-time inputs derived for this gate: the trust marker classifies where the result's
rows came from — mapping the [`INFORMATION_INTAKE_POLICY.md`](./archive/v0/INFORMATION_INTAKE_POLICY.md)
trust ladder and first-vs-third-party ranking onto result sources
(first_party_system_record / integration_provided_record / user_provided_record at the
trusted end; derived_query_result / aggregated_result for computed results;
unknown_source / untrusted_source at the untrusted end, where third-party forwarded content
lands unless explicitly classified); the integrity reference binds the reviewed record to
the exact bytes the D1 Read-only Execution Gate produced (`sha256:` over the record
content, consistent with its `result_hash`); and `denied_schema_absence` restates the
Query Result Record's "must not include denied schema" validation as an explicit review
input.

## 7. Allowed Outputs

The gate may output only:

- Evidence Review Record
- clarification_needed
- No-Go

`clarification_needed` and `No-Go` may be emitted either as bare gate outcomes or as an
Evidence Review Record carrying the corresponding `evidence_review_status` (per
[`EVIDENCE_REVIEW_RECORD_CONTRACT.md`](./EVIDENCE_REVIEW_RECORD_CONTRACT.md) §6).

## 8. Query Result Record to Evidence Review Flow

```
Valid Query Result Record → Lineage and integrity validation → Provenance and source row validation → Redaction / trust / conflict validation → Evidence Review Record or Clarification or No-Go
```

Review stops at a reviewable Evidence Review Record (or clarification / No-Go); actual
evidence use in human decisions, GraphRAG, and LLM judgment remain separate future-gated
steps.

## 9. Pre-review Validation

Before an Evidence Review Record can be produced, the gate must validate query result record id, tenant_id, lineage ids, selected_source_rows, selected_columns, provenance_complete, evidence_eligible, tenant_scope_filter_used, denied schema absence, redaction_state, aggregation_method, source_scope, source_trust_marker, conflict_state, result_hash, content_integrity_reference, human_review_required, and no_go_flags.

A Query Result Record without tenant_id is No-Go.

A Query Result Record without selected_source_rows is No-Go for evidence review.

A Query Result Record without selected_columns is No-Go for evidence review.

A Query Result Record with provenance_complete other than true is No-Go for evidence review.

A Query Result Record with evidence_eligible other than true is No-Go for evidence review.

## 10. Lineage, Result Hash, and Content Integrity Checks

source_query_intent_id must be present.

source_safe_query_plan_id must be present.

source_compiled_sql_artifact_id must be present.

source_rule_review_record_id must be present.

Lineage mismatch is No-Go.

result_hash is required.

result_hash must be a 64-character lowercase hex SHA-256 string.

content_integrity_reference is required.

content_integrity_reference must use the format sha256:<64 lowercase hex>.

content_integrity_reference mismatch is No-Go.

The Query Result Record must not change between D1 Read-only Execution Gate review and Evidence Review.

## 11. Provenance and Source Row Checks

selected_source_rows is required.

selected_columns is required.

selected_source_rows must identify source table and row reference strategy.

selected_columns must identify source table and column references.

provenance_complete must be true.

evidence_eligible must be true.

A result without source rows is not evidence.

A result without selected columns is not evidence.

A result without provenance is not evidence.

## 12. Tenant Scope and Denied Schema Checks

tenant_id is required.

tenant_scope_filter_used is required.

Cross-tenant evidence review is No-Go.

Denied schema presence is No-Go.

secret_or_token data must not pass evidence review.

blocked_input data must not pass evidence review.

unknown_sensitive data must not pass evidence review.

A Query Result Record with denied schema presence is No-Go.

A Query Result Record with secret_or_token, blocked_input, or unknown_sensitive data is No-Go.

## 13. Redaction, Aggregation, and Source Trust Checks

redaction_state is required.

Allowed redaction_state values:

- not_required
- redacted
- partially_redacted
- redaction_required
- redaction_unknown
- redaction_failed

redaction_required, redaction_unknown, and redaction_failed require human review and must not be automatically treated as pass.

A Query Result Record with unresolved redaction is No-Go or clarification_needed depending on risk.

aggregation_method is required when result shape is aggregate_result.

source_scope is required for aggregated results.

source_trust_marker is required.

Allowed source_trust_marker values:

- first_party_system_record
- integration_provided_record
- user_provided_record
- derived_query_result
- aggregated_result
- unknown_source
- untrusted_source

unknown_source and untrusted_source must not automatically pass evidence review.

A Query Result Record with unknown source_trust_marker is No-Go or clarification_needed depending on risk.

Risk criterion for the two "depending on risk" rules above: unresolved redaction or unknown
trust is **No-Go** when the result touches sensitive or personal data, or would affect
priority, risk, action readiness, or promotion readiness; otherwise it is
**clarification_needed** (following the risk-criterion pattern of
[`QUERY_RESULT_RECORD_CONTRACT.md`](./QUERY_RESULT_RECORD_CONTRACT.md) §16).

## 14. Conflict State and Human Review Boundary

conflict_state is required.

Allowed conflict_state values:

- no_conflict
- conflict_detected
- unresolved_conflict
- source_disagreement
- missing_information
- unknown

A result with conflict_detected, unresolved_conflict, source_disagreement, missing_information, or unknown conflict_state requires human review.

A Query Result Record with unresolved conflict_state requires human review.

A result must not be treated as truth by default when sources conflict.

human_review_required must be explicit.

Human review must not be bypassed by model confidence.

## 15. Failure and No-Go Conditions

- invalid_query_result_record
- missing_tenant_id
- missing_lineage_id
- lineage_mismatch
- missing_selected_source_rows
- missing_selected_columns
- provenance_incomplete
- evidence_eligible_not_true
- missing_tenant_scope
- cross_tenant_evidence_review
- denied_schema_presence
- secret_or_token_evidence
- blocked_input_evidence
- unknown_sensitive_evidence
- missing_redaction_state
- unresolved_redaction
- missing_aggregation_method
- missing_source_scope
- missing_source_trust_marker
- unknown_source_trust
- untrusted_source
- missing_conflict_state
- unresolved_conflict
- missing_result_hash
- invalid_result_hash
- missing_content_integrity_reference
- content_integrity_mismatch
- no_go_flags_present
- model_confidence_as_evidence
- evidence_review_as_action_authorization
- evidence_review_as_formal_workunit_promotion

Qualifier: `unresolved_conflict` and `unresolved_redaction` are No-Go conditions when the
required human review is unavailable or bypassed; with human review available they route
per §13/§14 (human review required, never automatic pass), consistent with the contract's
"unresolved conflict without human review" No-Go wording.

## 16. Relationship to Future Evidence Use / GraphRAG / LLM Judgment

Future evidence use requires an Evidence Review Record.

Future GraphRAG may use evidence only after evidence review passes and provenance remains complete.

Future LLM judgment may inspect evidence only after a separate LLM judgment evaluation gate.

Recording a human acceptance decision (who flips evidence_accepted, under what authority, and where that decision is stored) requires a separate future Evidence Acceptance recording gate.

Evidence Review Record must not authorize external execution.

Evidence Review Record must not authorize Formal WorkUnit promotion.

## 17. Non-authorization Statement

This Evidence Review Gate authorizes no truth assignment, no automated decision, no approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no runtime evidence storage, no runtime provenance storage, no GraphRAG implementation, no vectorization, no real LLM enablement, no database access, no D1 execution, no SQL execution, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./archive/v0/NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
