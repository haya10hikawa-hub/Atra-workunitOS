# System Inventory — Large-SaaS Refactor Program

Base: `origin/main` @ `0b20218d593dd0978cac69026dd15c79184a149d` (2026-07-19).
Method: static import-graph analysis from every runtime entry point (page, layout,
9 API routes), file-by-file inspection of security/persistence/LLM boundaries, and
the full baseline gate run recorded in `REFACTOR_PROGRAM.md`.

## 0. Repository shape

| Area | Count | Notes |
|---|---|---|
| `app/**` TS/TSX source files | 367 | 181 runtime-reachable, 120 test-only (unwired), 66 imported by nothing |
| API routes | 9 | all under `app/api/**/route.ts`, single Next.js App Router page (`app/page.tsx` → `WorkUnitOSDashboard`) |
| `scripts/**` | 38 files + `scripts/lib` | D1 bootstrap/migration/deploy authority chain (P0-PERSIST-015) |
| `tests/**` | 289 test files | 4591 tests / 4590 pass / 1 skip on the base SHA |
| `migrations/**` | 6 SQL + `manifest.json` + `schema-contract.json` | two lanes: CONTROL (0001,0004), TENANT (0002,0003,0005,0006) |
| Workflows | 1 (`ci.yml`) | test, safety-gate, lint, build, cf:build, synthetic preflight/dry-run, electron check, diff check. **No `tsc --noEmit`.** |
| Runtime deps | 4 (`next`, `react`, `react-dom`, `react-icons`) | tooling in devDependencies; `npm audit`: 15 vulns (7 high) — tracked in #128 |

## 1. Domain entities

Source: `app/lib/domain/types.ts`, `app/lib/persistence/types.ts`, migrations.

- **Control plane** (CONTROL_DB): `tenants`, `users`, `tenant_memberships`,
  `auth_identities`, `tenant_databases` (registry for tenant DB routing).
- **Tenant plane** (TENANT_DB_DEFAULT): `work_units`, `action_previews`,
  `approval_records`, `workunit_feedback`, `audit_logs`, `usage_events`,
  `usage_daily_summary`, `integration_connections`.
- **In-memory / pipeline-only**: `ExternalSignal → SanitizedSignal →
  SourceCandidate → WorkUnitDraft → ReviewedWorkUnit → ActionPreview →
  ApprovalRecord → ExecutionCommand → ExecutionResult` (`app/lib/domain/types.ts`).
