# Phase 6 Implementation Decision Record

**Phase:** P6.15. **Baseline:** `main` @ `e9bf288`.

Decides how the fully documented Phase 6 spine — Information Intake → Query Intent → Safe
Query Plan → Compiled SQL Artifact → Rule Review → D1 Read-only Execution → Query Result
Record → Evidence Review → LLM Judgment → Human Decision → `ready_for_future_gate_review`
(P6.1–P6.14) — may be *implemented*, and in what order, without crossing the approval,
execution, LLM, GraphRAG, or D1 boundaries that P7.0–P7.2A and the P6 gates keep
future-gated. Pairs with
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md).
Documentation and a static test only.

> This record **decides**; it does not implement. Every decision below describes what a
> future implementation loop may do and what it must not do. Phase 6 Runtime Implementation
> ≠ External Action Enablement.

---

## 1. Purpose

P6.0 through P6.14 defined the complete query / evidence / judgment / human decision spine
as contracts. Before any implementation loop begins, this record fixes the implementation
order, the artifact boundaries, the lineage/ID/hash strategy, the tenant-scope strategy, the
validation-first rule, and the gates that stay closed — so that "start implementing Phase 6"
has exactly one safe meaning.

The Phase 6 Implementation Decision Record decides how the documented Phase 6 query, evidence, judgment, and human decision spine may be implemented through gated, non-authorizing, validation-first loops without enabling SQL execution, D1 access, real LLM, GraphRAG, approval, promotion, or external action execution.

Phase 6 Implementation Decision Recordとは、Phase 6で定義されたquery・evidence・judgment・human decision spineを、SQL実行・D1アクセス・real LLM・GraphRAG・approval・promotion・external action executionを有効化せずに、gated・non-authorizing・validation-firstなloopで実装するための決定記録である。

Phase 6 runtime implementation must begin with non-authorizing, tenant-scoped, validation-first artifact construction. No loop may execute SQL, access D1, call real LLMs, authorize approval, promote WorkUnits, or execute external actions until the corresponding future gate explicitly permits it.

Phase 6 runtime implementationは、非認可・tenant-scoped・validation-firstなartifact constructionから開始しなければならない。対応するfuture gateが明示的に許可するまで、SQL実行・D1アクセス・real LLM呼び出し・approval認可・WorkUnit昇格・external action実行を行ってはならない。

## 2. Scope

- **In scope:** implementation-order decisions, artifact/type/validator boundaries,
  lineage/ID/hash strategy, tenant-scope and authorization boundaries, validation strategy,
  storage/migration constraints, query/D1/SQL constraints, LLM/GraphRAG/vector constraints,
  evidence/judgment/human-decision constraints, approval/promotion/execution boundaries,
  loop-engineering readiness, No-Go conditions, and the recommended sequence.
- **Out of scope:** any runtime implementation itself, SQL execution, D1 access, real LLM,
  GraphRAG, vectorization, ApprovalStore integration, P7.1 TSP wiring, external action
  execution, persistence, or migrations.

## 3. Definition of Phase 6 Implementation Decision Record

This record is the single authoritative statement of which Phase 6 capabilities may be
implemented first, which remain blocked, and which gates must open before each subsequent
capability — binding on every future Phase 6 implementation loop until superseded by a
later, separately reviewed decision record.

## 4. What This Record Is Not

This record is **not**:

- runtime implementation
- runtime query execution
- D1 access
- SQL execution
- real LLM enablement
- GraphRAG implementation
- vector storage
- ApprovalStore integration
- external action enablement
- Formal WorkUnit promotion
- deployment approval
- production readiness by itself

## 5. Product and Safety Invariants

AI proposes. Rules guard. Humans decide.

Phase 6 implementation must be non-authorizing by default.

No Phase 6 implementation loop may authorize approval.

No Phase 6 implementation loop may authorize action.

No Phase 6 implementation loop may promote a WorkUnit Candidate into a Formal WorkUnit.

No Phase 6 implementation loop may execute SQL without a separate gate.

No Phase 6 implementation loop may access D1 without a separate gate.

No Phase 6 implementation loop may call real LLM without a separate gate.

No Phase 6 implementation loop may use GraphRAG without a separate gate.

No Phase 6 implementation loop may execute external actions.

## 6. Phase 6 Capability Inventory

Documented capabilities awaiting implementation (all exist as docs only at baseline
`e9bf288`; no runtime type, validator, constructor, or storage exists for any of them):

