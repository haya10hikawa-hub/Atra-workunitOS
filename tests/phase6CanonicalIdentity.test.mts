/**
 * P6-FIX-010: isolated tests for the Phase 6 Canonical Identity core module
 * (Issue #143) — the session-derived and stored-preview-creator constructors,
 * the structural validator, canonical user equality, and the compile-time
 * provenance boundary.
 *
 * Imports ONLY node:test, node:assert/strict, and the canonicalIdentity
 * public surface. No app runtime, no persistence, no ApprovalStore, no
 * network, no child_process, no secrets, no D1, no SQL, no LLM. No clock is
 * read anywhere — `observed_at` is always supplied.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import * as canonicalIdentityModule from "../app/lib/phase6/canonicalIdentity/index.ts"
import {
  createCanonicalSessionIdentity,
  createCanonicalPreviewCreatorIdentity,
  validateCanonicalIdentity,
  isSameCanonicalUser,
  CANONICAL_IDENTITY_ISSUE_CODES,
  CANONICAL_ACTOR_KINDS,
  SESSION_DERIVABLE_ACTOR_KINDS,
  CANONICAL_IDENTITY_SOURCES,
  CANONICAL_IDENTITY_SUBJECT_TYPES,
  type CanonicalIdentity,
  type CanonicalIdentityConstructionResult,
  type SessionDerivableActorKind,
} from "../app/lib/phase6/canonicalIdentity/index.ts"

const OBSERVED_AT = "2026-07-05T00:30:00Z"

function sessionOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: "user-alpha",
    tenantId: "tenant-1",
    role: "manager",
    email: "user-alpha@example.test",
    isDevSession: false,
    sessionId: "sess-1",
    createdAt: "2026-07-04T00:00:00Z",
    expiresAt: "2026-07-06T00:00:00Z",
    ...overrides,
  }
}

function sessionInputOf(overrides: Record<string, unknown> = {}): {
  actor_kind: SessionDerivableActorKind
  expected_tenant_id: string
  observed_at: string
} {
  return {
    actor_kind: "reviewer",
    expected_tenant_id: "tenant-1",
    observed_at: OBSERVED_AT,
    ...overrides,
  } as { actor_kind: SessionDerivableActorKind; expected_tenant_id: string; observed_at: string }
}

function previewOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "preview-1",
    tenantId: "tenant-1",
    workUnitId: "wu-1",
    actionType: "email_draft",
    targetPreview: "{}",
    payloadPreview: "{}",
    requiresApproval: 1,
    status: "preview",
    targetHash: "c".repeat(64),
    payloadHash: "d".repeat(64),
    createdAt: "2026-07-05T00:00:00Z",
    expiresAt: "2026-07-05T06:00:00Z",
    creatorUserId: "creator-1",
    ...overrides,
  }
}

function previewInputOf(overrides: Record<string, unknown> = {}): {
  expected_tenant_id: string
  observed_at: string
} {
  return {
    expected_tenant_id: "tenant-1",
    observed_at: OBSERVED_AT,
    ...overrides,
  } as { expected_tenant_id: string; observed_at: string }
}

function expectIssue(
  result: CanonicalIdentityConstructionResult,
  code: string,
  fieldIncludes: string,
  label: string,
): void {
  assert.equal(result.ok, false, label)
  if (result.ok) return
  assert.ok(
    result.issues.some((i) => i.code === code && i.field.includes(fieldIncludes)),
    `${label}: expected ${code} on ${fieldIncludes}; got ${JSON.stringify(result.issues)}`,
  )
}

// ─── Compile-time provenance boundary (erased at runtime) ───────

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type AssertFalse<T extends false> = T
type IsAssignable<A, B> = A extends B ? true : false

// A raw structural identity object (all seven fields, no brand) is not
// assignable to the opaque canonical identity type.
type StructuralIdentity = {
  readonly tenant_id: string
  readonly user_id: string
  readonly actor_kind: "reviewer"
  readonly identity_source: "authenticated_session"
  readonly source_record_id: string
  readonly observed_at: string
  readonly subject_type: "human_user"
}
type _StructuralNotCanonical = AssertFalse<IsAssignable<StructuralIdentity, CanonicalIdentity>>
// Both constructors return the canonical identity type.
type SessionSuccessIdentity = Extract<
  ReturnType<typeof createCanonicalSessionIdentity>,
  { ok: true }
>["identity"]
type _SessionConstructorType = Assert<Equal<SessionSuccessIdentity, CanonicalIdentity>>
type PreviewSuccessIdentity = Extract<
  ReturnType<typeof createCanonicalPreviewCreatorIdentity>,
  { ok: true }
>["identity"]
type _PreviewConstructorType = Assert<Equal<PreviewSuccessIdentity, CanonicalIdentity>>
// A construction result is not assignable to approval-like, runtime
// authorization-like, or execution-permission-like shapes.
type ApprovalLike = { readonly approved: true; readonly approval_id: string }
type RuntimeAuthorizationLike = { readonly authorized: true; readonly execution_token: string }
type ExecutionPermissionLike = { readonly execution_permission: true }
type _ResultNotApproval = AssertFalse<
  IsAssignable<CanonicalIdentityConstructionResult, ApprovalLike>
>
type _ResultNotAuthorization = AssertFalse<
  IsAssignable<CanonicalIdentityConstructionResult, RuntimeAuthorizationLike>
>
type _ResultNotExecution = AssertFalse<
  IsAssignable<CanonicalIdentityConstructionResult, ExecutionPermissionLike>
>

test("compile-time canonical identity assertions are wired (runtime no-op)", () => {
  const witnesses: unknown[] = [
    null as unknown as _StructuralNotCanonical,
    null as unknown as _SessionConstructorType,
    null as unknown as _PreviewConstructorType,
    null as unknown as _ResultNotApproval,
    null as unknown as _ResultNotAuthorization,
    null as unknown as _ResultNotExecution,
  ]
  assert.equal(witnesses.length, 6)
})

// ─── Canonical enumerations ─────────────────────────────────────

test("canonical enumerations and the single issue-code list are pinned", () => {
  assert.deepEqual(
    [...CANONICAL_ACTOR_KINDS],
    ["requester", "creator", "reviewer", "approver", "executor"],
  )
  assert.deepEqual(
    [...SESSION_DERIVABLE_ACTOR_KINDS],
    ["requester", "reviewer", "approver", "executor"],
  )
  assert.deepEqual(
    [...CANONICAL_IDENTITY_SOURCES],
    ["authenticated_session", "stored_action_preview_creator"],
  )
  assert.deepEqual([...CANONICAL_IDENTITY_SUBJECT_TYPES], ["human_user"])
  assert.deepEqual(
    [...CANONICAL_IDENTITY_ISSUE_CODES],
    [
      "invalid_identity_input",
      "identity_state_missing",
      "identity_source_untrusted",
      "identity_session_expired",
      "identity_tenant_mismatch",
      "identity_actor_kind_mismatch",
      "identity_subject_unsupported",
      "identity_evidence_mismatch",
      "duplicate_reviewer_identity",
      "self_approval_forbidden",
      "delegation_not_supported",
      "identity_validation_exception",
    ],
  )
})

// ─── Session-derived canonical identity ─────────────────────────

test("a valid authenticated session constructs a frozen canonical identity", () => {
  const result = createCanonicalSessionIdentity(sessionOf(), sessionInputOf())
  assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues))
  if (!result.ok) return
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.issues))
  assert.ok(Object.isFrozen(result.identity))
  const identity = result.identity as unknown as Record<string, unknown>
  assert.equal(identity.tenant_id, "tenant-1")
  assert.equal(identity.user_id, "user-alpha")
  assert.equal(identity.actor_kind, "reviewer")
  assert.equal(identity.identity_source, "authenticated_session")
  assert.equal(identity.source_record_id, "sess-1")
  assert.equal(identity.observed_at, OBSERVED_AT)
  assert.equal(identity.subject_type, "human_user")
  // Exactly the seven contract fields; role/email/session data never copied.
  assert.deepEqual(
    Object.keys(identity).sort(),
    [
      "actor_kind",
      "identity_source",
      "observed_at",
      "source_record_id",
      "subject_type",
      "tenant_id",
      "user_id",
    ],
  )
  assert.equal(Object.getOwnPropertySymbols(identity).length, 0, "no runtime brand symbol")
})

test("every session-derivable actor kind constructs; construction is deterministic", () => {
  for (const kind of SESSION_DERIVABLE_ACTOR_KINDS) {
    const a = createCanonicalSessionIdentity(sessionOf(), sessionInputOf({ actor_kind: kind }))
    const b = createCanonicalSessionIdentity(sessionOf(), sessionInputOf({ actor_kind: kind }))
    assert.equal(a.ok, true, kind)
    assert.equal(b.ok, true, kind)
    if (!a.ok || !b.ok) return
    assert.deepEqual(
      JSON.parse(JSON.stringify(a.identity)),
      JSON.parse(JSON.stringify(b.identity)),
    )
  }
})

test("missing user, tenant, or session id fails closed (anonymous session rejected)", () => {
  for (const [override, field] of [
    [{ userId: undefined }, "userId"],
    [{ userId: "" }, "userId"],
    [{ userId: 42 }, "userId"],
    [{ tenantId: undefined }, "tenantId"],
    [{ tenantId: "" }, "tenantId"],
    [{ sessionId: undefined }, "sessionId"],
    [{ sessionId: "" }, "sessionId"],
  ] as const) {
    const result = createCanonicalSessionIdentity(sessionOf(override), sessionInputOf())
    expectIssue(result, "identity_state_missing", `(session).${field}`, JSON.stringify(override))
  }
})

test("tenant mismatch between expectation and session fails closed", () => {
  const result = createCanonicalSessionIdentity(
    sessionOf(),
    sessionInputOf({ expected_tenant_id: "tenant-OTHER" }),
  )
  expectIssue(result, "identity_tenant_mismatch", "(session).tenantId", "tenant mismatch")
})

test("expired and exactly-at-expiry sessions fail closed", () => {
  const expired = createCanonicalSessionIdentity(
    sessionOf({ expiresAt: "2026-07-05T00:00:00Z" }),
    sessionInputOf(),
  )
  expectIssue(expired, "identity_session_expired", "(session).expiresAt", "expired")
  // Inclusive-fail: observed_at exactly at expiry is already expired.
  const atExpiry = createCanonicalSessionIdentity(
    sessionOf({ expiresAt: OBSERVED_AT }),
    sessionInputOf(),
  )
  expectIssue(atExpiry, "identity_session_expired", "(session).expiresAt", "at expiry")
  // One second before expiry still passes.
  const justBefore = createCanonicalSessionIdentity(
    sessionOf({ expiresAt: "2026-07-05T00:30:01Z" }),
    sessionInputOf(),
  )
  assert.equal(justBefore.ok, true)
})

test("malformed timestamps fail closed", () => {
  const badObserved = createCanonicalSessionIdentity(
    sessionOf(),
    sessionInputOf({ observed_at: "2026/07/05 00:30" }),
  )
  expectIssue(badObserved, "invalid_identity_input", "(input).observed_at", "bad observed_at")
  const impossibleObserved = createCanonicalSessionIdentity(
    sessionOf(),
    sessionInputOf({ observed_at: "2026-13-01T00:00:00Z" }),
  )
  expectIssue(
    impossibleObserved,
    "invalid_identity_input",
    "(input).observed_at",
    "impossible observed_at",
  )
  for (const badExpiry of [undefined, null, "", "not-a-time", "2026-07-05T99:00:00Z", 42]) {
    const result = createCanonicalSessionIdentity(
      sessionOf({ expiresAt: badExpiry }),
      sessionInputOf(),
    )
    expectIssue(
      result,
      "identity_state_missing",
      "(session).expiresAt",
      `expiry ${String(badExpiry)}`,
    )
  }
})

test("development or indeterminate sessions are not approval-grade identity", () => {
  for (const dev of [true, undefined, null, "false", 0]) {
    const result = createCanonicalSessionIdentity(
      sessionOf({ isDevSession: dev }),
      sessionInputOf(),
    )
    expectIssue(
      result,
      "identity_source_untrusted",
      "(session).isDevSession",
      `isDevSession ${String(dev)}`,
    )
  }
})

test("actor kinds not derivable from a session fail closed (creator in particular)", () => {
  for (const kind of ["creator", "admin", "owner", "", 42, null]) {
    const result = createCanonicalSessionIdentity(
      sessionOf(),
      sessionInputOf({ actor_kind: kind }),
    )
    expectIssue(result, "identity_actor_kind_mismatch", "(input).actor_kind", String(kind))
  }
})

test("caller-supplied identity fields on the input fail closed (no identity smuggling)", () => {
  for (const field of ["user_id", "tenant_id", "userId", "session", "source_record_id"]) {
    const result = createCanonicalSessionIdentity(
      sessionOf(),
      sessionInputOf({ [field]: "attacker-controlled" }),
    )
    expectIssue(result, "invalid_identity_input", `(input).${field}`, field)
    if (result.ok) return
    for (const issue of result.issues) {
      assert.ok(!issue.message.includes("attacker-controlled"), "value never echoed")
    }
  }
})

test("delegation and service-account markers fail closed on session and input", () => {
  const delegatedInput = createCanonicalSessionIdentity(
    sessionOf(),
    sessionInputOf({ delegated_for_user_id: "user-target" }),
  )
  expectIssue(
    delegatedInput,
    "delegation_not_supported",
    "delegated_for_user_id",
    "delegated input",
  )
  const delegatedSession = createCanonicalSessionIdentity(
    sessionOf({ delegated_for_user_id: "user-target" }),
    sessionInputOf(),
  )
  expectIssue(
    delegatedSession,
    "delegation_not_supported",
    "(session).delegated_for_user_id",
    "delegated session",
  )
  const serviceSession = createCanonicalSessionIdentity(
    sessionOf({ isServiceAccount: true }),
    sessionInputOf(),
  )
  expectIssue(
    serviceSession,
    "identity_subject_unsupported",
    "(session).isServiceAccount",
    "service account",
  )
})

test("malformed session and input containers fail closed", () => {
  for (const bad of [null, undefined, "session", 42, []]) {
    const result = createCanonicalSessionIdentity(bad, sessionInputOf())
    expectIssue(result, "invalid_identity_input", "(session)", String(bad))
  }
  for (const bad of [null, undefined, "input", 42, []]) {
    const result = createCanonicalSessionIdentity(
      sessionOf(),
      bad as unknown as ReturnType<typeof sessionInputOf>,
    )
    expectIssue(result, "invalid_identity_input", "(input)", String(bad))
  }
})

test("the session constructor never mutates its inputs and reads getters once", () => {
  const session = sessionOf()
  const input = sessionInputOf()
  const sessionBefore = JSON.stringify(session)
  const inputBefore = JSON.stringify(input)
  createCanonicalSessionIdentity(session, input)
  assert.equal(JSON.stringify(session), sessionBefore)
  assert.equal(JSON.stringify(input), inputBefore)

  // Single-read snapshot: a getter-backed userId is read exactly once.
  const trapped = sessionOf()
  delete trapped.userId
  let reads = 0
  Object.defineProperty(trapped, "userId", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return "user-alpha"
    },
  })
  const result = createCanonicalSessionIdentity(trapped, sessionInputOf())
  assert.equal(reads, 1, "session.userId read exactly once")
  assert.equal(result.ok, true)
})

// ─── Stored preview creator identity ────────────────────────────

test("a valid stored preview creator constructs a frozen canonical identity", () => {
  const result = createCanonicalPreviewCreatorIdentity(previewOf(), previewInputOf())
  assert.equal(result.ok, true, JSON.stringify(result.ok ? [] : result.issues))
  if (!result.ok) return
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.identity))
  const identity = result.identity as unknown as Record<string, unknown>
  assert.equal(identity.tenant_id, "tenant-1")
  assert.equal(identity.user_id, "creator-1")
  assert.equal(identity.actor_kind, "creator")
  assert.equal(identity.identity_source, "stored_action_preview_creator")
  assert.equal(identity.source_record_id, "preview-1")
  assert.equal(identity.subject_type, "human_user")
  assert.equal(Object.getOwnPropertySymbols(identity).length, 0, "no runtime brand symbol")
})

test("a missing creator fails closed with no fallback identity", () => {
  for (const [override, label] of [
    [{ creatorUserId: undefined }, "undefined"],
    [{ creatorUserId: "" }, "empty"],
    [{ creatorUserId: null }, "null"],
    [{ creatorUserId: 42 }, "non-string"],
  ] as const) {
    const result = createCanonicalPreviewCreatorIdentity(
      previewOf(override as Record<string, unknown>),
      previewInputOf(),
    )
    expectIssue(result, "identity_state_missing", "(preview).creatorUserId", label)
    assert.equal("identity" in result, false, "no fallback identity is produced")
  }
})

test("preview tenant mismatch and missing identifiers fail closed", () => {
  const mismatch = createCanonicalPreviewCreatorIdentity(
    previewOf(),
    previewInputOf({ expected_tenant_id: "tenant-OTHER" }),
  )
  expectIssue(mismatch, "identity_tenant_mismatch", "(preview).tenantId", "tenant mismatch")
  const noId = createCanonicalPreviewCreatorIdentity(previewOf({ id: "" }), previewInputOf())
  expectIssue(noId, "identity_state_missing", "(preview).id", "missing preview id")
  const noWorkUnit = createCanonicalPreviewCreatorIdentity(
    previewOf({ workUnitId: undefined }),
    previewInputOf(),
  )
  expectIssue(noWorkUnit, "identity_state_missing", "(preview).workUnitId", "missing workunit")
  const noTenant = createCanonicalPreviewCreatorIdentity(
    previewOf({ tenantId: "" }),
    previewInputOf(),
  )
  expectIssue(noTenant, "identity_state_missing", "(preview).tenantId", "missing tenant")
})

test("malformed preview containers and client-owned input fields fail closed", () => {
  for (const bad of [null, undefined, "preview", 42, []]) {
    const result = createCanonicalPreviewCreatorIdentity(bad, previewInputOf())
    expectIssue(result, "invalid_identity_input", "(preview)", String(bad))
  }
  // The input argument can never supply the creator, user, or tenant: only
  // the stored row is consulted.
  for (const field of ["creatorUserId", "user_id", "tenant_id", "actor_kind"]) {
    const result = createCanonicalPreviewCreatorIdentity(
      previewOf(),
      previewInputOf({ [field]: "attacker-controlled" }),
    )
    expectIssue(result, "invalid_identity_input", `(input).${field}`, field)
  }
})

// ─── Structural validator and canonical equality ────────────────

test("validateCanonicalIdentity enforces sources, kinds, subjects, and pairing", () => {
  const base = {
    tenant_id: "tenant-1",
    user_id: "user-alpha",
    actor_kind: "reviewer",
    identity_source: "authenticated_session",
    source_record_id: "sess-1",
    observed_at: OBSERVED_AT,
    subject_type: "human_user",
  }
  assert.equal(validateCanonicalIdentity(base).ok, true)
  assert.equal(
    validateCanonicalIdentity({ ...base, identity_source: "client_supplied" }).ok,
    false,
  )
  assert.equal(validateCanonicalIdentity({ ...base, actor_kind: "admin" }).ok, false)
  assert.equal(validateCanonicalIdentity({ ...base, subject_type: "service_account" }).ok, false)
  // Pairing: a creator cannot claim a session source and vice versa.
  assert.equal(validateCanonicalIdentity({ ...base, actor_kind: "creator" }).ok, false)
  assert.equal(
    validateCanonicalIdentity({
      ...base,
      identity_source: "stored_action_preview_creator",
    }).ok,
    false,
  )
  // Unknown fields and markers fail closed.
  assert.equal(validateCanonicalIdentity({ ...base, role: "owner" }).ok, false)
  const delegated = validateCanonicalIdentity({ ...base, delegated_for_user_id: "user-x" })
  assert.equal(delegated.ok, false)
  assert.ok(delegated.issues.some((i) => i.code === "delegation_not_supported"))
  const service = validateCanonicalIdentity({ ...base, service_account_id: "svc-1" })
  assert.equal(service.ok, false)
  assert.ok(service.issues.some((i) => i.code === "identity_subject_unsupported"))
})

test("canonical equality is tenant_id + user_id — never role or actor kind", () => {
  const asReviewer = createCanonicalSessionIdentity(
    sessionOf({ role: "manager" }),
    sessionInputOf({ actor_kind: "reviewer" }),
  )
  const asApprover = createCanonicalSessionIdentity(
    sessionOf({ role: "owner", sessionId: "sess-2" }),
    sessionInputOf({ actor_kind: "approver" }),
  )
  const otherUser = createCanonicalSessionIdentity(
    sessionOf({ userId: "user-beta" }),
    sessionInputOf({ actor_kind: "approver" }),
  )
  assert.ok(asReviewer.ok && asApprover.ok && otherUser.ok)
  if (!asReviewer.ok || !asApprover.ok || !otherUser.ok) return
  // Same user under different roles, actor kinds, and sessions is the SAME
  // canonical identity.
  assert.equal(isSameCanonicalUser(asReviewer.identity, asApprover.identity), true)
  assert.equal(isSameCanonicalUser(asReviewer.identity, otherUser.identity), false)
})

// ─── No generic constructor / public namespace guard ────────────

test("the public namespace has no generic arbitrary-string identity constructor", () => {
  const exported = Object.keys(canonicalIdentityModule).sort()
  assert.deepEqual(exported, [
    "CANONICAL_ACTOR_KINDS",
    "CANONICAL_IDENTITY_ISSUE_CODES",
    "CANONICAL_IDENTITY_SOURCES",
    "CANONICAL_IDENTITY_SUBJECT_TYPES",
    "DELEGATION_MARKER_FIELDS",
    "SERVICE_ACCOUNT_MARKER_FIELDS",
    "SESSION_DERIVABLE_ACTOR_KINDS",
    "canonicalIdentityIssue",
    "canonicalIdentityResultOf",
    "collectUnsupportedIdentityMarkerIssues",
    "compareCanonicalIsoUtc",
    "createCanonicalPreviewCreatorIdentity",
    "createCanonicalSessionIdentity",
    "isCanonicalIdentityNonEmptyString",
    "isCanonicalIdentityRecord",
    "isSameCanonicalUser",
    "validateCanonicalIdentity",
  ])
  // The only constructors are the two trusted-source ones; both take the
  // trusted source object as their first argument, never raw id strings.
  const constructors = exported.filter((name) => name.startsWith("create"))
  assert.deepEqual(constructors, [
    "createCanonicalPreviewCreatorIdentity",
    "createCanonicalSessionIdentity",
  ])
})

test("construction failures never echo supplied identity values", () => {
  const hostile = createCanonicalSessionIdentity(
    sessionOf({ userId: "", tenantId: "hostile-tenant-value" }),
    sessionInputOf({ expected_tenant_id: "hostile-expected-value" }),
  )
  assert.equal(hostile.ok, false)
  if (hostile.ok) return
  const serialized = JSON.stringify(hostile.issues)
  assert.ok(!serialized.includes("hostile-tenant-value"))
  assert.ok(!serialized.includes("hostile-expected-value"))
  for (const issue of hostile.issues) {
    assert.equal(issue.message, `${issue.code}:${issue.field}`)
  }
})
