# P6-I3 Explicit Human Go

**Loop:** P6-I3 (harness_loop per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I0 (PR #88), P6-I1 (PR #89), and P6-I2 (PR #90), all merged into `main`.
Recorded before any P6-I3 harness or test code was written.

This document is the durable human Go record required before P6-I3 code. If this file is
absent, the loop is No-Go.

## Sign-off statements

- P6-I3 has explicit human Go.
- The allowed scope is a test-only in-memory non-persistent harness.
- P6-I3 may use P6-I0 validators.
- P6-I3 may use P6-I1 constructors.
- P6-I3 may use P6-I2 fixture inputs.
- P6-I3 must not add app runtime code.
- P6-I3 must not implement a production runtime pipeline.
- P6-I3 must not implement storage.
- P6-I3 must not persist artifacts.
- P6-I3 must not access D1.
- P6-I3 must not execute SQL.
- P6-I3 must not call real LLM.
- P6-I3 must not implement GraphRAG or vectorization.
- P6-I3 must not integrate ApprovalStore.
- P6-I3 must not wire P7.1 TSP utilities.
- P6-I3 must not execute external actions.
- P6-I3 must not promote Formal WorkUnits.
- Harness pass is not approval.
- Harness pass is not execution permission.
- Harness pass is not production readiness.
- This loop must stop if forbidden paths change.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

In-memory harness ≠ Product runtime pipeline. Harness pass ≠ Approval. Harness pass ≠
Execution permission. Harness pass ≠ Formal WorkUnit promotion. Harness pass ≠ Production
readiness. The harness lives only under `tests/`, is never exported from or imported by `app/`,
stores nothing, and authorizes nothing: it runs the P6-I1 constructors over caller-provided
fixture inputs in memory, records stage results, and returns a structured non-authorizing
result.