- Query Intent
- Safe Query Plan
- Compiled SQL Artifact
- Rule Review Record
- Query Result Record
- Evidence Review Record
- LLM Judgment Record
- Human Decision Record
- Evidence Acceptance state
- Decision Impact Scope
- ready_for_future_gate_review
- Approval seam
- Promotion seam
- Execution seam
- Ledger linkage seam
- Graph linkage seam

Existing runtime that must remain untouched by Phase 6 loops: the app's own persistence
repositories (`app/lib/persistence/d1/*`), the approval/security modules
(`app/lib/security/*`, including the unwired P7.1 `approvalMac/*`), the mock-only LLM
provider boundary (`app/lib/application/llmProvider/*`, `llmReadiness/*`), and the
decomposition candidate lane (`app/lib/application/decomposition/*`).

## 7. Implementation Decision Summary

First implementation loop must implement shared TypeScript types and validators only.

Second implementation loop may implement pure artifact constructors with no storage.

Third implementation loop may implement fixture-based in-memory pipeline tests.

Runtime persistence requires a separate persistence gate.

D1 execution requires a separate D1 execution implementation gate.

SQL execution requires a separate SQL execution gate.

Real LLM requires a separate real LLM enablement gate.

GraphRAG requires a separate GraphRAG gate.

ApprovalStore wiring remains blocked.

External action execution remains blocked.

Formal WorkUnit promotion remains blocked.

## 8. Runtime Artifact Boundary Decisions

Each Phase 6 artifact must have a runtime type before it has storage.

Each Phase 6 artifact must have a validator before it has a constructor.

Each Phase 6 artifact must have fixture tests before runtime integration.

Artifact constructors must be pure functions in the first implementation loops.

Artifact constructors must not perform network, database, D1, SQL, LLM, ApprovalStore, or external action calls.

## 9. Lineage, ID, and Hash Decisions

All artifacts must carry tenant_id.

All artifacts must carry stable artifact ids.

All downstream artifacts must reference upstream artifact ids.

All hash fields must use 64-character lowercase hex SHA-256 unless a later gate explicitly changes the algorithm.

Content integrity references must use sha256:<64 lowercase hex>.

Lineage mismatch must fail closed.

Missing lineage ids must fail closed.

These lineage and integrity rules implement, at the runtime-type level, the provenance
requirements of [`PROVENANCE_MODEL.md`](../archive/v0/PROVENANCE_MODEL.md): lineage ids plus content
integrity references are how provenance travels through the spine.

## 10. Tenant Scope and Authorization Boundary Decisions

tenant_id is required on every runtime artifact.

Cross-tenant lineage is No-Go.

Tenant scope must be validated before artifact construction succeeds.

Artifact validity is not authorization.

Artifact construction is not approval.

Artifact construction is not action authorization.

Artifact construction is not execution.

## 11. Validation and Schema Strategy

Validators must be implemented before constructors.

Validators must return structured pass/fail results.

Validation errors must be explicit and stable.

Validation must fail closed on unknown critical fields.

Validation must distinguish missing fields from null fields.

Validation must preserve explicit nulls where allowed.

Validation must reject no_go_flags unless the artifact type explicitly allows blocked states.

The P7.1 `canonicalApprovalPayload.ts` validator (frozen single-read snapshot, structured
error codes, fail-closed unknown-field rejection) is the reference implementation style for
Phase 6 validators — without importing or wiring it.

## 12. Storage, Migration, and Persistence Decisions

No persistence in the first implementation loop.

No D1 migrations in the first implementation loop.

No runtime storage backend in the first implementation loop.

Persistence requires a separate storage gate.

Migration requires a separate migration gate.

Runtime audit storage requires a separate audit implementation gate.

## 13. Query, D1, and SQL Execution Decisions

Query Intent runtime type and validator may be implemented before NL2SQL runtime.

Safe Query Plan runtime type and validator may be implemented before plan generation runtime.

Compiled SQL Artifact runtime type and validator may be implemented before SQL compilation runtime.

SQL string generation remains blocked until a separate SQL compilation implementation gate.

D1 execution remains blocked until a separate D1 read-only execution implementation gate.

No mutation SQL may be introduced.

## 14. LLM, GraphRAG, and Vector Decisions

Runtime LLM judgment remains blocked.

Real LLM remains blocked.

Mock-only fixture-based tests may be used if they do not call providers.

GraphRAG remains blocked.

Vectorization remains blocked.

Model confidence must not authorize anything.