- **Phase 6 evidence artifacts** (typed, mostly unwired at runtime):
  approvalLinkage, canonicalIdentity, identityIndependence, reviewEvidence,
  runtimeAuthorization, recorderAuditSummary, persistenceAuditEvidence,
  persistenceTargetDecision (`app/lib/phase6/**` — see Issue #157).

## 2. State machines

- `app/lib/domain/workUnitLifecycle.ts` — typed transition functions with guards
  (signal→candidate→draft→reviewed→preview→approval→execution), each returning
  `TransitionResult` with a lifecycle event. Enforced in library code; routes use
  a subset (preview/approval endpoints re-check status + expiry server-side).
- Approval status machine: `pending → approved|rejected → used|expired`, enforced
  in `verifyApproval` (`app/lib/security/approvalStore.ts:124`) and in the D1
  claim predicate (exact-binding compare-and-set, inclusive-fail expiry).
- WorkUnit row status: `open → …` transitions via `updateStatus` (tenant-scoped
  UPDATE, Phase 6C).

## 3. API routes

| Route | Methods | Session | RBAC | CSRF | Rate limit | Writes |
|---|---|---|---|---|---|---|
| `/api/workunit/inbox` | GET | ✓ | `workunit.read` | — | — | **yes** (upserts WorkUnits, usage, audit) |
| `/api/workunit/tools` | GET, POST | ✓ | per-operation map | POST ✓ | POST ✓ | via legacy backend / runtime-auth gate |
| `/api/workunit/[id]/action-preview` | POST | ✓ | create_action_preview | ✓ | ✓ | preview row (server-set creator + hashes) |
| `/api/workunit/[id]/approval` | POST, GET | ✓ | approve (POST) / create_preview (GET) | POST ✓ | POST ✓ | approval row (four-eyes, fail-closed missing creator) |
| `/api/workunit/[id]/approval/status` | GET | ✓ | ✓ | — | — | no |
| `/api/workunit/[id]/execution/dry-run` | POST | ✓ | ✓ | ✓ | ✓ | no provider call (dry-run only) |
| `/api/workunit/[id]/feedback` | POST | ✓ | `workunit.edit` | ✓ | ✓ | feedback row |
| `/api/audit/recent` | GET | ✓ | `audit.read` or owner/manager | — | — | no (limit-validated) |
| `/api/integrations/status` | GET | ✓ | `integration.read` | — | — | no |

Anomalies: inbox GET performs writes on a read permission (#156); GET routes have
no rate limiting; `approval` GET is gated on `canCreatePreview` (semantic
mismatch); request-id conventions differ per route (`resolveRequestId` vs
`inbox:${Date.now()}` vs `"na"`).

## 4. Authentication sources

- `resolveAuthAdapter` (`app/lib/application/auth/`): adapters `none` (deny),
  `jwt` (HS256; issuer/audience/secret ≥32 bytes required in production),
  `dev` (impossible in Cloudflare production — rejected by the runtime config).
- Authority: `resolveValidatedRequestRuntimeConfig()`
  (`app/lib/runtime/requestRuntimeConfig.ts`) is the single env authority;
  Cloudflare request env outranks test injection; every `ALLOW_*` capability is
  fail-closed in production.
- Local JWT tooling: `scripts/generate-local-jwt.mjs`, `verify-local-jwt.mjs`,
  `cf-d1-bootstrap-jwt-local.mjs` (local-only authority split).

## 5. Authorization decisions

- RBAC: `app/lib/security/policy.ts` + `rbac.ts` (role→permission matrix),
  helpers in `tenantAccess.ts` (`canApprovePreview`, `canViewAudit`, …).
- Four-eyes: approver must differ from server-set `creatorUserId`
  (`app/api/workunit/[id]/approval/route.ts:121`), fail-closed when creator
  missing.
- Final external-op authority: `authorizeRuntimeCommand`
  (`app/lib/security/runtimeAuthorizationGate.ts`, 478 lines) — server-side
  evidence resolver (default-deny in production), re-verifies approval linkage,
  executor≠approver, RBAC + kill switch re-check, exact-binding atomic claim,
  returns `authorized_not_executed` receipt. No provider execution path exists.

## 6. Tenant-context propagation

- Session tenant = **first active membership** from
  `memberships.listByUser(...).find(status === "active")`
  (`app/lib/application/auth/sessionResolver.ts:91`) — order-dependent, no
  explicit tenant selection (finding AUD-003).
- Tenant ID never read from JWT claims (control-DB membership only).
- Repositories: `resolveRouteRepositories(tenantId, runtime)` →
  `resolveProductionRepositories`/`resolveLocalRepositories` (mandatory-resolver
  API; legacy env bypasses removed in PR #165 rounds 1–3).
- `TenantDbContext { tenantId, db }` threaded through every repository call; the
  inbox route hand-rolls `{ tenantId, db: null }` instead of the bundle ctx
  (`app/api/workunit/inbox/route.ts:146` — risk register R-07).

## 7. Persistence repositories

- Interfaces: `app/lib/persistence/repositories.ts`; bundles built by
  `repositoryResolver.ts` (371 lines), wrapped by
  `relationshipEnforcedRepositories.ts` (tenant-scoped parent checks:
  Preview→WorkUnit, Approval→Preview+WorkUnit+hash match, Feedback→WorkUnit;
  opaque `parent_boundary_violation`).
- D1 implementations in `app/lib/persistence/d1/*` with `writeGuards.ts`
  (UNIQUE/PK → `object_id_conflict`; everything else → `write_failed`; no
  driver-message disclosure). All SQL predicates tenant-scoped (reads and
  writes; upsert has owner pre-check + `WHERE work_units.tenant_id =
  excluded.tenant_id`).
- In-memory bundle for dev/test behind `ALLOW_IN_MEMORY_PERSISTENCE` (forbidden
  in production by the runtime config).

## 8. Database bindings and table ownership

- `wrangler.json`: `CONTROL_DB` (workunit-control-db) and `TENANT_DB_DEFAULT`
  (workunit-tenant); placeholder IDs in-repo. Same-ID collision refused by
  `validateDeployConfig` (d1_database_id_collision) and registry binding checks.
- Control tables are never tenant-data storage (enforced:
  control_tenant_database_collision).

## 9. Migration tooling

- `migrations/manifest.json` v2 (SHA-256-pinned, `replay_safe`/`once`, two
  lanes) + `schema-contract.json` + `scripts/lib/d1MigrationManifest.mjs`,
  `d1MigrationLedger.mjs` (`__atra_d1_migrations`, 7 reconcile states,
  fail-closed) — P0-PERSIST-015 rounds 1–4.
- Gated remote ops: `cf:d1:migrations:apply` (double env-gate, validated config,
  no `--yes`), `cf:d1:bootstrap:apply` (reconstruct-and-compare artifact
  binding, TOCTOU-closed private exec config), read-only remote verify.
- Deploy orchestrator (`cloudflare-deploy.mjs`) uses one config authority
  (`scripts/lib/cfDeployConfigAuthority.mjs`), never migrates.
- Remote execution has never been performed (Issue #155 remains open).

## 10. External providers

- GitHub: `resolveGitHubClient` — **always returns `fakeGitHubClient`** ("real"
  mode maps to real_disabled); reads `process.env.GITHUB_SOURCE_MODE` /
  `GITHUB_ACCESS_TOKEN` directly (outside the runtime-config authority; single
  global token model — risk register R-09).
- Slack, Calendar: fake sources only.
- LLM: DeepSeek adapter exists (`deepseekProvider.ts`; SSRF-guarded base URL,
  timeout, no body logging) but `resolveLlmProvider` never returns a real
  provider (`mode "real" → null`); production mode is `disabled`; dev may use
  mock behind `ALLOW_MOCK_LLM`.

## 11. External actions

- Operations `reply`, `schedule`, `create_issue` are external
  (`app/lib/security/externalActions.ts`); kill switch
  `EXTERNAL_ACTIONS_ENABLED` (default false; from request-scoped config in
  routes).
- No provider execution path exists anywhere; the runtime gate stops at
  `authorized_not_executed` (#152 tracks the missing executor).

## 12. Approval and audit systems

- Approval: preview (hashes + creator server-set) → decision (four-eyes) →
  30-minute expiry → exact-binding one-time claim. In-memory store allowed only
  in dev; production resolver is default-deny until D1-backed store lands
  (`approvalStoreResolver.ts:47` TODO).
- Audit: **`writeAuditLog` is a no-op** except dev+`AUDIT_LOG_VERBOSE`
  (`app/lib/security/auditLog.ts:112`); durable audit = `recordAuditEvent` →
  `audit_logs` on selected paths only, **fail-open** by design, metadata
  allowlist-redacted. See #156, #133.

## 13. LLM/model calls

- Pipeline: `processWorkSignal` (sanitize → extract → draft → evaluate) with
  per-stage char budgets, model routing table, typed failures. Injection/risk
  flags fail-closed at sanitize; evaluation-stage failure degrades to
  `ok:true` + `hallucinationRisk: "medium"` + manual-review marker
  (deliberate fail-open of the advisory stage).
- Output validation: `validateLlmOutput.ts` (bounded parsing — #135 tracks
  hardening).
- Nothing model-generated carries authority: approvals/execution are
  server-evidence-bound (Phase 6 + #145 gate).

## 14. Background or scheduled work

- **None.** No queues, no cron, no workers beyond the request path. (Blast
  radius of provider calls is therefore request-scoped today.)

## 15. Runtime configuration

- Single authority: `resolveValidatedRequestRuntimeConfig()` (frozen,
  allowlisted, capability-projected; production rejects every dev capability).
- Known holes (module-scope/direct env reads outside the authority):
  `csrfProtection.ts` module-scope `ALLOWED_ORIGINS` constant (finding
  AUD-002), `resolveGitHubSource.ts`, `approvalStoreResolver.ts`,
  `providerConfig.ts` default-parameter `process.env` fallbacks (dev-only paths
  but unfenced), `auditLog.ts` verbose flag.

## 16. Deployment commands

- `cf:deploy:prepare → preflight → dry-run → deploy` (never migrates; one
  config authority; private exec configs; unconditional cleanup). CI runs only
  synthetic preflight/dry-run. Remote apply requires
  `CF_D1_MIGRATE_EXECUTE=1` + `CF_D1_MIGRATE_CONFIRM=APPLY_PRODUCTION_D1_MIGRATIONS`.

## 17. Observability

- No structured request logging, no metrics, no tracing, no log drain, no
  alerting. `writeAuditLog` no-op (above). Request-id conventions inconsistent.
  Error categories ARE stable (safeErrors vocabulary). Incident reconstruction
  is possible only for D1-persisted audit subset.

## 18. Tests and test doubles

- 289 files / 4591 tests, all `node --test` with type stripping; heavy use of
  real `node:sqlite` for D1-shape proofs, subprocess tests for scripts, source
  guards (arch invariants via regex on source), mutation-verified security
  suites (80/80 across PR #166 rounds). 1 intentional skip. Runtime ~14 s.
- Doubles: fake GitHub/Slack/Calendar clients, mock LLM provider, in-memory
  repositories, injected runtime env (`runWithInjectedRuntimeEnv`).
- 81 pre-existing TS errors in 23 **test** files; CI has no tsc gate (AUD-005).

## 19. Electron/runtime-specific behavior

- `electron/main.ts` — display-only shell; read-only IPC (version/platform);
  same-origin navigation allowlist; not a package.json dependency (safety gate
  enforces); statically verified by `electron-build-check` + invariant tests.
  Electron alpha remains No-Go.

## 20. Security boundaries

1. Request → session (JWT/control-DB membership; dev impossible in prod).
2. Session → RBAC permission map → tenant-scoped repositories (mandatory
   resolver, relationship enforcement, write guards).
3. Client body → `readBoundedJsonObject` (size/depth/node caps) →
   `hasClientOwnedFields` rejection (client can never supply hashes, creator,
   tenant, approval state).
4. External ops → kill switch → runtime authorization gate (server evidence,
   default-deny) → **no executor exists**.
5. LLM → sanitize (injection flags fail-closed) → budget → schema-validated
   output → advisory only.
6. Deploy/migration → artifact-bound, double-gated operator commands.

## Runtime-path decomposition (input → … → retry)

### P1 Inbox fetch (GET /api/workunit/inbox)
input: `source` query param → authority: session (read) → validation: source
allowlist → logic: fake-provider signals → transform → persistence: N
findById+upsert (sequential) → side effects: usage + audit rows (fail-open) →
audit: partial → failure: 503 `integration_missing` (prod) or generated
fallback (dev-only) → retry: client-driven, idempotent by WorkUnit id.

### P2 LLM ingest (POST /api/workunit/tools, operation=ingest)
input: bounded JSON → authority: CSRF+session+rate limit+RBAC create →
validation: `validateToolBackendRequest` → logic: `processWorkSignal` (budgets,
sanitize fail-closed) → persistence: none (result returned, not persisted) →
audit: in-process only (no-op sink) → failure: typed map (400/429/500/503) →
retry: safe (no writes).

### P3 Preview → Approval → Runtime authorization
preview POST (creator+hashes server-set) → approval POST (four-eyes,
30-min expiry, one decision per preview) → tools POST external op → kill switch
→ runtime gate (evidence resolver default-deny in prod; exact-binding atomic
claim in dev) → receipt `authorized_not_executed`; audit buffered + flushed
after terminal decision (durable, fail-open). Replay: claim CAS → `approval_used`
(409). No provider side effects exist.

### P4 D1 bootstrap/migration (operator)
input: deploy config + generated artifact → authority: double env-gates +
operator confirm → validation: manifest digests, ledger reconcile,
reconstruct-and-compare bytes, registry binding, same-ID refusal → execution:
single wrangler `d1 execute --file` batch (atomic) via private exec config →
verify: COUNT-only post-verify; `bootstrap_verification_failed_after_commit` is
honest (no rollback) → retry: idempotent via schema-signature/ledger skip.
