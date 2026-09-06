# Current WorkUnit UI Implementation

## Ownership
- Current implementation shell for WorkUnit OS.
- `WorkUnitOSDashboard.tsx` renders this shell.
- Product UI source of truth is `docs/archive/v0/CANONICAL_DECISION_INDEX.md`: WorkUnit Launcher + WorkUnit Graph + Action Field.
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

## Legacy warnings
- Do not import `app/components/workunitInbox/*`.
- Do not import `app/components/legacy/workunitInbox/*`.
- Do not revive old pre-v0 panes as the product UI direction.

## Common mistakes
- Introducing UI patterns that conflict with WorkUnit Launcher, WorkUnit Graph, or right-side Action Field.
- Reading raw provider payloads in the component.
- Sending tenant, role, hash, approval status, or token fields from the client.
