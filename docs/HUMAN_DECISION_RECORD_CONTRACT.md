# Human Decision Record Contract

**Phase:** P6.14. **Baseline:** `main` @ `1c34375`.

Defines the shape of a Human Decision Record: the non-executing, human-authored object
produced by the [`HUMAN_DECISION_GATE.md`](./HUMAN_DECISION_GATE.md) from a valid Evidence
Review Record ([`EVIDENCE_REVIEW_RECORD_CONTRACT.md`](./EVIDENCE_REVIEW_RECORD_CONTRACT.md))
and a valid LLM Judgment Record
([`LLM_JUDGMENT_RECORD_CONTRACT.md`](./LLM_JUDGMENT_RECORD_CONTRACT.md)). Grounded in
[`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md) and
[`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md). Documentation and a static test only.

---

## 1. Purpose

Give the human decision a single, reviewable output shape so downstream future gates
(approval, promotion, execution) and future ledger/graph linkage consume the same
attributable, evidence-referenced, rationale-complete record — never a bare "approved" flag
detached from the evidence and judgment the human actually weighed.

## 2. Scope

- **In scope:** the definition, required fields, status/outcome enums, evidence-acceptance/
  judgment-reference/decision-impact-scope/reviewer-attribution/uncertainty-conflict-rationale/
  use rules, the approval/promotion/ledger/graph relationship, validation rules, and
  outcomes of a Human Decision Record.
- **Out of scope:** any runtime decision storage, runtime evidence ledger update, runtime
  graph update, ApprovalStore integration, real LLM, GraphRAG, vectorization, database
  access, D1 execution, or SQL execution.

## 3. Definition of Human Decision Record

A Human Decision Record is a non-executing, human-authored, tenant-scoped artifact that records a human decision, reviewed evidence references, reviewed LLM judgment references, evidence acceptance state, uncertainty, conflict, rationale, decision impact scope, allowed use, disallowed use, and future gate requirements without authorizing approval, promotion, or execution.

Human Decision Recordとは、人間の判断・review済みevidence references・review済みLLM judgment references・evidence acceptance state・uncertainty・conflict・rationale・decision impact scope・allowed use・disallowed use・future gate requirementsを記録する、非実行・人間作成・tenant-scopedなartifactであり、approval・promotion・executionを認可しない。

## 4. What Human Decision Record Is Not

Human Decision Record is **not**:

- ApprovalStore approval
- action authorization
- external action
- Formal WorkUnit promotion
- automated decision
- runtime decision storage
- runtime evidence ledger update
- runtime graph update
- LLM judgment
- evidence review
- approval replacement
- human review replacement

## 5. Required Fields

- human_decision_id
- tenant_id
- decision_status
- decision_outcome
- human_reviewer_id
- human_reviewer_role
- reviewer_context
- source_evidence_review_record_id
- source_llm_judgment_record_id
- source_query_result_record_id
- source_rule_review_record_id
- source_compiled_sql_artifact_id
- source_safe_query_plan_id
- source_query_intent_id
- related_goal_id
- related_workunit_candidate_id
- evidence_accepted
- evidence_rejected_reason
- evidence_claim
- evidence_type
- source_trust_marker
- result_hash
- content_integrity_reference
- llm_judgment_id
- judgment_summary
- judgment_claims
- uncertainty_state
- confidence_explanation
- unsupported_inferences
- conflict_handling_summary
- human_decision_summary
- human_decision_rationale
- decision_impact_scope
- allowed_use
- disallowed_use
- future_gate_requirements
- approval_required
- promotion_required
- execution_required
- four_eyes_required
- self_approval_blocked
- reviewed_by_human_at
- created_at
- no_go_flags
- notes

Note: `related_goal_id` and `related_workunit_candidate_id` are lineage anchors only —
populating `related_workunit_candidate_id` carries no promotion-readiness meaning and never
substitutes for `promotion_readiness_assessment`, which itself is not Formal WorkUnit
promotion (§10).

## 6. Decision Status

`decision_status` is one of:

- draft_human_decision
- clarification_needed
- blocked_no_go
- ready_for_future_gate_review

Reconciliation with the gate's outputs: `clarification_needed` and `No-Go` may be emitted
either as bare gate outcomes or as a record carrying `decision_status`
`clarification_needed` / `blocked_no_go`; only a record whose checks all pass may carry
`ready_for_future_gate_review` — the terminal status is a queue for a separate future
approval / promotion / execution gate, never an approval, promotion, or execution itself.

## 7. Decision Outcome Types

`decision_outcome` is one of:

- pass
- warn
- fail
- no_go

A `warn` or `fail` outcome maps to `decision_status` `draft_human_decision` or
`clarification_needed` (never `ready_for_future_gate_review`); a `no_go` outcome maps to
`blocked_no_go`; only a `pass` outcome may carry `ready_for_future_gate_review` (following
[`LLM_JUDGMENT_RECORD_CONTRACT.md`](./LLM_JUDGMENT_RECORD_CONTRACT.md) §7).

