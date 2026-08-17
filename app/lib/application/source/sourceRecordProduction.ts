/**
 * The canonical Source producer: one `AcquisitionCapture` becomes one
 * `SourceRecordV1`.
 *
 * PURE. No I/O, no clock, no randomness, no persistence, no provider call. The
 * recording instant is supplied by the caller, because `recordedAt` is this step's
 * own fact and reading a clock here would make the producer untestable and
 * non-deterministic at the same time.
 *
 * This module carries evidence into a record. It never creates evidence. Every
 * identity and integrity value is copied byte-for-byte from the capture: nothing is
 * trimmed, case-folded, re-encoded, re-derived or defaulted, because each of those
 * would silently produce a record about a different object than the one acquired.
 *
 * WHY THE AUTHORIZATION LIST IS RESTATED HERE
 *
 * The ratified profile tuples below are written out again rather than imported from
 * the acquisition modules they authorize. A producer that took its authorization from
 * the adapter it is authorizing would authorize whatever that adapter later said,
 * and a new provider adapter would become production-capable by construction. That
 * matters more with two adapters than it did with one: adding a third GitHub resource
 * must still require an edit here, in review, and not merely a new module that states
 * its own profile. The literals are pinned against each other by the slice's contract
 * test, so they cannot drift apart, but neither one grants the other anything.
 *
 * WHAT IS DELIBERATELY NOT CARRIED
 *
 * `declaredSourceRef` stays `null`. It is an opaque caller-declared token, and using
 * it as a pointer to the capture would make a non-identity field carry linkage the
 * domain promises never to parse. The capture linkage is returned beside the record
 * instead, as `SourceRecordProduction.captureId`.
 *
 * `sourceUrl` stays `null`. The provider's recall locator is retained inside the
 * capture's provider bytes and a reviewer can read it there; this slice does not
 * promote a locator into the canonical record, so no URL crosses this boundary at
 * all.
 */

import type { AcquisitionEvidence } from "../../ports/acquisitionEvidence/types.ts"
import type { AcquisitionCaptureId } from "../../ports/acquisitionEvidence/types.ts"
import { validateSourceRecordV1 } from "../../domain/source/index.ts"
import type { SourceRecordFailureCode, SourceRecordV1 } from "../../domain/source/index.ts"
import type { SourceIdentityNamespace } from "../../domain/types.ts"

/**
 * One capture, one record, and the link between them.
 *
 * The link lives here and not inside `SourceRecordV1` on purpose. A capture pointer
 * is production provenance, not a property of the observed provider object, and
 * `SourceRecordV1` identity is exactly `(tenantId, provider, providerObjectKey)`.
 * Adding a capture id to the record would put a value that differs per acquisition
 * inside a record that must be the same object across acquisitions.
 */
export type SourceRecordProduction = {
  readonly captureId: AcquisitionCaptureId
  readonly record: SourceRecordV1
}

export type SourceRecordProductionFailureCode =
  | "unsupported_evidence_kind"
  | "unauthorized_provider_profile"
  | "record_rejected"

export type SourceRecordProductionResult =
  | { readonly ok: true; readonly production: SourceRecordProduction }
  | {
    readonly ok: false
    readonly failureCode: SourceRecordProductionFailureCode
    /** The domain's own reason, when the domain is what refused. `null` otherwise. */
    readonly recordFailureCode: SourceRecordFailureCode | null
  }

/**
 * The closed set of provider profiles authorized to produce a canonical record.
 *
 * A tuple, not a namespace check: a key admissible under identity profile version 1
 * is not thereby admissible under version 2, and a digest produced under one
 * content-scope version is not comparable with another. All five capture-supplied
 * values must match, so re-versioning either profile stops production until this list
 * is edited in review.
 *
 * `identityNamespace` is the canonical record vocabulary the provider namespace binds
 * to. It is a binding, not a translation: `SourceIdentityNamespace` is Atra's own closed
 * vocabulary, the provider namespace is GitHub's, and the authority is the namespace.
 * Deriving one from the other by string manipulation would be provider relabelling —
 * which is also why each entry states its namespace as a literal rather than computing
 * `github_${resource}` from the provider path.
 *
 * WHY TWO GITHUB ENTRIES AND NOT ONE
 *
 * GitHub issues an object's REST `id` from a different table per resource, and the
 * observed issue and pull-request ranges overlap. A single `github` entry matching both
 * provider namespaces would map two distinct key spaces onto one canonical namespace,
 * and two numerically equal keys from different resources would then be one canonical
 * identity. Each resource therefore carries its own complete tuple, and a capture whose
 * provider namespace and profiles do not agree — a pull-request namespace under the
 * issue identity profile, or the reverse — matches no entry and is refused.
 */
