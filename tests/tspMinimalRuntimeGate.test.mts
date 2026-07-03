import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  canonicalizeApprovalPayload,
  canonicalApprovalPayloadFieldOrder,
  CanonicalApprovalPayloadValidationError,
  type CanonicalApprovalPayload,
} from "../app/lib/security/approvalMac/canonicalApprovalPayload.ts"
import {
  createTestTenantSecretProvider,
  type TenantSecretProvider,
} from "../app/lib/security/approvalMac/tenantSecretProvider.ts"
import {
  computeApprovalMac,
  verifyApprovalMac,
  constantTimeEqualHex,
} from "../app/lib/security/approvalMac/approvalMac.ts"

const HEX64_A = "a".repeat(64)
const HEX64_B = "b".repeat(64)
const HEX64_C = "c".repeat(64)

function basePayload(): CanonicalApprovalPayload {
  return {
    canonical_payload_version: "v1",
    approval_request_id: "req-1",
    tenant_id: "tenant-1",
    actor_id: "actor-1",
    actor_role: "pm",
    action_preview_id: "preview-1",
    operation: "github_issue_create",
    target_system: "github",
    target_identifier: "owner/repo#1",
    target_hash: HEX64_A,
    payload_hash: HEX64_B,
    payload_redaction_state: "redacted",
    preview_hash: HEX64_C,
    risk_level: "low",
    human_review_required: true,
    source_workunit_candidate_id: null,
    source_formal_workunit_id: "wu-1",
    source_action_field_id: null,
    source_decision_record_id: null,
    created_at: "2026-07-03T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    nonce: "nonce-1",
    idempotency_key: "idem-1",
    key_id: "key-1",
    key_version: "v1",
    hash_algorithm: "HMAC-SHA-256",
    canonicalization_algorithm: "JCS-RFC8785-INSPIRED-V1",
    approval_scope: "single_action",
    no_go_flags: [],
  }
}

const FAKE_SECRET = new TextEncoder().encode("test-only-fake-secret-not-real")

function baseProvider(): TenantSecretProvider {
  return createTestTenantSecretProvider([
    { tenant_id: "tenant-1", key_id: "key-1", key_version: "v1", secret: FAKE_SECRET },
    { tenant_id: "tenant-2", key_id: "key-1", key_version: "v1", secret: FAKE_SECRET },
  ])
}

function expectValidationError(value: unknown, code: string, field?: string): void {
  try {
    canonicalizeApprovalPayload(value)
    assert.fail(`expected ${code} for ${field ?? "(payload)"}`)
  } catch (error) {
    assert.ok(error instanceof CanonicalApprovalPayloadValidationError, String(error))
    assert.equal(error.code, code)
    if (field !== undefined) assert.equal(error.field, field)
  }
}

// ── Canonicalization ────────────────────────────────────────────

test("canonicalization is stable across object insertion order", () => {
  const ordered = basePayload()
  const shuffled: Record<string, unknown> = {}
  for (const key of [...canonicalApprovalPayloadFieldOrder].reverse()) {
    shuffled[key] = ordered[key as keyof CanonicalApprovalPayload]
  }
  assert.equal(canonicalizeApprovalPayload(shuffled), canonicalizeApprovalPayload(ordered))
})

test("canonicalization preserves explicit null and rejects missing fields", () => {
  const canonical = canonicalizeApprovalPayload(basePayload())
  assert.ok(canonical.includes('"source_workunit_candidate_id":null'))

  const missing: Record<string, unknown> = { ...basePayload() }
  delete missing.nonce
  expectValidationError(missing, "missing_required_field", "nonce")

  const undef: Record<string, unknown> = { ...basePayload(), nonce: undefined }
  expectValidationError(undef, "missing_required_field", "nonce")
})

test("canonicalization rejects unknown fields (including display-only extras)", () => {
  expectValidationError(
    { ...basePayload(), display_title: "mutable ui label" },
    "unknown_field",
    "display_title",
  )
})

test("canonicalization rejects invalid target/payload/preview hashes", () => {
  expectValidationError(
    { ...basePayload(), target_hash: "ABC" },
    "invalid_hash_format",
    "target_hash",
  )
  expectValidationError(
    { ...basePayload(), payload_hash: "Z".repeat(64) },
    "invalid_hash_format",
    "payload_hash",
  )
  expectValidationError(
    { ...basePayload(), preview_hash: "a".repeat(63) },
    "invalid_hash_format",
    "preview_hash",
  )
})

