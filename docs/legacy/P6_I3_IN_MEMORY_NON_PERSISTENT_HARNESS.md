# P6-I3 In-memory Non-persistent Harness

**Loop:** P6-I3 (harness_loop per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Builds on:** P6-I0 (PR #88), P6-I1 (PR #89), and P6-I2 (PR #90), all merged into `main`.
**Human Go:** [`P6_I3_EXPLICIT_HUMAN_GO.md`](./P6_I3_EXPLICIT_HUMAN_GO.md) (recorded before
harness/test code).

## 1. Purpose

Provide a reusable, test-only, in-memory, non-persistent harness that runs the eight P6-I1
constructors in spine order over caller-provided fixture inputs, records each stage result,
stops safely on failure, and returns a structured non-authorizing result. P6-I2 proved one
deterministic spine could be assembled; P6-I3 makes that assembly reusable and exercises its
controlled failure behavior — still without any product runtime, storage, or execution.

P6-I3 implements a test-only in-memory non-persistent harness.
P6-I3 does not implement a product runtime pipeline.
P6-I3 does not implement storage.
P6-I3 does not implement persistence.
P6-I3 does not implement D1 access.
P6-I3 does not execute SQL.
P6-I3 does not call real LLM.
P6-I3 does not implement GraphRAG.
P6-I3 does not implement ApprovalStore integration.
P6-I3 does not wire P7.1 TSP utilities.
P6-I3 does not execute external actions.
P6-I3 does not promote Formal WorkUnits.
P6-I3 does not modify app runtime.
Harness pass is not approval.
Harness pass is not execution permission.
Harness pass is not production readiness.

## 2. Scope

Test-support only. No app runtime file is added or modified. The harness lives only under
`tests/harness/phase6/`, imports only the P6-I2 fixture and the Phase 6 artifact module surface,
is never exported from or imported by `app/`, stores nothing, generates no ids and no timestamps,
performs no I/O, and authorizes nothing. It is an in-memory harness — not a product runtime
pipeline.

## 3. Implemented Files

- `tests/harness/phase6/inMemoryPhase6Harness.mts` — the harness: `PHASE6_HARNESS_STAGE_ORDER`,
  `PHASE6_HARNESS_NON_AUTHORIZATION_STATEMENT`, the types (`Phase6HarnessStageName`,
  `Phase6HarnessStageResult`, `Phase6HarnessInputSet`, `Phase6HarnessOptions`,
  `Phase6HarnessRunResult`, `Phase6HarnessRunSummary`), `phase6HarnessInputSetFromFixture`,
  `runPhase6InMemoryHarness`, `summarizePhase6HarnessRun`, `collectPhase6HarnessArtifacts`, and
  `assertPhase6HarnessNonAuthorizingShape`.
- `tests/phase6InMemoryHarness.test.mts` — 33 behavioral tests (the loop-spec matrix 1–33).
- `docs/legacy/P6_I3_EXPLICIT_HUMAN_GO.md`, this document.

No app runtime file, and no P6-I0/P6-I1/P6-I2 file, was modified.

## 4. In-memory Harness

`runPhase6InMemoryHarness(inputs, options?)` maps each stage name to its P6-I1 constructor,
calls each constructor once in spine order over the provided input, records a
`{ stage, ok, issues }` stage result, and (when `include_artifacts` is true) accumulates the
constructed frozen artifacts. It never throws for a normal construction/validation failure. The
only place any constructed artifact exists is inside the returned result object — nothing is
stored, cached, or written anywhere. The exported names use harness wording only (no `Pipeline`,
`RuntimePipeline`, `runtime`, or `execution`).

## 5. Harness Stage Order

`PHASE6_HARNESS_STAGE_ORDER` = `query_intent`, `safe_query_plan`, `compiled_sql_artifact`,
`rule_review_record`, `query_result_record`, `evidence_review_record`, `llm_judgment_record`,
`human_decision_record`. Stages run in exactly this order.

## 6. Harness Input Strategy

`Phase6HarnessInputSet` is the eight constructor inputs keyed by stage name.
`phase6HarnessInputSetFromFixture` derives it from the P6-I2 `buildValidPhase6SpineInputs`
(fresh copies per call), so callers set up failure cases by mutating a local copy. All ids and
timestamps come from the caller-provided fixture; the harness generates none.

## 7. Stop-on-failure Behavior

Default `stop_on_first_failure: true`. On the first failing stage the harness sets `stopped_at`
to that stage, records the failure, and does not call any downstream constructor — the run ends
with `ok: false`, the partial `stages` list, and the failure's issues. No approval, execution, or
promotion grant is ever produced on a failed (or successful) run.

## 8. Multi-failure Collection Mode

With `stop_on_first_failure: false` the harness runs all eight stages regardless of failures and
collects every failing stage's issues, so a single run can report multiple independent failures
(`stopped_at` stays `null`, `ok` is `false`).

## 9. Determinism and Non-persistence

Given the same input set the harness produces a deep-equal result every run (constructors are
pure; the harness adds no clock, id, or random source). It persists nothing: no file, no
database, no D1, no module-level mutable store — the constructed artifacts live only inside the
returned object. `Object.freeze`d artifacts from the constructors remain frozen;
`collectPhase6HarnessArtifacts` returns a shallow copy so the caller cannot mutate the result's
array.

## 10. Tenant and Lineage Checks

The tests assert tenant consistency and full lineage continuity across a successful run's
collected artifacts, and exercise controlled failures — missing `tenant_id`, invalid lineage id,
mismatched `source_llm_judgment_record_id`, invalid `result_hash`, invalid
`content_integrity_reference`, and the `no_go_flags` policy — confirming each fails safely at the
correct stage with the correct issue and no grant.

## 11. Non-authorization Boundary

Every run result carries `{ ok, stages, stopped_at, issues, artifacts?, non_authorization_statement }`
and a fixed `non_authorization_statement` ("Harness pass is not approval … not production
readiness. AI proposes. Rules guard. Humans decide."). Neither the result nor the summary carries
any grant-like key (`approval`, `approved`, `authorized`, `execution_permission`, `executed`,
`promotion_permission`, `promoted`, `external_action_permission`, `formal_workunit_promotion`);
`assertPhase6HarnessNonAuthorizingShape` enforces this and the tests use it. Summaries include
only stage names, an issue count, and stable issue codes — never issue messages or input values —
so secret-like values cannot leak. In-memory harness ≠ Product runtime pipeline. Harness pass ≠
Approval. Harness pass ≠ Execution permission. Harness pass ≠ Formal WorkUnit promotion. Harness
pass ≠ Production readiness.

## 12. What Is Not Implemented

Product runtime pipeline, storage, persistence, D1 access, SQL execution, real LLM, GraphRAG,
vectorization, ApprovalStore integration, P7.1 TSP wiring, external actions, and Formal WorkUnit
promotion. No app runtime file was added or modified; `app/` neither imports nor references the
harness (a test asserts this by read-only inspection of every `app/` source file).

## 13. Validation Commands

`node --experimental-strip-types tests/phase6InMemoryHarness.test.mts`,
`node --experimental-strip-types tests/phase6FixtureSpine.test.mts`,
`node --experimental-strip-types tests/phase6PureConstructors.test.mts`, and
`node --experimental-strip-types tests/phase6SharedTypesValidators.test.mts` (isolated), then
`npm test`, `npm run alpha:safety-gate`, `npm run lint`, `npm run build`, `npm run cf:build`,
`npm run electron:build:check`, `git diff --check`, `git status --short`. Results are recorded in
the loop's final report.

## 14. Next Safe Loop

The next safe loop is P6-I4 storage gate spec, not storage implementation. P6-I4 is a docs +
static-test loop that specifies the tenant-scoped storage/persistence gate (what it must and must
not do) before any storage code is written; it requires this loop's PR merged first and its own
recorded human Go per the playbook. No storage, D1, SQL, LLM, execution, or approval is
implemented at P6-I4.
