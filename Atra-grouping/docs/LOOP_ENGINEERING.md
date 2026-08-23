# Loop Engineering Playbook

This project should be developed as an evaluation-driven loop, not as a one-pass build. Each loop has a builder, an independent verifier, a scoped fixer, and a next-phase planner.

Use `docs/BRIDGE_AUTOMATION.md` when the handoff between those roles should be generated automatically from the latest agent report, including autonomous bridge-loop mode that stops only for true human decisions.

## Goal

Move from MVP to production readiness by repeatedly answering:

1. What did we build?
2. Does it satisfy the documented contract?
3. What failed or remains risky?
4. What exact patch should happen next?
5. Did the patch actually fix the issue without creating new leakage or drift?

The loop ends only when the current milestone's done criteria pass and the next milestone is explicitly selected.

## Roles

### Builder

Builds a scoped phase from `docs/DEVELOPMENT_START.md`, `docs/MVP_PLAN.md`, or `docs/BEYOND_MVP_ROADMAP.md`.

Recommended model:

- `gpt-5.6-sol` with high reasoning for schema, Gold workflow, release, leakage, and architecture
- `gpt-5.6-terra` with high or medium reasoning for ordinary implementation

### Verifier

Reviews the builder's output independently. The verifier should run tests and inspect boundaries, not just read the final summary.

Recommended model:

- `gpt-5.6-sol` with high reasoning for first verification and release reviews
- `gpt-5.6-terra` with high reasoning for narrower re-checks

### Fixer

Fixes only the verifier's blocking issues. The fixer should avoid broad refactors.

Recommended model:

- `gpt-5.6-terra` with high reasoning for most fix passes
- `gpt-5.6-sol` with high reasoning if the fix affects schemas, leakage, release immutability, or annotation blindness

### Planner

Converts the latest verified state into the next phase. The planner does not code unless explicitly asked.

Recommended model:

- `gpt-5.6-sol` with high reasoning

## Loop states

Use these states in every report:

- `BUILDING`
- `VERIFYING`
- `FIXING`
- `REVERIFYING`
- `READY_FOR_NEXT_PHASE`
- `BLOCKED_ON_DECISION`
- `BLOCKED_ON_EXTERNAL_ACCESS`

## Stop conditions

Stop and ask for a decision only when all unaffected work is complete and:

- a source license/export rule is unknown and affects implementation
- a runtime/storage/model choice would create incompatible architecture
- every remaining task requires private credentials or restricted source access
- a semantic rule would need to change
- an ADR is required before continuing

Do not stop just because the MVP passes. Continue to the next milestone or produce the next prompt from `docs/BEYOND_MVP_ROADMAP.md`.

Do not stop an entire build because one provider or hosted inference path is unavailable. Complete the production adapter, hermetic contract tests, local/public-data path, disabled/error UI states, and activation runbook; record live verification as `NOT_RUN_EXTERNAL`; then advance through every independent phase in `docs/PRODUCTION_BUILD_PLAN.md`.

## Loop protocol

### Step 1: Build

Run one scoped coding prompt. The builder must output:

- files changed
- commands run
- tests passed or failed
- remaining risks
- next recommended verification prompt

### Step 2: Verify

Run an independent verification prompt. The verifier must output:

- verdict: `PASS`, `PASS WITH RISKS`, or `FAIL`
- blocking issues with file paths and line numbers
- non-blocking risks
- missing ADRs or decisions
- exact next fix prompt

### Step 3: Fix

Run only the fix prompt derived from blocking issues. The fixer must output:

- issues addressed
- files changed
- commands run
- remaining failures

### Step 4: Reverify

Run verification again, narrowed to the changed areas plus regression checks. The reverifier must output:

- whether each blocking issue is fixed
- whether tests still pass
- whether any new risk was introduced
- whether the phase can advance

### Step 5: Advance

If the phase passes, choose the next prompt:

- for MVP work, continue through `docs/DEVELOPMENT_START.md`
- after MVP, continue through `docs/BEYOND_MVP_ROADMAP.md`
- if a decision is missing, create or request an ADR

## Three-stage execution plan

Use these stages when the project has a partial foundation and needs to move toward the final production-quality platform.

### Stage 1: Foundation repair

Purpose:

- fix anything that makes the contract scaffold unreliable
- make source/chunk provenance enforceable
- make required calibration fixtures complete
- make build and tests cover future workspaces

