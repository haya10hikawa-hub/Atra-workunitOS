# Phase 2F: Provider Candidate Decision RFC

**Status:** Planning / Decision Document
**Live Provider Integration:** No-Go
**External Execution:** No-Go

## Summary

This RFC evaluates provider candidates for the first real LLM provider
adapter. Selection is deferred until all Phase 2 and Phase 3 gates are
merged and validated.

## Provider Candidates

| Candidate | Hosted | Self-hosted option | Local dev |
|-----------|--------|--------------------|-----------|
| OpenAI | Yes | No | No |
| Anthropic | Yes | No | No |
| Gemini | Yes | No | No |
| DeepSeek | Yes | No | Limited |
| Ollama | No | Yes | Yes |

## Scoring Rubric

Each candidate scored 0-3 on each criterion. Higher is better.

| Criterion | OpenAI | Anthropic | Gemini | DeepSeek | Ollama |
|-----------|--------|-----------|--------|----------|--------|
| Disable-by-default ease | 2 | 2 | 2 | 2 | 3 |
| Mockability | 3 | 3 | 2 | 2 | 2 |
| Deterministic testing | 2 | 2 | 2 | 2 | 3 |
| Budget control | 3 | 3 | 2 | 2 | 3 |
| Rate-limit clarity | 3 | 3 | 2 | 2 | 3 |
| Redaction compatibility | 3 | 3 | 2 | 2 | 3 |
| Auditability | 3 | 3 | 2 | 2 | 1 |
| Dependency risk | 1 | 1 | 1 | 1 | 3 |
| Operational cost | 1 | 1 | 2 | 2 | 3 |
| Accidental execution risk | 3 | 3 | 3 | 3 | 2 |
| Local dev ergonomics | 2 | 2 | 2 | 1 | 3 |
| **Total** | **26** | **26** | **22** | **21** | **29** |

## Decision

**Provider selection: Deferred.**

All candidates are deferred until:

1. All Phase 2A-2E gates are merged and validated.
2. All Phase 3A-3E contracts are merged and validated.
3. The Phase 3E live provider readiness scorecard returns Go.
4. A separate future live-provider adapter PR is reviewed and approved.

## Required Future Adapter Gates

Before any live provider adapter can be implemented:

- Secret policy must be operational
- Transport policy must be operational
- Budget/rate-limit infrastructure must be operational
- Redaction must be verified end-to-end
- Audit logging must be verified end-to-end
- Fixture gate must pass all scenarios
- Shadow harness must exercise full pipeline
- Rollback plan must be documented
- Human approval must be obtained
- External execution must remain disabled
- Provider output must remain candidate-only

## No-Go Until

Live Real LLM integration remains No-Go. Provider selection is deferred.
