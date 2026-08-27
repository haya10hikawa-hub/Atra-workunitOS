# Private Asset Migration Manifest

Ledger of material that must leave, or stay out of, the public boundary. It records
**where each item came from and where it must live** — never the item's contents.

This is a private review artifact. It is excluded from the public export because it
enumerates what is deliberately withheld.

## Destination classes

| Class | Meaning |
| --- | --- |
| `SEPARATE_PRIVATE_REPOSITORY` | Belongs in a private engineering repository alongside the canonical source. |
| `OPERATOR_ARCHIVE` | Operator-owned encrypted archive; not developer-accessible by default. |
| `LOCAL_MACHINE_ONLY` | Developer- or agent-local state; must never be tracked anywhere. |
| `STAYS_PRIVATE_IN_CANONICAL` | Remains tracked in the private canonical repository, excluded from the public export only. |

## Removed from tracking in this WorkUnit

| Original path | Classification | Destination class | SHA-256 | Status | Owner |
| --- | --- | --- | --- | --- | --- |
| `.hermes/plan.md` | `PRIVATE_DEVELOPMENT` | `LOCAL_MACHINE_ONLY` | `504fa6d5…` (git blob `504fa6d501463d8ca3085effa426da3d7d15cadb`) | Removed from tracking; `/.hermes/` now ignored | Repository maintainer |

`.hermes/plan.md` was a stale planning note describing work completed long ago. It had
**zero** runtime, build, test, CI, script, or documentation consumers — the only
repository matches for "hermes" are the unrelated `hermes-parser` npm package inside
`package-lock.json`. No replacement is required and no public equivalent was extracted,
because the file contained no guidance that is useful to an external contributor.

It was **not** moved to another directory inside this repository: relocating a private
file within a future-public repository does not make it private.

## Deleted obsolete assets

All proven unreferenced by full-path search across the entire repository. Each remains
recoverable from history.

| Original path | Classification | Reason | Rollback |
| --- | --- | --- | --- |
| `public/file.svg` | `OBSOLETE` | `create-next-app` scaffold; zero references | `git checkout c3655f35 -- public/file.svg` |
| `public/globe.svg` | `OBSOLETE` | `create-next-app` scaffold; zero references | `git checkout c3655f35 -- public/globe.svg` |
| `public/next.svg` | `OBSOLETE` | scaffold asset carrying a third-party mark; zero references | `git checkout c3655f35 -- public/next.svg` |
| `public/vercel.svg` | `OBSOLETE` | scaffold asset carrying a third-party mark; zero references | `git checkout c3655f35 -- public/vercel.svg` |
| `public/window.svg` | `OBSOLETE` | `create-next-app` scaffold; zero references | `git checkout c3655f35 -- public/window.svg` |
| `public/Photos/icon/database.png` | `THIRD_PARTY_UNRESOLVED` | unreferenced raster, no provenance | `git checkout c3655f35 -- public/Photos/icon/database.png` |
| `public/Photos/icon/github.png` | `THIRD_PARTY_UNRESOLVED` | unreferenced brand raster, no provenance | `git checkout c3655f35 -- public/Photos/icon/github.png` |
| `public/workunit-ui-icons/docs.png` | `THIRD_PARTY_UNRESOLVED` | unreferenced brand raster, no provenance | `git checkout c3655f35 -- public/workunit-ui-icons/docs.png` |
| `public/workunit-ui-icons/github.png` | `THIRD_PARTY_UNRESOLVED` | unreferenced brand raster, no provenance | `git checkout c3655f35 -- public/workunit-ui-icons/github.png` |
| `public/workunit-ui-icons/jira.png` | `THIRD_PARTY_UNRESOLVED` | unreferenced brand raster, no provenance | `git checkout c3655f35 -- public/workunit-ui-icons/jira.png` |
| `public/workunit-ui-icons/notion.png` | `THIRD_PARTY_UNRESOLVED` | unreferenced brand raster, no provenance | `git checkout c3655f35 -- public/workunit-ui-icons/notion.png` |
| `public/workunit-ui-icons/slack.png` | `THIRD_PARTY_UNRESOLVED` | unreferenced brand raster, no provenance | `git checkout c3655f35 -- public/workunit-ui-icons/slack.png` |
| `public/workunit-ui-icons/slides.png` | `THIRD_PARTY_UNRESOLVED` | unreferenced brand raster, no provenance | `git checkout c3655f35 -- public/workunit-ui-icons/slides.png` |

## Stays tracked privately, excluded from the public export

No migration action is required for these today; they remain in the private canonical
repository. They are listed so that a future decision to split repositories has a
ready inventory.

| Path or pattern | Classification | Destination class |
| --- | --- | --- |
| `AGENTS.md` | `PRIVATE_DEVELOPMENT` | `STAYS_PRIVATE_IN_CANONICAL` |
| `AI_JUDGMENT_CRITERIA.md` | `PRIVATE_DEVELOPMENT` | `STAYS_PRIVATE_IN_CANONICAL` |
| `NODE_DECOMPOSITION_POLICY.md` | `PRIVATE_DEVELOPMENT` | `STAYS_PRIVATE_IN_CANONICAL` |
| `NODE_DECOMPOSITION_WHITEBOARD.md` | `PRIVATE_DEVELOPMENT` | `STAYS_PRIVATE_IN_CANONICAL` |
| `docs/security/REDTEAM_2026-06-29.md` | `SENSITIVE` | `OPERATOR_ARCHIVE` |
| `docs/operations/CODEX_AUTOMATION_PROMPTS.md` | `PRIVATE_DEVELOPMENT` | `STAYS_PRIVATE_IN_CANONICAL` |
| `docs/release/**` (except this policy pair) | `PRIVATE_OPERATIONS` | `STAYS_PRIVATE_IN_CANONICAL` |
| `docs/**` default-private process records | `PRIVATE_DEVELOPMENT` | `STAYS_PRIVATE_IN_CANONICAL` |
| `scripts/loop/**` | `PRIVATE_DEVELOPMENT` | `SEPARATE_PRIVATE_REPOSITORY` |
| `scripts/report-legacy-surface.mjs` | `PRIVATE_DEVELOPMENT` | `SEPARATE_PRIVATE_REPOSITORY` |
| `tests/loopStatusCollector.test.mts` | `PRIVATE_DEVELOPMENT` | `SEPARATE_PRIVATE_REPOSITORY` |
| `tests/proactiveVoiceSecretary.test.mts` | `PRIVATE_DEVELOPMENT` | `SEPARATE_PRIVATE_REPOSITORY` |
| `prototypes/**` | `PRIVATE_DEVELOPMENT` | `SEPARATE_PRIVATE_REPOSITORY` |

`docs/security/REDTEAM_2026-06-29.md` is the one item whose destination is **not**
"stays where it is" in the long run: it documents residual open weaknesses and the
private sandbox used to find them. It is recommended for an operator-owned archive
once its open findings are closed.

## Open migration blockers

| Item | Blocker | Required owner |
| --- | --- | --- |
| `public/Photos/icon/{slack.png,gmail.png,google-calendar.png,salesforce.jpeg}` | Rendered by the UI, no recorded provenance or redistribution right. Cannot be deleted here without a product-UI change. | Licensing WorkUnit |
| `public/workunit-source-icons/**` | Files are CC0 (Simple Icons); trademark **use** in a public product is unreviewed. | Licensing WorkUnit |
| Full-history credential scan | No `gitleaks`/`trufflehog` available; only a bounded fallback scan was run. | Release owner, before publication |
