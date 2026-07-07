# P6-I5F Persistence Audit Evidence Spec

**Loop:** P6-I5F (persistence_audit_evidence_spec_loop / docs-only + static-test).
**Depends on:** P6-I5A/B/C/D/E — merged into `main` (P6-I5E is PR #98).

P6-I5F defines the audit evidence shape for Phase 6 in-memory test-only persistence target decision adapter operations, but it does not implement audit runtime, persistence, durable storage, D1 access, SQL execution, ApprovalStore integration, external action execution, Formal WorkUnit promotion, or production readiness.

P6-I5F Persistence Audit Evidence Specとは、Phase 6のin-memory test-only persistence target decision adapter操作を将来どのようなaudit evidenceとして表現するかを定義する仕様であり、audit runtime実装・persistence実装・durable storage・D1アクセス・SQL実行・ApprovalStore連携・external action実行・Formal WorkUnit promotion・production readinessを意味しない。

## 1. Purpose

This document specifies what audit evidence for the P6-I5E test-only in-memory persistence target
decision adapter operations should look like, so a future loop has a pinned, non-authorizing shape to
build against. It defines an evidence shape; it implements no audit runtime and authorizes nothing.

## 2. Scope

In scope: the descriptive shape of audit evidence for the six test-only in-memory adapter operations.
Out of scope: audit runtime, audit event emitter, real persistence, durable storage, repository,
production storage adapter, database schema, D1 bindings/migrations/access, SQL execution/mutation,
product runtime pipeline, ApprovalStore integration, P7.1 TSP wiring, external action execution,
Formal WorkUnit promotion, Evidence Ledger append, and Graph Model write. This document is docs-only
+ static-test.

## 3. Definition of Persistence Audit Evidence

Persistence audit evidence is a descriptive, non-authorizing record of what a test-only in-memory
persistence target decision adapter operation did: which operation ran, under which tenant, with what
validation and outcome, and with what tenant-scope, idempotency, and non-durability properties. It
describes an operation; it does not implement one, store one durably, or authorize one.

## 4. What Persistence Audit Evidence Is Not

- truth
- approval
- execution permission
- persistence permission
- durable storage
- production readiness
- Formal WorkUnit promotion
- ApprovalStore approval
- Evidence Ledger append
- Graph Model write
- D1 access
- SQL execution
- external action authorization
- audit runtime implementation
- audit event emitter implementation

## 5. Product and Safety Invariants

AI proposes. Rules guard. Humans decide.

Audit evidence is descriptive, not authorizing.

Audit evidence must not approve anything.

Audit evidence must not execute anything.

Audit evidence must not promote a WorkUnit.

Audit evidence must not make evidence true.

Audit evidence must not make adapter success into persistence.

Audit evidence must not make in-memory storage durable.

Audit evidence must not make a Human Decision into ApprovalStore approval.

## 6. Required Inputs from P6-I5E

- P6-I5E merged into main
- in-memory test-only adapter exists
- adapter is test-only
- adapter is in-memory only
- adapter is non-durable
- adapter is tenant-scoped
- adapter validates through P6-I5B validators
- adapter works with P6-I5D fixtures
- adapter handles idempotent duplicates
- adapter rejects duplicate conflicts
- adapter has no app runtime wiring
- adapter has no D1 access
- adapter has no SQL execution
- adapter has no ApprovalStore integration
- adapter has no external action execution

## 7. Audit Evidence Scope

P6-I5F audit evidence applies only to test-only in-memory TargetDecisionRecord adapter operations.

It does not apply to production persistence, durable storage, D1, SQL, repository behavior, production
adapter behavior, ApprovalStore, external actions, or Formal WorkUnit promotion.

## 8. Audited Adapter Operations

- putTargetDecisionCandidate
- getTargetDecisionCandidate
- listTargetDecisionCandidates
- countTargetDecisionCandidates
- clearTargetDecisionCandidates
- clearAllTargetDecisionCandidates

## 9. Audit Event Shape

An audit event describing one adapter operation must carry these fields:

- audit_event_id
- tenant_id
- target_decision_record_id
- operation
- operation_status
- operation_outcome
- adapter_target_class
- selected_target_class
- validation_result
- validator_issue_codes
- adapter_issue_codes
- idempotency_result
- duplicate_result
- tenant_scope_result
- defensive_snapshot_result
- non_durability_result
- clear_scope
- record_count
- failure_reasons
- redaction_result
- source_loop
- created_at
- payload_hash
- non_authorization_statement
- no_go_flags

`operation` is one of: put, get, list, count, clear_tenant, clear_all.

`operation_status` is one of: attempted, accepted, rejected, not_found, cleared, blocked_no_go.

`operation_outcome` is one of: pass, warn, fail, no_go.

`validation_result` is one of: validator_passed, validator_failed, validator_not_applicable,
validator_not_run_no_go.

`idempotency_result` is one of: first_write, idempotent_duplicate, duplicate_conflict,
not_applicable.

`tenant_scope_result` is one of: tenant_scoped, tenant_mismatch, cross_tenant_blocked,
tenant_scope_not_applicable, tenant_scope_no_go.

`defensive_snapshot_result` is one of: frozen_snapshot_returned, defensive_clone_returned,
not_applicable, snapshot_no_go.

`non_durability_result` is one of: in_memory_only, not_durable, process_lifetime_only,
durability_not_claimed.

`clear_scope` is one of: none, tenant_only, all_test_memory.

## 10. Operation Outcome Evidence

- put accepted evidence
- put rejected evidence
- get found evidence
- get not found evidence
- list evidence
- count evidence
- clear tenant evidence
- clear all evidence
- blocked_no_go evidence

## 11. Tenant Scope Evidence

- tenant_id required
- target_decision_record_id required for record-specific operations
- cross-tenant reads must be represented as blocked
- cross-tenant writes must be represented as rejected
- clear_tenant must record tenant_only clear_scope
- clear_all must record all_test_memory clear_scope and remain test-only
- tenant evidence is not tenant authorization

## 12. Validator Result Evidence

- validator result must be captured for put operations
- validator issue codes must be captured without echoing input values
- validation_failed must not be treated as approval
- validator_passed must not be treated as truth
- validator_passed must not be treated as persistence permission

## 13. Fixture Integration Evidence

- valid fixture put evidence
- blocked_no_go fixture put evidence
- fixture validation evidence
- fixture source loop P6-I5D
- fixture evidence is not production evidence

## 14. Idempotency and Duplicate Handling Evidence

- first_write evidence
- idempotent_duplicate evidence
- duplicate_conflict evidence
- duplicate_conflict must be fail-closed
- duplicate_conflict must not overwrite prior candidate
- duplicate handling evidence is not durable persistence

## 15. Failure Reason Evidence

- invalid_input
- invalid_record
- validation_failed
- tenant_mismatch
- duplicate_conflict
- not_found
- forbidden_selected_target
- adapter_exception
- blocked_no_go

## 16. Clear/List/Count Evidence

- list must record tenant scope
- list must record count
- count must record record_count
- clear tenant must record cleared_count
- clear all must record all_test_memory
- clear all remains test-only and non-durable
- list/count/clear evidence is not repository behavior

## 17. Defensive Snapshot Evidence

- frozen snapshot evidence
- defensive clone evidence
- returned records must not become authorization
- returned records must not become persistence evidence
- snapshot evidence is not durability evidence

## 18. Non-durability Evidence

- adapter is in-memory only
- adapter does not survive process restart
- evidence must not claim durability
- evidence must not claim persisted record
- evidence must not claim storage backend write

## 19. Evidence Ledger Boundary

- P6-I5F does not append ALPHA_EVIDENCE_LEDGER
- P6-I5F does not modify ALPHA_EVIDENCE_LEDGER
- audit evidence shape may be future input to an Evidence Ledger gate
- audit evidence is not ledger entry by itself
- ledger linkage remains future-gated

## 20. Graph Model Boundary

- P6-I5F does not create graph nodes
- P6-I5F does not create graph edges
- P6-I5F does not implement GraphRAG
- audit evidence shape may be future input to a graph linkage gate
- graph linkage remains future-gated

## 21. ApprovalStore, P7.1 TSP, and External Action Boundary

- audit evidence has no ApprovalStore authority
- audit evidence is not ApprovalStore approval
- P7.1 TSP utilities remain unwired
- audit evidence cannot satisfy approval requirements
- audit evidence cannot execute external actions
- audit evidence cannot authorize sends, posts, creates, updates, deletes, shares, commits, or publishes
- external action execution remains blocked

## 22. D1 and SQL Boundary

- P6-I5F does not permit D1 access
- P6-I5F does not permit D1 bindings
- P6-I5F does not permit D1 migrations
- P6-I5F does not permit SQL execution
- P6-I5F does not permit SQL mutation
- future D1 read-only execution remains P6-I6 or later
- D1 persistence requires a separate D1 persistence gate
- SQL compilation and SQL execution remain separately gated

## 23. Privacy and Redaction Boundary

- audit evidence must not echo secret-like values
- failure reasons must use stable codes
- issue messages must not include raw payloads
- tenant_id may be present as scoped identifier
- target_decision_record_id may be present as scoped identifier
- raw record payload should be omitted unless future gate permits it
- payload_hash may be included
- redaction failure is No-Go

## 24. Future Implementation Requirements

- P6-I5G must have explicit human Go if audit evidence types and validators are implemented
- P6-I5G must verify P6-I5F merged into main
- P6-I5G must implement types and validators only if selected
- P6-I5G must not implement runtime emitter unless a later gate permits it
- P6-I5G must not append Evidence Ledger
- P6-I5G must not implement durable storage
- P6-I5G must not access D1
- P6-I5G must not execute SQL
- P6-I5G must preserve non-authorization boundary

## 25. No-Go Conditions

- p6_i5e_not_merged
- missing_foundation_file
- missing_explicit_human_go
- app_runtime_changed
- audit_runtime_implemented
- audit_event_emitter_implemented
- persistence_implementation_added
- durable_storage_added
- repository_added
- production_adapter_added
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
- audit_evidence_treated_as_approval
- audit_evidence_treated_as_execution
- audit_evidence_treated_as_persistence
- audit_evidence_treated_as_durable_storage
- audit_evidence_treated_as_production_readiness
- evidence_ledger_append_added
- graph_write_added
- raw_payload_echo_allowed
- secret_like_value_echo_allowed
- redaction_failure_allowed
- tenant_scope_bypassed
- validator_result_bypassed
- duplicate_conflict_treated_as_success
- clear_all_treated_as_production_capability
- ruleset_weakened
- validation_failed

## 26. Non-authorization Statement

This P6-I5F Persistence Audit Evidence Spec authorizes no audit runtime implementation, no audit event emitter implementation, no persistence implementation, no durable storage implementation, no repository implementation, no production storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no Evidence Ledger append, no Graph Model write, no deployment, no release, no production readiness, and no automated decision-making.
