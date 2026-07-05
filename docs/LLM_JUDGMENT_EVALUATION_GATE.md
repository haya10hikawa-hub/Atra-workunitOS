# LLM Judgment Evaluation Gate

**Phase:** P6.13. **Baseline:** `main` @ `dcf6007`.

Defines when and how an LLM may inspect reviewed evidence to produce a **bounded,
non-authorizing** judgment artifact. Discharges the forward reference repeated across the
query spine — "Future LLM judgment may inspect evidence only after a separate LLM judgment
evaluation gate" ([`D1_READ_ONLY_EXECUTION_GATE.md`](./D1_READ_ONLY_EXECUTION_GATE.md) §16,
[`EVIDENCE_REVIEW_GATE.md`](./EVIDENCE_REVIEW_GATE.md) §16). Consumes the Evidence Review
Record ([`EVIDENCE_REVIEW_RECORD_CONTRACT.md`](./EVIDENCE_REVIEW_RECORD_CONTRACT.md)) and is
grounded in [`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md),
[`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md), and
[`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md). Pairs with
[`LLM_JUDGMENT_RECORD_CONTRACT.md`](./LLM_JUDGMENT_RECORD_CONTRACT.md). Documentation and a
static test only.

> This gate **describes** how LLM judgment must behave. It implements no LLM call, enables
> no real LLM provider, builds no GraphRAG, stores no evidence, and authorizes no decision
> or action. LLM Judgment ≠ Truth; LLM Judgment ≠ Approval; LLM Judgment ≠ Action
> Authorization; LLM Judgment ≠ Formal WorkUnit Promotion; LLM Judgment Evaluation ≠ Runtime
> LLM Enablement.

---

## 1. Purpose

Close the last repeatedly-referenced undefined gate of the query spine: after evidence has
been produced, reviewed, and marked `ready_for_human_evidence_review`, define the one bounded
step where an LLM may *read* that reviewed evidence and emit a judgment artifact that helps a
human — while never becoming the decision, the truth, the approval, or the action.

LLM Judgment Evaluation is not truth assignment and not automated decision-making. It is a bounded, evidence-grounded review step where an LLM may produce a non-authorizing judgment artifact from reviewed evidence, while preserving human decision authority and requiring explicit uncertainty, provenance references, conflict handling, and human review boundaries.

LLM Judgment Evaluationとは真偽判定でも自動意思決定でもない。review済みevidenceを根拠として、LLMが非認可のjudgment artifactを生成しうるboundedなreview stepであり、human decision authority・uncertainty・provenance references・conflict handling・human review boundariesを保持しなければならない。

## 2. Scope

- **In scope:** the gate's inputs, outputs, the Evidence Review Record → LLM Judgment flow,
  pre-evaluation validation, evidence grounding/provenance checks, uncertainty/confidence/
  conflict handling, human-review and decision boundaries, safety/redaction/data boundaries,
  the relationship to Evidence Acceptance / ledger / graph model, and No-Go conditions.
- **Out of scope:** any runtime LLM enablement, real LLM provider integration, GraphRAG,
  vectorization, runtime evidence/provenance/query-result/decision storage, runtime
  approval, ApprovalStore/TSP wiring, external action execution, database access, D1
  execution, or SQL execution.

## 3. Definition of LLM Judgment Evaluation Gate

The LLM Judgment Evaluation Gate allows reviewed evidence to be evaluated only into an LLM Judgment Record, clarification_needed, or No-Go, not truth assignment, not automated decision-making, not approval, not action authorization, and not Formal WorkUnit promotion.

## 4. What LLM Judgment Evaluation Is Not

LLM Judgment Evaluation is **not**:

- truth assignment
- automated decision-making
- approval
- action authorization
- external action
- Formal WorkUnit promotion
- runtime LLM enablement
- real LLM provider integration
- GraphRAG implementation
- vector storage
- evidence storage
- provenance storage
- model-confidence shortcut
- human review replacement

## 5. Gate Principles

- The LLM reads reviewed evidence and proposes; Rules bound what it may read and emit;
  Humans decide. AI proposes; Rules guard; Humans decide.
- Fail closed: unaccepted evidence, failed provenance checks, disallowed use, sensitive
  data, or unresolved conflict resolve to clarification or No-Go, never to a permissive
  judgment.
- An LLM Judgment Record is review material for a human, never an authorization; model
  confidence is explanatory only.

Fixed rules, always:

An LLM Judgment Record must be non-executing.

An LLM Judgment Record must not authorize execution.

An LLM Judgment Record must not authorize external action.

An LLM Judgment Record must not approve anything.

An LLM Judgment Record must not promote a WorkUnit Candidate into a Formal WorkUnit.

An LLM Judgment Record must not be treated as truth by default.

An LLM Judgment Record must not override Evidence Review.

An LLM Judgment Record must not override human review.

A model confidence score must not be used as evidence.

A model confidence score must not be used as truth.

A model confidence score must not authorize approval.

A model confidence score must not authorize action.

A model confidence score must not reduce human_review_required.

A model confidence score must not resolve conflict_state by itself.

Evidence Review Record without tenant_id is No-Go.

Evidence Review Record without evidence_review_id is No-Go.

Evidence Review Record without lineage ids is No-Go.

Evidence Review Record without complete provenance checks is No-Go.

Evidence Review Record with no_go_flags is No-Go.

Evidence Review Record with disallowed_use that includes LLM judgment is No-Go.

Evidence Review Record with evidence_accepted other than true must be clarification_needed or No-Go.

Evidence Review Record with unresolved conflict requires human review.

Evidence Review Record with unknown_source or untrusted_source must not automatically pass into LLM judgment.

## 6. Allowed Inputs

- valid_evidence_review_record
- tenant_id
- evidence_review_id
- source_query_result_record_id
- source_rule_review_record_id
- source_compiled_sql_artifact_id
- source_safe_query_plan_id
- source_query_intent_id
- evidence_claim
- evidence_type
- source_trust_marker
- provenance_check_result
- lineage_check_result
- tenant_scope_check_result
- selected_source_rows_check_result
- selected_columns_check_result
- redaction_check_result
- aggregation_check_result
- source_trust_check_result
- conflict_check_result
- result_hash_check_result
- content_integrity_check_result
- human_review_required
- decision_impact_scope
- allowed_use
- disallowed_use
- evidence_accepted
- evidence_rejected_reason
- reviewer_context
- no_go_flags

## 7. Allowed Outputs

The gate may output only:

- LLM Judgment Record
- clarification_needed
- No-Go

`clarification_needed` and `No-Go` may be emitted either as bare gate outcomes or as an LLM
Judgment Record carrying the corresponding `judgment_status` (per
[`LLM_JUDGMENT_RECORD_CONTRACT.md`](./LLM_JUDGMENT_RECORD_CONTRACT.md) §6).

## 8. Evidence Review Record to LLM Judgment Flow

```
Valid Evidence Review Record → Evidence acceptance and use-boundary validation → Grounding and provenance validation → Uncertainty and conflict validation → LLM Judgment Record or Clarification or No-Go
```

Evaluation stops at a reviewable LLM Judgment Record (or clarification / No-Go); human
decision review, Evidence Acceptance recording, ledger linkage, and any downstream action
remain separate future-gated steps.

## 9. Pre-evaluation Validation

Before an LLM Judgment Record can be produced, the gate must validate evidence_review_id, tenant_id, lineage ids, evidence_claim, evidence_type, source_trust_marker, provenance_check_result, lineage_check_result, tenant_scope_check_result, selected_source_rows_check_result, selected_columns_check_result, redaction_check_result, aggregation_check_result, source_trust_check_result, conflict_check_result, result_hash_check_result, content_integrity_check_result, decision_impact_scope, allowed_use, disallowed_use, evidence_accepted, human_review_required, reviewer_context, and no_go_flags.

## 10. Evidence Grounding and Provenance Checks

LLM judgment input must reference Evidence Review Record ids.

LLM judgment input must reference selected source rows through reviewed evidence only.

LLM judgment input must reference selected columns through reviewed evidence only.

LLM judgment input must preserve provenance references.

LLM judgment input must preserve content_integrity_check_result.

LLM judgment input must preserve result_hash_check_result.

LLM judgment must not cite unavailable sources.

LLM judgment must not invent source rows.

LLM judgment must not invent selected columns.

LLM judgment must not treat unsupported inference as evidence.

## 11. Uncertainty, Confidence, and Conflict Handling

LLM Judgment Record must contain uncertainty_state.

LLM Judgment Record must contain confidence_explanation.

LLM Judgment Record must contain unsupported_inferences.

LLM Judgment Record must contain conflict_handling_summary.

Allowed uncertainty_state values:

- low_uncertainty
- medium_uncertainty
- high_uncertainty
- unknown_uncertainty
- conflicting_evidence
- insufficient_evidence

A judgment with high_uncertainty, unknown_uncertainty, conflicting_evidence, or insufficient_evidence must require human review.

Model confidence must be explanatory only.

Model confidence must not be used as permission.

Model confidence must not convert evidence into truth.

## 12. Human Review and Decision Boundary

human_review_required must remain explicit.

Human review cannot be bypassed by LLM judgment.

LLM judgment may support human review only.

LLM judgment must not make final decisions.

LLM judgment must not modify decision_impact_scope.

LLM judgment must not promote a candidate.

LLM judgment must not create approval.

LLM judgment must not create action preview.

LLM judgment must not create external action.

## 13. Safety, Redaction, and Data Boundary

redaction_check_result must be preserved.

disallowed_use must be respected.

secret_or_token data must not be sent to LLM judgment.

blocked_input data must not be sent to LLM judgment.

unknown_sensitive data must not be sent to LLM judgment.

redaction_required, redaction_unknown, or redaction_failed must not automatically pass into LLM judgment.

LLM judgment must not expose secrets.

LLM judgment must not expand access beyond allowed_use.

## 14. Relationship to Evidence Acceptance / Ledger / Graph Model

Evidence Acceptance recording gate remains future-gated.

LLM Judgment Record must not replace Evidence Acceptance recording.

Future ALPHA_EVIDENCE_LEDGER linkage must preserve evidence_review_id, evidence_claim, evidence_type, source_trust_marker, result_hash, content_integrity_reference, and judgment_id.

Future GRAPH_MODEL linkage must distinguish evidence nodes, judgment nodes, decision nodes, and action nodes.

LLM Judgment Record may reference evidence nodes only after evidence review and acceptance requirements are satisfied.

LLM Judgment Record must not create graph edges that imply action authorization.

## 15. Failure and No-Go Conditions

- invalid_evidence_review_record
- missing_tenant_id
- missing_evidence_review_id
- missing_lineage_id
- missing_evidence_claim
- missing_evidence_type
- missing_source_trust_marker
- provenance_check_failed
- lineage_check_failed
- tenant_scope_check_failed
- selected_source_rows_check_failed
- selected_columns_check_failed
- redaction_check_failed
- aggregation_check_failed
- source_trust_check_failed
- conflict_check_failed
- result_hash_check_failed
- content_integrity_check_failed
- evidence_not_accepted
- llm_judgment_disallowed
- no_go_flags_present
- secret_or_token_sent_to_llm
- blocked_input_sent_to_llm
- unknown_sensitive_sent_to_llm
- unsupported_inference_as_evidence
- invented_source_row
- invented_selected_column
- model_confidence_as_truth
- model_confidence_as_evidence
- model_confidence_as_approval
- model_confidence_as_action_authorization
- human_review_bypass
- llm_judgment_as_formal_workunit_promotion
- llm_judgment_as_external_action

## 16. Relationship to Future GraphRAG / Vector / Runtime LLM

Future GraphRAG may use LLM Judgment Records only after evidence review, evidence acceptance recording, and graph linkage gates are satisfied.

Future vector storage may embed reviewed evidence or judgment only after a separate vectorization gate.

Future runtime LLM may be enabled only after a separate real LLM enablement gate.

Future LLM judgment must remain non-authorizing.

Future action authorization must remain separate.

## 17. Non-authorization Statement

This LLM Judgment Evaluation Gate authorizes no truth assignment, no automated decision-making, no approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no runtime LLM enablement, no real LLM provider integration, no GraphRAG implementation, no vectorization, no runtime evidence storage, no runtime provenance storage, no database access, no D1 execution, no SQL execution, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
