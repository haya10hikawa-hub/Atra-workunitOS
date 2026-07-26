/**
 * F1B — Goal / Done Condition Adapter tests (canonical SourceRef remediation).
 *
 * Proven through the PUBLIC builders only:
 *   - `buildFormationGoalDoneConditionCandidate` (F1B, under test);
 *   - `buildFormationSourceCandidate` (F1A) to construct GENUINELY validated
 *     `FormationSourceCandidate` fixtures — the canonical reference set. The old
 *     structural cast `{ sourceRef } as FormationSourceCandidate` is no longer
 *     the proof of F1A validation.
 *
 * Security contract proven here:
 *   - requested evidenceRefs and the incoming primary doneCondition.sourceRef are
 *     untrusted SELECTORS; only a canonical reference from `validatedSources` may
 *     be emitted, always as a fresh snapshot (never the caller's URL/metadata);
 *   - an unmatched/malformed primary anchor is removed BEFORE the sole authority
 *     `evaluateDoneConditionDraft` decides status — no formation-local status;
 *   - sidecar evidence / validatedSources / closure / adapter issues can never
 *     repair a missing canonical anchor or assign status;
 *   - the merged PR #193 presence hardening remains effective through this path;
 *   - candidate-only / human-review literals, determinism, value-free issues.
 */

import test from "node:test"
import assert from "node:assert/strict"
import type { SourceRef } from "../app/lib/domain/types.ts"
import type { DoneConditionDraft } from "../app/lib/application/decomposition/types.ts"
import { evaluateDoneConditionDraft } from "../app/lib/application/decomposition/doneConditionGate.ts"
import {
  buildFormationSourceCandidate,
  type FormationSourceCandidate,
} from "../app/lib/application/formation/sourceContract.ts"
import {
  buildFormationGoalDoneConditionCandidate,
  snapshotFormationGoalDoneConditionCandidate,
  GOAL_HYPOTHESIS_FIELDS,
  type GoalHypothesis,
  type FormationGoalDoneConditionInput,
} from "../app/lib/application/formation/goalDoneConditionAdapter.ts"

// ─── Canonical validated F1A fixtures (via the public builder) ──────────────

const CANON_URL = "https://example.com/canonical/1"

function validSourceJson(sourceRef: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return {
    provider: sourceRef.source,
    sourceRef,
    sourceObjectId: "example-org/example-repo#1",
    title: "PR #1: example",
    sanitizedSummary: "PR #1 is waiting for review",
    actorAssertions: [{ name: "Hayato", assertedRelation: "author" }],
    timestamps: { occurredAt: "2026-07-18T10:00:00Z", capturedAt: "2026-07-19T00:00:00Z" },
    sourceLinks: [{ url: CANON_URL }],
    referencedObjects: [],
    navigationTarget: CANON_URL,
    ...over,
  }
}

/** A GENUINELY validated F1A candidate. Throws if the fixture is not accepted. */
function validatedSource(sourceRef: Record<string, unknown>): FormationSourceCandidate {
  const result = buildFormationSourceCandidate(JSON.stringify(validSourceJson(sourceRef)))
  if (!result.ok) throw new Error(`invalid F1A fixture: ${JSON.stringify(result.findings)}`)
  return result.candidate
}

const GH_RAW = {
  source: "github",
  externalId: "pr-1",
  container: "example-org/example-repo",
  url: CANON_URL,
  capturedAt: "2026-07-19T00:00:00Z",
}
const NT_RAW = { source: "notion", externalId: "page-9", url: CANON_URL, capturedAt: "2026-07-19T00:00:00Z" }

const ghSource = validatedSource(GH_RAW)
const ntSource = validatedSource(NT_RAW)
const canonicalGh: SourceRef = ghSource.sourceRef
const canonicalNt: SourceRef = ntSource.sourceRef

