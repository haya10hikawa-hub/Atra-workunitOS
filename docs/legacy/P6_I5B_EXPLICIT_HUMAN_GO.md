# P6-I5B Explicit Human Go

**Loop:** P6-I5B (persistence_target_decision_types_and_validators_loop / types-and-validators-only
per [`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I4 Storage Gate Spec, P6-I5 Persistence Implementation Gate, and P6-I5A
Persistence Target Decision Spec (PR #94) — all merged into `main`. Recorded before any P6-I5B type,
validator, or test code was written.

This document is the durable human Go record required before P6-I5B code. If this file is absent,
the loop is No-Go. This file must be created before the TypeScript files and tests.

## Sign-off statements

- P6-I5B has explicit human Go.
- This task is types-and-validators-only.
- The selected target class is exactly `in_memory_test_only_store`.
- The task will create only the six allowed files.
- The task will only add code under `app/lib/phase6/persistenceTargetDecision/`.
- The task will not modify existing app files.
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
- Type validity is not persistence.
- Validation pass is not storage.
- Validation pass is not approval.
- Validation pass is not execution permission.
- Validation pass is not production readiness.
- If forbidden paths change, stop immediately.
- If context pressure becomes high, stop at a phase boundary instead of using `/compact` mid-task.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Persistence Target Decision ≠ Persistence Implementation. Persistence Target Type Validity ≠
Persistence Implementation. Persistence Target Validation Pass ≠ Storage. Persistence Target
Validation Pass ≠ Approval. Persistence Target Validation Pass ≠ Execution Permission. Persistence
Target Validation Pass ≠ Formal WorkUnit Promotion. Persistence Target Validation Pass ≠ Production
Readiness. P6-I5B only adds inert TypeScript types and pure, fail-closed validators for the P6-I5A
Target Decision Record under `app/lib/phase6/persistenceTargetDecision/`; it implements nothing and
authorizes nothing.
