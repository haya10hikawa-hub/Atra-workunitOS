# ADR 0012: Pinned Hugging Face Production Model Registry

## Status

Accepted

## Context

The production line needs immutable model identities before real inference adapters are activated. Model configuration must never accept Gold labels, adjudications, or evaluation outputs as inputs.

## Decision

`inference/config/production-models.json` is the versioned model registry. It pins the required primary and comparative Hugging Face commit revisions, tokenizer revisions, dimensions, context limits, dtype, normalization, truncation, and inference mode. Input hashes and cache lineage are produced per inference request; any registry/config/preprocessing change invalidates derived embeddings and reranking artifacts.

The primary multilingual models are `Alibaba-NLP/gte-multilingual-base` at `9bbca17d9273fd0d03d5725c7a4b0f6b45142062` and `Alibaba-NLP/gte-multilingual-reranker-base` at `8215cf04918ba6f7b6a62bb44238ce2953d8831c`. Comparative model revisions are recorded in the registry. The primary model snapshots are stored under `models/huggingface` with Git LFS; their model and tokenizer SHA-256 values are recorded in the registry. The pinned `Alibaba-NLP/new-impl` custom architecture source is vendored into each primary snapshot so local verification can run without network access.

## Consequences

- Fixture token scorers remain hermetic test doubles and are not production models.
- Real inference may only load a registry entry by immutable revision.
- A destination machine must install Git LFS and run `git lfs pull` before local model verification.
- Gold workflow data must not be imported by the inference service or retrieval path.