/** A caller-controlled selector: same identity, divergent/hostile metadata. */
function ghSelector(over: Record<string, unknown> = {}): SourceRef {
  return {
    source: "github",
    externalId: "pr-1",
    container: "attacker/spoof",
    url: "https://evil.example/inject" as string,
    capturedAt: "1999-01-01T00:00:00Z",
    ...over,
  } as unknown as SourceRef
}

// ─── Done Condition / Goal fixtures ─────────────────────────────────────────

function completeDraft(over: Partial<DoneConditionDraft> = {}): DoneConditionDraft {
  // Default anchor is a valid humanInputRef, so the baseline is canonically
  // complete WITHOUT relying on an (untrusted) caller sourceRef.
  return {
    outcome: "Spec approved",
    verifier: "human_owner",
    acceptanceCriteria: ["Reviewer confirms the spec"],
    humanInputRef: "human:reviewer",
    missingFields: [],
    status: "complete",
    invalidReasons: [],
    riskFlags: [],
    candidateOnly: true,
    ...over,
  }
}

function fullGoal(over: Partial<GoalHypothesis> = {}): GoalHypothesis {
  return {
    outcome: "The formation spec is approved",
    workObject: "The formation spec document",
    decisionNeeded: "Approve or reject the spec",
    scope: "Only the F1B adapter surface",
    verifier: "human_owner",
    timeHorizon: "Before the next release gate",
    ...over,
  }
}

function build(over: Partial<FormationGoalDoneConditionInput> = {}) {
  return buildFormationGoalDoneConditionCandidate({
    goal: fullGoal(),
    doneCondition: completeDraft(),
    ...over,
  })
}

// A doneCondition whose ONLY anchor is a primary sourceRef selector (no human ref).
function draftWithPrimary(sourceRef: SourceRef, over: Partial<DoneConditionDraft> = {}): DoneConditionDraft {
  return completeDraft({ humanInputRef: undefined, sourceRef, ...over })
}

// ─── Canonical requested refs ───────────────────────────────────────────────

