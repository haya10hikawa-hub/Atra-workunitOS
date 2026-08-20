# Composition

## Ownership
The request composition root (WU-06). This is the one layer that CHOOSES concrete
implementations for a request: the validated runtime configuration snapshot, the
auth adapter implementation, and the control-DB repositories behind the
`ControlDirectoryPort` the session use case declares.

Direction: `app/api` (delivery) → this layer → application use case → domain.

## Allowed imports
- Runtime configuration, security, persistence, infrastructure adapters.
- Application use cases and the capability contracts they declare.
- Domain and ports.

Assembly is the purpose, so the concentration of these edges in one place is the
design rather than a leak.

## Forbidden imports
- API route handlers and React components — a composed dependency that imports a
  route is a cycle through the framework.
- React, Next.

## Direction rule
No inward layer may import this one. `tests/architectureBoundaries.test.mts`
asserts the only importers under `app/` are API routes, which is what stops this
layer from becoming a laundering route for an edge another policy forbids.

## Canonical files
- `requestSession.ts` — the composition root for the authenticated session path.
- `authAdapterSelection.ts` — auth adapter implementation selection.
- `controlDirectoryAdapter.ts` — control repository bundle → `ControlDirectoryPort`.

## Common mistakes
- Caching anything across requests. Lifetime here is exactly one request.
- Adding a service locator or a container. Explicit typed factories only.
- Widening a capability for convenience (for example handing a safe handler a
  writable repository bundle).
