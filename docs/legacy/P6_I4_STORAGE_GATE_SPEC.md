# P6-I4 Storage Gate Spec

**Loop:** P6-I4 (storage_gate_spec_loop, docs-only + static-test per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Builds on:** P6-I0 (PR #88), P6-I1 (PR #89), P6-I2 (PR #90), P6-I3 (PR #91), all merged.
**Human Go:** [`P6_I4_EXPLICIT_HUMAN_GO.md`](./P6_I4_EXPLICIT_HUMAN_GO.md) (recorded before code).

## 1. Purpose

Define the Phase 6 Storage Gate before any Phase 6 artifact may be persisted. P6-I3 proved the
spine can run in a test-only in-memory non-persistent harness; P6-I4 specifies the future gate
that will decide whether a validated Phase 6 artifact or full spine is *eligible* to be
considered by a later persistence implementation gate — and pins that specification with static
tests. This loop specifies the gate; it does not implement it.

The Phase 6 Storage Gate defines whether validated Phase 6 artifacts are eligible for future persistence, but it does not implement storage, persistence, D1 access, SQL execution, repository behavior, approval, promotion, execution, or production readiness.

Phase 6 Storage Gateとは、検証済みのPhase 6 artifactが将来の永続化候補になれるかを判定するためのgateであり、storage実装・persistence実装・D1アクセス・SQL実行・repository動作・approval・promotion・execution・production readinessを意味しない。

## 2. Scope

Documentation and static tests only. No app runtime file is added or modified. No storage,
persistence, D1 binding, D1 migration, SQL execution, repository, storage adapter, or database
schema is implemented. This spec references the merged P6-I0 validators, P6-I1 constructors,
P6-I2 fixture spine, and P6-I3 in-memory non-persistent harness, but wires none of them into any
runtime path.

## 3. Definition of Storage Gate

The Phase 6 Storage Gate is a future, non-authorizing decision point that evaluates whether a
validated Phase 6 artifact (or a grouped spine of artifacts) satisfies every pre-storage check
and is therefore *eligible* to be handed to a later, separately-gated persistence implementation
(P6-I5). Eligibility is a statement about coherence and safety of the candidate data — not an act
of storing, approving, executing, or promoting anything.

## 4. What Storage Gate Is Not

The Storage Gate is not:

- storage implementation
- persistence implementation
- D1 access
- D1 migration
- SQL execution
- repository implementation
- storage adapter implementation
- database schema
- runtime pipeline
- ApprovalStore integration
- external action execution
- Formal WorkUnit promotion
- production readiness

Storage Gate Spec ≠ Storage Implementation. Storage Eligibility ≠ Persistence. Storage
Eligibility ≠ Approval. Storage Eligibility ≠ Execution Permission. Storage Eligibility ≠ Formal
WorkUnit Promotion. Storage Eligibility ≠ Production Readiness.

## 5. Product and Safety Invariants

AI proposes. Rules guard. Humans decide.

- Storage eligibility is non-authorizing.
- Storage eligibility must not approve anything.
- Storage eligibility must not execute anything.
- Storage eligibility must not promote a WorkUnit.
- Storage eligibility must not make evidence true.
- Storage eligibility must not make LLM judgment true.
- Storage eligibility must not make a Human Decision into ApprovalStore approval.

Candidate ≠ Formal WorkUnit. Preview ≠ Approval. Approval ≠ Execution. Evidence ≠ Truth. LLM
Judgment ≠ Truth. Human Decision ≠ ApprovalStore Approval.

## 6. Storage Eligibility

The gate defines a candidate as eligible for future storage only when all of these are true:

- artifact was constructed by P6-I1 constructor or an equivalent future gated constructor
- artifact passes matching P6-I0 validator
- artifact has tenant_id
- artifact has stable artifact id
- artifact has required lineage ids
- artifact belongs to one tenant scope
- upstream lineage ids are internally consistent
- no_go_flags are empty unless artifact status is blocked_no_go and future gate explicitly permits storing blocked records
- hash fields are valid 64-character lowercase SHA-256 hex where applicable
- content_integrity_reference fields are sha256:<64 lowercase hex> where applicable
- timestamps are caller-provided and deterministic
- artifact does not include approval/execution/promotion grant fields
- artifact is not treated as truth, approval, execution, or promotion

Storage eligibility is a coherence-and-safety verdict only. It never persists, approves,
executes, or promotes.

## 7. Eligible Phase 6 Artifacts

The following artifacts may be considered for future storage:

- QueryIntentRecord
- SafeQueryPlan
- CompiledSqlArtifact
- RuleReviewRecord
- QueryResultRecord
- EvidenceReviewRecord
- LlmJudgmentRecord
- HumanDecisionRecord
- full Phase 6 artifact spine as a grouped candidate, only when each artifact is individually eligible

## 8. Required Pre-storage Checks

Before any candidate is deemed storage-eligible, the future gate must run:

- matching validator pass
- tenant consistency check
- lineage continuity check
- artifact id presence check
- timestamp presence check
- hash format check
- content integrity format check
- no_go_flags policy check
- non-authorization shape check
- forbidden grant-like key check
- deterministic fixture/harness reproducibility check for test fixtures
- explicit human review before enabling persistence implementation

## 9. Tenant Scope Requirements

- tenant_id required on every stored candidate artifact
- cross-tenant spine storage is No-Go
- missing tenant_id is No-Go
- tenant inconsistency across a grouped spine is No-Go
- tenant scope eligibility is not authorization
- tenant scope eligibility is not user permission
- future storage implementation must still enforce authorization separately

## 10. Lineage Continuity Requirements

Every lineage edge from P6-I2 must hold for a grouped spine candidate:

SafeQueryPlan.source_query_intent_id === QueryIntentRecord.query_intent_id

CompiledSqlArtifact.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id

CompiledSqlArtifact.source_query_intent_id === QueryIntentRecord.query_intent_id

RuleReviewRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id

RuleReviewRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id

RuleReviewRecord.source_query_intent_id === QueryIntentRecord.query_intent_id

QueryResultRecord.source_rule_review_record_id === RuleReviewRecord.rule_review_record_id

QueryResultRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id

QueryResultRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id

QueryResultRecord.source_query_intent_id === QueryIntentRecord.query_intent_id

EvidenceReviewRecord.source_query_result_record_id === QueryResultRecord.query_result_record_id

EvidenceReviewRecord.source_rule_review_record_id === RuleReviewRecord.rule_review_record_id

EvidenceReviewRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id

EvidenceReviewRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id

EvidenceReviewRecord.source_query_intent_id === QueryIntentRecord.query_intent_id

LlmJudgmentRecord.source_evidence_review_record_id === EvidenceReviewRecord.evidence_review_id

LlmJudgmentRecord.source_query_result_record_id === QueryResultRecord.query_result_record_id

LlmJudgmentRecord.source_rule_review_record_id === RuleReviewRecord.rule_review_record_id

LlmJudgmentRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id

LlmJudgmentRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id

LlmJudgmentRecord.source_query_intent_id === QueryIntentRecord.query_intent_id

HumanDecisionRecord.source_evidence_review_record_id === EvidenceReviewRecord.evidence_review_id

HumanDecisionRecord.source_llm_judgment_record_id === LlmJudgmentRecord.llm_judgment_id

HumanDecisionRecord.llm_judgment_id === LlmJudgmentRecord.llm_judgment_id

HumanDecisionRecord.source_query_result_record_id === QueryResultRecord.query_result_record_id

HumanDecisionRecord.source_rule_review_record_id === RuleReviewRecord.rule_review_record_id

HumanDecisionRecord.source_compiled_sql_artifact_id === CompiledSqlArtifact.compiled_sql_artifact_id

HumanDecisionRecord.source_safe_query_plan_id === SafeQueryPlan.safe_query_plan_id

HumanDecisionRecord.source_query_intent_id === QueryIntentRecord.query_intent_id

Any lineage mismatch across a grouped spine candidate is No-Go.

## 11. Hash and Content Integrity Requirements

- sql_hash must be 64-character lowercase SHA-256 hex
- result_hash must be 64-character lowercase SHA-256 hex
- content_integrity_reference must be sha256:<64 lowercase hex>
- payload_hash for future storage gate records must be sha256:<64 lowercase hex>
- hash validity is not truth
- content integrity is not approval
- hash presence is not execution permission

## 12. Determinism Requirements

- Storage eligibility must be deterministic: the same candidate inputs must yield the same
  eligibility verdict on every evaluation.
- Timestamps are caller-provided and deterministic; the gate generates no timestamps.
- Ids are caller-provided; the gate generates no ids.
- The gate uses no clock, no randomness, and no non-deterministic source when computing
  eligibility.
- For test fixtures, the deterministic P6-I2 fixture spine and P6-I3 in-memory harness must
  reproduce the same artifacts and the same eligibility verdict across repeated runs.

## 13. No-Go Conditions

Any of the following is No-Go:

- p6_i3_not_merged
- missing_foundation_file
- missing_explicit_human_go
- app_runtime_changed
- storage_implementation_added
- persistence_implementation_added
- d1_binding_added
- d1_migration_added
- sql_execution_added
- repository_added
- storage_adapter_added
- database_schema_added
- runtime_pipeline_added
- approvalstore_integration_added
- p7_1_tsp_wiring_added
- external_action_execution_added
- formal_workunit_promotion_added
- storage_eligibility_treated_as_approval
- storage_eligibility_treated_as_execution
- storage_eligibility_treated_as_promotion
- evidence_treated_as_truth
- llm_judgment_treated_as_truth
- human_decision_treated_as_approval
- missing_tenant_id_allowed
- cross_tenant_spine_allowed
- lineage_mismatch_allowed
- invalid_hash_allowed
- invalid_content_integrity_allowed
- no_go_flags_ignored
- validation_not_required_before_storage
- human_review_bypassed_before_persistence_gate
- ruleset_weakened
- validation_failed

## 14. Relationship to Evidence Ledger

- Storage Gate may define future eligibility for ledger entry candidates.
- Storage Gate does not update ALPHA_EVIDENCE_LEDGER.
- Storage Gate does not append evidence ledger entries.
- Storage Gate does not make evidence true.
- Ledger linkage remains future-gated.

## 15. Relationship to Graph Model

- Storage Gate may define future eligibility for graph node or edge candidates.
- Storage Gate does not implement graph storage.
- Storage Gate does not implement GraphRAG.
- Storage Gate does not create runtime graph edges.
- Graph linkage remains future-gated.

## 16. Relationship to ApprovalStore

- Storage Gate has no ApprovalStore authority.
- Storage eligibility is not ApprovalStore approval.
- Storage eligibility must not satisfy approval requirements.
- ApprovalStore wiring remains blocked.
- P7.1 TSP utilities remain unwired.

## 17. Relationship to External Actions

- Storage Gate cannot execute external actions.
- Storage Gate cannot authorize sends, posts, creates, updates, deletes, shares, commits, or publishes.
- External action execution remains blocked.

## 18. Requirements for Future P6-I5 Persistence Implementation Gate

- P6-I5 must have its own explicit human Go
- P6-I5 must verify P6-I4 merged into main
- P6-I5 must define allowed storage target before implementation
- P6-I5 must define tenant isolation checks
- P6-I5 must define schema versioning
- P6-I5 must define idempotency and duplicate handling
- P6-I5 must define rollback behavior
- P6-I5 must define audit behavior without ApprovalStore authority
- P6-I5 must define redaction behavior
- P6-I5 must preserve non-authorization boundary
- P6-I5 must not add D1 execution unless a separate D1 gate permits it
- P6-I5 must not add external actions
- P6-I5 must not promote Formal WorkUnits

## 19. Non-authorization Statement

This Phase 6 Storage Gate Spec authorizes no storage implementation, no persistence implementation, no D1 access, no D1 migration, no SQL execution, no repository implementation, no storage adapter, no database schema, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.
