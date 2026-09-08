# SaaS Architecture

**Status: CANONICAL — CURRENT PRODUCT-INDEPENDENT TECHNICAL INVARIANTS ONLY.** This document does not define product direction; see [`PRODUCT_STATE.md`](../../PRODUCT_STATE.md).

## Layered Architecture

## Dependency ownership rule

The canonical dependency direction is:

```txt
UI
→ API Routes
→ Application Services
→ Domain
→ Repository Interfaces / External Client Interfaces
→ Infrastructure Implementations
→ D1 / External APIs
```

This refactor keeps behavior unchanged and documents the boundary for future phases.
┌─────────────────────────────────────────┐
│              Frontend (React)            │
│  Current V0 WorkUnit UI shell            │
├─────────────────────────────────────────┤
│              API Layer (Next.js)          │
│  /api/workunit/inbox                     │
│  /api/workunit/:id/feedback              │
│  /api/integrations/status                │
│  /api/audit/recent                       │
│  /api/workunit/:id/action-preview        │
│  /api/workunit/:id/approval              │
│  /api/workunit/tools                     │
├─────────────────────────────────────────┤
│           Security Boundary              │
│  Session, RBAC, Tenant, Audit, Approval  │
│  app/lib/security/                       │
├─────────────────────────────────────────┤
│           Domain Logic (app/lib)          │
│  toolBackend, workUnitSafety,            │
│  workUnitExecution, workUnitDrafts,      │
│  sourceHoppers, hopperEngine,            │
│  hopperAdaptiveFilter, hopperActionRouter│
├─────────────────────────────────────────┤
│          Integration Boundary            │
│  Slack, Gmail, GitHub, Google Calendar   │
│  externalToolClients, integrations/types │
├─────────────────────────────────────────┤
│         Persistence Layer (D1)           │
│  Control DB (tenant routing)             │
│  Tenant DBs (work units, feedback,       │
│  previews, approvals, audit, usage)      │
│  app/lib/persistence/                    │
└─────────────────────────────────────────┘
```

## Current auth foundation state

- `WorkUnitOSDashboard` and `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx` are current frozen-V0 implementation paths, not future product direction.
- The current shell reads live WorkUnit rows from `/api/workunit/inbox` and reads integration status plus recent audit events through `application/dashboard/dashboardDataClient.ts`.
- The inbox route can persist sanitized generated WorkUnits when repositories are available.
- Feedback writes persist feedback, update WorkUnit status, append audit, and record usage.
- Integration status reads persisted connection metadata and records usage.
- The current right-side workspace cannot authorize or trigger execution.
- Preview requests use the selected real WorkUnit to derive a safe preview group via `selectedWorkUnitPreviewModel.ts`; preview creation is unavailable when no safe selected WorkUnit context exists.
- Action Preview / Approval remains wired through existing APIs. Hashes are server-only in browser-facing responses.
- A tenant-scoped approval status endpoint (`GET /api/workunit/:id/approval/status`) returns safe metadata without exposing hashes or tenant internals.
- Approval uses the existing `dashboardPreviewClient` helper calling the existing POST /approval endpoint. Approval state is server-derived and refreshed after any explicit human decision.
- Execution-time approval verification now reads persisted ActionPreview hashes and ApprovalRecord rows through the repository-backed ApprovalStore adapter; in-memory approval stores remain dev/test only.
- The UI must not present fallback WorkUnit rows, audit events, or provider status as live data in empty/error states.
- Control DB auth/workspace schema and repositories now exist.
- SessionContext and route-side role helpers now derive `tenantId` and `actorUserId` from the server session only.
- Real authentication provider wiring is still deferred.

## Module Map

### Security Layer (`app/lib/security/`)

| Module | Responsibility |
|--------|---------------|
| `externalActions.ts` | Kill switch, external op detection |
| `policy.ts` | Role/permission vocabulary |
| `rbac.ts` | Permission enforcement, policy functions |
| `tenantAccess.ts` | Route-facing view/mutation role helpers |
| `session.ts` | Session resolution with explicit dev-session gate and production deny-by-default |
| `actionApproval.ts` | Server-side approval model |
| `auditLog.ts` | Audit event types + no-op logger |
| `safeErrors.ts` | Safe error response helpers |

### Domain Layer (`app/lib/`)

| Module | Responsibility |
|--------|---------------|
| `toolBackend.ts` | Tool backend router (ingest, draft, execute) |
| `toolBackendValidation.ts` | Runtime input validation |
| `workUnitSafety.ts` | Privacy regression, injection detection, approval check |
| `workUnitExecution.ts` | External action draft creation (GitHub, Slack, Gmail, Calendar) |
| `workUnitDrafts.ts` | Candidate→Draft conversion, draft lifecycle |
| `workUnitRanking.ts` | ROI calculation, push decision |
| `workUnitVoicePush.ts` | Proactive voice prompt, interruptibility |
| `sourceHoppers.ts` | Source event sanitization |
| `hopperEngine.ts` | Hopper processing pipeline |
| `hopperAdaptiveFilter.ts` | Adaptive threshold filter |
| `hopperActionRouter.ts` | Hopper→WorkUnit routing |
| `externalToolClients.ts` | HTTP clients for external APIs |
| `trustBoundaries.ts` | Trust level types and assertions |

### Application Layer (`app/lib/application/`)

| Module | Responsibility |
|--------|---------------|
| `application/actionField/dashboardPreviewClient.ts` | Canonical client-safe Preview / Approval flow helper |
| `application/actionField/errorState.ts` | Canonical Action Field error-state mapping |
| `application/dashboard/dashboardDataClient.ts` | Legacy-named client-safe UI fetch helper for WorkUnits, status, and audit |
| `application/dashboard/dashboardStatusClient.ts` | Compatibility re-export for older status/audit imports |
| `application/dashboard/dashboardApprovalStatusClient.ts` | Legacy-named client-safe approval status fetch helper |
| `application/dashboard/approvalDecisionTraceModel.ts` | Pure-function mapper from approval status to safe UI trace entries; drives approval completion via `isApprovalCompleted()` |
| `application/dashboard/executionReadinessModel.ts` | Canonical pure-function execution readiness model; computes whether external execution is ready from server-derived state — always blocked while kill switch is active |
| `application/dashboard/executionCommandModel.ts` | Canonical pure-function execution command envelope builder; produces blocked/dry_run envelopes with safe fields only — never calls external APIs |
| `application/dashboard/adoptedDashboardViewModel.ts` | Current implementation view-model mapping |
| `application/dashboard/selectedWorkUnitPreviewModel.ts` | Canonical selected-WorkUnit to safe preview-group mapper; gates on decision |
| `application/dashboard/workUnitDashboardModel.ts` | Legacy UI-only model |
| `application/auth/authAdapter.ts` | Verified identity interface |
| `application/auth/resolveAuthAdapter.ts` | Adapter selection |
| `application/auth/devAuthAdapter.ts` | Explicit dev identity adapter |
| `application/auth/jwtAuthAdapter.ts` | HS256 Bearer JWT identity verification |
| `application/auth/noopProductionAuthAdapter.ts` | Safe-failing production adapter |
| `application/auth/sessionResolver.ts` | Verified identity → SessionContext |
| `application/workunitInbox/*` | Canonical inbox-facing read models, transforms, and persistence mapping |

### Control DB Infrastructure (`app/lib/infrastructure/persistence/control/`)

| Module | Responsibility |
|--------|---------------|
| `types.ts` | Control DB row types for users, tenants, memberships, identities |
| `userRepository.ts` | User create/findById/findByEmail |
| `tenantRepository.ts` | Tenant create/findById/findBySlug |
| `membershipRepository.ts` | Membership create/find/list/updateStatus |
| `authIdentityRepository.ts` | Auth identity create/find |
| `controlRepositoryResolver.ts` | Control DB binding resolution |

### Persistence Layer (`app/lib/persistence/`)

| Module | Responsibility |
|--------|---------------|
| `types.ts` | Row types, TenantDbContext, ControlDbContext, TenantDatabaseRef |
| `repositories.ts` | Repository interfaces (WorkUnit, SourceCandidate, Approval, Audit, etc.) |
| `repositoryResolver.ts` | Resolve repository bundle by tenant + runtime mode |
| `d1/workUnitRepository.ts` | Tenant-scoped WorkUnit upsert/read/update |
| `d1/workUnitFeedbackRepository.ts` | Feedback persistence |
| `d1/auditLogRepository.ts` | Audit persistence/read path |
| `d1/integrationConnectionRepository.ts` | Integration connection metadata |
| `d1/usageRepository.ts` | Usage event persistence/read path |
| `d1/actionPreviewRepository.ts` | Persisted ActionPreview rows and server-owned hashes |
| `d1/approvalRecordRepository.ts` | Persisted ApprovalRecord rows, status, expiry, usedAt |
| `approvalStoreAdapter.ts` | Tenant repository-backed adapter used by execution-time approval verification |

See `DATA_MODEL.md` for full D1 schema design.

### Tenant & Integration (`app/lib/tenant/`, `app/lib/integrations/`)

| Module | Responsibility |
|--------|---------------|
| `tenant/types.ts` | Branded TenantId, UserId, WorkUnitId, TenantContext |
| `integrations/types.ts` | Provider types, tenant-owned integration config |

### Type Definitions (`app/types/`)

| Module | Responsibility |
|--------|---------------|
| `sourceHopper.ts` | SourceHopperEvent, SanitizedWorkUnitCandidate, WorkUnitDraft |
| `toolBackend.ts` | ToolBackendRequest, ToolBackendResponse, ToolBackendOperation |
| `workunit.ts` | WorkUnit, Task, WorkUnitStatus, WorkUnitPriority |
| `decision.ts` | Decision-related types |
| `inbox.ts` | Inbox event types |
| `studio.ts` | Studio document types |
| `ui.ts` | App language, theme, timezone |

## Data Flow

```
1. External Source (Slack/Gmail/GitHub/Calendar/Drive/Notion)
   │  Untrusted raw content
   ▼
2. Source Hopper (sourceHoppers.ts)
   │  Strips raw body, extracts metadata only
   ▼
3. SanitizedWorkUnitCandidate
   │  Trust level: sanitized
   ▼
4. WorkUnit Draft Generator (workUnitDrafts.ts)
   │  AI/system generates structured draft
   ▼
5. WorkUnitDraft
   │  Trust level: draft — human review required
   ▼
6. Human Approval (server-side)
   │  PM approves/rejects via persisted ActionApprovalRecord copied from ActionPreview hashes
   ▼
7. Execution (toolBackend.ts → externalToolClients.ts)
   │  Only after: kill switch ON, RBAC passed, persisted approval verified and marked used
   ▼
8. External Execution Result
   │  Logged, auditable
```

### Current inbox persistence flow

```
Normalized source event
  → application/workunitInbox/transform.ts
  → InboxWorkUnit
  → application/workunitInbox/persistenceMapping.ts
  → workUnits.upsert()
  → UI response { workUnits }
```

The route response remains UI-shaped even when persistence is enabled.

## Key Design Decisions

1. **D1-first storage** — tenant-database isolation, structured data in D1, raw content in R2
2. **Branded types** — TenantId, UserId, WorkUnitId prevent accidental mixing
3. **Double guard** — kill switch checked at both API and backend layers
4. **Default deny** — external actions, approvals, and RBAC all default to deny
5. **Centralized policy** — permission checks in one place (rbac.ts)
6. **Safe errors only** — no internal details leaked in error responses
7. **Mock data for development** — real integrations deferred

## Extensibility Points

- **Add auth**: extend the current JWT adapter with a real cookie or OIDC adapter on top of the same control-DB-backed membership resolution
- **Harden storage operations**: add stronger idempotency, migration/backup practice, and operational monitoring around persisted approvals and audit rows
- **Add tenant**: brand real tenant IDs and enforce in middleware
- **Add rate limiting**: hook into middleware or API routes
- **Add OAuth**: implement per-tenant token vault in `integrations/types.ts`
- **New integrations**: add to `IntegrationProvider` union, implement client

## Out of Scope in this phase

- GitHub OAuth / Slack OAuth / Calendar OAuth
- Audit event connect/disconnect mutation UI
- Provider token storage
- Real external provider connections
- External execution enablement
- Full cookie or OIDC authentication adapter

## Next phase

- Real cookie or OIDC auth adapter
- Connection Status UI hardening
- Audit UI read path for authorized roles

## Transitional modules

- `app/lib/actionField/*.ts` are now compatibility exports only.
- `app/components/legacy/workunitInbox/WorkUnitActionField.tsx` is the physical legacy UI; `app/components/workunitInbox/*` remains compatibility exports only.

## Architecture reduction phase

- `docs/CONTEXT_INDEX.md` is the first-read map for AI agents before architecture-sensitive work.
- Canonical imports should use `app/lib/application/*` and `app/lib/infrastructure/external/*` instead of compatibility paths.
- `scripts/report-legacy-surface.mjs` reports remaining legacy imports without failing the build.
- Compatibility export deletion is deferred until scanner output reaches zero for the target path.
- This reduction phase does not change auth, Preview / Approval, tenant ownership, UI design, or runtime behavior.
