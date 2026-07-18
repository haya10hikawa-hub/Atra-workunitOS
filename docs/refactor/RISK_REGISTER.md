# Risk Register — Large-SaaS Refactor Program

Lower-value or partially-evidenced observations that do NOT warrant individual
GitHub Issues. Reviewed each workstream; promote to an Issue only when evidence
or impact grows. IDs are stable.

| ID | Observation | Type | Confidence | Notes |
|---|---|---|---|---|
| R-01 | `approval` GET requires `canCreatePreview` instead of a read permission | Bug (minor) | Confirmed | fold into route-contract tests, fix in tenant-security WS |
| R-02 | Request-id conventions inconsistent (`resolveRequestId` vs `inbox:${Date.now()}` vs `"na"`) | Observability Gap | Confirmed | fold into AUD-004 fix |
| R-03 | `tools` route GET uses constant requestId `tools-list-na` | Observability Gap | Confirmed | same as R-02 |
| R-04 | Approval-route TOCTOU: concurrent decisions both pass `findByPreviewId` then race `create`; loser surfaces an unhandled `D1RepositoryError` (500, unsafe envelope) | Reliability Defect | Probable (not reproduced under real concurrency) | deterministic id makes double-approve impossible — correctness holds; error envelope does not |
| R-05 | `processWorkSignal` evaluation-stage failure degrades to `ok:true` (manual-review marker) — deliberate but undocumented | Documentation Drift | Confirmed | document in LLM boundary docs |
| R-06 | Session `expiresAt`/`sessionId` minted per request; no server-side session lifecycle | Architecture Debt | Confirmed | JWT `exp` is the real bound; fold into tenant-security WS |
| R-07 | Inbox route hand-builds `TenantDbContext { db: null }` instead of using the bundle ctx | Architecture Debt | Confirmed | works today (D1 repos own their handle); violates factory boundary |
| R-08 | `resolveGitHubSource`/`approvalStoreResolver`/`providerConfig` read `process.env` via default parameters (outside runtime-config authority) | Architecture Debt | Confirmed | dev-only paths; close in domain-boundaries WS |
| R-09 | Provider tokens are global env (`GITHUB_ACCESS_TOKEN`), not per-tenant `integration_connections` | Architecture Debt | Confirmed | real clients disabled today; must be per-tenant before any real provider wiring |
| R-10 | `getTrustedClientIp` falls back to shared `"unknown"` bucket without CF header | Reliability (minor) | Confirmed | keyed also by tenant+user, so bounded |
| R-11 | Regex-based source-guard tests are brittle against benign refactors | Test Gap | Confirmed | replace incrementally with import-graph assertions |
| R-12 | 1 intentionally skipped test in baseline (4591/4590/1) | Test Gap | Confirmed | identify + justify or unskip in test-platform WS |
| R-13 | `docs/**` 70+ overlapping contract documents with drift risk; `DOCS_CONSISTENCY_AUDIT.md` exists but is itself aging | Documentation Drift | Confirmed | consolidation under refactor docs index |
| R-14 | Electron shell reads `ATRA_ELECTRON_START_URL` unvalidated (origin allowlist derives from it) | Security (low) | Confirmed | operator-set local var; Electron remains No-Go |
| R-15 | `npm audit` 15 vulns are all in devDependencies/toolchain — runtime deps are 4 packages | Supply chain | Confirmed | context for #128 prioritization |
| R-16 | No staging environment definition (local → production only) | Operational Gap | Confirmed | part of AUD-009/#158 scope |
| R-17 | `alpha:safety-gate` asserts docs/matrix wording — protective but couples gates to prose | Operational Gap | Confirmed | keep until replaced by typed release gates |

Investigation candidates (NOT issues yet):

| ID | Question | Blocking evidence needed |
|---|---|---|
| INV-01 | Does OpenNext on workerd populate `process.env` before module evaluation of route chunks? (Sharpens AUD-002 from latent to certain for the deployed worker.) | Local `wrangler dev` probe with a module-scope env read — no remote resources needed |
| INV-02 | Miniflare/D1 UNIQUE-error message parity with production D1 for `writeGuards` classification | Already covered by real node:sqlite tests; needs one remote-D1 confirmation when #155 executes |
