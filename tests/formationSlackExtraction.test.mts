/**
 * F2B — Deterministic Slack formation extraction tests.
 *
 * Proves the extractor is:
 *   - deterministic and structural: identity is composed from the provider-native
 *     workspace / channel / message timestamp only, independent of title, summary,
 *     actor, assignee, channel name, and URL display text;
 *   - trust-bounded: on success it returns the EXACT F1A builder result object,
 *     which alone attests through `snapshotValidatedFormationSourceResult` — a
 *     spread or JSON clone never attests;
 *   - source-local (no `L` extraction): no Goal, Done Condition, Decision Needed,
 *     Source Role, authority signal, unresolved marker, grouping, membership, or
 *     projection is ever produced; a `decision_request` / `thread_needs_reply`
 *     event never becomes a marker;
 *   - identity-coherent: workspace/host, channel/message permalink, and thread
 *     query cannot disagree with the normalized identity;
 *   - host-safe: provider URLs are screened by the merged F2A boundary
 *     (`parseProviderUrl`) via parsed-hostname EQUALITY against the configured host,
 *     rejecting userinfo/scheme/host-confusion/IDN and sensitive-value forms;
 *     nothing is ever fetched;
 *   - non-mutating and free of forbidden raw/provider/tenant/token fields;
 *   - constitutionally scoped: it imports and calls F1A only — never an F1B or F1C
 *     builder, never an infrastructure Slack event/mapper, and no network module.
 *
 * The token-shaped fixture URLs below are negative-control data, not product data.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { extractSlackFormationSource } from "../app/lib/application/formation/extract/slack.ts"
import { recognizeSlackPermalink } from "../app/lib/application/formation/extract/slackUrl.ts"
import { parseProviderUrl, normalizeHost } from "../app/lib/application/formation/extract/providerUrl.ts"
import type {
  NormalizedSlackFormationInput,
  SlackExtractionConfig,
  SlackExtractionRejection,
} from "../app/lib/application/formation/extract/slackTypes.ts"
import { snapshotValidatedFormationSourceResult } from "../app/lib/application/formation/sourceContract.ts"
import { P0_FORBIDDEN_CONTEXT_KEYS } from "../app/lib/application/safety/p0Policy.ts"
import { FORBIDDEN_CANDIDATE_FIELDS } from "../app/lib/application/candidate/safeWorkUnitCandidate.ts"
import { containsSensitiveValue } from "../app/lib/security/untrustedTextScan.ts"
// F1B / F1C builders are imported ONLY to assert they exist and are never
// referenced by the extractor source — the extractor must not call them.
import { buildFormationGoalDoneConditionCandidate } from "../app/lib/application/formation/goalDoneConditionAdapter.ts"
import { buildWorkUnitFormationCandidate } from "../app/lib/application/formation/workUnitFormationAggregate.ts"

// ─── Fixtures ────────────────────────────────────────────────────

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/formation/slack/", import.meta.url))

type Fixture = {
  readonly config: SlackExtractionConfig
  readonly input: NormalizedSlackFormationInput
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/formation/slack/${name}.json`, import.meta.url), "utf8")) as Fixture
}

function run(name: string) {
  const fixture = loadFixture(name)
  return extractSlackFormationSource(fixture.input, fixture.config)
}

// Expected outcome per fixture. Unlisted fixtures are expected to succeed.
const REJECTIONS: Readonly<Record<string, SlackExtractionRejection>> = {
  "13-primary-channel-mismatch": "primary_source_identity_mismatch",
  "14-primary-message-mismatch": "primary_source_identity_mismatch",
  "15-channel-name-in-path": "primary_source_identity_mismatch",
  "16-arbitrary-slack-path": "primary_source_identity_mismatch",
  "17-subresource-path": "primary_source_identity_mismatch",
  "18-missing-thread-query": "thread_identity_mismatch",
  "19-wrong-thread-ts": "thread_identity_mismatch",
  "20-wrong-cid": "thread_identity_mismatch",
  "21-unexpected-query-key": "primary_source_identity_mismatch",
  "22-non-empty-fragment": "primary_source_identity_mismatch",
  "23-host-spoof": "source_url_host_not_allowed",
  "24-userinfo": "source_url_userinfo_present",
  "25-wrong-scheme": "source_url_scheme_not_https",
  "26-idn-host-confusion": "source_url_host_not_allowed",
  "27-sensitive-primary-url": "source_url_sensitive_value",
  "29-malformed-workspace-id": "identity_unsafe",
  "30-malformed-channel-id": "identity_unsafe",
  "31-lowercase-provider-id": "identity_unsafe",
  "32-numeric-message-ts": "identity_unsafe",
  "33-malformed-message-ts": "identity_unsafe",
  "34-thread-root-equals-message": "identity_unsafe",
  "36-fifty-references": "referenced_urls_too_many",
}

function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
}

function successCandidate(name: string) {
  const result = run(name)
  assert.equal(result.ok, true, `${name} should extract`)
  if (!result.ok) throw new Error("unreachable")
  return result.sourceResult.candidate
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

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(
  [
    ...P0_FORBIDDEN_CONTEXT_KEYS,
    ...FORBIDDEN_CANDIDATE_FIELDS,
    "raw",
    "rawEvent",
    "rawBody",
    "payload",
    "blocks",
    "attachments",
    "files",
    "accessToken",
    "access_token",
    "token",
    "botToken",
    "userToken",
    "cookie",
    "authorization",
    "tenantId",
    "tenant_id",
    "slackClient",
    "webClient",
    // downstream semantic surfaces that F2B must never emit
    "goal",
    "doneCondition",
    "done_condition",
    "verifier",
    "acceptanceCriteria",
    "decisionNeeded",
    "sourceRole",
    "role",
    "membership",
    "grouping",
    "rank",
  ].map((k) => k.toLowerCase()),
)

// ─── Canonical config + inputs used for behavioral proofs ────────

const STD_CONFIG: SlackExtractionConfig = { workspaces: [{ workspaceId: "T012ABCDEF", host: "example-workspace.slack.com" }] }

function baseInput(): NormalizedSlackFormationInput {
  return loadFixture("01-root-mention").input
}

function extract(input: NormalizedSlackFormationInput, config: SlackExtractionConfig = STD_CONFIG) {
  return extractSlackFormationSource(input, config)
}

function candidateOf(input: NormalizedSlackFormationInput, config: SlackExtractionConfig = STD_CONFIG) {
  const result = extract(input, config)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("unreachable")
  return result.sourceResult.candidate
}

// ─── 1. Fixture outcome table ────────────────────────────────────

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
    assert.notEqual(snapshotValidatedFormationSourceResult(result.sourceResult), null, `${name} attests`)
    assert.equal(result.sourceResult.candidateOnly, true)
    assert.equal(result.sourceResult.candidate.candidateOnly, true)
  }
})

// ─── Structured D-field mapping (Sections 8, 11) ─────────────────

test("top-level mention maps structured D fields with `/`-separated identity", () => {
  const c = successCandidate("01-root-mention")
  assert.equal(c.provider, "slack")
  assert.equal(c.sourceObjectId, "slack:T012ABCDEF/C1234567890/1710000000.000100")
  assert.equal(c.parentObjectId, "slack:T012ABCDEF/C1234567890") // channel, for a top-level message
  assert.equal(c.sourceRef.source, "slack")
  assert.equal(c.sourceRef.externalId, "C1234567890:1710000000.000100")
  assert.equal(c.sourceRef.container, "T012ABCDEF/C1234567890")
  assert.equal(c.sourceRef.url, "https://example-workspace.slack.com/archives/C1234567890/p1710000000000100")
  assert.deepEqual(c.statusMarkers, ["open"])
  assert.equal(c.navigationTarget, "https://example-workspace.slack.com/archives/C1234567890/p1710000000000100")
  assert.deepEqual(c.actorAssertions, [
    { name: "hayato", assertedRelation: "author" },
    { name: "reviewer-a", assertedRelation: "assignee" },
  ])
  // navigationTarget must be one of the known source URLs (F1A invariant).
  assert.ok(c.sourceRef.url === c.navigationTarget)
})

test("threaded reply parent is the thread ROOT, not the channel; reply is its own object", () => {
  const c = successCandidate("02-thread-reply-needs-response")
  assert.equal(c.sourceObjectId, "slack:T012ABCDEF/C1234567890/1710000500.000200")
  assert.equal(c.parentObjectId, "slack:T012ABCDEF/C1234567890/1710000000.000100")
  assert.notEqual(c.sourceObjectId, c.parentObjectId)
  // editedAt appears because updatedAt differs from messageAt.
  assert.equal(c.timestamps.editedAt, "2026-07-18T12:00:00Z")
})

test("status markers come only from the normalized sourceStatus, one marker each", () => {
  assert.deepEqual(successCandidate("01-root-mention").statusMarkers, ["open"])
  assert.deepEqual(successCandidate("03-decision-request").statusMarkers, ["in_review"])
  assert.deepEqual(successCandidate("06-closed-status").statusMarkers, ["closed"])
})

test("missing actor / assignee each yield a single, correct actor assertion", () => {
  const noActor = successCandidate("04-missing-actor")
  assert.deepEqual(noActor.actorAssertions, [{ name: "reviewer-a", assertedRelation: "assignee" }])
  const noAssignee = successCandidate("05-missing-assignee")
  assert.deepEqual(noAssignee.actorAssertions, [{ name: "hayato", assertedRelation: "author" }])
})

test("occurredAt is the messageAt authority — NEVER derived from the messageTs identity", () => {
  const c = successCandidate("01-root-mention")
  assert.equal(c.timestamps.occurredAt, "2026-07-18T10:00:00Z") // messageAt
  assert.equal(c.timestamps.capturedAt, "2026-07-19T00:00:00Z")
  // messageTs 1710000000 as a unix instant would be 2024-03-09; occurredAt must not be that.
  assert.ok(!c.timestamps.occurredAt.startsWith("2024"), "occurredAt must not be derived from messageTs")
  assert.equal(c.timestamps.editedAt, undefined) // updatedAt === messageAt
})

// ─── Referenced links (Section 14) ───────────────────────────────

test("shared GitHub PR/Issue links become canonical referenced objects", () => {
  assert.deepEqual(successCandidate("07-shared-github-pr").referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#238" },
  ])
  assert.deepEqual(successCandidate("08-shared-github-issue").referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#239" },
  ])
})

test("a recognized Slack permalink reference is a slack referenced object with mapped workspace id", () => {
  const c = successCandidate("09-recognized-slack-ref")
  assert.deepEqual(c.referencedObjects, [
    { provider: "slack", sourceObjectId: "slack:T012ABCDEF/C1234567890/1709999999.000300" },
  ])
})

test("a safe external link is retained only as an opaque source link", () => {
  const c = successCandidate("10-opaque-external-link")
  const external = c.sourceLinks.find((l) => l.url === "https://example.com/design/overview")
  assert.ok(external, "external link retained")
  assert.equal(external?.recognized, undefined, "external link is opaque")
  assert.deepEqual(c.referencedObjects, [])
})

test("second Slack workspace host is trusted only through its explicit binding", () => {
  const c = successCandidate("11-second-workspace-host")
  assert.equal(c.sourceObjectId, "slack:T099SECOND/C2222222222/1710000000.000100")
  // The SAME input under a config that does not bind that workspace fails closed.
  const fixture = loadFixture("11-second-workspace-host")
  const denied = extractSlackFormationSource(fixture.input, STD_CONFIG)
  assert.equal(denied.ok, false)
  if (!denied.ok) assert.equal(denied.reason, "workspace_not_configured")
})

test("GitHub Enterprise host is recognized only through the explicit githubHosts allowlist", () => {
  const c = successCandidate("12-github-enterprise-host")
  assert.deepEqual(c.referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#250" },
  ])
})

// ─── Identity independence (M1) ──────────────────────────────────

test("identity is independent of title, summary, actor, assignee, and channel name", () => {
  const base = baseInput()
  const expectedId = "slack:T012ABCDEF/C1234567890/1710000000.000100"
  const variants: NormalizedSlackFormationInput[] = [
    { ...base, title: "completely different title text" },
    { ...base, summary: "an unrelated summary" },
    { ...base, actor: "someone-else", assignee: "another" },
    { ...base, channelName: "renamed-channel" },
  ]
  for (const v of variants) {
    const c = candidateOf(v)
    assert.equal(c.sourceObjectId, expectedId)
    assert.equal(c.parentObjectId, "slack:T012ABCDEF/C1234567890")
    assert.ok(!c.sourceObjectId.includes("different"))
    assert.ok(!c.sourceObjectId.includes("someone-else"))
    assert.ok(!c.sourceObjectId.includes("renamed-channel"))
  }
})

// ─── Message-timestamp identity (M2) ─────────────────────────────

test("two messages in one channel with different timestamps get distinct identities", () => {
  const a = candidateOf(baseInput())
  const b = candidateOf({
    ...baseInput(),
    messageTs: "1710000900.000900",
    sourceUrl: "https://example-workspace.slack.com/archives/C1234567890/p1710000900000900",
  })
  assert.notEqual(a.sourceObjectId, b.sourceObjectId)
  assert.equal(b.sourceObjectId, "slack:T012ABCDEF/C1234567890/1710000900.000900")
})

// ─── Determinism & non-mutation ──────────────────────────────────

test("identical input+config gives deeply equal extraction", () => {
  const a = extract(baseInput())
  const b = extract(baseInput())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (a.ok && b.ok) assert.deepEqual(a.sourceResult.candidate, b.sourceResult.candidate)
})

test("input and configuration are not mutated", () => {
  const input = loadFixture("37-full-field-success").input
  const config = loadFixture("37-full-field-success").config
  const beforeInput = structuredClone(input)
  const beforeConfig = structuredClone(config)
  extractSlackFormationSource(input, config)
  assert.deepEqual(input, beforeInput)
  assert.deepEqual(config, beforeConfig)
})

// ─── Attestation / exact-object handoff (M9) ─────────────────────

test("only the exact F1A builder object attests; clones do not", () => {
  const result = run("01-root-mention")
  assert.equal(result.ok, true)
  if (!result.ok) return
  const exact = result.sourceResult
  assert.notEqual(snapshotValidatedFormationSourceResult(exact), null)
  assert.equal(snapshotValidatedFormationSourceResult({ ...exact }), null) // spread clone
  assert.equal(snapshotValidatedFormationSourceResult(JSON.parse(JSON.stringify(exact))), null) // JSON clone
  assert.equal(
    snapshotValidatedFormationSourceResult({
      ok: true,
      candidateOnly: true,
      candidate: exact.candidate,
      flags: [],
    }),
    null,
  ) // hand-built look-alike
})

// ─── No semantic / authority / grouping extraction (M3, M11) ─────

test("no L field, authority, Source Role, decision/unresolved marker, or grouping is produced", () => {
  for (const name of fixtureNames()) {
    if (REJECTIONS[name] !== undefined) continue
    const c = successCandidate(name)
    assert.deepEqual(c.unresolvedMarkers, [], `${name} unresolvedMarkers`)
    assert.deepEqual(c.decisionMarkers, [], `${name} decisionMarkers`)
    assert.deepEqual(c.authoritySignals, [], `${name} authoritySignals`)
    assert.deepEqual(c.supersedes, [], `${name} supersedes`)
    assert.deepEqual(c.supersededBy, [], `${name} supersededBy`)
    assert.equal(c.explicitDeadline, undefined, `${name} explicitDeadline`)
    assert.equal(c.versionInfo, undefined, `${name} versionInfo`)
    const { keys } = scan(c)
    for (const key of keys) {
      assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()), `${name} must not emit key ${key}`)
    }
  }
})

test("a decision_request event never creates a decision marker; provider/event never imply authority", () => {
  const decision = successCandidate("03-decision-request")
  assert.deepEqual(decision.decisionMarkers, [])
  assert.deepEqual(decision.authoritySignals, [])
  const reply = successCandidate("02-thread-reply-needs-response")
  assert.deepEqual(reply.unresolvedMarkers, [])
  // Provider does not imply a Source Role (no role field is emitted at all).
  const { keys } = scan(successCandidate("37-full-field-success"))
  assert.ok(!keys.map((k) => k.toLowerCase()).includes("sourcerole"))
  assert.ok(!keys.map((k) => k.toLowerCase()).includes("role"))
})

// ─── Forbidden fields absent from the whole result (M10) ─────────

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

// ─── URL & host policy (M7) ──────────────────────────────────────

test("workspace host is matched by parsed-hostname equality, not substring or IDN homoglyph", () => {
  const spoof = run("23-host-spoof")
  assert.equal(spoof.ok, false)
  if (!spoof.ok) assert.equal(spoof.reason, "source_url_host_not_allowed")
  const idn = run("26-idn-host-confusion")
  assert.equal(idn.ok, false)
  if (!idn.ok) assert.equal(idn.reason, "source_url_host_not_allowed")
  // Direct boundary checks.
  assert.equal(parseProviderUrl("https://example-workspace.slack.com.evil.example/x", ["example-workspace.slack.com"]).ok, false)
  assert.equal(parseProviderUrl("https://example-workspace.slack.com/x", ["example-workspace.slack.com"]).ok, true)
  assert.equal(normalizeHost("Example-Workspace.Slack.COM."), "example-workspace.slack.com")
})

// ─── Sensitive URL policy (M8) ───────────────────────────────────

test("a sensitive primary URL rejects the whole extraction with no echo", () => {
  const result = run("27-sensitive-primary-url")
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.reason, "source_url_sensitive_value")
  // The rejection carries only the closed discriminator — no URL/token echo.
  assert.deepEqual(Object.keys(result), ["ok", "reason"])
  assert.ok(!JSON.stringify(result).includes("xoxb"))
})

test("a sensitive referenced URL is dropped completely; the rest of the extraction succeeds", () => {
  const c = successCandidate("28-sensitive-referenced-url")
  const { strings } = scan(c)
  for (const s of strings) {
    assert.ok(!s.includes("xoxb"), "sensitive value must not survive")
    assert.ok(!s.includes("access_token"), "sensitive param must not survive")
  }
  // The safe GitHub reference in the same array is still recognized.
  assert.deepEqual(c.referencedObjects, [
    { provider: "github", sourceObjectId: "github:example-org/example-repo#238" },
  ])
})

// ─── Resource bound (M12) ────────────────────────────────────────

test("referenced-URL bound: 49 accepted, 50 rejected before iteration", () => {
  assert.equal(run("35-forty-nine-references").ok, true)
  const over = run("36-fifty-references")
  assert.equal(over.ok, false)
  if (!over.ok) assert.equal(over.reason, "referenced_urls_too_many")
  // Larger arrays are still bounded (rejected without unbounded work).
  for (const n of [50, 1000, 10000]) {
    const many = extract({ ...baseInput(), referencedUrls: Array.from({ length: n }, (_, i) => `https://example.com/d-${i}`) })
    assert.equal(many.ok, false)
    if (!many.ok) assert.equal(many.reason, "referenced_urls_too_many")
  }
})

// ─── Configuration bijection (Section 6) ─────────────────────────

test("workspace-host configuration must be a non-empty bijection", () => {
  const input = baseInput()
  const cases: SlackExtractionConfig[] = [
    { workspaces: [] }, // empty
    { workspaces: [{ workspaceId: "T012ABCDEF", host: "example-workspace.slack.com" }, { workspaceId: "T099SECOND", host: "example-workspace.slack.com" }] }, // one host → two workspaces
    { workspaces: [{ workspaceId: "T012ABCDEF", host: "example-workspace.slack.com" }, { workspaceId: "T012ABCDEF", host: "other.slack.com" }] }, // one workspace → two hosts
    { workspaces: [{ workspaceId: "T012ABCDEF", host: "not a host !!" }] }, // malformed host
    { workspaces: [{ workspaceId: "t012abcdef", host: "example-workspace.slack.com" }] }, // malformed workspace id
  ]
  for (const config of cases) {
    const result = extractSlackFormationSource(input, config)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "config_invalid")
  }
  // A well-formed duplicate binding (same host + same workspace twice) is accepted.
  const dup = extractSlackFormationSource(input, {
    workspaces: [
      { workspaceId: "T012ABCDEF", host: "example-workspace.slack.com" },
      { workspaceId: "T012ABCDEF", host: "example-workspace.slack.com" },
    ],
  })
  assert.equal(dup.ok, true)
})

// ─── Event type validation / preservation (M13) ──────────────────

test("every supported event type is accepted; an unsupported event type is rejected", () => {
  for (const eventType of ["mention_request", "thread_needs_reply", "decision_request"] as const) {
    const input = eventType === "thread_needs_reply"
      ? loadFixture("02-thread-reply-needs-response").input
      : { ...baseInput(), eventType }
    assert.equal(extract(input).ok, true, `${eventType} accepted`)
  }
  const unsupported = extract({ ...baseInput(), eventType: "channel_archived" as unknown as NormalizedSlackFormationInput["eventType"] })
  assert.equal(unsupported.ok, false)
  if (!unsupported.ok) assert.equal(unsupported.reason, "event_type_unsupported")
})

// ─── Constitutional source scan (M13, F1B/F1C, network) ──────────

test("extractor source imports F1A + shared URL boundary only — no F1B/F1C, infra, or network", () => {
  const readSource = (rel: string) => readFileSync(new URL(`../app/lib/application/formation/extract/${rel}`, import.meta.url), "utf8")
  const slack = readSource("slack.ts")
  const slackUrl = readSource("slackUrl.ts")
  const slackTypes = readSource("slackTypes.ts")
  const all = slack + slackUrl + slackTypes

  // Calls F1A only.
  assert.ok(slack.includes("buildFormationSourceCandidate"), "must call the F1A builder")
  // Never the F1B / F1C builders.
  assert.ok(!all.includes("goalDoneConditionAdapter"), "must not import F1B")
  assert.ok(!all.includes("workUnitFormationAggregate"), "must not import F1C")
  assert.ok(!all.includes("buildFormationGoalDoneConditionCandidate"))
  assert.ok(!all.includes("buildWorkUnitFormationCandidate"))
  // Never the infrastructure Slack event/mapper surface.
  assert.ok(!all.includes("infrastructure/external/slack"), "must not import infra slack")
  assert.ok(!all.includes("workunitInbox/sources/slack"), "must not import inbox slack")
  assert.ok(!all.includes("slackEventToNormalizedToolSignal"), "must not route through the infra mapper")
  assert.ok(!all.includes("SlackNormalizedEvent"), "must not import the infra normalized event")
  // Never a network / provider-client surface.
  for (const forbidden of ["node:http", "node:https", "undici", "@slack/", "WebClient", "fetch(", "octokit"]) {
    assert.ok(!all.includes(forbidden), `must not reference ${forbidden}`)
  }
  // The imported F1B/F1C builders exist (proving the negative check is meaningful).
  assert.equal(typeof buildFormationGoalDoneConditionCandidate, "function")
  assert.equal(typeof buildWorkUnitFormationCandidate, "function")
})

// ─── Permalink recognizer unit tests (Sections 9–10) ─────────────

test("recognizeSlackPermalink parses a canonical permalink and refuses malformed forms", () => {
  const ok = recognizeSlackPermalink("https://h.slack.com/archives/C1234567890/p1710000000000100")
  assert.deepEqual(ok, { channelId: "C1234567890", messageTs: "1710000000.000100", threadTs: undefined, cid: undefined })
  const reply = recognizeSlackPermalink("https://h.slack.com/archives/C1234567890/p1710000500000200?thread_ts=1710000000.000100&cid=C1234567890")
  assert.deepEqual(reply, { channelId: "C1234567890", messageTs: "1710000500.000200", threadTs: "1710000000.000100", cid: "C1234567890" })

  // Structural refusals → null.
  assert.equal(recognizeSlackPermalink("https://h/archives/engineering/p1710000000000100"), null) // channel name
  assert.equal(recognizeSlackPermalink("https://h/archives/C1234567890/p1710000000000100/files"), null) // subresource
  assert.equal(recognizeSlackPermalink("https://h/archives/C1234567890%2Fx/p1710000000000100"), null) // encoded slash
  assert.equal(recognizeSlackPermalink("https://h/archives/../p1710000000000100"), null) // traversal
  assert.equal(recognizeSlackPermalink("https://h/messages/C1234567890"), null) // arbitrary path
  assert.equal(recognizeSlackPermalink("https://h/archives/C1234567890/p1710000000000100#x"), null) // fragment
  assert.equal(recognizeSlackPermalink("https://h/archives/C1234567890/p1710000000000100?foo=bar"), null) // unexpected key
  assert.equal(recognizeSlackPermalink("https://h/archives/C1234567890/p1710000000000100?thread_ts=1&thread_ts=2"), null) // dup key
})

// ─── Referenced Slack permalink self-coherence (Section 10, blocker fix) ──────
//
// A referenced Slack permalink becomes referencedObjects[].provider = "slack" ONLY
// when its query is internally self-consistent with its path; otherwise the URL is
// retained as an OPAQUE source link and never recognized. These tests inspect the
// FINAL F1A candidate, not an intermediate helper. The referenced message path is
// distinct from the primary (…000100), so it is never the primary self-reference.

const REF_HOST = "https://example-workspace.slack.com"
const REF_PATH = `${REF_HOST}/archives/C1234567890/p1709999999000300` // → 1709999999.000300
const REF_SLACK_ID = "slack:T012ABCDEF/C1234567890/1709999999.000300"

function candidateWithRefs(...referencedUrls: string[]) {
  return candidateOf({ ...baseInput(), referencedUrls })
}
/** The referenced object recognized for `url`, or undefined when it stayed opaque. */
function recognizedRefFor(url: string) {
  const c = candidateWithRefs(url)
  const link = c.sourceLinks.find((l) => l.url.includes("1709999999000300"))
  return { refs: c.referencedObjects, link }
}

