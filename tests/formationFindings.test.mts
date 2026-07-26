/**
 * F6A — Deterministic Formation Findings Foundation — permanent tests.
 *
 * Every subject is compiled through the REAL F1A/F1B/F1C boundaries, so each `formationResult` is genuinely ATTESTED, never
 * a clone. The deterministic finding table and the planning counterexamples live in
 * `fixtures/formation/findings/scenarios.json`; the input boundary, the internal F5 consumption, the supersession graph
 * rules, output-result attestation, leakage, determinism and the architecture boundary are pinned inline.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { buildFormationSourceCandidate, type FormationSourceCandidate, type FormationSourceContractResult } from "../app/lib/application/formation/sourceContract.ts"
import { buildFormationGoalDoneConditionCandidate, GOAL_HYPOTHESIS_FIELDS } from "../app/lib/application/formation/goalDoneConditionAdapter.ts"
import { evaluateDoneConditionDraft } from "../app/lib/application/decomposition/doneConditionGate.ts"
import { buildWorkUnitFormationCandidate } from "../app/lib/application/formation/workUnitFormationAggregate.ts"
import { predictFormationState } from "../app/lib/application/formation/statePrediction.ts"
import type { ValidatedFormationSubjectResult } from "../app/lib/application/formation/statePredictionTypes.ts"
import {
  classifyDoneConditionInvalidReason, classifyDoneConditionMissingField, classifyFormationAdapterIssueCategory,
  classifyGoalHypothesisField, DONE_CONDITION_INVALID_REASONS, DONE_CONDITION_MISSING_FIELDS,
  FORMATION_ADAPTER_ISSUE_CATEGORIES, FORMATION_FINDING_KINDS, FORMATION_FINDING_REASON_CODES,
  FORMATION_FINDINGS_REJECTIONS, type FormationFinding,
} from "../app/lib/application/formation/findingsTypes.ts"
import { buildFormationFindings, snapshotValidatedFormationFindingsResult } from "../app/lib/application/formation/findings.ts"

type OkSource = Extract<FormationSourceContractResult, { ok: true }>
type Claim = { provider: string; sourceObjectId: string; inferred: boolean }
type Entry = { kind: string; inferred?: boolean }

const CAPTURED_AT = "2026-07-19T00:00:00Z"
const OCCURRED_AT = "2026-01-01T00:00:00Z"
const OUTCOME = "Ship the reviewed widget"

type SourceSpec = {
  externalId: string; sourceObjectId: string; provider?: string; occurredAt?: string; statusMarkers?: readonly string[]
  supersedes?: readonly Claim[]; supersededBy?: readonly Claim[]; authoritySignals?: readonly Entry[]
  actors?: readonly { name: string; relation?: string }[]; deadline?: { value: string; inferred: boolean }
}

function buildSource(spec: SourceSpec): OkSource {
  const provider = spec.provider ?? "github"
  const url = `https://example.com/${provider}/${encodeURIComponent(spec.externalId)}`
  const result = buildFormationSourceCandidate(JSON.stringify({
    provider, sourceObjectId: spec.sourceObjectId, navigationTarget: url,
    sourceRef: { source: provider, externalId: spec.externalId, url, capturedAt: CAPTURED_AT },
    title: `Item ${spec.externalId}`, sanitizedSummary: `Summary for ${spec.externalId}`,
    actorAssertions: (spec.actors ?? []).map((a) => ({ name: a.name, assertedRelation: a.relation ?? "author" })),
    timestamps: { occurredAt: spec.occurredAt ?? OCCURRED_AT, capturedAt: CAPTURED_AT },
    ...(spec.deadline !== undefined ? { explicitDeadline: spec.deadline } : {}),
    sourceLinks: [{ url }], referencedObjects: [],
    supersedes: spec.supersedes ?? [], supersededBy: spec.supersededBy ?? [],
    unresolvedMarkers: [], decisionMarkers: [], statusMarkers: spec.statusMarkers ?? [],
    authoritySignals: spec.authoritySignals ?? [] }))
  if (!result.ok) throw new Error(`F1A fixture rejected (${spec.externalId}): ${JSON.stringify(result.findings)}`)
  return result
}

const ALL_GOAL_FIELDS: Record<string, string> = { outcome: OUTCOME, workObject: "widget",
  decisionNeeded: "whether to ship", scope: "the widget module", verifier: "human_owner", timeHorizon: "this quarter" }

type DoneConditionSpec = "complete" | "no_outcome" | "no_verifier" | "no_criteria" | "no_anchor" | "empty" | "ai_verifier"

type SubjectSpec = {
  sources: readonly SourceSpec[]; roles?: readonly string[]; goal?: "all" | "none"; badEvidenceRef?: boolean
  doneCondition?: DoneConditionSpec; closure?: string; context?: "forbidden_key" | "execution_payload"
}

const CONTEXTS: Record<string, Record<string, unknown>> = {
  forbidden_key: { tenantId: "tenant-alpha" }, execution_payload: { externalExecutionPayload: { target: "external" } } }

function buildSubject(spec: SubjectSpec): ValidatedFormationSubjectResult {
  const results = spec.sources.map(buildSource)
  const candidates: FormationSourceCandidate[] = results.map((r) => r.candidate)
  const dc = spec.doneCondition ?? "complete"
  const anchored = dc !== "no_anchor" && dc !== "empty"
  const gdc = buildFormationGoalDoneConditionCandidate({
    goal: (spec.goal === "none" ? {} : { ...ALL_GOAL_FIELDS }) as never,
    independentClosure: (spec.closure ?? "independent") as never,
    validatedSources: candidates,
    ...(spec.context !== undefined ? { context: CONTEXTS[spec.context] } : {}),
    ...(spec.badEvidenceRef ? { evidenceRefs: [{ source: "github", externalId: "ext-not-a-member", capturedAt: CAPTURED_AT }] as never } : {}),
    doneCondition: { outcome: dc === "no_outcome" || dc === "empty" ? "" : OUTCOME,
      verifier: dc === "ai_verifier" ? "ai" : dc === "no_verifier" || dc === "empty" ? "" : "human_owner",
      acceptanceCriteria: dc === "no_criteria" || dc === "empty" ? [] : ["A human reviewer can verify the outcome."],
      ...(anchored ? { humanInputRef: "human:reviewer" } : {}),
      missingFields: [], status: "partial", invalidReasons: [], riskFlags: [], candidateOnly: true } })
  const f1c = buildWorkUnitFormationCandidate({ goalDoneCondition: gdc,
    members: results.map((r, i) => ({ sourceResult: r, role: spec.roles?.[i] ?? "evidence" })) } as never)
  if (!f1c.ok) throw new Error(`F1C build failed: ${JSON.stringify(f1c)}`)
  return f1c as ValidatedFormationSubjectResult
}

function subjectOf(externalId: string, sourceObjectId: string, extra: Partial<SourceSpec> = {}): ValidatedFormationSubjectResult {
  return buildSubject({ sources: [{ externalId, sourceObjectId, ...extra }] })
}

/** `kind` or `kind:payload` — the exact emitted finding, order preserved. */
function encode(finding: FormationFinding): string {
  const suffix = (finding as { field?: string; reason?: string }).field ?? (finding as { reason?: string }).reason
  return suffix === undefined ? finding.kind : `${finding.kind}:${suffix}`
}

