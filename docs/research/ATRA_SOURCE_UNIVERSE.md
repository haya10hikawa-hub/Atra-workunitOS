# Atra Source Universe — information layers and daily-use composition

Status: RESEARCH — unresolved, reusable V0-derived hypotheses. Not Product Authority.

Current product direction is governed only by [`PRODUCT_STATE.md`](../../PRODUCT_STATE.md) and remains unresolved.
All product shapes, priorities, phases, and value judgments below are historical V0 hypotheses.

Base: `main` `3a2bf3cbbffd304d7db4a0eb5a7d5058ae2d3402`

Execution boundary: documentation only. This record changes no `app/**` file, no `scripts/**` file, no
migration, no runtime configuration, no provider and no UI. It authorizes no implementation WorkUnit,
expands no allowlist, and moves no provider gate.

```text
RUNTIME_IMPLEMENTATION = 0
IMPLEMENTATION_NEXT    = NO
REASON                 = this record establishes vocabulary, not capability; every provider route
                         still requires its own reviewed profile WorkUnit, and P1-2 entry is
                         historical V0 state only; no current product authorization
```

## Authority Position

```text
Human PM
  ↓
docs/archive/v0/PHASE1_VALUE_GATE_PROGRAM.md      frozen V0 priority, phase order, Gates
  ├─ docs/archive/v0/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md   domain architecture
  ├─ docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md                     canonical record semantics
  └─ this document                                                       information-layer vocabulary
```

This document is subordinate to all three. It owns exactly one thing: **the independent kinds of truth
Atra needs in order to understand and finish work**, and the vocabulary for talking about them without
conflating four different questions.

It does **not** own, and may never be read as changing:

- phase order, phase entry, phase exit or Gate semantics — `PHASE1_VALUE_GATE_PROGRAM.md` owns those;
- canonical record identity, content-digest or provider-profile gate state —
  `SOURCE_RECORD_V1_SEMANTICS.md` owns those, and every gate value restated here is a **copy**, never
  a source;
- record ownership, projection boundaries or composition rules —
  `CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md` owns those.

Where this document disagrees with any of them, they govern and this document is the defect.

## The Four Axes

A provider is not one status. Collapsing these four questions into a single "supported / not
supported" field is how a product judgment silently becomes a canonical permission.

```text
AXIS_PRODUCT_VALUE            Does this truth improve Atra's understanding of work?
AXIS_CANONICAL_ELIGIBILITY    Can this provider's objects become SourceRecordV1 values?
AXIS_IMPLEMENTATION_READINESS May this be built at the current head, under current authority?
AXIS_DAILY_USE_VALUE          Does this give a user a reason to open Atra on an ordinary day?

AXES_NEVER_COLLAPSE
```

The axes are independent in both directions:

- High product value grants no canonical eligibility. Slack's request and blocker signal is among the
  most valuable truth Atra could hold, and Slack's profile gates are `REQUIRED_UNPROVEN`. Both are
  true at once, and neither moves the other.
- Canonical eligibility grants no daily-use value. A GitHub pull request produces a truthful
  `SourceRecordV1` today, and one record read by one producer changes nobody's workday.
- Implementation readiness was a permission only within the frozen V0 model. It is never inferred
  from the other three and grants no current product authorization.

`AXIS_PRODUCT_VALUE` and `AXIS_DAILY_USE_VALUE` are **product judgments** recorded here. The other two
are **evidence states owned elsewhere**; this document copies them and may not originate them.

## The Seven Layers

A layer is a kind of truth, not a vendor. Two providers belong to the same layer when they answer the
same question about the work, and to different layers when they do not — regardless of how similar
their APIs look.

### L1 — Work Truth

What work exists, who owns it, what state it is in, and which artifacts realize it.

Contributes: work existence; ownership; lifecycle state; implementation artifacts; declared linkage
between artifact and work item.

Cannot alone establish: why the work matters; what "done" means to the requester; whether anyone is
currently blocked; whether the recorded state matches reality.

