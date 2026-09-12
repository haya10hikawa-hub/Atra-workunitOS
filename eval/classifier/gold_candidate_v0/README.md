# External Gold Candidate v0

**In progress: 1 locally accepted episode / target 1,000.** This is an evaluation technical asset, not a product-direction change. The GitHub snapshot contains a reference-only summary; full episodes and raw text remain local.

Authoritative specification: [EXECUTION_SPEC.md](../../../docs/classifier/gold-candidate-v0/EXECUTION_SPEC.md). Live handoff: [HANDOFF.md](../../../docs/classifier/gold-candidate-v0/HANDOFF.md).

## Evidence so far

203 raw candidates contain 3,472 sanitized records across Japanese OSS, Slack and Discord. One VOICEVOX candidate passed three actual independent critic/repair passes. A separate Slack reconstruction and critic are complete, but tag-format repair is pending. Human Final Gold count is zero. No 100/250/500/1000 checkpoint has been earned and Git integration has not begun.

## Commands

Run from repository root:

```sh
npm run gold:schemas
npm run gold:test
npm run gold:test:acquisition
npm run gold:report
npm run gold:validate
```

`validate`/`report` return 2 while completion targets are unmet, 1 for malformed input/IO failure, and 0 only when completion checks pass. A fresh clone has no full local episodes and reports zero; checked-in reports record the observed local snapshot.

```sh
node eval/classifier/scripts/cli.mjs prepare-a CANDIDATE.json NEW_REQUEST.json
node eval/classifier/scripts/annotate/codex-reconstruct.mjs CANDIDATE.json GC-000002 --execute
node eval/classifier/scripts/annotate/codex-critic.mjs DRAFT.json --execute
node eval/classifier/scripts/cli.mjs accept REVIEWED_EPISODE.json
```

Prompt preparation is offline. `--execute` makes an actual Codex model call using existing account access and usage allowance. Run that only within the approved execution scope. Tests use offline synthetic fixtures; default tests require neither AWS nor live models. Repairs change the annotation digest and require a new critic.

## Trust and storage

- `external_sources/MANIFEST.yaml` is JSON-compatible YAML with acquired-source records; discovery leads remain in docs.
- Git-ignored `external_sources/sandbox/` holds untrusted bytes, receipts and verifiable XML-member snapshots.
- Git-ignored `silver/episodes/` holds normalized raw neighborhoods; explicit refs, conversation IDs and temporal windows are Silver evidence only.
- Git-ignored `quarantine/`, `runs/` and `episodes/` hold drafts, actual model artifacts and accepted full local episodes.
- `rejected/` holds reasons without source bodies. `references/` contains publication-safe source references, offsets and derived graph summaries, never full corpus substitutes.

GitHub evidence is verified using exact response JSON pointers. Slack/Discord snapshots are verified against their pinned ZIP members; entities/DTDs and oversized XML fail closed. No timezone is invented for unqualified timestamps. Author pseudonyms and secret/email rejection occur before annotation.

Run receipts bind source/request/response artifacts, hashes and annotation digests. A reconstruction receipt preserves both the actual model graph and the deterministically assembled episode. Interactive repairs explicitly identify their provenance and transcript limitations. Receipts prove local consistency, not authenticated provider identity.

## Acceptance and remaining work

Acceptance checks strict schema, exact source spans, graph/evidence references, local source hashes, per-claim and per-tag critic coverage, uncertainty, duplicate neighborhoods and cross-split leakage. Hard-case tags must be canonical uppercase identifiers, not explanatory sentences. Unsupported or critical partially supported claims block acceptance.

Only GitHub/Slack/Discord adapters are implemented. Jira, SmartSHARK, Wikimedia, public design and Apache mail extraction remain unfinished. Canonical cross-provider project aliases, quota-aware sampling, real distractors, full milestone ontology reports and balanced coverage remain outstanding.

Final Test projects must not enter training, prompt optimization, retrieval tuning, few-shot examples or post-freeze ontology discovery. Checkpoint discovery excludes Test episodes. Reference-only rights never imply permission to publish full conversation text.
