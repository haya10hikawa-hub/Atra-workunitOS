/**
 * HTPE H1B1: deterministic, shadow-only, pairwise declared-revision-reference
 * relation evaluator (docs/HTPE_H1B1_REVISION_REFERENCE_CONTRACT.md).
 *
 * Reads the hostile public input exactly once per allowed property, captures
 * detached local primitives, fails closed and value-free, and reports byte
 * equality of three corresponding opaque declared references.
 *
 * REFERENCE EQUALITY ONLY. `same_declared_ref` means only that the two
 * validated opaque strings are byte-for-byte identical. Nothing here proves
 * that a reference denotes a real object, that two revisions are the same
 * immutable revision, that a logical claim continues, that a claim is bound,
 * or that any transition, correction, supersession, conflict, truth,
 * authority or preferred source exists: those stay constant `not_established`
 * literals and `identityAuthority` is constant `none`.
 *
 * References are accepted EXACTLY as supplied — never trimmed, never
 * normalized, never lower-cased, never decoded, never parsed as a timestamp,
 * URL, provider id, digest or content. This module mints no reference and
 * derives no reference from another field. Only CORRESPONDING fields are
 * compared, so a left reference of one domain can never match a right
 * reference of another.
 *
 * No import other than ./types. No clock read, no randomness, no I/O, no
 * environment access, no LLM path, no provider, no persistence, no production
 * consumer.
 */

import type {
  DeclaredReferenceRelation,
  DeclaredRevisionReferenceEvaluationFailureCode,
  DeclaredRevisionReferenceFailure,
  DeclaredRevisionReferenceReasonCode,
  DeclaredRevisionReferenceRelationInput,
  DeclaredRevisionReferenceRelationResult,
  DeclaredRevisionReferenceRelationSuccess,
  DeclaredRevisionReferenceSnapshot,
  DeclaredRevisionReferenceSnapshotResult,
} from "./types.ts"

const TOP_LEVEL_KEYS = ["left", "right"] as const
const DESCRIPTOR_KEYS = ["subjectRef", "logicalClaimRef", "revisionRef", "identityBasis"] as const

// ASCII base64url-compatible characters only, one to one hundred twenty-eight
// of them. Anchored, so whitespace, slash, dot, colon, plus, equals and every
// non-ASCII code unit are rejected rather than stripped.
const DECLARED_REFERENCE = /^[A-Za-z0-9_-]{1,128}$/

// The ONLY accepted basis. It is a caller DECLARATION, never a verification.
const ACCEPTED_IDENTITY_BASIS = "declared_opaque_ref"

// Bases the repository explicitly refuses as identity. Naming them (rather
// than omitting them) is deliberate: a caller that declares one gets a
// distinct, deterministic refusal instead of a generic "unknown".
const FORBIDDEN_IDENTITY_BASES: readonly string[] = Object.freeze([
  "source_object_id", "provider_object_id", "provider_revision_id", "provider_name", "title",
  "summary", "url", "actor", "display_name", "latest_timestamp", "observed_at", "recorded_at",
  "array_position", "semantic_similarity", "llm_inference",
])

// One constant sentence per reason code; nothing is ever interpolated, so no
// caller value can travel into a narrative.
const NARRATIVE: Record<DeclaredRevisionReferenceReasonCode, string> = {
  declared_subject_ref_same: "The two declared subject references are byte-for-byte identical.",
  declared_subject_ref_different: "The two declared subject references differ byte-for-byte.",
  declared_logical_claim_ref_same: "The two declared logical-claim references are byte-for-byte identical.",
  declared_logical_claim_ref_different: "The two declared logical-claim references differ byte-for-byte.",
  declared_revision_ref_same: "The two declared revision references are byte-for-byte identical.",
  declared_revision_ref_different: "The two declared revision references differ byte-for-byte.",
  reference_equality_only: "This comparison establishes byte equality of validated opaque declared references only.",
  declared_basis_not_verified_here: "The declared identity basis is accepted as supplied and is not verified here.",
  immutable_revision_identity_not_established: "No immutable revision identity is established by this comparison.",
  logical_claim_continuity_not_established: "No logical-claim continuity is established by this comparison.",
  claim_binding_not_established: "No claim binding is established by this comparison.",
  transition_evidence_not_established: "No transition evidence is established by this comparison.",
  supersession_order_not_established: "No supersession order is established by this comparison.",
  correction_relation_not_established: "No correction relation is established by this comparison.",
}

