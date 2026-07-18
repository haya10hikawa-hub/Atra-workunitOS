# SaaS Maturity Scorecard (L0–L5)

Base: `origin/main` @ `2669f2ea`. Scale: L0 absent · L1 prototype · L2
small-team · L3 normal production SaaS · L4 large-scale SaaS · L5 regulated /
mission-critical. Scores are justified by code, tests, runtime behavior, and
operational documentation — not by test existence or intention.

| Category | Current | Target | Gap owner (workstream) |
|---|---|---|---|
| A. Architecture boundaries | **L2** | L4 | domain-boundaries |
| B. Domain model & transitions | **L3** | L4 | domain-boundaries |
| C. Multi-tenancy | **L4** | L5 | tenant-security |
| D. AuthN/AuthZ | **L4** | L5 | tenant-security |
| E. Persistence & migration | **L4** | L5 | persistence-integrity |
| F. External action safety | **L4** | L5 | execution-safety |
| G. AI/LLM safety | **L4** | L5 | execution-safety |
| H. Reliability & failure isolation | **L1** | L4 | reliability-observability |
| I. Observability & auditability | **L1** | L4 (audit L5) | reliability-observability |
| J. Performance/scalability/cost | **L1** | L4 | reliability-observability |
| K. API & contract quality | **L3** | L4 | domain-boundaries |
| L. Config, secrets & deployment | **L4** | L5 | test-deployment-platform |
| M. Supply-chain security | **L2** | L4 | test-deployment-platform |
| N. Test architecture | **L4** | L4 | test-deployment-platform |
| O. Maintainability & DX | **L2** | L4 | domain-boundaries |
| P. Privacy & data lifecycle | **L1** | L4 | tenant-security |

---

## A. Architecture boundaries — L2 → L4

- **Evidence:** No critical cycles; domain imports no providers
  (DEPENDENCY_MAP §Findings). But: 504-line `tools/route.ts` embeds
  orchestration; 66 dead files + 120 unwired files (51% of `app/**` not
  runtime-reachable); duplicated trees (`workunitInbox/sources` vs
  `infrastructure/external`; `actionField` vs `application/actionField`;
  5 UI generations); boundaries exist by convention + regex source-guards,
  not by enforced dependency tests.
- **Failure mode:** teams cannot change components independently; edits land in
  dead twins; route logic untestable without HTTP layer.
