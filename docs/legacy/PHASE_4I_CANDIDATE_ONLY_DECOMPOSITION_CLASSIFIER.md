# Phase 4I: Candidate-only Decomposition Classifier Boundary

**Status:** Pure Classification Boundary Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go

## Summary

Phase 4I classifies candidate-only mock boundary results into:

- `workunit_candidate` — recognized dry-run output
- `clarification_needed` — empty or unknown candidate shape
- `blocked_candidate` — blocked provider or unsafe routing

It covers only: mock boundary result → classifier → candidate type.

Does NOT call harness, guard, chain, adapters, routing, or production pipeline.

## Imports

Single type-only import:
```ts
import type { CandidateOnlyMockBoundaryHarnessResult } from "./candidateOnlyMockBoundaryHarness.ts"
```

## Classification Rules

| Condition | Type |
|-----------|------|
| Provider blocked or routing not dry_run | `blocked_candidate` |
| Empty/whitespace textCandidate | `clarification_needed` |
| Contains DRY_RUN_CANDIDATE_ONLY + "No live provider" | `workunit_candidate` |
| Other non-empty text | `clarification_needed` |

## Invariants

- `candidateOnly: true`, `rawCandidateTextIncluded: false`
- All 5 safety flags false, all 12 disconnected flags false

## Safety

- No raw candidate text in output, no SDK/fetch/env
- No Phase 4F/4G/4H/adapter/routing calls
- Never creates providerRequest/providerResponse
- Never creates approval or execution payloads
- Live Real LLM: No-Go, all connections: No-Go

## Contract Validation

Before classifying as `workunit_candidate`, the classifier validates:
- `mockBoundary.candidateOnly === true`
- `mockBoundary.provider.candidateOnly === true`
- provider not blocked, routing is dry_run, text matches expected pattern

Broken candidateOnly contract always classifies as `blocked_candidate`.

## All Boundaries

- Live Real LLM integration: No-Go
- External execution: No-Go
- UI connection: No-Go
- API connection: No-Go
- Production routing: No-Go
- Source Signal / real ContextPack / real Scanner: No-Go
- Phase 4H chain: No-Go
- Decomposition Orchestrator / Action Field / Human Review: No-Go
- Future live-provider adapter: separate later PR
