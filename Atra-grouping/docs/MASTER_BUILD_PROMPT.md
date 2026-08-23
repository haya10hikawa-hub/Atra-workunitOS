# Master Build Prompt — Complete Gold Set Platform

Copy the prompt below into one execution-capable coding-agent task. It is intentionally a terminal-condition prompt: the agent must keep building, verifying, fixing, and advancing through the complete Gold production line rather than stopping at intermediate reports.

```text
You are the end-to-end implementation owner for Atra's Gold Set Annotation Platform.

Repository:
/Users/sotanakano/Atra-workunitOS/Atra-grouping

Terminal objective:
Build and verify the complete Gold Set production line:
real source acquisition -> SourceRecord normalization -> provider-aware Chunking -> pinned Hugging Face embeddings -> vector retrieval -> pinned Hugging Face reranking -> balanced sampling -> blind dual annotation -> independent adjudication -> QA -> immutable GoldRelease -> license-aware export.

Scope boundary:
This task builds the Gold Set platform only. Do not implement Semantic Judge training, Atra runtime grouping, WorkUnit clustering, or external action execution.

Read completely before acting:
- AGENTS.md
- docs/README.md
- docs/DESIGN.md
- docs/LABEL_GUIDELINES.md
- docs/SOURCE_PLAN.md
- docs/SAMPLING_AND_QA.md
- docs/PRODUCTION_BUILD_PLAN.md
- docs/PRODUCTION_BUILD_STATUS.md
- docs/LOOP_ENGINEERING.md
- docs/BRIDGE_AUTOMATION.md
- docs/OPEN_DECISIONS.md
- every subtree AGENTS.md relevant to the current phase

Operating mode:
1. Inspect repository state and resume at the first incomplete acceptance criterion in docs/PRODUCTION_BUILD_PLAN.md.
2. Work continuously through P0-P11. For each phase: plan narrowly, implement, add tests, run relevant checks, review boundaries, fix failures, update docs/PRODUCTION_BUILD_STATUS.md, and immediately advance.
3. Do not pause for progress approval, routine preferences, ordinary design choices, failing tests, missing code, non-blocking risks, or a passed milestone. Use accepted ADRs and conservative defaults, record decisions, and keep moving.
4. Do not return a final answer while safe in-scope work remains. A status report is not completion.
5. If context is compacted, reread docs/PRODUCTION_BUILD_STATUS.md and continue; do not restart completed phases.

External-access rule:
- Missing credentials, private corpora, GPU access, hosted vector infrastructure, or cloud deployment blocks only the exact live check that requires it.
- Complete interfaces, migrations, local/public fixtures, recorded-response contract tests, disabled/error states, security boundaries, documentation, and activation runbooks; mark the live check NOT_RUN_EXTERNAL with exact requirements and commands; then continue all independent phases.
- Never fabricate external success or insert real secrets.
- Stop for the user only after every unaffected task is complete and all remaining tasks strictly require external authority, a destructive action, unresolved licensing, or a canonical semantic change.

Production model requirements:
- Primary embedding adapter: Alibaba-NLP/gte-multilingual-base.
- Primary reranker adapter: Alibaba-NLP/gte-multilingual-reranker-base.
- Comparative adapters: BAAI/bge-m3 and BAAI/bge-reranker-v2-m3.
- English calibration only: Alibaba-NLP/gte-modernbert-base and cross-encoder/ettin-reranker-150m-v1.
- Resolve and pin immutable Hugging Face revisions before production use. Record tokenizer revision, dimension, context limit, truncation, normalization, dtype, inference mode, model/input hashes, and cache lineage.
- Use real published model adapters in production paths. Deterministic test doubles are allowed only for hermetic tests and must be unmistakably labeled.

Non-negotiable rules:
- Frozen Gold, adjudications, peer labels, and label-derived data never enter embedding, retrieval, reranking, sampling, thresholds, prompts, or caches.
- Similarity is evidence, never identity truth.
- SAME_WORK means the same completion unit; UNKNOWN remains valid.
- Original evidence and frozen releases are immutable.
- Independent annotators never receive scores, ranks, sampling metadata, hypotheses, peer decisions, or Gold state, including through analytics or hidden API fields.
- Preserve stable IDs, hashes, provenance, model/policy/schema/guideline versions, and restartable jobs.
- Do not commit restricted text, credentials, or generated private artifacts.
- Do not commit or push unless explicitly authorized.
- Preserve unrelated user changes in the worktree.

Verification loop:
- Run targeted tests during implementation.
- At every phase boundary run lint, typecheck/build, tests, diff checks, and applicable Python/inference checks.
- Add cross-boundary tests for lineage, blindness, leakage, licensing, immutability, Unicode offsets, idempotency, restart recovery, and deterministic export.
- Before completion, run the full end-to-end pilot twice and compare stable outputs.
- Perform a final skeptical review and fix every blocking finding before declaring completion.

Required final evidence:
- phase-by-phase PASS or justified PASS_WITH_EXTERNAL_GAPS in docs/PRODUCTION_BUILD_STATUS.md;
- commands and results for repository verification and inference-service tests;
- deterministic two-run source-to-export evidence;
- model IDs and immutable revisions;
- leakage and blindness test evidence;
- release manifest/checksum recreation evidence;
- explicit list of NOT_RUN_EXTERNAL checks, if any, with activation commands;
- no unresolved in-repository blocking work.

Final response format:
- outcome
- completed production line
- verification evidence
- external checks not run and exact reason
- remaining human authority required, if any
- key file links

Start now by auditing the current repository against P0-P11, update docs/PRODUCTION_BUILD_STATUS.md, and implement the first incomplete criterion. Continue until the terminal objective or the strict human-stop condition is reached.
```

## Expected behavior

The prompt authorizes ordinary implementation inside this repository. It does not authorize credentials, private-source access, destructive operations, commits, pushes, or semantic rule changes. External gaps must be isolated and documented without preventing independent platform work.
