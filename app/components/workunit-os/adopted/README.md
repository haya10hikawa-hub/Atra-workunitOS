# Current WorkUnit UI Implementation

**Status: REFERENCE — FROZEN V0 IMPLEMENTATION ONLY.** Product direction and form are unresolved in [`PRODUCT_STATE.md`](../../../../PRODUCT_STATE.md).

## Ownership
- Current implementation shell for WorkUnit OS.
- `WorkUnitOSDashboard.tsx` renders this shell.
- This folder records current implementation ownership; it is not product terminology or future UI authority.

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
- Do not present current or pre-v0 panes as future product direction.

## Common mistakes
- Treating maintenance of this V0 shell as a product-direction decision.
- Reading raw provider payloads in the component.
- Sending tenant, role, hash, approval status, or token fields from the client.
