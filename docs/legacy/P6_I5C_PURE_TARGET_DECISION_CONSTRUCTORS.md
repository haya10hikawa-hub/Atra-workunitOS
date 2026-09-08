# P6-I5C Pure Persistence Target Decision Constructors

**Loop:** P6-I5C (pure_persistence_target_decision_constructors_loop / pure-constructors-only).
**Depends on:** P6-I5A Persistence Target Decision Spec and P6-I5B Persistence Target Decision types
and validators (PR #95) — merged into `main`.

P6-I5C implements pure constructors only.
P6-I5C does not implement persistence.
P6-I5C does not implement storage.
P6-I5C does not implement repository behavior.
P6-I5C does not implement a storage adapter.
P6-I5C does not implement a database schema.
P6-I5C does not add D1 bindings.
P6-I5C does not add D1 migrations.
P6-I5C does not access D1.
P6-I5C does not execute SQL.
P6-I5C does not implement product runtime pipeline.
P6-I5C does not integrate ApprovalStore.
P6-I5C does not wire P7.1 TSP utilities.
P6-I5C does not execute external actions.
P6-I5C does not promote Formal WorkUnits.
Constructors are pure.
Constructors use caller-provided ids.
Constructors use caller-provided timestamps.
Constructors use caller-provided payload_hash.
Constructors do not call Date.now.
Constructors do not call new Date.
Constructors do not call randomUUID.
Constructors do not call Math.random.
Constructor success is not persistence.
Constructor success is not storage.
Constructor success is not approval.
Constructor success is not execution permission.
Constructor success is not production readiness.

## 1. Purpose

P6-I5C adds pure, deterministic constructors that build a P6-I5B `TargetDecisionRecord` for the
P6-I5A selected target class and validate it with the P6-I5B validator. It gives future loops
(P6-I5D test-only fixture onward) a safe way to obtain a valid record without any persistence, and it
authorizes nothing.

## 2. Scope

In scope: pure constructors and a construction-result helper, isolated under
`app/lib/phase6/persistenceTargetDecision/`, plus a bounded modification to that module's `index.ts`
re-export. Out of scope: persistence, storage, repository, storage adapter, database schema, D1
bindings/migrations/access, SQL execution/mutation, product runtime pipeline, ApprovalStore
integration, P7.1 TSP wiring, external action execution, and Formal WorkUnit promotion.

## 3. Implemented Files

- `app/lib/phase6/persistenceTargetDecision/construction.ts` — construction result types and helpers.
- `app/lib/phase6/persistenceTargetDecision/constructors.ts` — pure constructors.
- `app/lib/phase6/persistenceTargetDecision/index.ts` — re-export updated to expose the above.
- `tests/phase6PersistenceTargetDecisionConstructors.test.mts` — isolated `node:test` suite.
- `docs/legacy/P6_I5C_EXPLICIT_HUMAN_GO.md` — durable human Go record.
- `docs/legacy/P6_I5C_PURE_TARGET_DECISION_CONSTRUCTORS.md` — this document.

## 4. Constructor Contract

`construction.ts` exports `TargetDecisionConstructorIssue`, `TargetDecisionConstructionResult`,
`okTargetDecisionConstruction`, and `failTargetDecisionConstruction`. The result is a discriminated
union: success is `{ ok: true, record, issues: [] }`; failure is `{ ok: false, issues }` with
`record?: never`. Stable issue codes are `validation_failed`, `invalid_constructor_input`, and
`constructor_exception`. Issue messages are `code:field` only and never echo input values. The result
object carries no grant-like field.

## 5. createTargetDecisionRecord

`createTargetDecisionRecord` accepts explicit caller input, fixes `selected_target_class` to
`in_memory_test_only_store`, fixes the deferred and rejected target sets, sets every safety boundary
field to `confirmed`, sets `p6_i5_merged` and `main_safety_gate_active` to `true`, sets the three
dependency statuses to `present`, sets `human_review_required` to `true`, defaults
`target_decision_status` to `target_selected_for_future_types` (unless the caller supplies a valid
non-blocked status), defaults `target_decision_outcome` to `pass` (unless the caller supplies `warn`),
sets `no_go_flags` to `[]`, validates the produced record, and returns an ok result only when
validation passes.

## 6. createBlockedTargetDecisionRecord

`createBlockedTargetDecisionRecord` accepts explicit caller input, sets `target_decision_status` to
`blocked_no_go` and `target_decision_outcome` to `no_go`, keeps `selected_target_class` at
`in_memory_test_only_store`, preserves the exact deferred and rejected target sets, requires a
non-empty `no_go_flags` array (empty or missing fails with `invalid_constructor_input`), preserves the
caller-provided failure and review rationale, validates the produced record, and returns an ok result
only when validation passes.

## 7. Caller-provided Identity and Time

Both constructors use caller-provided `target_decision_record_id`, `tenant_id`, `p6_i5_merge_commit`,
`reviewed_by_human_id`, `reviewer_role`, `review_rationale`, `reviewed_by_human_at`, `created_at`, and
`payload_hash`. The constructors generate no identifiers, read no clock, and read no randomness; they
never call `Date.now`, `new Date`, `randomUUID`, or `Math.random`.

## 8. Selected Target Invariant

The produced record always has `selected_target_class` equal to `in_memory_test_only_store`. No
constructor produces a record whose selected target is any deferred class
(`local_ephemeral_dev_store`, `append_only_audit_candidate_store`,
`tenant_scoped_artifact_candidate_store`, `future_d1_store_after_separate_d1_gate`) or the rejected
class (`blocked_target`). An attempted selected-target override in the input is not honored; the fixed
selection always wins.

## 9. Deferred and Rejected Target Invariants

The produced record's `deferred_target_classes` always contains exactly `local_ephemeral_dev_store`,
`append_only_audit_candidate_store`, `tenant_scoped_artifact_candidate_store`, and
`future_d1_store_after_separate_d1_gate`. Its `rejected_target_classes` always contains exactly
`blocked_target`. Deferred classes appear only in `deferred_target_classes`; rejected classes appear
only in `rejected_target_classes`.

## 10. Validation After Construction

Every constructor validates its produced record with the P6-I5B `validateTargetDecisionRecord` and
returns success only when validation passes. On validation failure the constructor returns a failure
result whose issues are reported under the stable `validation_failed` code. Genuinely-unknown caller
keys (typos or grant-like fields) flow through to the validator and fail closed there.

## 11. Purity Requirements

The constructors are pure and deterministic: identical input yields deep-equal output. They take a
single-read snapshot of the input, never mutate the input, read no clock and no randomness, perform no
I/O of any kind, and import only the sibling `./types.ts`, `./validators.ts`, and `./construction.ts`
modules. Static source guards assert the constructor sources contain none of `Date.now`, `new Date`,
`randomUUID`, `Math.random`, `fetch(`, `child_process`, `process.env`, filesystem imports, or the
gated capability tokens.

## 12. No-Go Handling

Only `createBlockedTargetDecisionRecord` produces a record carrying a non-empty `no_go_flags` array,
and only with `target_decision_status` equal to `blocked_no_go`. `createTargetDecisionRecord` always
sets `no_go_flags` to `[]`. This matches the P6-I5B validator, which permits non-empty No-Go flags
only under the `blocked_no_go` status.

## 13. Non-authorization Boundary

Construction success returns only `{ ok, record, issues }`; it creates no approval, execution,
persistence, storage, or promotion permission, and it makes no evidence true. The record and the
result carry no grant-like field, and grant-like input keys fail closed through the validator.

## 14. What Is Not Implemented

No persistence, storage, repository, storage adapter, database schema, D1 binding/migration/access,
SQL execution/mutation, product runtime pipeline, ApprovalStore integration, P7.1 TSP wiring, external
action execution, Formal WorkUnit promotion, real LLM, GraphRAG, vectorization, UI, Electron, package
dependency, workflow, or migration change. No app runtime file is wired to this module beyond its own
bounded `index.ts` re-export.

## 15. Validation Commands

- `node --experimental-strip-types tests/phase6PersistenceTargetDecisionConstructors.test.mts`
- `npm test`
- `npm run alpha:safety-gate`
- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run electron:build:check`

## 16. Next Safe Loop

P6-I5D test-only persistence target decision fixture. D1 read-only execution remains P6-I6 or later
behind a separate D1 persistence gate.
