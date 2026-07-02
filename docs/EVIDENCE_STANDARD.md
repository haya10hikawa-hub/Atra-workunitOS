# Evidence Standard

**Phase:** P6.2. **Baseline:** `main` @ `99f1d44`.

Defines, at the product level, what counts as evidence in Atra — the material that may
support, weaken, contradict, or qualify a human decision about a WorkUnit. Builds on the
P6.1 constitution ([`ATRA_DOCTRINE.md`](./ATRA_DOCTRINE.md),
[`INFORMATION_INTAKE_POLICY.md`](./INFORMATION_INTAKE_POLICY.md),
[`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md)) and pairs with
[`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md). Documentation and a static test only — it
adds no runtime evidence storage and enables no capability.

> Not to be confused with the P5.4 **Alpha Evidence Ledger**
> ([`ALPHA_EVIDENCE_LEDGER.md`](./ALPHA_EVIDENCE_LEDGER.md)), which is a *release-governance*
> record of RC dry-run evidence. This Evidence Standard is the *product-level* definition of
> evidence used for WorkUnits, decisions, decomposition, retrieval, and LLM judgment.

---

## 1. Purpose

Fix what Atra may treat as judgment material, so that decomposition, ranking, retrieval,
and LLM judgment all rest on the same standard: evidence is earned by provenance and
relevance, never assumed from fluent text.

## 2. Scope

- **In scope:** the definition of evidence, its roles and strength, first-party vs
  third-party handling, contradiction and missing-information handling, and the evidence
  a claim or WorkUnit must carry.
- **Out of scope:** any runtime evidence storage, retrieval, GraphRAG, NL2SQL, real LLM,
  or external execution. Those are separately gated capabilities.

## 3. Definition of Evidence

Evidence is provenance-preserving, goal-relevant information that can support, weaken, contradict, or qualify a human decision.

Evidenceとは、LLMがそれらしく引用できる文章ではなく、出所・取得時刻・信頼度・変換履歴を保持し、人間の判断を支える、弱める、矛盾させる、または条件づける情報である。

The center of this standard:

> Evidence is not any text the model can cite. Evidence is provenance-preserving,
> goal-relevant information that can support, weaken, contradict, or qualify a human
> decision.

## 4. What Is Not Evidence

The following are **not** evidence:

- model confidence
- unsupported summary
- uncited claim
- raw retrieved text without provenance
- third-party text treated as truth by default
- draft content
- preview content
- approval itself
- execution result without source metadata

## 5. Evidence Roles

An evidence object declares its role relative to a decision:

- supports
- weakens
- contradicts
- qualifies
- contextualizes
- verifies source existence

A single source may play different roles for different decisions; the role is always
explicit, never inferred silently.

## 6. Evidence Strength

Evidence strength is evaluated on:

- source trust
- provenance completeness
- recency
- directness
- consistency
- tenant scope
- transformation history
- human confirmation status

Strength is a property presented to the human; it is never a permission to skip review
(Action readiness means readiness for human review, not permission to execute).

## 7. First-party vs Third-party Evidence

- First-party structured data (the tenant's own records, confirmed entries) is the
  strongest by default.
- First-party semi-structured/unstructured text ranks next.
- Third-party text can be evidence that a claim was made, but it is not evidence that the claim is true by default.

Ranking never auto-resolves a conflict; it only informs the human.

## 8. Contradiction Handling

Contradiction must be preserved as a first-class decision signal, not silently resolved by the model.

Atra may organize evidence, but Atra must not automatically decide truth when sources conflict.

Conflicting evidence is surfaced to the human as a contradiction, with each side's
provenance intact.

## 9. Missing Information Handling

Missing information must be represented explicitly and must not be treated as negative evidence.

Absence of a source is "unknown", not "false". A WorkUnit with missing information stays
held or pending (per [`INFORMATION_INTAKE_POLICY.md`](./INFORMATION_INTAKE_POLICY.md)) and
is never silently completed by a model guess.

## 10. Evidence Requirements for LLM Claims

LLM-generated claims that affect priority, risk, action readiness, or human review must reference evidence or be marked as unsupported.

An unsupported claim may still be shown, but only labeled as unsupported; it must never be
presented as if it were evidence, and it must never raise action readiness on its own.

## 11. Evidence Requirements for WorkUnits

A Formal WorkUnit must not rely on unsupported claims as evidence.

Promotion from candidate to Formal WorkUnit (a human-only action) requires that the
evidence backing the decision is provenance-bearing and that missing information is
resolved or explicitly accepted.

## 12. Evidence and Human Review

Evidence organizes the decision; it never makes it. LLM confidence cannot skip Human
Review. When evidence is insufficient, contradictory, or third-party-only for a
high-impact decision, human review is required (per [`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md)).

## 13. Non-authorization Statement

This Evidence Standard authorizes no runtime evidence storage, no GraphRAG implementation, no NL2SQL execution, no real LLM enablement, no external execution, and no automated decision-making.

It is a documentation standard; its enforcement in code is governed by separate, future
gates ([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with recorded human
decisions.
