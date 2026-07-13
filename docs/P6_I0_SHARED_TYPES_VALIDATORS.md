# P6-I0 Shared Types + Validators

**Loop:** P6-I0 (type_validator_loop per
[`PHASE6_LOOP_ENGINEERING_PLAYBOOK.md`](./PHASE6_LOOP_ENGINEERING_PLAYBOOK.md)).
**Baseline:** `main` @ `00ca406`. **Human Go:**
[`P6_I0_EXPLICIT_HUMAN_GO.md`](./P6_I0_EXPLICIT_HUMAN_GO.md) (recorded before runtime code).

## 1. Purpose

Convert the approved P6.7–P6.14 documentation spine into inert runtime foundations: shared
TypeScript artifact types and fail-closed validators, per
[`PHASE6_IMPLEMENTATION_DECISION_RECORD.md`](./PHASE6_IMPLEMENTATION_DECISION_RECORD.md) §7
("First implementation loop must implement shared TypeScript types and validators only").

## 2. Scope

Types and validators only. No runtime behavior beyond validating plain data.

P6-I0 implements types and validators only.
P6-I0 does not implement constructors.
P6-I0 does not implement runtime pipeline.
P6-I0 does not implement storage.
P6-I0 does not implement D1 access.
P6-I0 does not execute SQL.
P6-I0 does not call real LLM.
P6-I0 does not implement GraphRAG.
P6-I0 does not implement ApprovalStore integration.
P6-I0 does not wire P7.1 TSP utilities.
P6-I0 does not execute external actions.
P6-I0 does not promote Formal WorkUnits.
Validation pass is not approval.
Validation pass is not execution permission.

## 3. Implemented Files

- `app/lib/phase6/artifacts/types.ts` — primitives, literal unions, 8 artifact types.
- `app/lib/phase6/artifacts/validation.ts` — issue codes, `ValidationIssue`,
  `ValidationResult`, primitive validators.
- `app/lib/phase6/artifacts/validators.ts` — declarative field specs + 8 artifact
  validators.
- `app/lib/phase6/artifacts/index.ts` — module surface.
- `tests/phase6SharedTypesValidators.test.mts` — 71 behavioral tests (includes the
  getter-TOCTOU regression and per-enum value-passthrough coverage).
- `docs/P6_I0_EXPLICIT_HUMAN_GO.md`, this document.

No file outside `app/lib/phase6/artifacts/`, `tests/`, and `docs/` was touched. The module
imports nothing outside itself (no `app/lib/domain`, no `app/lib/security/approvalMac`, no
external libraries). The local `TenantId` alias is intentionally independent of
`app/lib/tenant`'s `TenantId`; both erase to `string`.

## 4. Artifact Types

`QueryIntentRecord`, `SafeQueryPlan`, `CompiledSqlArtifact`, `RuleReviewRecord`,
`QueryResultRecord`, `EvidenceReviewRecord`, `LlmJudgmentRecord`, `HumanDecisionRecord` —
each readonly, each carrying `tenant_id`, each downstream type carrying its upstream
lineage ids, each carrying `no_go_flags`. Literal unions with exported runtime value
arrays: `RuleReviewStatus` (grounded in P6.10), `EvidenceReviewStatus` (P6.12),
`LlmJudgmentStatus` (P6.13), `HumanDecisionStatus` (P6.14), `Outcome`, `RedactionState`,
`SourceTrustMarker`, `ConflictState`, `UncertaintyState`, `DecisionImpactScope`.

### 4.1 Human Decision Trusted Type Boundary (P6-FIX-008)

The Human Decision artifact is split into two exported types.
`UnvalidatedHumanDecisionRecordInput` is the structural input shape (safety fields are
ordinary booleans); `ValidatedHumanDecisionRecord` is the opaque, constructor-produced
artifact. `HumanDecisionRecord` is a compatibility alias for `ValidatedHumanDecisionRecord`.

`ValidatedHumanDecisionRecord` statically carries the literal-true safety properties
`four_eyes_required: true` and `self_approval_blocked: true`, plus a module-private opaque
brand (a `unique symbol` phantom property that is never serialized and never exported).
Only `createHumanDecisionRecord` returns this type.

`validateHumanDecisionRecord` is non-narrowing: it returns only `ValidationResult` and never
asserts `input is ValidatedHumanDecisionRecord`. Validator success alone does not create the
trusted type.

Beyond field/enum checks, `HUMAN_DECISION_RECORD_SPEC` runs a cross-field semantic validator
against the already-captured single-read snapshot (no second input read, no mutation),
after ordinary field validation and the generic `no_go_flags` policy. It enforces the
decision_status/decision_outcome matrix (`invalid_decision_status_outcome:decision_status`)
and the impact/gate matrix (`invalid_gate_requirement_combination:<descriptor field>`):
non-action scopes (`no_action_decision`, `clarification_request`, `defer_decision`) require
all three descriptors false; otherwise `promotion_required` and `execution_required` each
imply `approval_required`. Semantic issues are deterministically ordered, de-duplicated by
code+field, and suppressed (cascade prevention) when a prerequisite field is
missing/null/wrong-type/unknown-enum.

