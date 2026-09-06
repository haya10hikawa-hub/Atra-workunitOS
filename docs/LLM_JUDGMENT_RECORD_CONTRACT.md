# LLM Judgment Record Contract

**Phase:** P6.13. **Baseline:** `main` @ `dcf6007`.

Defines the shape of an LLM Judgment Record: the non-executing object produced by the
[`LLM_JUDGMENT_EVALUATION_GATE.md`](./LLM_JUDGMENT_EVALUATION_GATE.md) from a valid Evidence
Review Record ([`EVIDENCE_REVIEW_RECORD_CONTRACT.md`](./EVIDENCE_REVIEW_RECORD_CONTRACT.md)),
reviewed by a human before it may support any decision. Grounded in
[`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md),
[`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md), and
[`DECISION_RUBRIC.md`](./archive/v0/DECISION_RUBRIC.md). Documentation and a static test only.

---

## 1. Purpose

Give LLM judgment a single, reviewable output shape so a human reviewer — and, behind their
own future gates, ledger linkage and graph judgment nodes — consume the same
evidence-referenced, uncertainty-explicit, use-bounded record, never a bare model opinion
detached from its evidence.

## 2. Scope

- **In scope:** the definition, required fields, status/outcome enums, evidence-reference/
  grounding/provenance/uncertainty/conflict/use/safety rules, the decision/ledger/graph
  relationship, validation rules, and outcomes of an LLM Judgment Record.
- **Out of scope:** any runtime LLM call, GraphRAG, vector embedding, runtime evidence/
  provenance storage, database access, D1 execution, SQL execution, or ApprovalStore/TSP
  wiring.

## 3. Definition of LLM Judgment Record

An LLM Judgment Record is a non-executing, tenant-scoped, evidence-grounded artifact that records a bounded model judgment, its evidence references, uncertainty, confidence explanation, unsupported inferences, conflict handling, allowed use, disallowed use, and human-review requirements without authorizing decisions or actions.

LLM Judgment Recordとは、boundedなmodel judgment・evidence references・uncertainty・confidence explanation・unsupported inferences・conflict handling・allowed use・disallowed use・human-review requirementsを記録する、非実行・tenant-scoped・evidence-groundedなartifactであり、decisionやactionを認可しない。

## 4. What LLM Judgment Record Is Not

LLM Judgment Record is **not**:

- truth assignment
- automated decision
- approval
- action authorization
- external action
- Formal WorkUnit promotion
- runtime LLM call
- GraphRAG implementation
- vector embedding
- evidence storage
- provenance storage
- human review replacement

## 5. Required Fields

- llm_judgment_id
- tenant_id
- source_evidence_review_record_id
- source_query_result_record_id
- source_rule_review_record_id
- source_compiled_sql_artifact_id
- source_safe_query_plan_id
- source_query_intent_id
- related_goal_id
- related_workunit_candidate_id
- judgment_status
- judgment_outcome
- judgment_summary
- judgment_claims
- evidence_references
- provenance_references
- selected_source_rows_referenced
- selected_columns_referenced
- source_trust_marker
- evidence_type
- evidence_claim
- uncertainty_state
- confidence_explanation
- model_confidence_value
- unsupported_inferences
- conflict_handling_summary
- human_review_required
- human_review_reason
- decision_impact_scope
- allowed_use
- disallowed_use
- redaction_state
- safety_boundary_result
- model_identity
- prompt_version
- reviewed_by_system
- judged_at
- no_go_flags
- notes

`judgment_summary` and `judgment_claims` state, in reviewable prose, what the model judged
and on what basis; `model_identity` and `prompt_version` record which model and prompt
produced the record for auditability; `reviewed_by_system` names the deterministic gate rule
set (and version) that validated the record — the model produced the judgment, the rules
validated it, and a human decides what it means.

`decision_impact_scope` carries the same values as the Evidence Review Record's field
([`EVIDENCE_REVIEW_RECORD_CONTRACT.md`](./EVIDENCE_REVIEW_RECORD_CONTRACT.md) §14 —
priority, risk, action readiness, or promotion readiness, per
[`DECISION_RUBRIC.md`](./archive/v0/DECISION_RUBRIC.md)); the LLM Judgment Record preserves it
unchanged and must not modify it. `redaction_state` is the stored redaction classification
carried on the record; it is distinct from the gate's `redaction_check_result` input (the
review outcome consumed from the Evidence Review Record) and a future implementation must
map the two explicitly.

## 6. Judgment Status

`judgment_status` is one of:

- draft_judgment
- clarification_needed
- blocked_no_go
- ready_for_human_judgment_review

Reconciliation with the gate's outputs: `clarification_needed` and `No-Go` may be emitted
either as bare gate outcomes or as a record carrying `judgment_status`
`clarification_needed` / `blocked_no_go`; only a record whose checks all pass may carry
`ready_for_human_judgment_review` — the terminal status is a queue for HUMAN judgment
review, never an accepted-decision state.

## 7. Judgment Outcome Types

