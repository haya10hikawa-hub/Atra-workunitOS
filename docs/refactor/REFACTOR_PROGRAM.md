# Refactor Program — Large-SaaS Foundation

## Base and baseline (recorded 2026-07-19)

- `origin/main` @ `0b20218d593dd0978cac69026dd15c79184a149d`
- Root branch: `refactor/large-saas-foundation` (isolated worktree, clean).
- Unmerged PR dependencies (recorded, NOT cherry-picked; base stays
  independent): #174 (WorkUnit formation plan), #173 (Goal/Done UX contract),
  #172 (D1 operational contract — owned by a concurrently running session),
  #139 (Claude workflow), #114 (Smart Tab strategy), #53 (redteam hardening).
  If one of these merges mid-program, affected workstreams rebase the root
  branch forward explicitly — never silently.

Baseline gates on the base SHA (all green):

| Gate | Result |
|---|---|
| `npm test` | 4591 tests: 4590 pass, 0 fail, 1 skip (~14 s, deterministic across runs) |
| `npm run alpha:safety-gate` | pass (35 checks) |
| `npm run lint` | pass |
| `npm run build` | pass |
| `npm run cf:build` | pass (OpenNext worker bundle) |
| `npx tsc --noEmit` | **81 pre-existing errors in 23 test files** (no CI gate — AUD-005) |
| `git diff --check` | clean |
| `npm audit` | 15 vulns (2 low / 6 moderate / 7 high) — toolchain, #128 |

Known provider-requiring commands (never run in this program):
`cf:deploy`, `cf:d1:migrations:apply`, `cf:d1:bootstrap:apply`,
`cf:d1:schema:verify:remote`, `wrangler whoami`. Flaky tests: none observed
(two clean full runs); the migrations-scratch flake was fixed in PR #166 r2.

## Workstreams (children of the root branch, Draft PRs only)

| Order | Branch | Primary invariant | Depends on |
|---|---|---|---|
| 1 | `refactor/domain-boundaries` | dependency direction + characterization contracts locked before any move | — |
| 2 | `refactor/tenant-security` | deterministic tenant/authz authority; CSRF/config authority (AUD-002/003) | 1 |
| 3 | `refactor/persistence-integrity` | composition-root persistence wiring; ctx factory discipline (R-07) | 1 |
| 4 | `refactor/execution-safety` | executor behind gate, idempotent, dark (#152); legacy unbound path removal | 1, 3 |
| 5 | `refactor/reliability-observability` | durable rate limiting (AUD-001), timeouts/retry budgets, structured audit/observability (AUD-004), perf guardrails (AUD-006) | 1–3 |
| 6 | `refactor/test-deployment-platform` | CI tsc gate + pinned actions + dep automation (AUD-005, #128, #136); dead-code ratchet deletions (#137) | 1 (ratchet), independent otherwise |

Rules: every child PR targets the root branch; ≤15 files / ≤800 lines / one
invariant unless mechanically justified in the PR body; cross-workstream
contract changes need an ADR + linked issues; Phase 16 refactor rules apply
verbatim; Issues are referenced as `Fixes candidate: #N` (no auto-close).

## Sequence (Phase 15 mapping)

1. Contract + characterization tests (WS1, this program's first PR — open).
2. Composition roots and dependency boundaries (WS1 second PR).
3. Tenant/auth/authorization authority (WS2).
4. Persistence and migration boundaries (WS3).
5. External action execution boundaries (WS4).
6. Reliability and observability (WS5).
7. Performance and cost controls (WS5).
8. Test/deployment platform (WS6).
9. Dead-code and compatibility cleanup (WS6, ratchet-guarded).

## Rollback strategy

- Root branch integrates only Draft-PR-reviewed workstream merges; every child
  PR reverts cleanly (no generated artifacts, no schema rewrites, no data
  migrations in this program).
- Behavior changes (AUD-002 CSRF authority, AUD-003 tenant determinism) ship
  behind explicit issues with characterization tests capturing the OLD behavior
  first; the old behavior's tests are updated in the same PR that changes it,
  never earlier.
- If the base moves (a dependency PR merges), the root branch is rebased
  forward in a dedicated commit with gates re-run; workstreams rebase on the
  root only.

## Exit criteria (program-complete)

- All six workstream Draft PRs open, green on: `npm test`,
  `alpha:safety-gate`, `lint`, `build`, `cf:build`, `git diff --check`, and
  no NEW `tsc` diagnostics in touched files.
- Root integration run repeats the full gate suite deterministically.
- No P0/P1 remains open in a touched boundary without a linked fix PR.
- Scorecard categories re-scored with evidence; targets met or gap issues
  filed.
- Zero provider/remote operations performed; nothing merged by the program.

## Traceability

- Findings: `SAAS_MATURITY_SCORECARD.md` (AUD-*) + `RISK_REGISTER.md` (R-*/INV-*).
- Umbrella Issue: [Refactor Program] Large-SaaS architecture and reliability
  hardening (see Issue tracker; links every child issue and workstream PR).
