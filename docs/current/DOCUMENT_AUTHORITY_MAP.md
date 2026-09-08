# Document Authority Map

This map classifies product-direction-facing documents at the V0 freeze. It does
not reclassify runtime code, tests, or generic technical contracts.

Every `ARCHIVE` entry is historical only: it does not authorize current or future
implementation, capability enablement, approval, or product decisions.

| Path before freeze | Classification | Action | Reason |
| --- | --- | --- | --- |
| `docs/archive/v0/ATRA_DOCTRINE.md` | V0_PRODUCT_HISTORY | ARCHIVE | Defines V0 user, problem, and product identity. |
| `docs/research/ATRA_PAIN_INCENTIVE_AND_OBJECTION_MODEL.md` | RESEARCH_EVIDENCE | RESEARCH | Preserves reusable but unresolved value and buyer hypotheses. |
| `docs/archive/v0/CANONICAL_DECISION_INDEX.md` | V0_PRODUCT_HISTORY | ARCHIVE | Names V0 product UI and product authority. |
| `docs/archive/v0/DECISION_RUBRIC.md` | V0_PRODUCT_HISTORY | ARCHIVE | Product-level V0 review and capability framing. |
| `docs/archive/v0/GRAPH_MODEL.md` | V0_PRODUCT_HISTORY | ARCHIVE | V0 Graph product concept. |
| `docs/archive/v0/PHASE1_VALUE_GATE_PROGRAM.md` | V0_PRODUCT_HISTORY | ARCHIVE | V0 product hypothesis and roadmap authority. |
| `docs/archive/v0/WORKUNIT_OS_ORGANIZATION.md` | V0_PRODUCT_HISTORY | ARCHIVE | V0 organizational product vision. |
| `docs/archive/v0/WORKUNIT_OS_OVERVIEW.md` | V0_PRODUCT_HISTORY | ARCHIVE | V0 market, user, and roadmap narrative. |
| `docs/archive/v0/ACTION_FIELD_SPEC.md` | V0_PRODUCT_HISTORY | ARCHIVE | V0 Action Field product concept. |
| `docs/archive/v0/MVP_USECASE_SPEC.md` | V0_PRODUCT_HISTORY | ARCHIVE | V0 MVP definition. |
| `docs/archive/v0/WORKUNIT_DOMAIN_MODEL.md` | V0_PRODUCT_HISTORY | ARCHIVE | V0 WorkUnit product model. |
| `docs/archive/v0/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md` | V0_PRODUCT_HISTORY | ARCHIVE | Makes WorkUnit the mandatory core and records the frozen V0 target pipeline. |
| `docs/archive/v0/INFORMATION_INTAKE_POLICY.md` | V0_PRODUCT_HISTORY | ARCHIVE | Defines frozen V0 product intake semantics. |
| `docs/archive/v0/EVIDENCE_STANDARD.md` | V0_PRODUCT_HISTORY | ARCHIVE | Defines frozen V0 product evidence semantics. |
| `docs/archive/v0/PROVENANCE_MODEL.md` | V0_PRODUCT_HISTORY | ARCHIVE | Defines frozen V0 product provenance model. |
| `docs/archive/v0/DECOMPOSITION_STANDARD.md` | V0_PRODUCT_HISTORY | ARCHIVE | Defines frozen V0 decomposition flow. |
| `docs/archive/v0/TYPED_DECOMPOSITION_OBJECT.md` | V0_PRODUCT_HISTORY | ARCHIVE | Defines frozen V0 candidate object. |
| `docs/archive/v0/RELATIONSHIP_SCHEMA.md` | V0_PRODUCT_HISTORY | ARCHIVE | Defines frozen V0 relationship model. |
| `docs/archive/v0/DECOMPOSITION_EVALUATION_RUBRIC.md` and `DECOMPOSITION_EVALUATION_HARNESS_SPEC.md` | V0_PRODUCT_HISTORY | ARCHIVE | Define frozen V0 decomposition evaluation. |
| `docs/archive/v0/LLM_PROCESSING_MODEL.md` | V0_PRODUCT_HISTORY | ARCHIVE | Defines frozen V0 signal-to-WorkUnit product value. |
| `docs/archive/v0/NEXT_CAPABILITY_GATE.md` | V0_PRODUCT_HISTORY | ARCHIVE | Records frozen V0 capability sequencing. |
| `docs/research/ATRA_SOURCE_UNIVERSE.md` | RESEARCH_EVIDENCE | RESEARCH | Preserves unresolved source and daily-use hypotheses. |
| `docs/security/` | TECHNICAL_REUSABLE_ASSET | KEEP / INDEX | Security contracts remain applicable independent of product direction. |
| `docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md` | TECHNICAL_REUSABLE_ASSET | KEEP / INDEX | Source identity research is reusable technical evidence. |
| `docs/research/HOPPER_VECTOR_ALGORITHM.md` | RESEARCH_EVIDENCE | KEEP / INDEX | Research does not grant product authority. |
| `docs/specs/API_CONTRACT.md`, `ERROR_MODEL.md`, and `DATA_MODEL.md` | CURRENT_IMPLEMENTATION_CONTRACT | KEEP / INDEX | Existing technical behavior only; not future product authority. |

No document is current product authority merely because code or a technical contract exists. [`PRODUCT_STATE.md`](../../PRODUCT_STATE.md) alone owns product state.
