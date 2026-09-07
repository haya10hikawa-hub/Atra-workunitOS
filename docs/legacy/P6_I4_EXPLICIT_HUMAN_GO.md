# P6-I4 Explicit Human Go

**Loop:** P6-I4 (storage_gate_spec_loop / docs-only + static-test per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Depends on:** P6-I0 (PR #88), P6-I1 (PR #89), P6-I2 (PR #90), and P6-I3 (PR #91), all merged
into `main`. Recorded before any P6-I4 spec or test code was written.

This document is the durable human Go record required before P6-I4 code. If this file is absent,
the loop is No-Go.

## Sign-off statements

- P6-I4 has explicit human Go.
- The allowed scope is docs-only + static-test storage gate specification.
- P6-I4 may reference P6-I0 validators.
- P6-I4 may reference P6-I1 constructors.
- P6-I4 may reference P6-I2 fixture spine.
- P6-I4 may reference P6-I3 in-memory non-persistent harness.
- P6-I4 must not add app runtime code.
- P6-I4 must not implement storage.
- P6-I4 must not implement persistence.
- P6-I4 must not add D1 bindings.
- P6-I4 must not add D1 migrations.
- P6-I4 must not execute SQL.
- P6-I4 must not implement a repository.
- P6-I4 must not implement a storage adapter.
- P6-I4 must not implement a database schema.
- P6-I4 must not call real LLM.
- P6-I4 must not implement GraphRAG or vectorization.
- P6-I4 must not integrate ApprovalStore.
- P6-I4 must not wire P7.1 TSP utilities.
- P6-I4 must not execute external actions.
- P6-I4 must not promote Formal WorkUnits.
- Storage eligibility is not approval.
- Storage eligibility is not execution permission.
- Storage eligibility is not production readiness.
- This loop must stop if forbidden paths change.

## Product invariant

AI proposes. Rules guard. Humans decide.

## Scope boundary reminder

Storage Gate Spec ≠ Storage Implementation. Storage Eligibility ≠ Persistence. Storage
Eligibility ≠ Approval. Storage Eligibility ≠ Execution Permission. Storage Eligibility ≠ Formal
WorkUnit Promotion. Storage Eligibility ≠ Production Readiness. P6-I4 only specifies the future
storage gate and pins it with static tests over documentation; it implements nothing and
authorizes nothing.
