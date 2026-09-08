# Atra Doctrine

**Phase:** P6.1. **Baseline:** `main` @ `287515c`.

The constitutional definition of Atra / WorkUnit OS: who it is for, what it may do, and
what it must never do. This document is the parent of
[`INFORMATION_INTAKE_POLICY.md`](./INFORMATION_INTAKE_POLICY.md) (what comes in) and
[`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md) (how it is judged). It is documentation and a
static test only — it changes no runtime behavior and enables no capability.

---

## 1. Purpose

Fix, in writing, the identity and limits of Atra so that every future capability decision
(decomposition, retrieval, LLM judgment, external action) is measured against a stable
constitution instead of ad-hoc intuition.

## 2. Target User

Atra is an operating system for knowledge workers who become the bottleneck of their own intellectual work and project decisions.

The user is the person on whom decisions pile up: too many signals, too many threads, too
many half-formed obligations — and not enough structured material to decide with.

## 3. Core Problem

Information arrives scattered, unranked, and unverified. The user's scarce resource is not
information but **judgment-ready structure**: evidence, relationships, risks, and a clear
next action. Without it, the human becomes the queue.

## 4. North Star

Atra transforms goal-related information into human-reviewable WorkUnits with evidence, relationships, risks, next actions, tool suggestions, and drafts.

日本語の概念定義（正文）:

Atraは、自分が知的作業のボトルネックになっている人のために、goalごとの情報を判断可能なWorkUnitへ変換し、証拠・関係・リスク・次行動・Draftを揃えたうえで、人間が最終判断できる状態を作るOSである。

On any divergence between the English and Japanese texts, the stricter (more restrictive)
reading governs — divergence never widens a permission.

Atra is **not**:

- a generic task manager
- a search tool
- an autonomous execution agent
- a system that replaces human judgment

## 5. Core Flow

```
Signal → WorkUnit → Workspace → Action Field → Human Decision
```

The Action Field is a workspace, not an execution plane. The flow ends at a human
decision; it never ends at an autonomous action.

## 6. What Atra May Do

Atra may:

- aggregate goal-related information
- order information by relevance and risk
- decompose Signals into WorkUnit candidates
- identify missing information
- identify risks
- attach evidence
- show relationships and dependencies
- suggest tools for a WorkUnit
- generate drafts
- prepare external-action previews
- request human review

## 7. What Atra Must Not Do

Atra must not:

- make final decisions on behalf of humans
- approve on behalf of humans
- send external messages on behalf of humans
- execute external actions on behalf of humans
- skip human review based on LLM confidence
- treat goal-unrelated information as important by default
- promote blocked input into WorkUnits
- treat Draft as Sent
- treat Preview as Approval
- treat Approval as Execution

## 8. WorkUnit Principle

A WorkUnit is the unit of human judgment: one reviewable decision with its evidence,
relationships, risks, and next action attached. AI output is always a **candidate**
(Candidate ≠ Formal WorkUnit); only a human promotes a candidate to a Formal WorkUnit,
and promotion never happens from blocked input or with unresolved missing information.

## 9. Draft Principle

Atra may generate drafts, but Atra must not send drafts without explicit human approval and a separate execution gate.

Draft generation is decision support. Sending is external authority. Draft ≠ Sent, always.

## 10. Human Decision Principle

The human makes the final decision. Atra may assemble, rank, warn, and draft — but the
decision record belongs to a named human, and no model confidence, rule, or convenience
path may substitute for it. LLM confidence cannot skip Human Review.

## 11. Product Invariant

AI proposes. Rules guard. Humans decide.

Supporting boundaries, all preserved:

- Candidate ≠ Formal WorkUnit
- Preview ≠ Approval
- Approval ≠ Execution
- Draft ≠ Sent
- LLM confidence cannot skip Human Review
- Electron shell must not increase authority
- Action Field is workspace, not execution plane

## 12. Non-authorization Statement

This doctrine authorizes no capability. It does not authorize real LLM enablement,
external execution, OAuth/token storage, production deployment, publishing, release
creation, release tags, artifact upload, database implementation, API routes, UI changes,
or Electron authority expansion. Every capability remains governed by its own gate
([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with a recorded human decision.
