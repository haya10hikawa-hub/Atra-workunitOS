# DEPENDENCY_MAP.md

# WorkUnit OS — Architecture Dependency Map

## 0. Dependency direction

Canonical direction:

```txt
UI
→ API Routes
→ Application Services
→ Domain
→ Repository Interfaces / External Client Interfaces
→ Infrastructure Implementations
→ D1 / External APIs
```

## 0.1 First-read context map

- `docs/CONTEXT_INDEX.md` is the first-read file for AI agents.
- It lists canonical files by task, files to avoid by default, and minimal context bundles.
- Architecture reduction work should update the context index before expanding feature scope.

## 1. UI Layer

### Canonical (active)
| Path | Role |
|------|------|
| `docs/archive/v0/CANONICAL_DECISION_INDEX.md` | Product UI source of truth: WorkUnit Launcher + WorkUnit Graph + Action Field |
| `app/page.tsx` | Root page: renders `WorkUnitOSDashboard` only |
| `app/components/workunit-os/WorkUnitOSDashboard.tsx` | Current UI entry; implementation name may lag canonical UI terms |
| `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx` | Current legacy/dashboard-named implementation shell; not product terminology source of truth |
| `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.module.css` | Current implementation CSS Module |

### Deprecated / reference only
| Path | Status |
|------|--------|
| `app/components/workunitInbox/WorkUnitActionField.tsx` | Compatibility export to the older API-wired ActionField; not rendered from `app/page.tsx` |
| `app/components/workunit-os/{WorkUnitExplorerPane,DecompositionConsole,DecisionTracePanel,ActionFieldEntryPanel}.tsx` | Transitional presentational shell from the pre-v0 adopted dashboard; no longer rendered from `app/page.tsx` |
| `app/components/workunit-os/{IntegrationStatusPanel,AuditLogPanel}.tsx` | Pre-adoption operations panels; the adopted shell now uses its own compact status/audit rendering |
| `app/components/workunitInbox/{WorkUnitInbox,WorkUnitDetail}.tsx` | Compatibility exports for the legacy standalone inbox/detail UI |

### Canonical Action Field ownership
| Path | Role |
|------|------|
| `app/lib/application/actionField/dashboardPreviewClient.ts` | Canonical client-safe Preview / Approval UI client |
| `app/lib/application/actionField/errorState.ts` | Canonical Action Field error-state mapper |
| `app/lib/application/dashboard/dashboardDataClient.ts` | Legacy-named client-safe UI fetch helper for WorkUnits, integration status, and recent audit logs |
| `app/lib/application/dashboard/dashboardStatusClient.ts` | Compatibility re-export for older dashboard status/audit imports |
| `app/lib/application/dashboard/adoptedDashboardViewModel.ts` | Current UI mapping from inbox/status/audit API data; empty states do not fabricate sample WorkUnits |
| `app/lib/application/dashboard/selectedWorkUnitPreviewModel.ts` | Canonical selected-WorkUnit-to-preview-group mapper; extracts safe fields only (no hashes, tokens, secrets); gates on decision selection |
| `app/lib/application/dashboard/approvalDecisionTraceModel.ts` | Pure-function mapper from approval status to safe UI trace entries; drives approval completion via `isApprovalCompleted()` |
| `app/lib/application/dashboard/executionReadinessModel.ts` | Canonical pure-function execution readiness model; computes whether external execution is ready |
| `app/lib/application/dashboard/executionCommandModel.ts` | Canonical pure-function safe execution command envelope builder; blocked/dry_run only |
| `app/lib/application/dashboard/workUnitDashboardModel.ts` | Legacy UI-only model; `getPrimaryActionPreviewGroup` is legacy/demo only |
| `app/lib/application/workunitInbox/*` | Canonical inbox-facing application logic |
| `app/lib/actionField/*.ts` | Legacy compatibility exports only |

### Dependency chain (UI → API)
```
page.tsx
  └── WorkUnitOSDashboard
        └── AdoptedWorkUnitDashboard
              ├── dashboardDataClient.ts
              │    → GET /api/workunit/inbox, /api/integrations/status, /api/audit/recent
              ├── adoptedDashboardViewModel.ts
              │    └── selectedWorkUnitPreviewModel.ts  (safe preview group from selected WorkUnit)
              └── dashboardPreviewClient.ts
                   → POST /api/workunit/:id/action-preview
```

## 2. API Layer