- **Required change:** extraction of route business logic into application
  services; dependency-direction tests; reachability ratchet; staged deletion
  of proven-dead trees (#137, #153).
- **Verification:** dependency-direction + ratchet tests in
  `refactor/domain-boundaries` (first PR); line-count/route-logic review.

## B. Domain model and state transitions — L3 → L4

- **Evidence:** `workUnitLifecycle.ts` typed transitions with guards + tests;
  approval status machine enforced in `verifyApproval` AND the D1 claim
  predicate (server-authoritative). But transitions are enforced where called,
  not everywhere state changes (route code constructs approval rows directly;
  `updateStatus` accepts any status value); retry/cancellation lifecycles
  absent (no execution yet).
- **Failure mode:** a new route can write an illegal state without compiler or
  runtime objection.
- **Required change:** move row construction behind lifecycle-checked
  application services; type status transitions on the repository API.
- **Verification:** state-transition test matrix incl. illegal transitions at
  the repository boundary.

## C. Multi-tenancy — L4 → L5

- **Evidence (strong):** every D1 predicate tenant-scoped (reads, writes,
  UPDATE, upsert owner pre-check); relationship enforcement with opaque
  `parent_boundary_violation`; mandatory resolver, prod fail-closed
  (PR #165 rounds 1–3, mutation-verified); session tenant from control DB only.
- **L5 gaps:** tenant attribution order-dependent (first active membership —
  AUD-003); rate-limit/approval dev stores keyed but process-global (AUD-001);
  provider tokens global (R-09); logs/audit rows carry tenant ids into a
  fail-open pipeline (#156); no per-tenant blast-radius controls (H).
- **Verification:** multi-membership determinism tests; per-boundary
  fail-closed proofs (existing cross-tenant suites stay green).

## D. Authentication and authorization — L4 → L5

- **Evidence (strong):** JWT HS256 with required issuer/audience/≥32-byte
  secret in prod; dev adapter impossible in prod (fail-closed
  `dev_adapter_forbidden`); RBAC separate from authN; four-eyes fail-closed;
  runtime gate re-checks RBAC + kill switch + executor≠approver.
- **L5 gaps:** authN/authZ decisions not independently auditable (audit sink
  no-op — I); session has no server-side lifecycle (sessionId minted per
  request, `expiresAt` decorative); `approval` GET gated on the wrong
  permission (`canCreatePreview`); no key rotation story for JWT secret (L).
- **Verification:** auditable decision records per boundary; session lifecycle
  tests; permission-matrix characterization tests.

## E. Persistence and migration integrity — L4 → L5

- **Evidence (strong):** manifest v2 (SHA-256-pinned lanes, replay_safe/once),
  ledger with 7 reconcile states fail-closed, reconstruct-and-compare artifact
  binding, TOCTOU-closed private exec configs, one config authority, honest
  post-commit verification, 80/80 mutation-verified (PR #166 rounds 1–4).
- **L5 gaps:** remote execution NEVER exercised (#155 open — reproducibility
  proven only against local SQLite/miniflare shapes); no rollback migration
  lane; no backup/restore or corruption-recovery procedure (P); single shared
  tenant D1 (per-tenant routing deferred, registry exists).
- **Verification:** authorized remote execution evidence (out of program
  scope); restore-drill runbook + test.

## F. External action safety — L4 → L5

- **Evidence (strong):** preview/approval hash binding, four-eyes, 30-min
  expiry, exact-binding atomic one-time claim, kill switch default-off,
  client-supplied authority stripped, gate returns `authorized_not_executed`;
  production approval store default-deny.
- **L5 gaps:** the provider EXECUTOR does not exist (#152) so
  idempotency/partial-provider-failure/at-least-once semantics are unproven;
  legacy `markApprovalUsed` unbound path retained (#151/#132 family);
  in-memory claim store per-isolate in dev (AUD-001).
- **Verification:** executor workstream (`refactor/execution-safety`) with
  provider-double failure injection; deletion of legacy unbound path.

## G. AI/LLM safety — L4 → L5

- **Evidence:** model advisory-only (nothing model-generated reaches approval
  or execution authority); injection flags fail-closed pre-LLM; per-stage char
  budgets; SSRF-guarded provider base URL; real providers disabled in prod,
  unreachable in resolver.
- **L5 gaps:** output-schema hardening open (#135); evaluation-stage fail-open
  degrade is undocumented operator behavior; budget is char-proxy not tokens;
  no per-tenant LLM cost isolation.
- **Verification:** malformed-output + hallucinated-ID + budget-overflow suites
  (some exist); tokenizer-based budget with tests.

## H. Reliability and failure isolation — L1 → L4

- **Evidence:** ONLY DeepSeek has a timeout; no retry policy, no circuit
  breaker, no backpressure, no queue, no bounded concurrency anywhere;
  rate limiter is an in-memory Map — on Cloudflare Workers this is per-isolate
  and resets on eviction (AUD-001), so the production limiter does not limit;
  inbox `Promise.all` on providers has no timeout; sequential N+1 upsert loop.
- **Failure mode:** one slow provider stalls requests; a burst bypasses rate
  limits by landing on fresh isolates; retry storms unbounded.
- **Required change:** durable rate limiting (DO/KV), timeout+retry budget
  wrappers on every outbound call, bounded batch writes, tenant-level
  concurrency caps.
- **Verification:** failure-injection tests (timeout, outage, partial success),
  isolate-reset simulation for limiter semantics.

## I. Observability and auditability — L1 → L4 (audit L5)

- **Evidence:** `writeAuditLog` is a no-op outside dev-verbose
  (`auditLog.ts:112`); durable audit only on selected security paths and
  FAIL-OPEN (swallowed catch); no metrics, no tracing, no structured request
  logs, no alerting; request-id conventions inconsistent (`resolveRequestId`
  vs `inbox:${Date.now()}` vs `"na"`); error categories stable (good).
- **Failure mode:** an operator cannot reconstruct most incidents; silent audit
  loss is undetectable (#156).
- **Required change:** single structured log/audit emitter with correlation
  IDs; fail-closed (or at-least loss-counted) audit for security decisions;
  minimal metrics per route/provider.
- **Verification:** audit-completeness tests (every decision path emits),
  redaction proofs (exist), loss-accounting test.

## J. Performance, scalability and cost — L1 → L4

- **Evidence:** no pagination on inbox response; `persistWorkUnits` N+1
  (findById+upsert per unit, sequential); no indexes verified against hot
  query list (0005 adds tenant-scoped indexes — good); no payload maximums on
  responses; no benchmarks or p95 tracking; LLM cost bounded per-request only.
- **Required change:** pagination + bounded batches on hot paths; performance
  baselines for the 8 critical paths (Phase 19); index/query review.
- **Verification:** perf smoke harness in CI (bounded, deterministic).

## K. API and contract quality — L3 → L4

- **Evidence:** runtime input validation everywhere (bounded JSON, allowlists);
  stable safe-error vocabulary + status mapping; idempotent claim semantics.
  Gaps: no output-DTO validation (#131/#134 leakage class); no API versioning;
  no idempotency keys on writes; GET inbox mutates (#156); inconsistent
  request-id + envelope shapes across routes.
- **Verification:** contract tests per route (envelope, status, DTO
  allowlist) in `refactor/domain-boundaries`.

## L. Configuration, secrets and deployment — L4 → L5

- **Evidence (strong):** request-scoped validated config, prod fail-closed on
  every dev capability; deploy preflight/dry-run synthetic in CI; double-gated
  remote ops; secrets length-bounded, never logged (redaction suites).
- **L5 gaps:** CSRF allowlist read at module scope from `process.env` with a
  localhost default and NO deployment config source (AUD-002 — a fresh
  production deploy would 403 every browser write); no staging environment
  definition; no secret-rotation runbook; `ALLOWED_ORIGINS` absent from
  `wrangler.json` vars.
- **Verification:** config-authority test proving no module-scope env reads on
  runtime paths; deploy-time origin-config preflight check.

## M. Supply-chain security — L2 → L4

- **Evidence:** lockfile committed; only 4 runtime deps; but `npm audit` = 15
  vulns (7 high, toolchain — #128); GitHub Actions pinned to mutable tags
  (`actions/checkout@v4`), not SHAs; no Dependabot/Renovate; no provenance;
  CI has `contents: read` (good).
- **Required change:** SHA-pin actions, dependency-update automation, audit
  gate in CI (#128, #136).
- **Verification:** CI job diff; audit-gate red test.

## N. Test architecture — L4 (maintain)

- **Evidence:** 4591 tests / 14 s; real `node:sqlite` boundary proofs;
  subprocess + signal tests; mutation-verified security suites (80/80);
  deterministic (2 clean baseline runs). Debt: 81 TS errors in 23 test files
  with NO CI tsc gate (AUD-005); regex source-guards are brittle; 1 skip.
- **Required change:** CI `tsc --noEmit` gate after burn-down; replace the
  brittleist source-guards with import-graph tests.

## O. Maintainability and developer experience — L2 → L4

- **Evidence:** 51% of `app/**` not runtime-reachable; duplicate trees; naming
  drift (phase6/P0/P6 codenames); 70+ docs of overlapping contracts with drift
  risk (#137, #158); single-command local flows exist (good);
  `AGENTS.md`/whiteboards mix process notes with source.
- **Required change:** staged deletion with ratchet; docs consolidation to the
  refactor docs as the single index; ownership boundaries per workstream.

## P. Privacy and data lifecycle — L1 → L4

- **Evidence:** no PII classification, no retention policy, no deletion/export
  path, no tenant offboarding, no backup story; log redaction exists
  (allowlist) and LLM transfer is minimized (sanitize) — but lifecycle is
  undocumented and untested end-to-end.
- **Required change:** documented data map + retention/deletion contracts;
  tenant-offboarding procedure with tests.
- **Verification:** deletion/export integration tests against real SQLite.

---

## Score → finding traceability

| Finding ID | Category | Classification | Confidence | Priority | GitHub |
|---|---|---|---|---|---|
| AUD-001 in-memory limiter/stores per-isolate on Workers | H, C | Reliability Defect (security-adjacent) | Confirmed | P1 | new issue |
| AUD-002 CSRF origin allowlist frozen at module scope, localhost default, unconfigurable in deploy | L, K | Bug (latent prod write outage) | Confirmed | P1 | new issue |
| AUD-003 order-dependent tenant attribution (first active membership) | C, D | Data Integrity Defect | Confirmed | P2 | new issue |
| AUD-004 observability platform absent (no-op audit sink, no metrics/tracing/correlation) | I | Observability Gap / Operational Gap | Confirmed | P1 | new issue (audit-sink evidence → comment on #156) |
| AUD-005 CI lacks tsc gate; 81 TS errors in 23 test files | N, M | Test Gap | Confirmed | P2 | new issue (consolidated CI-platform) |
| AUD-006 performance guardrails absent on critical paths (pagination, N+1, baselines) | J | Performance Defect + Performance Test Gap | Confirmed | P2 | new issue |
| AUD-007 dead/unwired code 51% of app tree | O, A | Architecture Debt | Confirmed | P2 | comment on #137 (existing) |
| AUD-008 route-embedded business logic (tools 504-line route) | A, K | Architecture Debt | Confirmed | P2 | umbrella workstream (no separate issue) |
| AUD-009 privacy/data lifecycle absent | P | Operational Gap | Confirmed | P2 | new issue |
| AUD-010 GET inbox writes + fail-open audit | I, K | (existing) | Confirmed | P1 | #156 (reuse) |
| AUD-011 vulnerable toolchain, unpinned actions, no dep automation | M | (existing + extension) | Confirmed | P1/P2 | #128 + AUD-005 issue |
| AUD-012 approval-route concurrent double-decision race → unhandled repo error | B, K | Reliability Defect | Probable (race not reproduced) | P3 | investigation → risk register |

Risk scoring (Impact / Trigger / Blast / Recovery / Detectability, 1–5):

- AUD-001: 4/4/4/2/4 → P1. AUD-002: 4/5(on deploy)/4/2/2 → P1.
- AUD-003: 3/2/2/3/2 → P2. AUD-004: 4/5/5/3/1 → P1.
- AUD-005: 2/5/2/1/5 → P2. AUD-006: 3/3/3/2/3 → P2. AUD-009: 3/2/4/4/2 → P2.