type CodeByRelation = Record<DeclaredReferenceRelation, DeclaredRevisionReferenceReasonCode>
const SUBJECT_CODE: CodeByRelation =
  { same_declared_ref: "declared_subject_ref_same", different_declared_ref: "declared_subject_ref_different" }
const LOGICAL_CLAIM_CODE: CodeByRelation =
  { same_declared_ref: "declared_logical_claim_ref_same", different_declared_ref: "declared_logical_claim_ref_different" }
const REVISION_CODE: CodeByRelation =
  { same_declared_ref: "declared_revision_ref_same", different_declared_ref: "declared_revision_ref_different" }

function fail(failureCode: DeclaredRevisionReferenceEvaluationFailureCode): DeclaredRevisionReferenceFailure {
  return Object.freeze({ ok: false as const, failureCode })
}

type Captured = { readonly values: readonly unknown[] } | DeclaredRevisionReferenceFailure

// Reads each allowed own key of one hostile object exactly once, in fixed key
// order, after rejecting unknown own keys by NAME ONLY (their values are never
// read). Every trap or accessor throw fails closed and value-free.
function captureOwn(value: unknown, allowedKeys: readonly string[]): Captured {
  // `typeof` and `=== null` are total: they never invoke a Proxy internal
  // method, so a revoked Proxy reaches the readability checks below.
  if (value === null || typeof value !== "object") return fail("invalid_input")
  // Array.isArray performs IsArray, which THROWS on a revoked Proxy. An object
  // whose readability is gone is unreadable, not mistyped, so it joins the
  // other trap failures rather than invalid_input.
  let isArray: boolean
  try {
    isArray = Array.isArray(value)
  } catch {
    return fail("input_unreadable")
  }
  if (isArray) return fail("invalid_input")
  let ownKeys: (string | symbol)[]
  try {
    ownKeys = Reflect.ownKeys(value)
  } catch {
    return fail("input_unreadable")
  }
  for (const key of ownKeys) {
    if (typeof key !== "string" || !allowedKeys.includes(key)) return fail("unknown_field")
  }
  const values: unknown[] = []
  for (const key of allowedKeys) {
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch {
      return fail("input_unreadable")
    }
    // Own-descriptor absence is a missing field: an inherited value never counts.
    if (descriptor === undefined) return fail("missing_field")
    try {
      values.push((value as Record<string, unknown>)[key])
    } catch {
      return fail("input_unreadable")
    }
  }
  return { values }
}

// Accepts a PRIMITIVE string only, exactly as supplied. A boxed String, a
// number, a symbol and every other type are refused rather than coerced.
function isDeclaredReference(value: unknown): value is string {
  return typeof value === "string" && DECLARED_REFERENCE.test(value)
}

type Descriptor = {
  readonly subjectRef: string
  readonly logicalClaimRef: string
  readonly revisionRef: string
}

// Validation order inside a descriptor is the fixed key order: the three
// references first, then the declared basis. The basis is checked against the
// accepted literal by strict primitive equality; only then is a declared
// forbidden name distinguished from an unknown one.
function validateDescriptor(raw: unknown): Descriptor | DeclaredRevisionReferenceFailure {
  const captured = captureOwn(raw, DESCRIPTOR_KEYS)
  if ("ok" in captured) return captured
  const [subjectRef, logicalClaimRef, revisionRef, identityBasis] = captured.values
  for (const reference of [subjectRef, logicalClaimRef, revisionRef]) {
    if (!isDeclaredReference(reference)) return fail("invalid_reference")
  }
  if (identityBasis !== ACCEPTED_IDENTITY_BASIS) {
    if (typeof identityBasis === "string" && FORBIDDEN_IDENTITY_BASES.includes(identityBasis)) {
      return fail("forbidden_identity_basis")
    }
    return fail("unsupported_identity_basis")
  }
  return {
    subjectRef: subjectRef as string,
    logicalClaimRef: logicalClaimRef as string,
    revisionRef: revisionRef as string,
  }
}

// The whole relational surface of this module: byte equality of two validated
// opaque strings, and nothing else. No ordering, no preference, no authority.
function relate(left: string, right: string): DeclaredReferenceRelation {
  return left === right ? "same_declared_ref" : "different_declared_ref"
}

type AttestationRecord = {
  readonly input: DeclaredRevisionReferenceRelationInput
  readonly snapshot: DeclaredRevisionReferenceSnapshot
}

// Module-private: only the exact success object produced for the exact input
// object is ever registered. Not exported, not enumerable, not forgeable.
const ATTESTED: WeakMap<DeclaredRevisionReferenceRelationSuccess, AttestationRecord> = new WeakMap()