| Route | Purpose | Dependencies |
|-------|---------|-------------|
| `GET /api/workunit/inbox` | Return WorkUnits from selected source and persist them when repositories are available | `application/workunitInbox/*`, `infrastructure/external/*`, `resolveRouteRepositories()` |
| `POST /api/workunit/:id/action-preview` | Create ActionPreview with server hashes | `requireSession`, `resolveRouteRepositories`, `hashActionTarget`, `hashActionPayload` |
| `POST /api/workunit/:id/approval` | Approve/reject preview | `requireSession`, `resolveRouteRepositories`, preview→approval mapping |
| `GET /api/workunit/:id/approval/status` | Return tenant-scoped safe approval status summary | `requireSession`, `resolveRouteRepositories`, `approvalRecords.findByWorkUnitId` |
| `POST /api/workunit/:id/feedback` | Persist feedback, update WorkUnit status for `later` / `done`, append audit and usage | `requireSession`, `resolveRouteRepositories` |
| `GET /api/integrations/status` | Return safe integration connection status per provider | `requireSession`, `resolveRouteRepositories` |
| `GET /api/audit/recent` | Return tenant-scoped recent audit events with sanitized metadata | `requireSession`, `resolveRouteRepositories`, `canViewAudit()` |
| `POST /api/workunit/tools` | Execute backend tools (ingest, draft, external verification path) | `requireSession`, `resolveRouteRepositories`, persisted preview lookup, `resolveRepositoryBackedApprovalStore` |

## 2.1 Legacy UI compatibility

| Path | Role |
|------|------|
| `app/components/legacy/workunitInbox/*` | Physical home of the older standalone inbox/detail/action-field UI |
| `app/components/workunitInbox/*` | Compatibility exports for old imports |

## 3. Persistence Layer

| Module | Role | Production Path |
|--------|------|----------------|
| `persistence/types.ts` | Row types, TenantDbContext, ControlDbContext | D1 columns |
| `persistence/repositories.ts` | Repository interfaces | D1 repository implementations |
| `persistence/d1/workUnitRepository.ts` | D1 WorkUnit persistence with tenant-scoped upsert | Real D1 or FakeD1 in tests |
| `persistence/d1/workUnitFeedbackRepository.ts` | D1 feedback persistence | Real D1 or FakeD1 in tests |
| `persistence/d1/auditLogRepository.ts` | D1 audit log persistence/read path | Real D1 or FakeD1 in tests |
| `persistence/d1/usageRepository.ts` | D1 usage event persistence/read path | Real D1 or FakeD1 in tests |
| `persistence/d1/integrationConnectionRepository.ts` | D1 integration connection metadata | Real D1 or FakeD1 in tests |
| `persistence/d1/actionPreviewRepository.ts` | D1 ActionPreview persistence | Real D1 via wrangler.toml bindings |
| `persistence/d1/approvalRecordRepository.ts` | D1 ApprovalRecord persistence | Real D1 |
| `persistence/repositoryResolver.ts` | Resolve repos by mode | D1 (real) or in-memory (dev) |
| `persistence/routeRepositories.ts` | Route-level repo resolution | `resolveRepositories(tenantId, { runtimeEnv })` |
| `infrastructure/persistence/control/*.ts` | Control DB auth/workspace repositories | users, tenants, tenant_memberships, auth identities |
| `persistence/approvalStoreAdapter.ts` | Repository → ApprovalStore adapter | Bridges repo to approval verification |
| `migrations/0001_control_db.sql` | Control DB schema | tenants, tenant_databases |
| `migrations/0002_tenant_core.sql` | Tenant DB schema | action_previews, approval_records |
| `migrations/0003_tenant_persistence_foundation.sql` | Tenant DB persistence foundation | work_units, workunit_feedback, audit_logs, integration_connections, usage_events |

### Control DB ownership
- Control DB now owns registry plus auth/workspace foundation.
- Canonical schema ownership lives in `migrations/0001_control_db.sql` and `migrations/0004_control_auth_workspace.sql`.
- Runtime repository ownership lives in `app/lib/infrastructure/persistence/control/`.
- Real authenticated session resolution is still deferred, but control-side user / tenant / membership / auth identity storage now exists.

### Tenant DB ownership
- Tenant DB is the canonical persisted state for WorkUnits, feedback, previews, approvals, usage, audit, and integration status metadata.
- `repositoryResolver.ts` is the canonical persistence access point.
- D1 repository implementations are infrastructure, not domain or UI modules.

### Persistence behavior in the current foundation
- `GET /api/workunit/inbox` persists generated WorkUnits when repositories are available.
- Repeated inbox fetches use repository `upsert()` to avoid duplicate WorkUnit rows.
- `POST /api/workunit/:id/feedback` persists feedback, updates WorkUnit status, appends audit logs, and records usage.
- `GET /api/integrations/status` reads persisted connection metadata and records usage.
- Development fallback may return generated WorkUnits without persistence when repositories are unavailable.
- Production-safe behavior still denies missing required persistence rather than silently dropping writes.

## 4. Auth / Session Layer

| Module | Role |
|--------|------|
| `security/session.ts` | `requireSession()` — explicit dev session gate, production default deny, typed SessionContext |
| `security/rbac.ts` | `hasPermission()` — role-based checks |
| `security/policy.ts` | Role permission sets (owner, manager, editor, viewer) |
| `security/tenantAccess.ts` | Route-facing role helpers for inbox, feedback, preview, approval, audit, integrations |
| `domain/auth/types.ts` | Canonical auth/session/role domain types |
| `domain/tenant/types.ts` | Canonical tenant domain types |
| `application/auth/authAdapter.ts` | Provider-agnostic verified identity boundary |
| `application/auth/sessionResolver.ts` | Verified identity → user → active membership → SessionContext |
| `application/auth/devAuthAdapter.ts` | Explicit dev-only identity adapter |
| `application/auth/jwtAuthAdapter.ts` | Signed JWT verification into VerifiedAuthIdentity |
| `application/auth/noopProductionAuthAdapter.ts` | Safe-failing production adapter placeholder |
| `application/auth/resolveAuthAdapter.ts` | Adapter resolver from environment |

