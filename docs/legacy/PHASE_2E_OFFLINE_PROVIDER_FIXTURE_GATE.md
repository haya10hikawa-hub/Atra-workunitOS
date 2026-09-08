# Phase 2E: Offline Provider Fixture Gate

**Status:** Offline / Fixture / Deterministic Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go

## Summary

Phase 2E introduces deterministic offline fixtures and a fixture gate that
exercises the provider boundary, dry-run contract, and diagnostic redaction
without SDKs, network calls, env secrets, persistence, or execution.

The gate answers the question:
"Can a future provider adapter be evaluated end-to-end through the boundary
using offline fixtures only?"

It does NOT answer: "Can we call a real provider?"

## Scope

Offline fixtures cover:

- All controls passing (blocked by provider_implementation_missing)
- Readiness gate No-Go
- Kill switch closed
- Raw provider payload rejected
- Forbidden context fields rejected
- Feature flag disabled
- P0 scanner disabled

## Provider Candidate Evaluation Matrix

| Candidate | Disable-by-default | Mock ease | Budget clarity | Redaction compat | Auditability | Deterministic tests | Lowest risk | Deferred |
|-----------|-------------------|-----------|----------------|-----------------|-------------|--------------------|-----------|----------|
| OpenAI | Medium | High | Clear | High | High | High | Medium | Yes |
| Anthropic | Medium | High | Clear | High | High | High | Medium | Yes |
| Gemini | Medium | Medium | Clear | Medium | Medium | Medium | Medium | Yes |
| DeepSeek | Medium | Medium | Clear | Medium | Medium | Medium | Medium | Yes |
| Ollama | High | High | N/A (self-hosted) | High | Medium | High | Low | Yes |

**Provider selection: Deferred.**

All candidates are deferred until Phase 2E-MVP approval.

## Fixture Gate Guarantees

- No SDK imports
- No network calls
- No env secret reads
- Provider boundary enforced
- Dry-run contract exercised
- Diagnostic redaction applied
- Forbidden context rejected
- Raw provider payload rejected
- All results blocked (no provider can reach through)
- Non-persistent results
- Human review required
- External execution disabled

## Validation

- npm test: all fixtures pass
- npm run lint: 0 errors
- npm run build: pass
- npm run cf:build: pass

## Go / No-Go

Phase 2E offline fixture gate: Go
Live Real LLM provider integration: No-Go
External execution: No-Go
