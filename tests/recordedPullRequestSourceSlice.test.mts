/**
 * P1-1 second canonical resource: one real recorded GitHub PULL REQUEST becomes one canonical
 * SourceRecordV1, in a canonical identity namespace that cannot collide with GitHub issues.
 *
 * The subject is the retained capture in `acquisitions/`, not a fixture. It holds the exact
 * response bytes of one read-only GitHub REST export of pull request 229 of this repository — a
 * real pull request, authored by a person, that predates this slice. Every value the slice produces
 * is checked against those bytes, so this suite is also the reviewer's re-derivation: it recomputes
 * the digest independently and reads the identity and event time out of the payload by a different
 * route than the production code does.
 *
 * PR-S1   the real capture reaches SourceRecordV1, and every field is the value the bytes support
 * PR-S2   providerObjectKey is derived from the retained REST `id`, and from nothing else
 * PR-S3   the digest is independently re-derived from the exact retained bytes
 * PR-S4   a single in-scope byte change changes the digest
 * PR-S5   sourceEventAt is the provider's `created_at`, never `updated_at` or `merged_at`
 * PR-S6   the tenant partition crosses into the record exactly
 * PR-S7   the archive cannot assert identity, digest or event time
 * PR-S8   an unratified profile tuple is refused
 * PR-S9   an unrepresentable REST id fails closed
 * PR-S10  a non-GET request, or one outside the profile's pinned media type and API version, fails
 *
 * NS-1    a GitHub issue and a GitHub pull request with the SAME numeric id are two identities
 * NS-2    the existing real issue capture still produces its expected resource-scoped record
 * NS-3    the generic `github` namespace is unusable as a canonical namespace for either resource
 * NS-4    an unknown GitHub resource namespace fails closed
 *
 * NS-1 is the reason this WorkUnit exists, and it is written to fail for exactly one reason. Every
 * other difference between the two records — digest, event time, capture id, URL, number — is
 * neutralized or asserted equal first, so the surviving difference is the canonical namespace and
 * nothing else. A test that let the digests differ would pass even if the namespaces had collapsed.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  acquireRecordedGitHubPullRequestCapture,
  GITHUB_PULL_REQUEST_ACQUISITION_PROFILE,
} from "../app/lib/infrastructure/external/github/recordedPullRequestCapture.ts"
import {
  acquireRecordedGitHubIssueCapture,
  GITHUB_ISSUE_ACQUISITION_PROFILE,
} from "../app/lib/infrastructure/external/github/recordedIssueCapture.ts"
import { produceSourceRecordFromCapture } from "../app/lib/application/source/sourceRecordProduction.ts"
import type { AcquisitionCapture } from "../app/lib/ports/acquisitionEvidence/types.ts"
import type { SourceRecordV1 } from "../app/lib/domain/source/index.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const PR_ARCHIVE = "acquisitions/github/pull-request-4258276579.capture.json"
const ISSUE_ARCHIVE = "acquisitions/github/issue-4968607486.capture.json"

/** A recorded instant, never a clock read: the suite must be deterministic. */
const RECORDED_AT = "2026-08-17T07:00:00Z"

type Archive = {
  archiveVersion: string
  captureId: string
  tenantPartition: string
  acquisitionMode: string
  observedAt: string
  capturedFrom: Record<string, string>
  retainedContent: { retention: string; bytesBase64: string }
}

async function readArchive(relative: string): Promise<{ text: string; archive: Archive }> {
  const text = await readFile(path.join(rootDir, relative), "utf8")
  return { text, archive: JSON.parse(text) as Archive }
}

/** The retained provider bytes, decoded here independently of the production decoder. */
function retainedBytes(archive: Archive): Buffer {
  return Buffer.from(archive.retainedContent.bytesBase64, "base64")
}

/** The provider's own object, parsed here independently of the production parser. */
function providerObject(archive: Archive): Record<string, unknown> {
  return JSON.parse(retainedBytes(archive).toString("utf8")) as Record<string, unknown>
}

/** An archive text with one member replaced. Never mutates the retained capture on disk. */
function archiveWith(archive: Archive, patch: Record<string, unknown>): string {
  return JSON.stringify({ ...archive, ...patch })
}

/** An archive text whose retained bytes are the given provider object. */
function archiveWithObject(archive: Archive, object: Record<string, unknown>): string {
  return archiveWith(archive, {
    retainedContent: {
      retention: "INLINE_BYTES",
      bytesBase64: Buffer.from(JSON.stringify(object), "utf8").toString("base64"),
    },
  })
}

async function acquirePullRequestOrThrow(text: string): Promise<AcquisitionCapture> {
  const result = await acquireRecordedGitHubPullRequestCapture(text)
  assert.equal(result.ok, true, `acquisition must succeed, got ${result.ok ? "" : result.failureCode}`)
  assert.ok(result.ok)
  return result.capture
}

async function acquireIssueOrThrow(text: string): Promise<AcquisitionCapture> {
  const result = await acquireRecordedGitHubIssueCapture(text)
  assert.equal(result.ok, true, `acquisition must succeed, got ${result.ok ? "" : result.failureCode}`)
  assert.ok(result.ok)
  return result.capture
}

function produceOrThrow(capture: AcquisitionCapture): SourceRecordV1 {
  const produced = produceSourceRecordFromCapture(capture, RECORDED_AT)
  assert.equal(produced.ok, true, `production must succeed, got ${produced.ok ? "" : produced.failureCode}`)
  assert.ok(produced.ok)
  return produced.production.record
}

