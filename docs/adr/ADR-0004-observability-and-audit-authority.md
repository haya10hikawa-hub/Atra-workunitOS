# ADR-0004: Structured observability with loss-accounted security audit

- Status: Accepted
- Context: `writeAuditLog` is a no-op outside dev-verbose; durable audit exists
  only on selected paths via `recordAuditEvent` and is fail-open (silent
  swallow). There are no metrics, no tracing, no correlation-ID discipline
  (AUD-004, #156, #133). An operator cannot reconstruct most incidents, and
  audit loss is undetectable — incompatible with the L5 auditability target.
- Decision: Introduce `app/lib/observability/**` with: (1) one structured
  emitter (JSON lines to the platform log sink) carrying a per-request
  correlation ID minted at the route boundary; (2) audit events for
  security-relevant decisions written through a single pipeline that is
  **loss-accounted** — a persistence failure increments a visible loss counter
  and emits a structured error, and for the approval/authorization decision
  paths the request fails closed if the audit write fails (documented
  per-event-class policy, decided with Issue #156); (3) redaction stays
  allowlist-based (existing `toSafeAuditMetadata` proofs carry over).
- Consequences: The no-op `writeAuditLog` vocabulary is migrated call-site by
  call-site (characterized first); fail-open behavior changes only where an
  Issue explicitly approves it (no silent behavior change per Phase 16 rule 1);
  hashes and server-owned identifiers stay out of persisted metadata (#133).
