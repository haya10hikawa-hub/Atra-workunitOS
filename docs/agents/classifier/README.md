# Atra Classifier Coding Agents

These agents are development roles for the classifier subsystem. They are separate from Atra runtime/product agents.

## Organization

1. `classifier-chief` — owns shared state, sequencing, handoffs, conflict resolution.
2. `ontology-schema` — freezes ontology, canonical JSON/TypeScript contracts, annotation guide.
3. `model-infra` — AWS/vLLM gateway, structured-output benchmark harness, atom extraction baseline.
4. `retrieval-rerank` — explicit refs + lexical + dense retrieval + reranking.
5. `relation-grouping` — 4-way relation judge, deterministic constraint gate, CorrelationGroup and WorkUnit formation.
6. `golden-eval` — bilingual episode Golden Set, metrics, leakage prevention, fine-tune decision evidence.
7. `classifier-redteam` — independent counterexample/security reviewer; must not be the primary implementer of the item it approves.

Every agent must read repository `AGENTS.md`, `ATRA_CLASSIFIER_MASTER_STATE.json`, `AI_JUDGMENT_CRITERIA.md`, `NODE_DECOMPOSITION_POLICY.md`, and the current verification handoff before work.

Authoritative progress is `ATRA_CLASSIFIER_MASTER_STATE.json`. Code can be parallel; writes to that state file are serialized by `state_lock`.