Candidate providers: GitHub, Linear, Jira, Asana.

### L2 — Human Signal

What a person asked for, questioned, promised or escalated.

Contributes: explicit request; question awaiting an answer; stated blocker; stated urgency;
commitment language; human-authored reference to a work artifact; who is waiting on whom.

Cannot alone establish: canonical work identity; that a decision was final; a durable done condition;
that anything was actually completed.

Candidate providers: Slack, Gmail, Teams messages.

### L3 — Durable Context

Why the work is being done, and against what specification.

Contributes: goal; specification; done condition; rationale; constraint; background that outlives the
conversation that produced it.

Cannot alone establish: current work state; who is doing it now; whether the spec is still the one in
force; urgency.

Candidate providers: Notion, Google Drive, Confluence.

### L4 — Decision Evidence

What was decided, what was rejected, and who now owns the resulting commitment.

This layer answers: what decision was taken; what alternative was rejected; why it was chosen; who
owns the commitment that follows; what was left unresolved.

Contributes: decision; rejected alternative; rationale; named assignee; commitment; question left
unresolved.

Cannot alone establish: that the decision was carried out; that it is still in force; work identity.

**Decision Evidence is a kind of truth, not a communication channel.** A source contributes to this
layer because the evidence *records* a decision, never because of how the evidence was captured. A
meeting transcript, a Slack message (`Decision: ship option B.`), a Gmail reply (`Approved. Proceed
with vendor X.`), a GitHub comment (`We are choosing schema v2.`) and a recorded architecture decision
in Notion can each carry decision evidence. Asynchronous and written decisions are representable here;
a layer that excluded them would make most real decisions unrepresentable.

Candidate sources: any recorded evidence in which a decision is explicit. Meeting transcripts —
Google Meet, Zoom, Teams — are the only sources whose *primary* role is this layer; the others
contribute to it while belonging to their own layer. Naming a source here grants it no canonical
eligibility; the Provider Status Matrix is the only place eligibility is recorded, and it copies
`SOURCE_RECORD_V1_SEMANTICS.md` §4.

**A transcript is evidence; a decision is a derived claim.** Atra deriving a decision from a
transcript produces a candidate for human judgment, never a formalized decision. This layer never
gains automatic formalization authority. A single transcript may carry discussion, rejected
alternatives, an explicit decision and unresolved questions at once, and those contributions may land
in different layers.

### L5 — Time Constraint

When the work is needed, and how it collides with the user's finite time.

Contributes: meeting; deadline; time window; availability; temporal conflict; the why-now component of
priority.

Cannot alone establish: **work identity**. A calendar event is not the work; it is a constraint on it.
An event that mentions work is Time Constraint evidence about that work, not a member of it.

Candidate providers: Google Calendar, Outlook Calendar.

### L6 — User Current State

Where the *user* is, as distinct from where the *world* is.

Contributes: active work context; already-open resources; recently-read evidence; current WorkUnit;
position within a task; last interaction time.

Cannot alone establish: any external fact. Current state is a fact about the user's session, never
evidence about the work itself, and it may never be promoted into external evidence.

Explicit non-goals of this layer, standing: raw keystroke collection; continuous screen recording;
unrestricted browser-history ingestion. Nothing later in this series relaxes these.

### L7 — Action / Done

Closing the loop from understanding to a verified completed outcome.

Contributes: proposed action; human approval; execution result; verification that the work is done.

Cannot alone establish: work truth. An action result is evidence that Atra acted, not evidence that
the underlying work is complete — the two are separate facts and are reconciled, never equated.

Bounded by `docs/archive/v0/ATRA_DOCTRINE.md` §7 (what Atra must not do) and §11 (the product invariant): Atra proposes, rules guard, humans decide. Phase-1 is
read-only; no provider write path exists or is authorized here.

## Multi-Role Evidence

```text
SOURCE_MAY_CONTRIBUTE_TO_MULTIPLE_LAYERS
```

