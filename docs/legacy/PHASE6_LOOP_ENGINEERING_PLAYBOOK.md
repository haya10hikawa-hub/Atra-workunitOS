# Phase 6 Loop Engineering Playbook

**Phase:** P6.15. **Baseline:** `main` @ `e9bf288`.

Defines the controlled loop workflow every Phase 6 implementation step must follow. Pairs
with
[`PHASE6_IMPLEMENTATION_DECISION_RECORD.md`](./PHASE6_IMPLEMENTATION_DECISION_RECORD.md),
which decides *what* may be implemented and in what order; this playbook decides *how* each
loop runs, what it must produce, and when it must stop. Documentation and a static test
only.

> This playbook is process, not permission. Following it perfectly still authorizes
> nothing: every capability stays behind its own gate, every PR stays unmerged until a
> human merges it.

---

## 1. Purpose

The established P1–P7.2A cadence (baseline verification → scoped change → isolated tests →
full validation → four audits → PR → human merge) has held safety boundaries across 18
consecutive phases. This playbook writes that cadence down as the mandatory template for
Phase 6 implementation loops, so it survives context resets, model changes, and operator
handoffs.

Loop Engineering for Phase 6 is the controlled practice of implementing one narrow, non-authorizing capability per loop, with explicit scope, isolated tests, full validation, audits, and stop conditions before the next loop begins.

Phase 6のLoop Engineeringとは、各loopで一つの狭い非認可capabilityだけを実装し、scope・isolated tests・full validation・audits・stop conditionsを明示してから次のloopへ進む制御された実装手法である。

## 2. Scope

- **In scope:** loop principles, loop types, the standard loop template, required inputs
  and outputs, validation and audit requirements, stop conditions, PR slicing, regression
  protection, and the human review / merge policy for Phase 6 implementation.
- **Out of scope:** the implementation decisions themselves (see the decision record), any
  runtime code, and any capability enablement.

## 3. Definition of Loop Engineering for Phase 6

A loop is one bounded unit of work: one objective, one branch, one PR, one final report —
entered only when its dependencies are merged, exited only when validation and audits pass
or a stop condition fires. Loops compose the P6-I0…P6-I9 sequence of the decision record;
no loop may begin a later step while an earlier step's PR is unmerged or its stop condition
is unresolved.

## 4. What Loop Engineering Is Not

Loop Engineering is **not**:

- background autonomous implementation
- unbounded agent execution
- runtime authorization
- external action execution
- deployment automation
- merge automation
- bypass of human review
- replacement for tests
- replacement for audits

## 5. Loop Principles

One loop, one objective.

One loop, one PR.

No mixed docs/runtime changes unless explicitly allowed.

No storage before types and validators.

No execution before validation.

No real LLM before mockless readiness gates.

No ApprovalStore wiring before approval seam gates.

No external action before execution gates.

Stop on ambiguity.

Stop on forbidden path changes.

Stop on validation failure.

Term note: "mockless readiness gates" means the separate real LLM enablement gate together
with the requirements of the existing real-LLM readiness gate
(`docs/REAL_LLM_READINESS_GATE.md`) — i.e. real providers stay No-Go until that gate opens;
mock/fixture providers that call no external service are the only LLM shape any Phase 6
loop may touch.

## 6. Loop Types

- docs_only_spec_loop
- type_validator_loop
- pure_constructor_loop
- fixture_pipeline_loop
- in_memory_harness_loop
- storage_gate_loop
- persistence_implementation_loop
- execution_gate_loop
- approval_seam_loop
- release_readiness_loop

Only `docs_only_spec_loop` and `type_validator_loop` are eligible until P6-I0 is merged;
each later type unlocks only when the decision record's sequence reaches it.

## 7. Standard Loop Template

Every loop is specified, before work begins, with:

- loop_id
- phase
- objective
- allowed_files
- forbidden_files
- dependencies
- implementation_boundary
- non_authorization_boundary
- tests_required
- validation_required
- audits_required
- rollback_plan
- stop_conditions
- PR_title
- PR_body
- final_report