Do not implement the full MVP in this stage.

Exit criteria:

- source and chunk cross-entity validators reject bad IDs, bad hashes, and invalid text slices
- required challenge buckets from `docs/SAMPLING_AND_QA.md` have fixtures and tests
- build/typecheck will include backend, frontend, and evaluation code once source files exist
- existing tests, lint, build, audit, and diff checks pass
- verifier returns `PASS` or `PASS WITH RISKS` for foundation readiness

Recommended model:

- builder/fixer: `gpt-5.6-sol` high if touching schema or validators; otherwise `gpt-5.6-terra` high
- verifier: `gpt-5.6-sol` high

### Stage 2: MVP completion

Purpose:

- implement the full documented MVP pipeline

Scope:

- connector interfaces and first fixture connectors
- provider-aware chunking
- deterministic candidate creation
- gte/Ettin stage interfaces with pinned config and test doubles
- sampling and deduplication
- blind annotation payload/API
- dual assignment
- append-only annotation persistence
- adjudication
- freeze/export
- read-only evaluation harness

Exit criteria:

- a two-source synthetic or authorized snapshot runs end-to-end twice deterministically
- annotator payloads hide scores, ranks, sample buckets, peer labels, and Gold state
- release validation blocks incomplete or non-adjudicated pairs
- evaluation runs read-only against a frozen fixture release
- MVP integration verifier returns `PASS` or `PASS WITH RISKS`

Recommended model:

- architecture and Gold workflow: `gpt-5.6-sol` high
- connectors, retrieval, frontend, evaluation implementation: `gpt-5.6-terra` high
- final MVP verifier: `gpt-5.6-sol` high

### Stage 3: Production expansion

Purpose:

- move beyond MVP toward the final platform described in `docs/BEYOND_MVP_ROADMAP.md`

Scope:

- production storage and release lineage
- source access policy and export modes
- connector expansion for QMSum, SmartSHARK, AMI, ECB+, and MAVEN-ERE
- annotation operations and calibration
- sampling quota maturity and work-family split management
- evaluation regression across Atra model versions
- security, privacy, redaction, observability, and release governance

Exit criteria:

- post-MVP roadmap phases are converted into concrete implementation backlogs
- required ADRs exist for storage, source policy, model config, identity, split policy, confidence, and sampling
- real connector expansion is blocked only by explicit source access/licensing decisions
- release lineage and governance are auditable
- production-readiness verifier returns `READY TO CONTINUE`

Recommended model:

- planner and verifier: `gpt-5.6-sol` high
- implementation: `gpt-5.6-terra` high, escalating to `gpt-5.6-sol` high for governance, leakage, release, or schema decisions

## Stage 1 foundation repair prompt

```text
Use docs/LOOP_ENGINEERING.md.

You are the scoped fixer for Atra's Gold Set Annotation Platform.

Repository:
/Users/sotanakano/Atra-workunitOS/Atra-grouping

Read:
- AGENTS.md
- docs/README.md
- docs/DESIGN.md
- docs/SAMPLING_AND_QA.md
- docs/OPEN_DECISIONS.md
- docs/LOOP_ENGINEERING.md
- packages/source-contracts/src/index.ts
- packages/candidate-contracts/src/index.ts
- packages/gold-contracts/src/index.ts
- fixtures/src/index.ts
- tests/*.test.ts
- tsconfig.build.json

Verifier report:
<paste the verification report here>

Goal:
Fix the foundation blocking issues before continuing to Phase 2. This is Stage 1: Foundation repair. Do not implement the full MVP yet.

Prioritize:
1. Add cross-entity validators for SourceRecord and Chunk integrity:
   - source_record_id consistency
   - source content_hash consistency
   - chunk_id consistency
   - chunk content_hash consistency
   - chunk offsets/text matching the referenced SourceRecord

2. Expand synthetic fixtures to cover all required challenge buckets from docs/SAMPLING_AND_QA.md:
   - same_identifier_different_work
   - same_people_time_different_work
   - paraphrase_related_not_same
   - contradictory_unknown
   - easy_positive_control

3. Update tests so these failures are caught automatically.

4. Update build/typecheck coverage so future backend, frontend, and evaluation source trees cannot be silently excluded.

Rules:
- Do not implement the full MVP yet.
- Do not change documented semantics.
- Do not introduce Gold label leakage into retrieval.
- Keep the fix scoped to foundation quality.
- Do not commit unless explicitly asked.

Verify:
- npm ci if needed
- npm run test
- npm run lint
- npm run build
- npm audit
- git diff --check
- git status --short --untracked-files=all

Output:
- state: FIXING
- stage: Stage 1 Foundation repair
- files changed
- issues fixed
- commands run and results
- remaining risks
- exact reverify prompt
```

