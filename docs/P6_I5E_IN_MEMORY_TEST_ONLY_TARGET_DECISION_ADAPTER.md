# P6-I5E In-memory Test-only Persistence Target Decision Adapter

**Loop:** P6-I5E (in_memory_test_only_persistence_target_decision_adapter_loop /
in-memory-test-only-adapter only).
**Depends on:** P6-I5A Persistence Target Decision Spec, P6-I5B types and validators, P6-I5C pure
constructors, and P6-I5D test-only fixture (PR #97) — merged into `main`.

P6-I5E implements a test-only in-memory adapter only.
P6-I5E does not implement real persistence.
P6-I5E does not implement durable storage.
P6-I5E does not implement repository behavior.
P6-I5E does not implement a production storage adapter.
P6-I5E does not implement a database schema.
P6-I5E does not add D1 bindings.
P6-I5E does not add D1 migrations.
P6-I5E does not access D1.
P6-I5E does not execute SQL.
P6-I5E does not implement product runtime pipeline.
P6-I5E does not integrate ApprovalStore.
P6-I5E does not wire P7.1 TSP utilities.
P6-I5E does not execute external actions.
P6-I5E does not promote Formal WorkUnits.
The adapter is test-only.
The adapter is in-memory only.
The adapter is non-durable.
The adapter does not survive process restart.
The adapter is tenant-scoped.
The adapter validates records with P6-I5B validators before accepting them.
The adapter is tested with P6-I5D fixtures.
Adapter success is not persistence.
Adapter success is not durable storage.
Adapter success is not approval.
Adapter success is not execution permission.
Adapter success is not production readiness.

## 1. Purpose

P6-I5E provides a deterministic, test-only, in-memory adapter that accepts validated
`TargetDecisionRecord` candidates for the P6-I5A selected target class, scoped per tenant. It exists
so later test-only loops can exercise candidate put/get/list/count/clear behavior without any durable
storage. It implements nothing durable and authorizes nothing.

## 2. Scope

In scope: one test-only adapter module under `tests/harness/phase6/` holding validated candidates in
an in-process map, plus its isolated test. Out of scope: real persistence, durable storage,
repository, production storage adapter, database schema, D1 bindings/migrations/access, SQL
execution/mutation, product runtime pipeline, ApprovalStore integration, P7.1 TSP wiring, external
action execution, and Formal WorkUnit promotion.

## 3. Implemented Files

- `tests/harness/phase6/inMemoryPersistenceTargetDecisionAdapter.mts` — the test-only adapter.
- `tests/phase6InMemoryPersistenceTargetDecisionAdapter.test.mts` — isolated `node:test` suite.
- `docs/P6_I5E_EXPLICIT_HUMAN_GO.md` — durable human Go record.
- `docs/P6_I5E_IN_MEMORY_TEST_ONLY_TARGET_DECISION_ADAPTER.md` — this document.

## 4. Adapter Contract

`createInMemoryPersistenceTargetDecisionAdapter()` returns an
`InMemoryPersistenceTargetDecisionAdapter` with `putTargetDecisionCandidate`,
`getTargetDecisionCandidate`, `listTargetDecisionCandidates`, `clearTargetDecisionCandidates`,
`clearAllTargetDecisionCandidates`, and `countTargetDecisionCandidates`. Every method returns an
`InMemoryAdapterResult` of `{ ok, issues, record?, records?, count?, cleared_count? }`. Each
`InMemoryAdapterIssue` carries `code`, `field`, and a `message` of exactly `code:field` that never
echoes input values. Stable codes are `invalid_input`, `invalid_record`, `validation_failed`,
`tenant_mismatch`, `duplicate_conflict`, `not_found`, `forbidden_selected_target`, and
`adapter_exception` (`not_found` is a reserved code; a not-found get returns ok with no record).
Methods never throw for normal invalid input; a defensive catch maps unexpected failures to
`adapter_exception`. The result carries no grant-like field.

## 5. putTargetDecisionCandidate

Accepts `{ tenant_id, record }`. It rejects non-object input (`invalid_input`), a non-object record
(`invalid_record`), and a record whose `selected_target_class` is not `in_memory_test_only_store`
(`forbidden_selected_target`). It validates the record with `validateTargetDecisionRecord`
(`validation_failed` on failure), rejects a record whose `tenant_id` differs from the input tenant
(`tenant_mismatch`), and stores a frozen deep-clone snapshot under a key of `tenant_id` plus
`target_decision_record_id`. A re-put with deep-equal content is idempotent; a re-put with the same
key but different content fails closed with `duplicate_conflict`.

## 6. getTargetDecisionCandidate

Accepts `{ tenant_id, target_decision_record_id }`. It returns an ok result with a frozen snapshot
when found and an ok result with no `record` when not found. It never reads across tenants: a lookup
under a different tenant returns no record.

## 7. listTargetDecisionCandidates

Accepts `{ tenant_id }`. It returns an ok result whose `records` are that tenant's candidates only,
deterministically ordered by `target_decision_record_id`. It never includes another tenant's records.

## 8. clearTargetDecisionCandidates

Accepts `{ tenant_id }`. It clears only that tenant's in-memory candidates and returns an ok result
with `cleared_count`. It never clears another tenant's records.

## 9. countTargetDecisionCandidates

Accepts `{ tenant_id }`. It returns an ok result with `count` for that tenant only.
`clearAllTargetDecisionCandidates()` clears every tenant's candidates and is permitted only because
this is a test-only harness; it calls no external system.

## 10. Tenant Isolation

Candidates are keyed first by `tenant_id`, then by `target_decision_record_id`. Every read, list,
count, and clear operation is scoped to the requested tenant. A put requires the record's own
`tenant_id` to equal the input `tenant_id`, so a candidate can never be stored under a mismatched
tenant.

## 11. Idempotency and Duplicate Handling

A re-put with the same `tenant_id` and `target_decision_record_id` succeeds idempotently only when
the new record is deep-equal to the stored snapshot. A re-put with the same key but any differing
field fails closed with `duplicate_conflict`; the stored snapshot is never overwritten.

## 12. Validator Integration

The adapter accepts a candidate only after `validateTargetDecisionRecord` (P6-I5B) returns ok. A
record that fails validation — including a record carrying forbidden grant-like fields that the
validator rejects — is refused with `validation_failed`.

## 13. Fixture Integration

The adapter is exercised in tests with the P6-I5D fixtures
(`VALID_TARGET_DECISION_RECORD_FIXTURE` and `BLOCKED_TARGET_DECISION_RECORD_FIXTURE`), which are built
through the P6-I5C constructors and already validate with the P6-I5B validator.

## 14. Determinism Requirements

The adapter reads no clock and no randomness. `listTargetDecisionCandidates` sorts by
`target_decision_record_id`, so results are deterministic. Given the same operations in the same
order, the adapter returns the same results.

## 15. Source Boundaries

The adapter imports only the Phase 6 Persistence Target Decision module surface. It contains none of
the gated runtime capability tokens: no clock read, no random source, no filesystem access, no
network access, no child process, no environment read, no database access, no query-language
execution, no approval-store call, and no external action call. A static source guard in the adapter
test pins the absence of those substrings.

## 16. Non-authorization Boundary

Adapter operations return only in-memory results; they create no approval, execution, persistence,
durable storage, or promotion permission, and they make no evidence true. Results and stored records
carry no grant-like field. Adapter success is not approval, not execution permission, not
persistence, not durable storage, and not production readiness.

## 17. What Is Not Implemented

No real persistence, durable storage, repository, production storage adapter, database schema, D1
binding/migration/access, SQL execution/mutation, product runtime pipeline, ApprovalStore
integration, P7.1 TSP wiring, external action execution, Formal WorkUnit promotion, real LLM,
GraphRAG, vectorization, UI, Electron, package dependency, workflow, or migration change. No app file
is changed and no app runtime is wired. Nothing the adapter holds survives process exit.

## 18. Validation Commands

- `node --experimental-strip-types tests/phase6InMemoryPersistenceTargetDecisionAdapter.test.mts`
- `npm test`
- `npm run alpha:safety-gate`
- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run electron:build:check`

## 19. Next Safe Loop

P6-I5F persistence audit evidence spec. D1 read-only execution remains P6-I6 or later behind a
separate D1 persistence gate.
