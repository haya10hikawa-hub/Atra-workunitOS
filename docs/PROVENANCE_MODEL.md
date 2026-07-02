# Provenance Model

**Phase:** P6.2. **Baseline:** `main` @ `99f1d44`.

Defines how Atra represents the origin, timing, transformation, tenant, and trust boundary
of information — the record that turns raw text into usable evidence. Pairs with
[`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md) and builds on the P6.1 constitution.
Documentation and a static test only — it adds no runtime provenance storage, no schema,
and enables no capability.

---

## 1. Purpose

Give every piece of information a common, checkable record of where it came from and how it
may be used, so that evidence strength, tenant isolation, and future retrieval all have a
stable foundation.

## 2. Scope

- **In scope:** the definition of provenance, its required fields, source types, trust
  levels, transformation history, tenant scope, and the rules that future retrieval must
  satisfy before its output may be used as evidence.
- **Out of scope:** any runtime provenance storage, database schema change, vector storage,
  GraphRAG, NL2SQL, real LLM, or external execution.

## 3. Definition of Provenance

Provenance is the record of where information came from, when it was obtained, how it was transformed, and under which tenant and trust boundary it may be used.

Provenanceとは、情報がどこから来て、いつ取得され、どのように変換され、どのtenantと信頼境界の中で利用できるかを示す記録である。

## 4. Provenance Required Fields

Every provenance record carries at least:

- source_id
- source_type
- source_uri_or_reference
- obtained_at
- tenant_id
- actor_or_system
- trust_level
- transformation_history
- redaction_state
- retention_class
- evidence_role

## 5. Source Types

- first_party_structured
- first_party_semistructured
- first_party_unstructured
- third_party_text
- human_confirmation
- system_generated

## 6. Source Trust Levels

- untrusted
- sanitized_candidate
- source_verified
- human_confirmed
- system_verified

These extend the existing ingest trust ladder; a higher level is never assumed, only
earned, and low trust alone is grounds to hold (per
[`INFORMATION_INTAKE_POLICY.md`](./INFORMATION_INTAKE_POLICY.md)).

## 7. Transformation History

Transformation history must preserve whether information was summarized, normalized, redacted, classified, embedded, or linked.

Each transformation is appended, never overwritten, so a reviewer can trace how the current
form was derived from the original source.

## 8. Tenant Scope

Every evidence object and provenance record must be tenant-scoped.

Tenant id is derived from context, never from a caller-supplied field, and cross-tenant use
is forbidden (consistent with the existing repository tenant invariants).

## 9. First-party / Third-party Handling

- First-party sources (`first_party_structured` / `semistructured` / `unstructured`) carry
  the tenant's own provenance and rank highest.
- `third_party_text` records that a claim was made; its provenance notes the external
  origin, and it is never promoted to "true" by default (see
  [`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md) §7).
- The `human_confirmation` and `system_generated` source types (§5) may raise trust — but
  only by earning the corresponding trust level in §6 (`human_confirmed`, `system_verified`),
  never automatically. Source type and trust level are distinct: the source type records
  *where* information came from; the trust level records *how far* it has been verified.

## 10. Contradiction and Missing Information Links

- Provenance records link contradicting evidence to each other so the contradiction is
  visible with both sides' origins intact (never silently merged).
- Missing information is recorded as an explicit missing-info link, not as a low-trust
  source and not as negative evidence.

## 11. Retention and Redaction Principles

Secrets, tokens, passwords, and blocked input must not be preserved as evidence content.

- `redaction_state` records whether sensitive material was removed before the information
  became evidence; blocked input (per the intake policy) never becomes evidence content.
- `retention_class` governs how long a record may be kept; provenance carries no secret
  values and is consistent with the existing audit redaction.

## 12. Relationship to Future Retrieval / GraphRAG / NL2SQL

Future retrieval, GraphRAG, and NL2SQL outputs must restore provenance before they can be used as evidence.

A vector hit is not evidence until it resolves back to a provenance-bearing source.

A SQL result is not evidence unless the query plan, tenant scope, selected source rows, and result provenance are recorded.

These are stated as future constraints only; GraphRAG and NL2SQL remain separately gated,
No-Go capabilities ([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)).

## 13. Non-authorization Statement

This Provenance Model authorizes no runtime provenance storage, no database schema change, no vector storage, no GraphRAG implementation, no NL2SQL execution, no real LLM enablement, and no external execution.

It is a documentation standard; its enforcement in code is governed by separate, future
gates with recorded human decisions.
