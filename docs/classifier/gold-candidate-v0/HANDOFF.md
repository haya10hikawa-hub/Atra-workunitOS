# Gold Candidate v0 handoff — 2026-09-12

## Goal

Complete the supplied 1,000 external candidate specification, then integrate latest main while preserving classifier assets and repair verified integration failures. The user additionally requested a commit and push checkpoint on a GitHub branch. The full benchmark task is **not complete**.

## Current state

- Starting branch: `codex/classifier-work-reconstruction`; starting HEAD: `e6f2704`.
- 203 raw neighborhoods / 3,472 sanitized records: 3 Japanese OSS, 120 Slack, 80 Discord.
- **One accepted candidate**, `GC-000001`: real VOICEVOX PR 1971, four proposed work nodes and three UNCERTAIN relations. Three independent critic passes detected and then verified repairs to overconfident PR/work-boundary claims.
- One additional actual model reconstruction, `GC-000002` (Slack), has completed independent criticism but needs canonical hard-case tag repair and another critic. It is not accepted.
- Four completed actual critic runs; two flagged critical claims in successive versions of the first draft. One schema failure and one account-usage-limit failure are retained in run logs.
- User approval for separate contexts was supplied by `continue`; subsequent automatic review allowed execution. No approval is pending. Account usage became available again on September 12.
- GitHub public metadata and up to 100 issue headers acquired for sakura-editor, Vivliostyle, JapaneseKeyboard and PLATEAU. Their comment-neighborhood import is not complete.
- Slack/DISCO archives acquired and member snapshots independently verified against the archived XML. `other-open` is recorded as publisher license status; full-text redistribution permission is not inferred.
- Jira release metadata identifies CC BY 4.0; a 128KB ZIP directory range was acquired, not the full 5.8GB archive. SmartSHARK source extraction remains unfinished.
- Three normalizers exist: GitHub, Slack XML, Discord XML. Model reconstruction, separate critic, append-only run evidence, schema/provenance/duplicate/split gates and a reference-only publication summary exist.

## Decisions

- Raw/source/model caches remain Git-ignored. The GitHub checkpoint contains code, schemas, aggregate evidence and a reference-only summary, not raw conversations or full episodes.
- Only actual, accepted full local episodes count; metadata pages, raw candidates, synthetic tests and reference summaries do not.
- Source timestamps without timezones remain null canonically, with original timestamp text retained. Discord windows are not represented as proven threads.
- Root tests have an observed baseline of 5,299 pass / 20 fail / 1 skip (5,320 total), including pre-existing classifier governance/boundary conflicts and sandbox-related loopback failures. The integration phase has not begun.
- No merge/latest-main integration until 1,000-candidate prerequisite is met. A Git checkpoint is not completion of that integration phase.
- Current product authority remains unchanged; this is an evaluation technical asset.

## Next action

1. Complete the requested scoped GitHub checkpoint and verify the remote commit.
2. Repair GC-000002 hard-case tags from evidence, re-run the independent critic and accept only after all gates pass.
3. Import more Japanese OSS neighborhoods, then implement the remaining source adapters, canonical project aliases and quota-aware split sampling.
4. Build the first balanced 100 accepted candidates before scaling through the real 250/500/1000 checkpoints.
5. After all dataset gates pass, perform the specification's safety snapshot, fetch, integration and repository verification sequence.

## Risks

The 1,000 target, eight-family coverage, Japanese/mixed quotas, hard cases, project diversity and semantic reliability remain unproven. Existing High-severity dependency advisories (Wrangler/Miniflare/Sharp) are recorded; no Critical advisory was reported. Receipts establish local audit consistency, not cryptographic provider identity. The snapshot must not include unrelated uncommitted classifier work or raw personal/source text.
