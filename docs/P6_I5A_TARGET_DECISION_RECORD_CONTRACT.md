# P6-I5A Target Decision Record Contract

**Loop:** P6-I5A (persistence_target_decision_spec_loop / docs-only + static-test).
**Depends on:** P6-I5 (PR #93) merged into `main`.

A Target Decision Record is a future non-authorizing record of which persistence target class has been selected for the next Phase 6 persistence slice.

Target Decision Recordとは、次のPhase 6 persistence sliceで扱うpersistence target classを記録するための非認可recordであり、persistence実行・storage実行・D1アクセス・SQL実行・approval・execution・promotionを意味しない。

## 1. Purpose

This contract specifies the shape and rules of a future Target Decision Record: a non-authorizing
record naming which persistence target class was chosen for the next Phase 6 persistence slice. It
defines fields, status values, outcomes, and validation rules so that future type and validator work
(P6-I5B) has a pinned contract to implement against. It authorizes no implementation.

## 2. Scope

In scope: the definition, required fields, status values, outcomes, and validation rules of a Target
Decision Record. Out of scope: persistence implementation, storage implementation, repositories,
storage adapters, database schema, D1 access, D1 bindings, D1 migrations, SQL execution, SQL
mutation, product runtime pipeline, ApprovalStore integration, P7.1 TSP wiring, external action
execution, and Formal WorkUnit promotion. This document is docs-only + static-test.

## 3. Definition of Target Decision Record

A Target Decision Record captures, for one Phase 6 persistence target decision: which target class
was selected, which classes were deferred, which classes were rejected, the rationale, the
dependency status, the boundary results, the human review, and the No-Go flags. It is a record of a
decision, not an implementation and not an authorization.

## 4. What Target Decision Record Is Not

- persistence implementation
- storage implementation
- database row by itself
- repository operation
- storage adapter operation
- D1 record
- SQL result
- ledger entry
- graph node
- graph edge
- approval record
- execution authorization
- Formal WorkUnit promotion
- production readiness

## 5. Required Fields

- target_decision_record_id
- tenant_id
- target_decision_status
- target_decision_outcome
- selected_target_class
- deferred_target_classes
- rejected_target_classes
- decision_rationale
- p6_i5_dependency_status
- storage_gate_dependency_status
- persistence_gate_dependency_status
- d1_boundary_result
- sql_boundary_result
- non_authorization_result
- human_review_required
- reviewed_by_human_at
- reviewed_by_human_id
- created_at
- payload_hash
- no_go_flags

## 6. Target Decision Status

`target_decision_status` is one of these literal values:

- draft_target_decision_record
- target_selected_for_future_types
- blocked_no_go
- clarification_needed
- target_rejected

target_selected_for_future_types is defined as:

Target selected for future type and validator work only. It is not persistence implementation.

## 7. Selected Target Class

selected_target_class must be exactly:

in_memory_test_only_store

Any other selected_target_class is No-Go for P6-I5A.

`target_decision_outcome` is one of these literal values:

- pass
- warn
- fail
- no_go

## 8. Deferred Target Classes

- local_ephemeral_dev_store
- append_only_audit_candidate_store
- tenant_scoped_artifact_candidate_store
- future_d1_store_after_separate_d1_gate

## 9. Rejected Target Classes

- blocked_target

## 10. Decision Rationale Fields

- selected_target_rationale
- deferred_target_rationales
- rejected_target_rationales
- d1_deferral_rationale
- sql_deferral_rationale
- approvalstore_deferral_rationale
- external_action_deferral_rationale

## 11. Safety Boundary Fields

- test_only_confirmed
- non_persistent_confirmed
- non_authorizing_confirmed
- app_runtime_untouched_confirmed
- d1_deferred_confirmed
- sql_deferred_confirmed
- approvalstore_unwired_confirmed
- external_actions_blocked_confirmed
- formal_workunit_promotion_blocked_confirmed

## 12. Dependency Fields

- p6_i5_merged
- p6_i5_merge_commit
- storage_gate_spec_available
- persistence_gate_spec_available
- persistence_record_contract_available
- main_safety_gate_active

## 13. Human Review Fields

- human_review_required
- reviewed_by_human_id
- reviewed_by_human_at
- reviewer_role
- review_rationale

## 14. Future Slice Fields

- next_slice
- next_slice_scope
- forbidden_next_slice_capabilities
- d1_gate_requirement
- external_action_gate_requirement
- approvalstore_gate_requirement

## 15. Validation Rules

- missing selected_target_class is No-Go
- selected_target_class other than in_memory_test_only_store is No-Go
- multiple selected targets is No-Go
- missing deferred target classes is No-Go
- future_d1_store_after_separate_d1_gate selected before D1 gate is No-Go
- local_ephemeral_dev_store selected before filesystem gate is No-Go
- append_only_audit_candidate_store selected before audit evidence gate is No-Go
- tenant_scoped_artifact_candidate_store selected before tenant isolation implementation gate is No-Go
- blocked_target selected as implementation target is No-Go
- missing human review is No-Go
- target_selected_for_future_types cannot be used as persistence permission
- target_selected_for_future_types cannot be used as approval
- target_selected_for_future_types cannot be used as execution permission
- target_selected_for_future_types cannot be used as production readiness

## 16. Non-authorization Statement

This Target Decision Record Contract authorizes no persistence implementation, no storage implementation, no repository implementation, no storage adapter, no database schema, no D1 access, no D1 binding, no D1 migration, no SQL execution, no SQL mutation, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.