## Stage 2 MVP completion prompt

```text
Use docs/LOOP_ENGINEERING.md.

You are the MVP builder for Atra's Gold Set Annotation Platform.

Repository:
/Users/sotanakano/Atra-workunitOS/Atra-grouping

Read:
- AGENTS.md
- docs/README.md
- docs/DESIGN.md
- docs/MVP_PLAN.md
- docs/LABEL_GUIDELINES.md
- docs/SOURCE_PLAN.md
- docs/SAMPLING_AND_QA.md
- docs/OPEN_DECISIONS.md
- docs/LOOP_ENGINEERING.md
- all subtree AGENTS.md files

Previous verification summary:
<paste the Stage 1 reverify report here>

Goal:
Complete the documented MVP pipeline after foundation readiness passes.

Implement:
- source snapshot and connector interfaces
- deterministic Public Jira, OpenTelemetry GitHub, and Google Docs fixture connectors
- provider-aware chunking
- candidate creation with gte/Ettin stage interfaces and deterministic test doubles
- sampling, deduplication, and challenge bucket handling
- blinded annotator payload generation
- blind dual assignment
- append-only annotation persistence
- adjudication routing
- release validation and immutable freeze/export skeleton
- read-only evaluation harness for frozen fixture releases

Rules:
- Preserve Gold evaluation-only behavior.
- Do not expose model scores, ranks, sample buckets, peer labels, or Gold state to annotators.
- Do not tune retrieval or thresholds using frozen Gold labels.
- Do not commit restricted source content.
- Do not skip validation just to make the demo pass.

Verify:
- npm ci if needed
- npm run test
- npm run lint
- npm run build
- npm audit
- run any end-to-end fixture command if created
- git diff --check
- git status --short --untracked-files=all

Output:
- state: BUILDING
- stage: Stage 2 MVP completion
- files changed
- MVP flow implemented
- commands run and results
- remaining risks
- exact independent verification prompt
```

## Stage 3 production expansion prompt

```text
Use docs/LOOP_ENGINEERING.md.

You are the production-expansion planner and builder for Atra's Gold Set Annotation Platform.

Repository:
/Users/sotanakano/Atra-workunitOS/Atra-grouping

Read:
- AGENTS.md
- docs/README.md
- docs/DESIGN.md
- docs/MVP_PLAN.md
- docs/BEYOND_MVP_ROADMAP.md
- docs/OPEN_DECISIONS.md
- docs/LOOP_ENGINEERING.md
- latest MVP verification report
- current implementation

Goal:
Do not stop at MVP. Move the platform toward its final production-ready form.

First produce a short implementation plan, then implement only the first safe post-MVP slice.

Consider:
- production storage and release lineage
- source access policy and export modes
- connector expansion for QMSum, SmartSHARK, AMI, ECB+, and MAVEN-ERE
- annotation calibration and queue operations
- sampling quota maturity and work-family split management
- evaluation regression across Atra model versions
- security, privacy, redaction, observability, and release governance
- runbooks and report templates

Rules:
- If a decision needs an ADR, add the ADR before implementation.
- Do not weaken Gold evaluation-only behavior.
- Do not introduce label leakage.
- Do not touch credentials or restricted raw sources.
- Keep each implementation slice reviewable.

Verify:
- npm ci if needed
- npm run test
- npm run lint
- npm run build
- npm audit
- relevant new checks for the slice
- git diff --check
- git status --short --untracked-files=all

Output:
- state: BUILDING
- stage: Stage 3 Production expansion
- selected slice and why
- ADRs added or decisions still missing
- files changed
- commands run and results
- remaining risks
- exact independent verification prompt
```

## Always-run checks

Each verification loop should run whatever exists for the current stack:

- dependency install or lockfile check
- build or typecheck
- unit tests
- fixture validation
- architecture boundary tests
- leakage tests
- `git diff --check`
- `git status --short --untracked-files=all`

If a command does not exist yet, the verifier records that as a gap instead of pretending it passed.

## Quality gates

### Contract gate

Pass only if canonical schemas and labels match `docs/DESIGN.md`.

