# Atra Classifier — Final Target and Product Shape

Status: Target-state design v1
Branch: `codex/classifier-work-reconstruction`

## 1. Final target

The target is not a classifier that merely assigns labels.

The target is a **Work Reconstruction Engine** that turns scattered engineering evidence into a grounded model of current work.

The final classifier subsystem should be callable as a stable service boundary:

```ts
classifyWorkEpisode(sourceRecords)
```

and return:

```ts
{
  atoms,
  relations,
  correlationGroups,
  workUnitCandidates,
  uncertainty,
  evidence,
  metricsTrace
}
```

The rest of Atra should not need to know whether the subsystem internally used Qwen, another LLM, a fine-tuned classifier, a reranker, or deterministic rules.

## 2. Final product shape

The intended Atra product shape is a local-first engineering Work OS.

Atra should sit beside the engineer's existing tools rather than replace them.

```text
GitHub / Slack / Docs / Code / Calendar
             |
             v
       Source acquisition
             |
             v
      Local trust boundary
             |
             v
  Work Reconstruction Engine
             |
             v
       WorkUnit workspace
             |
     +-------+-------+
     |               |
  Evidence       Action Field
     |               |
     +-------+-------+
             |
             v
       Human judgment
```

The default product direction is:

- raw work context stays on the user's machine or explicitly trusted infrastructure
- indexing is local-first
- work reconstruction is local-first
- related code/doc recommendations are local-first
- external cloud AI is optional rather than required
- external actions remain behind explicit review/approval boundaries

## 3. Development form vs product form

The development environment and final product environment are intentionally different.

### Development / accuracy-first form

During classifier development, rented AWS GPU capacity can be used freely to establish the strongest practical baseline.

Baseline:

- generation / extraction: `Qwen/Qwen3.5-27B`
- shadow generation: `Qwen/Qwen3.5-35B-A3B`
- embedding: `Qwen/Qwen3-Embedding-8B`
- reranker: `Qwen/Qwen3-Reranker-8B`
- runtime: AWS GPU + vLLM structured output

The goal is to discover the quality ceiling and locate failure stages before optimizing model size.

### Final local-first product form

After the quality ceiling is known, Atra can expose hardware profiles.

Example target profiles:

- `Quality`: larger local model or enterprise local GPU
- `Balanced`: medium local model
- `Fast`: distilled / fine-tuned specialized relation model

The canonical interfaces remain the same across profiles.

The product must never hard-code the data model to a single model family.

## 4. Final classifier architecture

```text
S0  SourceRecordV1
        |
S1  Sanitize / trust gate
        |
S2  SemanticAtomV1 extraction
        |
S3  Hybrid retrieval
    explicit refs + lexical + embedding
        |
S4  Reranking
        |
S5  Relation judgment
    SAME / RELATED / UNRELATED / UNCERTAIN
        |
S6  Deterministic constraint gate
        |
S7  CorrelationGroupV1 formation
        |
S8  WorkUnitCandidateV1 formation
        |
S9  Human correction + append-only lineage
```

## 5. Final user experience

The classifier is successful only when its output improves the user's work surface.

The eventual WorkUnit UI should make the following visible at a glance:

- what this WorkUnit is
- current state
- outcome / done condition
- important evidence
- related source records
- related code / files / docs
- blockers / dependencies
- missing information
- next useful action
- uncertainty or human-review requirement

The user should be able to open any important claim and return to its original evidence.

## 6. What Atra should feel like

Before Atra:

```text
Open Slack
-> search keywords
-> open Issue
-> find PR
-> inspect code
-> read old discussion
-> determine latest decision
-> decide what is unfinished
-> decide what to do next
```

With Atra:

```text
Open WorkUnit
-> see reconstructed context
-> inspect evidence
-> verify or correct
-> start the next meaningful work
```

The goal is not to hide evidence. It is to compress navigation and reconstruction work.

## 7. Final quality bar

The system is not complete merely because an LLM produces plausible outputs.

A release candidate must have measured evidence for:

- retrieval recall
- relation classification
- SAME_WORK precision
- false merge
- false split
- unsupported claims
- evidence grounding
- abstention / human-review burden
- Japanese-only cases
- English-only cases
- Japanese/English mixed cases
- code + natural-language cases

Initial targets are working targets, not statistical proof:

- Retrieval Recall@30 normal: `>= 0.97`
- Retrieval Recall@30 hard: `>= 0.93`
- SAME_WORK precision: `>= 0.97`
- Relation macro F1: `>= 0.90`
- False merge episode rate: `<= 0.02`
- False split WorkUnit rate: `<= 0.05`
- Safety-gate violations: `0`
- Japanese/English macro-F1 gap: `<= 0.05`

These thresholds may be revised only with recorded evaluation evidence.

## 8. Final safety shape

The classifier never owns:

- tenant identity
- user identity
- approval truth
- execution truth
- provider credentials
- external action authorization

The model may suggest structure, but deterministic and human authority remain separate.

## 9. Final handoff to the rest of Atra

The classifier team's output should become a clean dependency of the larger product.

The rest of Atra should consume only stable contracts such as:

- `SemanticAtomV1`
- `RelationV1`
- `CorrelationGroupV1`
- `WorkUnitCandidateV1`
- `WorkUnitCorrectionV1`

This allows UI, Action Field, execution preparation, analytics, and future providers to evolve without rewriting the classifier core.
