# Phase-1 C0 Contract Freeze

Status: structural contract freeze; independent semantic review required.
Version: `c0.v1`

This artifact freezes the interfaces needed by P1-2 through P1-5. It does not
implement correlation, create a validation-only WorkUnit domain, authorize
execution, or make provider evidence admissible.

## Dataset and Gold Set

The machine-readable fixture is `tests/fixtures/phase1/c0.v1.json`.

- Dataset identity is `atra.phase1.correlation.validation`, version `c0.v1`.
- Membership and order are immutable: `src-github-issue-207` precedes
  `src-github-pull-229`.
- Each member points to a retained capture and its canonical source identity.
- The fixture is `VALIDATION_FIXTURE`, not `ADMISSIBLE_PROVIDER_EVIDENCE`.
- Admissibility is `BLOCKED`: both retained captures are GitHub resources, and
  GitHub issue plus pull request is one provider, not two independent providers.
- Gold labels are frozen fixture labels and are not read by runtime grouping.
  They are not a claim that the current repository has an admissible P1-2 gold
  set; a human-owned, two-provider evidence artifact remains required.

## Contract Shapes

All IDs below are opaque strings and must be stable within a dataset version.

`CorrelationGroup` (`c0.v1`): `groupId`, `memberSourceIds` (non-empty, unique,
sorted), `ruleVersion`, and optional `reason`. Group identity is stable only
within the dataset and version; it is not a source identity and is never
derived from array position.

`WorkUnitCandidate` (`c0.v1`): `candidateId`, `correlationGroupId`,
`evidenceSourceIds`, `contextSourceIds`, `title`, `missingInformation`, and
`humanReviewRequired`. Evidence and context IDs must reference dataset members.
It has no approval, execution, reviewed-work-unit, or attention-state fields.

`CandidateProjection` (`c0.v1`): `candidateId`, `title`, `sourceIds`,
`summary`, `missingInformation`, and `humanReviewRequired`. It is a read model
of a Candidate, not a second domain truth and not an execution payload.

`CorrectionRecord` (`c0.v1`): `correctionId`, `candidateId`, `actorId`,
`action` (`accept`, `merge`, `split`, or `remove-member`), source/group IDs,
and a reason. It can correct membership or the human-review decision only; it
cannot approve execution or create a ReviewedWorkUnit.

`MeasurementEvent` (`c0.v1`): `measurementId`, `datasetId`, `goldSetId`,
`predictedGroupIds`, `falseMergePairs`, `falseSplitPairs`, `judgment`, and
`pass`. False merge means a predicted group contains two sources belonging to
different gold groups. False split means two sources in one gold group are in
different predicted groups. Pair lists are sorted and deduplicated.

`pass` is an event-level validity result for the original machine-produced
output, not a Value Gate, product success, correction, approval, or execution
result. It is true exactly when `falseMergePairs.length === 0`,
`falseSplitPairs.length === 0`, `judgment.sameReferent === true`,
`judgment.relatedContextExcluded === true`, and `judgment.understandable ===
true`. Pair errors and judgment are calculated before correction from the
original prediction and frozen Gold; a `CorrectionRecord` is separate
diagnostic evidence and does not alter `pass` or retroactively change the
`MeasurementEvent`. No aggregate Value Gate threshold is defined here.

Human judgment questions are frozen as: “Are all members about the same
underlying work referent?”, “Is any related context incorrectly included?”,
and “Could a human understand the candidate without opening another source?”
Evidence is a JSON measurement record containing the frozen IDs, calculation
inputs, answers, and pass/fail result. No external provider is called.

## Candidate Projection Provenance (Amendment)

Status: normative amendment to this contract freeze; resolves the P1-3 to
P1-4 `summary` provenance gap. It does not change any `c0.v1` shape.

1. `WorkUnitCandidate` (`c0.v1`) is the canonical input to `CandidateProjection`
   (`c0.v1`) for the Phase-1 canonical validation path. `SafeWorkUnitCandidate`
   is not Phase-1 canonical Candidate truth, and `candidateWorkUnitBridge()` is
   not the canonical P1-3 to P1-4 composition root. Legacy or mock Launcher
   paths built on `SafeWorkUnitCandidate` may continue to exist outside the
   canonical path; they may not claim canonical authority for it.

2. The canonical field mapping from `WorkUnitCandidate` to `CandidateProjection`
   is:

   ```text
   CandidateProjection.candidateId           = WorkUnitCandidate.candidateId
   CandidateProjection.title                 = WorkUnitCandidate.title
   CandidateProjection.sourceIds              = WorkUnitCandidate.evidenceSourceIds
   CandidateProjection.missingInformation     = WorkUnitCandidate.missingInformation
   CandidateProjection.humanReviewRequired    = WorkUnitCandidate.humanReviewRequired
   ```

3. `CandidateProjection.summary` has no field on `WorkUnitCandidate` and is not
   derived from one. It is an explicit projection-only input supplied to the
   projection function alongside the canonical `WorkUnitCandidate`. It is
   presentation evidence only: it is not canonical Candidate truth, not
   correlation truth, not source-membership truth, not approval truth, not
   execution truth, and not attention state. The projection function must not
   derive it from `SafeWorkUnitCandidate.summary`, `NormalizedToolSignal.summary`,
   `LauncherWorkUnit.summary`, fallback Launcher data, `title`, an LLM, or
   ambient UI state, unless a future, separately reviewed contract amendment
   explicitly authorizes such a source.

4. For the frozen Phase-1 mock fixture, the authoritative summary value is the
   already-frozen `tests/fixtures/phase1/c0.v1.json` → `projection.summary`
   (`"Read-only candidate projection"`). No other mock summary value is
   authorized.

5. This amendment does not define the future production summary-generation
   mechanism. That mechanism remains undefined and is intentionally deferred
   to a future, separately reviewed contract change.