LLM outputs must remain non-authorizing in future gates.

## 15. Evidence, Judgment, and Human Decision Decisions

Evidence Review Record runtime types may be implemented before evidence storage.

LLM Judgment Record runtime types may be implemented before runtime LLM.

Human Decision Record runtime types may be implemented before runtime decision storage.

Evidence Acceptance state may be represented in types before persistence.

Human Decision Record may support future gates only.

## 16. Approval, Promotion, and Execution Boundary Decisions

Approval seam remains future-gated.

Promotion seam remains future-gated.

Execution seam remains future-gated.

ApprovalStore integration remains blocked.

Canonical Approval Payload / TSP utility wiring remains blocked.

External action execution remains blocked.

Human Decision Record may be an input to future gates, but not an authorization by itself.

## 17. Loop Engineering Readiness Decision

Loop engineering may start only with type/validator loops.

Each loop must have one narrow objective.

Each loop must create one PR.

Each loop must include isolated tests.

Each loop must run full validation.

Each loop must include security, test, architecture, and product audits.

Each loop must stop on forbidden path changes.

Each loop must stop on runtime authorization changes.

The loop mechanics are specified in
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md).

## 18. No-Go Conditions

- p6_14_not_merged
- missing_foundation_file
- missing_main_safety_gate
- ruleset_weakened
- runtime_behavior_change
- approval_authorization_added
- action_authorization_added
- external_action_execution_added
- formal_workunit_promotion_added
- sql_execution_added
- d1_access_added
- real_llm_enabled
- graphrag_added
- vector_storage_added
- runtime_storage_added_without_gate
- migration_added_without_gate
- approvalstore_wiring_added
- p7_1_tsp_wiring_added
- cross_tenant_lineage_allowed
- lineage_mismatch_allowed
- no_go_flags_ignored
- validation_not_fail_closed
- loop_without_tests
- loop_without_full_validation
- loop_without_audits

Qualifier: `runtime_behavior_change` means a change to *existing* runtime behavior (the
untouched-runtime inventory of §6) — implementation loops add new, inert, non-authorizing
runtime code by design, and that addition alone is not this No-Go.

## 19. Recommended Implementation Sequence

P6-I0 — Phase 6 shared type definitions and validators.

P6-I1 — Pure artifact constructors with no storage.

P6-I2 — Fixture-based end-to-end spine construction test.

P6-I3 — In-memory non-persistent pipeline harness.

P6-I4 — Storage gate spec.

P6-I5 — Persistence implementation gate.

P6-I6 — D1 read-only execution implementation gate.

P6-I7 — Evidence / judgment / decision storage gate.

P6-I8 — Ledger / graph linkage gate.

P6-I9 — Query-lineage approval seam gate.

P7.2B must remain blocked until P6-I0 through P6-I3 and approval seam requirements are stable.

Each P6-I* step is one or more loops per the playbook; P6-I4 onward each require their own
sign-off before any code moves, and P6-I6/P6-I9 additionally require the corresponding P6
gate documents' entry criteria to be satisfied.

P6-I0 is the first runtime code in the Phase 6 product lane and therefore also requires an
explicit recorded human Go before its first runtime file, following the P7.1 precedent
([`P7_1_RUNTIME_SECURITY_SIGNOFF.md`](./P7_1_RUNTIME_SECURITY_SIGNOFF.md)): the human merge
of this record alone is not that Go unless the merge decision explicitly says so; otherwise
a lightweight P6-I0 sign-off record is created before code.

"P7.2B must remain blocked until …" states a necessary condition, not a sufficient one:
satisfying it does not auto-unblock P7.2B, which additionally requires its own sign-off and
the entry criteria of
[`APPROVALSTORE_DUAL_READ_WIRING_PRE_SPEC.md`](../APPROVALSTORE_DUAL_READ_WIRING_PRE_SPEC.md)
§16 (which remain binding and are not restated here). "Approval seam requirements are
stable" means: the query-lineage approval seam spec document exists, is merged, and its
static test is green — the seam *spec* may be produced as a docs_only_spec_loop earlier
than P6-I9; P6-I9 is the gate that *consumes* it.

## 20. Non-authorization Statement

This Phase 6 Implementation Decision Record authorizes no runtime implementation, no SQL execution, no D1 access, no real LLM enablement, no GraphRAG implementation, no vectorization, no ApprovalStore integration, no external action execution, no Formal WorkUnit promotion, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](../archive/v0/NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