// 1
test("same identity + same metadata emits a canonical snapshot", () => {
  const r = build({ evidenceRefs: [canonicalGh], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs.length, 1)
  assert.deepEqual(r.evidenceRefs[0], canonicalGh)
})

// 2
test("same identity + divergent HTTPS URL emits the validated canonical URL", () => {
  const r = build({ evidenceRefs: [ghSelector({ url: "https://evil.example/x" })], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs[0]?.url, CANON_URL)
})

// 3
test("same identity + javascript: URL does not emit it", () => {
  const r = build({ evidenceRefs: [ghSelector({ url: "javascript:alert(1)" })], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs[0]?.url, CANON_URL)
  assert.equal(JSON.stringify(r).includes("javascript:"), false)
})

// 4
test("same identity + http: URL does not emit it", () => {
  const r = build({ evidenceRefs: [ghSelector({ url: "http://example.com/x" })], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs[0]?.url, CANON_URL)
  assert.equal(JSON.stringify(r).includes("http://"), false)
})

// 5
test("same identity + userinfo-host spoof URL does not emit it", () => {
  const r = build({ evidenceRefs: [ghSelector({ url: "https://github.com@evil.example/x" })], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs[0]?.url, CANON_URL)
  assert.equal(JSON.stringify(r).includes("evil.example"), false)
})

// 6
test("same identity + divergent container emits the canonical container", () => {
  const r = build({ evidenceRefs: [ghSelector({ container: "attacker/spoof" })], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs[0]?.container, canonicalGh.container)
  assert.notEqual(r.evidenceRefs[0]?.container, "attacker/spoof")
})

// 7
test("same identity + divergent capturedAt emits the canonical capturedAt", () => {
  const r = build({ evidenceRefs: [ghSelector({ capturedAt: "1999-01-01T00:00:00Z" })], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs[0]?.capturedAt, canonicalGh.capturedAt)
})

// 8
test("caller unknown properties are not emitted", () => {
  const r = build({ evidenceRefs: [ghSelector({ evilProp: "x", extra: "y" })], validatedSources: [ghSource] })
  assert.deepEqual(Object.keys(r.evidenceRefs[0] ?? {}).sort(), ["capturedAt", "container", "externalId", "source", "url"])
})

// 9
test("emitted ref is not object-identical to the requested input", () => {
  const selector = ghSelector()
  const r = build({ evidenceRefs: [selector], validatedSources: [ghSource] })
  assert.notEqual(r.evidenceRefs[0], selector)
})

// 10
test("emitted ref is not object-identical to the validated source ref", () => {
  const r = build({ evidenceRefs: [canonicalGh], validatedSources: [ghSource] })
  assert.notEqual(r.evidenceRefs[0], ghSource.sourceRef)
})

// ─── Non-membership ─────────────────────────────────────────────────────────

// 11
test("non-member requested ref is excluded", () => {
  const r = build({ evidenceRefs: [ghSelector()], validatedSources: [ntSource] })
  assert.equal(r.evidenceRefs.length, 0)
})

// 12
test("non-member issue is exactly value-free path information", () => {
  const r = build({ evidenceRefs: [ghSelector({ url: "javascript:alert(1)" })], validatedSources: [ntSource] })
  const issue = r.adapterIssues.find((i) => i.category === "evidence_membership_mismatch")
  assert.deepEqual(issue, { category: "evidence_membership_mismatch", path: "evidenceRefs[0]" })
  assert.equal(JSON.stringify(r.adapterIssues).includes("javascript:"), false)
  assert.equal(JSON.stringify(r.adapterIssues).includes("pr-1"), false)
})

// 13
test("malformed requested identity is excluded", () => {
  const r = build({ evidenceRefs: [{ source: "", externalId: "" } as unknown as SourceRef], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs.length, 0)
  assert.ok(r.adapterIssues.some((i) => i.category === "evidence_membership_mismatch" && i.path === "evidenceRefs[0]"))
})

// 14
test("duplicate requested identities emit one canonical ref", () => {
  const r = build({ evidenceRefs: [ghSelector(), ghSelector({ url: "https://evil.example/y" })], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs.length, 1)
})

// 15
test("first requested identity order is preserved", () => {
  const r = build({ evidenceRefs: [canonicalNt, canonicalGh], validatedSources: [ghSource, ntSource] })
  assert.deepEqual(r.evidenceRefs.map((e) => e.externalId), ["page-9", "pr-1"])
})

// ─── Primary sourceRef ──────────────────────────────────────────────────────

// 16
test("matching primary with divergent URL is replaced by the canonical URL", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector({ url: "javascript:alert(1)" })), validatedSources: [ghSource] })
  assert.equal(r.doneCondition.sourceRef?.url, CANON_URL)
})

// 17
test("matching primary with divergent metadata is replaced entirely", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector()), validatedSources: [ghSource] })
  assert.deepEqual(r.doneCondition.sourceRef, canonicalGh)
})

// 18
test("matching primary appears once in evidenceRefs", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector()), evidenceRefs: [ghSelector()], validatedSources: [ghSource] })
  assert.equal(r.evidenceRefs.filter((e) => e.externalId === "pr-1").length, 1)
})

// 19
test("returned Done Condition sourceRef is a new snapshot (no alias)", () => {
  const selector = ghSelector()
  const r = build({ doneCondition: draftWithPrimary(selector), validatedSources: [ghSource] })
  assert.notEqual(r.doneCondition.sourceRef, selector)
  assert.notEqual(r.doneCondition.sourceRef, ghSource.sourceRef)
})

// 20
test("unmatched primary is omitted from the returned Done Condition", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector()), validatedSources: [ntSource] })
  assert.equal(r.doneCondition.sourceRef, undefined)
})

// 21
test("unmatched primary is omitted from evidenceRefs", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector()), validatedSources: [ntSource] })
  assert.equal(r.evidenceRefs.length, 0)
})

