# Application WorkUnit Inbox

## Ownership
- Canonical inbox-facing application logic.
- Owns normalized signal types, signal-to-WorkUnit transforms, action-preview mapping, and persistence mapping.

## Allowed imports
- Domain and shared application types.
- Repository row types when mapping persistence shapes.

## Forbidden imports
- React components.
- API route handlers.
- D1 repository implementations.
- Raw provider clients.
- Server session helpers.

## Canonical files
- `types.ts`
- `transform.ts`
- `mockSignals.ts`
- `persistenceMapping.ts`
- `actionPreviewMapping.ts`
- `inboxService.ts`

## Projection / refresh split (WU-02S)
`inboxService.ts` owns the source vocabulary, signal resolution and the Inbox
projection for BOTH routes, so the read and write paths cannot drift without
editing one shared module.

- `projectInbox` is a PURE projection whose repository parameter is the
  read-only type, so it is structurally incapable of writing. It backs
  `GET /api/workunit/inbox` (INV-SAFE-1: no repository, usage or audit mutation).
- `refreshInbox` is the SOLE explicit WorkUnit-row materialization path, backing
  `POST /api/workunit/inbox/refresh`. All provider signals resolve before the
  first write, so a provider failure writes nothing.

A direct API caller that relied on the GET to materialize rows before
`POST /api/workunit/[id]/action-preview` or `.../feedback` must call the refresh
endpoint first. No shipped screen is affected and no UI caller is added, but the
API contract genuinely changes.

See `docs/architecture/HTTP_MUTATION_GUARD.md`.

## Legacy warnings
- `app/lib/workunitInbox/*` is compatibility only.
- `app/lib/workunitInbox/sources/**` re-exports canonical provider boundaries only.

## Common mistakes
- Adding provider API calls here.
- Passing raw Slack/GitHub/Calendar payloads into WorkUnit objects.
