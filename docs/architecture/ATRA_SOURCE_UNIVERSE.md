# Atra Source Universe — information layers and daily-use composition

Status: Subordinate product-domain reference. Not a roadmap, not a phase plan, not a gate.

Base: `main` `3a2bf3cbbffd304d7db4a0eb5a7d5058ae2d3402`

Execution boundary: documentation only. This record changes no `app/**` file, no `scripts/**` file, no
migration, no runtime configuration, no provider and no UI. It authorizes no implementation WorkUnit,
expands no allowlist, and moves no provider gate.

```text
RUNTIME_IMPLEMENTATION = 0
IMPLEMENTATION_NEXT    = NO
REASON                 = this record establishes vocabulary, not capability; every provider route
                         still requires its own reviewed profile WorkUnit, and P1-2 entry is
                         NOT_READY under the Product Authority
```

## Authority Position

```text
Human PM
  ↓
docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md      product priority, phase order, Gates
  ├─ docs/architecture/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md   domain architecture
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
- Implementation readiness is the only axis that is ever a permission, and it is granted by the
  Product Authority, never inferred from the other three.

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

What was actually decided in synchronous communication, where the decision leaves no written trace
anywhere else.

Contributes: decision; rejected alternative; rationale; named assignee; commitment; question left
unresolved.

Cannot alone establish: that the decision was carried out; that it is still in force; work identity.

Candidate providers: Google Meet, Zoom, Teams transcripts.

**A transcript is evidence; a decision is a derived claim.** Atra deriving a decision from a
transcript produces a candidate for human judgment, never a formalized decision. This layer never
gains automatic formalization authority.

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

Bounded by `ATRA_DOCTRINE.md` §7 and §11: Atra proposes, rules guard, humans decide. Phase-1 is
read-only; no provider write path exists or is authorized here.

## Cross-Layer Invariants

```text
I1  WORK_TRUTH_IS_NOT_HUMAN_SIGNAL
    A request to do work is not the work's existence, state or ownership.

I2  HUMAN_SIGNAL_IS_NOT_DECISION_EVIDENCE
    Asynchronous discussion is not a decision, however conclusive its wording.

I3  DURABLE_CONTEXT_IS_NOT_DECISION_EVIDENCE
    A written specification states intent; it does not record that a decision was taken.

I4  TIME_CONSTRAINT_IS_NOT_WORK_IDENTITY
    A calendar event constrains work; it never identifies it.

I5  USER_CURRENT_STATE_IS_NOT_EXTERNAL_EVIDENCE
    Session-local observation never becomes evidence about the world.

I6  ACTION_RESULT_IS_NOT_WORK_TRUTH
    That Atra acted is not that the work is done.
