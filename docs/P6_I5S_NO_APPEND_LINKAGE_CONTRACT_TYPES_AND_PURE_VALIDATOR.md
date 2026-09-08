# P6-I5S No-Append Linkage Contract Types and Pure Validator

**Loop:** P6-I5S (types + pure validator only).
**Depends on:** P6-I5K (PR #105), P6-I5L (PR #106), P6-I5M (PR #107), P6-I5N (PR #108), P6-I5O
(PR #109), P6-I5P (PR #110), P6-I5Q (PR #111), P6-I5R (PR #112) — merged into `main`.

P6-I5S implements the P6-I5R static contract and no-append validator specification as inert code with
no runtime consumer. It appends nothing to the Evidence Ledger, writes no Graph Model, implements no
runtime linkage, no summary emitter, no audit runtime, no persistence, no durable storage, no
repository, no production adapter, no database schema, no D1/SQL, no ApprovalStore integration, no
P7.1 TSP wiring, no StartHub runtime, no external action, and no Formal WorkUnit promotion.

## 1. Purpose

This document describes the inert contract types and the pure, fail-closed no-append validator added
in P6-I5S for a future Recorder Audit Summary to Evidence Ledger linkage candidate. The validator
validates only; it authorizes nothing and appends nothing. `ok: true` is descriptive only.

## 2. Scope

In scope: inert `LinkageCandidate` contract types, the field-name lists, the validation result shape,
and the pure `validateLinkageCandidate` function, plus a narrow index and an isolated behavioral +
source-guard test. Out of scope: Evidence Ledger append/writer/runtime, Graph Model write, runtime
linkage, summary emitter, audit runtime, persistence, durable storage, repository, production adapter,
database schema, D1/SQL, ApprovalStore integration, P7.1 TSP wiring, StartHub runtime, external action
execution, and Formal WorkUnit promotion. No existing `recorderAuditSummary` file, no P6-I5K..P6-I5R
artifact, no `tests/fixtures/`, no `tests/harness/`, no `docs/ALPHA_EVIDENCE_LEDGER.md`, and no
`docs/archive/v0/GRAPH_MODEL.md` change.

## 3. Implemented Files

- `app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/types.ts` — inert contract types and lists.
- `app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/validators.ts` — pure no-append validator.
- `app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/index.ts` — narrow re-export surface.
- `tests/phase6RecorderAuditSummaryEvidenceLedgerNoAppendValidator.test.mts` — isolated tests.
- `docs/P6_I5S_EXPLICIT_HUMAN_GO.md` — durable human Go record, created before code.
- `docs/P6_I5S_NO_APPEND_LINKAGE_CONTRACT_TYPES_AND_PURE_VALIDATOR.md` — this document.

## 4. Selected Module Path and Rationale

The new module lives at `app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/`, a new sibling
alongside the existing Phase 6 concern directories (`artifacts`, `persistenceAuditEvidence`,
`persistenceTargetDecision`, `recorderAuditSummary`). A new directory keeps the linkage contract
isolated from the existing `recorderAuditSummary` module, which must not be modified. The validator
imports only inert sibling helpers (`isRecorderAuditSummaryScope`, `isSha256Hex`, `isIsoTimestamp`)
from the P6-I5L module and the inert types from `./types.ts`.

## 5. Contract Type Surface

`LinkageCandidate` is a `readonly` object type carrying stable identifiers, source lineage, a reference
purpose, a non-authorization statement, and the three fixed flag fields. `LinkageValidationIssue` is
`{ code, field, message }` with `message` always `${code}:${field}`. `LinkageValidationResult` is
`{ ok, issues }` — descriptive only, with no authorization/append/execution field. The module also
exports the field-name lists (`LINKAGE_CANDIDATE_REQUIRED_FIELDS`,
`LINKAGE_CANDIDATE_LINEAGE_VARIANT_FIELDS`, `LINKAGE_CANDIDATE_ALLOWED_FIELDS`, the three forbidden
sets) and `LINKAGE_VALIDATION_ISSUE_CODES`.

## 6. Required and Forbidden Fields

Required (P6-I5R §8): `summary_id`, `payload_hash`, `tenant_id`, `summary_scope`, `created_at`,
`source_loop`, `source_recorder_loop`, `source_validator_loop`, at least one of `source_fixture_loop`
or `source_harness_loop`, `non_authorization_statement`, `evidence_ledger_reference_purpose`,
`human_review_required` (`true`), `append_allowed` (`false`), `graph_write_allowed` (`false`).

Forbidden (P6-I5R §9): `approval_granted`, `execution_allowed`, `append_performed`,
`evidence_ledger_entry_written`, `graph_write_performed`, `approval_store_approved`,
`external_action_executed`, `formal_workunit_promoted`, `secret`, `token`, `credential`,
`raw_event_payload`, `private_customer_data`. Presence of any forbidden field is a fail-closed
rejection.

## 7. Validator Input / Output Semantics

`validateLinkageCandidate(input: unknown)` accepts any value, takes a single-read snapshot of the
input's own enumerable top-level properties, never mutates the input, never returns the raw input,
never throws for normal invalid input, performs no I/O, reads no clock and no randomness, and returns
a frozen `{ ok, issues }` with a frozen issue array. `ok: true` means the candidate is well-formed
with the correct no-append/no-graph-write/human-review flags; it is not append permission, not
approval, not execution permission, and not production readiness.

## 8. Issue-code Surface

Stable codes (P6-I5R §13, plus `invalid_non_authorization_statement` for a present-but-invalid
`non_authorization_statement`): `invalid_input`, `not_object`, `missing_required_field`,
`null_required_field`, `invalid_field_type`, `unknown_field`, `forbidden_field_present`,
`invalid_payload_hash`, `invalid_summary_scope`, `invalid_tenant`, `invalid_source_lineage`,
`invalid_non_authorization_statement`, `append_allowed_must_be_false`,
`graph_write_allowed_must_be_false`, `human_review_required_must_be_true`, `secret_like_value_present`,
`raw_event_payload_present`, `grant_like_field_present`, `validator_exception`. Messages are
`code:field` only.

## 9. Field-name Classification

`null`/`undefined`/non-object input yields `invalid_input`; an array yields `not_object`. The exact
P6-I5R §9 forbidden fields map to `grant_like_field_present` (grant set), `secret_like_value_present`
(secret set), and `raw_event_payload_present` (raw-payload). A curated set of additional grant-like,
secret-like, and raw-payload name variants (defense-in-depth) maps to `forbidden_field_present`. Any
remaining unrecognized top-level field maps to `unknown_field`.

## 10. Fail-closed Behavior

The validator fails closed on non-object/array/null input, missing/null/unknown fields, forbidden
fields, malformed or uppercase payload hashes, invalid summary scope, invalid/missing tenant, missing
or invalid source lineage, `append_allowed` not `false`, `graph_write_allowed` not `false`, and
`human_review_required` not `true`. A defensive `catch` maps any unexpected getter/inspection failure
to `validator_exception` without echoing data.

## 11. Getter / TOCTOU Handling

Every own enumerable top-level property is read exactly once into a plain snapshot; every subsequent
check reads the snapshot only, so a getter that changes value between reads cannot desynchronize the
result. A throwing getter is caught by the defensive `catch` and yields a generic
`validator_exception` issue.

## 12. Non-echoing Behavior

Issue messages are `${code}:${field}` and never contain input values. A rejected candidate carrying a
secret-like value, a token, or a raw event payload never has that value appear in any issue message or
in the serialized result. Field names in issues are the candidate's declared keys, never their values.

## 13. Privacy and Tenant Handling

The validator rejects the exact forbidden secret/raw fields and additional secret-like/raw-payload
name variants, per the `ALPHA_EVIDENCE_LEDGER.md` privacy doctrine (referenced only as existing,
unchanged doctrine). It requires a non-empty `tenant_id` (`invalid_tenant` otherwise) and never leaks
cross-tenant data in any issue.

## 14. Source-lineage Handling

`source_loop`, `source_recorder_loop`, and `source_validator_loop` must each be non-empty strings
(`invalid_source_lineage` otherwise). At least one of `source_fixture_loop` / `source_harness_loop`
must be present as a non-empty string; a present-but-invalid variant, or neither present, yields
`invalid_source_lineage`.

## 15. Payload-hash Handling

`payload_hash` must be a 64-character lowercase hex string (validated with the P6-I5L `isSha256Hex`
guard). Uppercase or malformed hashes yield `invalid_payload_hash`. The hash is a descriptive
reference, not proof of truth.

## 16. No-Append Guarantee

The validator never appends to the Evidence Ledger, never writes the Graph Model, and never persists
anything. It describes and rejects; it does not link. `ok: true` does not mean a reference was
recorded. There is no append operation, no Graph Model operation, no writer, and no runtime consumer
anywhere in the module.

## 17. No Graph Model Write Guarantee

The validator performs no Graph Model node or edge write and rejects `graph_write_allowed` not equal
to `false` and any `graph_write_performed` field. `GRAPH_MODEL.md` is referenced only as existing,
unchanged, out-of-scope doctrine.

## 18. Determinism and Immutability

The validator is pure and deterministic: identical input yields an identical result; there is no
state, no clock, and no randomness. The returned result object and its issue array are frozen with
`Object.freeze`, so callers cannot mutate them.

## 19. Source Guards

The isolated test reads only the three module source files and asserts they contain none of a curated
set of forbidden runtime-capability substrings (clock, randomness, network, filesystem, process,
database, query-language, ledger/graph writer, approval-store, StartHub, external clients, model
providers). The guard scans the module sources only, never the test's own marker list.

## 20. Runtime-consumer Audit

No `app/` file outside this new module imports it; the module has no runtime consumer. It is inert
scaffolding validated in isolation.

## 21. Non-authorization Boundary

Linkage Candidate ≠ Ledger Entry. Linkage Reference ≠ Ledger Append. Linkage Validation ≠ Human
Approval. Validator success ≠ Evidence Ledger Append / Graph Model Write / Approval / Execution
Permission / Production Readiness. Contract types ≠ Runtime Wiring. Pure Validator ≠ Runtime Linkage /
Persistence / Human Review. `ok: true` is descriptive only.

## 22. What Is Not Implemented

No Evidence Ledger append/writer/runtime, no Graph Model write, no runtime linkage, no summary
emitter, no audit runtime, no audit event emitter, no persistence, no durable storage, no repository,
no production adapter, no database schema, no D1/SQL, no ApprovalStore integration, no P7.1 TSP wiring,
no StartHub runtime, no external action execution, and no Formal WorkUnit promotion.

## 23. Validation Commands

```
node --experimental-strip-types tests/phase6RecorderAuditSummaryEvidenceLedgerNoAppendValidator.test.mts
node --experimental-strip-types tests/phase6RecorderAuditSummaryEvidenceLedgerStaticContractNoAppendValidatorSpec.test.mts
node --experimental-strip-types tests/phase6RecorderAuditSummaryEvidenceLedgerLinkageGateSpec.test.mts
node --experimental-strip-types tests/phase6RecorderAuditSummaryLaneReadinessReview.test.mts
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

## 24. Next Safe Loop

Any future runtime linkage, Evidence Ledger append, or Graph Model write remains separately gated and
requires a new explicit human Go. StartHub runtime remains separately gated. D1 read-only execution
remains P6-I6 or later.