A layer is a semantic responsibility, not an exclusive owner of a provider, a resource or a field. One
source may contribute evidence to several layers at once. Each contribution keeps the same provenance
— the same provider object, the same identity, the same content scope — and is interpreted under the
receiving layer's rules.

A Slack message reading `PR #231 is blocked. We decided to use option B. Please fix it today.`
contributes to L2 Human Signal (a stated blocker, a request, stated urgency) and to L4 Decision
Evidence (option B selected, alternative rejected). It remains **one** source.

```text
MULTI_ROLE_IS_NOT_SOURCE_SPLITTING
```

Multi-role contribution never requires splitting a provider object into several fabricated
independent sources. One provider object is one `SourceRecordV1` candidate under §4, whatever number
of layers reads it, and a layer count is never a provider count: `PHASE1_VALUE_GATE_PROGRAM.md`'s
`N3` requires two **independent providers**, which one multi-role source does not supply.

## Cross-Layer Invariants

```text
I1  WORK_TRUTH_IS_NOT_HUMAN_SIGNAL
    A request to do work is not the work's existence, state or ownership.

I2  HUMAN_SIGNAL_IS_NOT_DECISION_EVIDENCE
    Discussion does not by itself prove that a decision was taken, however conclusive
    its wording. Evidence that explicitly records a decision does contribute Decision
    Evidence, whether it was written or spoken.

I3  DURABLE_CONTEXT_IS_NOT_DECISION_EVIDENCE
    A specification does not, merely by existing, record that a decision was taken.
    A specification that explicitly records an adopted decision does contribute
    Decision Evidence, and remains Durable Context.

I4  TIME_CONSTRAINT_IS_NOT_WORK_IDENTITY
    A calendar event constrains work; it never identifies it.

I5  USER_CURRENT_STATE_IS_NOT_EXTERNAL_EVIDENCE
    Session-local observation never becomes evidence about the world.

I6  ACTION_RESULT_IS_NOT_WORK_TRUTH
    That Atra acted is not that the work is done.

I7  EVIDENCE_IS_NOT_INFERRED_DECISION
    A decision is recorded, never inferred. Atra may not conclude that a decision was
    taken because discussion sounds conclusive; what it derives is a candidate for
    human judgment.
```

These invariants are consistent with, and subordinate to, the ratified P1-2 semantics `S1`–`S4` in
`PHASE1_VALUE_GATE_PROGRAM.md`, which govern wherever the two overlap. `S2` — related context is not
membership — is the closest related authority, and `I4`'s consequence that a calendar event mentioning
work is evidence about that work rather than a member of it is `S2` applied to L5.

The invariants are not restatements of `S2` and are not claimed to be. `S2` rules on membership in a
`CorrelationGroup`; `I4` rules on identity, and `I5` rules on whether a session-local observation may
become external evidence at all, which `S2` does not speak to. Where an invariant reaches past `S2` it
is a layer-specific semantic boundary recorded here, and it creates no Product Authority.

## Overlap Classification

Overlap is classified, never assumed to be waste. Two providers may carry the same field and still
answer different questions.

| Pair | Duplicated | Classification | What the second one adds |
| --- | --- | --- | --- |
| GitHub × Linear/Jira | work state, assignee | `COMPLEMENTARY` | implementation truth vs. organizational planning truth |
| Slack × Gmail | human communication | `COMPLEMENTARY` | internal high-frequency vs. external formal commitment |
| Notion × Google Drive | durable context | `COMPLEMENTARY` | structured knowledge vs. raw artifact |
| Slack × meeting transcript | human signal, decision evidence | `COMPLEMENTARY` | both may carry request, blocker and recorded decision; what differs is acquisition context — written and asynchronous vs. spoken and synchronous |
| Calendar × work-item due date | temporal hint | `COMPLEMENTARY` | work deadline vs. the user's actual schedule collision |
| GitHub issue × GitHub pull request | provider, repository | `COMPLEMENTARY` | request/state vs. implementation artifact — and two identity key spaces, per `SOURCE_RECORD_V1_SEMANTICS.md` §4.3 |

