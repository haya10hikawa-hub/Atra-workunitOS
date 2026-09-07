# Docs Consistency Audit

## 1. Scope

Scanned 44 repository Markdown files, excluding generated output and dependencies.

Primary audit targets:

- product identity
- UI direction
- AI authority boundary
- P0 safety list
- Node decomposition terminology
- phase scope
- legacy wording

## 2. Canonical Decision

The accepted UI direction is:

```txt
WorkUnit Launcher
  -> WorkUnit Graph
  -> selected WorkUnit Node
  -> Action Field
```

Dashboard / Inbox / three-pane console wording is not canonical product direction. It may remain only as implementation naming or legacy context.

## 3. Contradiction Matrix

| conflict | files affected | canonical decision | fix applied | remaining risk |
|---|---|---|---|---|
| Dashboard described as canonical UI | `docs/CONTEXT_INDEX.md`, `docs/DIRECTORY_STRUCTURE.md`, `docs/DEPENDENCY_MAP.md`, `docs/architecture/SAAS_ARCHITECTURE.md`, `docs/archive/v0/ACTION_FIELD_SPEC.md`, `docs/archive/v0/MVP_USECASE_SPEC.md`, `app/components/workunit-os/adopted/README.md` | Product UI is WorkUnit Launcher + WorkUnit Graph + Action Field | Reworded to implementation/legacy naming and removed official dashboard claims | Code paths still contain `dashboard` names until future rename |
| Old three-pane UI presented as target | `docs/archive/v0/ACTION_FIELD_SPEC.md`, `docs/archive/v0/MVP_USECASE_SPEC.md`, `docs/architecture/SAAS_ARCHITECTURE.md` | Graph workspace plus right Action Field is canonical | Replaced with image-aligned UI direction | Existing app may still render older shell until implementation catches up |
| Inbox-first / Studio / Hopper UI as product UI | `docs/archive/v0/WORKUNIT_OS_OVERVIEW.md`, `docs/research/HOPPER_VECTOR_ALGORITHM.md`, `AGENTS.md` | Launcher is entry surface; Hopper/Inbox/Studio are not canonical UI | Replaced UI-facing behavior terms with Launcher/Graph/Action Field or `open / defer / archive`; kept Hopper only as upstream algorithm/history | Research docs still use Hopper as algorithm/history |
| Short P0 lists | `docs/archive/v0/NODE_DECOMPOSITION_POLICY.md`, `docs/archive/v0/NODE_DECOMPOSITION_WHITEBOARD.md` | Use the canonical 13-item P0 list | Expanded to full canonical P0 list | Future docs may reintroduce shorter lists |
| Approval auto-approval wording | `docs/specs/API_CONTRACT.md` | Approval requires explicit authorized human/server action; no implicit auto-approval | Replaced auto-approval with explicit approval decision | Future API design still needs endpoint-level wording review before execution phase |
| Command Palette / graph execution risk | `docs/archive/v0/AI_JUDGMENT_CRITERIA.md`, canonical index | Navigation surfaces must not execute | Reworded Mind Map to WorkUnit Graph and kept execution ban | None |
| Tool Pin ambiguity | canonical index, Node policy docs | Tool Pin is context/display only | Reaffirmed in canonical index and P0 list | UI implementation must enforce non-executable affordance |

## 4. Fixed Product Principles

```txt
Manage by Node.
Work through Action Field.
AI creates candidates.
Humans make final decisions.
AI decomposes by default.
Human review is exceptional.
Pending Node must not become user homework.
Pending Node is mostly AI-side processing state.
AI must not approve.
AI must not execute.
AI must not finalize Formal Node.
AI must not finalize merge.
AI must not finalize split.
P0 tolerance = 0.
```

## 5. Files Scanned

Repository Markdown files under:

- root docs
- `docs/**`
- `app/**/README.md`
- `prototypes/**/README.md`
- `public/**/SOURCES.md`

Generated output and dependency docs under `.open-next/**` and `node_modules/**` are excluded from the consistency source of truth.

## 6. Remaining Ambiguities

- Current code names still use `dashboard`; docs now treat this as implementation naming only.
- External execution API design exists as planned/future surface, but current product UI must not expose execution-like controls.
- Research docs may keep `Hopper` terminology when discussing algorithms, not canonical UI.

## 7. Audit Result

Docs are aligned enough for the next documentation-to-implementation planning step, with one caveat: implementation names still lag behind canonical UI terminology.