## 8. Evidence Acceptance Fields

source_evidence_review_record_id is required.

evidence_accepted is required.

evidence_rejected_reason is required when evidence_accepted is false.

evidence_claim is required.

evidence_type is required.

source_trust_marker is required.

result_hash is required.

content_integrity_reference is required.

Evidence acceptance must not authorize action.

Evidence acceptance must not authorize approval.

Evidence acceptance must not authorize promotion.

## 9. LLM Judgment Reference Fields

source_llm_judgment_record_id is required when LLM judgment is used.

llm_judgment_id must match source_llm_judgment_record_id when present.

judgment_summary is required when LLM judgment is used.

judgment_claims is required when LLM judgment is used.

uncertainty_state is required.

confidence_explanation is required.

unsupported_inferences is required.

conflict_handling_summary is required.

LLM judgment must not be treated as truth by default.

## 10. Decision Impact Scope Fields

`decision_impact_scope` is the shared enum:

- priority_assessment
- risk_assessment
- action_readiness_assessment
- promotion_readiness_assessment
- evidence_acceptance
- judgment_acceptance
- no_action_decision
- clarification_request
- defer_decision

decision_impact_scope is required.

action_readiness_assessment is not execution.

promotion_readiness_assessment is not Formal WorkUnit promotion.

## 11. Human Reviewer and Attribution Fields

human_reviewer_id is required.

human_reviewer_role is required.

reviewer_context is required.

reviewed_by_human_at is required.

Human Decision Record must be attributable to a human reviewer.

LLM-only decision is No-Go.

## 12. Uncertainty, Conflict, and Rationale Fields

uncertainty_state is required.

unsupported_inferences is required.

conflict_handling_summary is required.

human_decision_summary is required.

human_decision_rationale is required.

Unresolved conflict must be preserved.

Unsupported inference must not be treated as evidence.

## 13. Allowed Use and Disallowed Use Fields

allowed_use is required.

disallowed_use is required.

Human Decision Record may support future gates only.

Human Decision Record must respect disallowed_use.

Human Decision Record must not authorize action.

Human Decision Record must not authorize approval.

Human Decision Record must not authorize promotion.

## 14. Relationship to Approval / Promotion / Evidence Ledger / Graph Model

ApprovalStore approval remains a separate future gate.

Formal WorkUnit promotion remains a separate future gate.

External action execution remains a separate future gate.

Future ALPHA_EVIDENCE_LEDGER linkage must preserve human_decision_id, evidence_review_id, llm_judgment_id, evidence_claim, evidence_type, source_trust_marker, result_hash, and content_integrity_reference.

Future GRAPH_MODEL linkage must distinguish evidence nodes, judgment nodes, human decision nodes, approval nodes, promotion nodes, and action nodes.

Human Decision Record must not create graph edges that imply action authorization.

## 15. Validation Rules

A valid Human Decision Record must contain tenant_id.

A valid Human Decision Record must contain human_reviewer_id.

A valid Human Decision Record must contain reviewer_context.

A valid Human Decision Record must contain evidence_accepted.

A valid Human Decision Record must contain decision_impact_scope.

A valid Human Decision Record must contain allowed_use and disallowed_use.

A valid Human Decision Record must contain future_gate_requirements.

A valid Human Decision Record must not be LLM-only.

A valid Human Decision Record must not authorize execution.

A valid Human Decision Record must not authorize Formal WorkUnit promotion.

A valid Human Decision Record must not authorize ApprovalStore approval.

four_eyes_required must be true for every valid Human Decision Record in this phase.

self_approval_blocked must be true for every valid Human Decision Record in this phase.

approval_required, promotion_required, and execution_required are contextual descriptors and are not phase-wide literal-true invariants.

approval_required does not authorize approval.

promotion_required does not authorize promotion.

execution_required does not authorize execution.

None of these five fields authorizes approval, promotion, execution, persistence, external action, or Formal WorkUnit promotion.

## 16. Pass / Warn / Fail / No-Go Outcomes

Pass:
The Human Decision Record is tenant-scoped, human-authored, evidence-aware, judgment-aware, uncertainty-preserving, conflict-preserving, rationale-complete, future-gate-explicit, and non-authorizing.

Warn:
The Human Decision Record is non-authorizing, but evidence acceptance, judgment review, uncertainty, conflict, rationale, or future gate requirements need clarification before downstream use.

Fail:
Required human decision fields, evidence references, judgment references, or rationale fields are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as LLM-only decision, model confidence used as decision, evidence acceptance used as action authorization, human decision used as ApprovalStore approval, human decision used as external action, human decision used as Formal WorkUnit promotion, self-approval bypass, four-eyes bypass, or execution authorization.

## 17. Non-authorization Statement

This Human Decision Record Contract authorizes no ApprovalStore approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no automated decision, no runtime decision storage, no runtime evidence ledger update, no runtime graph update, no ApprovalStore integration, no real LLM enablement, no GraphRAG implementation, no vectorization, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
