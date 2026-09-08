# Human Decision Gate

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.14. **Baseline:** `main` @ `1c34375`.

Defines what may happen after Evidence Review
([`EVIDENCE_REVIEW_GATE.md`](./EVIDENCE_REVIEW_GATE.md)) and LLM Judgment
([`LLM_JUDGMENT_EVALUATION_GATE.md`](./LLM_JUDGMENT_EVALUATION_GATE.md)) reach a human review
queue. Closes the query spine's terminal: the three human queues
(`ready_for_rule_review`-era rule review, `ready_for_human_evidence_review`,
`ready_for_human_judgment_review`) now have a human-authored decision artifact to consume
them — the **Human Decision Record**. Also discharges, at the recording level, the
Evidence Acceptance recording gate that
[`EVIDENCE_REVIEW_GATE.md`](./EVIDENCE_REVIEW_GATE.md) and
[`LLM_JUDGMENT_EVALUATION_GATE.md`](./LLM_JUDGMENT_EVALUATION_GATE.md) reference as future.
Pairs with [`HUMAN_DECISION_RECORD_CONTRACT.md`](./HUMAN_DECISION_RECORD_CONTRACT.md).
Documentation and a static test only.

> This gate **describes** how a human decision must be recorded. It stores no decision,
> stores no evidence acceptance, updates no evidence ledger, updates no graph, integrates no
> ApprovalStore, and authorizes no approval, promotion, or execution. Human Decision ≠
> ApprovalStore Approval; Human Decision ≠ External Action Execution; Human Decision ≠
> Automatic Formal WorkUnit Promotion.

---

## 1. Purpose

Give the query spine a terminal, human-authored decision artifact so a human's judgment —
what they decided, on which reviewed evidence and LLM judgment, with what uncertainty and
conflict still open — is captured explicitly, and so every downstream capability (approval,
promotion, execution) remains a separate future gate that this record merely *feeds*.

Human Decision is not ApprovalStore approval and not action authorization. It is a human-authored, evidence-aware, judgment-aware decision artifact that records what a human decided, which reviewed evidence and LLM judgment were considered, what uncertainty remained, and what future gates are required before approval, promotion, or execution.

Human DecisionとはApprovalStore approvalでもaction authorizationでもない。review済みevidenceとLLM judgmentを参照しながら、人間が何を判断したか、どの根拠を考慮したか、どの不確実性が残るか、approval・promotion・executionの前にどのfuture gateが必要かを記録する、人間作成のdecision artifactである。

## 2. Scope

- **In scope:** the gate's inputs, outputs, the Evidence/Judgment → Human Decision flow,
  pre-decision validation, evidence acceptance requirements, LLM judgment review
  requirements, the shared decision_impact_scope enum, human authority boundaries, the
  relationship to approval/promotion/execution, and No-Go conditions.
- **Out of scope:** any runtime decision storage, runtime evidence acceptance storage,
  runtime evidence ledger update, runtime graph update, ApprovalStore integration, P7.1 TSP
  wiring, external action execution, WorkUnit promotion, real LLM, GraphRAG, vectorization,
  database access, D1 execution, or SQL execution.

## 3. Definition of Human Decision Gate

The Human Decision Gate allows reviewed evidence and reviewed LLM judgment to be recorded only into a Human Decision Record, clarification_needed, or No-Go, not ApprovalStore approval, not action authorization, not external action execution, and not automatic Formal WorkUnit promotion.

## 4. What Human Decision Is Not

Human Decision is **not**:

- ApprovalStore approval
- action authorization
- external action execution
- automatic Formal WorkUnit promotion
- automated decision-making
- runtime decision storage
- runtime evidence acceptance storage
- runtime evidence ledger update
- runtime graph update
- approval replacement
- human review replacement
- LLM judgment replacement
- model-confidence shortcut

## 5. Gate Principles

- The human decides and authors the record; Rules bound what the record may claim and what
  it may feed; the model and the evidence support but never replace the human. AI proposes;
  Rules guard; Humans decide.
