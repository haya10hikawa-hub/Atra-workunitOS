# Dataset card — Gold Candidate v0 (in progress)

## Purpose and scope

External work-reconstruction evaluation and provisional ontology discovery. Target: at least 1,000 independently criticized real-data candidates across eight source families. Candidate status is not human Gold and is not automatic permission to train.

## Current composition

Locally accepted episodes: **1**. Raw neighborhoods: **203**. Normalized records: **3,472**. Reconstructed episodes: **2** (one accepted, one needing tag repair). Completed independent critic runs: **4**. Human-verified examples: **0**. Full episode text is not included in the GitHub snapshot. The initial sample is native Japanese engineering conversation containing English technical identifiers; no automatic mixed-language label is inferred solely from identifiers.

Six source projects and three acquired families (`japanese_oss`, `slack`, `disco`) are represented in raw candidates. Only VOICEVOX is represented among accepted episodes. Source-family, language, difficulty, hard-case and project diversity goals remain unmet. Current work cannot support classifier accuracy claims. Slack/DISCO publisher metadata labels the license `other-open`; the archives and derived snapshots are local-only, with no grant for redistributing full text inferred.

## Collection and processing

Read-only public GitHub API snapshots acquired 2026-09-11 UTC. Original response bytes, retrieval times, source URLs, ETags and SHA-256 receipts are retained in the local untrusted sandbox. Authors are pseudonymized at normalization; records containing detected secrets/email addresses fail closed. No private Slack, Notion, Gmail, Drive, Calendar or Atra internal history is used.

The first draft was authored in this interactive GPT session from the actual ten records in PR 1971. It records proposed setter decomposition and PR/UI separation as proposals, and does not infer their execution. Three actual separate-context critic/repair passes were completed for this episode; overconfident work boundaries were changed to UNCERTAIN before acceptance. A second Slack episode remains unaccepted because its hard-case descriptions are not valid canonical tags.

## Rights and attribution

The [VOICEVOX repository license](https://github.com/VOICEVOX/voicevox/blob/main/LICENSE) describes code licensing. It does not establish issue/comment redistribution rights. Full source text, exact evidence quotes and normalized episodes remain local and Git-ignored. A reference-only publication summary is provided separately from the full local episode. Source URLs preserve access to original attribution. No dataset-wide open license is asserted.

## Splits and leakage

Provisional split for the initial project: DEV-CANDIDATE. Project-level splitting is required across provider aliases. Final Test material is excluded from ontology discovery and all tuning. Human review must cover all adversarial, ontology mismatch and final Test cases plus an easy/medium sample.

## Limitations and risks

Selection is an initial convenience sample with no selected outside distractors; it is not representative. The remaining source adapters, project alias registry, scalable balanced sampling and source-specific rights review are unfinished. Actual model and critic execution are implemented but subject to account usage availability. Generic schema checks and locally consistent receipts cannot alone establish external truth, critic independence or language/difficulty correctness. Raw caches can contain public identities and must not be published.
