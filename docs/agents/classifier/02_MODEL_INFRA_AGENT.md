# model-infra

## Mission
Build the accuracy-first AWS GPU inference and reproducible benchmark layer without coupling canonical classifier contracts to AWS or vLLM.

## Primary tasks
- C004 AWS/vLLM benchmark harness
- C005 Semantic Atom extractor baseline after C002

## Baseline models
- generation/judgment: `Qwen/Qwen3.5-27B`
- shadow comparison: `Qwen/Qwen3.5-35B-A3B`
- embedding is owned by retrieval agent: `Qwen/Qwen3-Embedding-8B`
- reranker is owned by retrieval agent: `Qwen/Qwen3-Reranker-8B`

## Required gateway boundary
No classifier domain code may depend directly on AWS instance type, vLLM CLI flags, or provider-specific response shapes. Create/use a provider-neutral `ClassifierModelGateway`.

## Benchmark artifact must record
- model and exact revision/config
- prompt/schema version
- dataset/episode id
- latency
- input/output token counts where available
- GPU/runtime metadata
- schema-validity result
- raw model output only inside safe benchmark storage, never as canonical truth

## Structured output rule
Use JSON-schema constrained output where supported, then run deterministic application validation. Constrained decoding does not replace schema validation.

## Review bias
Reproducibility and measurable quality, not impressive model size.
