# ADR-0002: Ports-and-adapters boundaries enforced by tests

- Status: Accepted
- Context: Boundaries today are held by convention and regex source-guards.
  Routes embed orchestration (504-line `tools/route.ts`); provider, config,
  and store selection are scattered (`DEPENDENCY_MAP.md` §Findings). Multiple
  teams cannot change infrastructure without touching application logic.
- Decision: Adopt the dependency direction `UI/API → Application → Domain +
  Ports ← Infrastructure adapters`, wired only at per-runtime composition
  roots. Domain/application must not import Cloudflare, provider SDKs, D1
  classes, or `process.env`. Enforcement is an executable import-graph test
  (added in the first `refactor/domain-boundaries` PR), which replaces regex
  source-guards incrementally (R-11).
- Consequences: Some interfaces move to `app/lib/domain/ports/**` (type-only
  moves, characterized first); route files shrink to transport concerns;
  future real provider adapters (GitHub, DeepSeek) get a single insertion
  point behind the kill switch and gate.
- Alternatives considered: keep convention + source-guards (rejected: already
  drifting, brittle); full hexagonal restructure in one PR (rejected:
  violates ADR-0001 sizing).
