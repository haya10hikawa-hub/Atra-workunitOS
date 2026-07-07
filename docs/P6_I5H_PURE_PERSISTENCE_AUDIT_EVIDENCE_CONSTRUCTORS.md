# P6-I5H Pure Persistence Audit Evidence Constructors

**Loop:** P6-I5H (pure_persistence_audit_evidence_constructors_loop / pure-constructors-only).
**Depends on:** P6-I5F Persistence Audit Evidence Spec and P6-I5G Persistence Audit Evidence types and
validators (PR #100) — merged into `main`.

P6-I5H implements pure audit evidence constructors only.
P6-I5H does not implement audit runtime.
P6-I5H does not implement audit event emitter.
P6-I5H does not implement real persistence.
P6-I5H does not implement durable storage.
P6-I5H does not implement repository behavior.
P6-I5H does not implement a production storage adapter.
P6-I5H does not implement a database schema.
P6-I5H does not add D1 bindings.
P6-I5H does not add D1 migrations.
P6-I5H does not access D1.
P6-I5H does not execute SQL.
P6-I5H does not implement product runtime pipeline.
P6-I5H does not append Evidence Ledger.
P6-I5H does not write Graph Model.
P6-I5H does not integrate ApprovalStore.
P6-I5H does not wire P7.1 TSP utilities.
P6-I5H does not execute external actions.
P6-I5H does not promote Formal WorkUnits.
Adapter target class is exactly in_memory_test_only_store.
Selected target class is exactly in_memory_test_only_store.
Constructors use caller-provided audit_event_id.
Constructors use caller-provided tenant_id.
Constructors use caller-provided target_decision_record_id.
Constructors use caller-provided created_at.
Constructors use caller-provided payload_hash.
Constructors do not call Date.now.
Constructors do not call new Date.
Constructors do not call randomUUID.
Constructors do not call Math.random.
Constructor success is not truth.
Constructor success is not approval.
Constructor success is not execution permission.
Constructor success is not audit runtime.
Constructor success is not audit event emission.
Constructor success is not persistence.
Constructor success is not durable storage.
Constructor success is not Evidence Ledger append.
Constructor success is not Graph Model write.
Constructor success is not production readiness.

## 1. Purpose

P6-I5H adds pure, deterministic constructors that build a P6-I5G `PersistenceAuditEvent` for the fixed
adapter and selected target class and validate it with the P6-I5G validator. It gives future loops
(P6-I5I test-only fixture onward) a safe way to obtain a valid audit event without any audit runtime,
and it authorizes nothing.

## 2. Scope

In scope: pure constructors and a construction-result helper, isolated under
`app/lib/phase6/persistenceAuditEvidence/`, plus a bounded modification to that module's `index.ts`
re-export. Out of scope: audit runtime, audit event emitter, real persistence, durable storage,
repository, production storage adapter, database schema, D1 bindings/migrations/access, SQL
execution/mutation, product runtime pipeline, Evidence Ledger append, Graph Model write, ApprovalStore
integration, P7.1 TSP wiring, external action execution, and Formal WorkUnit promotion.

## 3. Implemented Files

- `app/lib/phase6/persistenceAuditEvidence/construction.ts` — construction result types and helpers.
- `app/lib/phase6/persistenceAuditEvidence/constructors.ts` — pure constructors.
- `app/lib/phase6/persistenceAuditEvidence/index.ts` — re-export updated to expose the above.
- `tests/phase6PersistenceAuditEvidenceConstructors.test.mts` — isolated `node:test` suite.
- `docs/P6_I5H_EXPLICIT_HUMAN_GO.md` — durable human Go record.
- `docs/P6_I5H_PURE_PERSISTENCE_AUDIT_EVIDENCE_CONSTRUCTORS.md` — this document.

## 4. Constructor Contract

Every constructor accepts explicit caller input, fixes `adapter_target_class` and
`selected_target_class` to `in_memory_test_only_store` (any caller override is ignored), validates the
produced event with `validatePersistenceAuditEvent`, and returns an ok result only when validation
passes. Constructors are pure: they read no clock and no randomness, perform no I/O, and never mutate
their input.

## 5. Construction Result Contract

`construction.ts` exports `PersistenceAuditEventConstructorIssue`,
`PersistenceAuditEventConstructionResult`, `okPersistenceAuditEventConstruction`, and
`failPersistenceAuditEventConstruction`. The result is a discriminated union: success is
`{ ok: true, event, issues: [] }`; failure is `{ ok: false, issues }` with `event?: never`. Stable
issue codes are `validation_failed`, `invalid_constructor_input`, and `constructor_exception`. Issue
messages are `code:field` only and never echo input values. The result carries no grant-like field.

## 6. Generic Constructor

`createPersistenceAuditEvent` builds an event from a caller-provided operation and all caller-provided
evidence fields, fixes the two target class fields, validates the result, and returns ok only on a
validation pass.

## 7. Operation-specific Constructors

`createPutPersistenceAuditEvent` fixes `operation` to `put` and `clear_scope` to `none` (record_count
must be 0 or 1 and validation_result must not be `validator_not_applicable`).
`createGetPersistenceAuditEvent` fixes `operation` to `get` and `clear_scope` to `none` (record_count
0 or 1; validation_result may be `validator_not_applicable`). `createListPersistenceAuditEvent` and
`createCountPersistenceAuditEvent` fix `operation` to `list`/`count` and `clear_scope` to `none`
(record_count non-negative). `createClearTenantPersistenceAuditEvent` fixes `operation` to
`clear_tenant` and `clear_scope` to `tenant_only`. `createClearAllPersistenceAuditEvent` fixes
`operation` to `clear_all` and `clear_scope` to `all_test_memory` and preserves the caller-provided
non-durability evidence. Each validates its output through the P6-I5G validator.

## 8. Blocked Constructor

`createBlockedPersistenceAuditEvent` fixes `operation_status` to `blocked_no_go` and
`operation_outcome` to `no_go`, requires a non-empty `no_go_flags` array (empty or missing fails with
`invalid_constructor_input`), preserves the caller-provided failure reasons, and validates its output.

## 9. Caller-provided Identity and Time

Every constructor uses caller-provided `audit_event_id`, `tenant_id`, `target_decision_record_id`,
`created_at`, `payload_hash`, `non_authorization_statement`, and the source lineage fields. The
constructors generate no identifiers, read no clock, and read no randomness; they never call
`Date.now`, `new Date`, `randomUUID`, or `Math.random`.

## 10. Adapter and Selected Target Invariants

Every produced event has `adapter_target_class` and `selected_target_class` equal to
`in_memory_test_only_store`. No constructor produces an event whose adapter or selected target is any
deferred class (`local_ephemeral_dev_store`, `append_only_audit_candidate_store`,
`tenant_scoped_artifact_candidate_store`, `future_d1_store_after_separate_d1_gate`) or the rejected
class (`blocked_target`). An attempted target override in the input is not honored; the fixed values
always win.

## 11. Validation After Construction

Every constructor validates its produced event with the P6-I5G `validatePersistenceAuditEvent` and
returns success only when validation passes. On validation failure the constructor returns a failure
result whose issues are reported under the stable `validation_failed` code. Genuinely-unknown caller
keys (typos, grant-like fields, raw payload fields, secret-like fields) flow through to the validator
and fail closed there.

## 12. Purity Requirements

The constructors are pure and deterministic: identical input yields deep-equal output. They take a
single-read snapshot of the input, never mutate the input, read no clock and no randomness, perform no
I/O of any kind, and import only the sibling `./types.ts`, `./validators.ts`, and `./construction.ts`
modules. Static source guards assert the constructor sources contain none of the forbidden runtime
capability tokens (clock, randomness, filesystem, network, child process, environment, database
access, query-language execution, approval-store, external action, Evidence Ledger append, Graph
Model write, or audit emitter tokens).

## 13. No-Go Handling

Only `createBlockedPersistenceAuditEvent` produces an event carrying a non-empty `no_go_flags` array,
and only with `operation_status` equal to `blocked_no_go` and `operation_outcome` equal to `no_go`.
Other constructors that carry non-empty `no_go_flags` without a blocked status or no_go outcome fail
closed through the P6-I5G validator.

## 14. Non-authorization Boundary

Construction success returns only `{ ok, event, issues }`; it creates no approval, execution, audit
runtime, audit event emission, persistence, durable storage, Evidence Ledger append, Graph Model
write, or promotion permission, and it makes no evidence true. The event and the result carry no
grant-like field, and grant-like, raw payload, or secret-like input keys fail closed through the
validator.

## 15. What Is Not Implemented

No audit runtime, audit event emitter, real persistence, durable storage, repository, production
storage adapter, database schema, D1 binding/migration/access, SQL execution/mutation, product runtime
pipeline, Evidence Ledger append, Graph Model write, ApprovalStore integration, P7.1 TSP wiring,
external action execution, Formal WorkUnit promotion, real LLM, GraphRAG, vectorization, UI, Electron,
package dependency, workflow, or migration change. No app runtime file is wired to this module beyond
its own bounded `index.ts` re-export.

## 16. Validation Commands

- `node --experimental-strip-types tests/phase6PersistenceAuditEvidenceConstructors.test.mts`
- `npm test`
- `npm run alpha:safety-gate`
- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run electron:build:check`

## 17. Next Safe Loop

P6-I5I test-only persistence audit evidence fixture. D1 read-only execution remains P6-I6 or later
behind a separate D1 persistence gate.
