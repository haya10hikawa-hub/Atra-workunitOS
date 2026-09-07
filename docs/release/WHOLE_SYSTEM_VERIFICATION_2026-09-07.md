# Atra Whole-System Verification Handoff — 2026-09-07

## 1. Scope and disposition

- Baseline: `origin/main@eddbe55d4efa9cc71e4d1dc2dbd28fe00037b26c`
- Repair branch: `codex/whole-system-verification-repair`
- Runtime used for verification: Node `v22.23.2`
- Intended disposition: push this branch for review; **do not merge or deploy yet**
- No Cloudflare upload, remote D1 mutation, real provider write, or real LLM call was performed.

The evidence below distinguishes bounded code/test proof from production proof. A passing
fixture, fake repository, recorded response, build, preflight, or dry-run does not prove a
live provider, live D1 database, or production deployment.

## 2. Concrete behavior changes

### Atra workspace and launcher

- Action Field close now removes the region and switches the body to a two-column layout.
- Selecting a node, WorkUnit, or palette result reopens the Action Field.
- The candidate surface is explicitly read-only: `candidate-preview.md`, no edit button,
  no fake cursor, and no “Local edits only” claim.
- Header/rail controls without handlers are disabled and labelled unavailable.
- Fixed provider badges were removed; only providers present in the selected candidate are
  projected.
- Command Palette no longer advertises a non-existent “Show more” path, and Enter is
  described as opening the Action Field.
- The launcher composition exact-source snapshot was updated because this is an intentional
  interaction change, not an unnoticed drift.

Primary files:
`app/components/atra/AtraWorkspace.tsx`,
`app/components/atra/Atra.module.css`,
`app/components/workunit-os/launcher/WorkUnitLauncher.tsx`,
`app/components/workunit-os/launcher/CommandPaletteView.tsx`,
`app/lib/application/atra/atraWorkspaceModel.ts`, and
`app/lib/application/atra/deriveAtraWorkspaceViewModel.ts`.

### Recorded GitHub acquisition boundary

- The Issue adapter now rejects PR-only own keys regardless of their value shape:
  `pull_request`, `head`, `base`, `merge_commit_sha`, and `changed_files`.
- The Pull Request adapter requires plain-object `head` and `base`, a string-or-null
  `merge_commit_sha`, and a non-negative safe-integer `changed_files`.
- Bidirectional counterexamples cover mutated PR-as-Issue and Issue-as-PR payloads.
- Failure remains fail-closed as `provider_resource_mismatch`.

Primary files:
`app/lib/infrastructure/external/github/recordedIssueCapture.ts`,
`app/lib/infrastructure/external/github/recordedPullRequestCapture.ts`, and
`tests/recordedPullRequestSourceSlice.test.mts`.

Residual limit: response-shape discrimination separates the two supported resource profiles,
but does not prove that arbitrary bytes are authentic GitHub responses. A signed/pinned capture
manifest is tracked as follow-up work.

### LLM parsing and deterministic authority

- Optional strings and arrays now have closed type checks and bounds: maximum 8,000 characters
  per string and 100 entries per array.
- Unknown risk flags, malformed array members, oversized values, and title-only drafts fail
  closed instead of being silently filtered or defaulted.
- Model output cannot elevate deterministic `isExecutable` or `isComplete`.
- Deterministic missing fields and warnings are unioned into the result and cannot be hidden by
  empty model arrays.
- Hallucination risk uses the stricter deterministic/model value.
- A deterministic blocking result cannot be overwritten with a model-provided completion message.

Primary files:
`app/lib/llm/validateLlmOutput.ts`,
`app/lib/llm/extractCandidate.ts`,
`app/lib/llm/generateWorkUnitDraft.ts`,
`app/lib/llm/evaluateWorkUnit.ts`, and
`tests/llmPipeline.test.mts`.

### Build, dependency, and repository hygiene

- Next was resolved to `16.3.4`, Wrangler to `4.129.0`, and vulnerable transitive packages
  were updated through the lockfile.
- `npm audit --audit-level=high` reports zero vulnerabilities, including dev tooling.
- CI now runs the full dependency audit after `npm ci`.
- `next.config.ts` sets `agentRules: false` so `next dev` cannot rewrite the
  repository-owned `AGENTS.md`. An executable ratchet verifies the setting.
- The previous test-only TypeScript errors were repaired without `any`, `@ts-ignore`,
  `@ts-expect-error`, or excluding tests. Branded IDs, readonly negative tests, and
  `TenantDbResolution` fixtures now match the production contracts.
- A temporary compatibility-module import introduced during fixture repair was removed rather
  than widening the architecture snapshot.

## 3. RED/GREEN evidence

Confirmed pre-fix counterexamples included:

- PR bytes with malformed `head/base` entering the Issue namespace.
- Issue bytes with PR markers entering the Pull Request namespace.
- Issue-shaped bytes with top-level `pull_request` entering the Issue namespace.
- oversized/malformed LLM strings and arrays being accepted.
- model evaluation hiding deterministic missing/warning/risk findings.
- parseable title-only draft output being accepted.
- closing Action Field not changing the rendered layout.
- Next dev appending generated instructions to tracked `AGENTS.md`.
- `tsc --noEmit` failing across test fixtures.
- npm audit reporting high-severity production and development dependency findings.

Focused regression tests were added before the corresponding bounded fixes and observed failing;
the repaired tree then passed the focused suites and the full repository suite.

## 4. Final local validation

All commands below ran on the repaired tree with Node `v22.23.2`.

