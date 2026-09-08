# Current Provenance Invariants

Status: CURRENT CANONICAL — PRODUCT-INDEPENDENT TECHNICAL AND SAFETY INVARIANTS

These invariants describe current safety boundaries only. They do not select a product,
market, workflow, data model, roadmap, or implementation. Product state remains governed
solely by [`PRODUCT_STATE.md`](../../PRODUCT_STATE.md).

1. Provider identity, provenance, evidence class, serialization, and persistence grant no
   decision, approval, execution, or truth authority.
2. A source assertion records that an assertion occurred; it is not promoted to fact by
   default. Confidence is not evidence or authority.
3. Provenance history is immutable. Corrections are additive, and contradictions retain
   each side's origin rather than overwriting or hiding either side.
4. Missing identity, authority, relationship, or temporal evidence remains explicitly
   unresolved. Array order, arrival order, timestamp proximity, provider identity, and
   latest-wins do not establish semantic or temporal order.
5. Derived and shadow outputs are non-authoritative, do not write back, and cannot be
   promoted by a feature flag. Promotion requires a separately reviewed human decision.
6. LLM output cannot decide identity, authority, conflict, approval, or execution. Invalid
   or unavailable model output must fail closed or fall back to bounded, non-authoritative
   output.
7. No new provenance or claim persistence is currently authorized. Before any persistence
   implementation, retention, compaction, recovery, tenant deletion, schema transition,
   idempotency, duplicate handling, redaction, audit, and measured growth assumptions must
   be decided and separately approved. No current persistence target is selected here.
8. Documents under `docs/archive/v0/` and `docs/legacy/` are historical context only. They
   supply no current required field, rule, ownership, governance, or authorization.
