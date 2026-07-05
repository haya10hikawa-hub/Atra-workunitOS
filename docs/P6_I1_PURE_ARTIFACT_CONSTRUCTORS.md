# P6-I1 Pure Artifact Constructors

**Loop:** P6-I1 (pure_constructor_loop per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Builds on:** P6-I0 ([`P6_I0_SHARED_TYPES_VALIDATORS.md`](./P6_I0_SHARED_TYPES_VALIDATORS.md),
PR #88, merged into `main`). **Human Go:**
[`P6_I1_EXPLICIT_HUMAN_GO.md`](./P6_I1_EXPLICIT_HUMAN_GO.md) (recorded before runtime code).

## 1. Purpose

Convert the P6-I0 validated artifact types into deterministic, non-authorizing,
side-effect-free constructors for the eight Phase 6 artifacts. Each constructor assembles
exactly one artifact from caller-provided ids and timestamps, validates it with the matching
P6-I0 validator, and returns a structured `ConstructionResult`.

P6-I1 implements pure artifact constructors only.
P6-I1 does not implement runtime pipeline.
P6-I1 does not implement storage.
P6-I1 does not implement D1 access.
P6-I1 does not execute SQL.
P6-I1 does not call real LLM.
P6-I1 does not implement GraphRAG.
P6-I1 does not implement ApprovalStore integration.
P6-I1 does not wire P7.1 TSP utilities.
P6-I1 does not execute external actions.
P6-I1 does not promote Formal WorkUnits.
Constructors do not generate ids.
Constructors do not generate timestamps.
Constructors require caller-provided ids.
Constructors require caller-provided timestamps.
Constructor success is not approval.
Constructor success is not execution permission.
Constructor success is not Formal WorkUnit promotion.
Constructor success is not pipeline execution.

## 2. Scope

Pure functions over the P6-I0 validated types. No runtime behavior beyond assembling and
validating plain data. Constructors connect nothing, persist nothing, and execute nothing.
They are not a pipeline: each call builds one artifact and returns it; callers are not chained
automatically.

## 3. Implemented Files

- `app/lib/phase6/artifacts/construction.ts` — `ConstructionResult` types and shared helpers.
- `app/lib/phase6/artifacts/constructors.ts` — the eight `create*` constructors.
- `app/lib/phase6/artifacts/index.ts` — surface extended to re-export both new modules
  (the only P6-I0 file touched; no P6-I0 type or validator was modified).
- `tests/phase6PureConstructors.test.mts` — behavioral tests (cases 1–30 of the loop spec).
- `docs/P6_I1_EXPLICIT_HUMAN_GO.md`, this document.

No file outside `app/lib/phase6/artifacts/`, `tests/`, and `docs/` was touched. The new
modules import nothing outside `app/lib/phase6/artifacts/` — no `app/lib/domain`, no
`app/lib/security/approvalMac` (P7.1), no external libraries.

## 4. Constructor Functions

`createQueryIntentRecord`, `createSafeQueryPlan`, `createCompiledSqlArtifact`,
`createRuleReviewRecord`, `createQueryResultRecord`, `createEvidenceReviewRecord`,
`createLlmJudgmentRecord`, `createHumanDecisionRecord`. Each is a thin allowlisted object
builder over the P6-I0 artifact field set (the P6-I0 `types.ts` definitions are the source of
truth): it copies only allowlisted fields present in the single-read snapshot, so unknown input
fields are dropped and missing fields stay absent (fail-closed at validation). Constructors do
not infer, backfill, or synthesize any field — not ids, timestamps, tenant_id, lineage,
authorization, action readiness, promotion readiness, evidence truth, or a human decision.

## 5. ConstructionResult Contract

`ConstructionResult<T>` is a discriminated union:

- success — `{ ok: true, artifact: T, issues: readonly [] }` (artifact frozen).
- failure — `{ ok: false, issues: readonly ConstructionIssue[] }` (no artifact).

`ConstructionIssue` is `{ code, field, message }`; `message` is structural
(`code:field` or `output_validation_failed:<validationCode>:<field>`) and never echoes input
values. Stable construction issue codes: `invalid_constructor_input`,
`missing_constructor_input`, `validation_failed`, `output_validation_failed`,
`mismatched_llm_judgment_id`, `constructor_exception`. Helpers: `snapshotConstructorInput`,
`freezeConstructedArtifact`, `validationIssuesToConstructionIssues`, `failConstruction`,
`passConstruction`, `ensureHumanDecisionJudgmentIdConsistency`. A constructor never throws for
normal invalid input; an unexpected internal failure maps to `constructor_exception`.

## 6. ID Source-of-Truth Decision

Constructors never generate ids. Every id — `query_intent_id`, `safe_query_plan_id`,
`compiled_sql_artifact_id`, `rule_review_record_id`, `query_result_record_id`,
`evidence_review_id`, `llm_judgment_id`, `human_decision_id`, and every `source_*` lineage id —
is a caller-provided constructor input. No constructor calls `crypto.randomUUID`, `randomUUID`,
`Math.random`, `Date.now`, or any id-generation helper. A missing id is not backfilled; the
matching validator fails closed (`missing_required_field` / `missing_lineage_id`).

## 7. Timestamp Source-of-Truth Decision

Constructors never generate timestamps. Every timestamp — `created_at`, `reviewed_at`,
`judged_at`, `reviewed_by_human_at` — is a caller-provided constructor input. No constructor
calls `Date.now`, `new Date()`, `performance.now`, `Temporal.now`, or any clock source. A
missing timestamp is not backfilled; the matching validator fails closed.

## 8. Single-read Snapshot Policy

Every constructor first calls `snapshotConstructorInput`, which reads each own enumerable
top-level property of the input exactly once into a plain object (no `JSON.stringify`, explicit
null preserved, input never mutated, prototype chain not consulted). All construction logic
reads only from that snapshot, so a getter-bearing input cannot show one value to construction
and another to validation — the getter-TOCTOU hardening established by the P6-I0 validator
finding (F1), applied at the constructor layer.

## 9. Output Validation Policy

Every constructor calls its matching P6-I0 validator on the constructed artifact before
returning success:

| Constructor | Validator |
|---|---|
| `createQueryIntentRecord` | `validateQueryIntentRecord` |
| `createSafeQueryPlan` | `validateSafeQueryPlan` |
| `createCompiledSqlArtifact` | `validateCompiledSqlArtifact` |
| `createRuleReviewRecord` | `validateRuleReviewRecord` |
| `createQueryResultRecord` | `validateQueryResultRecord` |
| `createEvidenceReviewRecord` | `validateEvidenceReviewRecord` |
| `createLlmJudgmentRecord` | `validateLlmJudgmentRecord` |
| `createHumanDecisionRecord` | `validateHumanDecisionRecord` |

If validation fails, the constructor returns a failed `ConstructionResult` whose issues map
the P6-I0 `ValidationIssue` values under `output_validation_failed` (preserving the stable
validation code in the message for traceability). A constructor never returns `ok: true` with
an invalid artifact.

## 10. Human Decision Judgment ID Consistency

`createHumanDecisionRecord` enforces a constructor-level invariant (not a runtime approval
rule): `source_llm_judgment_record_id` must equal `llm_judgment_id`. After output validation
passes, it runs `ensureHumanDecisionJudgmentIdConsistency` before returning success; a mismatch
fails closed with the stable code `mismatched_llm_judgment_id`. Absence of either id is never
treated as consistent — both are required by the record, so the matching validator reports the
precise missing/invalid lineage issue and the standalone helper also fails closed.

## 11. Non-authorization Boundary

A `ConstructionResult` carries exactly `{ ok, artifact?, issues }` and nothing else — no
approval, no execution permission, no promotion, no authorization of any kind. Constructor
success is not approval, not execution permission, not Formal WorkUnit promotion, and not
pipeline execution. Issue messages are structural only and never echo input values, so
secret-like values cannot leak through construction output. The `HumanDecisionRecord` fields
`approval_required` / `promotion_required` / `execution_required` are declarative caller data,
not grants: the constructor copies them verbatim and authorizes nothing.

## 12. What Is Not Implemented

Fixtures/spine tests (P6-I2), in-memory harness (P6-I3), storage (P6-I4/I5), D1 execution
(P6-I6), evidence/judgment/decision storage (P6-I7), ledger/graph linkage (P6-I8), approval
seam (P6-I9), runtime pipeline, query planning, NL2SQL, Safe Query Plan generation, SQL
compilation, SQL execution, D1 access, real LLM, GraphRAG, vectorization, ApprovalStore
integration, P7.1 TSP wiring, external actions, and Formal WorkUnit promotion.

## 13. Validation Commands

`node --experimental-strip-types tests/phase6PureConstructors.test.mts` and
`node --experimental-strip-types tests/phase6SharedTypesValidators.test.mts` (isolated), then
`npm test`, `npm run alpha:safety-gate`, `npm run lint`, `npm run build`, `npm run cf:build`,
`npm run electron:build:check`, `git diff --check`, `git status --short`. Results are recorded
in the loop's final report.

## 14. Next Safe Loop

P6-I2 — fixture-based spine tests: assemble the eight constructors into a single validated
example spine using shared fixtures (test-only; no app import outside
`app/lib/phase6/artifacts/`; separate PR; requires this loop's PR merged first per the
playbook). No storage, no pipeline, no execution.