### Current auth/session ownership
- `security/session.ts` is still the canonical session boundary.
- Production anonymous access is rejected by default.
- Dev session remains explicit and gated via `AUTH_ADAPTER=dev` + `ALLOW_DEV_SESSION=true`.
- `AUTH_ADAPTER=jwt` is the first real production auth path and verifies identity only.
- Dev workspace bootstrap is separately gated via `ALLOW_DEV_WORKSPACE_BOOTSTRAP=true`.
- SessionContext is server-derived and carries `userId`, `tenantId`, `role`, `email`, and `isDevSession`.
- Client code does not own `tenantId`, `actorUserId`, or `role`.
- JWT claims never grant `tenantId` or `role`; both still come from control DB active membership.
- The next phase should add a real cookie or OIDC adapter on top of the same control DB foundation.

## 5. Integration Layer

### GitHub (most mature)
| Module | Role |
|--------|------|
| `sources/github/client.ts` | GitHubApiClient interface |
| `sources/github/fakeGitHubClient.ts` | Fake implementation |
| `sources/github/realGitHubClient.ts` | Real REST API skeleton with token |
| `sources/github/resolveGitHubSource.ts` | Mode resolver (fake/real) |
| `sources/github/types.ts` | GitHubNormalizedEvent |
| `sources/github/toNormalizedToolSignal.ts` | Mapper |

### Source pipeline ownership
- `app/lib/infrastructure/external/{github,slack,calendar}` is the canonical read boundary for provider data.
- `app/lib/workunitInbox/sources/**` remains as compatibility exports only.
- Normalized source models are read-boundary models, not WorkUnit domain models.
- Raw provider payloads must never cross from source clients into the WorkUnit domain.

### Slack
| Module | Role |
|--------|------|
| `sources/slack/types.ts` | SlackNormalizedEvent |
| `sources/slack/fakeSlackSource.ts` | Fake implementation |
| `sources/slack/toNormalizedToolSignal.ts` | Mapper |

### Calendar
| Module | Role |
|--------|------|
| `sources/calendar/types.ts` | CalendarNormalizedEvent |
| `sources/calendar/fakeCalendarSource.ts` | Fake implementation |
| `sources/calendar/toNormalizedToolSignal.ts` | Mapper |

### Missing integration features
- Slack real API client (skeleton needed)
- Calendar real API client (skeleton needed)
- GitHub OAuth flow (routes + token storage)
- Connection status UI still reflects safe metadata only

## 6. Audit Layer

| Module | Role |
|--------|------|
| `security/auditLog.ts` | Audit event vocabulary and local verbose logging |
| `persistence/d1/auditLogRepository.ts` | Tenant-scoped persisted audit write/read path |

### Current audit coverage
- Feedback writes audit events through persisted repository paths when available.
- Inbox fetch can append `workunit.inbox.fetch` audit entries with `{ source, count }`.
- `GET /api/audit/recent` is the current UI audit read path.
- Audit response metadata is sanitized before leaving the server.

### Usage ownership
- Usage persistence lives in `persistence/d1/usageRepository.ts` behind the repository bundle.
- Route handlers may record usage, but they do not own usage aggregation logic.

## 7. Billing / Usage Layer

| Status | Notes |
|--------|-------|
| Partial | Usage events are recorded for inbox fetch, feedback create, and integration status read. Billing plans and hard limits remain future work. |

## 8. Security Layer

| Module | Role |
|--------|------|
| `security/hash.ts` | SHA-256 canonical hashing for approvals |
| `security/approvalStore.ts` | verifyApproval, markApprovalUsed |
| `security/approvalStoreResolver.ts` | resolveApprovalStore (mode-based) and repository-backed ApprovalStore adapter resolution |
| `security/actionApproval.ts` | approvalActionTypeForOperation |
| `security/safeErrors.ts` | safeError, isSafeErrorCode |
| `security/externalActions.ts` | Kill switch guard |

## 9. High-risk architecture debt

- Legacy surface reporting lives in `scripts/report-legacy-surface.mjs`; it reports compatibility imports without failing.
- `tests/architectureLegacySurface.test.mts` locks the current root page, swap-file, legacy/dashboard-named implementation, and legacy import baseline.
- `app/api/workunit/inbox/route.ts` still mixes route, source orchestration, and persistence responsibilities.
- `app/lib/workunitInbox/actionFieldClient.ts` and `app/components/legacy/workunitInbox/WorkUnitActionField.tsx` remain legacy compatibility modules.
- Control DB schema ownership exists, but active repository routing still goes through `TENANT_DB_DEFAULT` rather than a future workspace auth chain.
- Compatibility source exports remain under `workunitInbox/sources/` for import stability.