## 5. Validator Functions

`validateQueryIntentRecord`, `validateSafeQueryPlan`, `validateCompiledSqlArtifact`,
`validateRuleReviewRecord`, `validateQueryResultRecord`, `validateEvidenceReviewRecord`,
`validateLlmJudgmentRecord`, `validateHumanDecisionRecord`. Each accepts `unknown`,
returns `{ ok, issues }`, never throws for normal invalid input (defensive catch →
`validation_exception`), never mutates input, performs no I/O (no network, file, database,
D1, SQL, LLM, ApprovalStore, TSP, or external action calls), constructs no downstream
artifacts, and writes no audit logs.

## 6. Primitive Validators

`isRecordObject`, `isNonEmptyString`, `isIsoTimestampString`, `isSha256Hex`,
`isContentIntegrityReference`, `isStringArray`, `collectUnknownFieldIssues`
(allowlist-based unknown-field check), `checkPresence` (missing ≠ null),
`validateRequiredString`, `validateRequiredBoolean`, `validateRequiredArray`,
`validateEnumValue`. Style follows the P7.1 validator
(`app/lib/security/approvalMac/canonicalApprovalPayload.ts`) without importing it.

## 7. Unknown Field Policy

Validators reject unknown top-level fields by default for all eight artifact records
(allowlist = the artifact's declared field set; each unknown key yields `unknown_field`).
No existing repo pattern conflicted with this policy.

## 8. No-Go Flag Policy

Non-empty `no_go_flags` fails validation (`no_go_flags_present`) unless the artifact's
status field is explicitly `blocked_no_go`. Artifacts without a status field (Query
Intent, Safe Query Plan, Compiled SQL Artifact, Query Result Record) have no representable
blocked state, so any non-empty `no_go_flags` fails closed.

## 9. Tenant Scope Boundary

`tenant_id` is required on every artifact: missing → `missing_tenant_id`, empty or
non-string → `invalid_tenant_id`. Cross-tenant lineage *checking* requires upstream lookup
and is future-gated (persistence gate); the stable code
`cross_tenant_lineage_not_checked` is reserved for the loop that gains that ability.

## 10. Lineage Boundary

Every upstream reference id (`input_signal_id`, `source_*_id`, `llm_judgment_id`) is
required: missing → `missing_lineage_id`, invalid → `invalid_lineage_id`.

## 11. Hash and Content Integrity Boundary

`sql_hash` and `result_hash` must be 64-character lowercase hex SHA-256
(`invalid_sha256_hex` otherwise); `content_integrity_reference` must be
`sha256:<64 lowercase hex>` (`invalid_content_integrity_reference` otherwise) — the
formats pinned by the decision record §9.

## 12. Non-authorization Boundary

Validation results carry exactly `{ ok, issues }` and nothing else — no approval, no
execution permission, no promotion, no authorization of any kind. Issue messages are
`code:field` only and never echo input values. `action_readiness_assessment` is not
execution; `promotion_readiness_assessment` is not Formal WorkUnit promotion — both are
behaviorally tested.

Getter-TOCTOU hardening (P7.1 F1 precedent): `validateArtifact` reads every own enumerable
top-level property exactly once into a plain snapshot; the unknown-field check, all field
checks, and the no_go_flags policy read that snapshot, so a getter-bearing input cannot
show one value to a field check and another to the policy (regression-tested). P6-I1
constructors consuming validated inputs must apply the same single-read snapshot
discipline before construction.

## 13. What Is Not Implemented

Constructors (P6-I1), fixtures/pipeline (P6-I2), in-memory harness (P6-I3), storage
(P6-I4/I5), D1 execution (P6-I6), evidence/judgment/decision storage (P6-I7),
ledger/graph linkage (P6-I8), approval seam (P6-I9), real LLM, GraphRAG, vectorization,
ApprovalStore integration, TSP wiring, external actions, WorkUnit promotion.

## 14. Validation Commands

`node --experimental-strip-types tests/phase6SharedTypesValidators.test.mts` (isolated),
then `npm test`, `npm run alpha:safety-gate`, `npm run lint`, `npm run build`,
`npm run cf:build`, `npm run electron:build:check`, `git diff --check`,
`git status --short`. Results are recorded in the loop's final report.

## 15. Next Safe Loop

P6-I1 — pure artifact constructors with no storage (pure functions over these validated
types; separate PR; requires this loop's PR merged first per the playbook).
