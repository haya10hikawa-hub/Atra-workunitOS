# Evaluation Agent Rules

Read `../AGENTS.md` and `../docs/DESIGN.md` first. This subtree consumes frozen Gold releases read-only and produces reproducible metrics and reports.

## Required reporting

- Candidate stage: recall@K and coverage before reranking and after Ettin reranking.
- Relation stage: macro F1, per-class precision/recall/F1, confusion matrix, and `SAME_WORK` precision/recall.
- Work type: per-class and macro F1 plus declared Project/Task rollups.
- Grouping stage, when applicable: pairwise and cluster metrics plus transitivity violations.
- Slices: provider pair, work type, identifier presence, evidence length, retrieval-score band, challenge/hard-negative bucket, and ambiguity.
- Annotation quality: raw agreement and chance-adjusted agreement by key slices, with adjudication rate.

## Leakage and reproducibility

- Never tune prompts, thresholds, candidate policy, models, or sampling against a frozen evaluation release.
- Refuse mixed or mutable release inputs and verify manifest hashes before evaluation.
- Keep development and Gold evaluation configuration, caches, and outputs separate.
- Record code revision, release ID/hash, model versions, parameters, random seed, environment, and timestamps.
- Report uncertainty and sample counts; do not overinterpret tiny slices.

## Required tests

- metric calculations against hand-checked fixtures
- class ordering and `UNKNOWN` handling
- family-level split and near-duplicate leakage detection
- immutable input/hash validation
- deterministic reports for fixed inputs
- regression cases for high-score negatives, low-score positives, hierarchy, milestones, and ambiguous pairs
