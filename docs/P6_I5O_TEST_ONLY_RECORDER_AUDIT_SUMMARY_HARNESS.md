# P6-I5O Test-only Recorder Audit Summary Harness

**Loop:** P6-I5O (test_only_recorder_audit_summary_harness_loop / test-only-harness-only).
**Depends on:** P6-I5K Recorder Audit Summary Spec and Contract (PR #105), P6-I5L Recorder Audit
Summary types and validators (PR #106), P6-I5M Pure Recorder Audit Summary constructors (PR #107),
P6-I5N Test-only Recorder Audit Summary fixtures (PR #108) — merged into `main`.

P6-I5O implements a test-only recorder audit summary harness only. P6-I5O does not implement recorder
summary runtime, summary emitter, audit runtime, audit event emitter, real persistence, durable
storage, repository behavior, a production storage adapter, a database schema, D1 bindings, D1
migrations, D1 access, SQL execution, product runtime pipeline, Evidence Ledger append, Graph Model
write, ApprovalStore integration, P7.1 TSP utility wiring, external action execution, Formal WorkUnit
promotion, or StartHub runtime.

## 1. Purpose

This document specifies the deterministic, test-only, in-memory, read-only harness added in P6-I5O
over the P6-I5N Recorder Audit Summary fixtures, giving later test-only loops a pinned way to list,
look up, filter, count, and re-validate the fixture summaries. The harness describes; it implements no
runtime and authorizes nothing.

## 2. Scope

In scope: one harness module (`tests/harness/phase6/recorderAuditSummaryHarness.mts`) exposing a
factory and read-only operations over the five P6-I5N fixtures, plus the isolated harness test. Out of
scope: recorder summary runtime, summary emitter, audit runtime, audit event emitter, real
persistence, durable storage, repository, production storage adapter, database schema, D1
bindings/migrations/access, SQL execution/mutation, product runtime pipeline, Evidence Ledger append,
Graph Model write, ApprovalStore integration, P7.1 TSP wiring, external action execution, Formal
WorkUnit promotion, and StartHub runtime. No `app/` file changes in this loop.

## 3. Implemented Files

- `tests/harness/phase6/recorderAuditSummaryHarness.mts` — the test-only harness module.
- `tests/phase6RecorderAuditSummaryHarness.test.mts` — isolated tests over the harness.
- `docs/P6_I5O_EXPLICIT_HUMAN_GO.md` — durable human Go record, created before any code.
- `docs/P6_I5O_TEST_ONLY_RECORDER_AUDIT_SUMMARY_HARNESS.md` — this document.

## 4. Harness Contract

`createRecorderAuditSummaryTestHarness()` loads the five P6-I5N fixtures into a harness-local frozen
list at construction, re-validating every record through the P6-I5L
`validateRecorderAuditSummaryRecord` and checking both target class fields; invalid fixture state
throws a generic non-echoing error. Every operation returns
`{ ok, issues, summary?, summaries?, count? }` with stable non-echoing issues
(`{ code, field, message: "code:field" }`; codes: `invalid_input`, `not_found`, `validation_failed`,
`forbidden_target_class`, `harness_exception`) and never throws for normal invalid input — the only
throwing surface is the explicitly fail-closed `requireSummary`, which throws generic non-echoing
errors. The harness's only imports are the P6-I5N fixture module and the Phase 6 Recorder Audit
Summary module surface; it must never be exported from or imported by `app/`.

## 5. Harness Operations

- `listSummaries()` — all five fixtures in the deterministic P6-I5N order (tenant, all_test_memory,
  operation_subset, fixture_suite, blocked_no_go), as a fresh frozen array per call.
- `getSummary(summary_id)` — lookup by fixed summary id; empty/non-string input fails with
  `invalid_input`; a missing id fails with `not_found` (never echoing the requested id).
- `requireSummary(summary_id)` — fail-closed lookup returning the record or throwing a generic
  non-echoing error.
- `listByScope(summary_scope)` — filters by summary scope; the scope is checked with the P6-I5L
  `isRecorderAuditSummaryScope` type guard, so an unknown scope fails with `invalid_input`.
- `listByTenant(tenant_id)` — filters by tenant id; empty/non-string input fails with `invalid_input`.
- `countSummaries()` — returns `count: 5`.
- `validateAllSummaries()` — re-validates every record through the P6-I5L validator and re-checks both
  target class fields; any failure is reported with stable issue codes.
- `reset()` — re-derives the harness-local state from the fixture constants; there is no other state
  to clear because the harness is read-only.

## 6. Determinism Requirements

The harness is deterministic. It reads no clock and no randomness: it does not call Date.now, does not
call new Date, does not call crypto.randomUUID, does not call randomUUID, and does not call
Math.random. Repeated construction yields deep-equal views; list order is always the fixed P6-I5N
fixture order.

## 7. Fixture and Validator Integration

The harness loads only `ALL_RECORDER_AUDIT_SUMMARY_FIXTURES` from P6-I5N and validates through the
P6-I5L validators both at construction and on demand via `validateAllSummaries()`. It never constructs
records by hand and never bypasses the validator.

## 8. Recorder and Selected Target Invariants

Recorder target class is exactly `in_memory_test_only_store`. Selected target class is exactly
`in_memory_test_only_store`. The harness checks both fields on every record at load and in
`validateAllSummaries()`; a forbidden class fails closed (`forbidden_target_class` or a generic load
error).

## 9. Immutability and Defensive Snapshots

Fixture records are frozen by the P6-I5M constructor; the harness-local list and every returned list
are frozen fresh arrays, so returned snapshots cannot be used to mutate harness state and the harness
never mutates the exported fixture constants.

## 10. Non-authorization Boundary

Harness success is descriptive and non-authorizing. Harness success is not truth, not approval, not
execution permission, not summary runtime, not summary emission, not audit runtime, not audit event
emission, not persistence, not durable storage, not Evidence Ledger append, not Graph Model write, and
not production readiness. Results carry only `ok`, `issues`, and the requested read-only data; no
grant-like field exists anywhere in the harness surface.

## 11. What Is Not Implemented

No recorder summary runtime, no summary emitter, no audit runtime, no audit event emitter, no real
persistence, no durable storage, no repository, no production storage adapter, no database schema, no
D1 bindings, no D1 migrations, no D1 access, no SQL execution, no product runtime pipeline, no
Evidence Ledger append, no Graph Model write, no ApprovalStore integration, no P7.1 TSP wiring, no
external action execution, no Formal WorkUnit promotion, and no StartHub runtime. No `app/` file was
changed in this loop.

## 12. Validation Commands

```
node --experimental-strip-types tests/phase6RecorderAuditSummaryHarness.test.mts
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

## 13. Next Safe Loop

Any further recorder-summary-lane work (for example, a future summary linkage or emission gate)
requires a new explicit human Go and remains separately gated. StartHub runtime remains separately
gated. D1 read-only execution remains P6-I6 or later.
