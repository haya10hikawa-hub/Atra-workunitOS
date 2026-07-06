# P6-I5 Persistence Implementation Gate

**Loop:** P6-I5 (persistence_implementation_gate_spec_loop, docs-only + static-test per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Builds on:** P6-I0 (PR #88), P6-I1 (PR #89), P6-I2 (PR #90), P6-I3 (PR #91), P6-I4 (PR #92), all
merged. **Human Go:** [`P6_I5_EXPLICIT_HUMAN_GO.md`](./P6_I5_EXPLICIT_HUMAN_GO.md) (recorded before
code).

## 1. Purpose

Define the Phase 6 Persistence Implementation Gate before any Phase 6 artifact persistence
implementation is allowed. P6-I4 defined Storage Gate eligibility; P6-I5 specifies what must be
true before a later loop may persist storage-eligible Phase 6 artifacts or spines — and pins that
specification with static tests. This loop specifies the gate; it does not implement it.

The Phase 6 Persistence Implementation Gate defines what must be true before a later loop may implement persistence for storage-eligible Phase 6 artifacts, but it does not implement persistence, storage, D1 access, SQL execution, repository behavior, storage adapters, database schema, approval, promotion, execution, or production readiness.

Phase 6 Persistence Implementation Gateとは、storage-eligibleなPhase 6 artifactを将来のloopで永続化実装できるかを判定するためのgateであり、persistence実装・storage実装・D1アクセス・SQL実行・repository動作・storage adapter・database schema・approval・promotion・execution・production readinessを意味しない。

## 2. Scope

Documentation and static tests only. No app runtime file is added or modified. No persistence,
storage, repository, storage adapter, database schema, D1 binding, D1 migration, D1 access, or SQL
execution is implemented. This spec references the merged P6-I0 validators, P6-I1 constructors,
P6-I2 fixture spine, P6-I3 in-memory non-persistent harness, and P6-I4 Storage Gate Spec / Storage
Gate Record Contract, but wires none of them into any runtime path.

## 3. Definition of Persistence Implementation Gate

The Phase 6 Persistence Implementation Gate is a future, non-authorizing decision point that
evaluates whether a storage-eligible Phase 6 artifact (or grouped spine) has satisfied every
readiness criterion — tenant isolation, identity/lineage, schema versioning, serialization,
idempotency, redaction, audit, rollback — such that a later implementation loop may be permitted
to build persistence for it. Readiness is a statement about preparedness and safety of the
candidate — not an act of persisting, storing, approving, executing, or promoting anything.

## 4. What Persistence Implementation Gate Is Not

The Persistence Implementation Gate is not:

- persistence implementation
- storage implementation
- D1 access
- D1 binding
- D1 migration
- SQL execution
- repository implementation
- storage adapter implementation
- database schema
- runtime pipeline
- ApprovalStore integration
- P7.1 TSP wiring
- external action execution
- Formal WorkUnit promotion
- production readiness

Storage Eligibility ≠ Persistence. Persistence Gate Spec ≠ Persistence Implementation.
Persistence Gate Spec ≠ D1 Access. Persistence Gate Spec ≠ SQL Execution. Persistence Gate Spec ≠
Approval. Persistence Gate Spec ≠ Execution Permission. Persistence Gate Spec ≠ Formal WorkUnit
Promotion. Persistence Gate Spec ≠ Production Readiness.

## 5. Product and Safety Invariants

AI proposes. Rules guard. Humans decide.

- Persistence readiness is non-authorizing.
- Persistence readiness must not approve anything.
- Persistence readiness must not execute anything.
- Persistence readiness must not promote a WorkUnit.
- Persistence readiness must not make evidence true.
- Persistence readiness must not make LLM judgment true.
- Persistence readiness must not make a Human Decision into ApprovalStore approval.
- Persistence readiness must not imply D1 access.
- Persistence readiness must not imply SQL execution.

## 6. Required Inputs from P6-I4 Storage Gate

- P6-I4 Storage Gate Spec merged into main
- Storage Gate Record Contract available
- explicit human Go for P6-I5
- storage eligibility requirements
- Storage Gate Record required fields
- tenant consistency requirement
- lineage continuity requirement
- hash and content integrity requirement
- no_go_flags policy
- non-authorization boundary
- P6-I5 future implementation requirements

## 7. Allowed Future Persistence Targets

The gate defines future target *classes*, not implementations:

- in_memory_test_only_store
- local_ephemeral_dev_store
- append_only_audit_candidate_store
- tenant_scoped_artifact_candidate_store
- future_d1_store_after_separate_d1_gate

Allowed target class names are not implementations.

No target class may be implemented by P6-I5.

future_d1_store_after_separate_d1_gate is not allowed until a separate D1 gate permits it.

## 8. Disallowed Persistence Targets

- production_database_without_gate
- cross_tenant_shared_store_without_isolation
- external_service_store
- browser_local_storage
- unencrypted_secret_store
- approvalstore_as_phase6_storage
- evidence_ledger_as_primary_storage_without_gate
- graph_store_without_graph_gate
- vector_store
- d1_store_without_d1_gate
- sql_mutation_store
- external_action_log_as_storage

## 9. Persistence Readiness Criteria

A candidate is persistence-ready-for-future-implementation only when all of these hold:

- Storage Gate Record exists or is defined by the gate
- artifact or spine is storage_eligible_for_future_gate
- tenant consistency passed
- lineage continuity passed
- matching validators passed
- construction results checked
- harness result checked when using full spine
- hash integrity passed
- content integrity passed
- no_go_flags policy passed
- redaction policy decided
- schema version decided
- idempotency key strategy decided
- duplicate handling strategy decided
- rollback strategy decided
- audit strategy decided
- explicit human review before implementation
- no approval/execution/promotion grant present

## 10. Tenant Isolation Requirements

- tenant_id must be part of every persistence key or namespace
- cross-tenant writes are No-Go
- cross-tenant reads are No-Go
- cross-tenant indexes are No-Go unless a later gate explicitly proves isolation
- tenant_id must be validated before any future write
- tenant_id must be validated before any future read
- tenant isolation is not authorization
- user permission must remain separately enforced in future implementation

## 11. Artifact Identity and Lineage Requirements

- artifact ids must be stable
- artifact ids must be caller-provided or derived only by a future gated id policy
- artifact ids must not be generated implicitly by persistence
- storage keys must not replace artifact ids
- upstream lineage ids must be stored or preserved in future persistence
- lineage mismatch is No-Go
- missing lineage is No-Go
- HumanDecisionRecord.source_llm_judgment_record_id must equal HumanDecisionRecord.llm_judgment_id when persisted
- persisted spine candidates must preserve all P6-I2 lineage edges

## 12. Schema Versioning Requirements

- schema_version is required for future persisted records
- schema_version must be explicit
- schema_version must not be inferred from current date
- migration policy must be defined before schema changes
- backward compatibility expectations must be stated
- unknown schema version must fail closed
- schema version validity is not approval

## 13. Serialization and Deserialization Requirements

- serialization must preserve tenant_id
- serialization must preserve artifact ids
- serialization must preserve lineage ids
- serialization must preserve no_go_flags
- serialization must preserve non-authorization fields
- deserialization must validate with P6-I0 validators or future gated validators
- deserialization must fail closed on unknown critical fields
- deserialization must not grant approval/execution/promotion
- serialized form must not include secrets unless explicitly allowed by a future redaction gate

## 14. Idempotency and Duplicate Handling Requirements

- idempotency key strategy must be explicit
- duplicate artifact ids must fail closed or be treated as idempotent only by explicit policy
- repeated writes must not create conflicting records
- repeated writes must not create extra approvals
- repeated writes must not execute actions
- duplicate detection must be tenant-scoped
- duplicate handling must be auditable

## 15. Redaction and Sensitive Data Requirements

- secret-like values must not be persisted unless a future gate explicitly permits it
- unknown_sensitive fields are No-Go
- blocked_input must not be persisted
- token-like values must be redacted
- raw external payloads require a separate redaction decision
- redaction failure is No-Go
- redaction is not approval
- redaction is not evidence truth

## 16. Audit Requirements Without ApprovalStore Authority

- future persistence must produce audit evidence
- audit evidence must not be ApprovalStore approval
- audit evidence must not authorize execution
- audit evidence must include tenant_id
- audit evidence must include artifact ids
- audit evidence must include outcome
- audit evidence must include failure reasons
- audit evidence must include human reviewer reference when required
- audit evidence must not leak secrets

## 17. Rollback and Recovery Requirements

- rollback behavior must be defined before persistence implementation
- partial writes must fail closed
- partial spine persistence must be explicitly marked partial
- recovery must not infer missing artifacts
- recovery must not promote WorkUnits
- recovery must not execute actions
- rollback events must be auditable

## 18. Read and Write Separation

- write eligibility is separate from read eligibility
- future writes must not imply future reads
- future reads must not imply evidence truth
- future reads must not imply approval
- read APIs require a separate gate if exposed beyond tests
- mutation APIs require a separate gate

## 19. D1 and SQL Boundary

- P6-I5 does not permit D1 access
- P6-I5 does not permit D1 bindings
- P6-I5 does not permit D1 migrations
- P6-I5 does not permit SQL execution
- P6-I5 does not permit SQL mutation
- future D1 read-only execution remains P6-I6 or later
- D1 persistence requires a separate D1 gate
- SQL compilation and SQL execution remain separately gated

## 20. Evidence Ledger and Graph Model Boundary

- persistence readiness may reference ledger linkage candidates
- persistence readiness does not append ALPHA_EVIDENCE_LEDGER
- persistence readiness does not update evidence ledger
- persistence readiness does not create graph nodes
- persistence readiness does not create graph edges
- persistence readiness does not implement GraphRAG
- ledger and graph linkage remain future-gated

## 21. ApprovalStore, P7.1 TSP, and External Action Boundary

- persistence readiness has no ApprovalStore authority
- persistence readiness is not ApprovalStore approval
- P7.1 TSP utilities remain unwired
- persistence readiness cannot satisfy approval requirements
- persistence readiness cannot execute external actions
- persistence readiness cannot authorize sends, posts, creates, updates, deletes, shares, commits, or publishes
- external action execution remains blocked

## 22. Future Implementation PR Slicing

- P6-I5A persistence target decision spec if needed
- P6-I5B persistence types and validators only
- P6-I5C pure persistence candidate constructors only
- P6-I5D test-only persistence fixture
- P6-I5E in-memory test-only persistence adapter
- P6-I5F persistence audit evidence spec
- P6-I6 D1 read-only execution implementation gate or later
- no PR may combine persistence implementation with D1 execution
- no PR may combine persistence implementation with external action execution
- no PR may combine persistence implementation with ApprovalStore wiring

## 23. No-Go Conditions

Any of the following is No-Go:

- p6_i4_not_merged
- missing_foundation_file
- missing_explicit_human_go
- app_runtime_changed
- persistence_implementation_added
- storage_implementation_added
- repository_added
- storage_adapter_added
- database_schema_added
- d1_binding_added
- d1_migration_added
- d1_access_added
- sql_execution_added
- sql_mutation_added
- runtime_pipeline_added
- product_runtime_wiring_added
- approvalstore_integration_added
- p7_1_tsp_wiring_added
- external_action_execution_added
- formal_workunit_promotion_added
- evidence_treated_as_truth
- llm_judgment_treated_as_truth
- human_decision_treated_as_approval
- persistence_readiness_treated_as_approval
- persistence_readiness_treated_as_execution
- persistence_readiness_treated_as_promotion
- storage_eligibility_bypassed
- storage_gate_record_bypassed
- missing_tenant_isolation
- cross_tenant_write_allowed
- cross_tenant_read_allowed
- lineage_mismatch_allowed
- invalid_hash_allowed
- invalid_content_integrity_allowed
- no_go_flags_ignored
- redaction_failure_allowed
- unknown_sensitive_persisted
- schema_version_missing_allowed
- idempotency_policy_missing
- duplicate_policy_missing
- rollback_policy_missing
- audit_policy_missing
- human_review_bypassed_before_persistence
- d1_gate_bypassed
- ruleset_weakened
- validation_failed

## 24. Non-authorization Statement

This Phase 6 Persistence Implementation Gate authorizes no persistence implementation, no storage implementation, no repository implementation, no storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.
