# Atra Pain, Incentive, and Objection Model

Status: Draft v0.1
Scope: Product doctrine, user pain, incentive, and objection handling for Atra / WorkUnit OS

This document captures the product value argument that must remain consistent with:

- `docs/CANONICAL_DECISION_INDEX.md`
- `docs/specs/WORKUNIT_DOMAIN_MODEL.md`
- `docs/specs/ACTION_FIELD_SPEC.md`
- `AI_JUDGMENT_CRITERIA.md`

---

## 1. Core Product Thesis

Atra does not exist to replace human judgment.

Atra exists to automate the pre-processing required before responsible work can begin:

```txt
scattered work signals
  -> compressed judgment material
  -> structured WorkUnit
  -> actionable work surface
  -> preview / approval / dry-run boundary
```

The user remains responsible for the final judgment.

Because AI does not take responsibility, Atra must not black-box the judgment process. The system must expose the source, situation, problem, actors, evidence, missing fields, next action, and approval boundary before work moves forward.

Canonical framing:

```txt
Atra compresses, structures, and workifies scattered information.
Humans remain responsible for judgment and approval.
Rules protect trust, tenant, permission, and execution boundaries.
```

---

## 2. Primary Pain

The primary pain is not that users lack information.

The pain is that important information is scattered across Slack, GitHub, Gmail, Calendar, documents, and human notes, and the user must manually read, compare, interpret, prioritize, and convert it into work before they can start.

Atra resolves the work-starting bottleneck:

```txt
Before Atra:
  read everything
  infer what matters
  identify actors
  infer next action
  check missing context
  open the right tool
  draft the work
  decide whether it is safe to send/create/update

With Atra:
  receive WorkUnit candidate
  inspect source/evidence
  review missing fields
  edit draft/workspace
  prepare preview
  approve or reject safely
```

---

## 3. What Atra Automates

Atra automates the pre-work layer:

- signal collection
- context compression
- Situation / Problem / Actors extraction
- Evidence attachment
- Missing Fields surfacing
- Node / Evidence / Subtask / Noise classification suggestions
- Next Action proposal
- Action Field preparation
- external action preview preparation

Atra does not automate final responsibility.

Atra must not:

- finalize a WorkUnit without Human Review
- treat AI output as final truth
- approve an action from client state
- execute from workspace text
- hide source/evidence behind a black-box recommendation
- convert every input into a Node

---

## 4. Why This Is Not Just Judgment Outsourcing

A common objection is:

```txt
If I still have to judge, why do I need Atra?
```

Answer:

```txt
Because the hard part at work start is not only judgment.
It is the repeated pre-processing before judgment:
reading scattered inputs, compressing context, identifying the problem, locating actors, preserving evidence, exposing missing fields, and preparing the action surface.
```

Atra reduces the cost of getting to a responsible judgment. It does not remove the human responsibility for the judgment itself.

This is a feature, not a weakness.

If the user is accountable for the result, the system must keep the reasoning surface visible instead of hiding it behind an opaque AI decision.

---

## 5. Node Explosion Objection

A common objection is:

```txt
If AI creates WorkUnit candidates, wrong or low-value Nodes will create more cleanup work.
```

Answer:

Atra must not turn every signal into a Node.

Inputs must be classified as one of:

- WorkUnit Node candidate
- Evidence candidate
- Subtask candidate
- Noise
- hold / pending due to missing context
- unsafe / isolated input

Node creation requires:

- independence as a work or decision unit
- source reference or manual evidence
- provisional Situation / Problem / Actors / Next Action / Missing Fields
- tracking value
- Action Field expansion value
- known tenant, permission, source, and trust boundary

When information is insufficient, Atra must not invent the missing context. It must mark the missing information explicitly.

---

## 6. Existing Tools Objection

A common objection is:

```txt
I can already open Slack, GitHub, Calendar, Gmail, or Docs directly.
```

Answer:

Those tools are primary information sources and execution destinations.

They do not provide a unified work-start surface that spans tools and converts scattered information into a judgment-ready WorkUnit.

Atra sits between information sources and execution destinations:

```txt
Slack / GitHub / Gmail / Calendar / Docs
  -> Atra WorkUnit
  -> Action Field
  -> Preview / Approval / Dry-run
  -> source tool or destination tool
```

Atra must not hide the source tools. It must make them faster to reach.

---

## 7. StartHub

StartHub is the navigation layer that keeps Atra from becoming another isolated workspace.

Definition:

```txt
StartHub is the WorkUnit-attached navigation layer that lets the user jump from a WorkUnit to its primary source or destination context, such as Slack thread, GitHub issue, Calendar event, Gmail thread, or document, using fast keyboard-first access.
```

StartHub exists to make Atra a work-start hub, not a replacement silo.

StartHub principles:

- Atra must preserve source references.
- Atra must expose the primary source behind each WorkUnit.
- Atra must provide fast navigation back to the source tool.
- Atra must not force the user to copy context manually.
- Atra must not pretend that its summary replaces the original source.
- Atra must support keyboard-first access to primary context.

Canonical framing:

```txt
Atra is not another place where work disappears.
Atra is the place where scattered work is started, structured, and routed back to the right tool with context intact.
```

---

## 8. Action Field Positioning

The Action Field is not an extra permanent workspace.

It is the temporary, WorkUnit-attached work surface where the user can:

- inspect context
- edit the problem / decision
- define next action
- break down tasks
- draft notes or payloads
- review AI suggestions
- inspect source/evidence
- prepare external action preview
- request approval
- view dry-run or result state

Action Field value:

```txt
It lets the user move from scattered information to prepared work without losing source context or crossing execution boundaries accidentally.
```

The Action Field must never become:

- a raw prompt box
- a direct send field
- a hidden automation runner
- an external API configuration form
- a place where workspace text silently becomes an execution payload

---

## 9. Product Message

Short message:

```txt
Atra turns scattered work signals into judgment-ready WorkUnits and lets users start the work safely through Action Field.
```

Stronger message:

```txt
Atra does not make decisions for you.
It automates the pre-work required for responsible decisions: compressing context, structuring evidence, exposing missing fields, preparing actions, and keeping approval boundaries explicit.
```

One-line positioning:

```txt
Atra is a work-start OS for people who remain responsible for the judgment but cannot afford to manually pre-process every scattered signal.
```

---

## 10. Validation Metrics

This positioning must be validated through behavior, not only language.

Minimum metrics:

- WorkUnit Acceptance Rate
- Noise Misclassification Rate
- Correction Cost
- Missing Fields Accuracy
- Action Field Open Rate
- Action Field Edit Rate
- Preview Creation Rate
- Approval Request Rate
- Source Jump / StartHub Usage Rate
- Return-to-source Rate
- Weekly Retention

Core proof target:

```txt
Users open Atra before starting work because it gets them to a responsible first action faster than manually reading every source tool.
```

---

## 11. Non-Goals

Atra is not:

- a generic AI chat app
- a notification inbox
- a dashboard-first analytics surface
- a task list replacement
- a source-of-truth replacement for Slack, GitHub, Gmail, Calendar, or Docs
- an autonomous external execution agent
- a black-box priority oracle

Atra must remain:

```txt
Node-managed.
Action Field-driven.
Source-linked.
Human-approved.
Rule-guarded.
```
