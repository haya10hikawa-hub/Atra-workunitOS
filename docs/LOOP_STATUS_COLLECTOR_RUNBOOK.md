# Loop Status Collector Runbook

## 1. Purpose

The loop status collector reduces manual copy/paste work in the development
loop. It collects local git status, changed paths, branch and head commit,
optional read-only PR metadata and PR checks, and optional approved
validation results, and produces a structured Markdown report and JSON
summary for the human reviewer.

The collector is local developer tooling.
The collector supports human review. It does not replace human review.
It does not make Go / No-Go decisions by itself. It produces a candidate
summary only.

Product invariant: AI proposes. Rules guard. Humans decide.
Loop engineering invariant: Automation collects. Rules classify. Humans decide.

## 2. Scope

In scope:

- `scripts/loop/safeCommandPolicy.mts` — deny-by-default safe command policy
- `scripts/loop/loopStatusCollector.mts` — status collection with injected runner
- `scripts/loop/loopReportFormatter.mts` — Markdown and JSON report formatting
- `scripts/loop/index.mts` — CLI entrypoint
- `tests/loopStatusCollector.test.mts` — tests with fake command runners

Out of scope: everything else. The collector does not modify Atra runtime,
app code, UI, Electron, package dependencies, workflows, migrations, database
implementation, API routes, or storage backends.

## 3. What the Collector Does

- Collects local git status (`git status --short`).
- Collects current branch (`git branch --show-current`).
- Collects head commit (`git rev-parse HEAD`).
- Collects changed paths (`git diff --name-only HEAD`).
- Optionally collects PR metadata via read-only `gh pr view`.
- Optionally collects PR checks via read-only `gh pr checks`.
- Optionally runs the approved validation command set.
- Records exit codes and truncated, redacted stdout/stderr snippets.
- Produces a structured Markdown report and a JSON summary.
- Refuses dangerous commands via the deny-by-default safe command policy.

## 4. What the Collector Does Not Do

The collector does not modify Atra runtime.
The collector does not mutate GitHub state.
The collector does not merge PRs.
The collector does not push.
The collector does not deploy.
The collector does not publish.
The collector does not create tags.
The collector does not create releases.
The collector does not upload artifacts.

It also never stages files, never commits, never mutates git state, never
calls product runtime, never calls D1, never executes SQL, never calls an
LLM, never calls ApprovalStore, never wires P7.1 TSP utilities, and never
executes external actions.

## 5. Safe Command Policy

The policy in `scripts/loop/safeCommandPolicy.mts` is deny-by-default:

- Only exact configured command specs may run, identified by
  `SafeCommandName`. Arbitrary shell strings are never accepted.
- Commands run as spawn/execFile-style argv arrays without a shell
  (`shell: false`); no `shell=true` anywhere.
- The only permitted extra argument is a numeric PR number for the two
  read-only gh commands.
- `FORBIDDEN_COMMAND_PATTERNS` rejects any command line containing merge,
  push, tag, release, deploy, publish, upload, destructive git, SQL
  mutation, d1 execute, external action, or ApprovalStore write patterns —
  defense in depth on top of the allowlist.
- `assertCommandAllowed` is re-checked at execution time inside the
  collector.

## 6. CLI Usage

No package script is added. Run directly with node:

```
node --experimental-strip-types scripts/loop/index.mts \
  --phase P6-I0 \
  --pr 87 \
  --out .loop-reports/p6-i0.md \
  --json .loop-reports/p6-i0.json
```

Flags:

- `--phase <phase_id>` — required loop/phase identifier.
- `--pr <number>` — optional; enables read-only PR context collection.
- `--run-validation` — optional; runs the approved validation command set.
- `--out <markdown_path>` — optional; writes the Markdown report.
- `--json <json_path>` — optional; writes the JSON summary.
- `--max-snippet-chars <number>` — optional; snippet truncation limit.

Without `--out`/`--json`, the Markdown report prints to stdout.

Run the CLI from the repository root. Output paths are confined to the
current working directory, so invoking it elsewhere would anchor the output
path guard to the wrong directory.

Report files must stay untracked. Do not stage or commit `.loop-reports/`
output; keep report directories ignored or untracked.

## 7. Report Outputs

The Markdown report contains exactly these sections:

1. Loop Summary
2. Dependency / PR Context
3. Git Context
4. Changed Paths
5. Validation Commands
6. PR Checks
7. Candidate Risks
8. Human Review Required
9. Non-authorization Statement
10. Candidate Go / No-Go Assistance

The JSON summary mirrors the collected data, includes
`candidateStatus`, and pins `isHumanApproval`, `isCiApproval`, and
`isMergeApproval` to `false`.

The candidate status is one of `candidate_go_assistance`,
`candidate_no_go_assistance`, or `candidate_insufficient_data`. The report
never claims a final Go.

## 8. Validation Mode

With `--run-validation`, the collector runs the approved validation set in
order:

- `npm test`
- `npm run alpha:safety-gate`
- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run electron:build:check`
- `git diff --check`

Command failures are recorded in the report; they never abort collection.
Validation is skipped entirely unless `--run-validation` is passed.

## 9. PR Context Mode

With `--pr <number>`, the collector runs read-only:

- `gh pr view <number> --json number,title,state,mergeable,mergeStateStatus,url,headRefName,baseRefName`
- `gh pr checks <number>`

No gh mutation command (`merge`, `close`, `edit`, `create`, `release`) is
ever allowed by the policy.

## 10. Redaction and Snippet Policy

All stdout/stderr is passed through a redaction filter before entering a
report. The filter masks likely secret-like values: GitHub tokens, API keys,
AWS access key ids, Authorization/Bearer headers, `token=`/`secret=`/
`password=`/`api_key=`-style assignments, and long high-entropy hex blobs.
Snippets are then truncated to `--max-snippet-chars` (default 4000) with an
explicit truncation marker. Reports must never contain secrets.

## 11. Human Review Boundary

The collector supports the human reviewer and must not replace human
review. It may produce `candidate_go_assistance` or
`candidate_no_go_assistance` only. It must never output a final Go. Every
report states:

This report is not human approval.
This report is not CI approval.
This report is not merge approval.
A human reviewer must make the final Go / No-Go decision.

## 12. Stop Conditions

Stop using the collector and escalate to a human if:

- the safe command policy rejects a command the loop expected to run
- a report would contain unredacted secret-like output
- any output suggests git or GitHub state was mutated
- the tool is asked to merge, push, deploy, publish, tag, release, or upload
- changed paths include forbidden paths (app/, electron/, package.json,
  migrations/, .github/workflows/)

In all stop cases: do not proceed, report No-Go candidate assistance, and
hand the decision to a human reviewer.

## 13. Non-authorization Statement

The collector is local developer tooling only.
The collector is not human approval.
The collector is not CI approval.
The collector is not merge approval.
It authorizes no merge, no push, no deploy, no publish, no release, no tag,
no artifact upload, no runtime change, and no product behavior change.
A human reviewer must make the final Go / No-Go decision.