function inspect(value: unknown): { strings: string[]; numbers: number[]; keys: Set<string> } {
  const strings: string[] = []; const numbers: number[] = []; const keys = new Set<string>()
  const walk = (v: unknown): void => {
    if (typeof v === "string") strings.push(v)
    else if (typeof v === "number") numbers.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === "object") for (const [k, inner] of Object.entries(v)) { keys.add(k); walk(inner) }
  }
  walk(value); return { strings, numbers, keys }
}

// Raw data, ranking, membership, grouping and lifecycle keys that must never appear anywhere in the public F6A result.
const FORBIDDEN_OUTPUT_KEYS = ["formationResult", "subject", "members", "member", "source", "sources", "role", "roles",
  "sourceRef", "sourceObjectId", "externalId", "provider", "url", "title", "sanitizedSummary", "navigationTarget",
  "actorAssertions", "timestamps", "explicitDeadline", "versionInfo", "statusMarkers", "authoritySignals", "path",
  "goal", "goalDoneCondition", "doneCondition", "status", "missingFields", "invalidReasons", "adapterIssues",
  "evidenceRefs", "evidenceMemberIndexesByFinding", "primarySource", "mergeCandidate", "splitCandidate",
  "pairSides", "pairToken", "comparisonInput", "comparisonResult", "groupingOutcome", "membership", "grouped",
  "roi", "score", "rank", "ranking", "priority", "urgency", "weight", "severity", "confidence", "whyNow",
  "merged", "formalized", "approved", "executed", "tenantId", "userId"]

const RAW_VALUES = ["ext-", "object-", "https://", "Item ", "Summary for", OUTCOME, "widget", "human_owner",
  "human:reviewer", "tenant-alpha", "evidenceRefs", "doneCondition.sourceRef", "github", "slack", "gmail", "Dana"]

