# Sampling and QA

## Goal

The Gold Set must evaluate real grouping behavior, not just nearest-neighbor similarity. Sampling should therefore include easy cases, confusing related cases, hard negatives, ambiguous cases, and intentionally reverse examples that challenge common model heuristics.

## Candidate creation path

1. Ingest authorized source records.
2. Chunk records with provider-aware boundaries.
3. Embed chunks with a pinned gte model.
4. Retrieve candidate pairs across providers and within approved control buckets.
5. Rerank with a pinned Ettin model.
6. Assign sampling buckets and policy version.
7. Remove scores, ranks, and hypotheses from annotator payloads.
8. Send each release-eligible pair to blind dual annotation.

The sampling bucket is a construction label, not truth.

## Coverage targets

Each pilot batch should intentionally cover:

- all relation labels: `SAME_WORK`, `RELATED`, `DIFFERENT_WORK`, `UNKNOWN`
- project-like, task-like, subtask-like, milestone-like, non-work, and ambiguous cases
- multiple provider pairs
- high, medium, and low retrieval/rerank score bands
- identifier-present and identifier-absent pairs
- short and long evidence spans
- easy positives and easy negatives

Do not promise exact final label balance before annotation. Use staged replenishment after human labels reveal underrepresented slices, while keeping frozen evaluation labels out of model development.

## Required challenge buckets

- `same_identifier_different_work`
- `no_identifier_same_work`
- `same_people_time_different_work`
- `same_topic_different_acceptance`
- `parent_child_related`
- `milestone_task_related`
- `paraphrase_related_not_same`
- `high_score_not_same`
- `low_score_same`
- `sparse_unknown`
- `contradictory_unknown`
- `easy_positive_control`
- `easy_negative_control`

## Blind dual annotation

Rules:

- two independent annotators per release-eligible pair
- annotators see evidence, provider, and provenance
- annotators do not see scores, ranks, sample buckets, peer labels, or Gold state
- annotation records are append-only
- pair order may be randomized in the UI
- evidence spans and reason codes are captured

Agreement is not enough by itself if both annotations fail schema validation or omit required evidence.

## Adjudication

Send to adjudication when:

- relation labels disagree
- material work type labels disagree
- both annotators are low confidence
- source evidence is flagged as defective
- the pair is selected for random audit

The adjudicator records a final label, work types, and decision reason. Guideline problems become tracked documentation issues instead of silent one-off fixes.

## Leakage prevention

- Split at linked work-family level, not pair level.
- Keep frozen Gold labels out of retrieval, reranking, embedding, prompt design, threshold tuning, and training.
- Keep development/training annotations in separate datasets.
- Version sampling policy separately from human labels.
- Validate exports for label-derived fields before publishing.

## Release QA

Before freeze:

- every pair has valid provenance
- two blind annotations exist
- required adjudications are complete
- license/export policy is satisfied
- schema, guideline, source, model, and sampling versions are pinned
- counts by label, provider pair, work type, score band, and challenge bucket are recorded
- agreement metrics are calculated
- checksums and manifest are generated