const AUTHORIZED_PROVIDER_PROFILES: readonly {
  readonly providerNamespace: string
  readonly identityProfileId: string
  readonly identityProfileVersion: string
  readonly contentScopeProfileId: string
  readonly contentScopeProfileVersion: string
  readonly identityNamespace: SourceIdentityNamespace
}[] = Object.freeze([
  Object.freeze({
    providerNamespace: "github.com/rest/issues",
    identityProfileId: "github.issue.rest.database-primary-key",
    identityProfileVersion: "1",
    contentScopeProfileId: "github.issue.rest.retained-response-body",
    contentScopeProfileVersion: "1",
    identityNamespace: "github_issue" as SourceIdentityNamespace,
  }),
  Object.freeze({
    providerNamespace: "github.com/rest/pulls",
    identityProfileId: "github.pull-request.rest.database-primary-key",
    identityProfileVersion: "1",
    contentScopeProfileId: "github.pull-request.rest.retained-response-body",
    contentScopeProfileVersion: "1",
    identityNamespace: "github_pull_request" as SourceIdentityNamespace,
  }),
])

function fail(
  failureCode: SourceRecordProductionFailureCode,
  recordFailureCode: SourceRecordFailureCode | null = null,
): SourceRecordProductionResult {
  return Object.freeze({ ok: false as const, failureCode, recordFailureCode })
}

/**
 * Produces one canonical `SourceRecordV1` from one acquisition capture.
 *
 * `recordedAt` is the caller's statement of when this production happened. The
 * domain refuses a record whose `recordedAt` precedes its `observedAt`, so a caller
 * cannot back-date production behind the observation it claims to record.
 */
export function produceSourceRecordFromCapture(
  evidence: AcquisitionEvidence,
  recordedAt: string,
): SourceRecordProductionResult {
  // Narrowed at runtime, not only in the type system: evidence routinely arrives as
  // parsed external JSON where the type has been erased, and a second evidence form
  // must not be read as a capture by default.
  if (evidence === null || typeof evidence !== "object" || evidence.kind !== "CAPTURE") {
    return fail("unsupported_evidence_kind")
  }

  const { identity, contentScope } = evidence
  const authorized = AUTHORIZED_PROVIDER_PROFILES.find((profile) =>
    profile.providerNamespace === identity.providerNamespace
    && profile.identityProfileId === identity.identityProfileId
    && profile.identityProfileVersion === identity.identityProfileVersion
    && profile.contentScopeProfileId === contentScope.contentScopeProfileId
    && profile.contentScopeProfileVersion === contentScope.contentScopeProfileVersion)
  if (authorized === undefined) return fail("unauthorized_provider_profile")

  // The tenant partition becomes the record's partition unchanged. The cast is the
  // only place acquisition tenancy becomes domain tenancy, and it asserts nothing
  // the domain does not then check: `validateSourceRecordV1` rejects an empty,
  // untrimmed or over-long value, and this producer never substitutes a default.
  const result = validateSourceRecordV1({
    recordVersion: "1",
    tenantId: evidence.tenantPartition as string,
    provider: authorized.identityNamespace,
    providerObjectKey: identity.providerObjectKey,
    declaredSourceRef: null,
    sourceUrl: null,
    observedAt: evidence.observedAt,
    recordedAt,
    sourceEventAt: evidence.sourceEventAt,
    contentDigest: contentScope.contentDigest,
  })
  if (!result.ok) return fail("record_rejected", result.failureCode)

  return Object.freeze({
    ok: true as const,
    production: Object.freeze({ captureId: evidence.captureId, record: result.record }),
  })
}