function assertBoundedSafeOutput(result: unknown): void {
  const { strings, numbers, keys } = inspect(result)
  for (const key of FORBIDDEN_OUTPUT_KEYS) assert.ok(!keys.has(key), `forbidden output key: ${key}`)
  for (const key of keys) assert.ok(!/group|pair|merge|split|membership|primary|rank|score/i.test(key), `out-of-slice key: ${key}`)
  // The public result is entirely closed enums and constant sentences: no number can appear, so no count, index, position
  // or score can leak.
  assert.deepEqual(numbers, [], "the F6A public result must carry no numeric value")
  for (const raw of RAW_VALUES) for (const s of strings) assert.ok(!s.includes(raw), `raw value leaked: ${raw}`)
  for (const s of strings) assert.ok(s.length <= 200, `output string exceeds 200 chars: ${s.slice(0, 40)}`)
}

function okResult(input: unknown) {
  const r = buildFormationFindings(input as never)
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`)
  if (!r.ok) throw new Error("unreachable")
  assert.equal(r.candidateOnly, true)
  assert.equal(r.humanReviewRequired, true)
  for (const finding of r.findings) assert.ok(FORMATION_FINDING_KINDS.includes(finding.kind), `unclosed kind ${finding.kind}`)
  for (const code of r.reasonCodes) assert.ok(FORMATION_FINDING_REASON_CODES.includes(code), `unclosed code ${code}`)
  assert.equal(r.narrative.length, r.reasonCodes.length)
  // `conflict` may only ever accompany the one code that can produce it.
  assert.equal(r.effectiveState === "conflict", r.reasonCodes.includes("effective_state_conflict_recorded_supersession_cycle"))
  assertBoundedSafeOutput(r)
  return r
}

function rejects(input: unknown, reason: string, label: string): void {
  const r = buildFormationFindings(input as never)
  assert.equal(r.ok, false, `${label} must fail closed`)
  if (!r.ok) assert.equal(r.reason, reason, label)
}

// ─── Closed vocabularies and the upstream drift boundary ─────────────────────

test("finding kinds, reason codes and rejections are exactly the closed sets", () => {
  assert.deepEqual([...FORMATION_FINDING_KINDS], ["missing_goal_field", "missing_done_condition_field",
    "invalid_done_condition", "evidence_reference_rejected", "independent_closure_unknown", "supersession_recorded",
    "supersession_asserted_requires_review", "external_supersession_reference", "supersession_cycle"])
  assert.deepEqual([...FORMATION_FINDINGS_REJECTIONS], ["subject_not_validated", "state_prediction_unavailable",
    "unbound_reference_supplied", "upstream_contract_drift", "member_object_identity_ambiguous", "input_unreadable"])
  for (const code of FORMATION_FINDING_REASON_CODES) assert.ok(!/group|pair|merge|split|ranking|roi|score|urgency|primary/i.test(code), code)
})

test("the recognized upstream vocabularies are exactly what the canonical authorities can emit", () => {
  // The Goal vocabulary is IMPORTED from F1B, never re-listed here.
  assert.deepEqual(GOAL_HYPOTHESIS_FIELDS.map(classifyGoalHypothesisField), [...GOAL_HYPOTHESIS_FIELDS])
  // Exhaustive over the canonical Done Condition authority: every reachable verdict emits only strings F6A recognizes, so
  // today's closed set is complete.
  const emittedMissing = new Set<string>(); const emittedInvalid = new Set<string>()
  for (const outcome of ["", OUTCOME]) for (const verifier of ["", "human_owner", "ai", "llm", "model"])
    for (const acceptanceCriteria of [[], [" "], ["A human reviewer can verify the outcome."]])
      for (const anchor of [{}, { humanInputRef: "human:reviewer" }, { sourceRef: { source: "github", externalId: "ext-x", capturedAt: CAPTURED_AT } }])
        for (const context of [undefined, CONTEXTS.forbidden_key, CONTEXTS.execution_payload]) {
          const verdict = evaluateDoneConditionDraft({ outcome, verifier, acceptanceCriteria, ...anchor,
            missingFields: [], status: "partial", invalidReasons: [], riskFlags: [], candidateOnly: true } as never, context)
          for (const field of verdict.missingFields) emittedMissing.add(field)
          for (const reason of verdict.invalidReasons) emittedInvalid.add(reason)
        }
  assert.deepEqual([...emittedMissing].sort(), [...DONE_CONDITION_MISSING_FIELDS].sort())
  assert.deepEqual([...emittedInvalid].sort(), [...DONE_CONDITION_INVALID_REASONS].sort())
})

test("an unrecognized upstream enum value is never defaulted, guessed or dropped", () => {
  // Direct probe of the drift boundary every canonical mapping runs through.
  const drifted = ["", " ", "outcome ", "OUTCOME", "acceptance_criteria", "sourceRef", "humanInputRef",
    "verifier_missing", "ai_verifier", "new_upstream_reason", "missing_goal_field ", "__proto__", "toString"]
  for (const classify of [classifyGoalHypothesisField, classifyDoneConditionMissingField,
    classifyDoneConditionInvalidReason, classifyFormationAdapterIssueCategory]) {
    for (const value of [...drifted, null, undefined, 0, 1, true, {}, [], Symbol("x")]) {
      const recognized = typeof value === "string" && ([...GOAL_HYPOTHESIS_FIELDS, ...DONE_CONDITION_MISSING_FIELDS,
        ...DONE_CONDITION_INVALID_REASONS, ...FORMATION_ADAPTER_ISSUE_CATEGORIES] as readonly string[]).includes(value)
      if (!recognized) assert.equal(classify(value), null, `drifted value must not classify: ${String(value)}`)
    }
  }
  // Structural: every canonical mapping fails the CALL closed on a null classification.
  const source = readFileSync(fileURLToPath(new URL("../app/lib/application/formation/findings.ts", import.meta.url)), "utf8")
  const canonical = source.slice(source.indexOf("function collectCanonicalFindings"), source.indexOf("export function buildFormationFindings"))
  for (const name of ["classifyGoalHypothesisField", "classifyDoneConditionMissingField",
    "classifyDoneConditionInvalidReason", "classifyFormationAdapterIssueCategory"]) assert.ok(canonical.includes(`${name}(`), name)
  // Exactly one success exit; every other exit is fail-closed. A drifted value may never be skipped, defaulted or
  // substituted, so the mapping carries no `continue`, no `??` and no `||`.
  assert.deepEqual([...canonical.matchAll(/return (\w+)/g)].map((m) => m[1]).filter((v) => v !== "false"), ["true"])
  assert.equal((canonical.match(/return false/g) ?? []).length, 7, "every drift guard must fail the whole call closed")
  assert.ok(!/\bcontinue\b/.test(canonical), "a drifted or unmapped value may never be skipped")
  assert.ok(!/\?\?|\|\|/.test(canonical), "no default may substitute for a drifted value")
  assert.ok(canonical.includes("categories.some((category) => category === null)"), "adapter categories must be classified up front")
  assert.ok(source.includes('return reject("upstream_contract_drift")'), "drift must reject the whole call")
})

// ─── Deterministic finding table and planning counterexamples ────────────────

const fixturePath = fileURLToPath(new URL("./fixtures/formation/findings/scenarios.json", import.meta.url))
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  scenarios: (SubjectSpec & { name: string; expect: { findings: string[]; base: string; effective: string } })[]
}

for (const scenario of fixtures.scenarios) {
  test(`findings ${scenario.name}`, () => {
    const formationResult = buildSubject(scenario)
    const r = okResult({ formationResult })
    assert.deepEqual(r.findings.map(encode), scenario.expect.findings)
    assert.equal(r.baseSubjectState, scenario.expect.base)
    assert.equal(r.effectiveState, scenario.expect.effective)
    // The F5 authority is copied EXACTLY: no finding re-maps the subject state, and no finding creates a second completion
    // status.
    const prediction = predictFormationState({ formationResult })
    assert.equal(prediction.ok, true)
    if (!prediction.ok) throw new Error("unreachable")
    assert.deepEqual(r.statePrediction, prediction)
    assert.equal(r.baseSubjectState, prediction.subjectState)
  })
}

test("every Goal field and every canonical Done Condition field is covered by the table", () => {
  const emitted = new Set(fixtures.scenarios.flatMap((s) => s.expect.findings))
  for (const field of GOAL_HYPOTHESIS_FIELDS) assert.ok(emitted.has(`missing_goal_field:${field}`), field)
  for (const field of DONE_CONDITION_MISSING_FIELDS) assert.ok(emitted.has(`missing_done_condition_field:${field}`), field)
  for (const reason of DONE_CONDITION_INVALID_REASONS) assert.ok(emitted.has(`invalid_done_condition:${reason}`), reason)
  for (const kind of FORMATION_FINDING_KINDS) assert.ok([...emitted].some((e) => e.split(":")[0] === kind), kind)
})

// ─── Nothing but a recorded cycle may reach `conflict` ───────────────────────

test("status, role, provider, actor, deadline and freshness never produce conflict", () => {
  // F1C proves membership and an explicit caller-supplied role — never that two members concern one decision — so no
  // combination of these may bind them.
  let index = 0
  for (const [x, y] of [["approved", "changes_requested"], ["merged", "cancelled"], ["open", "closed"]])
    for (const [p, q] of [["github", "github"], ["github", "slack"]])
      for (const [ra, rb] of [["contradicting_claim", "contradicting_claim"], ["accepted_specification", "implementation"],
        ["decision_record", "historical_context"], ["evidence", "evidence"]])
        for (const [ta, tb] of [["2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"], ["2026-01-01T00:00:00Z", "2026-07-01T00:00:00Z"]])
          for (const [da, db] of [[undefined, undefined], ["2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z"], ["2026-08-01T00:00:00Z", "2026-12-01T00:00:00Z"]]) {
            index += 1
            const label = `${x}/${y} ${p}/${q} ${ra}/${rb} ${ta}/${tb} ${da}/${db}`
            const r = okResult({ formationResult: buildSubject({ roles: [ra, rb], sources: [
              { externalId: `ext-nc${index}a`, sourceObjectId: `object-nc${index}a`, provider: p, statusMarkers: [x], occurredAt: ta,
                actors: [{ name: "Dana" }], ...(da !== undefined ? { deadline: { value: da, inferred: false } } : {}) },
              { externalId: `ext-nc${index}b`, sourceObjectId: `object-nc${index}b`, provider: q, statusMarkers: [y], occurredAt: tb,
                actors: [{ name: "Dana" }], ...(db !== undefined ? { deadline: { value: db, inferred: false } } : {}) }] }) })
            assert.notEqual(r.effectiveState, "conflict", label)
            assert.deepEqual(r.findings, [], label)
          }
})

test("missing, invalid, rejected-evidence and unknown-closure findings never produce conflict", () => {
  for (const spec of [{ goal: "none" }, { doneCondition: "empty" }, { doneCondition: "ai_verifier" },
    { context: "execution_payload" }, { badEvidenceRef: true }, { closure: "unknown" },
    { goal: "none", doneCondition: "empty", closure: "unknown", badEvidenceRef: true }] as SubjectSpec[]) {
    const formationResult = buildSubject({ ...spec, sources: [{ externalId: "ext-nm", sourceObjectId: "object-nm" }] })
    const r = okResult({ formationResult })
    assert.ok(r.findings.length > 0, JSON.stringify(spec))
    assert.notEqual(r.effectiveState, "conflict", JSON.stringify(spec))
    assert.equal(r.effectiveState, r.baseSubjectState, JSON.stringify(spec))
  }
})

test("a supersession target binds ONLY by an exact provider and sourceObjectId tuple", () => {
  // The same object id under a DIFFERENT provider is a different object, and a member's externalId, URL, title, thread or
  // parent may never bind a target.
  const crossProvider = okResult({ formationResult: buildSubject({ sources: [
    { externalId: "ext-b1", sourceObjectId: "object-shared", supersedes: [{ provider: "slack", sourceObjectId: "object-shared", inferred: false }] },
    { externalId: "ext-b2", sourceObjectId: "object-other" }] }) })
  assert.deepEqual(crossProvider.findings.map(encode), ["external_supersession_reference"])
  // A target naming a member's F1C externalId (not its sourceObjectId) never binds.
  const byExternalId = okResult({ formationResult: buildSubject({ sources: [
    { externalId: "ext-b3", sourceObjectId: "object-b3", supersedes: [{ provider: "github", sourceObjectId: "ext-b4", inferred: false }] },
    { externalId: "ext-b4", sourceObjectId: "object-b4" }] }) })
  assert.deepEqual(byExternalId.findings.map(encode), ["external_supersession_reference"])
})

test("two members naming the same provider object fail closed instead of choosing one", () => {
  // Distinct F1C members (different externalId) may still name ONE provider object; every supersession claim would then be
  // ambiguous.
  rejects({ formationResult: buildSubject({ sources: [
    { externalId: "ext-amb1", sourceObjectId: "object-ambiguous" },
    { externalId: "ext-amb2", sourceObjectId: "object-ambiguous", supersedes: [{ provider: "github", sourceObjectId: "object-x", inferred: false }] }] }) },
  "member_object_identity_ambiguous", "duplicate member object identity")
})

test("a length-one supersession cycle cannot enter a subject: F1A rejects it at the source", () => {
  // A self-edge IS a cycle for F6A's detector, but no validated member can carry one — the F1A boundary rejects a source
  // that supersedes itself, in either direction. This is pinned here rather than asserted as F6A behaviour.
  for (const key of ["supersedes", "supersededBy"]) {
    const url = "https://example.com/github/ext-self"
    const rejected = buildFormationSourceCandidate(JSON.stringify({
      provider: "github", sourceObjectId: "object-self", navigationTarget: url,
      sourceRef: { source: "github", externalId: "ext-self", url, capturedAt: CAPTURED_AT },
      title: "Item ext-self", sanitizedSummary: "Summary for ext-self", actorAssertions: [],
      timestamps: { occurredAt: OCCURRED_AT, capturedAt: CAPTURED_AT }, sourceLinks: [{ url }], referencedObjects: [],
      supersedes: [], supersededBy: [], unresolvedMarkers: [], decisionMarkers: [], statusMarkers: [], authoritySignals: [],
      [key]: [{ provider: "github", sourceObjectId: "object-self", inferred: false }] }))
    assert.equal(rejected.ok, false, key)
    if (!rejected.ok) assert.ok(rejected.findings.some((f) => f.reason === "supersession_cycle"), key)
  }
  // The detector still treats a length-one cycle as a cycle. No input can exercise it, so the semantics are pinned
  // structurally: `node === start` is tested BEFORE the visited guard, which is what makes a self-edge count.
  const source = readFileSync(fileURLToPath(new URL("../app/lib/application/formation/findings.ts", import.meta.url)), "utf8")
  const cycleFn = source.slice(source.indexOf("function membersOnRecordedCycle"), source.indexOf("// ─── Findings"))
  assert.ok(cycleFn.includes("if (node === start) { onCycle.push(start); break }"), "a self-edge must be a cycle of length one")
  assert.ok(cycleFn.indexOf("node === start") < cycleFn.indexOf("seen.has(node)"), "the self-edge check must precede the visited guard")
})

test("a surfaced cycle changes no member, role, membership or ordering", () => {
  const formationResult = buildSubject({ roles: ["accepted_specification", "implementation"], sources: [
    { externalId: "ext-keep1", sourceObjectId: "object-keep1", supersedes: [{ provider: "github", sourceObjectId: "object-keep2", inferred: false }] },
    { externalId: "ext-keep2", sourceObjectId: "object-keep2", supersedes: [{ provider: "github", sourceObjectId: "object-keep1", inferred: false }] }] })
  const before = JSON.stringify((formationResult as { candidate: unknown }).candidate)
  const r = okResult({ formationResult })
  assert.equal(r.effectiveState, "conflict")
  assert.equal(JSON.stringify((formationResult as { candidate: unknown }).candidate), before, "the subject must not be mutated")
  // No member is dropped, re-roled, promoted to Primary Source, merged or split.
  const snapshot = snapshotValidatedFormationFindingsResult(r, formationResult)
  assert.notEqual(snapshot, null)
  assert.deepEqual(snapshot?.evidenceMemberIndexesByFinding, [[0, 1], [0, 1], [0, 1]])
})

// ─── Input boundary: one read, closed fields, internal F5 only ───────────────

test("a cloned, forged, wrapped, bare or failed F1C subject rejects", () => {
  const good = subjectOf("ext-prov", "object-prov")
  const bads: unknown[] = [{ ...good }, JSON.parse(JSON.stringify(good)), structuredClone(good),
    Object.create(good as object), new Proxy(good as object, {}), (good as { candidate?: unknown }).candidate,
    { ok: true, candidateOnly: true, candidate: { members: [], goalDoneCondition: {}, humanReviewRequired: true, candidateOnly: true } },
    buildWorkUnitFormationCandidate({ members: [], goalDoneCondition: {} } as never)]
  for (const [i, bad] of bads.entries()) rejects({ formationResult: bad }, "subject_not_validated", `look-alike ${i}`)
})

test("forbidden caller bindings — a supplied F5 result above all — reject value-free", () => {
  const formationResult = subjectOf("ext-bound", "object-bound")
  const prediction = predictFormationState({ formationResult })
  // The genuine, internally-shaped F5 success is STILL refused from the caller.
  rejects({ formationResult, statePredictionResult: prediction }, "unbound_reference_supplied", "genuine F5 result")
  for (const field of ["statePredictionResult", "statePrediction", "subjectState", "baseSubjectState", "effectiveState",
    "factors", "findings", "conflictFindings", "comparisonInput", "comparisonResult", "groupingOutcomeResult",
    "pairToken", "pairSides", "targetSide", "sourceSide", "rankingEvidence", "roi", "score", "priority", "urgency",
    "membership", "approved", "executed", "formalized", "candidateOnly", "humanReviewRequired"]) {
    for (const value of [undefined, null, {}, "x"]) {
      rejects({ formationResult, [field]: value }, "unbound_reference_supplied", `${field}=${String(value)}`)
    }
    // The probe is an own-property check, so the value is never read.
    let read = false
    rejects({ formationResult, get [field]() { read = true; return {} } }, "unbound_reference_supplied", field)
    assert.equal(read, false, `${field} must never be read`)
    // A throwing getter and a Proxy trap on a forbidden field also stay unread.
    rejects({ formationResult, get [field](): never { throw new Error("hostile") } }, "unbound_reference_supplied", field)
  }
})

test("the subject is read exactly once; hostile and malformed input fails closed", () => {
  const first = subjectOf("ext-read1", "object-read1")
  const second = buildSubject({ sources: [{ externalId: "ext-read2", sourceObjectId: "object-read2" }], goal: "none", closure: "unknown" })
  const expected = okResult({ formationResult: first })
  assert.notDeepEqual(okResult({ formationResult: second }).findings, expected.findings)
  let reads = 0
  const phaseSplit = { get formationResult() { reads += 1; return reads === 1 ? first : second } }
  const r = okResult(phaseSplit)
  assert.equal(reads, 1, "the subject must be read exactly once")
  assert.deepEqual(r.findings, expected.findings)
  assert.deepEqual(r.reasonCodes, expected.reasonCodes)
  for (const hostile of [new Proxy({}, { get() { throw new Error("hostile accessor") } }),
    { get formationResult(): never { throw new Error("hostile getter") } }]) rejects(hostile, "input_unreadable", "hostile accessor")
  for (const [i, bad] of [null, undefined, 42, "subject", [], {}, { formationResult: null }, { formationResult: {} }].entries()) {
    const failed = buildFormationFindings(bad as never)
    assert.equal(failed.ok, false, `malformed input ${i}`)
    if (!failed.ok) assert.ok(FORMATION_FINDINGS_REJECTIONS.includes(failed.reason))
  }
})

test("F5 is invoked internally from the same exact subject and its verdict is copied unchanged", () => {
  const formationResult = buildSubject({ goal: "none", closure: "unknown", sources: [
    { externalId: "ext-f5", sourceObjectId: "object-f5", actors: [{ name: "Dana" }], statusMarkers: ["approved"],
      deadline: { value: "2026-08-01T00:00:00Z", inferred: false }, authoritySignals: [{ kind: "owner_of_record", inferred: false }] }] })
  const r = okResult({ formationResult })
  const prediction = predictFormationState({ formationResult })
  assert.equal(prediction.ok, true)
  if (!prediction.ok) throw new Error("unreachable")
  assert.deepEqual(r.statePrediction, prediction)
  assert.deepEqual(r.statePrediction.factors, prediction.factors)
  assert.equal(r.statePrediction.subjectState, prediction.subjectState)
  assert.equal(r.baseSubjectState, prediction.subjectState)
  // A finding never contradicts or upgrades the canonical missing verdict.
  assert.equal(r.statePrediction.factors.missing, "present")
  assert.ok(r.findings.length > 0)
})

// ─── Output-result runtime provenance (the binding F7 must consume) ──────────

test("only the exact F6 success attests, and only against the exact subject", () => {
  const formationResult = subjectOf("ext-att", "object-att")
  const other = subjectOf("ext-att2", "object-att2")
  const r = buildFormationFindings({ formationResult })
  assert.equal(r.ok, true)
  const snapshot = snapshotValidatedFormationFindingsResult(r, formationResult)
  assert.notEqual(snapshot, null)
  assert.deepEqual(snapshot?.publicResult, r)
  assert.deepEqual(snapshot?.evidenceMemberIndexesByFinding, [])
  // A genuine result replayed against another (even attested) subject rejects.
  assert.equal(snapshotValidatedFormationFindingsResult(r, other), null)
  assert.equal(snapshotValidatedFormationFindingsResult(r, (formationResult as { candidate: unknown }).candidate), null)
  for (const [i, bad] of [{ ...(r as object) }, JSON.parse(JSON.stringify(r)), structuredClone(r),
    Object.create(r as object), new Proxy(r as object, {}), (r as { findings?: unknown }).findings,
    { ok: true, candidateOnly: true, humanReviewRequired: true, findings: [], effectiveState: "conflict" },
    buildFormationFindings({ formationResult: {} } as never), null, undefined, "x", 1,
  ].entries()) assert.equal(snapshotValidatedFormationFindingsResult(bad, formationResult), null, `look-alike ${i}`)
  for (const [i, bad] of [null, undefined, "x", 1, { ...(formationResult as object) }].entries()) {
    assert.equal(snapshotValidatedFormationFindingsResult(r, bad), null, `bad subject ${i}`)
  }
})

test("evidence positions are bounded member indexes and never leave the attestation", () => {
  const formationResult = buildSubject({ goal: "none", sources: [
    { externalId: "ext-idx1", sourceObjectId: "object-idx1", supersedes: [{ provider: "github", sourceObjectId: "object-idx2", inferred: false }] },
    { externalId: "ext-idx2", sourceObjectId: "object-idx2", supersedes: [{ provider: "github", sourceObjectId: "object-outside", inferred: true }] }] })
  const r = okResult({ formationResult })
  const snapshot = snapshotValidatedFormationFindingsResult(r, formationResult)
  assert.notEqual(snapshot, null)
  const evidence = snapshot?.evidenceMemberIndexesByFinding ?? []
  assert.equal(evidence.length, r.findings.length, "evidence must align with findings one-to-one")
  for (const positions of evidence) for (const position of positions) {
    assert.ok(Number.isInteger(position) && position >= 0 && position < 2, `out-of-range position ${position}`)
  }
  assert.deepEqual(r.findings.map(encode), ["missing_goal_field:outcome", "missing_goal_field:workObject",
    "missing_goal_field:decisionNeeded", "missing_goal_field:scope", "missing_goal_field:verifier",
    "missing_goal_field:timeHorizon", "supersession_recorded", "external_supersession_reference"])
  assert.deepEqual(evidence, [[], [], [], [], [], [], [0, 1], [1]])
})

test("repeated results are deeply equal, non-aliasing, and post-return mutation cannot reach the snapshot", () => {
  const formationResult = buildSubject({ goal: "none", sources: [
    { externalId: "ext-det1", sourceObjectId: "object-det1", supersedes: [{ provider: "github", sourceObjectId: "object-det2", inferred: false }] },
    { externalId: "ext-det2", sourceObjectId: "object-det2", supersedes: [{ provider: "github", sourceObjectId: "object-det1", inferred: false }] }] })
  const first = okResult({ formationResult })
  const second = okResult({ formationResult })
  assert.deepEqual(second, first)
  assert.equal(JSON.stringify(second), JSON.stringify(first))
  for (const [a, b] of [[second, first], [second.findings, first.findings], [second.reasonCodes, first.reasonCodes],
    [second.narrative, first.narrative], [second.statePrediction, first.statePrediction]]) assert.notEqual(a, b)
  const stored = snapshotValidatedFormationFindingsResult(first, formationResult)
  assert.notEqual(snapshotValidatedFormationFindingsResult(first, formationResult), stored, "snapshots must not alias")
  ;(first as { effectiveState: string }).effectiveState = "formal_candidate"
  ;(first.findings as FormationFinding[]).length = 0
  const after = snapshotValidatedFormationFindingsResult(first, formationResult)
  assert.deepEqual(after, stored, "mutating the public result must not alter stored evidence")
  assert.equal(after?.publicResult.effectiveState, "conflict")
  assert.deepEqual(okResult({ formationResult }), second)
})

// ─── Architecture boundary ───────────────────────────────────────────────────

test("F6A imports only formation predecessors and introduces no production consumer", () => {
  const dir = new URL("../app/lib/application/formation/", import.meta.url)
  const source = readFileSync(fileURLToPath(new URL("findings.ts", dir)), "utf8")
  assert.deepEqual([...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort(),
    ["./findingsTypes.ts", "./sourceContract.ts", "./statePrediction.ts", "./workUnitFormationAggregate.ts"])
  const types = readFileSync(fileURLToPath(new URL("findingsTypes.ts", dir)), "utf8")
  assert.deepEqual([...types.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort(),
    ["./goalDoneConditionAdapter.ts", "./goalDoneConditionAdapter.ts", "./statePredictionTypes.ts"])
  // Scanned over CODE only: the module documentation legitimately names the capabilities F6A must not have.
  const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  for (const forbidden of [/\bfetch\s*\(/, /\bDate\.now\b/, /\bMath\.random\b/, /node:/, /infrastructure/i,
    /persist/i, /repository/i, /orchestrator/i, /llm/i, /projection/i]) {
    for (const [label, text] of [["findings.ts", code(source)], ["findingsTypes.ts", code(types)]]) {
      assert.ok(!forbidden.test(text), `${label} must not contain ${forbidden}`)
    }
  }
  // F6A is not wired anywhere: F7 is the first authorized consumer and is not in this change. Only this test file may
  // import the module.
  // Matched on the import SPECIFIER, so a same-directory `./findings.ts` consumer is caught as readily as a deep path.
  // `findingsTypes.ts` is a different specifier and is deliberately not matched.
  const root = fileURLToPath(new URL("..", import.meta.url))
  const importers = execFileSync("grep", ["-rIlE", "--include=*.ts", "--include=*.tsx", "--include=*.mts",
    'from "[^"]*/findings\\.ts"', `${root}app`, `${root}tests`], { encoding: "utf8" }).trim().split("\n").sort()
  assert.deepEqual(importers.map((p) => p.slice(root.length)), ["tests/formationFindings.test.mts"])
})
