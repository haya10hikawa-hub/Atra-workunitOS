# ADR 0002: MVP Runtime Stack and Workspace Boundaries

## Status

Accepted

## Context

The first MVP needs shared, versioned contracts, deterministic fixtures, backend boundaries, a future annotation UI, evaluation tooling, and local validation commands. `docs/OPEN_DECISIONS.md` recommends a conservative TypeScript monorepo but requires the choice to be recorded.

Gold evaluation labels must remain unavailable to retrieval and ranking code.

## Decision

Use an npm-workspaces TypeScript monorepo on Node.js. Use Zod for runtime schemas and inferred TypeScript types, Vitest for tests, and ESLint plus TypeScript for static checks. Reserve React/Vite for the annotation frontend and a small Node.js HTTP API for the backend when those phases begin.

Separate contracts into workspace packages by trust boundary:

- `@atra/source-contracts` owns immutable source records, chunks, hashes, and base deterministic IDs.
- `@atra/candidate-contracts` owns candidate metadata and order-stable pair IDs.
- `@atra/gold-contracts` owns human labels, annotations, adjudications, and frozen releases.

Retrieval may depend only on source and candidate contracts. It must not depend on `@atra/gold-contracts`. Synthetic calibration fixtures live in their own workspace and may depend on all contract packages.

Use `npm test`, `npm run lint`, `npm run build`, and `npm run verify` as the initial local commands.

## Consequences

- Runtime validators and TypeScript types share one definition.
- Package dependencies provide an enforceable Gold-leakage boundary.
- Backend, frontend, evaluation, and fixtures can evolve independently inside one lockfile.
- The frontend and HTTP framework are intentionally not installed until their MVP phases require executable code.
- npm and Node.js versions are pinned in the root manifest/lockfile and should be updated deliberately.
