# Phase 2C: Provider Dry-Run Contract

**Status:** Dry-Run Contract Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go

## Summary

Phase 2C defines a deterministic, no-network, no-SDK, no-secret dry-run contract that future real provider adapters must satisfy before any live API integration is allowed.

## Scope

This phase does NOT:

- connect a live LLM provider
- import any provider SDK
- make any network call
- read any API key or env token
- enable external execution
- change UI
- add API routes
- add persistence or migrations

## Contract Definition

The dry-run contract (`ProviderDryRunContract`) consists of:

1. **Capability** — what the adapter declares it can do
2. **Preflight** — checks all Phase 2A boundary controls before any adapter call
3. **Adapt** — the actual adapter function producing deterministic output

## Fake Dry-Run Provider

`FAKE_DRY_RUN_PROVIDER` is a reference implementation that:

- Returns deterministic output keyed on route
- Never calls network
- Never imports SDKs
- Never reads env secrets
- Always returns `mode: "dry_run"`
- Produces non-executing output
- Rejects forbidden context fields via the Phase 2A boundary preflight

## Requirements

A future live provider adapter must:

1. Implement the same contract interface
2. Pass all Phase 2A boundary checks before any API call
3. Reject forbidden context fields
4. Reject raw provider payloads
5. Not create Formal Nodes, Approvals, or Executions
6. Not return execution-ready payload
7. Keep human review required
8. Keep external execution disabled

## Future Live Adapter

A future live adapter PR is No-Go until:
- All Phase 2C dry-run tests pass
- All Phase 2B entry criteria are met
- All Phase 2A boundary controls are satisfied
- All safety evaluators return Go