## 8. Required Loop Inputs

- merged dependency PRs
- foundation docs
- existing runtime inventory
- allowed file list
- forbidden file list
- expected test plan
- expected validation commands
- expected audit criteria
- explicit Go / No-Go conditions

Dependency PR merge state must be verified with `gh pr view` at loop start — never assumed.

## 9. Required Loop Outputs

- changed files list
- isolated test result
- full validation result
- audit matrix
- risk summary
- PR number
- validate result
- final Go / No-Go

## 10. Validation Requirements

Every loop must run isolated tests.

Every loop must run npm test.

Every loop must run alpha:safety-gate.

Every loop must run lint.

Every loop must run build.

Every loop must run cf:build.

Every loop must run electron:build:check.

Every loop must run git diff --check.

Every loop must report git status --short.

After any audit-driven change, full validation must be rerun before the PR is created.

## 11. Audit Requirements

Every loop must run security-red-team-auditor.

Every loop must run test-validation-auditor.

Every loop must run architecture-mapper.

Every loop must run product-release-auditor.

If an auditor is unavailable, use the closest available agent and explicitly state the substitution.

Audit claims about repository state (HEAD, branch, file existence) must be independently
re-verified before being relied on; audit findings that require changes trigger a
re-validation cycle.

## 12. Stop Conditions

- dependency_not_merged
- forbidden_path_changed
- runtime_authorization_added
- external_action_added
- real_llm_enabled
- d1_execution_added
- sql_execution_added
- storage_added_without_gate
- migration_added_without_gate
- validation_failed
- audit_failed
- unclear_mapping
- tenant_boundary_ambiguous
- lineage_boundary_ambiguous
- rollback_missing

When a stop condition fires, the loop reports No-Go with evidence and does not proceed to
PR creation; a fired stop condition is never overridden inside the same loop.

## 13. PR Slicing Strategy

P6-I0 must contain only types, validators, docs, and tests.

P6-I1 must contain only pure constructors and tests.

P6-I2 must contain only fixtures and pipeline tests.

P6-I3 must contain only in-memory harness code and tests.

The P6-I3 harness is test-only: it must not be imported from `app/` runtime code, must not
be mounted in any route or UI, and must not become a shadow pipeline that normalizes
execution ahead of its gates.

Storage must be a separate PR.

D1 execution must be a separate PR.

LLM runtime must be a separate PR.

Approval seam must be a separate PR.

External action execution must not be part of Phase 6 implementation loops.

## 14. Regression Protection Strategy

Static docs gates remain active.

Existing P6 tests must remain passing.

Existing P7.1 tests must remain passing.

No loop may weaken Main Safety Gate.

No loop may modify workflows without a separate gate.

No loop may remove non-authorization statements.

No loop may weaken tenant scope.

No loop may weaken human review boundaries.

## 15. Human Review and Merge Policy

No loop may merge itself.

Human review is required before merge.

SubAgent audit pass is not human approval.

CI pass is not human approval.

Claude Code final report is not human approval.

## 16. Loop Sequence for Phase 6 Implementation

1. P6-I0 shared type definitions and validators.
2. P6-I1 pure artifact constructors.
3. P6-I2 fixture-based spine construction.
4. P6-I3 in-memory non-persistent pipeline harness.
5. P6-I4 storage gate spec.
6. P6-I5 persistence implementation gate.
7. P6-I6 D1 read-only execution implementation gate.
8. P6-I7 evidence / judgment / decision storage gate.
9. P6-I8 ledger / graph linkage gate.
10. P6-I9 query-lineage approval seam gate.

## 17. Non-authorization Statement

This Phase 6 Loop Engineering Playbook authorizes no runtime implementation by itself, no SQL execution, no D1 access, no real LLM enablement, no GraphRAG implementation, no vectorization, no ApprovalStore integration, no external action execution, no Formal WorkUnit promotion, no deployment, no merge automation, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](../archive/v0/NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
