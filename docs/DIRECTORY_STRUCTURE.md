# DIRECTORY_STRUCTURE.md

# WorkUnit OS — Directory Structure and Dependency Ownership

## 1. Current structure summary

Current active structure is still hybrid:

- `docs/CONTEXT_INDEX.md`
  - first-read AI context map for canonical files, legacy surfaces, and minimal reading bundles
- `app/components/`
  - canonical WorkUnit UI under `workunit-os/launcher/` — the DEFAULT rendered surface
  - legacy/dashboard-named reference shell under `workunit-os/adopted/`, rendered only behind
    `NEXT_PUBLIC_WORKUNIT_LEGACY_DASHBOARD`; it still carries the remaining real mutation wiring
  - transitional pre-v0 panes retained but not rendered from `app/page.tsx`
  - legacy WorkUnit Inbox UI compatibility exports
- `app/api/`
  - route handlers for inbox, feedback, integration status, preview, approval, tools
- `app/lib/actionField/`
  - Action Field helpers, now kept as compatibility exports
- `app/lib/application/`
  - canonical home for application-layer orchestration helpers going forward
  - `application/auth/` now owns auth adapter resolution and session resolution
  - `application/dashboard/` owns legacy-named client-safe UI fetch helpers and view-model mapping
  - `application/workunitInbox/` now owns inbox-facing transforms, read models, and persistence mapping
- `app/lib/ports/`
  - neutral boundary contracts shared by adapters and the application layer
  - `ports/toolSignal/` owns the normalized provider-ingress signal contract
- `app/lib/domain/`
  - pure domain types and lifecycle/state-machine logic
- `app/lib/domain/auth/`
  - canonical auth/session/role types
- `app/lib/domain/tenant/`
  - canonical tenant types
- `app/lib/persistence/`
  - repository interfaces, resolver, D1 and in-memory implementations
- `app/lib/infrastructure/persistence/control/`
  - control DB repositories for users, tenants, memberships, auth identities
- `app/lib/security/`
  - session gate, RBAC, tenant access helpers, approval, safe error, audit vocabulary
- `app/lib/workunitInbox/`
  - compatibility exports for legacy inbox paths
- `app/components/legacy/workunitInbox/`
  - physical home of the older standalone inbox/detail/action-field UI

## 2. Target structure

Target dependency shape:

```txt
UI
→ API Routes
→ Application Services
→ Domain
→ Repository Interfaces / External Client Interfaces
→ Infrastructure Implementations
→ D1 / External APIs
```

Target directories:

```txt
app/lib/domain/
app/lib/application/
app/lib/infrastructure/
app/lib/config/
```

Suggested long-term specialization:

```txt
app/lib/domain/workunit/
app/lib/domain/approval/
app/lib/domain/integration/
app/lib/domain/audit/
app/lib/domain/usage/
app/lib/domain/tenant/

app/lib/application/workunit/
app/lib/application/actionField/
app/lib/application/integration/
app/lib/application/audit/
app/lib/application/usage/

app/lib/infrastructure/persistence/
app/lib/infrastructure/external/
```

## 3. Allowed dependency direction

Allowed:

- `app/components` → client-safe application helpers and UI-safe types
- `app/api` → security, application, domain, repository resolver
- `app/lib/application` → domain + repository/external interfaces
- `app/lib/domain` → pure types / pure logic only
- `app/lib/persistence/d1` → persistence row helpers and D1-like interfaces only
- `app/lib/infrastructure/external` → port contracts, normalized source models and external fetch clients
- `app/lib/ports` → `app/lib/ports` and `app/lib/domain` only; never application, infrastructure, persistence, components or routes

## 4. Forbidden dependencies

Forbidden:

- domain importing React
- domain importing Next route modules
- domain importing D1 implementations
- UI importing D1 repositories directly
- UI importing raw external clients
- repository implementations importing UI
- external clients importing UI components
- API routes containing raw SQL directly
- client code creating `tenantId`, `actorUserId`, approval hashes, approval status, or tokens

## 5. Canonical ownership table

