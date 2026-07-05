# Loop-I0 Automation Signoff

## 1. Signoff Statement

Loop-I0 has explicit human Go for local developer-tooling automation.

This signoff authorizes the creation of a local, non-mutating loop status
collector and report generator under `scripts/loop/`. It authorizes nothing
else.

## 2. What the Tool May Do

- The tool may collect local git status.
- The tool may run read-only gh commands.
- The tool may optionally run approved validation commands.
- The tool may generate Markdown and JSON reports.

## 3. What the Tool Must Not Do

- The tool must not mutate GitHub state.
- The tool must not merge PRs.
- The tool must not push.
- The tool must not deploy.
- The tool must not publish.
- The tool must not create releases or tags.
- The tool must not upload artifacts.
- The tool must not modify app runtime.

## 4. What This Tool Is Not

- The tool is not human approval.
- The tool is not CI approval.
- The tool is not merge approval.
- The tool is only a local assistant for loop reporting.

## 5. Invariants

Product invariant:

AI proposes. Rules guard. Humans decide.

Loop engineering invariant:

Automation collects. Rules classify. Humans decide.

## 6. Scope Boundary

This signoff covers Loop-I0 only. It does not authorize:

- runtime product code
- runtime query planner
- runtime NL2SQL
- runtime SQL compiler
- runtime D1 execution
- runtime LLM or real LLM provider code
- GraphRAG or vector storage
- ApprovalStore integration
- P7.1 TSP utility wiring
- external action execution
- deployment automation
- merge automation
- release automation
- GitHub mutation automation

## 7. Non-authorization Statement

This document records a human Go for local developer tooling only. It is not
CI approval, not merge approval, not release approval, and not product runtime
authorization. A human reviewer must make the final Go / No-Go decision for
any change this tooling reports on.
