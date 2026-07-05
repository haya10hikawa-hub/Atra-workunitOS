# P6-I0 Explicit Human Go

**Loop:** P6-I0 (first Phase 6 product-lane runtime loop). **Baseline:** `main` @ `00ca406`.
**Recorded:** 2026-07-05, before the first runtime file of this loop was created.

Per [`PHASE6_IMPLEMENTATION_DECISION_RECORD.md`](./PHASE6_IMPLEMENTATION_DECISION_RECORD.md)
§19, P6-I0 requires an explicit recorded human Go before its first runtime file (P7.1
precedent, [`P7_1_RUNTIME_SECURITY_SIGNOFF.md`](./P7_1_RUNTIME_SECURITY_SIGNOFF.md)). The
requesting human operator issued the P6-I0 loop instruction that authorizes exactly the
scope below; this file records that Go in-repo before any runtime code.

## Go statement

- P6-I0 has explicit human Go.
- The allowed runtime scope is shared types and validators only.
- No constructors are allowed.
- No storage is allowed.
- No D1 access or SQL execution is allowed.
- No real LLM is allowed.
- No GraphRAG or vectorization is allowed.
- No ApprovalStore integration is allowed.
- No P7.1 TSP wiring is allowed.
- No external action execution is allowed.
- No Formal WorkUnit promotion is allowed.
- Validation pass is not approval.
- Validation pass is not execution permission.
- This loop must stop if forbidden paths change.

## Scope boundaries confirmed

- [x] New code confined to `app/lib/phase6/artifacts/` (types, validation helpers,
  validators, index) + one behavioral test + two docs.
- [x] Validators accept plain unknown data and return structured results only — no I/O, no
  network, no database, no LLM, no mutation of input, no downstream artifact construction.
- [x] Fail-closed per the decision record §11: unknown fields rejected, missing ≠ null,
  tenant_id and lineage ids required, hex64 / `sha256:<hex64>` formats enforced,
  non-empty `no_go_flags` fails unless the artifact status is explicitly `blocked_no_go`.
- [x] P6-I1 (pure constructors) is NOT part of this loop.

Any widening of this scope requires a new recorded human Go.