`judgment_outcome` is one of:

- pass
- warn
- fail
- no_go

A `warn` or `fail` outcome maps to `judgment_status` `draft_judgment` or
`clarification_needed` (never `ready_for_human_judgment_review`); a `no_go` outcome maps to
`blocked_no_go`; only a `pass` outcome may carry `ready_for_human_judgment_review` (following
[`EVIDENCE_REVIEW_RECORD_CONTRACT.md`](./EVIDENCE_REVIEW_RECORD_CONTRACT.md) §7).

## 8. Evidence Reference Fields

source_evidence_review_record_id is required.

source_query_result_record_id is required.

source_rule_review_record_id is required.

source_compiled_sql_artifact_id is required.

source_safe_query_plan_id is required.

source_query_intent_id is required.

evidence_references is required.

provenance_references is required.

selected_source_rows_referenced is required.

selected_columns_referenced is required.

A judgment without evidence references must not pass.

A judgment without provenance references must not pass.

## 9. Grounding and Provenance Fields

judgment_claims must be grounded in evidence_references.

unsupported_inferences must be explicit.

LLM Judgment Record must not invent source rows.

LLM Judgment Record must not invent selected columns.

LLM Judgment Record must not cite unavailable evidence.

LLM Judgment Record must not treat unsupported inference as evidence.

## 10. Uncertainty and Confidence Fields

uncertainty_state is required.

confidence_explanation is required.

model_confidence_value is optional and explanatory only.

Allowed uncertainty_state values:

- low_uncertainty
- medium_uncertainty
- high_uncertainty
- unknown_uncertainty
- conflicting_evidence
- insufficient_evidence

model_confidence_value must not authorize approval.

model_confidence_value must not authorize action.

model_confidence_value must not reduce human_review_required.

## 11. Conflict and Human Review Fields

conflict_handling_summary is required.

human_review_required is required.

human_review_reason is required when human_review_required is true.

high_uncertainty, unknown_uncertainty, conflicting_evidence, and insufficient_evidence require human review.

LLM Judgment Record must not bypass human review.

## 12. Allowed Use and Disallowed Use Fields

allowed_use is required.

disallowed_use is required.

LLM Judgment Record may support human review only.

LLM Judgment Record must not authorize decisions.

LLM Judgment Record must not authorize actions.

LLM Judgment Record must respect disallowed_use.

## 13. Safety and Redaction Fields

redaction_state is required.

safety_boundary_result is required.

secret_or_token data must not appear.

blocked_input data must not appear.

unknown_sensitive data must not appear.

Redaction failures must not pass.

## 14. Relationship to Decision / Evidence Ledger / Graph Model

LLM Judgment Record may support human decision review.

LLM Judgment Record must not be a decision record.

LLM Judgment Record must not update ALPHA_EVIDENCE_LEDGER in this phase.

Future ALPHA_EVIDENCE_LEDGER linkage must preserve evidence_review_id and llm_judgment_id.

Future GRAPH_MODEL linkage must distinguish evidence nodes, judgment nodes, decision nodes, and action nodes.

LLM Judgment Record must not create graph edges that imply action authorization.

## 15. Validation Rules

A valid LLM Judgment Record must contain tenant_id.

A valid LLM Judgment Record must contain all lineage ids.

A valid LLM Judgment Record must contain evidence_references.

A valid LLM Judgment Record must contain provenance_references.

A valid LLM Judgment Record must contain selected_source_rows_referenced.

A valid LLM Judgment Record must contain selected_columns_referenced.

A valid LLM Judgment Record must contain uncertainty_state.

A valid LLM Judgment Record must contain confidence_explanation.

A valid LLM Judgment Record must contain conflict_handling_summary.

A valid LLM Judgment Record must contain allowed_use and disallowed_use.

A valid LLM Judgment Record must not authorize execution.

A valid LLM Judgment Record must not authorize Formal WorkUnit promotion.

## 16. Pass / Warn / Fail / No-Go Outcomes

Pass:
The LLM Judgment Record is tenant-scoped, evidence-grounded, provenance-referenced, uncertainty-explicit, conflict-explicit, human-review-preserving, safety-boundary-compliant, and non-authorizing.

Warn:
The LLM Judgment Record is non-authorizing, but uncertainty, conflict, redaction, grounding, or reviewer context requires clarification before confident human review.

Fail:
Required judgment fields, evidence references, provenance references, or uncertainty fields are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as model confidence used as truth, model confidence used as evidence, model confidence used as approval, model confidence used as action authorization, invented source rows, invented selected columns, unsupported inference treated as evidence, human review bypass, secret_or_token exposure, blocked_input exposure, unknown_sensitive exposure, Formal WorkUnit promotion, or external action authorization.

## 17. Non-authorization Statement

This LLM Judgment Record Contract authorizes no truth assignment, no automated decision, no approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no runtime LLM call, no GraphRAG implementation, no vector embedding, no runtime evidence storage, no runtime provenance storage, no database access, no D1 execution, no SQL execution, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
