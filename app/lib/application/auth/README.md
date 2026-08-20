# Application Auth

## Ownership
- Provider-agnostic auth adapter boundary.
- Resolves verified identity into user, tenant, active membership, and SessionContext.

## Allowed imports
- Domain auth and tenant types, including the role vocabulary in `domain/auth/roles.ts`.
- The capability contracts declared here (`authAdapter.ts`, `controlDirectory.ts`).

## Composition
Session resolution selects nothing. The auth adapter, the control directory and
the dev capability gates are assembled by the request composition root in
`app/lib/composition/` and passed to `resolveSession`.

## Capability split (WU-06 safe-method closure)
`controlDirectory.ts` declares two contracts, not one:

- `ControlDirectoryReadPort` — the four lookups the session path performs. It
  names no create, so a holder cannot construct one.
- `DevWorkspaceBootstrapPort` — the dev-only workspace bootstrap capability
  (four creates plus `findMembership`, which only bootstrap uses).

`SessionDependencies.devBootstrap` is optional, and the composition root omits
it for safe HTTP methods (`GET`, `HEAD`, `OPTIONS`) and for any unrecognized
method. A safe request therefore holds no object through which a user, tenant,
membership or auth identity could be created. The dev gates (`allowDevSession`,
`allowDevWorkspaceBootstrap`, `provider === "dev"`) are unchanged and still all
required on the mutation path.

## Forbidden imports
- Runtime configuration, security implementations, infrastructure, persistence.
- React components.
- API route handlers.
- UI code.
- Tenant D1 repositories.
- Provider token storage.

## Canonical files
- `authAdapter.ts`
- `controlDirectory.ts`
- `devAuthAdapter.ts`
- `jwtAuthAdapter.ts`
- `noopProductionAuthAdapter.ts`
- `sessionResolver.ts`

## Legacy warnings
- Dev auth is explicit only.
- Production must never default to dev.

## Common mistakes
- Trusting JWT `tenantId` or `role` claims.
- Auto-creating production users, tenants, or memberships without an explicit design.
- Auto-creating anything at all from a safe HTTP method.
