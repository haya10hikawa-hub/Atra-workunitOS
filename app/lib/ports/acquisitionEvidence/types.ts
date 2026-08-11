/**
 * Acquisition Evidence Port — revised neutral contract
 *
 * The neutral acquisition-evidence contract a future, separately authorized
 * provider-profile implementation must satisfy. It is a contract and nothing
 * else: no producer, no provider profile, no provider call, no canonicalization,
 * no hashing, no clock, no retention store, no persistence.
 *
 * Declaring it proves nothing about any provider. Every GitHub, Slack and Google
 * Calendar identity and content-scope profile stays `REQUIRED_UNPROVEN`, no
 * current provider path depends on or is wired to this contract, P1-1 stays
 * `PARTIAL` and the `SourceRecordV1` runtime producer stays absent. See
 * docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md and
 * docs/architecture/ACQUISITION_EVIDENCE_CONTRACT.md.
 *
 * WHAT THIS REVISION REPLACES, AND WHY
 *
 * The first declaration of this contract carried four attested strings —
 * `providerObjectKey`, `observedAt`, `sourceEventAt`, `contentDigest` — paired
 * with a `NormalizedToolSignal` in an `AcquiredSignalObservation` envelope. Both
 * of those types are removed here, deliberately, because that shape could not
 * express the thing it claimed. Nothing in it retained a subject for the
 * integrity evidence, so a conforming value was indistinguishable from one whose
 * `contentDigest` was computed over the Atra projection sitting beside it in the
 * same envelope — a forbidden subject, and the only material actually present to
 * hash. The B2-P1 rule "any in-scope provider-content change must change the
 * digest" was not merely unenforced, it was untestable. Pairing evidence with a
 * projection also made that projection the most available source of identity and
 * of tenancy, both of which must be acquisition evidence.
 *
 * This revision therefore keeps no dependency on `NormalizedToolSignal`.
 * `NormalizedToolSignal` itself is unchanged, keeps its existing fields, and
 * remains provider-ingress signal and application material: not domain truth,
 * not `SourceRecordV1`, not an alias or subtype of it, and never a valid
 * `contentDigest` subject. Acquisition evidence is never added to it, and it is
 * never a component of acquisition evidence.
 *
 * STRUCTURAL SIMILARITY IS NOT CONFORMANCE.
 *
 * TypeScript is structurally typed, so any module can assemble an object with
 * these field names and types without depending on this module. Doing so
 * establishes nothing. Shape alone does not make a value authorized or truthful
 * acquisition evidence: shape carries no proof that the retained bytes are the
 * provider's own, no ratified per-provider identity profile, no ratified
 * content-scope profile and no honest observation instant. A structural
 * lookalike is a lookalike and not conforming evidence.
 *
 * What the shape does change is the *kind* of failure available. A hand-authored
 * payload can still be typed into these fields, but it can no longer be a silent
 * gap the contract cannot see: it must assert an authorized acquisition mode over
 * retained content it claims came from a provider, and that claim is checkable
 * against the retained bytes by a later, separately authorized reviewer. The
 * contract makes fixture promotion a false attestation rather than an omission.
 * It does not, and no test can, prove provider authenticity.
 *
 * Conforming production requires a separately reviewed provider identity profile
 * and content-scope profile, a reviewed retention mechanism, and an explicitly
 * authorized integration WorkUnit that wires a producer to this contract. No
 * provider has that authorization today, and no provider module depends on this
 * contract.
 *
 * `ACQUISITION_SCOPE_CHANGE_REQUIRED` stays `YES`. The existence of this contract
 * does not by itself satisfy the acquisition scope change it names.
 *
 * LIVE_PROVIDER acquisition stays deferred and unauthorized. It is absent from
 * `AcquisitionMode` on purpose, so authorizing it is a visible contract change.
 *
 * This module imports nothing and declares no runtime value.
 */

// ─── Distinct identities ────────────────────────────────────────

/**
 * The identity of one acquisition-capture event.
 *
 * Branded rather than a bare `string` because the distinction it carries is the
 * whole of capability C1: capture identity is not source identity, not
 * `SourceRecordV1` identity, and not a replay. A bare `string` field makes that
 * distinction a comment, and `providerObjectKey` — a source identity — becomes
 * silently assignable to it. The brand blocks that direction. It is a
 * declaration, not a validator: a cast still defeats it, and nothing here mints,
 * formats or checks the value.
 */
