# P6-I5D Test-only Persistence Target Decision Fixture

**Loop:** P6-I5D (test_only_persistence_target_decision_fixture_loop / test-only-fixture-only).
**Depends on:** P6-I5A Persistence Target Decision Spec, P6-I5B Persistence Target Decision types and
validators, and P6-I5C Pure Persistence Target Decision constructors (PR #96) — merged into `main`.

P6-I5D implements test-only fixtures only.
P6-I5D does not implement persistence.
P6-I5D does not implement storage.
P6-I5D does not implement repository behavior.
P6-I5D does not implement a storage adapter.
P6-I5D does not implement a database schema.
P6-I5D does not add D1 bindings.
P6-I5D does not add D1 migrations.
P6-I5D does not access D1.
P6-I5D does not execute SQL.
P6-I5D does not implement product runtime pipeline.
P6-I5D does not integrate ApprovalStore.
P6-I5D does not wire P7.1 TSP utilities.
P6-I5D does not execute external actions.
P6-I5D does not promote Formal WorkUnits.
Fixtures are deterministic.
Fixtures use fixed caller-provided ids.
Fixtures use fixed caller-provided timestamps.
Fixtures use fixed caller-provided payload_hash values.
Fixtures are created through P6-I5C constructors.
Fixtures validate through P6-I5B validators.
Fixture validity is not persistence.
Fixture validity is not storage.
Fixture validity is not approval.
Fixture validity is not execution permission.
Fixture validity is not production readiness.

## 1. Purpose

P6-I5D provides deterministic, test-only `TargetDecisionRecord` fixtures — one valid record and one
blocked record — for use by later test-only loops. The fixtures are built through the P6-I5C pure
constructors and validate through the P6-I5B validator. They implement no persistence and authorize
nothing.

## 2. Scope

In scope: one test-only fixture module under `tests/fixtures/phase6/` exporting fixed inputs, factory
functions, and constructed records. Out of scope: persistence, storage, repository, storage adapter,
database schema, D1 bindings/migrations/access, SQL execution/mutation, product runtime pipeline,
ApprovalStore integration, P7.1 TSP wiring, external action execution, and Formal WorkUnit promotion.

## 3. Implemented Files

- `tests/fixtures/phase6/persistenceTargetDecisionFixture.mts` — deterministic fixture module.
- `tests/phase6PersistenceTargetDecisionFixture.test.mts` — isolated `node:test` suite.
- `docs/legacy/P6_I5D_EXPLICIT_HUMAN_GO.md` — durable human Go record.
- `docs/legacy/P6_I5D_TEST_ONLY_TARGET_DECISION_FIXTURE.md` — this document.

## 4. Fixture Contract

The fixture module exports `VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT`,
`BLOCKED_TARGET_DECISION_RECORD_FIXTURE_INPUT`, `createValidTargetDecisionRecordFixture`,
`createBlockedTargetDecisionRecordFixture`, `VALID_TARGET_DECISION_RECORD_FIXTURE`, and
`BLOCKED_TARGET_DECISION_RECORD_FIXTURE`. Inputs are frozen; constructed records are frozen by the
P6-I5C constructor. If construction fails at module load, the factory throws a generic error that does
not echo input values.

## 5. Valid Target Decision Fixture

The valid fixture is built through `createTargetDecisionRecord`. Its `selected_target_class` is
`in_memory_test_only_store`, its `target_decision_status` is `target_selected_for_future_types`, its
`target_decision_outcome` is `pass`, and its `no_go_flags` is empty. Its `deferred_target_classes`
contains exactly the four deferred classes and its `rejected_target_classes` contains exactly
`blocked_target`. It validates with the P6-I5B validator.

## 6. Blocked Target Decision Fixture

The blocked fixture is built through `createBlockedTargetDecisionRecord`. Its `selected_target_class`
is `in_memory_test_only_store`, its `target_decision_status` is `blocked_no_go`, its
`target_decision_outcome` is `no_go`, and its `no_go_flags` is non-empty. It preserves the exact
deferred and rejected target sets and validates with the P6-I5B validator.

## 7. Constructor Integration

Both fixtures are produced only through the P6-I5C constructors
(`createTargetDecisionRecord`, `createBlockedTargetDecisionRecord`); the fixture module builds no
record by hand. The fixture module imports only the Phase 6 Persistence Target Decision module
surface.

## 8. Validator Integration

Because the P6-I5C constructors validate their output with the P6-I5B `validateTargetDecisionRecord`
before returning success, every exported fixture record has already passed validation. The fixture
test re-runs the validator on each fixture to pin this property.

## 9. Determinism Requirements

The fixtures use fixed, caller-provided values only: fixed `target_decision_record_id`, `tenant_id`,
`p6_i5_merge_commit`, `reviewed_by_human_at`, `created_at`, `payload_hash`, `review_rationale`,
rationale fields, `next_slice`, `next_slice_scope`, `forbidden_next_slice_capabilities`, and gate
requirement values. The factories read no clock and no randomness, so the same fixed input yields
deep-equal records on every call.

## 10. Selected Target Invariant

Every fixture record has `selected_target_class` equal to `in_memory_test_only_store`. No fixture
record has a selected target of any deferred class (`local_ephemeral_dev_store`,
`append_only_audit_candidate_store`, `tenant_scoped_artifact_candidate_store`,
`future_d1_store_after_separate_d1_gate`) or the rejected class (`blocked_target`). Deferred classes
appear only in `deferred_target_classes`; rejected classes appear only in `rejected_target_classes`.

## 11. No-Go Fixture Handling

Only the blocked fixture carries a non-empty `no_go_flags` array, and only under
`target_decision_status` equal to `blocked_no_go`. The valid fixture always has empty `no_go_flags`.
This matches the P6-I5B validator, which permits non-empty No-Go flags only under the `blocked_no_go`
status.

## 12. Purity and Source Boundaries

The fixture module reads no clock and no randomness, performs no I/O of any kind, and imports only the
Phase 6 Persistence Target Decision module surface. It contains none of the gated runtime capability
tokens: no clock read, no random source, no filesystem access, no network access, no child process,
no environment read, no database access, no query-language execution, no approval-store call, and no
external action call. A static source guard in the fixture test pins the absence of those substrings.

## 13. Non-authorization Boundary

Fixture validity returns only in-memory records; it creates no approval, execution, persistence,
storage, or promotion permission, and it makes no evidence true. The fixture records carry no
grant-like field. Fixture validity is not approval, not execution permission, not persistence, not
storage, and not production readiness.

## 14. What Is Not Implemented

No persistence, storage, repository, storage adapter, database schema, D1 binding/migration/access,
SQL execution/mutation, product runtime pipeline, ApprovalStore integration, P7.1 TSP wiring, external
action execution, Formal WorkUnit promotion, real LLM, GraphRAG, vectorization, UI, Electron, package
dependency, workflow, or migration change. No app file is changed and no app runtime is wired.

## 15. Validation Commands

- `node --experimental-strip-types tests/phase6PersistenceTargetDecisionFixture.test.mts`
- `npm test`
- `npm run alpha:safety-gate`
- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run electron:build:check`

## 16. Next Safe Loop

P6-I5E in-memory test-only persistence target decision adapter. D1 read-only execution remains P6-I6
or later behind a separate D1 persistence gate.
