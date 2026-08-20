# Composition

## Ownership
The request composition root (WU-06). This is the one layer that CHOOSES concrete
implementations for a request: the validated runtime configuration snapshot, the
auth adapter implementation, and the control-DB repositories behind the session
capability contracts the use case declares.

It also owns one capability DECISION, not just capability selection: whether the
request may carry durable session write authority. That is derived from
`request.method` through `httpMethodSafety.ts`, so a safe method (`GET`, `HEAD`,
`OPTIONS`) — and any unrecognized method — receives a read-only session
capability with the dev-bootstrap slot absent entirely. Routes do not opt in and
cannot opt out; a route added tomorrow inherits the rule by using the normal
entry point.

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
- `controlDirectoryAdapter.ts` — control repository bundle → the read capability
  (`toControlDirectoryRead`) and the dev bootstrap capability
  (`toDevWorkspaceBootstrap`), as two separate objects rather than one object
  narrowed by a type annotation.
- `httpMethodSafety.ts` — the repository's one production-owned safe/unsafe HTTP
  method classifier. Fails closed: an unrecognized method is `"unknown"` and is
  never bootstrap-capable.

## Common mistakes
- Caching anything across requests. Lifetime here is exactly one request.
- Adding a service locator or a container. Explicit typed factories only.
- Widening a capability for convenience (for example handing a safe handler a
  writable repository bundle, or a safe request the dev bootstrap capability).
- Passing a writable object and relying on the callee not to use it. Remove the
  member instead — `tests/safeMethodSessionCapability.test.mts` asserts the safe
  object carries no write member at runtime, not merely that none was called.
