# Phase 4G: Candidate-only Context Pack Exclusion Guard

**Status:** Pure Exclusion Guard Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go

## Summary

Phase 4G creates a candidate-only context pack exclusion guard covering:

LLMContextPack candidate contract → Exclusion Guard → safe Mock Boundary input

It does NOT connect to the real Source Signal, LLMContextPack Builder,
Exclusion Scanner, Mock Boundary Harness, adapters, routing, UI, API
routes, or production pipeline.

## Guard Behavior

| Condition | Decision |
|-----------|----------|
| Empty/whitespace sanitizedText | block |
| rawSignalIncluded true | block |
| secretsIncluded true | block |
| Block-severity exclusion finding | block |
| Invalid maxOutputChars (non-finite, <1) | block |
| All safe | allow |

maxOutputChars is clamped to 1000 maximum.

## Invariants

- `candidateOnly: true`, `rawSignalIncluded: false`, `secretsIncluded: false`
- `liveIntegrationAllowed: false`, `externalExecutionAllowed: false`
- `productionPipelineConnected: false`, `uiConnected: false`
- `sourceSignalConnected: false`, `realContextPackBuilderConnected: false`
- `realExclusionScannerConnected: false`, `decompositionClassifierConnected: false`
- `decompositionOrchestratorConnected: false`, `actionFieldConnected: false`
- `humanReviewConnected: false`

## Safety

- No adapter execution, no routing execution, no harness execution
- No SDK, no fetch, no process.env
- Live Real LLM integration remains No-Go
- External execution remains No-Go
- All downstream/upstream connections remain No-Go
