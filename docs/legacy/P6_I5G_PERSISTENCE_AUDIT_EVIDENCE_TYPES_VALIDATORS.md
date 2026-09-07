# P6-I5G Persistence Audit Evidence Types and Validators

**Loop:** P6-I5G (persistence_audit_evidence_types_and_validators_loop / types-and-validators-only).
**Depends on:** P6-I5E in-memory test-only adapter, P6-I5F Persistence Audit Evidence Spec, and
P6-I5F Persistence Audit Event Contract (PR #99) — merged into `main`.

P6-I5G implements audit evidence types and validators only.
P6-I5G does not implement audit runtime.
P6-I5G does not implement audit event emitter.
P6-I5G does not implement real persistence.
P6-I5G does not implement durable storage.
P6-I5G does not implement repository behavior.
P6-I5G does not implement a production storage adapter.
P6-I5G does not implement a database schema.
P6-I5G does not add D1 bindings.
P6-I5G does not add D1 migrations.
P6-I5G does not access D1.
P6-I5G does not execute SQL.
P6-I5G does not implement product runtime pipeline.
P6-I5G does not append Evidence Ledger.
P6-I5G does not write Graph Model.
P6-I5G does not integrate ApprovalStore.
P6-I5G does not wire P7.1 TSP utilities.
P6-I5G does not execute external actions.
P6-I5G does not promote Formal WorkUnits.
Adapter target class is exactly in_memory_test_only_store.
Selected target class is exactly in_memory_test_only_store.
Audit evidence validation pass is not truth.
Audit evidence validation pass is not approval.
Audit evidence validation pass is not execution permission.
Audit evidence validation pass is not persistence.
Audit evidence validation pass is not durable storage.
Audit evidence validation pass is not Evidence Ledger append.
Audit evidence validation pass is not Graph Model write.
Audit evidence validation pass is not production readiness.

## 1. Purpose

P6-I5G encodes the P6-I5F Persistence Audit Event shape as inert TypeScript types and a pure,
fail-closed validator, so a future loop (P6-I5H pure constructors onward) has a pinned,
non-authorizing shape to build against. It implements no audit runtime and authorizes nothing.

## 2. Scope

In scope: TypeScript types and pure validators for one `PersistenceAuditEvent`, isolated under
`app/lib/phase6/persistenceAuditEvidence/`. Out of scope: audit runtime, audit event emitter,
persistence, durable storage, repository, production storage adapter, database schema, D1
bindings/migrations/access, SQL execution/mutation, product runtime pipeline, Evidence Ledger append,
Graph Model write, ApprovalStore integration, P7.1 TSP wiring, external action execution, and Formal
WorkUnit promotion.

## 3. Implemented Files

- `app/lib/phase6/persistenceAuditEvidence/types.ts` — inert types and value lists.
- `app/lib/phase6/persistenceAuditEvidence/validators.ts` — pure validators and type guards.
- `app/lib/phase6/persistenceAuditEvidence/index.ts` — re-exports types and validators only.
- `tests/phase6PersistenceAuditEvidenceValidators.test.mts` — isolated `node:test` suite.
- `docs/legacy/P6_I5G_EXPLICIT_HUMAN_GO.md` — durable human Go record.
- `docs/legacy/P6_I5G_PERSISTENCE_AUDIT_EVIDENCE_TYPES_VALIDATORS.md` — this document.

## 4. Audit Event Types

`types.ts` exports `PersistenceAuditEvent` and its component literal-union types
(`PersistenceAuditOperation`, `PersistenceAuditOperationStatus`, `PersistenceAuditOperationOutcome`,
`PersistenceAuditValidationResult`, `PersistenceAuditIdempotencyResult`,
`PersistenceAuditDuplicateResult`, `PersistenceAuditTenantScopeResult`,
`PersistenceAuditDefensiveSnapshotResult`, `PersistenceAuditNonDurabilityResult`,
`PersistenceAuditClearScope`, `PersistenceAuditRedactionResult`, `PersistenceAuditSourceLoop`,
`PersistenceAuditNoGoFlag`, `Sha256Hex`, `IsoTimestamp`). The event carries 30 fields and no
grant-like field.

## 5. Validator Contract

`validators.ts` exports `PersistenceAuditEventValidationIssue`,
`PersistenceAuditEventValidationResult`, `validatePersistenceAuditEvent`, and the type guards. The
result is `{ ok, issues }`; each issue carries `code`, `field`, and a `message` of exactly `code:field`
that never echoes input values. The validator accepts unknown input, never throws for normal invalid
input (a defensive catch maps unexpected failures to `validation_exception`), fails closed on
non-object/array/null input, takes a single-read snapshot of own enumerable top-level fields, rejects
unknown top-level fields, and never mutates its input.

## 6. Adapter Target Invariant

`adapter_target_class` must be exactly `in_memory_test_only_store`; any deferred or rejected class
(`local_ephemeral_dev_store`, `append_only_audit_candidate_store`,
`tenant_scoped_artifact_candidate_store`, `future_d1_store_after_separate_d1_gate`, `blocked_target`)
reports `invalid_adapter_target_class`.

## 7. Selected Target Invariant

`selected_target_class` must be exactly `in_memory_test_only_store`; any deferred or rejected class
reports `invalid_selected_target_class`. No other target class can validate as the adapter or selected
target.

## 8. Operation Validation

`operation` must be one of `put`, `get`, `list`, `count`, `clear_tenant`, `clear_all`. Operation-
specific shape rules apply: `put` requires an applicable validation result, `clear_scope` of `none`,
and `record_count` of 0 or 1; `get` requires `clear_scope` of `none` and `record_count` of 0 or 1;
`list`/`count` require `clear_scope` of `none`; `clear_tenant` requires `clear_scope` of
`tenant_only`; `clear_all` requires `clear_scope` of `all_test_memory` and, when the outcome is
`pass`, a non-durability result that positively confirms test-only non-durability. Violations report
`invalid_operation_specific_shape`.

## 9. Status and Outcome Validation

`operation_status` must be one of `attempted`, `accepted`, `rejected`, `not_found`, `cleared`,
`blocked_no_go`; `operation_outcome` must be one of `pass`, `warn`, `fail`, `no_go`. Invalid values
report `invalid_operation_status` / `invalid_operation_outcome`.

## 10. Validation Evidence Validation

`validation_result` must be one of `validator_passed`, `validator_failed`,
`validator_not_applicable`, `validator_not_run_no_go`. `validator_issue_codes`, `adapter_issue_codes`,
and `failure_reasons` must be arrays of stable code strings; a non-array reports `invalid_array`, a
non-string element reports `invalid_issue_code`. For `put`, `validation_result` must not be
`validator_not_applicable`.

## 11. Tenant Evidence Validation

`tenant_id` is a required scoped identifier. `tenant_scope_result` must be one of `tenant_scoped`,
`tenant_mismatch`, `cross_tenant_blocked`, `tenant_scope_not_applicable`, `tenant_scope_no_go`. When
`tenant_scope_result` is `tenant_mismatch` or `cross_tenant_blocked`, `operation_outcome` must be
`fail` or `no_go`, else `tenant_mismatch_not_fail_closed`.

## 12. Idempotency and Duplicate Validation

`idempotency_result` and `duplicate_result` must be one of `first_write`, `idempotent_duplicate`,
`duplicate_conflict`, `not_applicable`. When either is `duplicate_conflict`, `operation_outcome` must
be `fail` or `no_go`, else `duplicate_conflict_not_fail_closed`.

## 13. Clear/List/Count Validation

`clear_scope` must be one of `none`, `tenant_only`, `all_test_memory`; `record_count` must be a
non-negative safe integer, else `invalid_record_count`. `clear_tenant` records `tenant_only`;
`clear_all` records `all_test_memory` and remains test-only and non-durable.

## 14. Snapshot and Non-durability Validation

`defensive_snapshot_result` must be one of `frozen_snapshot_returned`, `defensive_clone_returned`,
`not_applicable`, `snapshot_no_go`. `non_durability_result` must be one of `in_memory_only`,
`not_durable`, `process_lifetime_only`, `durability_not_claimed`.

## 15. Redaction Validation

`redaction_result` must be one of `redacted`, `no_raw_payload`, `stable_codes_only`,
`redaction_not_applicable`, `redaction_no_go`. `redaction_no_go` is itself a No-Go: an event carrying
it never validates to `ok=true`, and the only fail-closed shape is `operation_outcome` of `no_go`;
otherwise `redaction_no_go_not_fail_closed`. Raw payload fields and secret-like echo fields on the
input are rejected with `raw_payload_field_present` / `secret_like_echo_field_present`, and issue
messages never echo input values.

## 16. No-Go Handling

`no_go_flags` must be an array of allowed No-Go flag literals, else `invalid_no_go_flag`. A non-empty
`no_go_flags` fails with `no_go_flags_present` unless `operation_status` is `blocked_no_go` or
`operation_outcome` is `no_go`.

## 17. Non-authorization Boundary

`non_authorization_statement` must be a string that includes "not approval", "not execution
permission", "not persistence", "not durable storage", and "not production readiness", else
`missing_non_authorization_statement`. The event carries no grant-like field; any of the forbidden
grant-like fields on the input reports `forbidden_grant_field_present`. A validation pass returns only
`{ ok, issues }`; it creates no approval, execution, persistence, durable storage, Evidence Ledger
append, Graph Model write, or promotion permission, and makes no evidence true.

## 18. What Is Not Implemented

No audit runtime, audit event emitter, real persistence, durable storage, repository, production
storage adapter, database schema, D1 binding/migration/access, SQL execution/mutation, product runtime
pipeline, Evidence Ledger append, Graph Model write, ApprovalStore integration, P7.1 TSP wiring,
external action execution, Formal WorkUnit promotion, real LLM, GraphRAG, vectorization, UI, Electron,
package dependency, workflow, or migration change. No app runtime file is wired to this module.

## 19. Validation Commands

- `node --experimental-strip-types tests/phase6PersistenceAuditEvidenceValidators.test.mts`
- `npm test`
- `npm run alpha:safety-gate`
- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run electron:build:check`

## 20. Next Safe Loop

P6-I5H pure persistence audit evidence constructors only. D1 read-only execution remains P6-I6 or
later behind a separate D1 persistence gate.