test("canonicalization rejects invalid timestamps", () => {
  expectValidationError(
    { ...basePayload(), created_at: "2026/07/03" },
    "invalid_timestamp",
    "created_at",
  )
  expectValidationError(
    { ...basePayload(), expires_at: "2026-07-03T00:00:00+09:00" },
    "invalid_timestamp",
    "expires_at",
  )
})

test("canonicalization rejects unsupported hash_algorithm", () => {
  expectValidationError(
    { ...basePayload(), hash_algorithm: "SHA-256" },
    "unsupported_hash_algorithm",
    "hash_algorithm",
  )
})

test("canonicalization rejects unsupported canonicalization_algorithm", () => {
  expectValidationError(
    { ...basePayload(), canonicalization_algorithm: "CUSTOM-V0" },
    "unsupported_canonicalization_algorithm",
    "canonicalization_algorithm",
  )
})

test("canonical output serializes fields in the documented order", () => {
  const canonical = canonicalizeApprovalPayload(basePayload())
  let previous = -1
  for (const field of canonicalApprovalPayloadFieldOrder) {
    const index = canonical.indexOf(`"${field}":`)
    assert.ok(index > previous, `field ${field} out of order`)
    previous = index
  }
})

// ── MAC determinism and binding ─────────────────────────────────

test("MAC is deterministic for same payload and secret", async () => {
  const provider = baseProvider()
  const mac1 = await computeApprovalMac(basePayload(), provider)
  const mac2 = await computeApprovalMac(basePayload(), provider)
  assert.equal(mac1, mac2)
  assert.match(mac1, /^[0-9a-f]{64}$/)
})

for (const [field, value] of [
  ["tenant_id", "tenant-2"],
  ["operation", "github_issue_comment"],
  ["target_hash", "d".repeat(64)],
  ["payload_hash", "e".repeat(64)],
  ["preview_hash", "f".repeat(64)],
  ["expires_at", "2099-06-01T00:00:00Z"],
  ["nonce", "nonce-2"],
] as const) {
  test(`MAC changes when ${field} changes`, async () => {
    const provider = baseProvider()
    const macBase = await computeApprovalMac(basePayload(), provider)
    const macChanged = await computeApprovalMac(
      { ...basePayload(), [field]: value },
      provider,
    )
    assert.notEqual(macBase, macChanged)
  })
}

test("MAC changes when key_id changes (different key material)", async () => {
  const provider = createTestTenantSecretProvider([
    { tenant_id: "tenant-1", key_id: "key-1", key_version: "v1", secret: FAKE_SECRET },
    {
      tenant_id: "tenant-1",
      key_id: "key-2",
      key_version: "v1",
      secret: new TextEncoder().encode("test-only-other-fake-secret"),
    },
  ])
  const macBase = await computeApprovalMac(basePayload(), provider)
  const macChanged = await computeApprovalMac(
    { ...basePayload(), key_id: "key-2" },
    provider,
  )
  assert.notEqual(macBase, macChanged)
})

test("MAC changes when key_version changes (same secret, version bound in payload)", async () => {
  const provider = createTestTenantSecretProvider([
    { tenant_id: "tenant-1", key_id: "key-1", key_version: "v1", secret: FAKE_SECRET },
    { tenant_id: "tenant-1", key_id: "key-1", key_version: "v2", secret: FAKE_SECRET },
  ])
  const macBase = await computeApprovalMac(basePayload(), provider)
  const macChanged = await computeApprovalMac(
    { ...basePayload(), key_version: "v2" },
    provider,
  )
  assert.notEqual(macBase, macChanged)
})

// ── Verification ────────────────────────────────────────────────

test("verification succeeds with correct provider and MAC", async () => {
  const provider = baseProvider()
  const mac = await computeApprovalMac(basePayload(), provider)
  const result = await verifyApprovalMac(basePayload(), mac, provider)
  assert.equal(result.ok, true)
  assert.equal(result.reason, "verified")
  assert.equal(result.tenant_id, "tenant-1")
  assert.equal(result.approval_request_id, "req-1")
  assert.equal(result.key_id, "key-1")
  assert.equal(result.key_version, "v1")
  assert.equal(result.hash_algorithm, "HMAC-SHA-256")
  assert.equal(result.canonicalization_algorithm, "JCS-RFC8785-INSPIRED-V1")
})

test("verification fails closed when tenant secret unavailable", async () => {
  const provider = baseProvider()
  const mac = await computeApprovalMac(basePayload(), provider)
  const empty = createTestTenantSecretProvider([])
  const result = await verifyApprovalMac(basePayload(), mac, empty)
  assert.equal(result.ok, false)
  assert.equal(result.reason, "tenant_secret_unavailable")
})

