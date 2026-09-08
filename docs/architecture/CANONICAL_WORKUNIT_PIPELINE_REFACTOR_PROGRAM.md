# Canonical WorkUnit Pipeline Refactor Program

Status: Ratified subordinate Technical / Domain Architecture Authority

Historical status at evidence snapshot `066a43c3df07f3da10a2fc93ff7d90157c732114`:
Draft for PM and independent security/architecture review. That was the document's current status at
that snapshot, and it was accurate then — the document was not yet ratified. The PM ratification
recorded under [Authority Position](#authority-position) came later and supersedes it as current
status. Every review verdict, evidence count and WU-00 chronology below remains a record of its own
head and is not restated by the ratification.

Evidence snapshot: `066a43c3df07f3da10a2fc93ff7d90157c732114` (`main`, 2026-07-29)

Repository: `haya10hikawa-hub/Atra-workunitOS`

Execution boundary: WU-00 only. No production path, schema, migration, or provider behavior is changed.

## Authority Position

This document is the ratified subordinate Technical / Domain Architecture Authority. The Primary Product / Roadmap Authority is `docs/archive/v0/PHASE1_VALUE_GATE_PROGRAM.md`, ratified by the human PM as `ATRA_PHASE1_PLAN_AUTHORITY_RATIFIED_WITH_MODIFICATIONS`.

The split is exact:

- The Phase-1 Value Gate Program owns what to validate, phase order, Gate semantics, investment sequencing, the Phase-1 critical path, and deferred scope.
- This document owns single canonical product-data truth, record ownership, projection boundaries, composition and dependency rules, the `Candidate != ReviewedWorkUnit` / `Preview != Approval` / `Approval != Execution` boundaries, the architecture ratchets, and bounded WorkUnit review discipline.

**The WU-00 … WU-10 sequence below does not override Phase-1 Product Authority sequencing.** It is an architecture decomposition, not a product schedule. Where the two disagree about what to build next, the Phase-1 Value Gate Program governs; where they disagree about whether a construction is architecturally admissible, this document governs. A WU-nn row is never authorization to start that WorkUnit.

Current code-declaration authorization is unchanged by that ratification: `SourceRecordV1` at `app/lib/domain/source/types.ts` is the only authorized canonical record declaration, and all seven proposal names below remain code-forbidden.

## Goal

Replace the fragmented paths with one source-preserving pipeline:

```text
scattered source signals
→ CanonicalSourceRecord
→ deterministic CorrelationGroup
→ evidence-backed WorkUnitCandidate
→ explicit missing information
→ persisted human correction and review
→ ReviewedWorkUnit
→ ActionPreparation
→ ActionPreview → Approval → RuntimeAuthorization → responsible first action
```

`Candidate != ReviewedWorkUnit`, `Preview != Approval`, and `Approval != Execution` are hard boundaries.

## Current State

The live snapshot has no canonical end-to-end pipeline.

| Runtime/reference path | Reachability | Actual behavior |
| --- | --- | --- |
| Default Launcher | Default page | `MOCK_SIGNALS → SafeWorkUnitCandidate → LauncherWorkUnit`; one signal per candidate, no persistence or correlation |
| Adopted Inbox dashboard | Environment flag | Fake GitHub/Slack/Calendar signals → `InboxWorkUnit` → D1; `source=all` concatenates and persists one WorkUnit per signal |
| Tools LLM route | Development-gated POST | The pure `ExternalSignal → SourceCandidate → WorkUnitDraft → Evaluation` path succeeds, but the live dev-auth + mock-provider POST currently maps to `500 internal_error`; neither path persists canonical state or feeds either UI |
| Hopper/domain/formation implementations | Dormant or branch-only | Correlation and richer lifecycle ideas exist, but no live composition root consumes them |

The main competing families are:

- Source: provider events, `NormalizedToolSignal`, `SourceHopperEvent`, `ExternalSignal`, `SanitizedSignal`, Hopper records.
- Candidate: `SafeWorkUnitCandidate`, `SanitizedWorkUnitCandidate`, `SourceCandidate`, decomposition candidates, Hopper candidates.
- WorkUnit: `InboxWorkUnit`, `LauncherWorkUnit`, two `WorkUnitDraft` families, `ReviewedWorkUnit`, old UI `WorkUnit`, `InboxWorkUnitRow`, dormant `WorkUnitRow`.
- Evidence: strings, display summaries, graphs, Phase 6 evidence records, and docs-only provenance contracts.
- Action Field: candidate drafts, launcher drafts, local dashboard drafts, preview requests, domain previews, and persisted preview rows.

`origin/plan/workunit-formation-provider-processing` tip `4dd2a092` contains unmerged F1–F5 implementation plus an F6 plan; F6 is not implemented there. The branch is evidence and possible source material, not live authority. It must be rebased and reviewed in bounded slices; it must not be copied wholesale.

## Decisions

These are the target decisions proposed by this Draft PR. They become production authority only after PM approval.

### Canonical ownership

| Stage | One authoritative record | Required properties |
| --- | --- | --- |
| Source boundary | `CanonicalSourceRecordV1` | Tenant, provider, provider-native ID, immutable source reference, URL when present, capture time, event time, sanitized content, content hash |
| Correlation | `CorrelationGroupV1` | Non-empty unique source IDs, deterministic rule/version, reasons, conflicts, no ranking side effects |
| Candidate | `WorkUnitCandidateV1` | Evidence membership, goal/done condition, proposed first action, missing fields, conflicts, confidence, human-review-required; work truth only, never attention state |
| Human judgment | `WorkUnitCorrectionV1` and `WorkUnitReviewV1` | Actor, timestamp, reason, before/after or patch, append-only replay order |
| Formal work | `ReviewedWorkUnitV1` | Promotion evidence, resolved required fields, review identity; never created directly from a source route |
| Action preparation | `ActionPreparationV1` | Reviewed WorkUnit identity and exact intended action; then reuse the existing preview/approval/runtime-authorization separation |

`InboxWorkUnit`, `LauncherWorkUnit`, dashboard models, and Atra workspace models become read projections. They must not construct alternate domain truth.

#### Candidate truth is not attention state

`Candidate truth != attention state` is a hard boundary, on the same footing as `Candidate != ReviewedWorkUnit`, `Preview != Approval` and `Approval != Execution`.

`WorkUnitCandidateV1` contains work truth only. Attention, presentation, visibility, viewed/seen, snooze/defer and display-order state are not canonical Candidate truth. Whether a human has looked at a candidate, dismissed it, deferred it, or where it sat in some list is a fact about a viewing session, not a fact about the work.

The boundary is directional, and only one direction is forbidden:

```text
canonical Candidate truth  →  projection / future attention policy      allowed
presentation history       →  canonical Candidate truth                 forbidden
```

A UI, projection or future attention layer may read canonical Candidate truth. Presentation state must never mutate or redefine it.

This is a semantic boundary, not a field-name rule. `dismissed`, `snoozed`, `snoozedUntil`, `seen`, `viewedAt`, `presentationRank`, `displayOrder`, `attentionScore` and `visible` are examples of the excluded class, not its definition; renaming one of them does not satisfy the boundary. Nor does the boundary narrow the record's own required properties above: evidence membership, missing information, conflicts, confidence and human-review-required are statements about the work and remain canonical Candidate truth.

Mixing presentation history into Candidate truth would make one work truth vary with UI history, contaminate human-correction replay with viewing history, invert the projection dependency so a projection feeds domain truth, and force canonical record semantics to change every time an attention policy changes.

Any future attention or admission state lives outside the canonical Candidate record, as a separate state class, and only if post-Value-Gate evidence justifies it. This boundary authorizes no admission, scheduling, queueing or attention-control implementation, introduces no Phase-1 semantic concept, adds no canonical record and expands no allowlist. It constrains what `WorkUnitCandidateV1` may contain if and when P1-3 is separately authorized to declare it; it does not authorize P1-3.

### Composition and dependency rules

1. Raw connector payloads remain outside Core.
2. Exactly one application composition root advances canonical records.
3. Routes authenticate, authorize, validate, and delegate; they do not normalize, correlate, promote, and persist inline.
4. Source membership is many-to-one and immutable. A single `signalId` column is not canonical provenance.
5. Correlation is deterministic and explainable; ranking happens after formation.
6. Required missing information blocks promotion. Human review alone cannot override an unresolved hard requirement without an explicit correction record.
7. Human decisions are persisted and replayable; local React state is not authority.
8. Safe HTTP methods do not write.
9. External actions remain fail-closed until exact preview, approval, actor separation, runtime evidence, one-time claim, and kill-switch checks pass.

## Security Decision Matrix

This matrix is a release criterion for every WorkUnit, not an optional final audit.

| Criterion | Snapshot verdict | Evidence boundary | Required gate before affected production movement |
| --- | --- | --- | --- |
| CSRF | **PARTIAL** | All five POST mutation handlers reject cross-site and missing-origin requests. Current production auth is explicit Bearer JWT, not ambient cookie auth. There is no CSRF token; two GET handlers write (`/api/workunit/inbox`, `/api/integrations/status`); origin configuration is process-global and absent from checked-in Cloudflare vars; target Host is not bound; JSON parsing accepts `text/plain`. | No new mutation without executable cross-site tests. Add one request-scoped mutation guard for method, JSON content type, trusted target Host, and Origin/Referer. Remove GET writes. Cookie/session auth is blocked until `__Host-` Secure/HttpOnly/SameSite cookies plus token/request binding, rotation, and revocation are designed and tested. |
| Authorization / IDOR | **PARTIAL** | Session tenant and role come from control-DB membership; repository reads/writes are tenant-scoped and cross-tenant tests pass. Multi-tenant users receive the first active membership rather than an explicitly selected tenant. Canonical source/candidate/link ownership and tools-source ownership do not yet exist. | Every ID is resolved through an explicitly selected session tenant; every parent-child and integration relationship is verified; cross-tenant duplicate IDs and substitution attempts must fail without disclosure. |
| Security headers | **PARTIAL** | CSP, HSTS, nosniff, frame denial, referrer, permissions, COOP and CORP are configured. CSP currently permits inline scripts/styles, and deployed Cloudflare response evidence was not collected. | Build/runtime header test plus deployed evidence; tighten CSP before calling it strong XSS containment. |
| Authentication flow | **PARTIAL** | HS256 signature, expiry, nbf, issuer, audience, bounded token, and strong production secret checks exist. There is no required `iat`, maximum production lifetime, `jti`/token-version revocation, logout/refresh lifecycle, key ID/rotation, or proven browser Bearer transport. | Versioned auth-state diagram; bounded issuance, refresh, key rotation, revocation and replay tests; explicit browser credential model; session rotation rules before cookie or long-lived session support. |
| SSRF | **PARTIAL / currently unreachable** | Active external clients use fixed vendor origins; real LLM and real GitHub provider selection are disabled. The dormant DeepSeek URL check blocks common literal private addresses, but its direct constructor bypasses that helper and DNS names, redirects, IPv4-mapped IPv6, and alternate IP encodings are not proven. Cloudflare config requests public-only global fetch. | Central outbound policy, redirect revalidation, resolved-IP checks, constructor enforcement, credential scoping, timeout/size limits, and adversarial URL tests before enabling configurable origins. |
| Business-logic vulnerability | **PARTIAL** | Four-eyes preview approval, hash binding, tenant scope, expiry, one-time execution CAS claim, execute RBAC, runtime evidence, and kill switch exist. Current WorkUnit formation bypasses candidate/review semantics; dashboard decisions are not authoritative persisted review; concurrent duplicate Approval decisions are not proven atomic. | Domain invariants and transition tests must accompany each WorkUnit; duplicate decision, replay, stale-state, cross-object substitution, missing-information bypass, and concurrent requests are mandatory cases. |

No verdict above is a deployed security certification. It is repository-level evidence at the pinned SHA.

## Installed WU-00 Ratchets

- TypeScript-AST module graph covering TS/TSX/MTS/CTS/JS/JSX/MJS/CJS and import, import type, direct/local export, `import()`, scoped `require()`/`createRequire`, import-equals, and import-type expressions.
- Fail-closed root walking and real `tsconfig` alias resolution.
- Exact legacy graph: 62 edges (`34 import + 5 import-type + 23 export`) and 28 files. Drift through the supported static module syntax is visible.
- Exact characterization of the default five-record bridge/Launcher projection, reviewed source hashes for the page-to-Launcher composition chain, the live dev-auth Inbox GET with D1 writes, the pure LLM path, and the live dev-auth Tools POST mock-provider error mapping. The fixture records current defects; it does not endorse them as target behavior.
- AST discovery of supported Next route export forms, exact matching to the five executable unsafe-handler probes, and cross-site/missing-origin rejection checks for every current mutation handler. Wildcard/namespace ESM exports and direct CommonJS assignment exports fail closed.
- Exact AST inventory and source hashes for all current GET/HEAD/OPTIONS handlers, with the two known state-changing GETs labeled. This makes local route changes review-visible; it does not infer side effects introduced only inside an imported dependency.
- Executable Bearer success and cookie-only failure, plus an AST guard against ambient-cookie reads in the active auth implementation.
- Exact global Next header-configuration floor for CSP, HSTS, nosniff, frame denial, referrer, permissions, COOP and CORP. Deployed-response proof remains a later gate.
- Explicit CI ratchet suite covering CSRF, tenant/IDOR isolation, headers, JWT validation/config, SSRF guards, approval replay/CAS, architecture, and current pipeline behavior.

Ratchet fixtures may change only with a labeled behavior/architecture decision and independent review.

Evidence limits are explicit: fixture `sourceSha` values identify the refactor base and are not Git-tree attestations; arbitrary `eval` or custom loaders are outside the static graph; safe-handler hashes do not infer imported dependency side effects; Next header configuration is not deployed-response evidence.

## Declared Architecture Debt

Independent review found two dependency-direction violations that exist at the refactor base and that the previous architecture policy did not forbid, so the boundary tests were green while the violations were live. They are recorded exactly in `tests/fixtures/architecture/declared-boundary-debt.v1.json` and enforced by target-boundary policies in `tests/architectureBoundaries.test.mts`. Both have since been resolved — the first by WU-01A, the second by WU-02 — and in each case the record was removed only after its live edges disappeared.

**These are known violations, not approved target architecture.** WU-00 records them; WU-00 does not fix them, because WU-00 changes no `app/**` file.

| Debt ID | Exact violation | Edge kind | Owner |
| --- | --- | --- | --- |
| _(none — the ledger is empty)_ | | | |

**Resolved by WU-02:** `infrastructure_application_signal_contract` — `app/lib/infrastructure/external/{calendar,github,slack}/toNormalizedToolSignal.ts` → `app/lib/application/workunitInbox/types.ts`, type-only. The normalized signal family (`NormalizedToolProvider`, `NormalizedToolSignalType`, `WorkUnitPriority`, `NormalizedToolSignal`) now has its sole declaration at the neutral port `app/lib/ports/toolSignal/types.ts`, which imports nothing, so the three provider mappers depend downward instead of upward. `app/lib/application/workunitInbox/types.ts` keeps the Inbox projection family and a type-only compatibility re-export for existing consumers; it declares none of the four relocated symbols. The new `app/lib/ports/**` layer ships with its own fail-closed boundary policy, so it is not an unpoliced surface. Shape is preserved exactly: field names, declaration order, optionality, vocabularies, `tenantId: string` and `priorityHint` are unchanged, and no mapper output changed.

**Resolved by WU-01A:** `domain_tenant_hybrid_boundary` — `app/lib/domain/{types,workUnitLifecycle}.ts` → `app/lib/tenant/types.ts`, type-only. Both modules now import the canonical declarations in `app/lib/domain/tenant/types.ts` directly, so the `app/lib/domain` → `app/lib/tenant` dependency inversion no longer exists. WU-01A changed those two import specifiers and nothing else; it is not WU-01 and introduces no canonical record family.

`app/lib/tenant/types.ts` is still not a pure compatibility shim, and WU-01A did not make it one. It re-exports canonical tenant identity types from `app/lib/domain/tenant/types.ts` while remaining the sole physical owner of `Actor`, `TenantContext`, `TenantBoundaryResult`, `assertTenantBoundary`, `requireTenantContext` and `createAnonymousDevelopmentTenantContext`. What changed is only the direction of dependency: the domain layer no longer reaches upward into it. It retains the highest fan-in in the repository — **89 importer files across 91 edges**, of which 90 are type-only and **one is a live value import** (`tests/saasSecurity.test.mts`). The runtime helpers have no verified *production* call sites; that is a narrower claim than "no call sites", and the module is therefore neither dead, unreachable nor removable. Relocating those six symbols remains open, unowned and deferred: `Actor`, `TenantContext` and `TenantBoundaryResult` have no consumers anywhere outside the module itself, so their home is a genuine product decision, and `createAnonymousDevelopmentTenantContext` collides by name with a different function in `app/lib/security/session.ts` that returns a `Session`.

**WU-01 may not introduce the new canonical domain record family on top of the tenant hybrid** without first resolving it or recording an explicit PM re-scope. WU-01A closed the dependency-direction half of that gate only; the hybrid module itself is unchanged, and building `ReviewedWorkUnitV1` and `WorkUnitCandidateV1` still requires the separate authorization WU-01 has not been given.

**WU-02 has closed the relocation of the normalized signal contract.** Its new home is the top-level port `app/lib/ports/toolSignal/types.ts`; provider adapters no longer depend on an application-layer type. Domain placement was rejected on evidence — `app/lib/domain/` already hosts two source vocabularies (`SourceType`/`SourceRef`/`ExternalSignal` and `SourceRecordV1`), and a third would create the source-authority collapse the program exists to prevent.

**This slice is narrower than the WU-02 row in the WorkUnit table below.** WU-02 as executed is the dependency-direction closure only. Canonical source adapters in shadow mode, provider integration and GET-write remediation were **not** authorized, **not** implemented and remain open; the WU-02 label must not be read as satisfying that row. It also creates no `SourceRecordV1` consumer, conversion or persistence, changes no route, UI or migration, and adds no provider operation.

The ledger is exact-path based and is deliberately not an allowlist. Reconciliation asserts set equality in both directions against the live scan, so each of the following fails rather than being absorbed: an undeclared equivalent violation, a new importer of a declared target, a moved or different path, a declared type-only edge upgraded to a value edge, a stale entry whose source or target no longer exists, and any attempt to declare a directory prefix, glob or basename instead of a concrete file. Removing a debt requires the live edge to be gone, not the record to be edited.

The existing 62-edge / 28-file legacy fixture is unchanged and remains a characterization of the exact legacy compatibility surface only. It is not a storage location for architecture debt.

### Debt mechanism classification

The declared-architecture-debt ledger is a `REVIEW_GOVERNED_DEBT_REGISTRY`. It is **not** a `MACHINE_CLOSED_RATCHET`.

The distinction is operational, not cosmetic. Reconciliation is machine-checked in both directions, so no violation is silently absorbed and no entry can be a glob, prefix or basename. But the registry cannot decide whether a new violation is *acceptable*. Adding a new violation together with a matching ledger entry — and the matching `DEBT_IDS` entry in `tests/architectureBoundaries.test.mts` — is technically possible and would produce a green suite. **That path is not approved.** Ledger expansion requires a separate PM/architecture decision recorded before the change. A green suite is evidence that the registry reconciled; it is never evidence that the expansion was authorized.

Contraction is governed exactly as expansion is. A debt leaves the ledger only when its live edges are already gone, and the source-controlled `DEBT_IDS` literal in `tests/architectureBoundaries.test.mts` must be changed by a human in the same review. Removing the record is never the mechanism of closure, and a resolved id may not reappear.

#### Recorded decision: `ATRA_PM_ARCHITECTURE_DEBT_REGISTRY_EXPANSION_WU_A_RATIFIED`

The Human PM records and ratifies this expansion of the declared architecture-debt registry.

The decision approves **recording** the exact live violations that became observable when the WU-A architecture-enforcement slice installed outbound policies for previously unpoliced layers. It approves nothing else. Each recorded entry must correspond to a real live edge, with exact source path, exact target path and exact edge kind; the target boundary policy must still reject the edge; the registry must not act as permission; and stale entries, undeclared new violations, widened records, edge-kind upgrades and resurrection of resolved debt must all fail.

**Recording an existing violation is not approving it as target architecture.** Every entry stays `known_open` with a removal gate, and its owning WorkUnit is prospective ownership only — never authorization to start that WorkUnit.

`WU-A` is an architecture-remediation label for that enforcement slice. It is **not** a canonical product WorkUnit, and it does not enter the WU-00 … WU-10 table or its sequencing.

The declared debt is **not** empty. The registry holds exactly the records ratified above; `tests/fixtures/architecture/declared-boundary-debt.v1.json` is the machine-readable source of truth for their content, reconciled bidirectionally against the live scan by `tests/architectureBoundaries.test.mts`. That fixture is deliberately not restated here, because two copies of one state is how the two stop agreeing.

WU-A introduced no runtime debt: it changed no file under `app/`. The violations it records were already live at the baseline named by each entry's own `source_sha`; what changed is that a policy now observes them. Any further entry still requires a separate PM/architecture decision recorded before the change, and removal still requires the live edge to disappear first.

Previously declared and now resolved: `domain_tenant_hybrid_boundary` (closed by WU-01A), `infrastructure_application_signal_contract` (closed by WU-02), and three closed by the WU-06 request-composition-root slice — `application_session_outward_value_composition`, `application_session_d1_driver_type_contract` and `security_application_session_resolution_cycle`. No resolved id may reappear.

The WU-06 contraction followed the rule above rather than around it. All three records left the ledger only after their live edges were already absent from the scan, which the suite reported as *stale declared debt* before a single ledger line was edited. `application_session_outward_value_composition` declared three targets in one record, and the record's own removal gate required all three to close in one review or be split by a human: all three closed together, so no split was needed and none was performed. `application_inbox_provider_implementation_selection` is untouched and stays `known_open` under WU-02 — the registry now holds exactly one record over six exact edges.

Recording `WU-01` or `WU-02` as debt owner assigns prospective ownership only. It does **not** authorize starting, implementing, or merging those WorkUnits.

## Reachability Evidence Limit

The WU-00 graph models supported static module syntax. It does not establish runtime reachability, operator-entry reachability, path-string references, configuration references, documentation-command references, or zero dead code.

Concretely, WU-00 does **not** prove:

- runtime entry-point reachability
- test-only reachability
- operator-command reachability
- configuration references
- documentation command references
- path-string source-reading references
- orphan or dead-code absence

Therefore `legacy edge/file baseline = 0` must **not** be read as `unreachable code = 0`. A module with no static importer may still be reached by a path string in a source-reading contract test, a documented operator command, a package script, or configuration; and a module outside the four legacy roots is not covered by the legacy file inventory at all. WU-00 does not implement reachability analysis, and no claim in this program should be read as though it does. A reachability and non-import-reference gate is required before WU-10 can complete.

## Non-Authority Boundaries

These boundaries are pinned by permanent tests in `tests/architectureBoundaries.test.mts`, so they cannot decay into assumption.

### Proposal terminology is not runtime authority

`CanonicalSourceRecordV1`, `CorrelationGroupV1`, `WorkUnitCandidateV1`, `WorkUnitCorrectionV1`, `WorkUnitReviewV1`, `ReviewedWorkUnitV1` and `ActionPreparationV1` are proposal terminology in this document. They are not current runtime product-data authority. No such type is declared anywhere in the repository at this head, and WU-00 does not implement runtime product-data authority.

### WU-01 is not authorized

WU-00 does not start WU-01. No canonical record family, persistence, provider integration, or runtime implementation is authorized by this PR, and none is authorized by a debt-ownership entry naming WU-01. Debt ownership records who *would* own the fix, not permission to begin.

### WU-01B source record re-scope

The product owner recorded one bounded, written re-scope of the tenant-hybrid gate, limited to a single record. `SourceRecordV1` is the only authorized canonical record declaration, and it is authorized at exactly one path, `app/lib/domain/source/types.ts`. The seven proposal names remain forbidden. Both statements are enforced by a closed allowlist over the whole versioned-record family, so a second record under a fresh, unlisted name fails rather than passing by omission.

The re-scope authorizes nothing else. It does not authorize `WorkUnitCandidateV1`, `ReviewedWorkUnitV1`, any proposer or reviewer contract, any `Actor` or `TenantContext` dependency, or the canonical record family as a whole. It does not resolve the tenant hybrid, which is unchanged: the record consumes only the canonical branded `TenantId`, and needs none of the six symbols still physically owned by `app/lib/tenant/types.ts`. It adds no production consumer, no persistence, no migration, no provider call, no adapter, no composition root, no UI and no API route, and it neither changes nor replaces the live unversioned domain family. `infrastructure_application_signal_contract` was still `known_open` and unchanged at the time of that re-scope; it was closed later, by WU-02, with no relationship created between the normalized signal contract and `SourceRecordV1`.

The remaining WU-01 scope — candidate, correction, review, reviewed WorkUnit and action preparation — stays unstarted and unauthorized, as do WU-01C, WU-02, WU-03, H1B3, formation, correlation, persistence and provider integration.

### Phase-1 semantic ratification is not code authorization

The human PM has since ratified three of the seven proposal names as Phase-1 semantic targets, under decision C recorded in `docs/archive/v0/PHASE1_VALUE_GATE_PROGRAM.md`. That ratification names the intended semantic authority. It does **not** authorize any TypeScript declaration, path, or schema.

| Name | Product status | Code status at this head |
| --- | --- | --- |
| `CorrelationGroupV1` | `RATIFIED_PHASE1_SEMANTIC_TARGET` | forbidden — may be authorized no earlier than P1-2 |
| `WorkUnitCandidateV1` | `RATIFIED_PHASE1_SEMANTIC_TARGET` | forbidden — may be authorized no earlier than P1-3 |
| `WorkUnitCorrectionV1` | `RATIFIED_PHASE1_SEMANTIC_TARGET` | forbidden — may be authorized no earlier than P1-5 |
| `CanonicalSourceRecordV1` | no ratified semantic status | forbidden |
| `WorkUnitReviewV1` | no ratified semantic status | forbidden |
| `ReviewedWorkUnitV1` | no ratified semantic status | forbidden |
| `ActionPreparationV1` | no ratified semantic status | forbidden |

The closed allowlist is unchanged and still lists exactly one canonical record declaration. Each future expansion is just-in-time: the bounded WorkUnit that introduces the record reviews its exact declaration path and contract, and a human edits the source-controlled allowlist literal in that same review. An alias or alternate name that evades the closed family registry is a governance violation, not a route around it.

### PR #211 is `UNMERGED_NON_AUTHORITY_INPUT`

PR #211 (`feat/f6-formation-findings`) is unmerged, blocked, non-authority input. This program does not modify it, does not consume it, does not copy it, does not reference it as authority, and does not authorize merging it. It is not an authority input for any WorkUnit, and F6A is not a WU-03 authority input. Its exact four-file family is absent at this head, and no alternate module path, re-export or branch token reintroduces it.

### H1B3 and downstream work are not authorized

WU-00 authorizes no H1B3 restart, no runtime implementation, no persistence, and no provider integration.

## Bounded WorkUnits and Draft PRs

| WorkUnit | Draft PR scope | Production cutover | Exit gate |
| --- | --- | --- | --- |
| **WU-00** | Program record, AST architecture ledger, current behavior/security ratchets | None | Independent architecture and security review; PM approves target authority |
| WU-01 | Add versioned canonical records and transition/golden tests; no consumer | None | Source preservation, many-source cardinality, missing-field promotion failure, correction replay |
| WU-02 | Canonical source adapters in shadow mode; move GET writes behind a shared authenticated mutation guard | None | Provider/integration ownership, identity/timestamp/URL preservation, method/content-type/Origin/Host gate, no raw payload in Core |
| WU-03 | Deterministic correlation/formation core; selectively reconcile reviewed F1–F5 implementation slices and treat F6 as design input only | Shadow only | `N sources → correlation group → candidate`, explanation and conflict fixtures, executable provenance |
| WU-04 | Canonical candidate service plus adapters for current Inbox/Launcher/LLM results | Shadow only | Exact old/new comparison, explicit allowed differences, no projection data loss |
| WU-05 | Additive canonical persistence and source-membership schema | Dual write/read | Tenant/IDOR, rollback, backfill, D1 round-trip, concurrent duplicate and replay tests |
| WU-06 | Single API/application composition root | Gated | Routes only delegate; no alternate WorkUnit constructors; safe HTTP methods read only |
| WU-07 | Default Launcher reads canonical projection; mock becomes explicit fixture mode | Flagged cutover | Browser/runtime evidence, rollback flag, no raw or server-owned fields |
| WU-08 | Persist corrections, missing-information resolution, and human review | Gated | Actor/time/reason replay, unresolved hard fields cannot promote |
| WU-09 | Bind reviewed WorkUnit to responsible first-action preparation | Gated | CSRF, IDOR, preview/approval/authorization binding, atomic single decision, four-eyes, CAS, outbound SSRF policy, durable rate/cost limits, external-effect idempotency, kill switch |
| WU-10 | Delete alternate constructors, compatibility wrappers, dead rows and old UI paths | Final cleanup | See the WU-10 cleanup exit gate below; the legacy edge/file baseline alone is not sufficient |

Each WorkUnit is one Draft PR. No WorkUnit merges or starts its successor until a differently biased reviewer records a written handoff.

### WU-10 cleanup exit gate

WU-10 completes only when **all** of the following hold. The legacy edge/file baseline is necessary but not sufficient, because it is a static-syntax measure over four legacy roots and says nothing about reachability.

- legacy edge baseline = 0
- legacy file baseline = 0
- production entry-point reachability classified
- test-only reachability classified
- operator entry points classified
- non-import references checked, covering path strings, configuration, package scripts and documentation commands
- remaining unreachable modules explicitly classified
- PM decisions recorded for dormant research and prototypes
- declared architecture-debt ledger contains no `known_open` entry, or each remaining entry has a recorded PM re-scope

A module is not eligible for deletion merely because it has no static importer. WU-10 requires a reachability and non-import-reference instrument, which WU-00 does not provide.

## WU-00 Acceptance

- No changes under `app/**`, `migrations/**`, or runtime configuration.
- `npm run test:canonical-pipeline-ratchets` passes. Exact count by state, so no single number is read as timeless:
  - **228** at the first reviewed WU-00 state (Review 1);
  - **234** at reviewed exact head `37b9411d` (Review 2);
  - **240** at reviewed exact head `4c87ec0f` (Review 3);
  - **242** at this final governance-pin closure candidate, which is not yet independently reviewed.
- `node scripts/report-legacy-surface.mjs` reports 62 exact edges, 28 files, and zero drift.
- Full tests, safety gate, lint, builds, and diff check run with pre-existing failures distinguished from regressions.
- Draft PR only; no merge and no subsequent WorkUnit.

## Next Action

Independent reviewers must answer:

1. Is the new versioned family the approved authority, rather than any current self-described “canonical” type?
2. Are source identity, many-source membership, missing-information promotion, and correction replay complete enough for WU-01?
3. Is `CSRF = PARTIAL` accepted, with both state-changing GET handlers treated as blocking debt?
4. Are branch-only F1–F5 implementation slices, with F6 retained as plan-only input, eligible only through bounded rebase/review and never wholesale adoption?

Stop after the WU-00 Draft PR. PM authorization is required before WU-01.

## Independent Review

Three independent reviews have been recorded. They are **distinct events at different heads**. An earlier review's verdict is history and must not be read as a verdict on a later head.

### Review 1 — first reviewed WU-00 state (superseded)

- Verdict: `BLOCK`; seven P1 false-green paths were identified across module scanning, legacy exports, route discovery, safe-method writes, runtime characterization, headers, and architecture controls.
- Remediation: all seven were closed inside WU-00 without production changes; adversarial positive controls were added.
- Dedicated ratchet suite at that state: **228/228**.
- This verdict is superseded. It is not a review of the current head.

### Review 2 — exact head `37b9411d5279826ecdeaedcbab6bb20effb1d11e`

- Scope: independent architecture and evidence review of that exact commit.
- Verdict token: `WU00_EXACT_HEAD_INDEPENDENT_ARCHITECTURE_EVIDENCE_GO`.
- Program disposition: `PM_REVIEW_ELIGIBLE_ONLY`.
- Review report SHA-256: `b419937133e4fe01bdfea5b492f5c5aa0b6ae9cf70bbacec45ace94bd511d2d0`.
- Dedicated ratchet suite at that head: **234/234**.
- Legacy surface: 62 edges, 28 files, zero drift.
- The two declared architecture-debt entries recorded above were surfaced by independent review; the exact ledger and the target-boundary policies are that remediation.

### Review 3 — exact head `4c87ec0f90fa199883fe572de27e192728939a5a`

- Scope: independent review of the bounded governance-correction commit at that exact head.
- Decision: `NOT_READY — WU00_CORRECTION_MUTATION_SURVIVOR`.
- Secondary decision: `WU00_PR211_BOUNDARY_INCOMPLETE`.
- Review report SHA-256: `e44fdc4f024fac189c9edc57fc1bf6e09b9873f9d1a9d1f1dee6e4069e80aff4`.
- Dedicated ratchet suite at that head: **240/240**.
- Eight of eighteen counterexamples survived: the review chronology was pinned by no test, and the PR #211 boundary admitted an alternate module family and a documentary authority promotion.
- All local gates and exact-head CI were green. Green gates did not override the surviving counterexamples.

### Final governance-pin closure candidate

- Adds exactly two permanent governance tests: review chronology and assurance binding, and PR #211 family and authority isolation.
- Dedicated ratchet suite at this candidate: **242/242**.
- This candidate has not received an independent GO. No earlier verdict applies to it.
- It requires a fresh exact-head independent review.
- Ready, merge and WU-01 remain unauthorized.

### Review boundary

- `PM_REVIEW_ELIGIBLE_ONLY` means the PR is eligible for PM review. It is **not** Ready, **not** approved for merge, and does **not** authorize WU-01.
- A GO is bound to the exact head it names. It must not be carried forward to a later head. Every commit recorded after a review changes the head, and therefore **requires a fresh independent review at the new head**.
- Explicit evidence limits are unchanged: safe-handler transitive effects, deployed headers, custom loaders/eval, and indirect CommonJS export patterns.

## Risks

- A green characterization test can freeze a defect if reviewers mistake “current” for “desired.”
- Default UI currently drops candidate graph, evidence summary, and review flags before display.
- `source=all` can look like correlation while only concatenating arrays.
- Current D1 storage cannot represent many-source WorkUnit provenance.
- A state-changing GET becomes materially more dangerous if future cookie auth is introduced.
- The current browser clients do not attach the Bearer credential required by production auth; no upstream injector was proven.
- Choosing the first active membership can route a multi-tenant user into the wrong tenant context.
- A CSP header containing `unsafe-inline` must not be reported as strong script-injection containment.
- Dormant SSRF checks must not be treated as production proof, and production-disabled providers must not be enabled incidentally.
- Type names and docs that say “canonical” are not runtime authority without one composition root and executable provenance.