// 22
test("unmatched primary emits a value-free doneCondition.sourceRef issue", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector({ url: "javascript:alert(1)" })), validatedSources: [ntSource] })
  assert.ok(r.adapterIssues.some((i) => i.category === "evidence_membership_mismatch" && i.path === "doneCondition.sourceRef"))
  assert.equal(JSON.stringify(r.adapterIssues).includes("javascript:"), false)
})

// 23
test("unmatched primary WITHOUT humanInputRef becomes partial", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector()), validatedSources: [ntSource] })
  assert.equal(r.doneCondition.status, "partial")
  assert.ok(r.doneCondition.missingFields.includes("sourceRefOrHumanInputRef"))
})

// 24
test("unmatched primary WITH valid humanInputRef stays evaluator-controlled and may be complete", () => {
  const r = build({
    doneCondition: completeDraft({ sourceRef: ghSelector(), humanInputRef: "human:reviewer" }),
    validatedSources: [ntSource],
  })
  assert.equal(r.doneCondition.status, "complete")
  assert.equal(r.doneCondition.sourceRef, undefined)
})

// 25
test("malformed primary is not admitted", () => {
  const r = build({ doneCondition: draftWithPrimary({ source: "", externalId: "" } as unknown as SourceRef), validatedSources: [ghSource] })
  assert.equal(r.doneCondition.sourceRef, undefined)
  assert.equal(r.doneCondition.status, "partial")
})

// 26
test("unsafe primary URL cannot re-enter through the output", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector({ url: "javascript:alert(1)" })), evidenceRefs: [ghSelector({ url: "javascript:alert(2)" })], validatedSources: [ghSource] })
  assert.equal(JSON.stringify(r).includes("javascript:"), false)
})

// ─── No sidecar promotion ───────────────────────────────────────────────────

// 27
test("requested evidence cannot repair an absent primary sourceRef", () => {
  const r = build({
    doneCondition: completeDraft({ sourceRef: undefined, humanInputRef: undefined }),
    evidenceRefs: Array.from({ length: 10 }, () => canonicalGh),
    validatedSources: [ghSource],
  })
  assert.equal(r.doneCondition.status, "partial")
})

// 28
test("validatedSources alone cannot repair an absent primary sourceRef", () => {
  const r = build({
    doneCondition: completeDraft({ sourceRef: undefined, humanInputRef: undefined }),
    validatedSources: [ghSource, ntSource],
  })
  assert.equal(r.doneCondition.status, "partial")
})

// 29
test("requested evidence matching a validated source cannot repair an unmatched primary", () => {
  const r = build({
    doneCondition: completeDraft({ sourceRef: ghSelector(), humanInputRef: undefined }),
    evidenceRefs: [canonicalNt],
    validatedSources: [ntSource],
  })
  assert.equal(r.doneCondition.status, "partial")
  assert.equal(r.doneCondition.sourceRef, undefined)
})

// 30
test("independent closure cannot repair partial", () => {
  const r = build({
    doneCondition: completeDraft({ sourceRef: undefined, humanInputRef: undefined }),
    independentClosure: "independent",
  })
  assert.equal(r.doneCondition.status, "partial")
})

// 31
test("adapter issues do not directly assign status", () => {
  const withIssues = build({ goal: {}, doneCondition: completeDraft() })
  assert.ok(withIssues.adapterIssues.length > 0)
  assert.equal(withIssues.doneCondition.status, "complete")
})

// 32
test("incoming status/missingFields/invalidReasons remain untrusted", () => {
  const r = build({
    doneCondition: completeDraft({ outcome: "", status: "complete", missingFields: [], invalidReasons: [] }),
  })
  assert.equal(r.doneCondition.status, "partial")
  assert.ok(r.doneCondition.missingFields.includes("outcome"))
})

// ─── Canonical gate integration (merged PR #193) ────────────────────────────

// 33
test("whitespace outcome remains partial through the merged gate", () => {
  assert.equal(build({ doneCondition: completeDraft({ outcome: "   " }) }).doneCondition.status, "partial")
})

