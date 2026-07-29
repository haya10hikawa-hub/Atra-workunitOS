/**
 * HTPE H1B2A: deterministic, shadow-only evaluator for a caller-declared
 * association between one revision-reference descriptor and one temporal
 * observation (docs/HTPE_H1B2A_DECLARED_TEMPORAL_ASSOCIATION_CONTRACT.md).
 *
 * DECLARED ASSOCIATION ONLY. PROCESS-LOCAL COMPOSITION ONLY. Nothing here
 * establishes subject identity, logical-claim identity or continuity, immutable
 * revision identity, a ClaimBinding, a Temporal ClaimBinding, a transition, a
 * correction, a supersession order, truth, authority, conflict, a latest or
 * preferred source, or persistence eligibility.
 *
 * OWNERSHIP BOUNDARY. This module owns ONLY the hostile transport boundary:
 * own-key allowlists, unknown keys rejected by NAME before any value behind
 * them is read, each accepted caller property read EXACTLY ONCE in a fixed
 * order, and containment of every caller exception or Proxy trap failure. It
 * owns no semantic validation — reference syntax and the declared basis stay
 * H1B1's; instants, null semantics and ordering stay H1A's.
 *
 * MANDATORY DETACHED SELF-PAIR CONSTRUCTION. A caller-owned object is NEVER
 * handed to a predecessor evaluator, and never handed to one twice. Two
 * DISTINCT plain frozen records are built per predecessor from the captured
 * values, and only those are passed, so a hostile accessor cannot observe a
 * second read, cannot diverge between the sides, and cannot reach a predecessor.
 *
 * No clock, no randomness, no I/O, no persistence, no production consumer.
 */

import type {
  DeclaredReferenceTemporalAssociationInput, DeclaredReferenceTemporalAssociationResult,
  DeclaredReferenceTemporalAssociationSnapshot, DeclaredReferenceTemporalAssociationSnapshotResult,
  DeclaredReferenceTemporalAssociationSuccess, DeclaredTemporalAssociationEvaluationFailureCode,
  DeclaredTemporalAssociationFailure, DeclaredTemporalAssociationReasonCode, TemporalBoundaryStatus,
} from "./types.ts"
import {
  evaluateDeclaredRevisionReferenceRelation,
  snapshotValidatedDeclaredRevisionReferenceRelation,
} from "../revisionReference/evaluate.ts"
import {
  evaluateTemporalRelation,
  snapshotValidatedTemporalRelationResult,
} from "../temporalContract/evaluate.ts"

const TOP_LEVEL_KEYS = ["declaredReference", "temporalObservation"] as const
// The predecessors' own required own-key sets, in their own fixed order. This
// module never adds, renames, reorders or reinterprets a predecessor key.
const REFERENCE_KEYS = ["subjectRef", "logicalClaimRef", "revisionRef", "identityBasis"] as const
const OBSERVATION_KEYS = ["validFrom", "validTo", "observedAt", "recordedAt"] as const

// One constant sentence per reason code; nothing is ever interpolated, so no
// caller value can travel into a narrative.
const NARRATIVE: Record<DeclaredTemporalAssociationReasonCode, string> = {
  caller_declared_named_field_co_submission: "The caller submitted one declared reference descriptor and one temporal observation together as two named fields of one input.",
  reference_contract_accepted_for_this_call: "The declared revision reference contract accepted detached copies of the captured reference values for this call.",
  temporal_contract_accepted_for_this_call: "The temporal relation contract accepted detached copies of the captured observation values for this call.",
  valid_interval_fully_bounded: "Both declared valid time boundaries were accepted as present.",
  valid_interval_boundary_unknown: "At least one declared valid time boundary is unknown, which means unknown and nothing else.",
  declaration_only_no_association_authority: "The association is declared by the caller and carries no association authority.",
  process_local_composition_only: "The two accepted predecessor results were composed only within this process.",
  identity_authority_none: "This composition holds no identity authority.",
  declared_basis_not_verified_here: "The declared identity basis is accepted as supplied and is not verified here.",
  immutable_revision_identity_not_established: "No immutable revision identity is established by this composition.",
  logical_claim_continuity_not_established: "No logical claim continuity is established by this composition.",
  claim_binding_not_established: "No claim binding is established by this composition.",
  temporal_claim_binding_not_established: "No temporal claim binding is established by this composition.",
  transition_evidence_not_established: "No transition evidence is established by this composition.",
  correction_relation_not_established: "No correction relation is established by this composition.",
  supersession_order_not_established: "No supersession order is established by this composition.",
}

const BOUNDARY_CODE: Record<TemporalBoundaryStatus, DeclaredTemporalAssociationReasonCode> = {
  fully_bounded: "valid_interval_fully_bounded",
  boundary_unknown: "valid_interval_boundary_unknown",
}

