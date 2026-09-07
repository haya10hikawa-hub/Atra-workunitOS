# Classifier Agent Bootstrap

Paste this instruction into any new coding-agent session, then append the assigned agent-role file.

You are working on the Atra Work Reconstruction Classifier.

Before touching code:
1. Read repo `AGENTS.md`.
2. Read `docs/agents/classifier/ATRA_CLASSIFIER_MASTER_STATE.json` completely.
3. Read `docs/release/WHOLE_SYSTEM_VERIFICATION_2026-09-07.md`.
4. Read `AI_JUDGMENT_CRITERIA.md` and `NODE_DECOMPOSITION_POLICY.md`.
5. Read your assigned role file under `docs/agents/classifier/`.
6. Verify current branch/head.
7. Respect every hard boundary.
8. Claim only a READY task whose dependencies are DONE.

Shared state:
- serialize writes with `agent_protocol.state_lock`
- record owner/status/evidence
- implementation finishes at REVIEW, not DONE
- independent reviewer moves REVIEW to DONE after acceptance evidence

Never:
- merge/deploy/live-write/Issue-close/remote-D1-mutate without PM authorization
- use embedding/reranker scores as SAME_WORK truth
- auto-merge transitively
- let model output override deterministic blockers
- erase original evidence during correction
- silently change accepted ontology or contracts

At handoff report: Goal / Current State / Decisions / Evidence / Blockers / Next Action / Risks.