// 34
test("whitespace verifier remains partial", () => {
  assert.equal(build({ doneCondition: completeDraft({ verifier: "   " }) }).doneCondition.status, "partial")
})

// 35
test("blank criteria remain partial", () => {
  assert.equal(build({ doneCondition: completeDraft({ acceptanceCriteria: ["", "   "] }) }).doneCondition.status, "partial")
})

// 36
test("malformed evidence anchor remains partial", () => {
  const r = build({ doneCondition: draftWithPrimary({} as unknown as SourceRef), validatedSources: [ghSource] })
  assert.equal(r.doneCondition.status, "partial")
})

// 37
test("AI verifier remains invalid", () => {
  const r = build({ doneCondition: completeDraft({ verifier: "AI" }) })
  assert.equal(r.doneCondition.status, "invalid")
  assert.ok(r.doneCondition.invalidReasons.includes("ai_verifier_forbidden"))
})

// 38
test("forbidden context remains invalid", () => {
  const r = build({ context: { approvalId: "approval:1" } })
  assert.equal(r.doneCondition.status, "invalid")
  assert.ok(r.doneCondition.invalidReasons.includes("forbidden_context_field_present"))
})

// 39
test("external-execution context remains invalid", () => {
  const r = build({ context: { sendableBody: "hello" } })
  assert.equal(r.doneCondition.status, "invalid")
  assert.ok(r.doneCondition.invalidReasons.includes("external_execution_payload_present"))
})

// 40
test("combined missing outcome + AI verifier remains invalid while reporting the missing field", () => {
  const r = build({ doneCondition: completeDraft({ outcome: "   ", verifier: "AI" }) })
  assert.equal(r.doneCondition.status, "invalid")
  assert.ok(r.doneCondition.missingFields.includes("outcome"))
})

// ─── Safety and determinism ─────────────────────────────────────────────────

// 41
test("candidateOnly is literal true", () => {
  assert.equal(build().candidateOnly, true)
})

// 42
test("humanReviewRequired is literal true", () => {
  assert.equal(build().humanReviewRequired, true)
})

// 43
test("goal missing values remain missing (no invention)", () => {
  const r = build({ goal: { outcome: "Only outcome" } })
  const missing = r.adapterIssues.filter((i) => i.category === "missing_goal_field").map((i) => (i as { field: string }).field)
  assert.deepEqual(missing, GOAL_HYPOTHESIS_FIELDS.filter((f) => f !== "outcome"))
  assert.equal(r.goal.workObject, undefined)
})

// 44
test("repeated calls are deeply equal", () => {
  const input: Partial<FormationGoalDoneConditionInput> = {
    doneCondition: draftWithPrimary(ghSelector()),
    evidenceRefs: [canonicalNt],
    validatedSources: [ghSource, ntSource],
  }
  assert.deepEqual(build(input), build(input))
})

// 45
test("inputs are not mutated", () => {
  const doneCondition = draftWithPrimary(ghSelector())
  const evidenceRefs = [ghSelector({ url: "javascript:alert(1)" }), canonicalNt]
  const validatedSources = [ghSource, ntSource]
  const snapshot = JSON.stringify({ doneCondition, evidenceRefs, validatedSources })
  build({ doneCondition, evidenceRefs, validatedSources })
  assert.equal(JSON.stringify({ doneCondition, evidenceRefs, validatedSources }), snapshot)
})

// 46
test("issues never echo rejected values", () => {
  const r = build({
    doneCondition: draftWithPrimary(ghSelector({ url: "javascript:alert(1)" })),
    evidenceRefs: [ghSelector({ url: "javascript:alert(2)", externalId: "not-a-member" })],
    validatedSources: [ntSource],
  })
  const serialized = JSON.stringify(r.adapterIssues)
  for (const leak of ["javascript:", "evil.example", "not-a-member", "attacker/spoof", "1999-01-01"]) {
    assert.equal(serialized.includes(leak), false, `issue leaked: ${leak}`)
  }
})