export type AcquisitionCaptureId = string & {
  readonly __acquisitionCaptureId: "AcquisitionCaptureId"
}

/**
 * The tenant partition the capture belongs to.
 *
 * Acquisition evidence, not a copied projection field. `NormalizedToolSignal`
 * carries `tenantId: string` deliberately unbranded because every provider event
 * declares it and every mapper copies it through unvalidated; taking tenancy
 * from there would inherit exactly that absence of validation into evidence that
 * a later `SourceRecordV1` identity is built from. Branded for the same reason as
 * the capture id: a bare `string` makes an unvalidated projection string
 * silently assignable.
 *
 * Partition, never permission. Which component validates it, and against what,
 * is deferred and decided by no WorkUnit yet.
 */
export type AcquisitionTenantPartition = string & {
  readonly __acquisitionTenantPartition: "AcquisitionTenantPartition"
}

// ─── Acquisition mode ───────────────────────────────────────────

/**
 * The authorized acquisition mode that produced a capture.
 *
 * A closed union: the three non-live read-only modes ratified for Phase-1 and
 * nothing else. There is no fixture mode and no live-provider mode. Live
 * read-only provider integration is deferred and unauthorized, so adding it here
 * is the visible contract change that would carry that authorization.
 */
export type AcquisitionMode =
  | "HUMAN_TRIGGERED_PROVIDER_EXPORT"
  | "RECORDED_PROVIDER_PAYLOAD"
  | "OTHER_READ_ONLY_CAPTURE"

// ─── Retained provider content ──────────────────────────────────

/**
 * The externally-authored provider content the capture retained, in one of the
 * two admissible forms.
 *
 * A provider URL, permalink or re-fetch handle is not one of them and never
 * satisfies this: re-fetching at verification time is a new observation of a
 * possibly-changed object, and it silently converts a non-live capture into an
 * unauthorized live read. No Atra projection — no `NormalizedToolSignal`, no
 * normalized provider view, no `SourceRecordV1` field — may serve as retained
 * content.
 *
 * Retention is immutable and append-only. Captured bytes are never edited in
 * place and never redacted; narrowing what is attested is the content-scope
 * profile's job, and an object that cannot be narrowed is excluded rather than
 * altered.
 */
export type RetainedProviderContent =
  | {
    /**
     * The provider's own bytes, retained with the capture, base64-encoded.
     * Base64 is a lossless reversible transport encoding of the exact bytes,
     * not a normalization of them: nothing is trimmed, case-folded,
     * re-encoded or canonicalized.
     */
    readonly retention: "INLINE_BYTES"
    readonly bytesBase64: string
  }
  | {
    /**
     * The provider's own bytes, retained outside the capture and bound to it.
     *
     * Both members are required and neither is derivable from the other. The
     * locator alone is the inadmissible case: a pointer whose target may
     * change is a re-fetch handle. `retainedContentDigest` is what makes the
     * reference integrity-bound — it attests the exact retained byte stream,
     * so substituting the target is detectable.
     *
     * This is deliberately not `contentDigest`. Its subject is the whole
     * retained raw byte stream; `contentDigest`'s subject is the canonicalized
     * in-scope portion selected by a content-scope profile. Conflating the two
     * would let a profile-scoped value stand in for raw-content integrity.
     *
     * The locator is opaque to this contract and is a retention-store address,
     * never a provider URL. No retention store exists or is authorized.
     */
    readonly retention: "INTEGRITY_BOUND_REFERENCE"
    readonly retainedContentLocator: string
    readonly retainedContentDigest: string
  }

// ─── Content scope binding ──────────────────────────────────────

/**
 * Binds the retained provider content to the reviewed content-scope profile that
 * selected a portion of it, and to the integrity evidence over that portion.
 *
 * This names a profile; it does not define one, for any provider. The profile
 * identity and its version are separate values because B2-P1 is stated per
 * provider *and per profile version*: a digest is comparable only against
 * another produced under the same version, so a version change must be visible
 * without re-deriving it from the profile identity.
 *
 * `contentDigest` is the value a later `SourceRecordV1` would carry. It is
 * attested here and computed nowhere in this module. What the revision adds is
 * the missing half: with `RetainedProviderContent` present in the same capture,
 * the attestation finally has a subject a reviewer can re-check it against.
 */
