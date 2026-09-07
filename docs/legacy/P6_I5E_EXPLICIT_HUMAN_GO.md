# P6-I5E Explicit Human Go

**Loop:** P6-I5E (in_memory_test_only_persistence_target_decision_adapter_loop /
in-memory-test-only-adapter only per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I5A Persistence Target Decision Spec, P6-I5B types and validators, P6-I5C pure
constructors, and P6-I5D test-only fixture (PR #97) — merged into `main`. Recorded before any P6-I5E
adapter or test code was written.

This document is the durable human Go record required before P6-I5E code. If this file is absent,
the loop is No-Go. This file must be created before the adapter and test files.

## Sign-off statements

- P6-I5E has explicit human Go.
- This task is in-memory-test-only-adapter only.
- The selected target class is exactly `in_memory_test_only_store`.
- The task will create only the four allowed files.
- The task will not modify `app/`.
- The task will not modify `app/lib/phase6/persistenceTargetDecision/`.
- The task will not modify `app/lib/persistence/`.
- The task will not modify `app/lib/phase6/artifacts/`.
- The task will not modify existing `tests/fixtures/` files.
- The task will not modify existing `tests/harness/` files.
- The task will not modify migrations.
- No real persistence implementation is allowed.
- No durable storage implementation is allowed.
- No repository or production adapter is allowed.
- No database schema is allowed.
- No D1 binding, migration, access, or execution is allowed.
- No SQL execution or mutation is allowed.
- No ApprovalStore wiring is allowed.
- No external action is allowed.
- No Formal WorkUnit promotion is allowed.
- The adapter must be test-only.
- The adapter must be in-memory only.
- The adapter must be non-durable.
- The adapter must not survive process restart.
- The adapter must be tenant-scoped.
- The adapter must validate records with P6-I5B validators before accepting them.
- The adapter must work with P6-I5D fixtures.
- Adapter success is not persistence.
- Adapter success is not durable storage.
- Adapter success is not approval.
- Adapter success is not execution permission.
- Adapter success is not production readiness.
- If forbidden paths change, stop immediately.
- If context pressure becomes high, stop at a phase boundary instead of using `/compact` mid-task.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Constructor Success ≠ Persistence. Fixture Validity ≠ Persistence. In-memory Adapter Success ≠
Persistence. In-memory Adapter Success ≠ Durable Storage. In-memory Adapter Success ≠ Approval.
In-memory Adapter Success ≠ Execution Permission. In-memory Adapter Success ≠ Formal WorkUnit
Promotion. In-memory Adapter Success ≠ Production Readiness. P6-I5E only adds a deterministic,
test-only, in-memory, non-durable, tenant-scoped adapter for validated `TargetDecisionRecord`
candidates, under `tests/harness/phase6/`; it implements nothing durable and authorizes nothing.
