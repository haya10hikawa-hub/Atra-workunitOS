# Phase 4B: Provider Adapter Boundary

**Status:** Boundary Definition Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go
**UI Connection:** No-Go

## Summary

Phase 4B defines the provider adapter boundary — the interface that
any future live provider adapter must implement. It does NOT connect
a live provider and does NOT implement a live provider adapter.

## Components

### Provider Adapter Boundary (`providerAdapterBoundary.ts`)

- `ProviderAdapter` interface
- `ProviderCandidateResult` type — all safety flags hardcoded `false`
- `ProviderAdapterContext` — contextual metadata
- `ProviderAdapterMode` — blocked / dry_run / future_live

### Blocked Provider Adapter (`blockedProviderAdapter.ts`)

Default adapter that always returns:

- `blocked: true`
- `candidateOnly: true`
- `liveIntegrationAllowed: false`
- `externalExecutionAllowed: false`
- `approvalCreationAllowed: false`
- `executionCreationAllowed: false`

## Invariants

| Flag | Value |
|------|-------|
| `blocked` | true |
| `candidateOnly` | true |
| `liveIntegrationAllowed` | false |
| `externalExecutionAllowed` | false |
| `approvalCreationAllowed` | false |
| `executionCreationAllowed` | false |

## Safety

- No provider SDK, no fetch, no process.env
- No API key, token, or secret in serialized output
- No approval or execution creation
- Future live adapter must be a separate PR
- UI connection remains separate
- Human approval remains required