/** The identity tuple, and nothing else. Identity is exactly these three values. */
function identityOf(record: SourceRecordV1): string {
  return JSON.stringify([record.tenantId, record.provider, record.providerObjectKey])
}

// ─── PR-S1 — the real capture reaches SourceRecordV1 ────────────────────────────

test("PR-S1: the retained real GitHub pull request export produces a canonical SourceRecordV1", async () => {
  const { text, archive } = await readArchive(PR_ARCHIVE)
  const object = providerObject(archive)

  // Non-vacuity: the subject must be the real capture. A hand-authored payload would not carry
  // GitHub's own primary key alongside the repository coordinates of a real pull request.
  assert.equal(typeof object.id, "number", "the retained payload must carry the provider's own id")
  assert.equal(object.html_url, "https://github.com/haya10hikawa-hub/Atra-workunitOS/pull/229")
  assert.equal(archive.acquisitionMode, "HUMAN_TRIGGERED_PROVIDER_EXPORT")
  assert.equal(archive.capturedFrom.requestMethod, "GET", "the capture must record a read")
  // A pull request, not an issue: the payload carries members only the pulls resource returns.
  for (const member of ["head", "base", "merge_commit_sha", "changed_files"]) {
    assert.ok(Object.hasOwn(object, member),
      `the retained payload must be a pull request representation (missing ${member})`)
  }

  const capture = await acquirePullRequestOrThrow(text)
  const record = produceOrThrow(capture)

  const digest = `sha256:${createHash("sha256").update(retainedBytes(archive)).digest("hex")}`
  assert.deepEqual({ ...record }, {
    recordVersion: "1",
    tenantId: archive.tenantPartition,
    provider: "github_pull_request",
    providerObjectKey: String(object.id),
    declaredSourceRef: null,
    sourceUrl: null,
    observedAt: archive.observedAt,
    recordedAt: RECORDED_AT,
    sourceEventAt: object.created_at,
    contentDigest: digest,
  }, "every field of the canonical record is the value the retained bytes and the capture support")

  assert.equal(Object.isFrozen(record), true, "the record must be frozen")
})

// ─── PR-S2 — identity is the provider's primary key ─────────────────────────────

test("PR-S2: providerObjectKey is the pull request's REST id, and no forbidden material", async () => {
  const { text, archive } = await readArchive(PR_ARCHIVE)
  const object = providerObject(archive)
  const capture = await acquirePullRequestOrThrow(text)
  const key = capture.identity.providerObjectKey

  assert.equal(key, String(object.id), "the key is the provider's `id`, carried byte-for-byte")
  assert.match(key, /^[1-9][0-9]*$/, "the key is exact decimal digits: no padding, no prefix, no separator")

  // Forbidden identity material, each checked against the value the payload actually carries so the
  // assertion cannot pass merely because the string is absent from the tree.
  assert.notEqual(key, object.node_id, "node_id has already been re-issued once by the provider")
  assert.notEqual(key, String(object.number), "the PR number is repository-scoped and shared with issues")
  assert.notEqual(key, object.html_url, "a URL is a locator, never identity")
  assert.notEqual(key, object.url)
  assert.notEqual(key, object.merge_commit_sha, "a commit sha identifies a commit, not the pull request")
  assert.notEqual(key, capture.captureId, "a capture id is acquisition-minted, never provider identity")
  assert.notEqual(key, capture.observedAt, "an observation instant is never identity")
  assert.equal(key.includes("#"), false, "repository#number is not a ratified profile")

  // Derivation, not declaration: changing the provider's id in the retained bytes changes the key,
  // with no archive field involved at all.
  const moved = await acquirePullRequestOrThrow(archiveWithObject(archive, { ...object, id: 4258276580 }))
  assert.equal(moved.identity.providerObjectKey, "4258276580")

  // The profile the key was formed under travels with it, and is the reviewed one.
  assert.deepEqual({ ...capture.identity }, {
    providerNamespace: GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.providerNamespace,
    providerObjectKey: key,
    identityProfileId: GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.identityProfileId,
    identityProfileVersion: GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.identityProfileVersion,
  })
  assert.equal(GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.providerNamespace, "github.com/rest/pulls")
  assert.equal(GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.identityProfileId,
    "github.pull-request.rest.database-primary-key")
})

// ─── PR-S3 / PR-S4 — the digest's subject is the retained bytes ─────────────────

