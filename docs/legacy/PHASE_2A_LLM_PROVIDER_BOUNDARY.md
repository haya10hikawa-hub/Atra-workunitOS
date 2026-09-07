# PHASE_2A_LLM_PROVIDER_BOUNDARY.md

## Purpose

Phase 2A adds a real LLM provider boundary shell only.

It does not connect a live provider.

## Scope

- accept sanitized provider request shape
- require Phase 1E readiness Go
- require runtime controls before any future provider call
- block forbidden context fields
- block raw provider payloads
- keep provider disabled by default
- return candidate-only blocked results

## No-Go

- real LLM provider calls
- provider SDK imports
- fetch or network calls
- environment secret reads
- external execution
- UI changes
- API route changes
- candidate persistence
- Supabase
- migrations
- AI approval
- auto Formalization
- vector-based merge finalization

## Phase Boundary

Passing this boundary does not authorize provider execution.

Until a separately reviewed provider implementation exists, the boundary returns `provider_implementation_missing`.