function fail(failureCode: DeclaredTemporalAssociationEvaluationFailureCode): DeclaredTemporalAssociationFailure {
  return Object.freeze({ ok: false as const, failureCode })
}

type Captured = { readonly values: readonly unknown[] } | DeclaredTemporalAssociationFailure

// Reads each allowed own key EXACTLY ONCE, in fixed order, after rejecting
// unknown own keys by NAME ONLY. Every trap or accessor throw fails closed.
function captureOwn(value: unknown, allowedKeys: readonly string[]): Captured {
  // `typeof` and `=== null` are total: they never invoke a Proxy internal
  // method, so a revoked Proxy reaches the readability checks below.
  if (value === null || typeof value !== "object") return fail("invalid_input")
  // Array.isArray performs IsArray, which THROWS on a revoked Proxy: an object
  // whose readability is gone is unreadable, not mistyped.
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

// Builds ONE detached inert record from already-captured values. Called twice
// per predecessor to produce two DISTINCT objects carrying the same values: no
// getter, no Proxy, no caller prototype, no alias to the caller's object,
// frozen before any predecessor sees it, values copied EXACTLY.
function detachedRecord(keys: readonly string[], values: readonly unknown[]): Readonly<Record<string, unknown>> {
  const record: Record<string, unknown> = {}
  for (let index = 0; index < keys.length; index += 1) record[keys[index]] = values[index]
  return Object.freeze(record)
}

type AttestationRecord = {
  readonly input: DeclaredReferenceTemporalAssociationInput
  readonly snapshot: DeclaredReferenceTemporalAssociationSnapshot
}

// Module-private: only the exact success object produced for the exact input
// object is ever registered. Not exported, not enumerable, not forgeable.
const ATTESTED: WeakMap<DeclaredReferenceTemporalAssociationSuccess, AttestationRecord> = new WeakMap()

// Fresh non-aliasing copy: new outer object, new frozen arrays, primitives only.
function detachedSnapshot(source: DeclaredReferenceTemporalAssociationSnapshot): DeclaredReferenceTemporalAssociationSnapshot {
  return Object.freeze({
    ...source,
    reasonCodes: Object.freeze([...source.reasonCodes]),
    narrative: Object.freeze([...source.narrative]),
  })
}

function buildSnapshot(success: DeclaredReferenceTemporalAssociationSuccess): DeclaredReferenceTemporalAssociationSnapshot {
  const { ok, ...fields } = success
  void ok
  return detachedSnapshot(fields)
}

/**
 * Deterministic; the evaluation order is fixed and documented in the contract.
 * Failures are closed-vocabulary and value-free, and never echo a predecessor
 * failure code, a caller key name, a caller value or a caller exception.
 */
export function evaluateDeclaredReferenceTemporalAssociation(
  input: unknown,
): DeclaredReferenceTemporalAssociationResult {
  const top = captureOwn(input, TOP_LEVEL_KEYS)
  if ("ok" in top) return top
  const [declaredReferenceRaw, temporalObservationRaw] = top.values
  const reference = captureOwn(declaredReferenceRaw, REFERENCE_KEYS)
  if ("ok" in reference) return reference
  const observation = captureOwn(temporalObservationRaw, OBSERVATION_KEYS)
  if ("ok" in observation) return observation

  // Every caller property has now been read exactly once. From here only
  // detached local values are used: the caller's objects are unreachable by
  // both predecessors.
  const referencePairInput = {
    left: detachedRecord(REFERENCE_KEYS, reference.values),
    right: detachedRecord(REFERENCE_KEYS, reference.values),
  }
  const temporalPairInput = {
    left: detachedRecord(OBSERVATION_KEYS, observation.values),
    right: detachedRecord(OBSERVATION_KEYS, observation.values),
  }

  const referenceResult = evaluateDeclaredRevisionReferenceRelation(referencePairInput)
  if (!referenceResult.ok) return fail("reference_contract_rejected")
  const referenceAttestation =
    snapshotValidatedDeclaredRevisionReferenceRelation(referenceResult, referencePairInput)
  if (!referenceAttestation.ok) return fail("predecessor_attestation_rejected")
  // Under two detached copies of the same values these relations are constant BY
  // CONSTRUCTION: checked as a self-signature, never emitted, and never read as
  // sameness of subject, claim or revision.
  const reference1 = referenceAttestation.snapshot
  if (
    reference1.declaredSubjectRefRelation !== "same_declared_ref" ||
    reference1.declaredLogicalClaimRefRelation !== "same_declared_ref" ||
    reference1.declaredRevisionRefRelation !== "same_declared_ref" ||
    reference1.referenceEqualityOnly !== true || reference1.basisVerifiedHere !== false ||
    reference1.identityAuthority !== "none" ||
    reference1.immutableRevisionIdentity !== "not_established" ||
    reference1.logicalClaimContinuity !== "not_established" ||
    reference1.claimBinding !== "not_established" ||
    reference1.transitionEvidence !== "not_established" ||
    reference1.supersessionOrder !== "not_established" ||
    reference1.correctionRelation !== "not_established"
  ) {
    return fail("predecessor_signature_mismatch")
  }

  const temporalResult = evaluateTemporalRelation(
    temporalPairInput as unknown as Parameters<typeof evaluateTemporalRelation>[0],
  )
  if (!temporalResult.ok) return fail("temporal_contract_rejected")
  const temporalAttestation = snapshotValidatedTemporalRelationResult(temporalResult, temporalPairInput)
  if (!temporalAttestation.ok) return fail("predecessor_attestation_rejected")
  // Nullness is inspected for ONE purpose: which verdict H1A must have returned.
  // No instant is parsed and no interval ordered here; null is never resolved
  // into open, current, ongoing, still valid, unbounded or infinity.
  const [validFrom, validTo] = observation.values
  const expectedValidTime = validFrom !== null && validTo !== null ? "same_interval" : "unresolved"
  const temporal1 = temporalAttestation.snapshot
  if (
    temporal1.validTimeRelation !== expectedValidTime ||
    temporal1.observedTimeRelation !== "same_instant" ||
    temporal1.recordedTimeRelation !== "same_instant" ||
    temporal1.arrivalClassification !== "unresolved" ||
    temporal1.transitionEvidence !== "not_established" ||
    temporal1.supersessionOrder !== "not_established"
  ) {
    return fail("predecessor_signature_mismatch")
  }
  // Derived from H1A's own verdict, not from a boundary test of this module's.
  const temporalBoundaryStatus: TemporalBoundaryStatus =
    temporal1.validTimeRelation === "same_interval" ? "fully_bounded" : "boundary_unknown"

  // Documented deterministic order; only the boundary code varies.
  const reasonCodes: readonly DeclaredTemporalAssociationReasonCode[] = Object.freeze([
    "caller_declared_named_field_co_submission" as const,
    "reference_contract_accepted_for_this_call" as const,
    "temporal_contract_accepted_for_this_call" as const,
    BOUNDARY_CODE[temporalBoundaryStatus],
    "declaration_only_no_association_authority" as const, "process_local_composition_only" as const,
    "identity_authority_none" as const, "declared_basis_not_verified_here" as const,
    "immutable_revision_identity_not_established" as const,
    "logical_claim_continuity_not_established" as const, "claim_binding_not_established" as const,
    "temporal_claim_binding_not_established" as const, "transition_evidence_not_established" as const,
    "correction_relation_not_established" as const, "supersession_order_not_established" as const,
  ])
  const success: DeclaredReferenceTemporalAssociationSuccess = Object.freeze({
    ok: true as const,
    candidateOnly: true as const, shadowOnly: true as const, humanReviewRequired: true as const,
    declaredAssociation: "caller_declared_named_field_co_submission" as const,
    associationAuthority: "declaration_only" as const,
    processLocalComposition: "established" as const,
    referenceContractCheck: "accepted_for_this_call" as const,
    temporalContractCheck: "accepted_for_this_call" as const,
    temporalBoundaryStatus,
    identityAuthority: "none" as const,
    basisVerifiedHere: false as const,
    immutableRevisionIdentity: "not_established" as const,
    logicalClaimContinuity: "not_established" as const,
    claimBinding: "not_established" as const,
    temporalClaimBinding: "not_established" as const,
    transitionEvidence: "not_established" as const,
    correctionRelation: "not_established" as const,
    supersessionOrder: "not_established" as const,
    reasonCodes,
    narrative: Object.freeze(reasonCodes.map((code) => NARRATIVE[code])),
  })
  ATTESTED.set(success, {
    input: input as DeclaredReferenceTemporalAssociationInput,
    snapshot: buildSnapshot(success),
  })
  return success
}

/**
 * Returns a detached inert snapshot only for the exact success object produced
 * by this module, presented with the exact top-level input it came from. Clones,
 * wrappers, proxies, forgeries, failed results and replays are rejected with one
 * value-free code; repeated calls never alias. It proves ONLY that this module
 * produced this result for that exact input in this process — no ClaimBinding,
 * no identity authority.
 */
export function snapshotValidatedDeclaredReferenceTemporalAssociation(
  result: unknown,
  input: unknown,
): DeclaredReferenceTemporalAssociationSnapshotResult {
  const record = result !== null && typeof result === "object"
    ? ATTESTED.get(result as DeclaredReferenceTemporalAssociationSuccess)
    : undefined
  if (record === undefined || record.input !== input) {
    return Object.freeze({ ok: false as const, failureCode: "attestation_rejected" as const })
  }
  return Object.freeze({ ok: true as const, snapshot: detachedSnapshot(record.snapshot) })
}