```

These invariants are consistent with, and subordinate to, the ratified P1-2 semantics `S1`–`S4` in
`PHASE1_VALUE_GATE_PROGRAM.md`. In particular `S2` — related context is not membership — is the
general form of `I4` and `I5`, and this document adds nothing to it.

## Overlap Classification

Overlap is classified, never assumed to be waste. Two providers may carry the same field and still
answer different questions.

| Pair | Duplicated | Classification | What the second one adds |
| --- | --- | --- | --- |
| GitHub × Linear/Jira | work state, assignee | `COMPLEMENTARY` | implementation truth vs. organizational planning truth |
| Slack × Gmail | human communication | `COMPLEMENTARY` | internal high-frequency vs. external formal commitment |
| Notion × Google Drive | durable context | `COMPLEMENTARY` | structured knowledge vs. raw artifact |
| Slack × meeting transcript | participants, topic | `ORTHOGONAL` | asynchronous discussion vs. synchronous decision evidence |
| Calendar × work-item due date | temporal hint | `COMPLEMENTARY` | work deadline vs. the user's actual schedule collision |
| GitHub issue × GitHub pull request | provider, repository | `COMPLEMENTARY` | request/state vs. implementation artifact — and two identity key spaces, per `SOURCE_RECORD_V1_SEMANTICS.md` §4.3 |

No pair in this table is `REDUNDANT`. A pair that genuinely is redundant is a reason to drop one, and
none has been shown to be.

## Provider Status Matrix

**The `Canonical Eligibility` column is a copy of `SOURCE_RECORD_V1_SEMANTICS.md` §4 and originates
nothing.** A value here that disagrees with §4 is a defect in this document.

`REQUIRED_UNPROVEN_UNRECORDED` is this document's descriptive label for "§4 enumerates no gate for
this namespace". It is **not weaker** than `REQUIRED_UNPROVEN`: the §4 obligation — a reviewed
identity profile and a reviewed content-scope profile before any record may be produced — applies to
it in full. Absence of a written gate is absence of a record, never absence of a requirement.

Membership in the `SourceIdentityNamespace` vocabulary at `app/lib/domain/types.ts` is likewise not
eligibility. The vocabulary is a closed set of namespace names; a name existing there means a record
could not be misfiled under a widened namespace, not that any record may be produced.

| Namespace | Layer | Product Value | Canonical Eligibility (copied from §4) | Impl. Readiness | Daily-use Value | Unique contribution | Next decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `github_issue` | L1 | `HIGH` | `content=PROVEN` `identity=PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL` | `YES` — the one built path | `MEDIUM` | requested work, state, ownership | none; producing today |
| `github_pull_request` | L1 | `HIGH` | `content=PROVEN` `identity=PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL` | `YES` — the one built path | `MEDIUM` | implementation artifact and its review state | none; producing today |
| GitHub, other resources | L1 | `MEDIUM` | `both=REQUIRED_UNPROVEN` | `NO` — no reviewed profile | `LOW` | comment/review/commit granularity | a reviewed profile WorkUnit, if a phase needs it |
| `slack` | L2 | `HIGH` | `both=REQUIRED_UNPROVEN` | `NO` — no reviewed profile | `CRITICAL` | request, blocker, urgency, commitment | a reviewed profile WorkUnit |
| `gmail` | L2 | `HIGH` | `both=REQUIRED_UNPROVEN_UNRECORDED` | `NO` — no reviewed profile | `HIGH` | external formal commitment and deadline | a reviewed profile WorkUnit |
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

The two `PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL` values are two **separately ratified**
resource-scoped exceptions, `SOURCE_RECORD_V1_SEMANTICS.md` §4.1 and §4.2. Neither is a template a
third resource or provider may fill in, and their rejection and acceptance reasons are never merged.

## Product Compositions

These describe **product shape**, not sequence, and not entry conditions.

```text
COMPOSITIONS_ARE_NOT_ENTRY_CRITERIA
COMPOSITIONS_ARE_NOT_PHASE_ORDER
```

`PHASE1_VALUE_GATE_PROGRAM.md` owns phase order and the P1-2 entry criterion `N1`–`N4`. A composition
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

| Layer | One week absent | Differentiation |
| --- | --- | --- |
| L1 Work Truth | Atra cannot state what work exists or what state it is in | table stakes + formation advantage |
| L2 Human Signal | new requests and blockers never reach Atra at all | table stakes + formation advantage |
| L3 Durable Context | Atra knows the task and cannot state why it matters or when it is done | table stakes + formation advantage |
| L4 Decision Evidence | decisions taken in meetings are invisible to every other layer | formation advantage |
| L5 Time Constraint | Atra ranks by importance with no knowledge of the user's actual day | formation advantage |
| L6 User Current State | Atra repeatedly proposes work the user already started | formation advantage + distinctive capability |
| L7 Action / Done | Atra prepares work forever and never closes it | formation advantage + distinctive capability |

Two layers are classified as distinctive rather than table stakes: L6 and L7. Every integration
product reaches L1–L3. Reconstructing the user's own position, and closing the loop under human
judgment, is what the rest of this series exists to specify.

## Sequencing Principle

```text
INFORMATION_DIMENSION_OUTRANKS_PROVIDER_COUNT
```

A second provider in an already-represented layer ranks below a first provider in an unrepresented
layer, unless the second provider is load-bearing for a specific experiment. Today exactly one
exception is in force and it is recorded in the Product Authority, not here: P1-2 entry condition `N3`
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

The next document in this series — PR-1, the Work Truth layer — is written against this vocabulary and
authorizes nothing further. **Implementation of any layer** requires all four of: a clear product role
recorded here; a reviewed provider profile pair under `SOURCE_RECORD_V1_SEMANTICS.md` §4; a Product
Authority phase that permits it; and a bounded definition of done in the WorkUnit that implements it.

At `3a2bf3cb` exactly zero layers meet all four.
