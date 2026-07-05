# P6-I2 Fixture-based Spine Tests

**Loop:** P6-I2 (fixture_pipeline_loop per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Builds on:** P6-I0 ([`P6_I0_SHARED_TYPES_VALIDATORS.md`](./P6_I0_SHARED_TYPES_VALIDATORS.md),
PR #88) and P6-I1 ([`P6_I1_PURE_ARTIFACT_CONSTRUCTORS.md`](./P6_I1_PURE_ARTIFACT_CONSTRUCTORS.md),
PR #89), both merged into `main`. **Human Go:**
[`P6_I2_EXPLICIT_HUMAN_GO.md`](./P6_I2_EXPLICIT_HUMAN_GO.md) (recorded before fixture/test code).

## 1. Purpose

Prove that P6-I0 and P6-I1 can assemble a coherent, complete Phase 6 artifact chain — Query
Intent → Safe Query Plan → Compiled SQL Artifact → Rule Review Record → Query Result Record →
Evidence Review Record → LLM Judgment Record → Human Decision Record — from deterministic,
caller-provided fixture data, WITHOUT any runtime execution. This is a coherence demonstration,
not a pipeline.

P6-I2 implements fixture-based spine tests only.
P6-I2 does not implement a runtime pipeline.
P6-I2 does not implement an in-memory harness.
P6-I2 does not implement storage.
P6-I2 does not implement persistence.
P6-I2 does not implement D1 access.
P6-I2 does not execute SQL.
P6-I2 does not call real LLM.
P6-I2 does not implement GraphRAG.
P6-I2 does not implement ApprovalStore integration.
P6-I2 does not wire P7.1 TSP utilities.
P6-I2 does not execute external actions.
P6-I2 does not promote Formal WorkUnits.
Fixture pass is not approval.
Fixture pass is not execution permission.
Fixture pass is not production readiness.

## 2. Scope

Test-only. No app runtime file is added or modified. The fixture and test import only the
Phase 6 artifact module surface (`app/lib/phase6/artifacts/index.ts`) plus Node built-ins. The
fixture is deterministic and side-effect-free: it performs no I/O, generates no ids and no
timestamps, mutates no global state, and authorizes nothing. It is a fixture and a spine — not a
pipeline and not a harness.

## 3. Implemented Files

- `tests/fixtures/phase6/exampleSpineFixture.mts` — the deterministic fixture: constants
  (`PHASE6_FIXTURE_TENANT_ID`, `PHASE6_FIXTURE_IDS`, `PHASE6_FIXTURE_TIMESTAMPS`,
  `PHASE6_FIXTURE_HASHES`), `buildValidPhase6SpineInputs` (fresh input copies per call), and
  `buildValidPhase6Spine` (assembles the eight artifacts via the P6-I1 constructors and returns
  a structured `{ ok, spine, results }` / `{ ok: false, results, issues }`).
- `tests/phase6FixtureSpine.test.mts` — 36 behavioral tests (the loop-spec matrix 1–35, with
  the lineage-mismatch case split into a checker-detection test and a constructor-rejection
  test).
- `docs/P6_I2_EXPLICIT_HUMAN_GO.md`, this document.

No existing `tests/fixtures/` convention existed (the repo previously used `tests/helpers/` for
`fakeD1.ts` / `jwt.ts`); the loop-specified `tests/fixtures/phase6/` location is used and this
is the first fixture under it.

## 4. Fixture Spine

`buildValidPhase6Spine` calls, once each and in order, `createQueryIntentRecord`,
`createSafeQueryPlan`, `createCompiledSqlArtifact`, `createRuleReviewRecord`,
`createQueryResultRecord`, `createEvidenceReviewRecord`, `createLlmJudgmentRecord`, and
`createHumanDecisionRecord`. It returns the eight construction results and, when all succeed, a
frozen `spine`. It never throws for a normal construction failure. It is deliberately named with
fixture/spine wording only — there is no `Pipeline`, `Harness`, or `execution` export.

## 5. Fixture ID Strategy

All ids are deterministic caller-provided constants in `PHASE6_FIXTURE_IDS`
(`qi_fixture_001`, `sqp_fixture_001`, …). The fixture generates no ids — no
`crypto.randomUUID`, no `Math.random`, no `Date.now`-derived ids. Downstream `source_*` lineage
ids are set to the exact upstream id constants, so the chain is explicitly connected.

## 6. Fixture Timestamp Strategy

All timestamps are deterministic caller-provided constants in `PHASE6_FIXTURE_TIMESTAMPS`
(ISO-8601 UTC, `2026-07-05T09:00:00Z` … `09:07:00Z`). The fixture generates no timestamps — no
`Date.now`, no `new Date`, no clock source. Repeated builds yield identical timestamp values.

## 7. Lineage Continuity Checks

The test asserts the full lineage map: each downstream `source_*` id equals the exact upstream
artifact id, across all 29 lineage edges from Safe Query Plan → Human Decision (including
`HumanDecisionRecord.source_llm_judgment_record_id === llm_judgment_id === LlmJudgmentRecord.llm_judgment_id`).
A negative test mutates one lineage id in a copied input and asserts the explicit lineage
checker detects the mismatch; a second negative test breaks the judgment-id pair and asserts the
P6-I1 constructor invariant rejects it with `mismatched_llm_judgment_id`.

## 8. Tenant Consistency Checks

Every artifact carries the single `PHASE6_FIXTURE_TENANT_ID`. The test asserts tenant equality
across all eight artifacts. A negative test sets a downstream input's `tenant_id` to a different
value: because P6-I0 validators accept any non-empty tenant_id (cross-tenant lineage checking is
a reserved future persistence-gate concern), construction still succeeds, but the explicit
spine tenant-consistency checker detects the inconsistency.

## 9. Hash and Content Integrity Checks

`sql_hash` and `result_hash` are deterministic 64-character lowercase hex fixtures and are
asserted against `/^[0-9a-f]{64}$/`. `content_integrity_reference` is a deterministic
`sha256:<64 lowercase hex>` fixture asserted against `/^sha256:[0-9a-f]{64}$/`. These are
fixture strings, not real digests, and the fixture computes no hashes at runtime.

## 10. Non-authorization Boundary

A fixture pass authorizes nothing. The `buildValidPhase6Spine` result carries exactly
`{ ok, spine?, results, issues? }` and no grant. Tests assert that neither the result wrapper
nor any artifact carries an authorization/grant key (`approval`, `approved`, `authorized`,
`executed`, `execution`, `promoted`, `promotion`, `truth`, …). The `HumanDecisionRecord` fields
`approval_required` / `promotion_required` / `execution_required` are declarative caller data
(all set consistently with `promotion_required: false`, `execution_required: false`), not grants:
tests confirm `action_readiness_assessment` does not imply execution, `promotion_required: false`
does not imply promotion, `approval_required` does not create an ApprovalStore approval,
`evidence_accepted` does not imply truth, LLM judgment does not imply truth, and a Human Decision
does not imply execution (its `decision_status` is a `ready_for_future_gate_review` queue).
Fixture spine ≠ Runtime pipeline. Fixture pass ≠ Approval. Fixture pass ≠ Execution permission.
Fixture pass ≠ Production readiness.

## 11. What Is Not Implemented

Runtime pipeline, in-memory harness (P6-I3), storage/persistence (P6-I4/I5), D1 execution
(P6-I6), evidence/judgment/decision storage (P6-I7), ledger/graph linkage (P6-I8), approval seam
(P6-I9), query planning, NL2SQL, Safe Query Plan generation, SQL compilation, SQL execution, D1
access, real LLM, GraphRAG, vectorization, ApprovalStore integration, P7.1 TSP wiring, external
actions, and Formal WorkUnit promotion. No app runtime file was added or modified.

## 12. Validation Commands

`node --experimental-strip-types tests/phase6FixtureSpine.test.mts`,
`node --experimental-strip-types tests/phase6PureConstructors.test.mts`, and
`node --experimental-strip-types tests/phase6SharedTypesValidators.test.mts` (isolated), then
`npm test`, `npm run alpha:safety-gate`, `npm run lint`, `npm run build`, `npm run cf:build`,
`npm run electron:build:check`, `git diff --check`, `git status --short`. Results are recorded
in the loop's final report.

## 13. Next Safe Loop

The next safe loop is P6-I3 in-memory non-persistent harness, but only after explicit human Go.
P6-I3 remains test-only in spirit (an in-memory, non-persistent structure that is never imported
from `app/` runtime and adds no storage, D1, SQL, LLM, or execution); it requires this loop's PR
merged first and its own recorded human Go per the playbook.
