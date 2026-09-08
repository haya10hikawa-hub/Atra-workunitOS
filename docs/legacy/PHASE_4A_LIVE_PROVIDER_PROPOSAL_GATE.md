# Phase 4A: Live Provider Proposal Gate

**Status:** Proposal Gate Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go

## Summary

Phase 4A determines whether a separate future live-provider adapter PR
may be opened.

It does NOT connect a provider. It does NOT implement a provider adapter.

## Decision Semantics

| Decision | Meaning |
|----------|---------|
| `no_go` | Do not open a future live-provider adapter PR |
| `conditional_go` | Repair warnings before opening a future PR |
| `go_to_open_separate_future_live_provider_adapter_pr` | A separate future PR may be opened. Live integration is still not implemented here |

## Invariants

- `liveIntegrationAllowed: false` — always
- `liveProviderAdapterImplemented: false` — always
- `externalExecutionAllowed: false` — always
- `mayOpenFutureProviderAdapterPr: true` — only for Go decision

## Gates (21)

All P0/required gates must pass or the decision is `no_go`.

| ID | Severity |
|----|----------|
| `phase_3e_merged` | p0 |
| `phase_3e_scorecard_go` | p0 |
| `explicit_owner` | required |
| `rollback_plan` | required |
| `budget_cap` | required |
| `rate_limit` | required |
| `provider_selected_or_deferred` | required |
| `secret_injection_policy` | p0 |
| `transport_policy` | p0 |
| `redaction_policy` | p0 |
| `offline_fixture_gate` | p0 |
| `shadow_harness` | p0 |
| `audit_logging_plan` | required |
| `kill_switch_required` | p0 |
| `no_sdk_current_phase` | p0 |
| `no_network_current_phase` | p0 |
| `no_env_secret_current_phase` | p0 |
| `no_external_execution` | p0 |
| `candidate_only_output` | p0 |
| `human_approval_required` | p0 |
| `separate_future_pr_required` | p0 |

## Safety

- No live provider, no SDK, no network, no env secrets
- No live adapter implementation
- Even Go only authorizes opening a separate future PR
- Live Real LLM integration remains No-Go
- External execution remains No-Go