test("referenced top-level Slack permalink (no query) is recognized as a Slack object", () => {
  const { refs } = recognizedRefFor(REF_PATH)
  assert.deepEqual(refs, [{ provider: "slack", sourceObjectId: REF_SLACK_ID }])
})

test("referenced canonical thread reply (earlier thread_ts, matching cid) is recognized", () => {
  const url = `${REF_PATH}?thread_ts=1709999998.000000&cid=C1234567890`
  const { refs } = recognizedRefFor(url)
  assert.deepEqual(refs, [{ provider: "slack", sourceObjectId: REF_SLACK_ID }])
})

// Each self-inconsistent form: NO recognized Slack object, and the URL is retained
// as an opaque source link with its query byte-preserved (never silently rewritten).
for (const [label, url] of [
  ["wrong cid", `${REF_PATH}?thread_ts=1709999998.000000&cid=C9999999999`],
  ["thread_ts without cid", `${REF_PATH}?thread_ts=1709999998.000000`],
  ["cid without thread_ts", `${REF_PATH}?cid=C1234567890`],
  ["malformed thread_ts", `${REF_PATH}?thread_ts=not-a-ts&cid=C1234567890`],
  ["thread_ts == messageTs", `${REF_PATH}?thread_ts=1709999999.000300&cid=C1234567890`],
  ["thread_ts later than messageTs", `${REF_PATH}?thread_ts=1719999999.999999&cid=C1234567890`],
] as const) {
  test(`referenced Slack permalink with ${label} stays opaque, not a Slack object`, () => {
    const { refs, link } = recognizedRefFor(url)
    assert.deepEqual(refs, [], `${label}: no referenced Slack object`)
    assert.ok(link, `${label}: URL retained as a source link`)
    assert.equal(link?.recognized, undefined, `${label}: link is opaque`)
    // Query is preserved on the retained opaque link (not stripped/rewritten).
    const q = url.slice(url.indexOf("?"))
    assert.ok(link?.url.includes(q.slice(1).split("&")[0]), `${label}: query preserved`)
  })
}

