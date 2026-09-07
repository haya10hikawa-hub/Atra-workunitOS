# Evidence Review Record Contract

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.12. **Baseline:** `main` @ `727244f`.

Defines the shape of an Evidence Review Record: the non-executing object produced by the
[`EVIDENCE_REVIEW_GATE.md`](./EVIDENCE_REVIEW_GATE.md) from a valid Query Result Record
([`QUERY_RESULT_RECORD_CONTRACT.md`](./QUERY_RESULT_RECORD_CONTRACT.md)), reviewed before
the result may support human decision-making as evidence. Grounded in
[`EVIDENCE_STANDARD.md`](./archive/v0/EVIDENCE_STANDARD.md),
[`PROVENANCE_MODEL.md`](./archive/v0/PROVENANCE_MODEL.md), and
[`DECISION_RUBRIC.md`](./archive/v0/DECISION_RUBRIC.md). Documentation and a static test only.

---

## 1. Purpose

Give evidence review a single, reviewable output shape so human reviewers — and, behind
their own future gates, GraphRAG and LLM judgment — consume the same check-by-check,
trust-marked, conflict-explicit record, never an implicit "the query said so".

## 2. Scope

- **In scope:** the definition, required fields, status/outcome enums, lineage/provenance/
  integrity/redaction/aggregation/source-trust/conflict rules, the evidence use boundary,
  validation rules, and outcomes of an Evidence Review Record.
- **Out of scope:** any runtime evidence storage, runtime provenance storage, GraphRAG,
  vectorization, real LLM, LLM judgment, database access, D1 execution, SQL execution, or
  ApprovalStore/TSP wiring.

## 3. Definition of Evidence Review Record

An Evidence Review Record is a non-executing, tenant-scoped review artifact that records whether a Query Result Record satisfies lineage, provenance, source row, source column, redaction, aggregation, source trust, conflict, result hash, content integrity, and human-review requirements before it may support human decision-making as evidence.

Evidence Review Recordとは、Query Result Recordが人間の意思決定を支えるevidenceとして扱われる前に、lineage・provenance・source row・source column・redaction・aggregation・source trust・conflict・result hash・content integrity・human-review requirementsを満たすかを記録する、非実行・tenant-scopedなreview artifactである。

## 4. What Evidence Review Record Is Not

Evidence Review Record is **not**:

- truth assignment
- automated decision
- approval
- action authorization
- external action
- Formal WorkUnit promotion
- runtime evidence storage
- runtime provenance storage
- GraphRAG implementation
- LLM judgment
- database access

## 5. Required Fields

- evidence_review_id
- tenant_id
- source_query_result_record_id
- source_rule_review_record_id
- source_compiled_sql_artifact_id
- source_safe_query_plan_id
- source_query_intent_id
- related_goal_id
- related_workunit_candidate_id
- evidence_review_status
- evidence_review_outcome
- evidence_claim
- evidence_type
- source_trust_marker
- provenance_check_result
- lineage_check_result
- tenant_scope_check_result
- selected_source_rows_check_result
- selected_columns_check_result
- denied_schema_check_result
- redaction_check_result
- aggregation_check_result
- source_trust_check_result
- conflict_check_result
- result_hash_check_result
- content_integrity_check_result
- human_review_required
- human_review_reason
- decision_impact_scope
- allowed_use
- disallowed_use
- evidence_eligible
- evidence_accepted
- evidence_rejected_reason
- reviewer_context
- reviewed_by_system
- reviewed_at
- no_go_flags
- notes

`evidence_claim` states, in reviewable prose, exactly what the result is offered as
evidence *of*; `evidence_type` records the result shape being offered (per
[`QUERY_RESULT_RECORD_CONTRACT.md`](./QUERY_RESULT_RECORD_CONTRACT.md) §7) together with
the evidence role it is proposed to play (supports / weakens / contradicts / …, per
[`EVIDENCE_STANDARD.md`](./archive/v0/EVIDENCE_STANDARD.md) evidence roles); `allowed_use` /
`disallowed_use` scope where the evidence may and may not be cited;
`decision_impact_scope` names which decision dimensions of
[`DECISION_RUBRIC.md`](./archive/v0/DECISION_RUBRIC.md) the evidence may inform — priority, risk,
action readiness, or promotion readiness — and citing it outside that scope is a
disallowed use; `reviewed_by_system` names the deterministic rule set (and version) that
produced the record — never a model identity.

## 6. Evidence Review Status

`evidence_review_status` is one of:

- draft_evidence_review
- clarification_needed
- blocked_no_go
- ready_for_human_evidence_review

Reconciliation with the gate's outputs: `clarification_needed` and `No-Go` may be emitted
either as bare gate outcomes or as a record carrying `evidence_review_status`
`clarification_needed` / `blocked_no_go`; only a record whose checks all pass may carry
`ready_for_human_evidence_review` — the terminal status is a queue for HUMAN review, never
an accepted-evidence state.

## 7. Evidence Review Outcome Types

`evidence_review_outcome` is one of:

- pass
- warn
- fail
- no_go

