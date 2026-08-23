# Documentation Index

This directory is the shared operating manual for the Gold Set Annotation Platform.

Read order for new implementation agents:

1. `CONTEXT.md` - why this project exists and what was decided before coding.
2. `DESIGN.md` - canonical architecture, schemas, boundaries, and evaluation rules.
3. `LABEL_GUIDELINES.md` - how humans decide `SAME_WORK`, `RELATED`, `DIFFERENT_WORK`, and `UNKNOWN`.
4. `SOURCE_PLAN.md` - how each source family enters the canonical data model.
5. `SAMPLING_AND_QA.md` - how to create balanced candidates, hard negatives, blind annotation, and adjudication.
6. `MVP_PLAN.md` - implementation order and completion criteria.
7. `OPEN_DECISIONS.md` - choices that must be resolved and recorded as ADRs.
8. `DEVELOPMENT_START.md` - model plan, implementation prompts, and first-run checklist.
9. `BEYOND_MVP_ROADMAP.md` - production-readiness roadmap so work does not stop at MVP.
10. `LOOP_ENGINEERING.md` - build, verify, fix, reverify, advance, and three-stage execution loop for agent coding.
11. `BRIDGE_AUTOMATION.md` - bridge role that converts the latest agent report into the next prompt.
12. `PRODUCTION_BUILD_PLAN.md` - complete implementation ledger for the real-data-to-export Gold production line.
13. `MASTER_BUILD_PROMPT.md` - one execution prompt for building, verifying, fixing, and advancing through the whole platform without routine pauses.
14. `PRODUCTION_BUILD_STATUS.md` - resumable machine-readable phase status and external blocker evidence.

When a decision changes behavior or public contracts, add an ADR under `docs/adr/`.
