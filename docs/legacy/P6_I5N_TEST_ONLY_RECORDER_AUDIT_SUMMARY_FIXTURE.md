# P6-I5N Test-only Recorder Audit Summary Fixture

**Loop:** P6-I5N (test_only_recorder_audit_summary_fixture_loop / test-only-fixture-only).
**Depends on:** P6-I5K Recorder Audit Summary Spec and Contract (PR #105), P6-I5L Recorder Audit
Summary types and validators (PR #106), P6-I5M Pure Recorder Audit Summary constructors (PR #107) —
merged into `main`.

P6-I5N implements test-only recorder audit summary fixtures only. P6-I5N does not implement recorder
summary runtime, summary emitter, audit runtime, audit event emitter, real persistence, durable
storage, repository behavior, a production storage adapter, a database schema, D1 bindings, D1
migrations, D1 access, SQL execution, product runtime pipeline, Evidence Ledger append, Graph Model
write, ApprovalStore integration, P7.1 TSP utility wiring, external action execution, Formal WorkUnit
promotion, or StartHub runtime.

## 1. Purpose

This document specifies the deterministic, test-only fixture data added in P6-I5N: five fixed
`RecorderAuditSummaryRecord` fixtures built through the P6-I5M pure constructors and validated through
the P6-I5L validators, giving later test-only loops a pinned, non-authorizing data set to build
against. Fixtures describe; they implement no runtime and authorize nothing.

## 2. Scope

In scope: one fixture module (`tests/fixtures/phase6/recorderAuditSummaryFixture.mts`) exporting five
fixed constructor inputs, five constructed records, five deterministic factory functions, and one
ordered fixture list, plus the isolated fixture test. Out of scope: recorder summary runtime, summary
emitter, audit runtime, audit event emitter, real persistence, durable storage, repository, production
storage adapter, database schema, D1 bindings/migrations/access, SQL execution/mutation, product
runtime pipeline, Evidence Ledger append, Graph Model write, ApprovalStore integration, P7.1 TSP
wiring, external action execution, Formal WorkUnit promotion, and StartHub runtime. No `app/` file
changes in this loop.

## 3. Implemented Files

- `tests/fixtures/phase6/recorderAuditSummaryFixture.mts` — the deterministic test-only fixture module.
- `tests/phase6RecorderAuditSummaryFixture.test.mts` — isolated tests over the fixture module.
- `docs/legacy/P6_I5N_EXPLICIT_HUMAN_GO.md` — durable human Go record, created before any code.
- `docs/legacy/P6_I5N_TEST_ONLY_RECORDER_AUDIT_SUMMARY_FIXTURE.md` — this document.

## 4. Fixture Contract

Every fixture input is a fixed, fully caller-provided, frozen object. Every fixture record is built
through a P6-I5M constructor at module load, validated (transitively) by the P6-I5L validator inside
the constructor, and frozen by the constructor. If construction fails at module load, the module
throws a generic error that never echoes input values. The module's only import is the Phase 6
Recorder Audit Summary module surface (`app/lib/phase6/recorderAuditSummary/index.ts`); it performs no
I/O, reads no clock and no randomness, and mutates no global state.

## 5. Tenant Summary Fixture

`VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE` (`summary_id: ras_tenant_fixture_001`, tenant
`tenant_recorder_summary_fixture`) is built with `createTenantRecorderAuditSummary`. Scope is `tenant`;
one accepted `recordAuditEvent` attempt; all failure counts zero; `no_go_flags` is `[]`.

## 6. All-test-memory Summary Fixture

`VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE` (`summary_id:
ras_all_test_memory_fixture_001`) is built with `createAllTestMemoryRecorderAuditSummary`. Scope is
`all_test_memory`; `summarized_operation_names` includes `clearAllAuditEvents`;
`operation_counts.clear_all` is 1; `clear_scope_summary` explicitly states `all_test_memory`;
`non_durability_summary` carries the test-only / non-durable wording; `no_go_flags` is `[]`.

## 7. Operation-subset Summary Fixture

`VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE` (`summary_id:
ras_operation_subset_fixture_001`) is built with `createOperationSubsetRecorderAuditSummary`. Scope is
`operation_subset`; the summarized subset is `getAuditEvent` and `listAuditEvents`; `no_go_flags` is
`[]`.

## 8. Fixture-suite Summary Fixture

`VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE` (`summary_id: ras_fixture_suite_fixture_001`) is
built with `createFixtureSuiteRecorderAuditSummary`. Scope is `fixture_suite`; all six operation names
are summarized; all eight fixture coverage booleans including `all_required_fixtures_covered` are
`true`; `no_go_flags` is `[]`.

## 9. Blocked No-Go Summary Fixture

`BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE` (`summary_id: ras_blocked_no_go_fixture_001`) is built
with `createBlockedRecorderAuditSummary`. `no_go_flags` is the non-empty `["validation_failed"]`;
`status_counts.blocked_no_go` is 1 and `outcome_counts.no_go` is 1 (fail/no-go outcome evidence);
`validation_failed_count` is fail-closed against `rejected_record_count`; issue counts carry the
matching stable codes.

## 10. Constructor Integration

Fixtures use P6-I5M constructors: `createTenantRecorderAuditSummary`,
`createAllTestMemoryRecorderAuditSummary`, `createOperationSubsetRecorderAuditSummary`,
`createFixtureSuiteRecorderAuditSummary`, and `createBlockedRecorderAuditSummary`. The constructors fix
both target class fields, defensively copy container fields, validate, and freeze the record; the
fixture module never assembles a record by hand.

## 11. Validator Integration

Fixtures validate through P6-I5L validators: the constructor calls
`validateRecorderAuditSummaryRecord` before returning `ok: true`, and the isolated test re-validates
every exported fixture record directly against `validateRecorderAuditSummaryRecord`.

## 12. Determinism Requirements

Fixtures are deterministic. All values are fixed literals: fixed `summary_id` values, fixed `tenant_id`
values, fixed `created_at` values (`2026-07-09T00:00:00Z`), fixed `payload_hash` values, fixed source
lineage, and a fixed `non_authorization_statement`. Fixtures do not call Date.now. Fixtures do not
call new Date. Fixtures do not call crypto.randomUUID. Fixtures do not call randomUUID. Fixtures do
not call Math.random. Repeated factory calls return deep-equal records.

## 13. Recorder and Selected Target Invariants

Recorder target class is exactly `in_memory_test_only_store`. Selected target class is exactly
`in_memory_test_only_store`. The P6-I5M constructors overlay both fields after the input snapshot, so
no fixture can carry `local_ephemeral_dev_store`, `append_only_audit_candidate_store`,
`tenant_scoped_artifact_candidate_store`, `future_d1_store_after_separate_d1_gate`, or
`blocked_target`.

## 14. Count and Coverage Fixtures

Every fixture carries the full 14 scalar counts, the six exact-key count maps, and the eight-field
`fixture_coverage` object, all as fixed frozen values satisfying the P6-I5L count-consistency and
fail-closed rules. The `no_go_flag_counts` zero map is derived deterministically from the module's
exported flag list so the fixture stays in lockstep with the P6-I5L key set.

## 15. No-Go Fixture Handling

Valid fixtures have `no_go_flags: []`. The blocked fixture has non-empty `no_go_flags` together with
`status_counts.blocked_no_go > 0` and `outcome_counts.no_go > 0`, satisfying the P6-I5L
`no_go_flags_present` policy and the blocked constructor's up-front evidence requirement.

## 16. Privacy and Redaction Boundary

Fixture data contains no secret-like values, no raw event payloads, and no grant-like fields.
`redaction_summary` states that no raw payload echo and no secret-like value echo occur. The module's
load-failure error message is generic and never echoes input values. A static source guard in the test
asserts the fixture source contains none of the forbidden capability substrings.

## 17. Non-authorization Boundary

Fixture validity is descriptive and non-authorizing. Fixture validity is not truth. Fixture validity
is not approval. Fixture validity is not execution permission. Fixture validity is not summary
runtime. Fixture validity is not summary emission. Fixture validity is not audit runtime. Fixture
validity is not audit event emission. Fixture validity is not persistence. Fixture validity is not
durable storage. Fixture validity is not Evidence Ledger append. Fixture validity is not Graph Model
write. Fixture validity is not production readiness. Every fixture carries the required
`non_authorization_statement` phrases enforced by the P6-I5L validators.

## 18. What Is Not Implemented

No recorder summary runtime, no summary emitter, no audit runtime, no audit event emitter, no real
persistence, no durable storage, no repository, no production storage adapter, no database schema, no
D1 bindings, no D1 migrations, no D1 access, no SQL execution, no product runtime pipeline, no
Evidence Ledger append, no Graph Model write, no ApprovalStore integration, no P7.1 TSP wiring, no
external action execution, no Formal WorkUnit promotion, and no StartHub runtime. No `app/` file was
changed in this loop.

## 19. Validation Commands

```
node --experimental-strip-types tests/phase6RecorderAuditSummaryFixture.test.mts
node --experimental-strip-types tests/phase6RecorderAuditSummaryConstructors.test.mts
node --experimental-strip-types tests/phase6RecorderAuditSummaryValidators.test.mts
node --experimental-strip-types tests/phase6RecorderAuditSummarySpec.test.mts
npm test
npm run alpha:safety-gate
npm run lint
npm run build
npm run cf:build
npm run electron:build:check
```

## 20. Next Safe Loop

P6-I5O test-only recorder summary harness (a test-only in-memory harness exercising the P6-I5N
fixtures, still no runtime, no emitter, no persistence, no D1, no SQL, no Evidence Ledger append, no
Graph Model write). StartHub runtime remains separately gated. D1 read-only execution remains P6-I6 or
later.
