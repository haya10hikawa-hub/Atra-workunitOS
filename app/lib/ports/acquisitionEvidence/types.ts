/**
 * Acquisition Evidence Port — the contract one real recorded acquisition uses.
 *
 * This is a boundary contract: no producer, no provider call, no canonicalization,
 * no hashing, no clock, no persistence. It declares what an acquisition must have
 * established about one provider object before a canonical `SourceRecordV1` may be
 * produced from it.
 *
 * WHAT THIS REVISION REPLACES, AND WHY
 *
 * The first declaration carried four attested strings — `providerObjectKey`,
 * `observedAt`, `sourceEventAt`, `contentDigest` — paired with a
 * `NormalizedToolSignal` in an `AcquiredSignalObservation` envelope. Both of those
 * types are removed here because that shape could not express the thing it claimed.
 * Nothing in it retained a subject for the integrity evidence, so a conforming
 * value was indistinguishable from one whose `contentDigest` was computed over the
 * Atra projection sitting beside it in the same envelope — a forbidden subject, and
 * the only material actually present to hash. The B2-P1 rule "any in-scope
 * provider-content change must change the digest" was not merely unenforced, it was
 * untestable. Pairing evidence with a projection also made that projection the most
 * available source of identity and of tenancy, both of which must be acquisition
 * evidence.
 *
 * This revision keeps no dependency on `NormalizedToolSignal`, and the ports layer
 * is a graph leaf again. `NormalizedToolSignal` itself is unchanged and remains
 * provider-ingress signal and application material: not domain truth, not
 * `SourceRecordV1`, not an alias or subtype of it, and never a valid `contentDigest`
 * subject. Acquisition evidence is never added to it, and it is never a component of
 * acquisition evidence.
 *
 * WHAT THIS CONTRACT DOES AND DOES NOT ESTABLISH
 *
 * TypeScript is structurally typed, so any module can assemble an object with these
 * field names without depending on this module, and doing so establishes nothing.
 * Shape carries no proof that retained bytes are the provider's own, no ratified
 * identity profile, no ratified content-scope profile and no honest observation
 * instant. A structural lookalike is a lookalike.
 *
 * What the shape does change is the kind of failure available. A hand-authored
 * payload can no longer be a silent gap: it must assert an authorized acquisition
 * mode over retained content it claims came from a provider, and that claim is
 * checkable against the retained bytes by a reviewer. Fixture promotion becomes a
 * false attestation rather than an omission. It does not, and no type can, prove
 * provider authenticity.
 *
 * Exactly one provider profile pair is ratified against this contract today — the
 * GitHub issue identity and content-scope profiles recorded in
 * docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md. Slack and Google Calendar
 * identity and content-scope profiles all stay `REQUIRED_UNPROVEN`. See
 * docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md.
 *
 * This module imports nothing and declares no runtime value.
 */

// ─── Distinct identities ────────────────────────────────────────

/**
 * The identity of one acquisition-capture event.
 *
 * Branded rather than a bare `string` because the distinction it carries is the
 * whole of capture identity: it is not source identity, not `SourceRecordV1`
 * identity, and never provider-issued. A bare `string` field makes that distinction
 * a comment, and `providerObjectKey` — a source identity — becomes silently
 * assignable to it. The brand blocks that direction. It is a declaration, not a
 * validator: a cast still defeats it, and nothing here mints, formats or checks the
 * value.
 */
export type AcquisitionCaptureId = string & {
  readonly __acquisitionCaptureId: "AcquisitionCaptureId"
}

/**
 * The tenant partition the capture belongs to.
 *
 * Acquisition evidence, not a copied projection field. `NormalizedToolSignal`
 * carries `tenantId: string` deliberately unbranded because every provider event
 * declares it and every mapper copies it through unvalidated; taking tenancy from
 * there would inherit exactly that absence of validation into evidence a later
 * `SourceRecordV1` identity is built from. Branded for the same reason as the
 * capture id: a bare `string` makes an unvalidated projection string silently
 * assignable.
 *
 * Partition, never permission.
 */
export type AcquisitionTenantPartition = string & {
  readonly __acquisitionTenantPartition: "AcquisitionTenantPartition"
}

// ─── Acquisition mode ───────────────────────────────────────────

/**
 * The authorized acquisition mode that produced a capture.
 *
 * A closed union holding exactly the one mode any authorized acquisition uses
 * today: a human-triggered, read-only provider export whose response bytes were
 * retained. There is no fixture mode and no live-provider mode, and neither is
 * reachable by any spelling of this type.
 *
 * Every additional mode — a scheduled export, a recorded webhook payload, a live
 * read above all — must be added here, so widening acquisition authority is a
 * visible contract change with a reviewable diff rather than a value a caller may
 * choose. A one-member union is the honest width: a member no producer uses would
 * be an unexercised authorization.
 */
export type AcquisitionMode = "HUMAN_TRIGGERED_PROVIDER_EXPORT"

// ─── Retained provider content ──────────────────────────────────

