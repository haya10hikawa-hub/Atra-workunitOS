# Source Plan

All sources must be normalized into the canonical `SourceRecord` and `Chunk` contracts from `DESIGN.md`. Provider-native IDs, links, timestamps, hierarchy, licensing, and raw payload references must be preserved.

Restricted or licensed raw content must not be committed to Git. Use synthetic fixtures or redistributable excerpts for tests.

## QMSum

Preserve:

- meeting identity
- topic spans
- query/summary pairs
- speaker turns
- timestamps where available

Use for:

- action-item evidence
- decisions captured in meetings
- meeting summary to transcript span alignment

Caution: summaries are derived evidence. Keep transcript spans as primary provenance.

## Public Jira

Preserve:

- project key
- issue key
- issue type
- status
- title and description
- comments
- links
- epic/parent/subtask relation

Use for:

- explicit work hierarchy
- duplicate, dependency, and related links
- high-quality task/project structure

Caution: same project, same epic, or issue key mention is not automatic `SAME_WORK`.

## OpenTelemetry GitHub + authorized Google Docs

Preserve from GitHub:

- issue, pull request, discussion, commit, labels, assignees, status
- referenced issue/PR numbers
- repository and file paths where relevant

Preserve from Google Docs:

- document ID
- title
- paragraph or line ranges
- headings
- comments/suggestions when authorized
- meeting or specification context

Use for:

- cross-provider same-work examples
- specs and meeting decisions that refer to GitHub execution work
- hard negatives where docs discuss a theme but not the same completion unit

Caution: Google Docs access and export policy must be explicit. Do not store restricted text in public fixtures.

## SmartSHARK

Preserve:

- issue IDs
- commits
- pull requests
- messages
- file-change links
- repository/project context

Use for:

- software evolution relations
- issue-to-commit and issue-to-PR evidence
- distinct work inside the same repository area

Caution: repository proximity and file overlap are evidence, not identity.

## AMI

Preserve:

- meeting ID
- speaker
- dialogue act
- timestamp
- topic segment

Use for:

- conversational action items
- decisions and follow-ups
- noisy meeting-context negatives

Caution: same speaker and nearby time may still describe different work.

## ECB+

Preserve:

- document ID
- topic
- event mentions
- coreference clusters
- sentence/document provenance

Use for:

- event identity examples
- related-vs-identical reasoning patterns
- weak supervision and guideline calibration

Caution: event coreference is not automatically work-unit identity.

## MAVEN-ERE

Preserve:

- event mentions
- temporal relations
- causal relations
- subevent relations
- coreference relations

Use for:

- hierarchy and causality examples
- `RELATED` calibration
- ambiguous event relation cases

Caution: causal and subevent relations should usually map to `RELATED`, not `SAME_WORK`.

## Connector completion checklist

- source acquisition path documented
- license/export policy recorded
- snapshot date recorded
- parser version recorded
- raw payload hash stored
- provider-native IDs retained
- missing fields represented explicitly
- synthetic fixtures added
- restricted content excluded from Git

