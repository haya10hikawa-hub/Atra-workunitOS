# Canonical Decision Index

## 1. Source-of-Truth Hierarchy

Lower-level documents must follow higher-level documents.

```txt
Level 0: Product Doctrine
Level 1: Safety / AI Judgment Constitution
Level 2: Node Decomposition Policy
Level 3: Alpha PM Decisions
Level 4: Phase Plans
Level 5: UI Direction
```

## 2. Product Identity

Atra / WorkUnit OS is a work OS.

It is not:

- a notification tool
- a task list
- an AI chat app
- a dashboard-first analytics product
- an external automation launcher

The product principle is:

```txt
Manage by Node.
Work through Action Field.
Return to source through StartHub.
```

Atra exists to automate the pre-processing required before responsible work can begin. It compresses, structures, and workifies scattered information while keeping human judgment, approval, and execution responsibility explicit.

Atra must not black-box the judgment process. If the user remains responsible for the result, the product must expose source, evidence, missing fields, next action, and approval boundaries before work moves forward.

## 3. Canonical UI Direction

The accepted UI direction is the attached WorkUnit OS / Atra image set.

Canonical surfaces:

- `WorkUnit Launcher`: command/search overlay for finding and opening WorkUnits.
- `WorkUnit Graph`: dotted workspace with connected WorkUnit Nodes.
- `Action Field`: right-side work surface attached to the selected Node.
- `StartHub`: keyboard-first navigation layer for jumping from a WorkUnit to primary source or destination context.
- `Command Palette`: navigation and command discovery only.
- `Safety Protocol`, `Finalization Queue`, `System Logs`: status and audit surfaces.

Canonical interaction:

```txt
WorkUnit Launcher
  -> open WorkUnit
  -> WorkUnit Graph
  -> select Node
  -> Action Field
  -> StartHub source jump when primary context is needed
```

The Action Field may show editable drafts, linked context, local edits, and safe status. It must not become an execution surface.

StartHub must make source tools faster to reach. It must not hide, replace, or summarize away the primary source of truth.

## 4. UI Terms

Use:

- WorkUnit Launcher
- WorkUnit Graph
- WorkUnit Node
- Action Field
- StartHub
- Command Palette
- Tool Pin
- Preview
- Approval
- Dry-run

Avoid as product terms:

- Dashboard
- Inbox-first UI
- three-pane dashboard
- WorkUnit Explorer
- Decomposition / Judgment Console
- Action Field Entry
- Evidence Capsule
- Readiness Gates
- Decision Trace
- Studio
- Hopper UI

`dashboard` may remain only in implementation file names, legacy paths, API helper names, or historical notes. It must not be described as the canonical product UI.

## 5. StartHub Boundary

StartHub is the WorkUnit-attached navigation layer that lets the user jump from a WorkUnit to its primary source or destination context, such as Slack thread, GitHub issue, Calendar event, Gmail thread, or document, using fast keyboard-first access.

StartHub can:

- expose source references attached to a WorkUnit
- navigate to the primary source tool
- navigate to a destination tool after preview / approval / dry-run state is clear
- show safe metadata for a source or destination
- reduce manual copy/paste between tools

StartHub must not:

- execute external actions
- approve an action
- convert navigation into execution
- hide source context behind an AI summary
- treat a source jump as evidence of review
- create a new source-of-truth silo

Canonical StartHub rule:

```txt
Atra is the place where scattered work is started, structured, and routed back to the right tool with context intact.
```

## 6. AI Authority Boundary

AI can:

- create candidates
- summarize sanitized context
- draft editable text
- suggest missing fields
- suggest Merge Candidate / Split Candidate
- suggest Evidence / Subtask / Noise classification
- produce critic comments

AI must not:

- finalize Formal Node
- finalize merge
- finalize split
- approve
- execute
- decide tenant, user, role, target, approvalId, or hash
- treat Vector, Cache, or Graph output as final authority

Humans make final decisions.

## 7. P0 Boundary

P0 tolerance is `0`.

Canonical P0 list:

```txt
AI finalized Formal Node
AI finalized merge
AI finalized split
AI approved
AI executed
Pending exposed Draft / Preview / Approval / Execution
Tool Pin looked executable
approvalId/hash entered AI context
Vector finalized merge
Cache authorized approval
DoneCondition complete treated as done
AI verifier accepted
sourceRef-less Formal Node accepted
```

P0 failures are not tuning data. They return to Rule, block, and regression tests.

## 8. Node Decomposition Terms

Use:

- Formal Node candidate
- Pending Node
- Evidence candidate
- Subtask candidate
- Noise
- Merge Candidate
- Split Candidate
- AI Silent Processing Event candidate
- Human Review

Avoid:

- Formal Node as direct AI output
- merged unless Human Review has approved
- finalized split unless Human Review has approved
- approved/executed as AI state

## 9. Preview / Approval / Execution

Preview means a non-executing view of proposed action content.

Approval means human/server approval boundary. It is not execution.

Dry-run means verification. It is not execution.

Execution remains outside current UI direction and must never be triggered from WorkUnit Launcher, WorkUnit Graph, Command Palette, Tool Pin, StartHub, or editable Action Field text.

## 10. Vector / Cache

Vector retrieval can suggest candidates only.

Cache can display prior information only.

Neither Vector nor Cache can approve, merge, execute, finalize, or provide approval evidence.

## 11. Current Implementation Naming

Some current modules still contain `dashboard` in their file names. Those names are implementation history, not product direction.

Do not rename code solely for terminology cleanup. New product documentation should use canonical UI terms from this index.
