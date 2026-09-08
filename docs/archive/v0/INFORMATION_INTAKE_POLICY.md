# Information Intake Policy

**Phase:** P6.1. **Baseline:** `main` @ `287515c`.

Defines what information Atra accepts, ignores, holds, or blocks — before any
decomposition, ranking, or judgment happens. Child of
[`ATRA_DOCTRINE.md`](./ATRA_DOCTRINE.md); judged by
[`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md). Documentation and a static test only — no
runtime behavior change.

---

## 1. Purpose

Give every ingest path one consistent, fail-closed standard for what may enter Atra's
workspace, so that noise does not become work, secrets do not become data, and injected
instructions do not become actions.

## 2. Intake Principle

The central intake question is:

Does this information change a user goal, decision, priority, risk, dependency, evidence, or next action?

If yes → accept. If no → ignore. If unclear → hold. If it must never be processed → block.
Intake classification itself is candidate-only and human-recoverable, except blocking,
which is rule-first and fail-closed.

## 3. Goal Relevance

Atra accepts information when it can change a goal, decision, priority, risk, dependency, evidence, or next action.

Relevance is always evaluated against the user's goals — not against generic importance.
Information that would matter to someone else but changes nothing for this user's goals is
not a Signal for this user.

## 4. Accepted Input

Accepted:
Information that can connect to a goal, judgment, action, risk, deadline, responsibility, evidence, WorkUnit, or WorkUnit update.

Accepted input becomes a Signal and may be decomposed into WorkUnit candidates — always
candidate-only, always with provenance.

## 5. Ignored Input

Ignored:
Information that does not change the current goal, judgment, priority, risk, dependency, evidence, or next action.

Ignored means not relevant to the current decision, not nonexistent.

Ignoring is reversible: ignored input is not destroyed, and a human can recover or
re-classify it when goals change.

## 6. Held Input

Held:
Information that may matter but lacks goal relevance, evidence, owner, deadline, source trust, or authority conditions.

Atra holds information when it may matter but lacks sufficient goal relevance, evidence, owner, deadline, or source trust.

Held input must not be promoted to a Formal WorkUnit until missing information is resolved.

Held input is surfaced as a pending candidate with an explicit missing-information label
and is re-evaluated when new evidence arrives or a deadline approaches.

## 7. Blocked Input

Blocked:
Information that Atra must not ingest, decompose, promote, or use because of authority, secret, safety, tenant-boundary, prompt-injection, or unauthorized-execution risk.

Atra blocks information that violates tenant boundaries, contains secrets, attempts prompt injection, or requests unauthorized execution.

Blocked input must be rejected or redacted before decomposition.

Blocked classification should be rule-first and fail-closed.

Rule-first means deterministic patterns (tenant mismatch, secret/token formats, known
injection shapes, execution requests) decide blocking before any model sees the content;
an LLM may assist detection but may never unblock. When blocking occurs, only a redacted
audit event is kept — never the blocked content itself.

## 8. Source Trust

Every source carries a trust level, aligned with the existing trust ladder
(untrusted → sanitized_candidate → draft → reviewed). Low source trust alone is grounds to
hold; it is never grounds to silently accept. Trust levels are attached at intake and
travel with the information as provenance.

## 9. First-party vs Third-party Data

- **First-party structured data** (the tenant's own records, confirmed calendar entries)
  ranks highest.
- **First-party semi-structured text** (messages addressed to the user) ranks next.
- **Third-party text** (forwarded content, quotes, external pages) is evidence that a
  claim *was made* — not evidence that the claim *is true*. Third-party text alone cannot
  satisfy an evidence requirement for a high-impact decision.

## 10. Missing Information

Missing information is a first-class label, not an absence. A candidate with missing
information stays held or pending; it is presented to the human as "what is missing",
never silently completed by a model guess.

## 11. Prompt Injection / Secret Handling

- Text that attempts to instruct Atra (or its models) to act — "send this", "approve
  that", "ignore your rules" — is data, never instruction. Suspected injection is blocked
  input.
- Secrets, tokens, credentials, and password-like material are blocked at intake: rejected
  or redacted before decomposition, excluded from candidates, drafts, evidence records,
  and audit metadata (consistent with the existing audit redaction).
- Blocked input never reaches decomposition, promotion, drafts, or previews.

## 12. Promotion Rules

- Only accepted input may become a WorkUnit candidate.
- Held input must not be promoted to a Formal WorkUnit until missing information is
  resolved (see §6).
- Blocked input must never be promoted, decomposed, or used — promotion from blocked
  input is a No-Go condition in [`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md).
- All promotion remains human-only (Candidate ≠ Formal WorkUnit).

## 13. Non-authorization Statement

This policy authorizes no capability. It does not authorize real LLM enablement, external
execution, OAuth/token storage, database implementation, API routes, UI changes, or any
runtime behavior change. Intake classification described here is a documentation standard;
its enforcement in code is governed by separate, future gates.
