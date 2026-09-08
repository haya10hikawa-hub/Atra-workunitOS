# P6-I5I Explicit Human Go

**Loop:** P6-I5I (test_only_persistence_audit_evidence_fixture_loop / test-only-fixture-only per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I5F Persistence Audit Evidence Spec, P6-I5G types and validators, and P6-I5H pure
constructors (PR #101) — merged into `main`. Recorded before any P6-I5I fixture or test code was
written.

This document is the durable human Go record required before P6-I5I code. If this file is absent,
the loop is No-Go. This file must be created before the fixture and test files.

## Sign-off statements

- P6-I5I has explicit human Go.
- This task is test-only-fixture-only.
- The adapter target class is exactly `in_memory_test_only_store`.
- The selected target class is exactly `in_memory_test_only_store`.
- The task will create only the four allowed files.
- The task will not modify `app/`.
- The task will not modify `app/lib/phase6/persistenceAuditEvidence/`.
- The task will not modify `app/lib/phase6/persistenceTargetDecision/`.
- The task will not modify `app/lib/persistence/`.
- The task will not modify `app/lib/phase6/artifacts/`.
- The task will not modify existing test fixtures or test harnesses.
- The task will not modify migrations.
- No audit runtime implementation is allowed.
- No audit event emitter implementation is allowed.
- No real persistence implementation is allowed.
- No durable storage implementation is allowed.
- No repository or production adapter is allowed.
- No database schema is allowed.
- No D1 binding, migration, access, or execution is allowed.
- No SQL execution or mutation is allowed.
- No Evidence Ledger append is allowed.
- No Graph Model write is allowed.
- No ApprovalStore wiring is allowed.
- No external action is allowed.
- No Formal WorkUnit promotion is allowed.
- Fixtures must be deterministic.
- Fixtures must use P6-I5H constructors.
- Fixtures must validate through P6-I5G validators.
- Fixtures must use fixed caller-provided audit_event_id values.
- Fixtures must use fixed caller-provided tenant_id values.
- Fixtures must use fixed caller-provided target_decision_record_id values.
- Fixtures must use fixed caller-provided created_at values.
- Fixtures must use fixed caller-provided payload_hash values.
- Fixtures must not call Date.now.
- Fixtures must not call new Date.
- Fixtures must not call randomUUID.
- Fixtures must not call Math.random.
- Fixture validity is not truth.
- Fixture validity is not approval.
- Fixture validity is not execution permission.
- Fixture validity is not audit runtime.
- Fixture validity is not audit event emission.
- Fixture validity is not persistence.
- Fixture validity is not durable storage.
- Fixture validity is not Evidence Ledger append.
- Fixture validity is not Graph Model write.
- Fixture validity is not production readiness.
- If forbidden paths change, stop immediately.
- If context pressure becomes high, stop at a phase boundary instead of using `/compact` mid-task.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Audit Evidence Constructor Success ≠ Audit Runtime. Audit Evidence Fixture Validity ≠ Audit Runtime.
Audit Evidence Fixture Validity ≠ Audit Event Emitter. Audit Evidence Fixture Validity ≠ Persistence.
Audit Evidence Fixture Validity ≠ Durable Storage. Audit Evidence Fixture Validity ≠ Evidence Ledger
Append. Audit Evidence Fixture Validity ≠ Graph Model Write. Audit Evidence Fixture Validity ≠
Approval. Audit Evidence Fixture Validity ≠ Execution Permission. Audit Evidence Fixture Validity ≠
Production Readiness. P6-I5I only adds deterministic, test-only fixtures built through the P6-I5H
constructors and validated with the P6-I5G validator, under `tests/fixtures/phase6/`; it implements
nothing and authorizes nothing.