| Gate | Result |
| --- | --- |
| `npm run test:canonical-pipeline-ratchets` | PASS — 398/398 |
| `npm test` | PASS — 5,221 total; 5,220 pass; 1 skip; 0 fail |
| `./node_modules/.bin/tsc --noEmit --pretty false` | PASS |
| `npm run alpha:safety-gate` | PASS — 35 checks |
| `npm run lint` | PASS — 0 errors; 3 pre-existing warnings |
| `npm run build` | PASS — Next 16.3.4 production build |
| `npm run cf:build` | PASS — OpenNext Worker bundle generated |
| `npm run cf:deploy:preflight` | PASS — synthetic safe config |
| `npm run cf:deploy:dry-run` | PASS — `--dry-run`, no upload |
| `npm run electron:build:check` | PASS — static safe-shell checks |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| Next dev smoke | PASS — HTTP 200; `AGENTS.md` hash unchanged |
| `git diff --check` | PASS |

The lint warnings are unused parameters in
`tests/p1_2Run3AcquisitionController.test.mts`; they do not fail the configured gate and were
not changed in this bounded repair.

## 5. Non-UI Feature Registry

### PROVEN_COMPLETE — bounded scope only

- `SourceRecordV1` identity, closed provider vocabulary, validation, digest semantics, and
  pure/frozen construction.
- Recorded GitHub Issue and Pull Request capture-to-`SourceRecordV1` vertical slices for their
  ratified profiles.
- `NormalizedToolSignal` boundary as an independent legacy/fake-signal contract.
- Candidate-only safe projection and the prohibition on client-created approval/execution truth.
- Bearer JWT/session resolution, request-scoped runtime configuration, CSRF/origin checks, and
  tenant repository boundaries covered by current executable tests.
- Preview/approval binding, four-eyes checks, expiry, tenant isolation, and single-use CAS.
- Dry-run returns an authorized-but-not-executed result and does not call a live provider.
- Inbox GET is projection-only; explicit refresh owns writes.
- Electron static shell invariants and Cloudflare synthetic build/preflight/dry-run gates.

### PARTIAL or IMPLEMENTED_BUT_UNPROVEN

- Source acquisition: recorded GitHub resources are bounded; default runtime GitHub, Slack, and
  Calendar resolution still uses fake clients. Gmail tooling is an audit/operator lane, not the
  canonical product pipeline.
- WorkUnit formation: `SafeWorkUnitCandidate` is a mock one-signal projection, not canonical
  correlation or `WorkUnitCandidateV1`.
- LLM: validation and deterministic authority boundaries are stronger, but real-provider quality,
  grounding, calibration, latency, and cost are not proven.
- Persistence: existing Inbox/approval/audit rows are implemented, but the canonical many-source
  membership, correction, and reviewed-record lineage are not.
- Context Preview exists in legacy/server surfaces but the default Atra launcher remains a
  mock-candidate shell.
- Audit has durable paths and a no-op/fail-open legacy path with competing semantics.
- Cloudflare and Electron have build/static evidence only; there is no production runtime proof.

### NOT_IMPLEMENTED

- canonical `CorrelationGroupV1` and correlation/grouping pipeline;
- admissible two-provider gold data and false-merge/false-split measurement;
- canonical `WorkUnitCandidateV1` formation and persistence;
- append-only `WorkUnitCorrectionV1` record, replay, and correction measurement;
- canonical Reviewed WorkUnit and Action Preparation integration;
- default UI navigation from canonical SourceRecord to original provider evidence.

### INTENTIONALLY_DEFERRED / NO-GO

- real provider writes and autonomous external execution;
- remote production/staging D1 mutation;
- live provider and real LLM activation;
- commercial OAuth/token vault, billing, and production tenant administration;
- production Electron release.

## 6. Consistency findings

- `SourceRef`, `WorkUnitDraft`, and `WorkUnit` still exist in multiple legacy/canonical/UI
  shapes. Current architecture tests prevent some boundary violations but do not make these one
  semantic authority.
- Ranking has incompatible scales: the LLM/domain path uses 1–5 inputs and
  `(impact * urgency * actorWeight) / effort`; legacy Hopper uses a 1–10 score and a default
  push threshold of 50.
- The decomposition evaluator uses a mock orchestrator and exact expected-target matches;
  confidence is unset and production-grade precision/recall, false-merge, false-split,
  abstention, unsupported-evidence, and correction metrics do not exist.
- Several comments/docs describe historical “no implementation” or deferred persistence while D1
  implementations now exist. The primary Phase-1 document also uses broad Gmail wording even
  though audit-only RAW transport tooling exists. These need governance-aware wording changes,
  not silent reinterpretation of Phase-1 authority.
- Existing legacy `reviewWorkUnitDraft` behavior and the future canonical hard-missing rule are
  different contracts. This run did not rewrite legacy product semantics without PM approval.

## 7. Issue plan

Do not close existing issues until this branch is reviewed and integrated. On push:

- add repair evidence to #128 (dependencies), #135 (LLM bounds), and #179 (TypeScript/build);
- add current-state evidence to #137 (model/docs drift), #178 (audit/observability),
  #198 (correlation/formation), #199 (correction/default UI), and #201 (LLM evaluation);
- create focused issues for:
  1. signed/pinned recorded-capture manifest and authenticity boundary;
  2. admissible two-provider gold set with false-merge/false-split metrics;
  3. Electron start URL allowlist before packaging.

## 8. Current decision

The repair branch is suitable for review and remote backup, but the whole product remains
`CONDITIONAL_PASS`: bounded safety and build gates pass, while the central canonical flow
`SourceRecord -> CorrelationGroup -> WorkUnitCandidate -> HumanCorrection` is not implemented.
Pushing this branch does not authorize merge, deploy, live provider access, or execution.
