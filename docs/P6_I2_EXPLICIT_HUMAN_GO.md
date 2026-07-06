# P6-I2 Explicit Human Go

**Loop:** P6-I2 (fixture_pipeline_loop per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I0 (PR #88) and P6-I1 (PR #89), both merged into `main`. Recorded before
any P6-I2 fixture or test code was written.

This document is the durable human Go record required before P6-I2 code. If this file is
absent, the loop is No-Go.

## Sign-off statements

- P6-I2 has explicit human Go.
- The allowed scope is fixture-based spine tests only.
- P6-I2 may use P6-I0 validators.
- P6-I2 may use P6-I1 constructors.
- P6-I2 may add test-only fixture helpers.
- P6-I2 must not add app runtime code.
- P6-I2 must not implement a runtime pipeline.
- P6-I2 must not implement an in-memory harness.
- P6-I2 must not implement storage.
- P6-I2 must not access D1.
- P6-I2 must not execute SQL.
- P6-I2 must not call real LLM.
- P6-I2 must not implement GraphRAG or vectorization.
- P6-I2 must not integrate ApprovalStore.
- P6-I2 must not wire P7.1 TSP utilities.
- P6-I2 must not execute external actions.
- P6-I2 must not promote Formal WorkUnits.
- Fixture pass is not approval.
- Fixture pass is not execution permission.
- Fixture pass is not production readiness.
- This loop must stop if forbidden paths change.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Fixture spine ≠ Runtime pipeline. Fixture pass ≠ Approval. Fixture pass ≠ Execution
permission. Fixture pass ≠ Formal WorkUnit promotion. Fixture pass ≠ Production readiness.
P6-I2 only assembles one deterministic, test-only artifact chain from caller-provided fixture
data using the P6-I1 constructors and P6-I0 validators; it proves coherence, and it authorizes
nothing.
