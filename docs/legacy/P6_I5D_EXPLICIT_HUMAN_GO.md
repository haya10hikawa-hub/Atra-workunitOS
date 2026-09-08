# P6-I5D Explicit Human Go

**Loop:** P6-I5D (test_only_persistence_target_decision_fixture_loop / test-only-fixture-only per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I5A Persistence Target Decision Spec, P6-I5B Persistence Target Decision types and
validators, and P6-I5C Pure Persistence Target Decision constructors (PR #96) — merged into `main`.
Recorded before any P6-I5D fixture or test code was written.

This document is the durable human Go record required before P6-I5D code. If this file is absent,
the loop is No-Go. This file must be created before the fixture and test files.

## Sign-off statements

- P6-I5D has explicit human Go.
- This task is test-only-fixture-only.
- The selected target class is exactly `in_memory_test_only_store`.
- The task will create only the four allowed files.
- The task will not modify `app/`.
- The task will not modify `app/lib/phase6/persistenceTargetDecision/`.
- The task will not modify `app/lib/persistence/`.
- The task will not modify `app/lib/phase6/artifacts/`.
- The task will not modify existing `tests/fixtures/` files.
- The task will not modify `tests/harness/`.
- The task will not modify migrations.
- No persistence implementation is allowed.
- No storage implementation is allowed.
- No repository or adapter is allowed.
- No database schema is allowed.
- No D1 binding, migration, access, or execution is allowed.
- No SQL execution or mutation is allowed.
- No ApprovalStore wiring is allowed.
- No external action is allowed.
- No Formal WorkUnit promotion is allowed.
- Fixtures must be deterministic.
- Fixtures must use fixed caller-provided ids.
- Fixtures must use fixed caller-provided timestamps.
- Fixtures must use fixed caller-provided payload_hash values.
- Fixtures must use P6-I5C constructors.
- Fixtures must validate with P6-I5B validators.
- Fixture validity is not persistence.
- Fixture validity is not storage.
- Fixture validity is not approval.
- Fixture validity is not execution permission.
- Fixture validity is not production readiness.
- If forbidden paths change, stop immediately.
- If context pressure becomes high, stop at a phase boundary instead of using `/compact` mid-task.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Constructor Success ≠ Persistence. Fixture Validity ≠ Persistence. Fixture Validity ≠ Storage.
Fixture Validity ≠ Approval. Fixture Validity ≠ Execution Permission. Fixture Validity ≠ Formal
WorkUnit Promotion. Fixture Validity ≠ Production Readiness. P6-I5D only adds deterministic,
test-only fixtures built through the P6-I5C constructors and validated with the P6-I5B validators,
under `tests/fixtures/phase6/`; it implements nothing and authorizes nothing.
