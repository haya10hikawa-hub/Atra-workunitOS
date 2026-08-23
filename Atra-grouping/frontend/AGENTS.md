# Frontend Agent Rules

Read `../AGENTS.md` and `../docs/DESIGN.md` first. Build an evidence-first, keyboard-accessible annotation interface. The backend remains authoritative for workflow and validation.

## Annotation screen

- Show anchor and candidate symmetrically with provider, record type, title/text, precise source location, and enough surrounding context.
- Visually distinguish quoted original evidence from derived summaries/translations.
- Offer all relation labels: `SAME_WORK`, `RELATED`, `DIFFERENT_WORK`, `UNKNOWN`.
- Offer all work types for both sides: `INITIATIVE`, `PROJECT`, `TASK`, `SUBTASK`, `MILESTONE`, `NOT_WORK`, `UNKNOWN`.
- Support evidence-span selection, reason codes, confidence, notes, autosave, resume, and explicit submit.
- Explain the completion-unit test inline; make `UNKNOWN` easy to choose when evidence is insufficient.

## Blindness and safety

Never render or fetch model score, rank, sampling bucket/reason, predicted label, peer annotation, or Gold/adjudication result during independent annotation. Do not infer them through ordering, color, badges, or default selection. Randomization must not change the stable pair identity.

## Adjudication screen

The adjudicator first reviews evidence independently. Only then reveal the two annotations for comparison. Require a final label and written decision reason; preserve the audit trail.

## Required checks

- keyboard-only completion, focus order, accessible names, contrast, and screen-reader semantics
- no default relation/work-type selection
- narrow/wide viewport behavior and long-text handling
- autosave/retry without duplicate submissions
- UI contract test proving blinded fields never enter annotation responses or analytics