A `warn` or `fail` outcome maps to `evidence_review_status` `draft_evidence_review` or
`clarification_needed` (never `ready_for_human_evidence_review`); a `no_go` outcome maps to
`blocked_no_go`; only a `pass` outcome may carry `ready_for_human_evidence_review`
(following [`RULE_REVIEW_RECORD_CONTRACT.md`](./RULE_REVIEW_RECORD_CONTRACT.md) §7).

## 8. Lineage Fields

source_query_result_record_id is required.

source_rule_review_record_id is required.

source_compiled_sql_artifact_id is required.

source_safe_query_plan_id is required.

source_query_intent_id is required.

Lineage mismatch is No-Go.

## 9. Provenance and Source Fields

provenance_check_result is required.

selected_source_rows_check_result is required.

selected_columns_check_result is required.

tenant_scope_check_result is required.

denied_schema_check_result is required.

A record without selected source rows must not pass.

A record without selected columns must not pass.

A record without complete provenance must not pass.

## 10. Integrity and Hash Fields

result_hash_check_result is required.

content_integrity_check_result is required.

result_hash must be checked against the Query Result Record.

content_integrity_reference must be checked before pass.

Content integrity mismatch is No-Go.

## 11. Redaction and Aggregation Fields

redaction_check_result is required.

aggregation_check_result is required.

redaction_state must be reviewed.

aggregation_method must be reviewed when applicable.

source_scope must be reviewed for aggregated results.

Allowed redaction_state values:

- not_required
- redacted
- partially_redacted
- redaction_required
- redaction_unknown
- redaction_failed

## 12. Source Trust Fields

source_trust_marker is required.

source_trust_check_result is required.

Allowed source_trust_marker values:

- first_party_system_record
- integration_provided_record
- user_provided_record
- derived_query_result
- aggregated_result
- unknown_source
- untrusted_source

unknown_source and untrusted_source must not automatically pass.

## 13. Conflict and Human Review Fields

conflict_check_result is required.

human_review_required is required.

human_review_reason is required when human_review_required is true.

Allowed conflict_state values:

- no_conflict
- conflict_detected
- unresolved_conflict
- source_disagreement
- missing_information
- unknown

Any conflict_state other than no_conflict requires human review.

Evidence must not be treated as truth by default when conflict exists.

## 14. Evidence Use Boundary

Evidence Review Record may support human review only.

Evidence Review Record must not authorize action.

Evidence Review Record must not approve external execution.

Evidence Review Record must not promote a WorkUnit Candidate into a Formal WorkUnit.

Evidence Review Record must not allow LLM judgment without a separate future gate.

evidence_accepted must not mean action_authorized.

Recording the human acceptance decision itself (who flips `evidence_accepted`, under what
authority, and where that decision is stored) is a separate future Evidence Acceptance
recording gate; this contract only carries the fields that decision would fill.

Evidence ≠ Truth; Evidence ≠ Approval; Evidence ≠ Execution Authorization. Acceptance as
evidence means only that a human may now weigh it under
[`DECISION_RUBRIC.md`](./archive/v0/DECISION_RUBRIC.md) — every downstream action keeps its own
preview, approval, and execution gates.

## 15. Validation Rules

A valid Evidence Review Record must contain tenant_id.

A valid Evidence Review Record must contain all lineage ids.

A valid Evidence Review Record must contain provenance_check_result.

A valid Evidence Review Record must contain selected_source_rows_check_result.

A valid Evidence Review Record must contain selected_columns_check_result.

A valid Evidence Review Record must contain denied_schema_check_result.

A valid Evidence Review Record must contain redaction_check_result.

A valid Evidence Review Record must contain source_trust_check_result.

A valid Evidence Review Record must contain conflict_check_result.

A valid Evidence Review Record must contain result_hash_check_result.

A valid Evidence Review Record must contain content_integrity_check_result.

A valid Evidence Review Record must not authorize execution.

A valid Evidence Review Record must not authorize Formal WorkUnit promotion.

## 16. Pass / Warn / Fail / No-Go Outcomes

Pass:
The Evidence Review Record confirms that the Query Result Record is tenant-scoped, lineage-consistent, provenance-complete, source-row grounded, source-column grounded, denied-schema-safe, redaction-reviewed, source-trust-marked, conflict-explicit, content-integrity-verified, and safe to support human evidence review.

Warn:
The Evidence Review Record is tenant-scoped and non-authorizing, but clarification, human review, redaction review, source-trust review, or conflict review is needed before confident evidence use.

Fail:
Required evidence review fields, provenance fields, trust fields, or integrity checks are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as missing tenant scope, lineage mismatch, missing selected source rows, missing selected columns, incomplete provenance, denied schema, secret_or_token result, blocked_input result, unknown_sensitive result, content integrity mismatch, unresolved conflict without human review, model confidence used as evidence, or evidence review treated as action authorization.

## 17. Non-authorization Statement

This Evidence Review Record Contract authorizes no truth assignment, no automated decision, no approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no runtime evidence storage, no runtime provenance storage, no GraphRAG implementation, no vectorization, no real LLM enablement, no database access, no D1 execution, no SQL execution, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
