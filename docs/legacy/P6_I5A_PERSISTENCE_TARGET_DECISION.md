# P6-I5A Persistence Target Decision

**Loop:** P6-I5A (persistence_target_decision_spec_loop / docs-only + static-test).
**Depends on:** P6-I5 (PR #93 — Phase 6 Persistence Implementation Gate) merged into `main`.

P6-I5A selects in_memory_test_only_store as the first Phase 6 persistence target class for future type and validator work, but it does not implement persistence, storage, a repository, a storage adapter, a database schema, D1 access, SQL execution, ApprovalStore integration, external action execution, Formal WorkUnit promotion, or production readiness.

P6-I5A Persistence Target Decisionとは、将来のPhase 6 persistence sliceで最初に扱うtarget classを in_memory_test_only_store に絞るためのdecisionであり、persistence実装・storage実装・repository・storage adapter・database schema・D1アクセス・SQL実行・ApprovalStore連携・external action実行・Formal WorkUnit promotion・production readinessを意味しない。

## 1. Purpose

This document records a single decision: which persistence target class is chosen first for the
next Phase 6 persistence slice. It exists so that future type and validator work has an explicit,
pinned starting target without opening any implementation, storage, or D1 capability. It selects a
target class name; it does not build anything.

## 2. Scope

In scope: selecting exactly one initial Phase 6 persistence target class, recording why it is
chosen, and recording why every other candidate class is deferred or rejected. Out of scope:
persistence implementation, storage implementation, repositories, storage adapters, database
schema, D1 bindings, D1 migrations, D1 access, SQL execution, SQL mutation, product runtime
pipeline, ApprovalStore integration, P7.1 TSP wiring, external action execution, and Formal
WorkUnit promotion. This document is docs-only + static-test.

## 3. Decision Summary

Selected target class:

in_memory_test_only_store

Next allowed implementation slice after P6-I5A:

P6-I5B persistence target decision types and validators only

Not allowed after P6-I5A:

- D1 execution
- SQL execution
- repository implementation
- storage adapter implementation
- database schema implementation
- app runtime wiring
- ApprovalStore integration
- external action execution
- Formal WorkUnit promotion

## 4. Selected Initial Target Class

in_memory_test_only_store is a future test-only target class for validating persistence decision
records and non-authorizing persistence candidate shapes without runtime storage, database storage,
D1 access, SQL execution, or production use.

It is explicitly the following:

- It is test-only.
- It is non-persistent.
- It is non-authorizing.
- It does not survive process restart.
- It must not be wired into app runtime.
- It must not be used for production data.
- It must not replace tenant authorization.
- It must not satisfy ApprovalStore approval.
- It must not execute external actions.
- It must not promote Formal WorkUnits.

## 5. Rejected or Deferred Target Classes

- local_ephemeral_dev_store — deferred
- append_only_audit_candidate_store — deferred
- tenant_scoped_artifact_candidate_store — deferred
- future_d1_store_after_separate_d1_gate — deferred
- blocked_target — not selected

## 6. Why in_memory_test_only_store Is Selected

- safest first target
- no filesystem persistence
- no database persistence
- no D1 binding
- no SQL execution
- no migrations
- no production data
- easiest to validate deterministically
- compatible with P6-I3 in-memory harness
- supports future types and validators without runtime risk
- keeps persistence target work separate from D1 and SQL

## 7. Why local_ephemeral_dev_store Is Deferred

- filesystem persistence risk
- local state leak risk
- cleanup risk
- path traversal risk
- developer environment variability
- requires separate file-system gate

## 8. Why append_only_audit_candidate_store Is Deferred

- audit semantics must be specified first
- append-only behavior requires rollback and compaction decisions
- may be confused with Evidence Ledger
- requires separate audit evidence gate
- must not imply ApprovalStore approval

## 9. Why tenant_scoped_artifact_candidate_store Is Deferred

- tenant isolation must be implemented and tested first
- read/write separation must be specified first
- storage key strategy must be specified first
- duplicate handling must be specified first
- requires future storage implementation gate

## 10. Why future_d1_store_after_separate_d1_gate Is Deferred

- D1 gate is not yet executed
- D1 bindings are forbidden in P6-I5A
- D1 migrations are forbidden in P6-I5A
- SQL execution is forbidden in P6-I5A
- SQL mutation is forbidden in P6-I5A
- future D1 read-only execution remains P6-I6 or later
- D1 persistence requires a separate D1 persistence gate

## 11. Why blocked_target Is Not Selected

- blocked_target represents explicit No-Go
- blocked_target may appear only when target selection is blocked
- blocked_target is not a valid implementation target
- blocked_target cannot be used to justify implementation

## 12. Required Inputs from P6-I5

- Persistence Implementation Gate merged into main
- Persistence Gate Record Contract available
- allowed future persistence target classes
- disallowed persistence targets
- persistence readiness criteria
- tenant isolation requirements
- artifact identity and lineage requirements
- schema versioning requirements
- serialization and redaction requirements
- idempotency and duplicate handling requirements
- audit and rollback requirements
- D1 and SQL boundary
- non-authorization boundary

## 13. Safety Properties Required Before P6-I5B

- target class selected
- target class is non-authorizing
- target class is test-only
- target class is non-persistent
- D1 remains deferred
- SQL remains deferred
- app runtime remains untouched
- ApprovalStore remains unwired
- external actions remain blocked
- Formal WorkUnit promotion remains blocked
- persistence target decision record contract is pinned
- static test pins the decision

## 14. Tenant Boundary

The selected in_memory_test_only_store target class does not carry tenant authorization. A tenant
identifier recorded alongside a target decision is descriptive metadata only; it does not grant
cross-tenant read or write, does not authorize storage, and does not replace tenant isolation that a
future storage implementation gate must implement and test. Selecting a target class never crosses a
tenant boundary because nothing is stored.

## 15. Lineage and Identity Boundary

Selecting a target class does not create, mutate, or promote any WorkUnit identity or lineage. A
Target Decision Record identifies a chosen target class name, not an artifact. It cannot establish
artifact identity, cannot link lineage edges, and cannot promote a Candidate into a Formal WorkUnit.
Identity and lineage remain governed by earlier Phase 6 loops and the invariant Candidate ≠ Formal
WorkUnit.

## 16. Redaction and Sensitive Data Boundary

No sensitive data flows through this decision. Because in_memory_test_only_store is non-persistent
and test-only, redaction and serialization concerns are deferred to the future persistence
implementation gate. This decision must not be used to justify storing raw sensitive payloads, and
it must not be treated as satisfying any redaction requirement.

## 17. Audit Boundary

This decision is not an audit record, not an Evidence Ledger entry, and not an ApprovalStore entry.
Recording that in_memory_test_only_store was selected is not evidence, is not approval, and is not
execution authorization. Audit semantics for any future append-only store remain deferred to a
separate audit evidence gate. Evidence ≠ Approval and Evidence ≠ Execution Authorization.

## 18. D1 and SQL Boundary

- P6-I5A does not permit D1 access
- P6-I5A does not permit D1 bindings
- P6-I5A does not permit D1 migrations
- P6-I5A does not permit SQL execution
- P6-I5A does not permit SQL mutation
- future D1 read-only execution remains P6-I6 or later
- D1 persistence requires a separate D1 persistence gate
- SQL compilation and SQL execution remain separately gated

## 19. ApprovalStore, P7.1 TSP, and External Action Boundary

Selecting in_memory_test_only_store does not wire ApprovalStore, does not wire P7.1 TSP utilities,
and does not execute any external action. Human Decision ≠ ApprovalStore Approval. Human Decision ≠
External Action Execution. LLM Judgment ≠ Approval. LLM Judgment ≠ Action Authorization. These
integrations remain separately gated and unwired by this decision.

## 20. Future PR Slicing After Target Decision

- P6-I5B persistence target decision types and validators only
- P6-I5C pure persistence candidate constructors only
- P6-I5D test-only persistence fixture
- P6-I5E in-memory test-only persistence adapter
- P6-I5F persistence audit evidence spec
- P6-I6 D1 read-only execution implementation gate or later
- no PR may combine target decision with persistence implementation
- no PR may combine target decision with D1 execution
- no PR may combine target decision with external action execution
- no PR may combine target decision with ApprovalStore wiring

## 21. No-Go Conditions

- p6_i5_not_merged
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
- selected_target_not_in_memory_test_only_store
- multiple_targets_selected
- local_ephemeral_dev_store_selected
- append_only_audit_candidate_store_selected
- tenant_scoped_artifact_candidate_store_selected
- future_d1_store_after_separate_d1_gate_selected
- blocked_target_selected
- d1_gate_bypassed
- filesystem_gate_bypassed
- audit_evidence_gate_bypassed
- tenant_isolation_gate_bypassed
- target_decision_treated_as_persistence
- target_decision_treated_as_approval
- target_decision_treated_as_execution
- target_decision_treated_as_production_readiness
- ruleset_weakened
- validation_failed

## 22. Non-authorization Statement

This P6-I5A Persistence Target Decision authorizes no persistence implementation, no storage implementation, no repository implementation, no storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.