test("verification fails closed when key_id unknown", async () => {
  const provider = baseProvider()
  const payload = { ...basePayload(), key_id: "key-unknown" }
  const result = await verifyApprovalMac(payload, HEX64_A, provider)
  assert.equal(result.ok, false)
  assert.equal(result.reason, "tenant_secret_unavailable")
})

test("verification fails closed when key_version unknown", async () => {
  const provider = baseProvider()
  const payload = { ...basePayload(), key_version: "v99" }
  const result = await verifyApprovalMac(payload, HEX64_A, provider)
  assert.equal(result.ok, false)
  assert.equal(result.reason, "tenant_secret_unavailable")
})

test("verification fails on MAC mismatch", async () => {
  const provider = baseProvider()
  const mac = await computeApprovalMac(basePayload(), provider)
  const wrong = mac.slice(0, 63) + (mac.endsWith("0") ? "1" : "0")
  const result = await verifyApprovalMac(basePayload(), wrong, provider)
  assert.equal(result.ok, false)
  assert.equal(result.reason, "mac_mismatch")
})

test("verification fails on expired payload", async () => {
  const provider = baseProvider()
  const payload = { ...basePayload(), expires_at: "2026-01-01T00:00:00Z" }
  const mac = await computeApprovalMac(payload, provider)
  const result = await verifyApprovalMac(payload, mac, provider, "2026-07-03T00:00:00Z")
  assert.equal(result.ok, false)
  assert.equal(result.reason, "expired_payload")
})

test("verification fails when no_go_flags is non-empty", async () => {
  const provider = baseProvider()
  const payload = { ...basePayload(), no_go_flags: ["target_mismatch"] }
  const mac = await computeApprovalMac(payload, provider)
  const result = await verifyApprovalMac(payload, mac, provider)
  assert.equal(result.ok, false)
  assert.equal(result.reason, "no_go_flags_present")
})

test("verification fails on expired payload at the exact expiry boundary (now == expires_at)", async () => {
  const provider = baseProvider()
  const payload = { ...basePayload(), expires_at: "2026-07-03T00:00:00Z" }
  const mac = await computeApprovalMac(payload, provider)
  const result = await verifyApprovalMac(payload, mac, provider, "2026-07-03T00:00:00Z")
  assert.equal(result.ok, false)
  assert.equal(result.reason, "expired_payload")
})

test("verification fails closed when now is unparseable (no NaN fail-open)", async () => {
  const provider = baseProvider()
  const payload = { ...basePayload(), expires_at: "2020-01-01T00:00:00Z" }
  const mac = await computeApprovalMac(payload, provider)
  const result = await verifyApprovalMac(payload, mac, provider, "not-a-timestamp")
  assert.equal(result.ok, false)
  assert.equal(result.reason, "expired_payload")
})

test("getter-based TOCTOU cannot bypass the expiry gate", async () => {
  // A payload whose expires_at returns an EXPIRED value while the MAC is
  // computed (so a legitimately-issued MAC matches) but a FUTURE value when the
  // expiry gate reads it. The frozen snapshot must defeat this.
  const provider = baseProvider()
  const base = basePayload()
  const expiredMac = await computeApprovalMac(
    { ...base, expires_at: "2020-01-01T00:00:00Z" },
    provider,
  )
  let reads = 0
  const hostile: Record<string, unknown> = { ...base }
  Object.defineProperty(hostile, "expires_at", {
    enumerable: true,
    get() {
      reads += 1
      // First read (snapshot) returns the expired value the MAC was made over;
      // any later read returns a far-future value.
      return reads <= 1 ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z"
    },
  })
  const result = await verifyApprovalMac(hostile, expiredMac, provider, "2026-07-03T00:00:00Z")
  assert.equal(result.ok, false)
  assert.notEqual(result.reason, "verified")
})

test("getter-based TOCTOU cannot bypass the no_go_flags gate", async () => {
  const provider = baseProvider()
  const base = basePayload()
  const flaggedMac = await computeApprovalMac(
    { ...base, no_go_flags: ["target_mismatch"] },
    provider,
  )
  let reads = 0
  const hostile: Record<string, unknown> = { ...base }
  Object.defineProperty(hostile, "no_go_flags", {
    enumerable: true,
    get() {
      reads += 1
      return reads <= 1 ? ["target_mismatch"] : []
    },
  })
  const result = await verifyApprovalMac(hostile, flaggedMac, provider)
  assert.equal(result.ok, false)
  assert.notEqual(result.reason, "verified")
})