export type ContentScopeBinding = {
  readonly contentScopeProfileId: string
  readonly contentScopeProfileVersion: string
  readonly contentDigest: string
}

// ─── Provider identity provenance ───────────────────────────────

/**
 * The provider-origin material needed to re-check `providerObjectKey` later,
 * under a named identity-profile version.
 *
 * `providerNamespace` is the namespace in which the key is interpreted, stated
 * by acquisition as provider-native material and carried byte-for-byte. It is
 * deliberately an unconstrained `string`: enumerating providers here would be
 * provider selection, which this contract may not make. It is never derived from
 * `NormalizedToolProvider` — that vocabulary is an Atra projection with its own
 * spelling, and mapping it onto a provider namespace is provider relabelling.
 *
 * The two profile members name the reviewed per-provider identity profile the
 * key was formed under. Without them a key cannot be re-checked at all, because
 * admissibility is defined by a profile and not by the key's shape. As with the
 * content-scope profile, the version is separate: a key admissible under one
 * version is not thereby admissible under another.
 *
 * No profile is proven, none is defined here, and this contract does not check
 * provider nativeness.
 */
export type ProviderIdentityProvenance = {
  readonly providerNamespace: string
  readonly providerObjectKey: string
  readonly identityProfileId: string
  readonly identityProfileVersion: string
}

// ─── Capture ────────────────────────────────────────────────────

/**
 * One actual acquisition event: one real read of one provider object at one
 * instant, and everything that read established.
 *
 * `observedAt` is acquisition-owned — the instant Atra actually observed the
 * provider state this capture represents. It is never inferred from a
 * projection's `createdAt`, `updatedAt`, `dueAt` or `sourceEventAt`, and never
 * invented when an implementation cannot truthfully establish it.
 *
 * `sourceEventAt` is provider-stated: a string when the provider states the
 * relevant event time, `null` when it does not. `null` means UNKNOWN and stays
 * `null`; it is never filled from "now", `observedAt` or an update time to avoid
 * a null.
 *
 * `recordedAt` is absent, and its absence is the contract. Recording is a later,
 * separately authorized producer's act, not an acquisition fact; a slot for it
 * here would invite acquisition to state a time it does not own.
 */
export type AcquisitionCapture = {
  readonly kind: "CAPTURE"
  readonly captureId: AcquisitionCaptureId
  readonly tenantPartition: AcquisitionTenantPartition
  readonly acquisitionMode: AcquisitionMode
  readonly identity: ProviderIdentityProvenance
  readonly retainedContent: RetainedProviderContent
  readonly contentScope: ContentScopeBinding
  readonly observedAt: string
  readonly sourceEventAt: string | null
}

// ─── Replay ─────────────────────────────────────────────────────

/**
 * A replay of an existing capture: a re-read of what was already acquired.
 *
 * It carries the original capture's identity and nothing else, and that is the
 * point. A replay creates no new observation, so it has no `observedAt` to
 * re-stamp — the field it would have to lie in does not exist. It restates no
 * evidence, so it cannot alter any. Re-stamping `observedAt` at replay time is
 * the single easiest way to launder a hand-authored payload into a recorded
 * source, and it is unrepresentable here rather than merely forbidden in prose.
 *
 * The `kind` literals are what keep the two apart. Without them an
 * `AcquisitionCapture` value would be assignable wherever a replay is expected,
 * because a capture has every field a replay has; the disjoint literals make the
 * two mutually unassignable in both directions.
 */
export type AcquisitionCaptureReplay = {
  readonly kind: "REPLAY_OF_CAPTURE"
  readonly captureId: AcquisitionCaptureId
}

// ─── Boundary contract ──────────────────────────────────────────

/**
 * What may cross the acquisition boundary: a capture, or a replay of one.
 *
 * The union is closed on purpose. It is the single place a third form — a live
 * provider read above all — would have to be added, so deferring live
 * acquisition is enforced by the type rather than recorded in a comment. A
 * consumer must narrow on `kind` before reading any evidence, which is the
 * structural form of "a replay is not an observation".
 */
export type AcquisitionEvidence = AcquisitionCapture | AcquisitionCaptureReplay