test("PR-S3: the digest is independently re-derived from exactly the retained bytes", async () => {
  const { text, archive } = await readArchive(PR_ARCHIVE)
  const capture = await acquirePullRequestOrThrow(text)
  const bytes = retainedBytes(archive)

  // Recomputed by a different implementation than production's: node:crypto here, Web Crypto there.
  assert.equal(capture.contentScope.contentDigest,
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    "the digest must be reproducible from the retained bytes alone")
  assert.match(capture.contentScope.contentDigest, /^sha256:[0-9a-f]{64}$/)

  // The digest is not a digest of a parsed-and-reserialized object. That is the most plausible wrong
  // implementation — it looks equivalent and is not, because key order and whitespace are lost.
  //
  // This capture makes the difference visible rather than theoretical: GitHub returned this response
  // pretty-printed, with newlines and two-space indentation, so the retained stream and any
  // reserialization of it differ in thousands of bytes. Both facts are asserted, because the second
  // assertion only means something while the first holds.
  assert.ok(bytes.includes(Buffer.from("\n  \"", "utf8")),
    "the retained bytes are the provider's own stream, indentation included, and were not reformatted")
  const reserialized = JSON.stringify(providerObject(archive))
  assert.notEqual(reserialized, bytes.toString("utf8"),
    "non-vacuity: a reserialization of this payload really does differ from the retained bytes")
  assert.notEqual(capture.contentScope.contentDigest,
    `sha256:${createHash("sha256").update(reserialized, "utf8").digest("hex")}`,
    "the digest must be over the retained byte stream, not over a reparsed projection of it")

  // Nor of the archive, the capture, or any other Atra-side representation.
  for (const forbidden of [text, JSON.stringify(capture), JSON.stringify(archive.capturedFrom)]) {
    assert.notEqual(capture.contentScope.contentDigest,
      `sha256:${createHash("sha256").update(forbidden, "utf8").digest("hex")}`,
      "the digest must not be computed over an Atra-side representation")
  }

  // Non-canonical base64 decodes to the same bytes under a lenient decoder. Accepting it would give
  // one retained stream two admissible spellings, so it is refused.
  const nonCanonical = capture.retainedContent.bytesBase64.replace(/=$/, "")
  if (nonCanonical !== capture.retainedContent.bytesBase64) {
    const result = await acquireRecordedGitHubPullRequestCapture(archiveWith(archive, {
      retainedContent: { retention: "INLINE_BYTES", bytesBase64: nonCanonical },
    }))
    assert.equal(result.ok, false, "unpadded base64 must be refused")
  }
})

test("PR-S4: a single in-scope byte change changes the digest, and moves no identity", async () => {
  const { text, archive } = await readArchive(PR_ARCHIVE)
  const capture = await acquirePullRequestOrThrow(text)
  const bytes = retainedBytes(archive)

  // B2-P1: any in-scope provider-content change must change the digest. One byte is enough, and it
  // is a byte in a value no other evidence field reads — so a digest that survived it would be a
  // digest of something other than the retained content.
  // The probe lands inside the provider's own title text, located by the value rather than by a
  // surrounding JSON spelling: this response is pretty-printed and the issue response is not, so a
  // probe keyed to `"title":"` would silently miss here and the test would pass by not testing.
  const flipped = Buffer.from(bytes)
  const title = String(providerObject(archive).title)
  assert.ok(title.length > 0, "the real capture must carry a provider-authored title")
  const at = bytes.indexOf(Buffer.from(title, "utf8"))
  assert.ok(at > 0, "the probe must land inside the provider's own content")
  flipped[at] ^= 0x01
  const flippedCapture = await acquirePullRequestOrThrow(archiveWith(archive, {
    retainedContent: { retention: "INLINE_BYTES", bytesBase64: flipped.toString("base64") },
  }))
  assert.notEqual(flippedCapture.contentScope.contentDigest, capture.contentScope.contentDigest,
    "a single in-scope byte change must change the digest")
  // …and the identity does not move with it: a content change is not a new source.
  assert.equal(flippedCapture.identity.providerObjectKey, capture.identity.providerObjectKey)
})

// ─── PR-S5 — provider-stated event time ─────────────────────────────────────────

test("PR-S5: sourceEventAt is the pull request's created_at and never another provider time", async () => {
  const { text, archive } = await readArchive(PR_ARCHIVE)
  const object = providerObject(archive)
  const capture = await acquirePullRequestOrThrow(text)
  const record = produceOrThrow(capture)

  assert.equal(record.sourceEventAt, object.created_at, "sourceEventAt is provider-stated")

  // A pull request carries several provider times. Non-vacuity first: these must actually differ
  // from created_at in the real capture, or "not updated_at" would be trivially true.
  for (const other of ["updated_at", "merged_at"]) {
    assert.notEqual(object[other], object.created_at,
      `the real capture must distinguish ${other} from created_at for this check to bite`)
    assert.notEqual(record.sourceEventAt, object[other], `${other} is not the source event time`)
  }

  assert.equal(record.observedAt, archive.observedAt, "observedAt is the original acquisition instant")
  assert.equal(record.recordedAt, RECORDED_AT, "recordedAt belongs to production and is supplied by it")
  assert.equal(Object.hasOwn(capture, "recordedAt"), false,
    "a capture has no recordedAt slot, so acquisition cannot state a time it does not own")

  // When the provider states no creation time, nothing is substituted: acquisition refuses rather
  // than reaching for observedAt, updated_at or merged_at.
  const withoutCreatedAt: Record<string, unknown> = { ...object }
  delete withoutCreatedAt.created_at
  const missing = await acquireRecordedGitHubPullRequestCapture(
    archiveWithObject(archive, withoutCreatedAt))
  assert.equal(missing.ok, false)
  assert.ok(!missing.ok)
  assert.equal(missing.failureCode, "provider_event_time_unreadable")
})

// ─── PR-S6 — tenant propagation ─────────────────────────────────────────────────

test("PR-S6: the tenant partition crosses into the record unchanged", async () => {
  const { text, archive } = await readArchive(PR_ARCHIVE)
  const capture = await acquirePullRequestOrThrow(text)
  const record = produceOrThrow(capture)

  assert.equal(capture.tenantPartition, archive.tenantPartition)
  assert.equal(record.tenantId, archive.tenantPartition)

  // A different partition produces a different record for the same provider object: partition is
  // part of identity, so two tenants observing one pull request are two records and never one.
  const other = await acquirePullRequestOrThrow(archiveWith(archive, { tenantPartition: "other-tenant" }))
  const otherRecord = produceOrThrow(other)
  assert.equal(otherRecord.tenantId, "other-tenant")
  assert.equal(otherRecord.providerObjectKey, record.providerObjectKey)
  assert.notEqual(identityOf(otherRecord), identityOf(record))

  // Nothing in the provider payload can become tenancy: the partition is acquisition evidence, and
  // an unstated one is a refusal rather than a default.
  for (const bad of ["", "  padded  ", "x".repeat(201)]) {
    const result = await acquireRecordedGitHubPullRequestCapture(
      archiveWith(archive, { tenantPartition: bad }))
    assert.equal(result.ok, false, `tenant partition ${JSON.stringify(bad)} must be refused`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "invalid_tenant_partition")
  }
})

