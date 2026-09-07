# RUN C001 — Ontology / Work Boundary Freeze

Recommended coding model: **GPT-5.6 Sol, High reasoning**.

You are the `ontology-schema` coding agent for Atra's classifier subsystem.

## Mandatory context
Work only on branch `codex/classifier-work-reconstruction`.
Before changing anything, read completely:
1. `AGENTS.md`
2. `docs/agents/classifier/ATRA_CLASSIFIER_MASTER_STATE.json`
3. `docs/agents/classifier/01_ONTOLOGY_SCHEMA_AGENT.md`
4. `docs/release/WHOLE_SYSTEM_VERIFICATION_2026-09-07.md`
5. `AI_JUDGMENT_CRITERIA.md`
6. `NODE_DECOMPOSITION_POLICY.md`

## Task
Execute **C001 only: Freeze classifier ontology + at least 20 boundary examples**.

The classifier must NOT be a whole-message Goal/Problem/Task classifier. Freeze the semantic layer and the work-identity relation layer separately.

Required semantic atom candidates to evaluate/finalize:
- goal
- problem
- task_request
- decision
- question
- constraint
- evidence_claim
- status_update
- context

Required work relation labels:
- SAME_WORK
- RELATED_DIFFERENT_WORK
- UNRELATED
- UNCERTAIN

## Central definition to make operational
`SAME_WORK` means the two pieces of evidence contribute to the **same independently trackable outcome/completion boundary**.
`RELATED_DIFFERENT_WORK` means they are contextually related but can be completed, owned, verified, or closed independently.

Do not accept vague definitions. For each label, define:
- positive criteria
- negative criteria
- ambiguity criteria
- at least 5 counterexamples

Create >=20 total boundary examples, including:
- same words / different work
- different words / same work
- same goal / multiple independent tasks
- one source containing multiple work items
- Japanese-only
- English-only
- Japanese/English mixed
- code + natural language
- cancelled/reopened/superseded work
- conflicting evidence
- meeting note bridging several unrelated tasks
- same actor/repo/component but separate incidents

## Required output
Produce a classifier ontology specification under `docs/architecture/classifier/` that is explicit enough for two human annotators to independently label the same examples.

Do not implement C002 schemas yet except for tiny illustrative pseudo-shapes if needed to explain ontology.

## State protocol
Claim C001 in `ATRA_CLASSIFIER_MASTER_STATE.json` before implementation, using the state lock. On completion, attach factual evidence and move C001 to `REVIEW`, not `DONE`. Update current_handoff and release the lock.

## Hard boundaries
No merge, deploy, Issue close, live provider write, remote D1 mutation, or autonomous external execution. Do not modify unrelated runtime behavior.

## Final response
Return exactly:
- Goal
- Current State
- Decisions
- Files Changed
- Validation
- Remaining Risks
- Recommended Next Action
