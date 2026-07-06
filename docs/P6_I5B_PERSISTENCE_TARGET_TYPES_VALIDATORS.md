# P6-I5B Persistence Target Decision Types and Validators

**Loop:** P6-I5B (persistence_target_decision_types_and_validators_loop / types-and-validators-only).
**Depends on:** P6-I4 Storage Gate Spec, P6-I5 Persistence Implementation Gate, and P6-I5A
Persistence Target Decision Spec (PR #94) — all merged into `main`.

P6-I5B implements types and validators only.
P6-I5B does not implement persistence.
P6-I5B does not implement storage.
P6-I5B does not implement repository behavior.
P6-I5B does not implement a storage adapter.
P6-I5B does not implement a database schema.
P6-I5B does not add D1 bindings.
P6-I5B does not add D1 migrations.
P6-I5B does not access D1.
P6-I5B does not execute SQL.
P6-I5B does not implement product runtime pipeline.
P6-I5B does not integrate ApprovalStore.
P6-I5B does not wire P7.1 TSP utilities.
P6-I5B does not execute external actions.
P6-I5B does not promote Formal WorkUnits.
Selected target class is exactly in_memory_test_only_store.
Validation pass is not persistence.
Validation pass is not storage.
Validation pass is not approval.
Validation pass is not execution permission.
Validation pass is not production readiness.

## 1. Purpose

P6-I5B encodes the P6-I5A Target Decision Record as inert TypeScript types and a pure, fail-closed
validator. It gives future loops (P6-I5C pure constructors onward) a pinned, non-authorizing shape to
build against. It implements no persistence and authorizes nothing.

## 2. Scope

In scope: TypeScript types and pure validators for one `TargetDecisionRecord`, isolated under
`app/lib/phase6/persistenceTargetDecision/`. Out of scope: persistence, storage, repository, storage
adapter, database schema, D1 bindings/migrations/access, SQL execution/mutation, product runtime
pipeline, ApprovalStore integration, P7.1 TSP wiring, external action execution, and Formal WorkUnit
promotion.

## 3. Implemented Files

- `app/lib/phase6/persistenceTargetDecision/types.ts` — inert types and value lists.
- `app/lib/phase6/persistenceTargetDecision/validators.ts` — pure validators and type guards.
- `app/lib/phase6/persistenceTargetDecision/index.ts` — re-exports types and validators only.
- `tests/phase6PersistenceTargetDecisionValidators.test.mts` — isolated `node:test` suite.
- `docs/P6_I5B_EXPLICIT_HUMAN_GO.md` — durable human Go record.
- `docs/P6_I5B_PERSISTENCE_TARGET_TYPES_VALIDATORS.md` — this document.

## 4. Target Decision Types

`types.ts` exports `TargetDecisionRecord`, `PersistenceTargetClass`, `TargetDecisionStatus`,
`TargetDecisionOutcome`, `DeferredPersistenceTargetClass`, `RejectedPersistenceTargetClass`,
`SafetyBoundaryResult`, `DependencyStatus`, `FutureSliceDeclaration`, `NoGoFlag`, `Sha256Hex`, and
`IsoTimestamp`. `PersistenceTargetClass` is the single literal `in_memory_test_only_store`. Deferred
and rejected classes are distinct literal unions and never overlap the selectable class. The record
carries no grant-like field.

## 5. Validator Contract

`validators.ts` exports `TargetDecisionValidationIssue`, `TargetDecisionValidationResult`,
`validateTargetDecisionRecord`, and the type guards `isPersistenceTargetClass`,
`isDeferredPersistenceTargetClass`, `isRejectedPersistenceTargetClass`, `isTargetDecisionStatus`,
`isTargetDecisionOutcome`, `isSafetyBoundaryResult`, `isDependencyStatus`, `isSha256Hex`, and
`isIsoTimestamp`. `TargetDecisionValidationResult` is `{ ok, issues }`; each issue carries `code`,
`field`, and a `message` of exactly `code:field` that never echoes input values. The validator
accepts unknown input, never throws for normal invalid input (a defensive catch maps unexpected
failures to `validation_exception`), fails closed on non-object/array/null input, takes a single-read
snapshot of own enumerable top-level fields, rejects unknown top-level fields, and never mutates its
input.

## 6. Selected Target Invariant

`selected_target_class` must be exactly `in_memory_test_only_store`. An array value reports
`multiple_selected_targets_not_allowed`; any other string (including any deferred or rejected class)
reports `invalid_selected_target_class`. No other target class can validate as the selected target.

## 7. Deferred and Rejected Target Invariants

`deferred_target_classes` must contain exactly `local_ephemeral_dev_store`,
`append_only_audit_candidate_store`, `tenant_scoped_artifact_candidate_store`, and
`future_d1_store_after_separate_d1_gate` (missing → `missing_deferred_target_class`; anything else →
`unexpected_deferred_target_class`). `rejected_target_classes` must contain exactly `blocked_target`
(missing → `missing_rejected_target_class`; anything else → `unexpected_rejected_target_class`). The
deferred and rejected classes may appear only in these fields, never as the selected target.

## 8. Safety Boundary Validation

The nine safety boundary fields (`test_only_confirmed`, `non_persistent_confirmed`,
`non_authorizing_confirmed`, `app_runtime_untouched_confirmed`, `d1_deferred_confirmed`,
`sql_deferred_confirmed`, `approvalstore_unwired_confirmed`, `external_actions_blocked_confirmed`,
`formal_workunit_promotion_blocked_confirmed`) must each be the literal `confirmed` for `ok=true`; any
other valid enum value reports `safety_boundary_not_confirmed`, and a non-enum value reports
`invalid_enum_value`.

## 9. Dependency Validation

`p6_i5_merged` and `main_safety_gate_active` must be boolean `true` for `ok=true`, else
`dependency_not_satisfied`. `storage_gate_spec_available`, `persistence_gate_spec_available`, and
`persistence_record_contract_available` must be the `DependencyStatus` literal `present` for
`ok=true`, else `dependency_not_satisfied` (or `invalid_enum_value` for a non-enum value).

## 10. Human Review Validation

`human_review_required` must be boolean `true`, else `human_review_required`. `reviewed_by_human_at`
and `created_at` must be ISO-8601 UTC timestamp strings, else `invalid_timestamp`. `payload_hash`
must be a 64-character lowercase SHA-256 hex string, else `invalid_sha256_hex`.

## 11. No-Go Handling

`no_go_flags` must be an array. A non-empty `no_go_flags` fails with `no_go_flags_present` unless
`target_decision_status` is exactly `blocked_no_go`, which is the only status permitted to carry
No-Go flags.

## 12. Non-authorization Boundary

The record carries no grant-like field, and any of `approval`, `approved`, `authorized`,
`execution_permission`, `executed`, `promotion_permission`, `promoted`, `persistence_permission`,
`persisted`, `storage_permission`, `stored`, `external_action_permission`, or
`formal_workunit_promotion` on the input reports `forbidden_grant_field_present`. A validation pass
returns only `{ ok, issues }`; it creates no approval, execution, persistence, storage, or promotion
permission, and it makes no evidence true.

## 13. What Is Not Implemented

No persistence, storage, repository, storage adapter, database schema, D1 binding/migration/access,
SQL execution/mutation, product runtime pipeline, ApprovalStore integration, P7.1 TSP wiring, external
action execution, Formal WorkUnit promotion, real LLM, GraphRAG, vectorization, UI, Electron, package
dependency, workflow, or migration change. No app runtime file is wired to this module.

## 14. Validation Commands

- `node --experimental-strip-types tests/phase6PersistenceTargetDecisionValidators.test.mts`
- `npm test`
- `npm run alpha:safety-gate`
- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run electron:build:check`

## 15. Next Safe Loop

P6-I5C pure persistence target decision constructors only. D1 read-only execution remains P6-I6 or
later behind a separate D1 persistence gate.