- Fail closed: missing evidence acceptance, missing rationale, LLM-only authorship, or an
  attempt to treat the record as approval/promotion/execution resolves to clarification or
  No-Go, never to a permissive record.
- A Human Decision Record is an input to future gates, never itself an approval, a
  promotion, or an execution.

Fixed rules, always:

A Human Decision Record must be human-authored.

A Human Decision Record must be non-executing.

A Human Decision Record must not authorize execution.

A Human Decision Record must not authorize external action.

A Human Decision Record must not approve anything in ApprovalStore.

A Human Decision Record must not automatically promote a WorkUnit Candidate into a Formal WorkUnit.

A Human Decision Record must not override ApprovalStore.

A Human Decision Record must not override external action gating.

A Human Decision Record must not be produced solely by an LLM.

A Human Decision Record must not be produced solely from model confidence.

Human decision may reference LLM Judgment Record only as non-authorizing support.

Evidence acceptance must not mean action authorization.

Evidence acceptance must not mean Formal WorkUnit promotion.

## 6. Allowed Inputs

- valid_evidence_review_record
- valid_llm_judgment_record
- tenant_id
- evidence_review_id
- llm_judgment_id
- source_query_result_record_id
- source_rule_review_record_id
- source_compiled_sql_artifact_id
- source_safe_query_plan_id
- source_query_intent_id
- evidence_claim
- evidence_type
- source_trust_marker
- evidence_accepted
- evidence_rejected_reason
- judgment_summary
- judgment_claims
- uncertainty_state
- confidence_explanation
- unsupported_inferences
- conflict_handling_summary
- human_review_required
- human_review_reason
- decision_impact_scope
- allowed_use
- disallowed_use
- reviewer_context
- no_go_flags

## 7. Allowed Outputs

The gate may output only:

- Human Decision Record
- clarification_needed
- No-Go

`clarification_needed` and `No-Go` may be emitted either as bare gate outcomes or as a Human
Decision Record carrying the corresponding `decision_status` (per
[`HUMAN_DECISION_RECORD_CONTRACT.md`](./HUMAN_DECISION_RECORD_CONTRACT.md) §6).

## 8. Evidence / Judgment to Human Decision Flow

```
Valid Evidence Review Record + Valid LLM Judgment Record → Evidence acceptance and judgment review validation → Human decision capture → Human Decision Record or Clarification or No-Go
```

The decision stops at a reviewable Human Decision Record (or clarification / No-Go);
ApprovalStore approval, Formal WorkUnit promotion, external action execution, evidence
ledger linkage, and graph linkage remain separate future-gated steps.

## 9. Pre-decision Validation

Before a Human Decision Record can be produced, the gate must validate tenant_id, evidence_review_id, llm_judgment_id, lineage ids, evidence_claim, evidence_type, source_trust_marker, evidence_accepted, evidence_rejected_reason, judgment_summary, judgment_claims, uncertainty_state, confidence_explanation, unsupported_inferences, conflict_handling_summary, human_review_required, human_review_reason, decision_impact_scope, allowed_use, disallowed_use, reviewer_context, and no_go_flags.

## 10. Evidence Acceptance Requirements

Evidence acceptance is a human-recorded state.

Evidence acceptance must reference an Evidence Review Record.

Evidence acceptance must preserve evidence_review_id.

Evidence acceptance must preserve evidence_claim.

Evidence acceptance must preserve evidence_type.

Evidence acceptance must preserve source_trust_marker.

Evidence acceptance must preserve result_hash.

Evidence acceptance must preserve content_integrity_reference.

Evidence acceptance must preserve conflict state.

Evidence acceptance must not authorize action.

Evidence acceptance must not authorize external execution.

Evidence acceptance must not authorize Formal WorkUnit promotion.

Evidence rejection must preserve evidence_rejected_reason.

## 11. LLM Judgment Review Requirements

Human decision may reference LLM Judgment Record.

Human decision must preserve llm_judgment_id when judgment is used.

Human decision must preserve uncertainty_state.

Human decision must preserve confidence_explanation.

Human decision must preserve unsupported_inferences.

Human decision must preserve conflict_handling_summary.

Human decision must not treat LLM Judgment as truth by default.

