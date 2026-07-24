/**
 * F2A — Deterministic GitHub formation extraction tests.
 *
 * Proves the extractor is:
 *   - deterministic and structural: identity is composed from the repository
 *     owner/name/number only, independent of title, actor, timestamp, and URL;
 *   - trust-bounded: on success it returns the EXACT F1A builder result object,
 *     which alone attests through `snapshotValidatedFormationSourceResult` — a
 *     spread or JSON clone never attests;
 *   - source-local (no `L` extraction): no Goal, Done Condition, Source Role,
 *     authority signal, grouping, membership, or projection is ever produced;
 *   - host-safe: provider URLs are screened by parsed-hostname EQUALITY against
 *     an explicit allowlist (never substring matching), rejecting userinfo,
 *     scheme, and host-confusion forms; nothing is ever fetched;
 *   - non-mutating and free of forbidden raw/provider/tenant/token fields;
 *   - constitutionally scoped: it imports and calls F1A only — never an F1B or
 *     F1C builder, and no network/provider module.
 *
 * The forbidden-key strings and prompt-injection fixture text below are
 * negative-control data, not product data.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { extractGitHubFormationSource } from "../app/lib/application/formation/extract/github.ts"
import {
  parseProviderUrl,
  normalizeHost,
  recognizeGitHubObjectPath,
} from "../app/lib/application/formation/extract/providerUrl.ts"
import type {
  GitHubExtractionConfig,
  GitHubExtractionRejection,
  NormalizedGitHubFormationInput,
} from "../app/lib/application/formation/extract/types.ts"
import { snapshotValidatedFormationSourceResult } from "../app/lib/application/formation/sourceContract.ts"
import { P0_FORBIDDEN_CONTEXT_KEYS } from "../app/lib/application/safety/p0Policy.ts"
import { FORBIDDEN_CANDIDATE_FIELDS } from "../app/lib/application/candidate/safeWorkUnitCandidate.ts"
import { containsSensitiveValue } from "../app/lib/security/untrustedTextScan.ts"
// F1B / F1C builders are imported ONLY to assert they exist and are never
// referenced by the extractor source — the extractor must not call them.
import { buildFormationGoalDoneConditionCandidate } from "../app/lib/application/formation/goalDoneConditionAdapter.ts"
import { buildWorkUnitFormationCandidate } from "../app/lib/application/formation/workUnitFormationAggregate.ts"

// ─── Fixtures ────────────────────────────────────────────────────

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/formation/github/", import.meta.url))

type Fixture = {
  readonly input: NormalizedGitHubFormationInput
  readonly config?: GitHubExtractionConfig
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/formation/github/${name}.json`, import.meta.url), "utf8")) as Fixture
}

function run(name: string) {
  const fixture = loadFixture(name)
  return extractGitHubFormationSource(fixture.input, fixture.config)
}

// Expected outcome per fixture. Unlisted fixtures are expected to succeed.
const REJECTIONS: Readonly<Record<string, GitHubExtractionRejection>> = {
  "13-url-userinfo-spoof": "source_url_userinfo_present",
  "13b-url-host-confusion": "source_url_host_not_allowed",
  "14-url-empty-host": "source_url_host_not_allowed",
  "15-url-wrong-scheme": "source_url_scheme_not_https",
  "15b-url-javascript-scheme": "source_url_scheme_not_https",
  "16-identifier-format-char": "identity_unsafe",
  "17-summary-sanitization-failure": "source_contract_rejected",
  "18-malformed-timestamp": "source_contract_rejected",
  "19-oversized-field": "source_contract_rejected",
  // Remediation B1 — primary-source identity coherence.
  "21-primary-url-different-repo": "primary_source_identity_mismatch",
  "22-primary-url-wrong-number": "primary_source_identity_mismatch",
  "23-primary-url-wrong-kind": "primary_source_identity_mismatch",
  "24-primary-url-arbitrary-path": "primary_source_identity_mismatch",
  "25-primary-url-subresource": "primary_source_identity_mismatch",
  // Remediation B2 — sensitive primary URL.
  "28-sensitive-primary-query": "source_url_sensitive_value",
  "29-sensitive-primary-fragment": "source_url_sensitive_value",
}

function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
}

// ─── Deep scan helpers ───────────────────────────────────────────

function collect(value: unknown, keys: string[], strings: string[]): void {
  if (value === null || value === undefined) return
  if (typeof value === "string") {
    strings.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, keys, strings)
    return
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      keys.push(k)
      collect(v, keys, strings)
    }
  }
}

function scan(value: unknown): { keys: string[]; strings: string[] } {
  const keys: string[] = []
  const strings: string[] = []
  collect(value, keys, strings)
  return { keys, strings }
}

// Forbidden keys that must never appear anywhere in an extraction result.
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(
  [
    ...P0_FORBIDDEN_CONTEXT_KEYS,
    ...FORBIDDEN_CANDIDATE_FIELDS,
    "raw",
    "rawEvent",
    "rawBody",
    "payload",
    "accessToken",
    "access_token",
    "token",
    "cookie",
    "authorization",
    "tenantId",
    "tenant_id",
    "octokit",
    // downstream semantic surfaces that F2A must never emit
    "goal",
    "doneCondition",
    "done_condition",
    "verifier",
    "acceptanceCriteria",
    "sourceRole",
    "role",
    "membership",
    "grouping",
    "rank",
  ].map((k) => k.toLowerCase()),
)

// ─── The canonical source input used for behavioral proofs ───────

function baseInput(): NormalizedGitHubFormationInput {
  return loadFixture("01-open-pull-request").input
}

function successCandidate(name: string) {
  const result = run(name)
  assert.equal(result.ok, true, `${name} should extract`)
  if (!result.ok) throw new Error("unreachable")
  return result.sourceResult.candidate
}

// ─── 1–20. Fixture outcome table ─────────────────────────────────

test("every fixture yields its expected outcome", () => {
  for (const name of fixtureNames()) {
    const result = run(name)
    const expected = REJECTIONS[name]
    if (expected === undefined) {
      assert.equal(result.ok, true, `${name} should succeed`)
    } else {
      assert.equal(result.ok, false, `${name} should be rejected`)
      if (!result.ok) assert.equal(result.reason, expected, `${name} rejection reason`)
    }
  }
})

test("every successful fixture is an attested, candidate-only F1A result", () => {
  for (const name of fixtureNames()) {
    if (REJECTIONS[name] !== undefined) continue
    const result = run(name)
    assert.equal(result.ok, true, name)
    if (!result.ok) continue
    // Exact-object attestation.
    assert.notEqual(snapshotValidatedFormationSourceResult(result.sourceResult), null, `${name} attests`)
    assert.equal(result.sourceResult.candidateOnly, true)
    assert.equal(result.sourceResult.candidate.candidateOnly, true)
    assert.ok(["high", "medium", "low"].includes(result.sourceResult.candidate.extractionConfidence))
  }
})

// ─── Structured D-field mapping ──────────────────────────────────

test("open pull request maps structured D fields", () => {
  const c = successCandidate("01-open-pull-request")
  assert.equal(c.provider, "github")
  assert.equal(c.sourceObjectId, "github:example-org/example-repo#241")
  assert.equal(c.parentObjectId, "github:example-org/example-repo")
  assert.equal(c.sourceRef.source, "github")
  assert.equal(c.sourceRef.url, "https://github.com/example-org/example-repo/pull/241")
  assert.deepEqual(c.statusMarkers, ["open"])
  assert.equal(c.navigationTarget, "https://github.com/example-org/example-repo/pull/241")
  assert.deepEqual(
    c.actorAssertions,
    [
      { name: "hayato", assertedRelation: "author" },
      { name: "reviewer-a", assertedRelation: "assignee" },
    ],
  )
  assert.deepEqual(c.referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#238" },
  ])
  // navigationTarget must be one of the known source URLs (F1A invariant).
  assert.ok(c.sourceLinks.some((l) => l.url === c.navigationTarget) || c.sourceRef.url === c.navigationTarget)
})

test("status markers map from structured GitHub state, one marker each", () => {
  assert.deepEqual(successCandidate("02-draft-pull-request").statusMarkers, ["draft"])
  assert.deepEqual(successCandidate("04-changes-requested").statusMarkers, ["changes_requested"])
  assert.deepEqual(successCandidate("05-approved-review").statusMarkers, ["approved"])
  assert.deepEqual(successCandidate("06-merged-pull-request").statusMarkers, ["merged"])
  assert.deepEqual(successCandidate("07-open-issue").statusMarkers, ["open"])
  assert.deepEqual(successCandidate("08-closed-issue").statusMarkers, ["closed"])
  assert.deepEqual(successCandidate("03-review-requested").statusMarkers, ["in_review"])
})

test("review-requested assignee is a reviewer_requested relation, never authority", () => {
  const c = successCandidate("03-review-requested")
  const assignee = c.actorAssertions.find((a) => a.name === "reviewer-b")
  assert.equal(assignee?.assertedRelation, "reviewer_requested")
})

test("issue identity is composed from the issue number", () => {
  assert.equal(successCandidate("07-open-issue").sourceObjectId, "github:example-org/example-repo#300")
  assert.equal(successCandidate("08-closed-issue").sourceObjectId, "github:example-org/example-repo#301")
})

test("missing optional assignee yields a single actor assertion", () => {
  const c = successCandidate("09-missing-assignee")
  assert.equal(c.actorAssertions.length, 1)
  assert.equal(c.actorAssertions[0]?.assertedRelation, "author")
})

test("timestamps derive only from structured provider timestamps", () => {
  const c = successCandidate("01-open-pull-request")
  assert.equal(c.timestamps.occurredAt, "2026-07-17T09:00:00Z") // createdAt
  assert.equal(c.timestamps.editedAt, "2026-07-18T10:00:00Z") // updatedAt
  assert.equal(c.timestamps.capturedAt, "2026-07-19T00:00:00Z")
})

test("multiple recognized references are deduplicated", () => {
  const c = successCandidate("10-multiple-references")
  assert.deepEqual(c.referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#238" },
    { provider: "github", sourceObjectId: "github:example-org/example-repo#239" },
  ])
})

test("unrecognized external URL is retained only as an opaque source link", () => {
  const c = successCandidate("11-external-opaque-link")
  const external = c.sourceLinks.find((l) => l.url === "https://example.com/design/overview")
  assert.ok(external, "external link retained")
  assert.equal(external?.recognized, undefined, "external link is opaque (no recognized ref)")
  // The external host is never turned into a recognized reference.
  assert.ok(!c.referencedObjects.some((r) => r.sourceObjectId.includes("example.com")))
})

test("GitHub Enterprise host is trusted only through the explicit allowlist", () => {
  // Succeeds with the allowlist.
  const c = successCandidate("12-enterprise-host")
  assert.equal(c.navigationTarget, "https://github.example-corp.com/example-org/example-repo/pull/250")
  // The SAME input fails under the default (github.com-only) policy.
  const fixture = loadFixture("12-enterprise-host")
  const denied = extractGitHubFormationSource(fixture.input)
  assert.equal(denied.ok, false)
  if (!denied.ok) assert.equal(denied.reason, "source_url_host_not_allowed")
})

// ─── Identity independence (M1) ──────────────────────────────────

test("identity is independent of title, actor, timestamp, and URL path", () => {
  const base = baseInput()
  const expectedId = "github:example-org/example-repo#241"
  const variants: NormalizedGitHubFormationInput[] = [
    { ...base, title: "completely different title text" },
    { ...base, actor: "someone-else", assignee: "another" },
    { ...base, updatedAt: "2020-01-01T00:00:00Z", createdAt: "2019-01-01T00:00:00Z" },
    { ...base, sourceUrl: "https://github.com/example-org/example-repo/pull/241#discussion" },
  ]
  for (const v of variants) {
    const c = successCandidate2(v)
    assert.equal(c.sourceObjectId, expectedId)
    assert.equal(c.parentObjectId, "github:example-org/example-repo")
    // Identity never contains the title/actor text.
    assert.ok(!c.sourceObjectId.includes("different"))
    assert.ok(!c.sourceObjectId.includes("someone-else"))
  }
})

function successCandidate2(input: NormalizedGitHubFormationInput) {
  const result = extractGitHubFormationSource(input)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("unreachable")
  return result.sourceResult.candidate
}

// ─── Determinism & non-mutation ──────────────────────────────────

test("identical input gives deeply equal extraction", () => {
  const a = extractGitHubFormationSource(baseInput())
  const b = extractGitHubFormationSource(baseInput())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (a.ok && b.ok) assert.deepEqual(a.sourceResult.candidate, b.sourceResult.candidate)
})

test("input is not mutated", () => {
  const input = baseInput()
  const before = structuredClone(input)
  extractGitHubFormationSource(input)
  assert.deepEqual(input, before)
})

// ─── Attestation / exact-object handoff (M6) ─────────────────────

test("only the exact F1A builder object attests; clones do not", () => {
  const result = run("01-open-pull-request")
  assert.equal(result.ok, true)
  if (!result.ok) return
  const exact = result.sourceResult
  assert.notEqual(snapshotValidatedFormationSourceResult(exact), null)
  // Spread clone.
  assert.equal(snapshotValidatedFormationSourceResult({ ...exact }), null)
  // JSON clone.
  assert.equal(snapshotValidatedFormationSourceResult(JSON.parse(JSON.stringify(exact))), null)
  // Hand-built structural look-alike.
  assert.equal(
    snapshotValidatedFormationSourceResult({
      ok: true,
      candidateOnly: true,
      candidate: exact.candidate,
      flags: [],
    }),
    null,
  )
})

// ─── No semantic / authority / grouping extraction (M2, M5, M7) ──

test("no L field, authority, Source Role, or grouping is ever produced", () => {
  for (const name of fixtureNames()) {
    if (REJECTIONS[name] !== undefined) continue
    const c = successCandidate(name)
    // L fields omitted / empty.
    assert.deepEqual(c.unresolvedMarkers, [], `${name} unresolvedMarkers`)
    assert.deepEqual(c.decisionMarkers, [], `${name} decisionMarkers`)
    assert.deepEqual(c.authoritySignals, [], `${name} authoritySignals`)
    assert.deepEqual(c.supersedes, [], `${name} supersedes`)
    assert.deepEqual(c.supersededBy, [], `${name} supersededBy`)
    assert.equal(c.explicitDeadline, undefined, `${name} explicitDeadline`)
    assert.equal(c.versionInfo, undefined, `${name} versionInfo`)
    // No downstream semantic key anywhere.
    const { keys } = scan(c)
    for (const key of keys) {
      assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()), `${name} must not emit key ${key}`)
    }
  }
})

test("approved and merged states never become authority signals", () => {
  assert.deepEqual(successCandidate("05-approved-review").authoritySignals, [])
  assert.deepEqual(successCandidate("06-merged-pull-request").authoritySignals, [])
})

// ─── Forbidden fields absent from the whole result (M8) ──────────

test("no forbidden raw/provider/tenant/token field appears in any output", () => {
  for (const name of fixtureNames()) {
    const result = run(name)
    const { keys, strings } = scan(result)
    for (const key of keys) {
      assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()), `${name} leaks forbidden key ${key}`)
    }
    for (const s of strings) {
      assert.ok(!containsSensitiveValue(s), `${name} leaks a token-shaped value`)
    }
  }
})

// ─── URL & host policy (M3, M4) ──────────────────────────────────

test("provider host is matched by parsed-hostname equality, not substring", () => {
  // Suffix confusion: `github.com.evil.example` is NOT `github.com`.
  assert.equal(parseProviderUrl("https://github.com.evil.example/o/r/pull/1", ["github.com"]).ok, false)
  // Prefix/typo confusion.
  assert.equal(parseProviderUrl("https://notgithub.com/o/r/pull/1", ["github.com"]).ok, false)
  // Userinfo host spoof.
  const spoof = parseProviderUrl("https://github.com@evil.example/o/r/pull/1", ["github.com"])
  assert.equal(spoof.ok, false)
  if (!spoof.ok) assert.equal(spoof.reason, "userinfo_present")
  // The exact provider host is accepted.
  assert.equal(parseProviderUrl("https://github.com/o/r/pull/1", ["github.com"]).ok, true)
})

test("IDN/punycode homoglyph host never equals the ASCII provider host", () => {
  // Latin capital I-with-acute in place of 'i' → distinct punycode label.
  const homoglyph = parseProviderUrl("https://gÍthub.com/o/r/pull/1", ["github.com"])
  assert.equal(homoglyph.ok, false)
  if (!homoglyph.ok) assert.equal(homoglyph.reason, "host_not_allowed")
  // Host comparison is case-insensitive via canonicalization.
  assert.equal(parseProviderUrl("https://GitHub.com/o/r/pull/1", ["github.com"]).ok, true)
  assert.equal(normalizeHost("GitHub.COM."), "github.com")
})

test("userinfo, scheme, and empty-authority forms are all rejected", () => {
  assert.equal(parseProviderUrl("https://user:password@github.com/o/r/pull/1", ["github.com"]).ok, false)
  const scheme = parseProviderUrl("http://github.com/o/r/pull/1", ["github.com"])
  assert.equal(scheme.ok, false)
  if (!scheme.ok) assert.equal(scheme.reason, "scheme_not_https")
  const js = parseProviderUrl("javascript:alert(1)", ["github.com"])
  assert.equal(js.ok, false)
  if (!js.ok) assert.equal(js.reason, "scheme_not_https")
})

test("recognizeGitHubObjectPath accepts only exact object paths", () => {
  assert.deepEqual(recognizeGitHubObjectPath("/o/r/pull/12"), { owner: "o", name: "r", kind: "pull", number: 12 })
  assert.deepEqual(recognizeGitHubObjectPath("/o/r/issues/3"), { owner: "o", name: "r", kind: "issues", number: 3 })
  assert.equal(recognizeGitHubObjectPath("/o/r/commits/abc"), null)
  assert.equal(recognizeGitHubObjectPath("/o/r/pull/0"), null)
  assert.equal(recognizeGitHubObjectPath("/o/r/pull/01"), null)
  assert.equal(recognizeGitHubObjectPath("/o"), null)
})

// ─── Constitutional scope: F1A only, no F1B/F1C, no network ──────

const EXTRACT_SOURCES = ["github.ts", "providerUrl.ts", "types.ts"].map((f) =>
  readFileSync(new URL(`../app/lib/application/formation/extract/${f}`, import.meta.url), "utf8"),
)

test("the extractor never references an F1B or F1C builder", () => {
  // Sanity: the builders exist (so the assertion is meaningful).
  assert.equal(typeof buildFormationGoalDoneConditionCandidate, "function")
  assert.equal(typeof buildWorkUnitFormationCandidate, "function")
  const forbidden = [
    "buildFormationGoalDoneConditionCandidate",
    "buildWorkUnitFormationCandidate",
    "goalDoneConditionAdapter",
    "workUnitFormationAggregate",
    "SourceRole",
    "GoalHypothesis",
  ]
  for (const src of EXTRACT_SOURCES) {
    for (const token of forbidden) {
      assert.ok(!src.includes(token), `extractor source must not reference ${token}`)
    }
  }
})

test("the extractor imports no network or live-provider module and never fetches", () => {
  const forbidden = [
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "node:dns",
    "undici",
    "node-fetch",
    "octokit",
    "@octokit",
    "XMLHttpRequest",
  ]
  for (const src of EXTRACT_SOURCES) {
    for (const token of forbidden) {
      assert.ok(!src.includes(token), `extractor source must not import ${token}`)
    }
    assert.ok(!/\bfetch\s*\(/.test(src), "extractor source must not call fetch()")
  }
})

test("github.ts imports from formation only the F1A source contract", () => {
  const github = EXTRACT_SOURCES[0]
  const formationImports = [...github.matchAll(/from\s+"(\.\.\/[^"]+)"/g)].map((m) => m[1])
  for (const imp of formationImports) {
    if (imp.startsWith("../sourceContract")) continue
    if (imp.startsWith("../formation")) continue
    // Any other parent import must not be an F1B/F1C module.
    assert.ok(
      !imp.includes("goalDoneConditionAdapter") && !imp.includes("workUnitFormationAggregate"),
      `github.ts must not import ${imp}`,
    )
  }
  assert.ok(github.includes('from "../sourceContract.ts"'), "github.ts imports the F1A contract")
})

// ═══════════════════════════════════════════════════════════════════
// Remediation B1 / B3 / B2 + resource bound
// ═══════════════════════════════════════════════════════════════════

function extract(input: NormalizedGitHubFormationInput, config?: GitHubExtractionConfig) {
  return extractGitHubFormationSource(input, config)
}
function candidateOf(input: NormalizedGitHubFormationInput, config?: GitHubExtractionConfig) {
  const r = extract(input, config)
  assert.equal(r.ok, true)
  if (!r.ok) throw new Error("unreachable")
  return r.sourceResult.candidate
}
function expectReject(input: NormalizedGitHubFormationInput, reason: GitHubExtractionRejection, msg: string) {
  const r = extract(input)
  assert.equal(r.ok, false, msg)
  if (!r.ok) assert.equal(r.reason, reason, msg)
}

// ─── B1: primary-source identity coherence (tests 1–10) ──────────

test("B1: different owner/repository in the primary URL rejects", () => {
  expectReject({ ...baseInput(), repository: { owner: "different-org", name: "example-repo" } },
    "primary_source_identity_mismatch", "different owner")
  expectReject({ ...baseInput(), sourceUrl: "https://github.com/attacker-org/other-repo/pull/241" },
    "primary_source_identity_mismatch", "different repo in URL")
})

test("B1: wrong object number in the primary URL rejects", () => {
  expectReject({ ...baseInput(), sourceUrl: "https://github.com/example-org/example-repo/pull/999" },
    "primary_source_identity_mismatch", "wrong number")
})

test("B1: pull-request event with an issue URL rejects", () => {
  expectReject({ ...baseInput(), eventType: "pull_request", sourceUrl: "https://github.com/example-org/example-repo/issues/241" },
    "primary_source_identity_mismatch", "PR event, issue URL")
})

test("B1: issue event with a pull URL rejects", () => {
  expectReject({ ...baseInput(), eventType: "issue", number: 241, sourceUrl: "https://github.com/example-org/example-repo/pull/241" },
    "primary_source_identity_mismatch", "issue event, pull URL")
})

test("B1: arbitrary allowed-host path, repo root, and actions path reject", () => {
  for (const url of [
    "https://github.com/settings/profile",
    "https://github.com/example-org/example-repo",
    "https://github.com/example-org/example-repo/actions",
  ]) {
    expectReject({ ...baseInput(), sourceUrl: url }, "primary_source_identity_mismatch", url)
  }
})

test("B1: pull files and issue comments subresource paths reject", () => {
  expectReject({ ...baseInput(), sourceUrl: "https://github.com/example-org/example-repo/pull/241/files" },
    "primary_source_identity_mismatch", "pull files")
  expectReject({ ...baseInput(), eventType: "issue", number: 241, sourceUrl: "https://github.com/example-org/example-repo/issues/241/comments" },
    "primary_source_identity_mismatch", "issue comments")
})

test("B1: non-sensitive query on the exact object succeeds and is retained verbatim", () => {
  const c = candidateOf({ ...baseInput(), sourceUrl: "https://github.com/example-org/example-repo/pull/241?diff=split" })
  assert.equal(c.sourceObjectId, "github:example-org/example-repo#241")
  assert.equal(c.navigationTarget, "https://github.com/example-org/example-repo/pull/241?diff=split")
  // Fixture form.
  assert.equal(successCandidate("26-primary-url-query-ok").navigationTarget, "https://github.com/example-org/example-repo/pull/260?diff=split")
})

test("B1: non-sensitive fragment on the exact object succeeds and is retained verbatim", () => {
  const c = candidateOf({ ...baseInput(), sourceUrl: "https://github.com/example-org/example-repo/pull/241#discussion" })
  assert.equal(c.navigationTarget, "https://github.com/example-org/example-repo/pull/241#discussion")
  assert.equal(successCandidate("27-primary-url-fragment-ok").navigationTarget, "https://github.com/example-org/example-repo/issues/261#issuecomment-1")
})

// ─── B3: canonical provider identity (tests 11–15) ───────────────

test("B3: owner/repository case variants produce deeply equal canonical identities", () => {
  const ids = ["example-org", "Example-Org", "EXAMPLE-ORG"].map((owner) =>
    candidateOf({
      ...baseInput(),
      repository: { owner, name: "Example-Repo" },
      sourceUrl: `https://github.com/${owner}/Example-Repo/pull/241`,
      referencedUrls: [],
    }),
  )
  for (const c of ids) {
    assert.equal(c.sourceObjectId, "github:example-org/example-repo#241")
    assert.equal(c.parentObjectId, "github:example-org/example-repo")
    assert.equal(c.sourceRef.externalId, "example-org/example-repo#241")
    assert.equal(c.sourceRef.container, "example-org/example-repo")
  }
})

test("B3: primary path case variants still match the structured identity", () => {
  // Structured lowercase, URL path upper-case → same object, accepted.
  const c = candidateOf({ ...baseInput(), sourceUrl: "https://github.com/EXAMPLE-ORG/EXAMPLE-REPO/pull/241", referencedUrls: [] })
  assert.equal(c.sourceObjectId, "github:example-org/example-repo#241")
})

test("B3: recognized references canonicalize case and dedupe case-only duplicates to one identity", () => {
  const c = successCandidate("30-canonical-case-variant")
  assert.equal(c.sourceObjectId, "github:example-org/example-repo#262")
  assert.deepEqual(c.referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#238" },
  ])
})

test("B3: case variants can no longer create distinct member identities solely from casing", () => {
  // Focused duplicate-identity assertion over canonical output (no F1C call).
  const a = candidateOf({ ...baseInput(), repository: { owner: "Example-Org", name: "Example-Repo" },
    sourceUrl: "https://github.com/Example-Org/Example-Repo/pull/241", referencedUrls: [] })
  const b = candidateOf({ ...baseInput(), repository: { owner: "example-org", name: "example-repo" },
    sourceUrl: "https://github.com/example-org/example-repo/pull/241", referencedUrls: [] })
  assert.equal(a.sourceObjectId, b.sourceObjectId)
  assert.equal(a.parentObjectId, b.parentObjectId)
  const memberIds = new Set([a.sourceObjectId, b.sourceObjectId])
  assert.equal(memberIds.size, 1, "casing must not fork the member identity")
})

// ─── B2: sensitive URL rejection (tests 16–27) ───────────────────

const CREDENTIAL_QUERIES: Readonly<Record<string, string>> = {
  "ghp_ token": "token=ghp_0123456789abcdefghijABCDEF",
  "github_pat_": "token=github_pat_11ABCDEFG0abcdefghij",
  "xoxb-": "q=xoxb-1234567890-abcdefghijkl",
  "Bearer JWT": "q=Bearer%20eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF12345",
  "AKIA": "k=AKIAIOSFODNN7EXAMPLE",
  "access_token key": "access_token=anything123456",
  "authorization key": "authorization=whatever",
  "cookie key": "cookie=sessionvalue1234567",
  "api_key key": "api_key=secret123456789",
  "percent-encoded ghp": "state=%67hp_0123456789abcdefghij",
}

test("B2: sensitive primary URL query rejects (fixture + credential families)", () => {
  const r = run("28-sensitive-primary-query")
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "source_url_sensitive_value")
  for (const [label, q] of Object.entries(CREDENTIAL_QUERIES)) {
    expectReject({ ...baseInput(), sourceUrl: `https://github.com/example-org/example-repo/pull/241?${q}`, referencedUrls: [] },
      "source_url_sensitive_value", label)
  }
})

test("B2: sensitive primary URL fragment rejects", () => {
  const r = run("29-sensitive-primary-fragment")
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.reason, "source_url_sensitive_value")
  expectReject({ ...baseInput(), sourceUrl: "https://github.com/example-org/example-repo/pull/241#access_token=ghp_0123456789abcdefghij", referencedUrls: [] },
    "source_url_sensitive_value", "fragment ghp")
})

test("B2: a sensitive referenced URL is absent from every output field and is not echoed", () => {
  const c = successCandidate("31-sensitive-referenced-dropped")
  const serialized = JSON.stringify(c)
  assert.ok(!serialized.includes("ghp_"), "no token substring anywhere")
  assert.ok(!serialized.includes("access_token"), "no credential param anywhere")
  // The one benign reference remains; the sensitive one is gone.
  assert.deepEqual(c.referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#239" },
  ])
  for (const link of c.sourceLinks) assert.ok(!link.url.includes("access_token"), "no sensitive source link")
  // The primary navigation target is the clean object URL.
  assert.equal(c.navigationTarget, "https://github.com/example-org/example-repo/pull/263")
})

test("B2: a sensitive-URL rejection value never echoes the URL or the secret", () => {
  const r = extract({ ...baseInput(), sourceUrl: "https://github.com/example-org/example-repo/pull/241?access_token=ghp_0123456789abcdefghijABCDEF", referencedUrls: [] })
  assert.equal(r.ok, false)
  const serialized = JSON.stringify(r)
  assert.ok(!serialized.includes("ghp_"))
  assert.ok(!serialized.includes("access_token"))
  assert.ok(!serialized.includes("github.com"))
  if (!r.ok) assert.deepEqual(Object.keys(r).sort(), ["ok", "reason"])
})

test("B2: ordinary non-sensitive query and fragment remain accepted", () => {
  for (const url of [
    "https://github.com/example-org/example-repo/pull/241?diff=split&w=1",
    "https://github.com/example-org/example-repo/pull/241#discussion_r123",
    "https://github.com/example-org/example-repo/pull/241?tab=files",
  ]) {
    const r = extract({ ...baseInput(), sourceUrl: url, referencedUrls: [] })
    assert.equal(r.ok, true, url)
  }
})

// ─── Resource bound (tests 28–31) ────────────────────────────────

function repoUrls(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://github.com/example-org/example-repo/pull/${(i % 40) + 1}`)
}

test("resource bound: 49 referenced URLs are processed deterministically", () => {
  const c = candidateOf({ ...baseInput(), referencedUrls: repoUrls(49) })
  assert.ok(c.referencedObjects.length >= 1 && c.referencedObjects.length <= 40)
})

test("resource bound: 50 referenced URLs reject before iteration", () => {
  expectReject({ ...baseInput(), referencedUrls: repoUrls(50) }, "referenced_urls_too_many", "50 refs")
})

test("resource bound: 1,000 / 10,000 / 100,000 arrays reject through the same bounded path", () => {
  for (const n of [1_000, 10_000, 100_000]) {
    expectReject({ ...baseInput(), referencedUrls: repoUrls(n) }, "referenced_urls_too_many", `${n} refs`)
  }
})

test("resource bound: the input referenced-URL array is not truncated or mutated", () => {
  const urls = repoUrls(50)
  const input: NormalizedGitHubFormationInput = { ...baseInput(), referencedUrls: urls }
  const before = structuredClone(input)
  extract(input)
  assert.equal(urls.length, 50)
  assert.deepEqual(input, before)
})

// ─── Regression invariants (tests 32–38) ─────────────────────────

test("regression: exact F1A object still attests; clones still do not", () => {
  const r = run("01-open-pull-request")
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.notEqual(snapshotValidatedFormationSourceResult(r.sourceResult), null)
  assert.equal(snapshotValidatedFormationSourceResult({ ...r.sourceResult }), null)
  assert.equal(snapshotValidatedFormationSourceResult(JSON.parse(JSON.stringify(r.sourceResult))), null)
  assert.equal(snapshotValidatedFormationSourceResult(structuredClone(r.sourceResult)), null)
})

test("regression: no Goal/Done Condition/SourceRole/grouping field after remediation", () => {
  for (const name of fixtureNames()) {
    if (REJECTIONS[name] !== undefined) continue
    const c = successCandidate(name)
    assert.deepEqual(c.authoritySignals, [])
    assert.deepEqual(c.unresolvedMarkers, [])
    assert.deepEqual(c.decisionMarkers, [])
    const { keys } = scan(c)
    for (const key of keys) assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()), `${name} key ${key}`)
  }
})

test("regression: host spoof / userinfo / IDN controls remain green", () => {
  assert.equal(parseProviderUrl("https://github.com.evil.example/o/r/pull/1", ["github.com"]).ok, false)
  assert.equal(parseProviderUrl("https://github.com@evil.example/o/r/pull/1", ["github.com"]).ok, false)
  assert.equal(parseProviderUrl("https://gÍthub.com/o/r/pull/1", ["github.com"]).ok, false)
  assert.equal(parseProviderUrl("https://github.com/o/r/pull/1", ["github.com"]).ok, true)
})

test("regression: safe external links remain opaque after remediation", () => {
  const c = successCandidate("11-external-opaque-link")
  const external = c.sourceLinks.find((l) => l.url === "https://example.com/design/overview")
  assert.ok(external)
  assert.equal(external?.recognized, undefined)
})

test("regression: no network/provider client import appears (incl. new sensitive screen)", () => {
  for (const src of EXTRACT_SOURCES) {
    for (const token of ["node:http", "node:https", "undici", "node-fetch", "octokit", "@octokit", "XMLHttpRequest"]) {
      assert.ok(!src.includes(token), `must not import ${token}`)
    }
    assert.ok(!/\bfetch\s*\(/.test(src), "must not call fetch()")
  }
})

test("regression: identical input remains deterministic after remediation", () => {
  const a = extract(baseInput())
  const b = extract(baseInput())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (a.ok && b.ok) assert.deepEqual(a.sourceResult.candidate, b.sourceResult.candidate)
})

test("B2: providerUrl still exposes containsSensitiveValue-backed screening (authority reuse)", () => {
  // The screen must reject a bare provider token even under a benign param name,
  // proving it is not merely a forbidden-key check.
  assert.equal(parseProviderUrl("https://github.com/o/r/pull/1?ref=ghp_0123456789abcdefghij", ["github.com"]).ok, false)
  assert.equal(parseProviderUrl("https://github.com/o/r/pull/1?ref=main", ["github.com"]).ok, true)
})
