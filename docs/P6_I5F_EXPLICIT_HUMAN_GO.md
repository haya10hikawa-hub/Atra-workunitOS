# P6-I5F Explicit Human Go

**Loop:** P6-I5F (persistence_audit_evidence_spec_loop / docs-only + static-test per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I5A Persistence Target Decision Spec, P6-I5B types and validators, P6-I5C pure
constructors, P6-I5D test-only fixture, and P6-I5E in-memory test-only adapter (PR #98) — merged into
`main`. Recorded before any P6-I5F spec or test code was written.

This document is the durable human Go record required before P6-I5F code. If this file is absent,
the loop is No-Go. This file must be created before the spec and test files.

## Sign-off statements

- P6-I5F has explicit human Go.
- This task is docs-only + static-test.
- The selected target class is exactly `in_memory_test_only_store`.
- The task will create only the four allowed files.
- The task will not modify `app/`.
- The task will not modify `app/lib/phase6/persistenceTargetDecision/`.
- The task will not modify `app/lib/persistence/`.
- The task will not modify `app/lib/phase6/artifacts/`.
- The task will not modify existing `tests/fixtures/` files.
- The task will not modify existing `tests/harness/` files.
- The task will not modify migrations.
- No audit runtime implementation is allowed.
- No audit event emitter implementation is allowed.
- No real persistence implementation is allowed.
- No durable storage implementation is allowed.
- No repository or production adapter is allowed.
- No database schema is allowed.
- No D1 binding, migration, access, or execution is allowed.
- No SQL execution or mutation is allowed.
- No ApprovalStore wiring is allowed.
- No external action is allowed.
- No Formal WorkUnit promotion is allowed.
- Audit evidence is not truth.
- Audit evidence is not approval.
- Audit evidence is not execution permission.
- Audit evidence is not production readiness.
- Audit evidence spec is not audit runtime.
- If forbidden paths change, stop immediately.
- If context pressure becomes high, stop at a phase boundary instead of using `/compact` mid-task.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

In-memory Adapter Success ≠ Persistence. In-memory Adapter Success ≠ Durable Storage. Audit Evidence
≠ Truth. Audit Evidence ≠ Approval. Audit Evidence ≠ Execution Permission. Audit Evidence ≠ Formal
WorkUnit Promotion. Audit Evidence ≠ Production Readiness. Audit Evidence Spec ≠ Audit Runtime. Audit
Evidence Spec ≠ Persistence Implementation. P6-I5F only defines the audit evidence shape for the
test-only in-memory persistence target decision adapter operations and pins it with static tests over
documentation; it implements nothing and authorizes nothing.