// ─── PR-S7 — evidence is derived, never declared ────────────────────────────────

test("PR-S7: an archive cannot assert identity, digest or event time", async () => {
  const { archive } = await readArchive(PR_ARCHIVE)

  for (const smuggled of [
    { providerObjectKey: "999999" },
    { contentDigest: `sha256:${"0".repeat(64)}` },
    { sourceEventAt: "1999-01-01T00:00:00Z" },
    { identity: { providerObjectKey: "999999" } },
    { contentScope: { contentDigest: `sha256:${"0".repeat(64)}` } },
    { providerNamespace: "github.com/rest/issues" },
  ]) {
    const result = await acquireRecordedGitHubPullRequestCapture(archiveWith(archive, smuggled))
    assert.equal(result.ok, false, `an archive stating ${Object.keys(smuggled)[0]} must be refused`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "archive_unknown_field",
      "evidence fields are not archive fields, so they are unknown fields and not overrides")
  }
})

// ─── PR-S8 — the producer refuses an unratified profile ─────────────────────────

test("PR-S8: production requires the exact ratified pull request profile tuple", async () => {
  const { text } = await readArchive(PR_ARCHIVE)
  const capture = await acquirePullRequestOrThrow(text)

  const variants: Array<[string, AcquisitionCapture]> = [
    ["namespace", { ...capture, identity: { ...capture.identity, providerNamespace: "github.com/rest/pull" } }],
    ["identity profile", {
      ...capture,
      identity: { ...capture.identity, identityProfileId: "github.pull-request.node-id" },
    }],
    ["identity version", { ...capture, identity: { ...capture.identity, identityProfileVersion: "2" } }],
    ["content profile", {
      ...capture,
      contentScope: { ...capture.contentScope, contentScopeProfileId: "github.pull-request.rest.diff" },
    }],
    ["content version", {
      ...capture,
      contentScope: { ...capture.contentScope, contentScopeProfileVersion: "2" },
    }],
  ]
  for (const [label, variant] of variants) {
    const result = produceSourceRecordFromCapture(variant, RECORDED_AT)
    assert.equal(result.ok, false, `an unratified ${label} must not produce a record`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "unauthorized_provider_profile")
  }

  // Non-vacuity: the unmodified capture still produces, so the refusals above discriminate.
  assert.equal(produceSourceRecordFromCapture(capture, RECORDED_AT).ok, true)
})

// ─── PR-S9 / PR-S10 — fail-closed boundaries ────────────────────────────────────

test("PR-S9: an unrepresentable REST id is refused, never approximated", async () => {
  const { archive } = await readArchive(PR_ARCHIVE)
  const object = providerObject(archive)

  // A key the JSON parser would have rounded: the digits produced would not be the provider's.
  for (const unsafeId of [9007199254740993, -1, 0, 1.5]) {
    const result = await acquireRecordedGitHubPullRequestCapture(
      archiveWithObject(archive, { ...object, id: unsafeId }))
    assert.equal(result.ok, false, `id ${unsafeId} must be refused`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "provider_identity_unrepresentable")
  }

  // A non-numeric or absent id is a different failure: the provider stated no primary key at all.
  for (const absent of [{ ...object, id: "4258276579" }, { ...object, id: null }]) {
    const result = await acquireRecordedGitHubPullRequestCapture(archiveWithObject(archive, absent))
    assert.equal(result.ok, false)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "provider_identity_absent")
  }
})

