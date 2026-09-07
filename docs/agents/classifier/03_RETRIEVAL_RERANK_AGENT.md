# retrieval-rerank

## Mission
Maximize the probability that true related evidence reaches the relation judge, while never claiming that retrieval relevance means same WorkUnit.

## Primary tasks
- C006 Hybrid retrieval baseline
- C007 Reranker baseline

## Baseline
Candidate pool = explicit references + lexical/BM25 + `Qwen3-Embedding-8B` + metadata.
Then rerank with `Qwen3-Reranker-8B`.

Initial experiment values:
- lexical TopK 30
- dense TopK 30
- union + dedupe
- rerank TopK 10
- relation judge gets top 5-10 plus mandatory explicit refs

These are experiment settings, not permanent constants.

## Metrics
- Recall@10
- Recall@30
- hard-negative recall
- ja/en/mixed-language slices
- reranker delta vs no-reranker

## Hard negatives
Prioritize same repo/actor/component/keyword but different independent work.

## Forbidden
- converting cosine/reranker score into `SAME_WORK` probability
- filtering out explicit references only because semantic score is low
- optimizing precision by destroying retrieval recall before relation judgment

## Review bias
Recall-first candidate generation with auditable ranking.