### Leakage gate

Pass only if frozen Gold labels, adjudication results, and label-derived fields cannot be imported by retrieval, reranking, embeddings, prompt construction, threshold tuning, or training.

### Provenance gate

Pass only if source records, chunks, candidates, annotations, adjudications, and releases can be traced by stable IDs and versioned metadata.

### Blindness gate

Pass only if annotator payloads exclude model scores, ranks, sampling buckets, peer labels, and Gold state.

### Release gate

Pass only if frozen releases are immutable, checksummed, versioned, and lineage-preserving.

### Production-readiness gate

Pass only if the next post-MVP step is known and does not require hidden decisions.

## Verification prompt template

```text
You are the independent verifier for Atra's Gold Set Annotation Platform.

Repository:
/Users/sotanakano/Atra-workunitOS/Atra-grouping

Use model: gpt-5.6-sol
Use reasoning effort: high

Read:
- AGENTS.md
- docs/README.md
- docs/DESIGN.md
- docs/LABEL_GUIDELINES.md
- docs/SAMPLING_AND_QA.md
- docs/MVP_PLAN.md
- docs/OPEN_DECISIONS.md
- docs/BEYOND_MVP_ROADMAP.md
- docs/LOOP_ENGINEERING.md
- relevant subtree AGENTS.md files

Previous builder summary:
<paste builder final summary here>

Goal:
Verify the implementation against the documented contract and determine the next loop action. Do not stop at MVP; if MVP passes, identify the next production-readiness phase.

Run available checks:
- install or lockfile check
- build/typecheck
- tests
- fixture validation
- architecture boundary tests
- leakage tests
- git diff --check
- git status --short --untracked-files=all

Review:
- schema drift from docs
- Gold leakage
- missing provenance
- non-deterministic IDs or sampling
- annotation blindness violations
- mutable Gold release behavior
- missing hard-negative or UNKNOWN coverage
- source licensing/export risks
- frontend exposure of hidden metadata
- post-MVP readiness gaps

Output:
- state: VERIFYING
- verdict: PASS / PASS WITH RISKS / FAIL
- blocking issues with file paths and line numbers
- non-blocking risks
- commands run and results
- missing decisions or ADRs
- exact next fix prompt if failed
- exact next build prompt if passed
```

## Fix prompt template

```text
You are the scoped fixer for Atra's Gold Set Annotation Platform.

Repository:
/Users/sotanakano/Atra-workunitOS/Atra-grouping

Read:
- AGENTS.md
- docs/README.md
- docs/DESIGN.md
- docs/LOOP_ENGINEERING.md
- files mentioned in the verifier report

Verifier report:
<paste verifier report here>

Goal:
Fix only the blocking issues identified by the verifier. Avoid broad refactors and do not change documented semantics unless an ADR explicitly allows it.

Rules:
- preserve Gold evaluation-only behavior
- do not introduce label leakage
- preserve immutable source evidence
- preserve blind annotation constraints
- update tests with the fix

Verify:
- rerun the failing checks
- run relevant regression tests
- run git diff --check

Output:
- state: FIXING
- issues fixed
- files changed
- commands run and results
- remaining risks
- exact reverify prompt
```

## Reverify prompt template

```text
You are reverifying a scoped fix for Atra's Gold Set Annotation Platform.

Repository:
/Users/sotanakano/Atra-workunitOS/Atra-grouping

Read:
- AGENTS.md
- docs/README.md
- docs/DESIGN.md
- docs/LOOP_ENGINEERING.md
- the prior verifier report
- the fixer summary

Goal:
Confirm whether the blocking issues are fixed and whether the phase can advance.

Run:
- the previously failing checks
- relevant regression tests
- leakage and architecture boundary tests if available
- git diff --check
- git status --short --untracked-files=all

Output:
- state: REVERIFYING
- verdict: PASS / PASS WITH RISKS / FAIL
- fixed issues
- remaining blocking issues
- new risks introduced
- exact next build prompt if ready
- exact next fix prompt if not ready
```

## Milestone loop order

1. Contracts and fixtures
2. Connectors
3. Retrieval and sampling
4. Gold workflow
5. Frontend annotation UI
6. Evaluation harness
7. MVP integration review
8. Production storage and release lineage
9. Connector expansion
10. Annotation operations
11. Evaluation regression suite
12. Security, privacy, and release governance

Each milestone uses the same build, verify, fix, reverify, advance loop.