Classification is per shared layer role, not per provider. Under
`SOURCE_MAY_CONTRIBUTE_TO_MULTIPLE_LAYERS` a pair may overlap in more than one layer at once — Slack
and a meeting transcript overlap in both L2 and L4 — and the classification records what the second
source adds across the roles they share. A pair is never `ORTHOGONAL` merely because its two sources
are acquired differently; differing acquisition context is not a differing kind of truth.

No pair in this table is `REDUNDANT`. A pair that genuinely is redundant is a reason to drop one, and
none has been shown to be.

## Provider Status Matrix

**The `Canonical Eligibility` column originates nothing.** Every value in it falls into exactly one of
three cases, and which case applies is readable from the value itself:

```text
COPIED_FROM_AUTHORITY  `content=…`, `identity=…` and `both=…` values naming a state that
                       `SOURCE_RECORD_V1_SEMANTICS.md` §4 records for that namespace. These are
                       copies. A value here that disagrees with §4 is a defect in this document.

AUTHORITY_SILENT       `both=REQUIRED_UNPROVEN_UNRECORDED` — §4 enumerates no gate for this
                       namespace. This is this document's own label for that absence. It is not a
                       §4 value and must never be read as one.

NOT_A_SOURCE_LAYER     `NOT_A_CANONICAL_SOURCE` — this document's own classification of a layer
                       that is not a provider-evidence layer at all. Also not a §4 value.
```

The two local labels are restrictive, never permissive, and neither may be reached by widening a
copied value.

`REQUIRED_UNPROVEN_UNRECORDED` is **not weaker** than `REQUIRED_UNPROVEN`: the §4 obligation — a
reviewed identity profile and a reviewed content-scope profile before any record may be produced —
applies to it in full. Absence of a written gate is absence of a record, never absence of a
requirement. This document may not manufacture a §4 entry to remove the absence.

The `Layer` column names each namespace's **primary** layer — the kind of truth it most directly
answers. Under `SOURCE_MAY_CONTRIBUTE_TO_MULTIPLE_LAYERS` a source may contribute to further layers,
so the column is not an exclusive assignment. Eligibility does not vary by layer: a namespace has one
gate state under §4 however many layers read it.

Membership in the `SourceIdentityNamespace` vocabulary at `app/lib/domain/types.ts` is likewise not
eligibility. The vocabulary is a closed set of namespace names; a name existing there means a record
could not be misfiled under a widened namespace, not that any record may be produced.