// 47
test("returned canonical references do not change when input refs are mutated after return", () => {
  const selector = ghSelector()
  const r = build({ evidenceRefs: [selector], validatedSources: [ghSource] })
  const before = JSON.stringify(r.evidenceRefs[0])
  ;(selector as { url: string }).url = "javascript:alert(9)"
  ;(selector as { source: string }).source = "slack"
  assert.equal(JSON.stringify(r.evidenceRefs[0]), before)
})

// 48
test("no F1C / grouping / provider / UI / execution / persistence field appears", () => {
  const r = build({ doneCondition: draftWithPrimary(ghSelector()), evidenceRefs: [canonicalNt], validatedSources: [ghSource, ntSource] })
  const keys = Object.keys(r).sort()
  assert.deepEqual(keys, ["adapterIssues", "candidateOnly", "doneCondition", "evidenceRefs", "goal", "humanReviewRequired", "independentClosure"])
  const forbidden = ["member", "sourceRole", "group", "conflict", "prediction", "ranking", "projection", "approval", "execution", "persist", "aggregate"]
  const serialized = JSON.stringify(r).toLowerCase()
  for (const f of forbidden) assert.equal(serialized.includes(f), false, `forbidden surface: ${f}`)
})

// ─── Canonical delegation sanity (direct evaluator parity) ──────────────────

// 49
test("adapter status equals the sole evaluator on the canonicalized draft", () => {
  const canonicalDraft = completeDraft({ sourceRef: canonicalGh, humanInputRef: undefined })
  const direct = evaluateDoneConditionDraft(canonicalDraft)
  const r = build({ doneCondition: draftWithPrimary(ghSelector()), validatedSources: [ghSource] })
  assert.equal(r.doneCondition.status, direct.status)
  assert.equal(r.doneCondition.status, "complete")
})

// 50 — emitted refs do not alias the validated source object either.
test("returned refs do not change when the validated source ref is mutated after return", () => {
  const src = validatedSource(GH_RAW)
  const r = buildFormationGoalDoneConditionCandidate({
    goal: fullGoal(),
    doneCondition: draftWithPrimary(ghSelector()),
    evidenceRefs: [ghSelector()],
    validatedSources: [src],
  })
  const beforeDone = JSON.stringify(r.doneCondition.sourceRef)
  const beforeEvidence = JSON.stringify(r.evidenceRefs[0])
  ;(src.sourceRef as { url: string }).url = "javascript:alert(9)"
  ;(src.sourceRef as { externalId: string }).externalId = "mutated"
  assert.equal(JSON.stringify(r.doneCondition.sourceRef), beforeDone)
  assert.equal(JSON.stringify(r.evidenceRefs[0]), beforeEvidence)
})

// ─── Runtime-provenance attestation (F1B) ───────────────────────
//
// `snapshotFormationGoalDoneConditionCandidate` attests the EXACT object a real
// `buildFormationGoalDoneConditionCandidate` call returned (after the sole
// authority produced the verdict). A `{}`, a forged verdict, or any clone fails.

// B1 — a real F1B output is attested.
test("attestation: real F1B output is attested", () => {
  const r = build({ evidenceRefs: [canonicalGh], validatedSources: [ghSource] })
  const snap = snapshotFormationGoalDoneConditionCandidate(r)
  assert.notEqual(snap, null)
  assert.deepEqual(snap, r)
})

// B2 — an empty object is rejected.
test("attestation: {} is rejected", () => {
  assert.equal(snapshotFormationGoalDoneConditionCandidate({}), null)
})

// B3 — a malformed structural result is rejected.
test("attestation: malformed structural F1B result is rejected", () => {
  const malformed = { goal: "x", doneCondition: 5, evidenceRefs: "nope", candidateOnly: true }
  assert.equal(snapshotFormationGoalDoneConditionCandidate(malformed), null)
})

