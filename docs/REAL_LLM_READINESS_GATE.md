# REAL_LLM_READINESS_GATE.md

**Status: PLAN — FUTURE / NOT IMPLEMENTED.** Product authority: NONE.

## Purpose

Phase 1E defines the readiness gate required before any future real LLM provider integration.

This document does not authorize provider integration. It defines when Phase 2 may be considered for review.

## Go Conditions

Phase 2 readiness is Go only when all conditions are true:

- provider integration is disabled by default
- feature flag is required
- global kill switch is required
- tenant allowlist is required
- budget limit is required
- redaction policy is required
- audit logging policy is required
- P0 exclusion scanner is required
- prompt/context field allowlist is required
- raw provider payload is forbidden
- approvalId, hashes, tenantId, userId, and role are forbidden in model context
- provider output cannot create Formal Node, Approval, or Execution
- human review remains required
- external execution remains disabled

## No-Go Conditions

Phase 2 is No-Go if any condition above is missing or weakened.

Readiness Go is readiness only. It does not connect a provider, create a route, persist candidates, or enable execution.

## Forbidden in Phase 1E

- real provider calls
- provider SDK imports
- live API calls
- external execution
- UI changes
- candidate persistence
- database writes
- migrations
- approval creation
- execution creation
- auto Formalization

## Phase 2A Enforcement (chokepoint + no-bypass guarantee)

Phase 1E defined the gate. Phase 2A makes the gate **mandatory** for the AI runtime,
without connecting any provider. Real LLM integration remains **No-Go**.

### Mandatory chokepoint

The decomposition orchestrator
(`app/lib/application/decomposition/decompositionOrchestrator.ts`) treats the mock
boundary as the only path allowed to generate candidates. Any provider whose
`kind !== "mock"` is routed through `evaluateLlmProviderBoundary`
(`app/lib/application/llmProvider/llmProviderBoundary.ts`) **before** generation and is
refused (`real_provider_requires_readiness_gate`). The provider is never asked to
generate, so it cannot run ahead of the readiness gate. This is verify-before-call
ordering: the gate is evaluated before any provider can produce output.

The provider boundary continues to fail closed. Even when the required policy is
satisfied and every runtime control is open, the only remaining blocker is
`provider_implementation_missing` — there is no real provider implementation to call.

### No-bypass guarantee

A static source-scan test
(`tests/decompositionNoRealProviderImport.test.mts`) proves no file under
`app/lib/application/decomposition` imports a real provider SDK, imports an isolated
real client module (`deepseekProvider`, `realGitHubClient`, `externalToolClients`),
calls `fetch(`, or reads `process.env`. The scan carries a positive control (an
injected real-provider import must be caught) and a negative control (clean mock-only
source must pass) so it cannot decay into a no-op.

### Still No-Go in Phase 2A

- real provider calls, provider SDK imports, live API calls
- external execution, approval creation, execution creation, auto Formalization
- candidate persistence, database writes, migrations
- UI changes, tuning-data persistence

This phase changes enforcement structure and test coverage only. It does not authorize
provider integration; it makes the Phase 1E No-Go enforceable.
