# P6-I5A Explicit Human Go

**Loop:** P6-I5A (persistence_target_decision_spec_loop / docs-only + static-test per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I5 (PR #93 — Phase 6 Persistence Implementation Gate) merged into `main`.
Recorded before any P6-I5A spec or test code was written.

This document is the durable human Go record required before P6-I5A code. If this file is absent,
the loop is No-Go. This file must be created before the other three allowed files.

## Execution plan

1. Verify PR #93 (P6-I5) is merged into `main` and all foundation files exist.
2. Read back the ruleset and confirm the Main Safety Gate is active.
3. Create this Explicit Human Go record first.
4. Create `docs/legacy/P6_I5A_PERSISTENCE_TARGET_DECISION.md`.
5. Create `docs/legacy/P6_I5A_TARGET_DECISION_RECORD_CONTRACT.md`.
6. Create `tests/phase6PersistenceTargetDecisionSpec.test.mts`.
7. Run the isolated static test, the Phase 6 regression tests, and full validation.
8. Run SubAgent audits, then commit, push, and open a PR without merging.

## Sign-off statements

- P6-I5A has explicit human Go.
- This task is docs-only + static-test.
- Selected target class must be exactly `in_memory_test_only_store`.
- The task will create only the four allowed files.
- The task will not modify `app/`, `tests/fixtures/`, `tests/harness/`, `migrations/`, package
  files, workflows, or runtime code.
- No persistence implementation is allowed.
- No storage implementation is allowed.
- No repository or adapter is allowed.
- No D1 binding, migration, access, or execution is allowed.
- No SQL execution or mutation is allowed.
- No ApprovalStore wiring is allowed.
- No external action is allowed.
- No Formal WorkUnit promotion is allowed.
- Target decision is not persistence.
- Target decision is not approval.
- Target decision is not execution permission.
- Target decision is not production readiness.
- If forbidden paths change, stop immediately.
- If context pressure becomes high, stop at a phase boundary instead of using `/compact` mid-task.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Persistence Target Decision ≠ Persistence Implementation. Persistence Target Decision ≠ Storage
Implementation. Persistence Target Decision ≠ D1 Access. Persistence Target Decision ≠ SQL
Execution. Persistence Target Decision ≠ Approval. Persistence Target Decision ≠ Execution
Permission. Persistence Target Decision ≠ Formal WorkUnit Promotion. Persistence Target Decision ≠
Production Readiness. P6-I5A only selects the first Phase 6 persistence target class for future
type and validator work and pins that decision with static tests over documentation; it implements
nothing and authorizes nothing.
