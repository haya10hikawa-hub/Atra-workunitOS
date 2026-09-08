# Phase 4J: Candidate-only Decomposition Rule Gate Boundary

**Status:** Pure Rule Gate Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go

## Summary

Phase 4J gates candidate-only decomposition classifier results:

- `allow_candidate_only_decomposition` — valid workunit_candidate
- `request_candidate_clarification` — clarification needed
- `block_candidate_only_decomposition` — blocked or invalid contract

Covers: classifier result → rule gate → gated candidate decision.

## Gate Rules

| Classifier State | Gate Decision |
|------------------|---------------|
| `workunit_candidate` with valid contract | `allow_candidate_only_decomposition` |
| `clarification_needed` | `request_candidate_clarification` |
| `blocked_candidate` or blocked decision | `block_candidate_only_decomposition` |
| `candidateOnly` false | `block` (contract_invalid) |
| Any inherited safety flag true | `block` (contract_invalid) |
| Inconsistent shapes | `block` (shape_invalid) |

## Invariants

- Single type-only import from Phase 4I
- `candidateOnly: true`, `ruleGateEvaluated: true`
- All safety and disconnected flags: `false`

## Safety

- No runtime SDK, fetch, env, secrets
- No adapter/routing/4F-4I runtime calls
- Never creates providerRequest/providerResponse
- Never creates approval or execution payloads
- It does not connect to Source Signal
- It does not connect to Sanitize / Normalize
- It does not connect to real LLMContextPack Builder
- It does not connect to real Exclusion Scanner
- It does not connect to Decomposition Orchestrator
- It does not connect to Action Field
- It does not connect to Human Review
- It does not connect to production LLM pipeline
- It does not expose an API route
- It does not connect to UI

## All Boundaries

- Live Real LLM integration: No-Go
- External execution: No-Go
- UI connection: No-Go
- API connection: No-Go
- Production routing: No-Go
- Source Signal / real ContextPack / real Scanner: No-Go
- Phase 4H chain: No-Go
- Phase 4I runtime classifier: No-Go
- Decomposition Orchestrator / Action Field / Human Review: No-Go
- Future live-provider adapter: separate later PR
