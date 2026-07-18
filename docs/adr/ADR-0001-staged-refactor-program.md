# ADR-0001: Staged refactor program with one root integration branch

- Status: Accepted (program start, 2026-07-19)
- Context: The repository must reach large-SaaS maturity (see
  `docs/refactor/SAAS_MATURITY_SCORECARD.md`) without a big-bang rewrite. The
  codebase carries strong, mutation-verified security/persistence boundaries
  (PRs #163–#166) that a bulk refactor would put at risk, plus 51% dead or
  unwired code that inflates any single diff.
- Decision: All refactoring lands on child branches
  (`refactor/domain-boundaries`, `refactor/tenant-security`,
  `refactor/persistence-integrity`, `refactor/execution-safety`,
  `refactor/reliability-observability`, `refactor/test-deployment-platform`)
  targeting the root branch `refactor/large-saas-foundation` (cut from
  `origin/main` @ `2669f2ea`) via Draft PRs sized ≤15 files / ≤800 lines with
  one primary invariant each. Characterization tests precede every behavior
  move (Phase 15 order). Issues are closed only after independent audit
  (`Fixes candidate:` linking, no auto-close keywords).
- Consequences: More PRs and coordination overhead; in exchange, every step is
  reviewable, revertible, and gate-verified; unmerged dependency PRs
  (#172/#173/#174/#139/#114/#53) stay un-cherry-picked and are absorbed only by
  explicit root rebases.