test("PR-S10: a request outside the profile's pinned GET, media type and API version fails closed", async () => {
  const { archive } = await readArchive(PR_ARCHIVE)
  const from = archive.capturedFrom

  const cases: Array<[unknown, string]> = [
    // Read-only: a capture recorded from anything but a read is refused.
    [archiveWith(archive, { capturedFrom: { ...from, requestMethod: "POST" } }), "unauthorized_request_method"],
    [archiveWith(archive, { capturedFrom: { ...from, requestMethod: "PATCH" } }), "unauthorized_request_method"],
    [archiveWith(archive, { capturedFrom: { ...from, requestMethod: "get" } }), "unauthorized_request_method"],
    // The media type is part of the content-scope profile: `.diff` and `.patch` are the same object
    // and entirely different bytes, so a digest over them is not a digest under this profile.
    [archiveWith(archive, { capturedFrom: { ...from, acceptHeader: "application/vnd.github.diff" } }),
      "unauthorized_accept_profile"],
    [archiveWith(archive, { capturedFrom: { ...from, acceptHeader: "application/vnd.github.patch" } }),
      "unauthorized_accept_profile"],
    [archiveWith(archive, { capturedFrom: { ...from, acceptHeader: "application/json" } }),
      "unauthorized_accept_profile"],
    [archiveWith(archive, { capturedFrom: { ...from, providerApiVersion: "2021-01-01" } }),
      "unauthorized_provider_api_version"],
    // An absent version is bad provenance rather than a wrong version, and is refused one step
    // earlier. Both refusals matter: the wrong-but-well-formed case above pins the profile
    // comparison, and this one pins the provenance shape.
    [archiveWith(archive, { capturedFrom: { ...from, providerApiVersion: "" } }),
      "invalid_captured_from"],
    // Envelope hygiene.
    [archiveWith(archive, { acquisitionMode: "LIVE_PROVIDER_READ" }), "unauthorized_acquisition_mode"],
    [archiveWith(archive, { acquisitionMode: "FIXTURE" }), "unauthorized_acquisition_mode"],
    [archiveWith(archive, { archiveVersion: "2" }), "unsupported_archive_version"],
    [archiveWith(archive, { observedAt: "2026-08-17" }), "invalid_observed_at"],
    [archiveWith(archive, { observedAt: "2026-08-17T06:35:29+09:00" }), "invalid_observed_at"],
    [archiveWith(archive, { captureId: "" }), "invalid_capture_id"],
    // Request provenance is bounded text throughout, `requestUrl` included. It is never read for a
    // decision, so without this it could carry unbounded or control-character material into a
    // reviewed artifact unchecked.
    [archiveWith(archive, { capturedFrom: { ...from, requestUrl: 42 } }), "invalid_captured_from"],
    [archiveWith(archive, { capturedFrom: { ...from, requestUrl: "" } }), "invalid_captured_from"],
    [archiveWith(archive, { capturedFrom: { ...from, requestUrl: `https://x/${"y".repeat(3000)}` } }),
      "invalid_captured_from"],
    [archiveWith(archive, { capturedFrom: { ...from, requestUrl: "https://x/\u0007" } }),
      "invalid_captured_from"],
    [archiveWith(archive, {
      retainedContent: { retention: "INTEGRITY_BOUND_REFERENCE", bytesBase64: "AA==" },
    }), "unsupported_retention"],
    [archiveWith(archive, { retainedContent: { retention: "INLINE_BYTES", bytesBase64: "not base64!!" } }),
      "invalid_retained_bytes"],
    [archiveWith(archive, {
      retainedContent: { retention: "INLINE_BYTES", bytesBase64: Buffer.from("[]", "utf8").toString("base64") },
    }), "retained_content_unreadable"],
    ["not json", "archive_unreadable"],
    ["[]", "archive_unreadable"],
    [42, "archive_unreadable"],
  ]

  for (const [input, expected] of cases) {
    const result = await acquireRecordedGitHubPullRequestCapture(input)
    assert.equal(result.ok, false, `${expected}: must be refused`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, expected)
  }

  // A live provider read is not merely rejected by name — there is no code path to one. The module
  // reaches for no network primitive at all, so a recorded capture cannot become a live read.
  //
  // A text scan is a floor and not a proof: it cannot see through indirection. The import list is
  // therefore pinned as well, which is the stronger half — a module that imports nothing but a
  // type-only port has no transitive route to a network, clock or filesystem primitive whatever its
  // body spells.
  const source = await readFile(
    path.join(rootDir, "app/lib/infrastructure/external/github/recordedPullRequestCapture.ts"), "utf8")
  for (const token of ["fetch(", "XMLHttpRequest", "node:http", "node:https", "undici", "axios",
    "node:fs", "readFile", "Date.now", "new Date", "Math.random", "getRandomValues",
    "performance.now", "globalThis", "process.", "require("]) {
    assert.equal(source.includes(token), false,
      `the acquisition module must not reach for ${token}: it is pure, offline and clock-free`)
  }
  const imports = [...source.matchAll(/^import[\s\S]*?from "([^"]+)"/gm)].map((entry) => entry[1])
  assert.deepEqual(imports, ["../../../ports/acquisitionEvidence/types.ts"],
    "the module's only dependency is the type-only evidence port, so it has no transitive reach")
  assert.ok(/^import type \{/m.test(source), "that single dependency must be type-only")
})

// ─── NS-1 — the collision this WorkUnit exists to prevent ───────────────────────

/**
 * The load-bearing adversarial case. GitHub draws an issue's REST `id` and a pull request's REST
 * `id` from different tables, and the two observed ranges overlap, so a numerically equal pair is
 * not a contrived input — it is the ordinary consequence of putting both in one namespace.
 *
 * Constructed from the two REAL retained captures with one value rewritten in each provider byte
 * stream, so both keys are still DERIVED from bytes rather than declared. Everything that could make
 * the two records differ for an uninteresting reason is asserted equal first: same tenant, same
 * numeric key. What remains is the canonical namespace, and that alone must keep them apart.
 */
test("NS-1: a GitHub issue and pull request with the same numeric id are two canonical identities", async () => {
  const { archive: prArchive } = await readArchive(PR_ARCHIVE)
  const { archive: issueArchive } = await readArchive(ISSUE_ARCHIVE)

  const COLLIDING_ID = 4258276579

  const prCapture = await acquirePullRequestOrThrow(
    archiveWithObject(prArchive, { ...providerObject(prArchive), id: COLLIDING_ID }))
  const issueCapture = await acquireIssueOrThrow(
    archiveWithObject(issueArchive, {
      ...providerObject(issueArchive), id: COLLIDING_ID,
    }))

  const prRecord = produceOrThrow(prCapture)
  const issueRecord = produceOrThrow(issueCapture)

  // The premise: the two records really do agree on every identity component except the namespace.
  assert.equal(prRecord.providerObjectKey, String(COLLIDING_ID))
  assert.equal(issueRecord.providerObjectKey, String(COLLIDING_ID))
  assert.equal(prRecord.providerObjectKey, issueRecord.providerObjectKey,
    "the premise of this test is a byte-equal provider key")
  assert.equal(prRecord.tenantId, issueRecord.tenantId,
    "the premise of this test is a single tenant partition")

  // The conclusion: they are still two sources, and the namespace is the only reason.
  assert.notEqual(prRecord.provider, issueRecord.provider)
  assert.equal(prRecord.provider, "github_pull_request")
  assert.equal(issueRecord.provider, "github_issue")
  assert.notEqual(identityOf(prRecord), identityOf(issueRecord),
    "a same-numeric-id issue and pull request must never share a canonical identity")

  // And the separation does not depend on anything else being different. Rewrite BOTH records so
  // that every non-identity field is byte-equal — digest, all three instants, the opaque ref and the
  // locator — and the identities must still differ. This is what makes the namespace load-bearing
  // rather than merely correlated with an outcome that other fields were also producing.
  const flattenNonIdentity = (record: SourceRecordV1): SourceRecordV1 => Object.freeze({
    ...record,
    declaredSourceRef: null,
    sourceUrl: null,
    observedAt: "2026-01-01T00:00:00Z",
    recordedAt: "2026-01-02T00:00:00Z",
    sourceEventAt: "2026-01-01T00:00:00Z",
    contentDigest: `sha256:${"0".repeat(64)}`,
  })
  const flatPr = flattenNonIdentity(prRecord)
  const flatIssue = flattenNonIdentity(issueRecord)
  assert.deepEqual(
    { ...flatPr, provider: null }, { ...flatIssue, provider: null },
    "the two records must now differ in nothing except the canonical namespace")
  assert.notEqual(identityOf(flatPr), identityOf(flatIssue),
    "identity must separate them with no help from digest, times, URL, number or capture id")

  assert.notEqual(prRecord.contentDigest, issueRecord.contentDigest,
    "non-vacuity: the two captures are genuinely different provider objects")
})

// ─── NS-2 — the existing issue slice still holds ────────────────────────────────

test("NS-2: the real issue capture still produces its expected resource-scoped record", async () => {
  const { text, archive } = await readArchive(ISSUE_ARCHIVE)
  const object = providerObject(archive)
  const record = produceOrThrow(await acquireIssueOrThrow(text))

  assert.equal(record.provider, "github_issue",
    "the issue record moved to its resource-scoped namespace and did not stay generic")
  assert.equal(record.providerObjectKey, String(object.id),
    "the provider-native key is unchanged by the namespace split")
  assert.equal(record.providerObjectKey, "4968607486")
  assert.equal(record.contentDigest,
    `sha256:${createHash("sha256").update(retainedBytes(archive)).digest("hex")}`,
    "the digest is unchanged by the namespace split: it is a fact about provider bytes")
  assert.equal(record.sourceEventAt, object.created_at)

  // The provider-side identity profile did not change and was not re-versioned. Only Atra's outer
  // canonical namespace changed, which is why no profile version bump was required.
  assert.equal(GITHUB_ISSUE_ACQUISITION_PROFILE.providerNamespace, "github.com/rest/issues")
  assert.equal(GITHUB_ISSUE_ACQUISITION_PROFILE.identityProfileId,
    "github.issue.rest.database-primary-key")
  assert.equal(GITHUB_ISSUE_ACQUISITION_PROFILE.identityProfileVersion, "1")
  assert.equal(GITHUB_ISSUE_ACQUISITION_PROFILE.contentScopeProfileVersion, "1")
})

// ─── NS-3 / NS-4 — the namespace cannot be widened or guessed ───────────────────

test("NS-3: the generic github namespace is unusable as a canonical namespace for either resource", async () => {
  // At the producer: the provider namespace `github.com` matches no authorized tuple, and neither
  // does a cross-paired one. There is no entry that accepts "some GitHub profile".
  const { text: prText } = await readArchive(PR_ARCHIVE)
  const { text: issueText } = await readArchive(ISSUE_ARCHIVE)
  const prCapture = await acquirePullRequestOrThrow(prText)
  const issueCapture = await acquireIssueOrThrow(issueText)

  const generic: Array<[string, AcquisitionCapture]> = [
    ["generic github namespace on a PR capture",
      { ...prCapture, identity: { ...prCapture.identity, providerNamespace: "github.com" } }],
    ["generic github namespace on an issue capture",
      { ...issueCapture, identity: { ...issueCapture.identity, providerNamespace: "github.com" } }],
    // M5/M6: the PR identity profile under the issue namespace, and the reverse. Each is a partial
    // match, and a producer matching on namespace alone — or on profile alone — would accept them.
    ["PR profile under the issue namespace", {
      ...prCapture,
      identity: { ...prCapture.identity, providerNamespace: "github.com/rest/issues" },
    }],
    ["issue profile under the PR namespace", {
      ...issueCapture,
      identity: { ...issueCapture.identity, providerNamespace: "github.com/rest/pulls" },
    }],
    ["PR content scope under the issue identity profile", {
      ...issueCapture,
      contentScope: {
        ...issueCapture.contentScope,
        contentScopeProfileId: "github.pull-request.rest.retained-response-body",
      },
    }],
  ]
  for (const [label, variant] of generic) {
    const result = produceSourceRecordFromCapture(variant, RECORDED_AT)
    assert.equal(result.ok, false, `${label} must not produce a record`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "unauthorized_provider_profile")
  }

  // At the producer's own declaration: no authorized tuple binds a GitHub resource to the generic
  // canonical namespace, whatever the provider namespace says. Read from the source so a later edit
  // adding `identityNamespace: "github"` fails here even if no capture exercises it.
  const producer = await readFile(
    path.join(rootDir, "app/lib/application/source/sourceRecordProduction.ts"), "utf8")
  const bound = [...producer.matchAll(/identityNamespace:\s*"([^"]+)"/g)].map((entry) => entry[1])
  assert.deepEqual(bound.sort(), ["github_issue", "github_pull_request"],
    "the authorized bindings are exactly the two reviewed resource namespaces")
  assert.equal(bound.includes("github"), false,
    "no tuple may bind a reviewed GitHub resource to the generic canonical namespace")

  // And the namespace is stated as a literal per entry, never computed from the provider path — a
  // derived spelling would make a new provider namespace mint a canonical namespace by itself.
  assert.equal(/identityNamespace:\s*`/.test(producer), false,
    "the canonical namespace must be a literal, never a template-derived string")
})

test("NS-4: an unknown GitHub resource namespace fails closed", async () => {
  const { text } = await readArchive(PR_ARCHIVE)
  const capture = await acquirePullRequestOrThrow(text)

  // Resources GitHub really has, none of which has a reviewed profile. Each must be refused for the
  // same reason: there is no authorized tuple, and absence is never a default.
  for (const unreviewed of [
    "github.com/rest/comments", "github.com/rest/reviews", "github.com/rest/commits",
    "github.com/rest/repositories", "github.com/rest/pulls/files", "github.com/graphql",
  ]) {
    const result = produceSourceRecordFromCapture(
      { ...capture, identity: { ...capture.identity, providerNamespace: unreviewed } }, RECORDED_AT)
    assert.equal(result.ok, false, `${unreviewed} has no reviewed profile and must be refused`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "unauthorized_provider_profile")
  }
})

// ─── NS-5 — the resource is bound to the bytes, not to the caller ───────────────

/**
 * The namespace half of canonical identity must not be the operator's assertion.
 *
 * Everything else in this slice is derived from retained bytes, but WHICH canonical namespace a
 * record lands in is decided by which acquisition module ran. Without a check on the bytes, feeding
 * one resource's export to the other resource's module mints a real provider key into the wrong
 * namespace — and the resulting record looks perfectly well-formed, so no reviewer holding it could
 * tell. Both directions must fail closed, and both are checked here because closing one direction
 * only moves the defect.
 */
test("NS-5: an export of one GitHub resource is refused by the other resource's module", async () => {
  const prText = await readFile(path.join(rootDir, PR_ARCHIVE), "utf8")
  const issueText = await readFile(path.join(rootDir, ISSUE_ARCHIVE), "utf8")

  const crossFed = await acquireRecordedGitHubPullRequestCapture(issueText)
  assert.equal(crossFed.ok, false, "a real issue export must not be acquirable as a pull request")
  assert.ok(!crossFed.ok)
  assert.equal(crossFed.failureCode, "provider_resource_mismatch")

  const reverse = await acquireRecordedGitHubIssueCapture(prText)
  assert.equal(reverse.ok, false, "a real pull request export must not be acquirable as an issue")
  assert.ok(!reverse.ok)
  assert.equal(reverse.failureCode, "provider_resource_mismatch")

  // Counterexample NS-5: merely naming the PR ref members must not let a mutated PR
  // body cross into the issue namespace. The discriminator is retained-byte shape,
  // not the caller's adapter choice, and arrays are not PR ref structures.
  const realPrObject = providerObject(JSON.parse(prText) as Archive)
  const arrayRefs = await acquireRecordedGitHubIssueCapture(
    archiveWithObject(JSON.parse(prText) as Archive, {
      ...realPrObject,
      head: [],
      base: [],
    }),
  )
  assert.equal(arrayRefs.ok, false, "a PR body with array ref markers must not become an issue")
  assert.ok(!arrayRefs.ok)
  assert.equal(arrayRefs.failureCode, "provider_resource_mismatch")

  // Counterexample NS-5: adding only the two ref-shaped keys to a real issue must
  // not make it satisfy the PR namespace discriminator.
  const realIssueObject = providerObject(JSON.parse(issueText) as Archive)
  const forgedRefs = await acquireRecordedGitHubPullRequestCapture(
    archiveWithObject(JSON.parse(issueText) as Archive, {
      ...realIssueObject,
      head: {},
      base: {},
    }),
  )
  assert.equal(forgedRefs.ok, false, "an issue body with forged empty refs must not become a pull request")
  assert.ok(!forgedRefs.ok)
  assert.equal(forgedRefs.failureCode, "provider_resource_mismatch")

  // GitHub's `/issues/{number}` representation of a pull request carries a
  // top-level `pull_request` link. Its presence is itself PR-only evidence and
  // must not be allowed to mint the issue namespace, regardless of value shape.
  const issueWithPullRequestMarker = await acquireRecordedGitHubIssueCapture(
    archiveWithObject(JSON.parse(issueText) as Archive, {
      ...realIssueObject,
      pull_request: { url: "https://api.github.com/repos/example/example/pulls/1" },
    }),
  )
  assert.equal(issueWithPullRequestMarker.ok, false,
    "an issue body carrying GitHub's pull_request marker must not remain in the issue namespace")
  assert.ok(!issueWithPullRequestMarker.ok)
  assert.equal(issueWithPullRequestMarker.failureCode, "provider_resource_mismatch")

  // Non-vacuity: each module still accepts its own resource, so the refusals above discriminate by
  // resource and are not a module that refuses everything.
  assert.equal((await acquireRecordedGitHubPullRequestCapture(prText)).ok, true)
  assert.equal((await acquireRecordedGitHubIssueCapture(issueText)).ok, true)

  // BOTH members are required, not either. A guard satisfied by one of them would accept a payload
  // carrying half of a pull request's ref structure — and, more to the point, a weakening of the
  // guard from `and` to `or` must not pass this suite silently.
  const prObject = providerObject(JSON.parse(prText) as Archive)
  for (const dropped of ["head", "base"]) {
    const partial: Record<string, unknown> = { ...prObject }
    delete partial[dropped]
    const result = await acquireRecordedGitHubPullRequestCapture(
      archiveWithObject(JSON.parse(prText) as Archive, partial))
    assert.equal(result.ok, false, `a payload without \`${dropped}\` is not a pull request representation`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "provider_resource_mismatch")
  }

  // And the members must be objects, not merely present: a scalar of the right name is not ref
  // structure, and accepting one would make the guard a key-name check.
  for (const scalar of [null, "main", 1, []]) {
    const result = await acquireRecordedGitHubPullRequestCapture(
      archiveWithObject(JSON.parse(prText) as Archive, { ...prObject, head: scalar }))
    assert.equal(result.ok, false, `head as ${JSON.stringify(scalar)} is not ref structure`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "provider_resource_mismatch")
  }

  // The guard is on the RETAINED BYTES, not on the envelope. The two archives carry byte-identical
  // request provenance — same method, media type and API version — so nothing in `capturedFrom`
  // distinguishes the resources and the envelope could not have done this work.
  const prArchive = JSON.parse(prText) as Archive
  const issueArchive = JSON.parse(issueText) as Archive
  assert.equal(prArchive.capturedFrom.requestMethod, issueArchive.capturedFrom.requestMethod)
  assert.equal(prArchive.capturedFrom.acceptHeader, issueArchive.capturedFrom.acceptHeader)
  assert.equal(prArchive.capturedFrom.providerApiVersion, issueArchive.capturedFrom.providerApiVersion)

  // And it is the payload structure that decides, not the archive's filename or request URL: the
  // real pull request bytes carried under an archive whose recorded URL says `issues` are still
  // acquired as a pull request, because no code reads that URL for a decision.
  const relabelled = await acquireRecordedGitHubPullRequestCapture(JSON.stringify({
    ...prArchive,
    capturedFrom: { ...prArchive.capturedFrom, requestUrl: issueArchive.capturedFrom.requestUrl },
  }))
  assert.equal(relabelled.ok, true, "requestUrl is provenance for a reader and is never a decision")
  assert.ok(relabelled.ok)
  assert.equal(relabelled.capture.identity.providerNamespace, "github.com/rest/pulls")
})

