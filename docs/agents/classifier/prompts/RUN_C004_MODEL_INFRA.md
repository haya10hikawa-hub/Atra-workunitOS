# RUN C004 — AWS / vLLM Classifier Benchmark Harness

Recommended coding model: **GPT-5.6 Sol, High reasoning**.

You are the `model-infra` coding agent for Atra's classifier subsystem.

## Mandatory context
Work only on branch `codex/classifier-work-reconstruction`.
Before changing anything, read completely:
1. `AGENTS.md`
2. `docs/agents/classifier/ATRA_CLASSIFIER_MASTER_STATE.json`
3. `docs/agents/classifier/02_MODEL_INFRA_AGENT.md`
4. `docs/release/WHOLE_SYSTEM_VERIFICATION_2026-09-07.md`
5. `AI_JUDGMENT_CRITERIA.md`
6. `NODE_DECOMPOSITION_POLICY.md`

## Task
Execute **C004 only: build the replayable AWS/vLLM classifier benchmark harness**.

Do not build the final classifier and do not fine-tune anything.
The harness exists so the same episode/input can be replayed across models and configurations without changing classifier business logic.

## Accuracy-first model registry
Prepare configuration support for:
- generation baseline: `Qwen/Qwen3.5-27B`
- generation shadow: `Qwen/Qwen3.5-35B-A3B`
- embedding baseline: `Qwen/Qwen3-Embedding-8B`
- reranker baseline: `Qwen/Qwen3-Reranker-8B`

Do not hard-code AWS credentials, hostnames, secrets, or a single GPU instance type.

## Architecture requirement
Add a provider-neutral benchmark/model gateway boundary. The rest of Atra must not depend directly on vLLM/AWS details.

The harness must record per run:
- runId
- stage
- model name and immutable/reproducible model revision when available
- request/schema version
- generation/runtime parameters
- latency
- input/output token counts when exposed
- GPU/runtime metadata available without secrets
- JSON schema validity
- failure category
- input fixture/episode identifier
- output artifact path/reference

## Structured output
For generation/classification stages, use strict structured output / JSON Schema where supported, then validate again inside Atra. Model output never becomes deterministic authority.

## Replay requirement
A fixed sanitized fixture must be runnable repeatedly against two model configurations and produce separately stored comparable artifacts.

## Safety
- no live provider write
- no deploy
- no remote D1 mutation
- no production credentials in repo/logs
- no raw untrusted source content bypassing the existing sanitization boundary
- do not weaken current fail-closed LLM validation

## Tests
Add focused tests for:
- config parsing
- missing/invalid config fail-closed behavior
- artifact metadata shape
- structured-output validation
- secret redaction / no credential logging
- replay separation by model/run

Do not require a real AWS GPU for the unit test suite. Separate offline contract tests from authorized benchmark execution.

## State protocol
Claim C004 before implementation. On completion, add exact file/test evidence and move C004 to `REVIEW`, never directly `DONE`.

## Final response
Return exactly:
- Goal
- Current State
- Decisions
- Files Changed
- Validation
- Remaining Risks
- Recommended Next Action