| Namespace | Layer | Product Value | Canonical Eligibility (one of the three cases above) | Impl. Readiness | Daily-use Value | Unique contribution | Next decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `github_issue` | L1 | `HIGH` | `content=PROVEN` `identity=PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL` | `YES` — the one built path | `MEDIUM` | requested work, state, ownership | none; producing today |
| `github_pull_request` | L1 | `HIGH` | `content=PROVEN` `identity=PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL` | `YES` — the one built path | `MEDIUM` | implementation artifact and its review state | none; producing today |
| GitHub, other resources | L1 | `MEDIUM` | `both=REQUIRED_UNPROVEN` | `NO` — no reviewed profile | `LOW` | comment/review/commit granularity | a reviewed profile WorkUnit, if a phase needs it |
| `slack` | L2 | `HIGH` | `both=REQUIRED_UNPROVEN` | `NO` — no reviewed profile | `CRITICAL` | request, blocker, urgency, commitment | a reviewed profile WorkUnit |
| `gmail_message` | L2 | `HIGH` | `content=PROVEN` `identity=PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL` | `NO` — no acquisition path exists | `HIGH` | external formal commitment and deadline | none authorized; Gmail acquisition does not exist and needs a Product Authority decision |
| Gmail, other resources | L2 | `UNASSESSED` | `both=REQUIRED_UNPROVEN` | `NO` — no reviewed profile | `UNASSESSED` | thread, draft, label and attachment granularity | a reviewed profile WorkUnit, if a phase needs it |
| `notion` | L3 | `HIGH` | `both=REQUIRED_UNPROVEN_UNRECORDED` | `NO` — no reviewed profile | `HIGH` | goal, spec, done condition, rationale | a reviewed profile WorkUnit |
| `google_drive` | L3 | `MEDIUM` | `both=REQUIRED_UNPROVEN_UNRECORDED` | `NO` — no reviewed profile | `MEDIUM` | durable artifact evidence | a reviewed profile WorkUnit |
| `meeting_transcript` | L4 | `MEDIUM` | `both=REQUIRED_UNPROVEN_UNRECORDED` | `NO` — no reviewed profile | `HIGH` | decision, rejected alternative, commitment | a reviewed profile WorkUnit |
| `google_calendar` | L5 | `MEDIUM` | `both=REQUIRED_UNPROVEN` | `NO` — no reviewed profile | `HIGH` as context | temporal collision, why-now | a reviewed profile WorkUnit |
| `manual` | any | `LOW` | `both=REQUIRED_UNPROVEN_UNRECORDED` | `NO` — no reviewed profile | `LOW` | human-entered evidence of last resort | none |
| L6 signals | L6 | `HIGH` | `NOT_A_CANONICAL_SOURCE` | `NO` — no authorized concept exists | `HIGH` | the user's own position | PR-6 defines the boundary; no provider follows from it |
| L7 capability | L7 | `HIGH` | `NOT_A_CANONICAL_SOURCE` | `NO` — Phase-1 is read-only | `CRITICAL` at maturity | closes understanding into verified done | PR-7 defines the sequence; no write path follows from it |

`NOT_A_CANONICAL_SOURCE` records that the layer is not a provider-evidence layer at all — L6 observes
the user's own session and L7 produces outcomes. Neither is a candidate for `SourceRecordV1`, and
neither gains one by later work in this series.

`UNASSESSED` in a product column is this document's own label for **no recorded product judgment**,
and it is restrictive in the same way the two local eligibility labels are. An aggregate row standing
for every unreviewed resource of a provider at once has no one population a judgment could honestly be
about, and filling the cell anyway would manufacture product priority out of table shape. It is never
read as `LOW`, and a row leaves it only by a judgment recorded for a named resource.

The three `PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL` values are three **separately ratified**
resource-scoped exceptions — `SOURCE_RECORD_V1_SEMANTICS.md` §4.1 for `github_issue`, §4.2 for
`github_pull_request` and §4.4 for `gmail_message`. Each was ratified on its own resource's evidence,
and none of them is a template a fourth resource or provider may fill in. They are three exceptions,
not one precedent wearing three labels and not one exception extended to further resources: their
rejection and acceptance reasons are never merged, and §4.4 inherited neither §4.1 nor §4.2.

**A reviewed profile pair is not an acquisition capability.** `gmail_message` copies the same
eligibility pair as the two GitHub resources and its `Impl. Readiness` stays `NO`, because no Gmail
acquisition module, capture, transport or credential flow exists and none is authorized here. The
`YES` on the two GitHub rows records a path that is actually built; eligibility never produces one,
and a reviewed profile states what an acquisition would have to satisfy rather than permitting it.

## Historical V0 Product Compositions

These describe **product shape**, not sequence, and not entry conditions.

```text
COMPOSITIONS_ARE_NOT_ENTRY_CRITERIA
COMPOSITIONS_ARE_NOT_PHASE_ORDER
```

Within frozen V0, `PHASE1_VALUE_GATE_PROGRAM.md` owned phase order and the P1-2 entry criterion `N1`–`N4`. A composition
below may never be cited as a requirement: P1-2 entry needs **two independent providers**, and it does
not become harder because a composition names three layers.

