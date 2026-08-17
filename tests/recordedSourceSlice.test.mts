/**
 * P1-1 vertical slice: one real recorded provider source becomes one canonical SourceRecordV1.
 *
 * The subject is the retained capture in `acquisitions/`, not a fixture. It holds the exact
 * response bytes of one read-only GitHub REST export of issue 207 of this repository — a real
 * project-planning issue, authored by a person, that predates this slice. Every value the slice
 * produces is checked against those bytes, so this suite is also the reviewer's re-derivation: it
 * recomputes the digest independently, and it reads the identity and event time out of the payload
 * by a different route than the production code does.
 *
 * S1  the real capture reaches SourceRecordV1, and every field is the value the bytes support
 * S2  evidence is derived from the retained bytes and never from the archive envelope
 * S3  the digest's subject is exactly the retained bytes, and tracks any change to them
 * S4  identity is the provider's primary key, byte-for-byte, and nothing else
 * S5  time provenance: observed, recorded and provider-stated are three different facts
 * S6  the tenant partition is carried unchanged and is never inferred
 * S7  production fails closed on every unauthorized capture shape
 * S8  the producer refuses any profile it has not ratified
 *
 * Adversarial only where the property is load-bearing. There is no attempt to enumerate every
 * malformed archive: the shape validation is boundary hygiene, while the derivation and
 * authorization properties are what make the record's evidence true.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  acquireRecordedGitHubIssueCapture,
  GITHUB_ISSUE_ACQUISITION_PROFILE,
} from "../app/lib/infrastructure/external/github/recordedIssueCapture.ts"
import { produceSourceRecordFromCapture } from "../app/lib/application/source/sourceRecordProduction.ts"
import type {
  AcquisitionCapture,
  AcquisitionCaptureId,
  AcquisitionTenantPartition,
} from "../app/lib/ports/acquisitionEvidence/types.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const ARCHIVE = "acquisitions/github/issue-4968607486.capture.json"

/** A recorded instant, never a clock read: the suite must be deterministic. */
const RECORDED_AT = "2026-08-12T01:00:00Z"

type Archive = {
  archiveVersion: string
  captureId: string
  tenantPartition: string
  acquisitionMode: string
  observedAt: string
  capturedFrom: Record<string, string>
  retainedContent: { retention: string; bytesBase64: string }
}

