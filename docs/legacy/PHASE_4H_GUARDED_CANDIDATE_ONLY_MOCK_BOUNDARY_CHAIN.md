# Phase 4H: Guarded Candidate-only Mock Boundary Chain

**Status:** Local Candidate-only Chain Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go
**UI Connection:** No-Go
**API Connection:** No-Go
**Production Routing Connection:** No-Go

## Summary

Phase 4H connects only local candidate-only components:

Phase 4G Exclusion Guard → Phase 4F Mock Boundary Harness → candidate-only result

It covers only: candidate-only context pack contract -> exclusion guard -> mock boundary harness -> candidate-only result

It does NOT connect to: Source Signal, Sanitize/Normalize, real LLMContextPack Builder,
real Exclusion Scanner, Decomposition Classifier, Decomposition Orchestrator,
Action Field, Human Review, production LLM pipeline, UI, API, or persistence.

## Chain Behavior

| Condition | Decision |
|-----------|----------|
| Guard blocks context pack | `block_before_mock_boundary` |
| Guard allows, routing safe | `produce_candidate_only_mock_boundary_result` (dry-run) |
| Guard allows, routing unsafe | `produce_candidate_only_mock_boundary_result` (blocked) |

Guard-blocked results do not call the mock boundary harness.
Guard-allowed results may call the Phase 4F harness.
Phase 4F harness may still return a blocked provider candidate when routing is unsafe.

## Imports

- Type-only: `ProviderAdapterContext`, `ProviderAdapterRoutingRequest`
- Runtime: `guardCandidateOnlyContextPackForMockBoundary`, `runCandidateOnlyMockBoundaryHarness`
- No direct adapter or `routeProviderAdapter` imports

## Invariants

`candidateOnly: true`, all false safety flags, all disconnected flags.

## Safety

- No adapters, routing, SDK, fetch, env, secrets
- No providerRequest, providerResponse, approval, or execution payloads
- Guard-blocked stops before harness
- Unsafe routing still resolves to blocked via Phase 4F
- Default and suspicious cases remain blocked
- Live Real LLM integration: No-Go
- External execution: No-Go
- UI connection: No-Go
- API connection: No-Go
- Production routing connection: No-Go
- Source Signal / real ContextPack Builder / real Exclusion Scanner connection: No-Go
- Decomposition Classifier / Orchestrator / Action Field / Human Review connection: No-Go
- Future live-provider adapter must be a separate later PR