| Composition | Layers | The user-visible claim it would make true |
| --- | --- | --- |
| `PHASE1_CORE` | L1 + L2 + L3 | fragmented real evidence about one piece of work becomes one correct WorkUnit |
| `DAILY_USE_ALPHA` | `PHASE1_CORE` + L4 + L5 | what, why, who decided, and when it collides with the day |
| `STRONG_ATRA` | `DAILY_USE_ALPHA` + L6 + L7 | world state plus user state produces the next responsible action, verified done |

## Daily-Use Test

For each layer: if it were absent for one week, what would materially degrade? A vague answer means
the layer is not yet justified.

The `One week absent` column states what this product would lose, and is a product judgment recorded
here. The `Differentiation hypothesis` column is something weaker, and is labelled accordingly.

```text
DIFFERENTIATION_HYPOTHESIS
```

Every value in the `Differentiation hypothesis` column is an **unvalidated product hypothesis**. None
of them is a user-research finding, a market fact, a competitive survey, a provider eligibility state
or Product Authority. No repository evidence supports or refutes any of them at this head, and no
decision may cite one as though it were established. They are recorded so that a later validation can
name what it set out to test, and so that a wrong one is visibly wrong.

| Layer | One week absent | Differentiation hypothesis |
| --- | --- | --- |
| L1 Work Truth | Atra cannot state what work exists or what state it is in | table stakes + formation advantage |
| L2 Human Signal | new requests and blockers never reach Atra at all | table stakes + formation advantage |
| L3 Durable Context | Atra knows the task and cannot state why it matters or when it is done | table stakes + formation advantage |
| L4 Decision Evidence | recorded decisions are invisible to every other layer | formation advantage |
| L5 Time Constraint | Atra ranks by importance with no knowledge of the user's actual day | formation advantage |
| L6 User Current State | Atra repeatedly proposes work the user already started | formation advantage + distinctive capability |
| L7 Action / Done | Atra prepares work forever and never closes it | formation advantage + distinctive capability |

The hypothesis this table exists to state, and which nothing here validates:

```text
HYPOTHESIS  L1–L3 are comparatively common integration surfaces, and L6 and L7 may offer
            stronger differentiation. Reconstructing the user's own position, and closing
            the loop under human judgment, is where this series expects the difference to
            be. UNVALIDATED — no competitor survey and no user research has been done.
```

This is deliberately weaker than a claim about what integration products in general do reach. A
universal statement about products nobody here has examined would need a competitive survey to stand
on, no such survey exists, and no evidence in this repository supports one.

## Historical V0 Sequencing Hypothesis

```text
INFORMATION_DIMENSION_OUTRANKS_PROVIDER_COUNT
```

A second provider in an already-represented layer ranks below a first provider in an unrepresented
layer, unless the second provider is load-bearing for a specific experiment. Today exactly one
exception was recorded in the frozen V0 authority, not here: P1-2 entry condition `N3`
requires two **independent** providers, so a second Human Signal or Durable Context provider is
load-bearing for P1-2 in a way a third L1 resource is not.

Integration count is not coverage. Coverage is the number of independent kinds of truth Atra can
reconstruct.

## Non-Goals

This document does not, and must not be read as doing, any of the following:

- selecting a provider for any layer, or committing to one;
- asserting, moving, widening or narrowing any provider profile gate;
- authorizing any acquisition module, provider call, credential flow or write path;
- declaring, authorizing or implying any canonical type, or expanding the canonical-record allowlist;
- starting P1-2, or changing `P1_2_ENTRY_STATUS`;
- establishing phase order, a Gate date, or a milestone;
- authorizing L6 collection of any kind, or L7 execution of any kind.

## Next Trigger

The next historical V0 document in this series — PR-1, the Work Truth layer — was written against this
vocabulary and authorizes nothing further. Any future implementation requires a separate current
product decision under `PRODUCT_STATE.md`; this research document supplies none.

At `3a2bf3cb` exactly zero layers meet all four.
