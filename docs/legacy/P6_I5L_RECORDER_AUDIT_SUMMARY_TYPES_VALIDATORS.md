# P6-I5L Recorder Audit Summary Types and Validators

**Loop:** P6-I5L (recorder_audit_summary_types_validators_loop / types-and-validators-only).
**Depends on:** P6-I5J in-memory test-only Persistence Audit Evidence recorder (PR #103), P6-I5K
Recorder Audit Summary Spec and Recorder Audit Summary Contract (PR #105) — merged into `main`.

P6-I5L implements recorder audit summary types and validators only. P6-I5L does not implement recorder
summary runtime, summary emitter, audit runtime, audit event emitter, real persistence, durable
storage, repository behavior, a production storage adapter, a database schema, D1 bindings, D1
migrations, D1 access, SQL execution, product runtime pipeline, Evidence Ledger append, Graph Model
write, ApprovalStore integration, P7.1 TSP utility wiring, external action execution, Formal WorkUnit
promotion, or StartHub runtime.

## 1. Purpose

This document specifies the TypeScript types and pure, fail-closed validators added in P6-I5L for the
Recorder Audit Summary Record shape defined by P6-I5K. It pins a non-authorizing structure and a
non-authorizing validation function; it implements no runtime and authorizes nothing.

## 2. Scope

In scope: `RecorderAuditSummaryRecord` and its constituent literal-union types, and
`validateRecorderAuditSummaryRecord` plus its exported type guards, under
`app/lib/phase6/recorderAuditSummary/`. Out of scope: recorder summary runtime, summary emitter, audit
runtime, audit event emitter, real persistence, durable storage, repository, production storage
adapter, database schema, D1 bindings/migrations/access, SQL execution/mutation, product runtime
pipeline, Evidence Ledger append, Graph Model write, ApprovalStore integration, P7.1 TSP wiring,
external action execution, Formal WorkUnit promotion, and StartHub runtime.

## 3. Implemented Files

- `app/lib/phase6/recorderAuditSummary/types.ts` — inert types and literal-union value lists.
- `app/lib/phase6/recorderAuditSummary/validators.ts` — pure, fail-closed validators and type guards.
- `app/lib/phase6/recorderAuditSummary/index.ts` — re-exports of the two modules above only.
- `tests/phase6RecorderAuditSummaryValidators.test.mts` — isolated tests over the module public surface.
- `docs/legacy/P6_I5L_EXPLICIT_HUMAN_GO.md` — durable human Go record, created before any code.
- `docs/legacy/P6_I5L_RECORDER_AUDIT_SUMMARY_TYPES_VALIDATORS.md` — this document.

## 4. Summary Record Types

`RecorderAuditSummaryRecord` carries exactly the 42 fields required by the P6-I5K contract: identity
(`summary_id`, `tenant_id`), target class (`recorder_target_class`, `selected_target_class`), scope
(`summary_scope`, `summarized_operation_names`), count aggregates (`total_record_attempts` through
`recorder_exception_count`), count maps (`operation_counts`, `status_counts`, `outcome_counts`,
`validation_result_counts`, `issue_code_counts`, `no_go_flag_counts`), `fixture_coverage`, descriptive
summary fields (`tenant_scope_summary`, `deterministic_ordering_summary`, `defensive_snapshot_summary`,
`non_durability_summary`, `clear_scope_summary`, `failure_summary`, `redaction_summary`), source lineage
(`source_loop`, `source_recorder_loop`, `source_fixture_loop`, `source_validator_loop`), and
`created_at`, `payload_hash`, `non_authorization_statement`, `no_go_flags`. The type carries no
grant-like field (`approval`, `approved`, `authorized`, `execution_permission`, `executed`,
`promotion_permission`, `promoted`, `persistence_permission`, `persisted`, `storage_permission`,
`stored`, `durable_storage_permission`, `evidence_ledger_append_permission`, `graph_write_permission`,
`external_action_permission`, `formal_workunit_promotion`, `approvalstore_approval`,
`summary_runtime_permission`, `audit_emission_permission`, `starthub_execution_permission`).

## 5. Validator Contract

`validateRecorderAuditSummaryRecord(input: unknown): RecorderAuditSummaryValidationResult` accepts
unknown input, never throws for normal invalid input (a defensive catch maps unexpected failures to
`validation_exception`), never mutates its input, performs no I/O, and returns only `{ ok, issues }`.
Every `RecorderAuditSummaryValidationIssue` is `{ code, field, message }` where `message` is always
`${code}:${field}` and never echoes an input value.

## 6. Recorder Target Invariant

`recorder_target_class` must be exactly `in_memory_test_only_store`. Any of the deferred target
classes (`local_ephemeral_dev_store`, `append_only_audit_candidate_store`,
`tenant_scoped_artifact_candidate_store`, `future_d1_store_after_separate_d1_gate`) or the rejected
target class (`blocked_target`) fails with `invalid_recorder_target_class`.

## 7. Selected Target Invariant

`selected_target_class` must be exactly `in_memory_test_only_store`. The same deferred and rejected
target classes fail with `invalid_selected_target_class`. No other target class can validate as either
field.

## 8. Summary Scope Validation

`summary_scope` must be one of `tenant`, `all_test_memory`, `operation_subset`, `fixture_suite`
(`invalid_summary_scope` otherwise). Scope-specific rules: for `tenant`, `clear_scope_summary` may not
claim `all_test_memory` unless `clearAllAuditEvents` is among `summarized_operation_names`
(`invalid_count_consistency`); for `fixture_suite`, all `fixture_coverage` fields including
`all_required_fixtures_covered` must be `true` (`fixture_suite_incomplete` otherwise).

## 9. Recorder Operation Validation

`summarized_operation_names` must be a non-empty array whose elements are each one of
`recordAuditEvent`, `getAuditEvent`, `listAuditEvents`, `countAuditEvents`, `clearTenantAuditEvents`,
`clearAllAuditEvents` (`invalid_array` / `invalid_operation_name`).

## 10. Count Field Validation

All 14 scalar count fields (`total_record_attempts` through `recorder_exception_count`) must be
non-negative safe integers (`invalid_count` otherwise).

## 11. Operation / Status / Outcome Count Validation

`operation_counts`, `status_counts`, and `outcome_counts` must each be objects containing exactly their
required keys (`record`/`get`/`list`/`count`/`clear_tenant`/`clear_all`;
`attempted`/`accepted`/`rejected`/`not_found`/`cleared`/`blocked_no_go`; `pass`/`warn`/`fail`/`no_go`)
with non-negative safe integer values. Missing keys fail with `missing_count_key`; unrecognized keys
fail with both the generic `unknown_count_key` and the map-specific code (`invalid_operation_count_key`,
`invalid_status_count_key`, `invalid_outcome_count_key`); non-integer/negative values fail with
`invalid_count`; a non-object map fails with `invalid_count_map`.

## 12. Validation Result Count Validation

`validation_result_counts` must contain exactly `validator_passed`, `validator_failed`,
`validator_not_applicable`, `validator_not_run_no_go`, following the same missing/unknown/invalid-value
rules as section 11, with `invalid_validation_result_count_key` for unrecognized keys.

## 13. Issue and No-Go Count Validation

`issue_code_counts` must contain exactly the stable issue codes (`invalid_input`, `invalid_event`,
`validation_failed`, `tenant_mismatch`, `duplicate_conflict`, `forbidden_target_class`,
`recorder_exception`, `blocked_no_go`), with `invalid_issue_code` for unrecognized keys.
`no_go_flag_counts` must contain exactly the known no-go flag keys, with `invalid_no_go_flag` for
unrecognized keys.

## 14. Fixture Coverage Validation

`fixture_coverage` must be an object with exactly the eight boolean fields `put_fixture_covered`,
`get_fixture_covered`, `list_fixture_covered`, `count_fixture_covered`,
`clear_tenant_fixture_covered`, `clear_all_fixture_covered`, `blocked_no_go_fixture_covered`,
`all_required_fixtures_covered`. Any missing key, unknown key, non-boolean value, or non-object map
fails with `invalid_fixture_coverage`.

## 15. Tenant and Ordering Validation

`tenant_id` is a required non-empty string for every summary scope. `tenant_scope_summary` and
`deterministic_ordering_summary` are required descriptive strings; their content is not further
constrained beyond non-emptiness, since they carry no authorization weight.

## 16. Defensive Snapshot and Non-durability Validation

`defensive_snapshot_summary` and `non_durability_summary` are required descriptive strings. When
`operation_counts.clear_all > 0`, `non_durability_summary` must include `test-only` or `non-durable`
wording (see section 17), and none of the seven scanned summary fields may contain a phrase that claims
summary runtime, audit event emission, persistence, durable storage, Evidence Ledger append, or Graph
Model write occurred (`summary_runtime_claimed`, `audit_event_emission_claimed`, `persistence_claimed`,
`durable_storage_claimed`, `ledger_append_claimed`, `graph_write_claimed`).

## 17. Clear and Failure Validation

When `operation_counts.clear_all > 0`, `clear_scope_summary` must mention `all_test_memory` and
`non_durability_summary` must mention `test-only` or `non-durable` wording, or the record fails with
`clear_all_treated_as_production_capability`. Count-consistency rules fail closed: `duplicate_conflict`,
`tenant_mismatch`, `validation_failed`, and `forbidden_target_class` counts must each be `<=
rejected_record_count`, and each must force `outcome_counts.fail > 0` or `outcome_counts.no_go > 0`
when greater than zero (`duplicate_conflict_not_fail_closed` for the duplicate case,
`invalid_count_consistency` for the other three and for all remaining count relationships, e.g.
`total_record_attempts >= accepted_record_count + rejected_record_count`,
`operation_counts.record >= total_record_attempts`, `status_counts.accepted >= accepted_record_count`,
`not_found_count <= returned_event_count + status_counts.not_found`).

## 18. Privacy and Redaction Validation

`redaction_summary` is a required descriptive string. If it claims that raw event payload echo or
secret-like value echo is allowed, the record fails with `raw_event_payload_field_present` or
`secret_like_echo_field_present` respectively. Any top-level field named after a known raw-payload
field (`raw_payload`, `payload`, `record`, `raw_event_payload`, etc.) or secret-like field (`secret`,
`token`, `api_key`, `password`, etc.) fails the same way regardless of scope.

## 19. No-Go Handling

`no_go_flags` must be an array of known `RecorderAuditNoGoFlag` literals (`invalid_no_go_flag`
otherwise). A non-empty `no_go_flags` array is only valid when `status_counts.blocked_no_go > 0` or
`outcome_counts.no_go > 0`; otherwise the record fails with `no_go_flags_present`.

The relationship is intentionally one-way. The implemented validator deliberately
enforces only the forward implication:

- Non-empty no_go_flags requires blocked/no-go evidence (`no_go_flags_present`
  otherwise).
- Blocked/no-go evidence does not require non-empty no_go_flags.

The absence of a reverse rule is a deliberate design decision, not an omitted
validator check. Aggregate blocked/no-go evidence (`status_counts.blocked_no_go`
and `outcome_counts.no_go`) is descriptive evidence about the summarized recorder
operations; `no_go_flags` is the explicit set of No-Go reasons asserted on the
summary record itself. A summary with `no_go_flags: []`, `blocked_no_go > 0`, and
`no_go > 0` is valid when every other rule passes.

The validator must not infer or synthesize `no_go_flags` from aggregate counts,
and it must not promote aggregate evidence into a current record-level No-Go
assertion. Validation success remains non-authorizing: it is not approval, not
authorization, and not execution permission.

## 20. Non-authorization Boundary

`non_authorization_statement` is a required string that must include the phrases "not approval", "not
execution permission", "not summary runtime", "not audit runtime", "not audit event emission", "not
persistence", "not durable storage", "not Evidence Ledger append", "not Graph Model write", and "not
production readiness" (`invalid_non_authorization_statement` otherwise). Any top-level grant-like field
(`approval`, `approved`, `executed`, `persisted`, `evidence_ledger_append_permission`,
`graph_write_permission`, `starthub_execution_permission`, etc.) fails with
`forbidden_grant_field_present`. A validation pass never creates approval, execution permission,
summary runtime, audit runtime, audit event emission, persistence, durable storage, Evidence Ledger
append, Graph Model write, or production readiness — it only reports `{ ok, issues }`.

## 21. What Is Not Implemented

No recorder summary runtime, no summary emitter, no audit runtime, no audit event emitter, no real
persistence, no durable storage, no repository, no production storage adapter, no database schema, no
D1 bindings, no D1 migrations, no D1 access, no SQL execution, no product runtime pipeline, no Evidence
Ledger append, no Graph Model write, no ApprovalStore integration, no P7.1 TSP wiring, no external
action execution, no Formal WorkUnit promotion, and no StartHub runtime. Recorder target class is
exactly `in_memory_test_only_store`. Selected target class is exactly `in_memory_test_only_store`.
Recorder audit summary validation pass is not truth, not approval, not execution permission, not
summary runtime, not audit runtime, not audit event emission, not persistence, not durable storage, not
Evidence Ledger append, not Graph Model write, and not production readiness.

## 22. Validation Commands

```
node --experimental-strip-types tests/phase6RecorderAuditSummaryValidators.test.mts
node --experimental-strip-types tests/phase6RecorderAuditSummarySpec.test.mts
npm test
npm run alpha:safety-gate
npm run lint
npm run build
npm run cf:build
npm run electron:build:check
```

## 23. Next Safe Loop

P6-I5M pure recorder audit summary constructors (construction helpers over the P6-I5L types, still no
runtime, no emitter, no persistence, no D1, no SQL, no Evidence Ledger append, no Graph Model write).
StartHub runtime remains separately gated. D1 read-only execution remains P6-I6 or later.