// ─── Non-canonical observation ──────────────────────────────────────────────────

/**
 * An OBSERVATION over the two retained captures, and nothing more.
 *
 * It records what these two provider objects show about the identifiers the profiles chose and
 * rejected. It closes none of P-R1–P-R5 and no issue residual: repeated observation is not provider
 * authority, and the strongest thing that may be said of a property checked this way is that it was
 * EMPIRICALLY_NOT_FALSIFIED_IN_OBSERVED_CAPTURES. Nothing here feeds a canonical value, and no
 * observed member is added to SourceRecordV1.
 */
test("observation: retained captures show why `number` is not identity and `id` is resource-scoped", async () => {
  const { archive: prArchive } = await readArchive(PR_ARCHIVE)
  const { archive: issueArchive } = await readArchive(ISSUE_ARCHIVE)
  const pr = providerObject(prArchive)
  const issue = providerObject(issueArchive)

  // GitHub shares one number space between a repository's issues and its pull requests, so `number`
  // does not even distinguish the two resources inside a single repository — before any
  // cross-repository concern arises. Both are small repository-scoped ordinals.
  assert.ok(Number(pr.number) < 1000 && Number(issue.number) < 1000,
    "both numbers are small repository-scoped ordinals, not global identifiers")

  // The REST ids are large and drawn from ranges that overlap: neither resource occupies a disjoint
  // band that would make a shared namespace safe by arithmetic. This is the observation behind the
  // split — it is not a provider guarantee, and it does not need to be: the split does not depend on
  // it, and would be required even if the ranges had looked disjoint on this day.
  const prId = Number(pr.id)
  const issueId = Number(issue.id)
  assert.ok(prId > 1e9 && issueId > 1e9, "both REST ids are large database primary keys")
  // Two samples, and the wording says only what two samples support: these two values are close
  // enough that no arithmetic band separates them. It is NOT a claim that the resources' id ranges
  // always overlap — nothing downstream depends on this, and the namespace split would be required
  // even if these two had looked disjoint on the day they were read.
  assert.ok(Math.min(prId, issueId) / Math.max(prId, issueId) > 0.5,
    "observed only: these two ids are same-magnitude, so no arithmetic band separates the resources")

  // node_id carries a resource tag GitHub tells consumers to treat as opaque. It is recorded here as
  // an observation and is never decoded, never compared and never used as identity by any module.
  assert.match(String(pr.node_id), /^PR_/, "observed only: the PR node id carries a resource prefix")
  assert.match(String(issue.node_id), /^I_/, "observed only: the issue node id carries a resource prefix")

  // The canonical records take none of this material.
  const prRecord = produceOrThrow(await acquirePullRequestOrThrow(
    await readFile(path.join(rootDir, PR_ARCHIVE), "utf8")))
  for (const observed of [String(pr.number), String(pr.node_id), String(pr.html_url)]) {
    assert.notEqual(prRecord.providerObjectKey, observed,
      "an observed member must never become canonical identity")
  }
})