// Fresh non-aliasing copy: new outer object, new frozen arrays, primitives
// only. Used both to detach the stored snapshot from the returned success and
// to detach every snapshot returned to a caller from the stored one.
function detachedSnapshot(source: DeclaredRevisionReferenceSnapshot): DeclaredRevisionReferenceSnapshot {
  return Object.freeze({
    ...source,
    reasonCodes: Object.freeze([...source.reasonCodes]),
    narrative: Object.freeze([...source.narrative]),
  })
}

function buildSnapshot(success: DeclaredRevisionReferenceRelationSuccess): DeclaredRevisionReferenceSnapshot {
  const { ok, ...fields } = success
  void ok
  return detachedSnapshot(fields)
}

/**
 * Evaluates the pairwise declared-reference relation of two descriptors.
 * Deterministic; validation order is fixed (top level, then left, then right);
 * failures are closed-vocabulary and value-free. The result reports byte
 * equality only and carries no reference value, no declared basis and no
 * authority.
 */
export function evaluateDeclaredRevisionReferenceRelation(
  input: unknown,
): DeclaredRevisionReferenceRelationResult {
  const captured = captureOwn(input, TOP_LEVEL_KEYS)
  if ("ok" in captured) return captured
  const [leftRaw, rightRaw] = captured.values
  const left = validateDescriptor(leftRaw)
  if ("ok" in left) return left
  const right = validateDescriptor(rightRaw)
  if ("ok" in right) return right

  // Corresponding fields only. Cross-domain equality (for example a left
  // subjectRef equal to a right logicalClaimRef) is never consulted.
  const declaredSubjectRefRelation = relate(left.subjectRef, right.subjectRef)
  const declaredLogicalClaimRefRelation = relate(left.logicalClaimRef, right.logicalClaimRef)
  const declaredRevisionRefRelation = relate(left.revisionRef, right.revisionRef)

  // Documented deterministic order: subject, logical claim, revision, then the
  // seven constant non-authority codes.
  const reasonCodes: readonly DeclaredRevisionReferenceReasonCode[] = Object.freeze([
    SUBJECT_CODE[declaredSubjectRefRelation],
    LOGICAL_CLAIM_CODE[declaredLogicalClaimRefRelation],
    REVISION_CODE[declaredRevisionRefRelation],
    "reference_equality_only" as const, "declared_basis_not_verified_here" as const,
    "immutable_revision_identity_not_established" as const,
    "logical_claim_continuity_not_established" as const, "claim_binding_not_established" as const,
    "transition_evidence_not_established" as const, "supersession_order_not_established" as const,
    "correction_relation_not_established" as const,
  ])
  const success: DeclaredRevisionReferenceRelationSuccess = Object.freeze({
    ok: true as const,
    candidateOnly: true as const, shadowOnly: true as const, humanReviewRequired: true as const,
    referenceEqualityOnly: true as const,
    basisVerifiedHere: false as const,
    identityAuthority: "none" as const,
    declaredSubjectRefRelation, declaredLogicalClaimRefRelation, declaredRevisionRefRelation,
    immutableRevisionIdentity: "not_established" as const,
    logicalClaimContinuity: "not_established" as const,
    claimBinding: "not_established" as const,
    transitionEvidence: "not_established" as const,
    supersessionOrder: "not_established" as const,
    correctionRelation: "not_established" as const,
    reasonCodes,
    narrative: Object.freeze(reasonCodes.map((code) => NARRATIVE[code])),
  })
  ATTESTED.set(success, { input: input as DeclaredRevisionReferenceRelationInput, snapshot: buildSnapshot(success) })
  return success
}

/**
 * Returns a detached inert snapshot only for the exact success object produced
 * by this module, presented together with the exact top-level input object it
 * was produced from. Clones, wrappers, proxies, forgeries, failed results,
 * structurally equal inputs and cross-input replays are rejected with one
 * value-free code. Repeated calls never alias.
 *
 * A snapshot proves only that this module produced that relation for that
 * exact input object. It proves no identity authority.
 */
export function snapshotValidatedDeclaredRevisionReferenceRelation(
  result: unknown,
  input: unknown,
): DeclaredRevisionReferenceSnapshotResult {
  const record = result !== null && typeof result === "object"
    ? ATTESTED.get(result as DeclaredRevisionReferenceRelationSuccess)
    : undefined
  if (record === undefined || record.input !== input) {
    return Object.freeze({ ok: false as const, failureCode: "attestation_rejected" as const })
  }
  return Object.freeze({ ok: true as const, snapshot: detachedSnapshot(record.snapshot) })
}