async function readArchive(): Promise<{ text: string; archive: Archive }> {
  const text = await readFile(path.join(rootDir, ARCHIVE), "utf8")
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

async function acquireOrThrow(text: string): Promise<AcquisitionCapture> {
  const result = await acquireRecordedGitHubIssueCapture(text)
  assert.equal(result.ok, true, `acquisition must succeed, got ${result.ok ? "" : result.failureCode}`)
  assert.ok(result.ok)
  return result.capture
}

// ─── S1 — the real capture reaches SourceRecordV1 ───────────────────────────────

test("S1: the retained real GitHub issue export produces a canonical SourceRecordV1", async () => {
  const { text, archive } = await readArchive()
  const object = providerObject(archive)

  // Non-vacuity: the subject must be the real capture. A hand-authored payload would not carry
  // GitHub's own primary key alongside the repository coordinates of a real issue.
  assert.equal(typeof object.id, "number", "the retained payload must carry the provider's own id")
  assert.equal(object.html_url, "https://github.com/haya10hikawa-hub/Atra-workunitOS/issues/207")
  assert.equal(archive.acquisitionMode, "HUMAN_TRIGGERED_PROVIDER_EXPORT")
  assert.equal(archive.capturedFrom.requestMethod, "GET", "the capture must record a read")

  const capture = await acquireOrThrow(text)
  const produced = produceSourceRecordFromCapture(capture, RECORDED_AT)
  assert.equal(produced.ok, true, `production must succeed, got ${produced.ok ? "" : produced.failureCode}`)
  assert.ok(produced.ok)

  const digest = `sha256:${createHash("sha256").update(retainedBytes(archive)).digest("hex")}`
  assert.deepEqual({ ...produced.production.record }, {
    recordVersion: "1",
    tenantId: archive.tenantPartition,
    provider: "github_issue",
    providerObjectKey: String(object.id),
    declaredSourceRef: null,
    sourceUrl: null,
    observedAt: archive.observedAt,
    recordedAt: RECORDED_AT,
    sourceEventAt: object.created_at,
    contentDigest: digest,
  }, "every field of the canonical record is the value the retained bytes and the capture support")

  // The capture linkage is beside the record, never inside it: identity is (tenant, provider, key),
  // and a per-acquisition value inside the record would make two observations two sources.
  assert.equal(produced.production.captureId, archive.captureId)
  assert.equal(Object.hasOwn(produced.production.record, "captureId"), false)
  assert.equal(Object.isFrozen(produced.production.record), true, "the record must be frozen")
})

// ─── S2 — evidence is derived, never declared ───────────────────────────────────

/**
 * The load-bearing property of the whole slice. If the archive could state the identity, the digest
 * or the event time, then an operator — or anyone who could write a file — could assert a record
 * about a provider object the retained bytes do not describe, and no reviewer holding the bytes
 * could tell. So the archive states none of them, and adding any of them must be refused rather
 * than preferred or merged.
 */
test("S2: an archive cannot assert identity, digest or event time", async () => {
  const { archive } = await readArchive()
  const object = providerObject(archive)

  for (const smuggled of [
    { providerObjectKey: "999999" },
    { contentDigest: `sha256:${"0".repeat(64)}` },
    { sourceEventAt: "1999-01-01T00:00:00Z" },
    { identity: { providerObjectKey: "999999" } },
    { contentScope: { contentDigest: `sha256:${"0".repeat(64)}` } },
  ]) {
    const result = await acquireRecordedGitHubIssueCapture(archiveWith(archive, smuggled))
    assert.equal(result.ok, false, `an archive stating ${Object.keys(smuggled)[0]} must be refused`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "archive_unknown_field",
      "evidence fields are not archive fields, so they are unknown fields and not overrides")
  }

  // And the positive half: what the acquisition does emit comes from the bytes. Changing the bytes
  // changes the evidence, with no archive field involved at all.
  const altered = { ...object, id: 4968607487, created_at: "2020-05-06T07:08:09Z" }
  const alteredCapture = await acquireOrThrow(archiveWith(archive, {
    retainedContent: {
      retention: "INLINE_BYTES",
      bytesBase64: Buffer.from(JSON.stringify(altered), "utf8").toString("base64"),
    },
  }))
  assert.equal(alteredCapture.identity.providerObjectKey, "4968607487")
  assert.equal(alteredCapture.sourceEventAt, "2020-05-06T07:08:09Z")
})

// ─── S3 — the digest's subject is the retained bytes ────────────────────────────

test("S3: the digest is over exactly the retained bytes and changes when any of them changes", async () => {
  const { text, archive } = await readArchive()
  const capture = await acquireOrThrow(text)
  const bytes = retainedBytes(archive)

  // Recomputed by a different implementation than production's: node:crypto here, Web Crypto there.
  assert.equal(capture.contentScope.contentDigest,
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    "the digest must be reproducible from the retained bytes alone")
  assert.match(capture.contentScope.contentDigest, /^sha256:[0-9a-f]{64}$/)

  // B2-P1: any in-scope provider-content change must change the digest. One byte is enough, and it
  // is a byte in a value no other evidence field reads — so a digest that survived it would be a
  // digest of something other than the retained content.
  const flipped = Buffer.from(bytes)
  const at = bytes.indexOf(Buffer.from('"title":"'))
  assert.ok(at > 0, "the probe must land inside the provider's own content")
  flipped[at + 9] ^= 0x01
  const flippedCapture = await acquireOrThrow(archiveWith(archive, {
    retainedContent: { retention: "INLINE_BYTES", bytesBase64: flipped.toString("base64") },
  }))
  assert.notEqual(flippedCapture.contentScope.contentDigest, capture.contentScope.contentDigest,
    "a single in-scope byte change must change the digest")
  // …and the identity does not move with it: a content change is not a new source.
  assert.equal(flippedCapture.identity.providerObjectKey, capture.identity.providerObjectKey)

  // The digest is not a digest of the archive, of the capture, or of any Atra projection. Each of
  // those would be a forbidden subject, and each is a value this must NOT equal.
  for (const forbidden of [text, JSON.stringify(capture), JSON.stringify(archive.capturedFrom)]) {
    assert.notEqual(capture.contentScope.contentDigest,
      `sha256:${createHash("sha256").update(forbidden, "utf8").digest("hex")}`,
      "the digest must not be computed over an Atra-side representation")
  }

  // Non-canonical base64 decodes to the same bytes under a lenient decoder. Accepting it would give
  // one retained stream two admissible spellings, so it is refused.
  const nonCanonical = capture.retainedContent.bytesBase64.replace(/=$/, "")
  if (nonCanonical !== capture.retainedContent.bytesBase64) {
    const result = await acquireRecordedGitHubIssueCapture(archiveWith(archive, {
      retainedContent: { retention: "INLINE_BYTES", bytesBase64: nonCanonical },
    }))
    assert.equal(result.ok, false, "unpadded base64 must be refused")
  }
})

// ─── S4 — identity is the provider's primary key ────────────────────────────────

test("S4: providerObjectKey is the provider's primary key, and no forbidden material", async () => {
  const { text, archive } = await readArchive()
  const object = providerObject(archive)
  const capture = await acquireOrThrow(text)
  const key = capture.identity.providerObjectKey

  assert.equal(key, String(object.id), "the key is the provider's `id`, carried byte-for-byte")
  assert.match(key, /^[1-9][0-9]*$/, "the key is exact decimal digits: no padding, no prefix, no separator")

  // Forbidden identity material, each checked against the value the payload actually carries so the
  // assertion cannot pass merely because the string is absent from the tree.
  assert.notEqual(key, object.node_id, "node_id has already been re-issued once by the provider")
  assert.notEqual(key, String(object.number), "the issue number is repository-scoped, not global")
  assert.notEqual(key, object.html_url, "a URL is a locator, never identity")
  assert.notEqual(key, object.url)
  assert.notEqual(key, capture.captureId, "a capture id is acquisition-minted, never provider identity")
  assert.notEqual(key, capture.observedAt, "an observation instant is never identity")
  assert.equal(key.includes("#"), false, "repository#number is not a ratified profile")

  // The profile the key was formed under travels with it, and is the reviewed one.
  assert.deepEqual({ ...capture.identity }, {
    providerNamespace: GITHUB_ISSUE_ACQUISITION_PROFILE.providerNamespace,
    providerObjectKey: key,
    identityProfileId: GITHUB_ISSUE_ACQUISITION_PROFILE.identityProfileId,
    identityProfileVersion: GITHUB_ISSUE_ACQUISITION_PROFILE.identityProfileVersion,
  })
  assert.equal(GITHUB_ISSUE_ACQUISITION_PROFILE.providerNamespace, "github.com/rest/issues")

  // A key the JSON parser would have rounded is refused, not approximated: the digits produced
  // would not be the provider's.
  const unsafe = await acquireRecordedGitHubIssueCapture(archiveWith(archive, {
    retainedContent: {
      retention: "INLINE_BYTES",
      bytesBase64: Buffer.from(JSON.stringify({ ...object, id: 9007199254740993 }), "utf8").toString("base64"),
    },
  }))
  assert.equal(unsafe.ok, false)
  assert.ok(!unsafe.ok)
  assert.equal(unsafe.failureCode, "provider_identity_unrepresentable")
})

// ─── S5 — three different times, never substituted for one another ──────────────

test("S5: observedAt, recordedAt and sourceEventAt are three distinct facts", async () => {
  const { text, archive } = await readArchive()
  const object = providerObject(archive)
  const capture = await acquireOrThrow(text)
  const produced = produceSourceRecordFromCapture(capture, RECORDED_AT)
  assert.ok(produced.ok)
  const { record } = produced.production

  assert.equal(record.observedAt, archive.observedAt, "observedAt is the original acquisition instant")
  assert.equal(record.recordedAt, RECORDED_AT, "recordedAt belongs to production and is supplied by it")
  assert.equal(record.sourceEventAt, object.created_at, "sourceEventAt is provider-stated")

  // None of the three is taken from any of the others, and none is taken from a field the provider
  // did not state as an event time.
  assert.notEqual(record.observedAt, record.recordedAt)
  assert.notEqual(record.sourceEventAt, record.observedAt)
  assert.notEqual(record.sourceEventAt, object.updated_at, "updated_at is not the source event time")

  // A capture has no recordedAt slot at all, so acquisition cannot state a time it does not own.
  assert.equal(Object.hasOwn(capture, "recordedAt"), false)

  // `null` means UNKNOWN and stays null: when the provider states no creation time, nothing is
  // substituted — acquisition refuses rather than reaching for observedAt or updated_at.
  const withoutCreatedAt: Record<string, unknown> = { ...object }
  delete withoutCreatedAt.created_at
  const missing = await acquireRecordedGitHubIssueCapture(archiveWith(archive, {
    retainedContent: {
      retention: "INLINE_BYTES",
      bytesBase64: Buffer.from(JSON.stringify(withoutCreatedAt), "utf8").toString("base64"),
    },
  }))
  assert.equal(missing.ok, false)
  assert.ok(!missing.ok)
  assert.equal(missing.failureCode, "provider_event_time_unreadable")

  // Production cannot back-date itself behind the observation it claims to record.
  const backdated = produceSourceRecordFromCapture(capture, "2000-01-01T00:00:00Z")
  assert.equal(backdated.ok, false)
  assert.ok(!backdated.ok)
  assert.equal(backdated.failureCode, "record_rejected")
  assert.equal(backdated.recordFailureCode, "recorded_before_observed")
})

// ─── S6 — the tenant partition is carried, never inferred ───────────────────────

test("S6: the tenant partition crosses into the record unchanged", async () => {
  const { text, archive } = await readArchive()
  const capture = await acquireOrThrow(text)
  const produced = produceSourceRecordFromCapture(capture, RECORDED_AT)
  assert.ok(produced.ok)

  assert.equal(capture.tenantPartition, archive.tenantPartition)
  assert.equal(produced.production.record.tenantId, archive.tenantPartition)

  // A different partition produces a different record, with the same provider object: partition is
  // part of identity, so two tenants observing one object are two records and never one.
  const other = await acquireOrThrow(archiveWith(archive, { tenantPartition: "other-tenant" }))
  const otherProduced = produceSourceRecordFromCapture(other, RECORDED_AT)
  assert.ok(otherProduced.ok)
  assert.equal(otherProduced.production.record.tenantId, "other-tenant")
  assert.equal(otherProduced.production.record.providerObjectKey,
    produced.production.record.providerObjectKey)

  // Nothing in the provider payload can become tenancy: the partition is acquisition evidence, and
  // an unstated one is a refusal rather than a default.
  for (const bad of ["", "  padded  ", "x".repeat(201)]) {
    const result = await acquireRecordedGitHubIssueCapture(archiveWith(archive, { tenantPartition: bad }))
    assert.equal(result.ok, false, `tenant partition ${JSON.stringify(bad)} must be refused`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "invalid_tenant_partition")
  }
})

// ─── S7 — acquisition fails closed ──────────────────────────────────────────────

test("S7: an unauthorized capture shape is refused, never repaired", async () => {
  const { archive } = await readArchive()

  const cases: Array<[unknown, string]> = [
    [archiveWith(archive, { acquisitionMode: "LIVE_PROVIDER_READ" }), "unauthorized_acquisition_mode"],
    [archiveWith(archive, { acquisitionMode: "FIXTURE" }), "unauthorized_acquisition_mode"],
    [archiveWith(archive, { capturedFrom: { ...archive.capturedFrom, requestMethod: "POST" } }),
      "unauthorized_request_method"],
    [archiveWith(archive, { archiveVersion: "2" }), "unsupported_archive_version"],
    [archiveWith(archive, { observedAt: "2026-08-12" }), "invalid_observed_at"],
    [archiveWith(archive, { observedAt: "2026-08-12T00:55:42+09:00" }), "invalid_observed_at"],
    [archiveWith(archive, { captureId: "" }), "invalid_capture_id"],
    [archiveWith(archive, {
      retainedContent: { retention: "INTEGRITY_BOUND_REFERENCE", bytesBase64: "AA==" },
    }), "unsupported_retention"],
    [archiveWith(archive, { retainedContent: { retention: "INLINE_BYTES", bytesBase64: "not base64!!" } }),
      "invalid_retained_bytes"],
    [archiveWith(archive, {
      retainedContent: {
        retention: "INLINE_BYTES",
        bytesBase64: Buffer.from("[]", "utf8").toString("base64"),
      },
    }), "retained_content_unreadable"],
    [archiveWith(archive, {
      retainedContent: {
        retention: "INLINE_BYTES",
        bytesBase64: Buffer.from('{"created_at":"2026-01-01T00:00:00Z"}', "utf8").toString("base64"),
      },
    }), "provider_identity_absent"],
    ["not json", "archive_unreadable"],
    ["[]", "archive_unreadable"],
    [42, "archive_unreadable"],
  ]

  for (const [input, expected] of cases) {
    const result = await acquireRecordedGitHubIssueCapture(input)
    assert.equal(result.ok, false, `${expected}: must be refused`)
    assert.ok(!result.ok)
    assert.equal(result.failureCode, expected)
  }

  // A live provider read is not merely rejected by name — there is no code path to one. The module
  // reaches for no network primitive at all, so a recorded capture cannot become a live read.
  const source = await readFile(
    path.join(rootDir, "app/lib/infrastructure/external/github/recordedIssueCapture.ts"), "utf8")
  for (const token of ["fetch(", "XMLHttpRequest", "node:http", "node:https", "undici", "axios",
    "node:fs", "readFile", "Date.now", "new Date", "Math.random"]) {
    assert.equal(source.includes(token), false,
      `the acquisition module must not reach for ${token}: it is pure, offline and clock-free`)
  }
})

// ─── S8 — the producer refuses an unratified profile ────────────────────────────

/**
 * The producer's authorization is a closed tuple, restated independently of the adapter it
 * authorizes. Widening any of the five values — the namespace, either profile id, either profile
 * version — must stop production, because a key admissible under one profile version is not
 * admissible under another and a digest is comparable only within its own.
 */
test("S8: production requires the exact ratified profile tuple", async () => {
  const { text } = await readArchive()
  const capture = await acquireOrThrow(text)

  const variants: Array<[string, AcquisitionCapture]> = [
    ["namespace", { ...capture, identity: { ...capture.identity, providerNamespace: "slack.com/messages" } }],
    ["identity profile", { ...capture, identity: { ...capture.identity, identityProfileId: "github.issue.node-id" } }],
    ["identity version", { ...capture, identity: { ...capture.identity, identityProfileVersion: "2" } }],
    ["content profile", {
      ...capture,
      contentScope: { ...capture.contentScope, contentScopeProfileId: "github.issue.rest.body-only" },
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

  // A second evidence form is refused at runtime, not only in the type system: evidence routinely
  // arrives as parsed external JSON, where the tag is the only thing left.
  for (const notACapture of [
    { ...capture, kind: "REPLAY_OF_CAPTURE" },
    { captureId: "x" as AcquisitionCaptureId, tenantPartition: "t" as AcquisitionTenantPartition },
    null,
  ]) {
    const result = produceSourceRecordFromCapture(notACapture as AcquisitionCapture, RECORDED_AT)
    assert.equal(result.ok, false, "only a capture may produce a record")
    assert.ok(!result.ok)
    assert.equal(result.failureCode, "unsupported_evidence_kind")
  }

  // Non-vacuity: the unmodified capture still produces, so the refusals above discriminate.
  assert.equal(produceSourceRecordFromCapture(capture, RECORDED_AT).ok, true)
})
