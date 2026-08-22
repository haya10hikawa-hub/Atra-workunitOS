# Legacy / Reference WorkUnit UI Surface

## Ownership
- This folder is NOT the canonical product UX.
- `WorkUnitOSDashboard.tsx` renders `WorkUnitLauncher` by default. It renders this shell
  ONLY when `NEXT_PUBLIC_WORKUNIT_LEGACY_DASHBOARD === "true"`; that default is unchanged.
- Canonical UX is `app/components/workunit-os/launcher/`, which reads real WorkUnits through
  `GET /api/workunit/inbox`.
- This surface is retained as the reference / rollback path because it still carries the
  remaining real mutation wiring — action preview, approval, and execution dry-run — which has
  not yet migrated to the canonical Launcher. No behavior regression here is allowed.
- Product UI source of truth is `docs/CANONICAL_DECISION_INDEX.md`: WorkUnit Launcher + WorkUnit Graph + Action Field.
- Do not treat dashboard naming in this folder as product terminology.

## Allowed imports
- React hooks.
- CSS Modules in this folder.
- Client-safe application helpers under `app/lib/application/dashboard/*`.
- Client-safe Action Field helper under `app/lib/application/actionField/*`.

## Forbidden imports
- D1 repositories.
- `repositoryResolver` or `routeRepositories`.
- API route handlers.
- `security/session`.
- Raw external provider clients.

## Current files
- `AdoptedWorkUnitDashboard.tsx`
- `AdoptedWorkUnitDashboard.module.css`

## Shared with the canonical Launcher
- `fetchDashboardWorkUnits` in `app/lib/application/dashboard/dashboardDataClient.ts` is shared:
  the canonical Launcher read path reuses it rather than duplicating the Inbox fetch. Changing
  its contract changes both surfaces.

## Legacy warnings
- Do not import `app/components/workunitInbox/*`.
- Do not import `app/components/legacy/workunitInbox/*`.
- Do not revive old pre-v0 panes as the product UI direction.

## Common mistakes
- Introducing UI patterns that conflict with WorkUnit Launcher, WorkUnit Graph, or right-side Action Field.
- Reading raw provider payloads in the component.
- Sending tenant, role, hash, approval status, or token fields from the client.
