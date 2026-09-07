# P6-I5C Explicit Human Go

**Loop:** P6-I5C (pure_persistence_target_decision_constructors_loop / pure-constructors-only per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I5A Persistence Target Decision Spec and P6-I5B Persistence Target Decision types
and validators (PR #95) — merged into `main`. Recorded before any P6-I5C constructor or test code was
written.

This document is the durable human Go record required before P6-I5C code. If this file is absent,
the loop is No-Go. This file must be created before the constructor files and tests.

## Sign-off statements

- P6-I5C has explicit human Go.
- This task is pure-constructors-only.
- The selected target class is exactly `in_memory_test_only_store`.
- The task will create only the five new files and modify only the existing index export file.
- The task will only add code under `app/lib/phase6/persistenceTargetDecision/`.
- The task will not modify `app/lib/persistence/`.
- The task will not modify `app/lib/phase6/artifacts/`.
- The task will not modify `tests/fixtures/` or `tests/harness/`.
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
- Constructors must be pure.
- Constructors must use caller-provided ids.
- Constructors must use caller-provided timestamps.
- Constructors must use caller-provided payload_hash.
- Constructors must not call Date.now.
- Constructors must not call new Date.
- Constructors must not call crypto.randomUUID.
- Constructors must not call Math.random.
- Constructor success is not persistence.
- Constructor success is not storage.
- Constructor success is not approval.
- Constructor success is not execution permission.
- Constructor success is not production readiness.
- If forbidden paths change, stop immediately.
- If context pressure becomes high, stop at a phase boundary instead of using `/compact` mid-task.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Persistence Target Decision ≠ Persistence Implementation. Persistence Target Validation Pass ≠
Storage. Constructor Success ≠ Persistence. Constructor Success ≠ Storage. Constructor Success ≠
Approval. Constructor Success ≠ Execution Permission. Constructor Success ≠ Formal WorkUnit
Promotion. Constructor Success ≠ Production Readiness. P6-I5C only adds pure, deterministic,
non-authorizing constructors for the P6-I5B `TargetDecisionRecord` under
`app/lib/phase6/persistenceTargetDecision/`; it implements nothing and authorizes nothing.