test("compute fails closed with distinct code when provider returns mismatched key material", async () => {
  const wrongIdProvider: TenantSecretProvider = {
    async resolveTenantSecret() {
      return { secret: FAKE_SECRET, key_id: "other-key", key_version: "v1", algorithm: "HMAC-SHA-256" }
    },
  }
  await assert.rejects(
    computeApprovalMac(basePayload(), wrongIdProvider),
    (error: Error) => (error as { code?: string }).code === "unknown_key_id",
  )

  const wrongVersionProvider: TenantSecretProvider = {
    async resolveTenantSecret() {
      return { secret: FAKE_SECRET, key_id: "key-1", key_version: "v-other", algorithm: "HMAC-SHA-256" }
    },
  }
  await assert.rejects(
    computeApprovalMac(basePayload(), wrongVersionProvider),
    (error: Error) => (error as { code?: string }).code === "unknown_key_version",
  )
})

test("verification fails closed on invalid payload and on invalid MAC format", async () => {
  const provider = baseProvider()
  const invalid = await verifyApprovalMac({ not: "a payload" }, HEX64_A, provider)
  assert.equal(invalid.ok, false)
  assert.equal(invalid.reason, "unknown_field")

  const badMac = await verifyApprovalMac(basePayload(), "not-hex", provider)
  assert.equal(badMac.ok, false)
  assert.equal(badMac.reason, "invalid_mac_format")
})

// ── Constant-time comparison ────────────────────────────────────

test("constant-time comparison returns true for identical MAC", () => {
  assert.equal(constantTimeEqualHex(HEX64_A, HEX64_A), true)
})

test("constant-time comparison returns false for mismatched or invalid MAC", () => {
  assert.equal(constantTimeEqualHex(HEX64_A, HEX64_B), false)
  assert.equal(constantTimeEqualHex(HEX64_A, "a".repeat(63)), false)
  assert.equal(constantTimeEqualHex("G".repeat(64), HEX64_A), false)
  assert.equal(constantTimeEqualHex(HEX64_A.toUpperCase(), HEX64_A), false)
})

// ── Secret hygiene and isolation ────────────────────────────────

test("fake provider and results never expose secret material", async () => {
  const provider = baseProvider()
  const mac = await computeApprovalMac(basePayload(), provider)
  const ok = await verifyApprovalMac(basePayload(), mac, provider)
  const failed = await verifyApprovalMac(basePayload(), HEX64_B, provider)
  const secretText = "test-only-fake-secret-not-real"
  for (const result of [ok, failed]) {
    const serialized = JSON.stringify(result)
    assert.ok(!serialized.includes(secretText))
    assert.ok(!("secret" in (result as Record<string, unknown>)))
  }
  assert.ok(!mac.includes(secretText))
})

test("validation errors never contain payload values", () => {
  try {
    canonicalizeApprovalPayload({ ...basePayload(), target_hash: "SENSITIVE-VALUE" })
    assert.fail("expected error")
  } catch (error) {
    assert.ok(error instanceof CanonicalApprovalPayloadValidationError)
    assert.ok(!String(error.message).includes("SENSITIVE-VALUE"))
  }
})

test("isolated modules do not import ApprovalStore, external actions, D1, or SQL", () => {
  // Import-graph check over the three P7.1 runtime modules (not this test's
  // own source): they must import only node crypto and each other.
  const files = [
    "app/lib/security/approvalMac/canonicalApprovalPayload.ts",
    "app/lib/security/approvalMac/tenantSecretProvider.ts",
    "app/lib/security/approvalMac/approvalMac.ts",
  ]
  for (const file of files) {
    const source = readFileSync(file, "utf8")
    const imports = source.match(/^import[^\n]*from\s+"([^"]+)"/gm) ?? []
    for (const line of imports) {
      const target = line.slice(line.indexOf('from "') + 6, -1)
      assert.ok(
        target === "crypto" || target.startsWith("./"),
        `${file} imports outside the isolated module set: ${target}`,
      )
    }
    const importTargets = imports.map((line) =>
      line.slice(line.indexOf('from "') + 6, -1),
    )
    for (const forbidden of [
      "approvalStore",
      "externalActions",
      "actionApproval",
      "approvalPreviewBinding",
      "persistence",
    ]) {
      assert.ok(
        importTargets.every((target) => !target.includes(forbidden)),
        `${file} imports ${forbidden}`,
      )
    }
    assert.ok(!source.includes("fetch("), `${file} contains a network call`)
  }
})
