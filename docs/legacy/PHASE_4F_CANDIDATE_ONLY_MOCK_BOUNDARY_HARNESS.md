# Phase 4F: Candidate-only Mock Boundary Harness

**Status:** Isolated Local Harness Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go
**Full Flow Connection:** No-Go

## Summary

Phase 4F creates an isolated candidate-only mock boundary harness covering
only this flow segment:

Mock LLM Boundary → Routing Gate → candidate-only result

It does NOT connect to:
- Source Signal, Sanitize/Normalize, LLMContextPack, Exclusion Scanner
- Decomposition Classifier, Decomposition Orchestrator
- Action Field, Human Review
- Production LLM pipeline, UI, API routes, persistence

## Harness Behavior

| Condition | Result |
|-----------|--------|
| Safe dry-run request | Calls dry-run adapter |
| All blocked cases | Calls blocked adapter |
| Suspicious/conflicting state | Blocked wins |

## Disconnected Flags

All explicitly `false`:
- `productionPipelineConnected`, `uiConnected`
- `sourceSignalConnected`, `contextPackConnected`
- `exclusionScannerConnected`, `decompositionClassifierConnected`
- `actionFieldConnected`, `humanReviewConnected`

## Invariants

- `candidateOnly: true`, `liveIntegrationAllowed: false`
- `externalExecutionAllowed: false`, `approvalCreationAllowed: false`
- `executionCreationAllowed: false`

## Safety

- Only BLOCKED_PROVIDER_ADAPTER and DRY_RUN_PROVIDER_ADAPTER may be called
- No SDK, no fetch, no process.env, no API key
- No providerRequest, providerResponse, approval, or execution payloads
- Live Real LLM integration remains No-Go
- External execution remains No-Go
- UI connection remains No-Go
- Production routing connection remains No-Go
- Future live-provider adapter must be a separate later PR
