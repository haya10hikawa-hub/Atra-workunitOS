# P6-I1 Explicit Human Go

**Loop:** P6-I1 (pure_constructor_loop per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I0 (PR #88, merged into `main`). Recorded before any P6-I1 runtime
constructor code was written.

This document is the durable human Go record required before P6-I1 runtime code. If this
file is absent, the loop is No-Go.

## Sign-off statements

- P6-I1 has explicit human Go.
- The allowed runtime scope is pure artifact constructors only.
- Constructors may consume P6-I0 types and validators.
- Constructors must not generate ids.
- Constructors must not call Date.now.
- Constructors must not call crypto.randomUUID.
- Constructors must not call Math.random.
- Constructors must not perform I/O.
- Constructors must not access storage.
- Constructors must not access D1.
- Constructors must not execute SQL.
- Constructors must not call real LLM.
- Constructors must not implement GraphRAG or vectorization.
- Constructors must not integrate ApprovalStore.
- Constructors must not wire P7.1 TSP utilities.
- Constructors must not execute external actions.
- Constructors must not promote Formal WorkUnits.
- Constructor success is not approval.
- Constructor success is not execution permission.
- Constructor success is not pipeline execution.
- This loop must stop if forbidden paths change.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Constructor success ≠ Approval. Constructor success ≠ Execution permission.
Constructor success ≠ Formal WorkUnit promotion. Constructor success ≠ Pipeline execution.
A constructor only assembles one artifact from caller-provided ids and timestamps, validates
it with the matching P6-I0 validator, and returns a structured `ConstructionResult`. It grants
nothing.
