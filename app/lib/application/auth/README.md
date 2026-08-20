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
