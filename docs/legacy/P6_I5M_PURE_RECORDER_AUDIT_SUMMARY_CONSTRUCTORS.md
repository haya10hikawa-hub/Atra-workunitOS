# P6-I5M Pure Recorder Audit Summary Constructors

**Loop:** P6-I5M (pure_recorder_audit_summary_constructors_loop / pure-constructors-only).
**Depends on:** P6-I5K Recorder Audit Summary Spec and Contract (PR #105), P6-I5L Recorder Audit
Summary types and validators (PR #106) — merged into `main`.

P6-I5M implements pure recorder audit summary constructors only. P6-I5M does not implement recorder
summary runtime, summary emitter, audit runtime, audit event emitter, real persistence, durable
storage, repository behavior, a production storage adapter, a database schema, D1 bindings, D1
migrations, D1 access, SQL execution, product runtime pipeline, Evidence Ledger append, Graph Model
write, ApprovalStore integration, P7.1 TSP utility wiring, external action execution, Formal WorkUnit
promotion, or StartHub runtime.

## 1. Purpose

This document specifies the pure, deterministic, non-authorizing constructors added in P6-I5M that
build P6-I5L `RecorderAuditSummaryRecord` objects from caller-provided inputs and validate them
through the P6-I5L validators. Constructors describe; they implement no runtime and authorize nothing.

## 2. Scope

In scope: construction result helpers (`construction.ts`) and six pure constructors
(`constructors.ts`) under `app/lib/phase6/recorderAuditSummary/`, plus the bounded index re-export.
Out of scope: recorder summary runtime, summary emitter, audit runtime, audit event emitter, real
persistence, durable storage, repository, production storage adapter, database schema, D1
bindings/migrations/access, SQL execution/mutation, product runtime pipeline, Evidence Ledger append,
Graph Model write, ApprovalStore integration, P7.1 TSP wiring, external action execution, Formal
WorkUnit promotion, and StartHub runtime.

## 3. Implemented Files

- `app/lib/phase6/recorderAuditSummary/construction.ts` — construction result types and helpers.
- `app/lib/phase6/recorderAuditSummary/constructors.ts` — six pure constructors.
- `app/lib/phase6/recorderAuditSummary/index.ts` — bounded modification: re-exports the two new
  modules alongside the existing types and validators.
- `tests/phase6RecorderAuditSummaryConstructors.test.mts` — isolated tests over the module public
  surface.
- `docs/legacy/P6_I5M_EXPLICIT_HUMAN_GO.md` — durable human Go record, created before any code.
- `docs/legacy/P6_I5M_PURE_RECORDER_AUDIT_SUMMARY_CONSTRUCTORS.md` — this document.

## 4. Constructor Contract

Every constructor accepts only explicit caller-provided input, takes a single-read snapshot of the
input's own enumerable top-level properties, never mutates the input, never throws for normal invalid
input (a defensive catch maps unexpected failures to `constructor_exception`), performs no I/O, fixes
both target class fields to `in_memory_test_only_store`, validates the produced record with
`validateRecorderAuditSummaryRecord`, and returns `ok: true` only when validation passes.

## 5. Construction Result Contract

`RecorderAuditSummaryConstructionResult` is a discriminated union. Success:
`{ ok: true, record: RecorderAuditSummaryRecord, issues: readonly [] }`. Failure:
`{ ok: false, record?: never, issues: readonly RecorderAuditSummaryConstructorIssue[] }`. Each issue
is `{ code, field, message }` with stable codes `validation_failed`, `invalid_constructor_input`, and
`constructor_exception`; `message` is always `code:field` and never echoes an input value. The result
carries no grant-like field (`approval`, `approved`, `authorized`, `execution_permission`, `executed`,
`promotion_permission`, `promoted`, `persistence_permission`, `persisted`, `storage_permission`,
`stored`, `durable_storage_permission`, `evidence_ledger_append_permission`, `graph_write_permission`,
`external_action_permission`, `formal_workunit_promotion`, `approvalstore_approval`,
`summary_runtime_permission`, `summary_emission_permission`, `audit_runtime_permission`,
`audit_emission_permission`, `starthub_execution_permission`).

## 6. Generic Constructor

`createRecorderAuditSummaryRecord(input: CreateRecorderAuditSummaryRecordInput)` requires every
caller-provided field of the P6-I5L record shape except the two target class fields (which the
constructor fixes): `summary_id`, `tenant_id`, `summary_scope`, `summarized_operation_names`, the 14
scalar counts (`total_record_attempts` through `recorder_exception_count`), the six count maps
(`operation_counts`, `status_counts`, `outcome_counts`, `validation_result_counts`,
`issue_code_counts`, `no_go_flag_counts`), `fixture_coverage`, the seven descriptive summary strings,
the four source lineage fields, `created_at`, `payload_hash`, `non_authorization_statement`, and
`no_go_flags`. Output is validated through the P6-I5L validators.

## 7. Tenant Summary Constructor

`createTenantRecorderAuditSummary` forces `summary_scope: "tenant"`. `tenant_id` and
`summarized_operation_names` must be caller-provided non-empty values (enforced by the P6-I5L
validators on the constructed record). Output is validated.

## 8. All-test-memory Summary Constructor

`createAllTestMemoryRecorderAuditSummary` forces `summary_scope: "all_test_memory"` and fails closed
with `invalid_constructor_input` unless `clear_scope_summary` contains `all_test_memory` and
`non_durability_summary` contains `test-only` or `non-durable` wording. The summary scope value
itself explicitly states the all-test-memory scope; callers summarizing `clearAllAuditEvents` include
it in `summarized_operation_names`. Output is validated.

## 9. Operation-subset Summary Constructor

`createOperationSubsetRecorderAuditSummary` forces `summary_scope: "operation_subset"`.
`summarized_operation_names` must be a caller-provided non-empty subset of the six recorder operation
names (enforced by the P6-I5L validators). Output is validated.

## 10. Fixture-suite Summary Constructor

`createFixtureSuiteRecorderAuditSummary` forces `summary_scope: "fixture_suite"`. The P6-I5L
validators require `fixture_coverage.all_required_fixtures_covered` to be `true` and all seven
per-operation fixture coverage booleans to be `true` for this scope, so incomplete coverage yields a
`validation_failed` failure. Output is validated.

## 11. Blocked Summary Constructor

`createBlockedRecorderAuditSummary` fails closed with `invalid_constructor_input` unless
`no_go_flags` is a non-empty array and either `status_counts.blocked_no_go > 0` or
`outcome_counts.no_go > 0`. It preserves caller-provided failure and issue counts and validates the
output, so the P6-I5L no-go policy also applies.

## 12. Caller-provided Identity and Time

Constructors use caller-provided `summary_id`, `tenant_id`, `created_at`, and `payload_hash` exactly.
Constructors do not call Date.now. Constructors do not call new Date. Constructors do not call
crypto.randomUUID. Constructors do not call randomUUID. Constructors do not call Math.random.
Constructors generate no identifiers, read no clock, and read no randomness; identical input produces
deep-equal output.

## 13. Recorder and Selected Target Invariants

Recorder target class is exactly `in_memory_test_only_store`. Selected target class is exactly
`in_memory_test_only_store`. Both fields are overlaid by the constructor after the input snapshot, so
any caller attempt to override `recorder_target_class` or `selected_target_class` — including with
`local_ephemeral_dev_store`, `append_only_audit_candidate_store`,
`tenant_scoped_artifact_candidate_store`, `future_d1_store_after_separate_d1_gate`, or
`blocked_target` — is ignored; no record can be constructed with any other target class.

## 14. Validation After Construction

Every constructor validates its produced record with `validateRecorderAuditSummaryRecord` before
returning. Validation failure maps each validator issue to a `validation_failed` constructor issue
(field preserved, values never echoed) and returns `ok: false` with no `record` field. Constructors
validate output through P6-I5L validators; construction can never bypass them.

## 15. Purity Requirements

Constructors are pure: no network, no filesystem, no environment access, no child process, no
database, no query-language execution, no model calls, no approval-store, no external action, no
clock, no randomness, no global mutation. Known container fields (arrays and count maps) are
defensively shallow-copied so the frozen output record never shares mutable references with caller
input. Static source guards in the test file assert the three source files contain none of the
forbidden capability substrings (including the clock/randomness call names listed in section 12).

## 16. Count and Coverage Handling

All 14 scalar counts, the six count maps, and `fixture_coverage` are caller-provided and preserved
exactly (via defensive copies). The P6-I5L validators enforce non-negative safe integers, exact key
sets, count consistency (e.g. `total_record_attempts >= accepted_record_count +
rejected_record_count`, `operation_counts.record >= total_record_attempts`), and the fail-closed
rules: `duplicate_conflict_count`, `tenant_mismatch_count`, `validation_failed_count`, and
`forbidden_target_class_count` greater than zero each require `outcome_counts.fail > 0` or
`outcome_counts.no_go > 0`, so a constructor can never return `ok: true` for a summary that treats
those failures as success.

## 17. No-Go Handling

A non-empty `no_go_flags` array validates only with `status_counts.blocked_no_go > 0` or
`outcome_counts.no_go > 0` (P6-I5L `no_go_flags_present` rule). The blocked constructor additionally
requires both the non-empty flags and the blocked/no-go evidence up front, preserving the caller's
no-go flags in the constructed record.

## 18. Non-authorization Boundary

Constructor success is descriptive and non-authorizing. Constructor success is not truth. Constructor
success is not approval. Constructor success is not execution permission. Constructor success is not
summary runtime. Constructor success is not summary emission. Constructor success is not audit
runtime. Constructor success is not audit event emission. Constructor success is not persistence.
Constructor success is not durable storage. Constructor success is not Evidence Ledger append.
Constructor success is not Graph Model write. Constructor success is not production readiness. The
construction result and the constructed record carry no grant-like fields, and the required
`non_authorization_statement` phrases are enforced by the P6-I5L validators.

## 19. What Is Not Implemented

No recorder summary runtime, no summary emitter, no audit runtime, no audit event emitter, no real
persistence, no durable storage, no repository, no production storage adapter, no database schema, no
D1 bindings, no D1 migrations, no D1 access, no SQL execution, no product runtime pipeline, no
Evidence Ledger append, no Graph Model write, no ApprovalStore integration, no P7.1 TSP wiring, no
external action execution, no Formal WorkUnit promotion, and no StartHub runtime.

## 20. Validation Commands

```
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

## 21. Next Safe Loop

P6-I5N test-only recorder audit summary fixture (deterministic fixture data over the P6-I5M
constructors, still no runtime, no emitter, no persistence, no D1, no SQL, no Evidence Ledger append,
no Graph Model write). StartHub runtime remains separately gated. D1 read-only execution remains
P6-I6 or later.
