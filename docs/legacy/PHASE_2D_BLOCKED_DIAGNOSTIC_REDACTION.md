# Phase 2D: Blocked Diagnostic Redaction Hardening

**Status:** Diagnostic Safety Hardening
**Live Provider Integration:** No-Go
**External Execution:** No-Go

## Summary

Phase 2D eliminates raw `valuePreview` exposure from blocked diagnostic findings.
Blocked diagnostics now expose only safe metadata: path, key, reason, severity,
value type, and value length.

## Problem

Phase 1 re-review identified a low-risk residual:

> 80-char `valuePreview` in blocked diagnostics could partially expose
> sensitive text.

The existing `exclusionScanner.ts` and `decompositionOrchestrator.ts` store
`valuePreview: value.slice(0, 80)` when scanning for forbidden context fields.
While this only occurs in blocked (`ok: false`) paths, it represents
unnecessary exposure of potentially sensitive values.

## Solution

`blockedDiagnosticRedaction.ts` provides:

- `SafeBlockedDiagnostic` type — exposes only path, key, reason, severity,
  valueType, and valueLength. Never includes raw values.
- `toSafeDiagnostic()` — converts a raw finding to a safe diagnostic.
- `toSafeDiagnostics()` — batch conversion with full redaction.
- `containsValuePreview()` — detection function for regression testing.

## Safety

Safe metadata preserved:

- `path` — JSON path of the field
- `key` — field key name
- `reason` — why it was blocked
- `category` — forbidden_key, forbidden_value, or forbidden_context
- `severity` — always p0 for blocked diagnostics
- `valueType` — JavaScript type of the blocked value
- `valueLength` — length of the blocked value

Never exposed:

- `valuePreview`
- `rawValue`
- `firstChars / lastChars`
- `excerpt / substring`
- `sampleValue`
- provider payload body
- user-sensitive text

## Integration

This module is used by:

- `llmProviderBoundary.ts` (already redacts via `redactFinding`)
- Future: `exclusionScanner.ts` boundary export
- Future: `decompositionOrchestrator.ts` summary diagnostics

The redaction is applied before blocked results are returned or serialized.

## Go / No-Go

Phase 2D diagnostic redaction: Go
Live Real LLM integration: No-Go
External execution: No-Go
