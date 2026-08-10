/**
 * Acquisition Evidence Port
 *
 * The neutral acquisition-evidence contract a future, separately authorized
 * provider-profile implementation must satisfy. It is a contract and nothing
 * else: no producer, no provider profile, no provider call, no canonicalization,
 * no digest computation, no clock, no persistence.
 *
 * Declaring it proves nothing about any provider. Every GitHub, Slack and Google
 * Calendar identity and content-scope profile stays `REQUIRED_UNPROVEN`, no
 * current provider path can produce conforming evidence, P1-1 stays `PARTIAL`
 * and the `SourceRecordV1` runtime producer stays absent. See
 * docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md.
 *
 * `ACQUISITION_SCOPE_CHANGE_REQUIRED` stays `YES`. The existence of this
 * contract does not by itself satisfy the acquisition scope change it names.
 *
 * This is a SEPARATE envelope, not an extension. `NormalizedToolSignal` is
 * unchanged, keeps its existing fields, and remains provider-ingress signal and
 * application material: not domain truth, not `SourceRecordV1`, not an alias or
 * subtype of it, and never a valid `contentDigest` subject. Acquisition evidence
 * is never added to it.
 *
 * This module declares no runtime value.
 */

import type { NormalizedToolSignal } from "../toolSignal/types.ts"

/**
 * The four evidence facts an acquisition must establish about one observed
 * provider object. Nothing else belongs here — see the ownership note below.
 */
export type AcquisitionEvidence = {
  /**
   * The acquisition boundary's carrier for the provider-native identity material
   * that may later become `SourceRecordV1.providerObjectKey`. Provider-native,
   * byte-exact, and admissible only under a separately reviewed per-provider
   * identity profile.
   *
   * Never `NormalizedToolSignal.id`, an Atra-minted or acquisition-minted
   * identifier, a URL, a mutable or display name, an array position, or an
   * observation time.
   *
   * This generic contract cannot prove provider nativeness and does not check
   * it. No per-provider identity profile is proven.
   */
  readonly providerObjectKey: string

  /**
   * Acquisition-owned: the instant Atra actually observed the provider state
   * this observation represents.
   *
   * Never inferred from `NormalizedToolSignal.createdAt`, `updatedAt`,
   * `sourceEventAt` or `dueAt`, and never invented when an acquisition
   * implementation cannot truthfully establish observation time. This WorkUnit
   * declares the field only; acquisition-time capture is not implemented.
   */
  readonly observedAt: string

  /**
   * Provider/source-declared event time: a string when the provider states the
   * relevant event time, `null` when it does not.
   *
   * `null` means UNKNOWN and stays `null`. It is never populated from "now",
   * `observedAt`, `recordedAt` or `updatedAt` merely to avoid a null.
   */
  readonly sourceEventAt: string | null

  /**
   * The acquisition boundary's carrier for the B2-P1 provider-content integrity
   * evidence later consumed by SourceRecord production. Valid only under a
   * separately reviewed per-provider content-scope profile.
   *
   * Never computed over a `NormalizedToolSignal`, an `AcquiredSignalObservation`,
   * an `AcquisitionEvidence`, a normalized provider projection, SourceRecord
   * fields, or any other Atra-side representation.
   *
   * This contract does not hash, does not canonicalize, does not verify content
   * and proves no content-scope profile. It carries attested evidence only.
   */
  readonly contentDigest: string
}

/**
 * One acquired observation: the provider-ingress signal, paired with the
 * evidence established for the provider object it was observed from.
 *
 * Ownership is deliberately partitioned and never duplicated for convenience.
 * `NormalizedToolSignal` owns the current normalized signal and application
 * material — tenant, provider, signal type, title, summary, source URL, actor,
 * assignee, repository, priority hint, due and record timestamps. This envelope
 * owns only the four evidence facts above. A future canonical Source producer
 * owns `recordedAt`, the `declaredSourceRef` decision and SourceRecord
 * construction; none of those appear here.
 */
export type AcquiredSignalObservation = {
  readonly signal: NormalizedToolSignal
  readonly evidence: AcquisitionEvidence
}
