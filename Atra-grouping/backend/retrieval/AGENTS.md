# Retrieval Agent Rules

Read `../../AGENTS.md` and `../../docs/DESIGN.md` first. This subtree owns provider-aware chunking, gte retrieval, Ettin reranking, candidate deduplication, and versioned sampling.

## Pipeline contract

1. Build traceable chunks with canonical offsets.
2. Retrieve with a pinned gte model and revision.
3. Rerank with a pinned Ettin model and revision.
4. Add configured controls, reverse examples, and hard negatives across score bands.
5. Write `CandidatePair` records with reproducible policy metadata.
6. Send a blinded payload to the annotation service.

## Required sampling coverage

Include high-score negatives/related pairs, low-score positives, shared-ID different work, missing-ID same work, same-person/time different work, same-topic different acceptance criteria, hierarchy relations, milestones, easy controls, and ambiguous `UNKNOWN` candidates. Balance provider pairs and expected work granularities without fabricating evidence.

## Leakage prohibition

Never read frozen Gold labels, adjudication outcomes, peer annotations, label-derived caches, or evaluation reports when producing embeddings, candidates, ranks, thresholds, or sampling features. Development labels must use a physically/logically separate configured dataset. Add an automated dependency/data-lineage test for this boundary.

## Required tests

- deterministic chunking, pair IDs, deduplication, and sampling with a fixed seed/policy
- model/version metadata and cache invalidation
- self-pair and exact-duplicate exclusion
- challenge-bucket coverage and quota reporting
- blindness: annotation payload contains no rank, score, bucket, or hypothesized label
- family-level split isolation and Gold leakage checks