| Concern | Canonical module / area | Notes |
|--------|--------------------------|-------|
| Canonical UI direction | `docs/CANONICAL_DECISION_INDEX.md` | WorkUnit Launcher + WorkUnit Graph + Action Field |
| Current UI shell | `app/components/workunit-os/WorkUnitOSDashboard.tsx` | Active page entry; implementation name may lag canonical UI terms. Renders the Launcher by default |
| Canonical visual implementation | `app/components/workunit-os/launcher/WorkUnitLauncher.tsx` | Default rendered surface: WorkUnit Launcher → WorkUnit Graph → Action Field. Real READ only |
| Legacy/reference implementation | `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx` | Rendered only behind `NEXT_PUBLIC_WORKUNIT_LEGACY_DASHBOARD`; carries the remaining preview / approval / dry-run wiring; not the product terminology source of truth |
| UI fetch client | `app/lib/application/dashboard/dashboardDataClient.ts` | Reads `/api/workunit/inbox`, `/api/integrations/status`, `/api/audit/recent`. `fetchDashboardWorkUnits` is shared by the Launcher read path and the adopted surface |
| Launcher read model | `app/lib/application/launcher/launcherWorkUnitReadModel.ts` | Launcher loading / loaded / empty / error states; a failed real read never falls back to mock data |
| Launcher safe projection | `app/lib/application/launcher/inboxWorkUnitToCandidate.ts` | Server `InboxWorkUnit` → `SafeWorkUnitCandidate` allowlist projection; `sourceUrl` stays dropped pending the StartHub slice |
| UI view-model | `app/lib/application/dashboard/adoptedDashboardViewModel.ts` | Maps real API data into current shell; empty/loading/error states do not fabricate live WorkUnits |
| Canonical Preview / Approval client | `app/lib/application/actionField/dashboardPreviewClient.ts` | Client-safe application helper |
| Pre-v0 dashboard presentation model | `app/lib/application/dashboard/workUnitDashboardModel.ts` | Transitional model retained for older pane components and tests |
| Legacy Preview / Approval client | `app/lib/workunitInbox/actionFieldClient.ts` | Kept for standalone legacy component |
| Legacy standalone Action Field UI | `app/components/legacy/workunitInbox/WorkUnitActionField.tsx` | Physical home; old path re-exports remain |
| Canonical inbox application logic | `app/lib/application/workunitInbox/*` | Active signal->inbox mapping and persistence mapping |
| Legacy inbox compatibility paths | `app/lib/workunitInbox/*` and `app/components/workunitInbox/*` | Re-export surface only |
| Normalized signal contract | `app/lib/ports/toolSignal/types.ts` | Sole declaration of the provider-ingress signal family; `app/lib/application/workunitInbox/types.ts` keeps a type-only compatibility re-export |
| Inbox read boundary | `app/lib/application/workunitInbox/*` | Normalized source (from the port contract) → InboxWorkUnit |
| Route persistence access | `app/lib/persistence/repositoryResolver.ts` and `routeRepositories.ts` | Canonical persistence entry |
| Execution approval adapter | `app/lib/persistence/approvalStoreAdapter.ts` | Wraps tenant-scoped approval repository for execution-time verification |
| Tenant DB repository implementations | `app/lib/persistence/d1/` | Infrastructure implementation |
| Session / RBAC / approval security | `app/lib/security/` | Server trust boundary |
| Auth adapter boundary | `app/lib/application/auth/` | Verified identity + session resolution |
| Control DB auth/workspace persistence | `app/lib/infrastructure/persistence/control/` | Control DB infrastructure |
| Provider read clients | `app/lib/infrastructure/external/{github,slack,calendar}` | Canonical home; legacy source paths re-export |

## 6. Transitional modules

Transitional modules still in repository:

- `app/lib/actionField/dashboardPreviewClient.ts`
  - legacy compatibility export
- `app/lib/actionField/errorState.ts`
  - legacy compatibility export
- `app/components/workunitInbox/WorkUnitActionField.tsx`
  - compatibility export to the legacy physical home
- `app/lib/workunitInbox/actionFieldClient.ts`
  - legacy standalone Action Field client
- `app/lib/workunitInbox/sources/**`
  - compatibility exports pointing to infrastructure/external
- `app/components/workunit-os/{WorkUnitExplorerPane,DecompositionConsole,DecisionTracePanel,ActionFieldEntryPanel}.tsx`
  - retained old shell components; no longer rendered from the root page

These remain to avoid breaking the current MVP while canonical ownership moves to `app/lib/application/actionField/`. Product UI direction is defined in `docs/CANONICAL_DECISION_INDEX.md`.

Phase 1 reduction adds `scripts/report-legacy-surface.mjs` and `tests/architectureLegacySurface.test.mts` to track this surface before deletion.

## 7. High-risk dependency violations and debt

Current architecture debt that remains intentionally deferred:

1. `app/api/workunit/inbox/route.ts` still orchestrates source reads, transform, and persistence directly.
2. `routeRepositories.ts` still resolves tenant DB access without a control-DB-backed workspace auth path.
3. Session enforcement still terminates in `app/lib/security/session.ts`, while verified identity resolution lives in `app/lib/application/auth/`; JWT is now wired, but cookie and OIDC adapters are still deferred.
4. Legacy standalone Action Field modules remain in repository for compatibility.

## 8. Migration plan

1. Keep current MVP behavior stable.
2. Read `docs/CONTEXT_INDEX.md` before architecture-sensitive work.
3. Use `app/lib/application/` for new orchestration helpers.
4. Move new provider clients into `app/lib/infrastructure/external/` rather than expanding route handlers.
5. Migrate imports away from compatibility paths before deleting files.
6. After the canonical Action Field flow fully absorbs the old standalone flow, remove legacy Action Field modules.
7. After Production Auth lands, route tenant DB resolution through control DB membership ownership.