// B4 — a forged complete verdict is rejected.
test("attestation: forged complete verdict is rejected", () => {
  const forged = {
    goal: {},
    doneCondition: { outcome: "x", verifier: "y", acceptanceCriteria: [], status: "complete", missingFields: [], invalidReasons: [] },
    evidenceRefs: [],
    independentClosure: "independent",
    adapterIssues: [],
    humanReviewRequired: true,
    candidateOnly: true,
  }
  assert.equal(snapshotFormationGoalDoneConditionCandidate(forged), null)
})

// B5 — a spread clone is rejected.
test("attestation: spread clone of a real F1B result is rejected", () => {
  const r = build({ validatedSources: [ghSource] })
  assert.equal(snapshotFormationGoalDoneConditionCandidate({ ...r }), null)
})

// B6 — a JSON clone is rejected.
test("attestation: JSON clone of a real F1B result is rejected", () => {
  const r = build({ validatedSources: [ghSource] })
  assert.equal(snapshotFormationGoalDoneConditionCandidate(JSON.parse(JSON.stringify(r))), null)
})

// B7 — mutating public status does not change the canonical snapshot.
test("attestation: public status mutation does not change the snapshot", () => {
  const r = build({ validatedSources: [ghSource] })
  const before = snapshotFormationGoalDoneConditionCandidate(r)
  ;(r.doneCondition as { status: string }).status = "complete-forged"
  const after = snapshotFormationGoalDoneConditionCandidate(r)
  assert.deepEqual(after, before)
  assert.notEqual(after?.doneCondition.status, "complete-forged")
})

// B8 — mutating public evidenceRefs does not change the snapshot.
test("attestation: public evidenceRefs mutation does not change the snapshot", () => {
  const r = build({ evidenceRefs: [canonicalGh], validatedSources: [ghSource] })
  const before = snapshotFormationGoalDoneConditionCandidate(r)
  ;(r.evidenceRefs as unknown as SourceRef[]).push({ source: "slack", externalId: "x", capturedAt: "2026-07-19T00:00:00Z" } as SourceRef)
  const after = snapshotFormationGoalDoneConditionCandidate(r)
  assert.deepEqual(after, before)
  assert.equal(after?.evidenceRefs.length, before?.evidenceRefs.length)
})

// B9 — mutating public Done Condition fields does not change the snapshot.
test("attestation: public Done Condition mutation does not change the snapshot", () => {
  const r = build({ validatedSources: [ghSource] })
  const before = snapshotFormationGoalDoneConditionCandidate(r)
  ;(r.doneCondition as unknown as Record<string, unknown>).outcome = "MUTATED"
  ;(r.doneCondition as unknown as Record<string, unknown>).invalidReasons = ["forged"]
  const after = snapshotFormationGoalDoneConditionCandidate(r)
  assert.deepEqual(after, before)
})

// B10 — repeated snapshots do not alias.
test("attestation: repeated F1B snapshots do not alias", () => {
  const r = build({ evidenceRefs: [canonicalGh], validatedSources: [ghSource] })
  const a = snapshotFormationGoalDoneConditionCandidate(r)
  const b = snapshotFormationGoalDoneConditionCandidate(r)
  assert.deepEqual(a, b)
  assert.notEqual(a, b)
  assert.notEqual(a?.doneCondition, b?.doneCondition)
  assert.notEqual(a?.evidenceRefs, b?.evidenceRefs)
})

// B11 — a context-derived invalid verdict is preserved exactly.
test("attestation: context-derived invalid verdict is preserved exactly", () => {
  const r = build({ doneCondition: completeDraft({ verifier: "AI" }), validatedSources: [ghSource] })
  assert.equal(r.doneCondition.status, "invalid") // sole authority verdict
  const snap = snapshotFormationGoalDoneConditionCandidate(r)
  assert.notEqual(snap, null)
  assert.equal(snap?.doneCondition.status, "invalid")
  assert.deepEqual(snap?.doneCondition.invalidReasons, r.doneCondition.invalidReasons)
})