Human decision must not treat model_confidence_value as permission.

Human decision must not ignore unsupported_inferences.

Human decision must not ignore unresolved conflict.

## 12. Decision Impact Scope

`decision_impact_scope` is the shared enum used by this gate and by
[`EVIDENCE_REVIEW_RECORD_CONTRACT.md`](./EVIDENCE_REVIEW_RECORD_CONTRACT.md) and
[`LLM_JUDGMENT_RECORD_CONTRACT.md`](./LLM_JUDGMENT_RECORD_CONTRACT.md):

- priority_assessment
- risk_assessment
- action_readiness_assessment
- promotion_readiness_assessment
- evidence_acceptance
- judgment_acceptance
- no_action_decision
- clarification_request
- defer_decision

decision_impact_scope must not authorize action by itself.

decision_impact_scope must not authorize approval by itself.

decision_impact_scope must not authorize Formal WorkUnit promotion by itself.

action_readiness_assessment is not action execution.

promotion_readiness_assessment is not Formal WorkUnit promotion.

## 13. Human Authority and Review Boundary

Human decision authority remains with the human reviewer.

LLM judgment may support but not replace human decision.

Evidence may support but not replace human decision.

Model confidence must not replace human decision.

Human decision must be attributable to a human reviewer.

Human decision must record reviewer_context.

Human decision must preserve uncertainty and conflict notes.

## 14. Relationship to Approval / Promotion / Execution

ApprovalStore approval remains a separate future gate.

Formal WorkUnit promotion remains a separate future gate.

External action execution remains a separate future gate.

Human Decision Record may be an input to future approval, promotion, or execution gates.

Human Decision Record must not itself perform approval, promotion, or execution.

Human Decision Record must not bypass four-eyes requirements.

Human Decision Record must not bypass self-approval restrictions.

## 15. Failure and No-Go Conditions

- invalid_evidence_review_record
- invalid_llm_judgment_record
- missing_tenant_id
- missing_evidence_review_id
- missing_llm_judgment_id
- missing_lineage_id
- missing_evidence_claim
- missing_evidence_type
- missing_source_trust_marker
- evidence_not_accepted
- missing_evidence_rejected_reason
- missing_judgment_summary
- missing_judgment_claims
- missing_uncertainty_state
- missing_confidence_explanation
- missing_unsupported_inferences
- missing_conflict_handling_summary
- missing_human_review_required
- missing_human_review_reason
- missing_decision_impact_scope
- missing_allowed_use
- missing_disallowed_use
- missing_reviewer_context
- no_go_flags_present
- llm_only_decision
- model_confidence_as_decision
- human_review_bypass
- evidence_acceptance_as_action_authorization
- human_decision_as_approvalstore_approval
- human_decision_as_action_authorization
- human_decision_as_external_action
- human_decision_as_formal_workunit_promotion
- four_eyes_bypass
- self_approval_bypass

## 16. Relationship to Future Evidence Ledger / Graph Model / Runtime Decision Storage

Future ALPHA_EVIDENCE_LEDGER linkage may use Human Decision Record only after a separate evidence ledger linkage gate.

Future GRAPH_MODEL linkage may use Human Decision Record only after a separate graph linkage gate.

Future runtime decision storage requires a separate implementation gate.

Future ApprovalStore approval requires a separate approval gate.

Future Formal WorkUnit promotion requires a separate promotion gate.

Future external action execution requires a separate execution gate.

## 17. Non-authorization Statement

This Human Decision Gate authorizes no ApprovalStore approval, no action authorization, no external action execution, no automatic Formal WorkUnit promotion, no automated decision-making, no runtime decision storage, no runtime evidence acceptance storage, no runtime evidence ledger update, no runtime graph update, no ApprovalStore integration, no real LLM enablement, no GraphRAG implementation, no vectorization, no deployment, and no automated decision-making.

Any future implementation or capability enablement requires a new explicit CURRENT
technical/safety decision and applicable implementation and verification gates.

The archived V0 `NEXT_CAPABILITY_GATE` is historical context only and does not authorize
current or future implementation.