/**
 * The externally-authored provider content the capture retained.
 *
 * A provider URL, permalink or re-fetch handle is not retained content and never
 * satisfies this: re-fetching at verification time is a new observation of a
 * possibly-changed object, and it silently converts a non-live capture into an
 * unauthorized live read. No Atra projection — no `NormalizedToolSignal`, no
 * normalized provider view, no `SourceRecordV1` field — may serve as retained
 * content.
 *
 * Retention is immutable and append-only. Captured bytes are never edited in place
 * and never redacted; narrowing what is attested is the content-scope profile's job,
 * and an object that cannot be narrowed is excluded rather than altered.
 *
 * Only inline retention is declared, because inline retention is what the one
 * authorized acquisition uses. A second arm — an integrity-bound reference into a
 * retention store — is deliberately absent until a retention store exists and a
 * producer needs it; declaring it now would authorize a storage boundary nothing
 * consumes. The `retention` tag is kept even at one member so that arm arrives as a
 * discriminated addition rather than a change of meaning.
 */
export type RetainedProviderContent = {
  /**
   * The provider's own bytes, retained with the capture, base64-encoded. Base64 is
   * a lossless reversible transport encoding of the exact bytes, not a
   * normalization of them: nothing is trimmed, case-folded, re-encoded or
   * canonicalized.
   */
  readonly retention: "INLINE_BYTES"
  readonly bytesBase64: string
}

// ─── Content scope binding ──────────────────────────────────────

/**
 * Binds the retained provider content to the reviewed content-scope profile that
 * selected a portion of it, and to the integrity evidence over that portion.
 *
 * This names a profile; it does not define one, for any provider. The profile
 * identity and its version are separate values because B2-P1 is stated per provider
 * *and per profile version*: a digest is comparable only against another produced
 * under the same version, so a version change must be visible without re-deriving
 * it from the profile identity.
 *
 * `contentDigest` is the value a later `SourceRecordV1` carries. It is attested here
 * and computed nowhere in this module. What the revision adds is the missing half:
 * with `RetainedProviderContent` present in the same capture, the attestation finally
 * has a subject a reviewer can re-check it against.
 */
export type ContentScopeBinding = {
  readonly contentScopeProfileId: string
  readonly contentScopeProfileVersion: string
  readonly contentDigest: string
}

// ─── Provider identity provenance ───────────────────────────────

/**
 * The provider-origin material needed to re-check `providerObjectKey` later, under a
 * named identity-profile version.
 *
 * `providerNamespace` is the namespace in which the key is interpreted, stated by
 * acquisition as provider-native material and carried byte-for-byte. It is
 * deliberately an unconstrained `string`: enumerating providers here would be
 * provider selection, which this contract may not make. It is never derived from
 * `NormalizedToolProvider` — that vocabulary is an Atra projection with its own
 * spelling, and mapping it onto a provider namespace is provider relabelling.
 *
 * The two profile members name the reviewed per-provider identity profile the key
 * was formed under. Without them a key cannot be re-checked at all, because
 * admissibility is defined by a profile and not by the key's shape. As with the
 * content-scope profile, the version is separate: a key admissible under one version
 * is not thereby admissible under another.
 *
 * This contract defines no profile and does not check provider nativeness.
 */
export type ProviderIdentityProvenance = {
  readonly providerNamespace: string
  readonly providerObjectKey: string
  readonly identityProfileId: string
  readonly identityProfileVersion: string
}

// ─── Capture ────────────────────────────────────────────────────

/**
 * One actual acquisition event: one real read of one provider object at one instant,
 * and everything that read established.
 *
 * `observedAt` is acquisition-owned — the instant Atra actually observed the provider
 * state this capture represents. It is never inferred from a projection's
 * `createdAt`, `updatedAt`, `dueAt` or `sourceEventAt`, and never invented when an
 * implementation cannot truthfully establish it.
 *
 * `sourceEventAt` is provider-stated: a string when the provider states the relevant
 * event time, `null` when it does not. `null` means UNKNOWN and stays `null`; it is
 * never filled from "now", `observedAt` or an update time to avoid a null.
 *
 * `recordedAt` is absent, and its absence is the contract. Recording is a later
 * producer's act, not an acquisition fact; a slot for it here would invite
 * acquisition to state a time it does not own.
 *
 * `kind` is not decoration. A capture routinely arrives as parsed external JSON,
 * where types are erased, so a consumer narrows on this tag at runtime before
 * reading any evidence. It is also the seam a second evidence form — a replay of an
 * existing capture above all — would have to arrive through.
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

// ─── Boundary contract ──────────────────────────────────────────

/**
 * What may cross the acquisition boundary.
 *
 * Exactly one form exists today, and that is the point of naming it separately: this
 * is the single place a second form would have to be added, so every widening of
 * what counts as acquisition evidence is a visible change here.
 *
 * A replay of an existing capture is deliberately not declared. This slice performs
 * no replay, and a replay type with no producer and no consumer would authorize a
 * path nothing walks. When replay arrives it must arrive as a `kind` that carries no
 * `observedAt` — re-stamping an observation instant at replay time is the single
 * easiest way to launder a hand-authored payload into a recorded source, and the
 * field it would have to lie in must not exist.
 */
export type AcquisitionEvidence = AcquisitionCapture
