# Decision Rubric

**Phase:** P6.1. **Baseline:** `main` @ `287515c`.

Defines how Atra evaluates importance, urgency, risk, and the need for human review — and
where the hard boundaries sit for drafts, previews, approvals, and external actions. Child
of [`ATRA_DOCTRINE.md`](./ATRA_DOCTRINE.md); applies to input classified by
[`INFORMATION_INTAKE_POLICY.md`](./INFORMATION_INTAKE_POLICY.md). Documentation and a
static test only — no runtime behavior change.

---

## 1. Purpose

Give Atra one explicit yardstick for prioritization, escalation, and refusal, so that
"what should a human see, and what may the system never do" is a written rule rather than
a model's mood.

## 2. Decision Principle

AI proposes. Rules guard. Humans decide. The rubric ranks and routes; it never authorizes.
LLM output is a proposal about **uncertainty and readiness**, never about **authority**.

LLM confidence must not skip human review.

## 3. Action Readiness

Action readiness means readiness for human review, not permission to execute.

A candidate is action-ready when its evidence is sufficient, its uncertainty is declared,
its missing information is resolved or explicitly accepted, and its risks are visible.
Readiness moves a candidate **to** the human; it never moves an action **past** the human.

## 4. Rubric Axes

Every candidate is evaluated on these axes:

- goal relevance
- urgency
- impact
- evidence strength
- uncertainty
- reversibility
- authority risk
- human review requirement

An unevaluatable axis is treated as high-risk, not as low-risk (fail-closed).

## 5. Human Review Requirements

Human review is required when:

- external sending is involved
- the impact scope extends beyond the user
- the action is irreversible or difficult to reverse
- authority, secrets, or personal information are involved
- source trust is low
- evidence is insufficient
- information conflicts are present
- the LLM reports uncertainty
- a draft connects to external sending
- the workflow approaches approval or execution

## 6. No-Go Conditions

The following are No-Go, always:

- WorkUnit promotion based on blocked input
- cross-tenant processing
- external sending without approval
- external API write without approval
- treating Draft as Sent
- treating Preview as Approval
- treating Approval as Execution
- skipping review based on LLM confidence
- generating or sending payloads containing secrets, tokens, or passwords
- automatic execution of irreversible actions

## 7. Capability Permission Matrix

```
Level 0: Read / Observe
Level 1: Classify / Decompose
Level 2: Suggest
Level 3: Draft
Level 4: Prepare Preview
Level 5: Request Approval
Level 6: Execute External Action
Level 7: Irreversible / High-risk Action
```

Current permission state:

```
Current Go:
Level 0 Read / Observe
Level 1 Classify / Decompose
Level 2 Suggest
Level 3 Draft
Level 4 Prepare Preview
Level 5 Request Approval

Current No-Go:
Level 6 Execute External Action
Level 7 Irreversible / High-risk Action
```

Current Atra may read, classify, decompose, suggest, draft, prepare preview, and request approval, but must not execute external actions or irreversible high-risk actions.

This matrix maps onto existing enforcement: Level 6+ is held No-Go by the external-action
kill switch (default off) and the approval gates (four-eyes, one-time-use,
preview↔approval binding); the fail-closed LLM provider boundary separately keeps
real-LLM enablement No-Go. Raising any level requires its own
capability gate ([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) and a recorded
human decision.

## 8. External Action Boundary

External action means any action that sends, publishes, creates, modifies, deletes, shares, or commits information outside Atra's internal workspace.

Examples of external actions:

- Gmail sending
- Slack posting
- GitHub issue creation
- Calendar invitation sending
- external API writes
- file sharing
- public-setting changes
- deletion
- permission changes

## 9. External Action Checklist

External action requires recipient, destination, payload, reason, related goal, evidence, reversibility, impact scope, secret and PII check, tenant boundary check, explicit human approval, and audit event.

If any checklist item is missing or unverifiable, the action is No-Go — never "probably
fine". The checklist gates the *request for approval*; execution itself additionally
requires the Level 6 gate, which is currently No-Go.

## 10. Draft Boundary

Draft generation is allowed. Draft sending is not allowed.

Draft is decision support. Sending is external authority.

A draft may be shown, edited, and attached to a preview. The moment content would leave
Atra's internal workspace, it crosses the external-action boundary (§8) and is No-Go
without the full checklist (§9) and a separate execution gate.

## 11. Preview / Approval / Execution Boundary

Preview is not approval. Approval is not execution.

- Inspecting a preview never approves it.
- An approval never performs an external action; it records a human decision with
  four-eyes (creator ≠ approver), expiry, and one-time-use semantics.
- Execution is a separately gated capability (Level 6), currently No-Go, and will always
  require a valid, verified, unexpired, unused approval plus its own gate.

## 12. Non-authorization Statement

This rubric authorizes no capability. It does not authorize real LLM enablement, external
execution, OAuth/token storage, production deployment, publishing, release creation,
release tags, artifact upload, database implementation, API routes, UI changes, or
Electron authority expansion. It defines how decisions are ranked and refused — every
permission change goes through its own gate with a recorded human decision.
