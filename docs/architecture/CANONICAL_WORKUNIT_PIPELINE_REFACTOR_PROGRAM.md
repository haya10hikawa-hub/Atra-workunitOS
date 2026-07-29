# Canonical WorkUnit Pipeline Refactor Program

Status: Draft for PM and independent security/architecture review

Evidence snapshot: `066a43c3df07f3da10a2fc93ff7d90157c732114` (`main`, 2026-07-29)

Repository: `haya10hikawa-hub/Atra-workunitOS`

Execution boundary: WU-00 only. No production path, schema, migration, or provider behavior is changed.

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
| Candidate | `WorkUnitCandidateV1` | Evidence membership, goal/done condition, proposed first action, missing fields, conflicts, confidence, human-review-required |
| Human judgment | `WorkUnitCorrectionV1` and `WorkUnitReviewV1` | Actor, timestamp, reason, before/after or patch, append-only replay order |
| Formal work | `ReviewedWorkUnitV1` | Promotion evidence, resolved required fields, review identity; never created directly from a source route |
| Action preparation | `ActionPreparationV1` | Reviewed WorkUnit identity and exact intended action; then reuse the existing preview/approval/runtime-authorization separation |

`InboxWorkUnit`, `LauncherWorkUnit`, dashboard models, and Atra workspace models become read projections. They must not construct alternate domain truth.

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
| WU-10 | Delete alternate constructors, compatibility wrappers, dead rows and old UI paths | Final cleanup | Legacy edge/file baseline reaches zero; full behavior/security suite and rollback decision |

Each WorkUnit is one Draft PR. No WorkUnit merges or starts its successor until a differently biased reviewer records a written handoff.

## WU-00 Acceptance

- No changes under `app/**`, `migrations/**`, or runtime configuration.
- `npm run test:canonical-pipeline-ratchets` passes (228 tests at the reviewed WU-00 state).
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

- Initial verdict: `BLOCK`; seven P1 false-green paths were identified across module scanning, legacy exports, route discovery, safe-method writes, runtime characterization, headers, and architecture controls.
- Remediation: all seven were closed inside WU-00 without production changes; adversarial positive controls were added.
- Final verdict: `NO BLOCKING FINDINGS`; 228/228 dedicated ratchet tests pass, with 62 legacy edges and 28 legacy files at zero drift.
- Review boundary: merge and WU-01 remain blocked pending PM review. Safe-handler transitive effects, deployed headers, custom loaders/eval, and indirect CommonJS export patterns remain explicit evidence limits.

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