// Structural refusals already enforced by recognizeSlackPermalink still yield no
// recognized object (and the coherence gate does not change that).
for (const [label, url] of [
  ["duplicated thread_ts", `${REF_PATH}?thread_ts=1709999998.000000&thread_ts=1709999997.000000&cid=C1234567890`],
  ["duplicated cid", `${REF_PATH}?thread_ts=1709999998.000000&cid=C1234567890&cid=C1234567890`],
  ["unexpected query key", `${REF_PATH}?foo=bar`],
  ["fragment", `${REF_PATH}#thread`],
] as const) {
  test(`referenced Slack permalink with ${label} yields no recognized object`, () => {
    const { refs } = recognizedRefFor(url)
    assert.deepEqual(refs, [])
  })
}

test("an unsafe/sensitive referenced Slack URL is dropped from all output", () => {
  const c = candidateWithRefs(`${REF_PATH}?cid=xoxb-1111111111-abcdefghijklmnop`)
  assert.deepEqual(c.referencedObjects, [])
  const { strings } = scan(c)
  for (const s of strings) assert.ok(!s.includes("xoxb"), "no sensitive value survives")
})

test("a referenced Slack permalink equal to the primary is never listed as a reference", () => {
  const c = candidateWithRefs("https://example-workspace.slack.com/archives/C1234567890/p1710000000000100")
  assert.deepEqual(c.referencedObjects, [])
})

test("coherence fix keeps the exact attested F1A object and emits no semantic/network field", () => {
  const url = `${REF_PATH}?thread_ts=1709999998.000000&cid=C9999999999` // incoherent → opaque
  const result = extract({ ...baseInput(), referencedUrls: [url] })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.notEqual(snapshotValidatedFormationSourceResult(result.sourceResult), null, "exact F1A object still attests")
  const { keys } = scan(result.sourceResult.candidate)
  for (const key of keys) assert.ok(!FORBIDDEN_KEYS.has(key.toLowerCase()), `must not emit ${key}`)
})

// ─── Provider-host overlap: existing deterministic Slack-first precedence ─────
// Documentation/assertion only — records the current behavior; no production change.
test("when a host is configured for both Slack and GitHub, the Slack workspace wins (deterministic)", () => {
  const overlapConfig: SlackExtractionConfig = {
    workspaces: [{ workspaceId: "T012ABCDEF", host: "example-workspace.slack.com" }],
    githubHosts: ["example-workspace.slack.com"],
  }
  const c = candidateOf({ ...baseInput(), referencedUrls: [REF_PATH] }, overlapConfig)
  assert.deepEqual(c.referencedObjects, [{ provider: "slack", sourceObjectId: REF_SLACK_ID }])
})
