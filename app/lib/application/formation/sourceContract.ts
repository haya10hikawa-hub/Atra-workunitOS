/**
 * F1A — Formation Source Contract.
 *
 * One provider-independent, sanitized, candidate-only record per provider
 * source object, produced AFTER the existing acquisition/normalization
 * boundary. This module defines the contract and its deterministic
 * validator/builder — nothing else.
 *
 * Scope boundary (plan Section 14, F1A row):
 *   - No Goal, no Done Condition, no aggregate, no Source Role.
 *   - No cross-source evidence, findings, grouping, or ranking.
 *   - No provider extraction, no LLM call, no public projection, no UI.
 *
 * Safety invariants:
 *   - The type cannot express raw provider content or tenant identity —
 *     there is no field for them, and the validator rejects every unknown
 *     key at every nesting level.
 *   - Every free-text field is screened by the existing repository
 *     authorities (P0 forbidden key/value scan, sensitive-value scan,
 *     prompt-injection scan, summary-boundary scan) before a candidate is
 *     built. Validation rejects; it never repairs.
 *   - `candidateOnly` is literal `true` on every result.
 *   - `extractionConfidence` is derived by the builder from `inferred`
 *     flags; input attempting to supply it is rejected.
 */

import type { SourceRef } from "../../domain/types.ts"
import { scanLlmContextExclusions } from "../llmContext/exclusionScanner.ts"
import { containsForbiddenSummaryText } from "../safety/p0Policy.ts"
import {
  containsInstructionDirective,
  containsPromptInjection,
  containsSensitiveValue,
} from "../../security/untrustedTextScan.ts"

// ─── Closed enums (plan Section 4.1) ────────────────────────────

export const FORMATION_SOURCE_PROVIDERS = [
  "github",
  "slack",
  "notion",
  "gmail",
  "google_calendar",
  "google_drive",
] as const

export type FormationSourceProvider = (typeof FORMATION_SOURCE_PROVIDERS)[number]

export const FORMATION_ACTOR_ASSERTED_RELATIONS = [
  "author",
  "assignee",
  "reviewer_requested",
  "mentioned",
  "owner_claimed",
  "approver_claimed",
] as const

export type FormationActorAssertedRelation = (typeof FORMATION_ACTOR_ASSERTED_RELATIONS)[number]

export const FORMATION_UNRESOLVED_MARKER_KINDS = [
  "open_question",
  "unresolved_review",
  "unanswered_request",
  "missing_approval",
  "blocker_claim",
] as const

export type FormationUnresolvedMarkerKind = (typeof FORMATION_UNRESOLVED_MARKER_KINDS)[number]

export const FORMATION_DECISION_MARKER_KINDS = [
  "decision_requested",
  "decision_recorded",
  "approval_recorded",
] as const

export type FormationDecisionMarkerKind = (typeof FORMATION_DECISION_MARKER_KINDS)[number]

export const FORMATION_SOURCE_STATUSES = [
  "open",
  "in_review",
  "changes_requested",
  "approved",
  "merged",
  "closed",
  "draft",
  "scheduled",
  "cancelled",
  "archived",
  "unknown",
] as const

export type FormationSourceStatus = (typeof FORMATION_SOURCE_STATUSES)[number]

export const FORMATION_AUTHORITY_SIGNAL_KINDS = [
  "accepted_status",
  "owner_of_record",
  "signed_off_review",
  "decision_maker_named",
  "official_external_communication",
  "superseded_marker",
] as const

export type FormationAuthoritySignalKind = (typeof FORMATION_AUTHORITY_SIGNAL_KINDS)[number]

export type FormationExtractionConfidence = "high" | "medium" | "low"

// ─── Bounds (plan Section 4.1 validation rules) ─────────────────

export const FORMATION_SOURCE_BOUNDS = {
  identifierMaxLength: 256,
  titleMaxLength: 300,
  sanitizedSummaryMaxLength: 2_000,
  actorNameMaxLength: 120,
  actorAssertionsMaxEntries: 20,
  explicitDeadlineTextMaxLength: 120,
  urlMaxLength: 2_048,
  sourceLinksMaxEntries: 50,
  referencedObjectsMaxEntries: 50,
  supersessionMaxEntries: 50,
  versionInfoMaxLength: 60,
  unresolvedMarkersMaxEntries: 30,
  markerSummaryMaxLength: 200,
  decisionMarkersMaxEntries: 10,
  authoritySignalsMaxEntries: 10,
} as const

// Deterministic confidence banding: count of `inferred: true` entries across
// the candidate. Initial banding — never a free numeric similarity.
export const EXTRACTION_CONFIDENCE_MEDIUM_MAX_INFERRED = 2

// ─── Nested records ─────────────────────────────────────────────

export type FormationActorAssertion = {
  readonly name: string
  readonly assertedRelation: FormationActorAssertedRelation
}

export type FormationSourceTimestamps = {
  readonly occurredAt: string
  readonly editedAt?: string
  readonly capturedAt: string
}

export type FormationExplicitDeadline = {
  readonly value: string
  readonly inferred: boolean
}

export type FormationObjectRef = {
  readonly provider: FormationSourceProvider
  readonly sourceObjectId: string
}

export type FormationSourceLink = {
  readonly url: string
  readonly recognized?: FormationObjectRef
}

export type FormationVersionInfo = {
  readonly value: string
  readonly inferred: boolean
}

export type FormationSupersessionClaim = {
  readonly provider: FormationSourceProvider
  readonly sourceObjectId: string
  readonly inferred: boolean
}

export type FormationUnresolvedMarker = {
  readonly kind: FormationUnresolvedMarkerKind
  readonly summary: string
}

export type FormationDecisionMarker = {
  readonly kind: FormationDecisionMarkerKind
  readonly summary: string
  readonly inferred: boolean
}

export type FormationAuthoritySignal = {
  readonly kind: FormationAuthoritySignalKind
  readonly inferred: boolean
}

// ─── The candidate-only source contract ─────────────────────────

export type FormationSourceCandidate = {
  readonly provider: FormationSourceProvider
  readonly sourceRef: SourceRef
  readonly sourceObjectId: string
  readonly parentObjectId?: string
  readonly threadId?: string
  readonly title: string
  readonly sanitizedSummary: string
  readonly actorAssertions: readonly FormationActorAssertion[]
  readonly timestamps: FormationSourceTimestamps
  readonly explicitDeadline?: FormationExplicitDeadline
  readonly sourceLinks: readonly FormationSourceLink[]
  readonly referencedObjects: readonly FormationObjectRef[]
  readonly versionInfo?: FormationVersionInfo
  readonly supersedes: readonly FormationSupersessionClaim[]
  readonly supersededBy: readonly FormationSupersessionClaim[]
  readonly unresolvedMarkers: readonly FormationUnresolvedMarker[]
  readonly decisionMarkers: readonly FormationDecisionMarker[]
  readonly statusMarkers: readonly FormationSourceStatus[]
  readonly authoritySignals: readonly FormationAuthoritySignal[]
  readonly navigationTarget: string
  readonly extractionConfidence: FormationExtractionConfidence
  readonly candidateOnly: true
}

/**
 * Builder input: the candidate fields an adapter may supply. Derived fields
 * (`extractionConfidence`, `candidateOnly`) are excluded — supplying them is
 * rejected as an unknown field.
 */
export type FormationSourceCandidateInput = Omit<
  FormationSourceCandidate,
  "extractionConfidence" | "candidateOnly"
>

// ─── Result contract ────────────────────────────────────────────

export type FormationSourceRejectionReason =
  | "input_not_object"
  | "unknown_field"
  | "forbidden_key"
  | "forbidden_value"
  | "forbidden_summary_text"
  | "sensitive_data_detected"
  | "prompt_injection_detected"
  | "source_content_includes_instruction"
  | "missing_required_field"
  | "invalid_type"
  | "empty_string"
  | "length_exceeded"
  | "array_too_large"
  | "enum_violation"
  | "identifier_malformed"
  | "timestamp_invalid"
  | "url_invalid"
  | "url_scheme_forbidden"
  | "provider_mismatch"
  | "navigation_target_not_in_source"
  | "duplicate_entry"
  | "supersession_cycle"

// Findings deliberately carry no value echo: a rejected input may contain
// sensitive values, and the finding must never restate them.
export type FormationSourceContractFinding = {
  readonly path: string
  readonly reason: FormationSourceRejectionReason
}

export type FormationSourceValidationFlag = {
  readonly path: string
  readonly flag: "captured_before_occurred"
}

export type FormationSourceContractResult =
  | {
    readonly ok: true
    readonly candidateOnly: true
    readonly candidate: FormationSourceCandidate
    readonly flags: readonly FormationSourceValidationFlag[]
  }
  | {
    readonly ok: false
    readonly candidateOnly: true
    readonly reason: FormationSourceRejectionReason
    readonly findings: readonly FormationSourceContractFinding[]
  }

// ─── Key allowlists (strict shape — unknown keys are rejected) ──

const TOP_LEVEL_KEYS = new Set([
  "provider",
  "sourceRef",
  "sourceObjectId",
  "parentObjectId",
  "threadId",
  "title",
  "sanitizedSummary",
  "actorAssertions",
  "timestamps",
  "explicitDeadline",
  "sourceLinks",
  "referencedObjects",
  "versionInfo",
  "supersedes",
  "supersededBy",
  "unresolvedMarkers",
  "decisionMarkers",
  "statusMarkers",
  "authoritySignals",
  "navigationTarget",
])

const SOURCE_REF_KEYS = new Set(["source", "externalId", "container", "url", "capturedAt"])
const TIMESTAMPS_KEYS = new Set(["occurredAt", "editedAt", "capturedAt"])
const ACTOR_ASSERTION_KEYS = new Set(["name", "assertedRelation"])
const EXPLICIT_DEADLINE_KEYS = new Set(["value", "inferred"])
const SOURCE_LINK_KEYS = new Set(["url", "recognized"])
const OBJECT_REF_KEYS = new Set(["provider", "sourceObjectId"])
const VERSION_INFO_KEYS = new Set(["value", "inferred"])
const SUPERSESSION_KEYS = new Set(["provider", "sourceObjectId", "inferred"])
const UNRESOLVED_MARKER_KEYS = new Set(["kind", "summary"])
const DECISION_MARKER_KEYS = new Set(["kind", "summary", "inferred"])
const AUTHORITY_SIGNAL_KEYS = new Set(["kind", "inferred"])

// ─── Validator / builder ────────────────────────────────────────

/**
 * Validate normalized provider input against the F1A contract and build the
 * candidate-only record. Deterministic, pure, fail-closed: any finding blocks
 * the whole input; nothing is repaired or defaulted from malformed values.
 */
export function buildFormationSourceCandidate(input: unknown): FormationSourceContractResult {
  if (!isRecord(input)) {
    return blocked([{ path: "$", reason: "input_not_object" }])
  }

  // Reuse the P0 exclusion authority first: forbidden keys and forbidden
  // value text anywhere in the input block before any field is read.
  const exclusionScan = scanLlmContextExclusions(input)
  if (!exclusionScan.ok) {
    return blocked(
      exclusionScan.findings.map((finding) => ({
        path: finding.path,
        reason: finding.reason === "forbidden_key" ? ("forbidden_key" as const) : ("forbidden_value" as const),
      })),
    )
  }

  const findings: FormationSourceContractFinding[] = []
  const flags: FormationSourceValidationFlag[] = []

  rejectUnknownKeys(input, "$", TOP_LEVEL_KEYS, findings)

  const provider = validateEnum(input.provider, "$.provider", FORMATION_SOURCE_PROVIDERS, true, findings)
  const sourceRef = validateSourceRef(input.sourceRef, provider, findings)
  const sourceObjectId = validateIdentifier(input.sourceObjectId, "$.sourceObjectId", true, findings)
  const parentObjectId = validateIdentifier(input.parentObjectId, "$.parentObjectId", false, findings)
  const threadId = validateIdentifier(input.threadId, "$.threadId", false, findings)

  const title = validateFreeText(input.title, "$.title", {
    required: true,
    maxLength: FORMATION_SOURCE_BOUNDS.titleMaxLength,
  }, findings)

  const sanitizedSummary = validateFreeText(input.sanitizedSummary, "$.sanitizedSummary", {
    required: true,
    maxLength: FORMATION_SOURCE_BOUNDS.sanitizedSummaryMaxLength,
    summaryBoundary: true,
  }, findings)

  const actorAssertions = validateArray(
    input.actorAssertions,
    "$.actorAssertions",
    FORMATION_SOURCE_BOUNDS.actorAssertionsMaxEntries,
    findings,
    (entry, path) => validateActorAssertion(entry, path, findings),
  )

  const timestamps = validateTimestamps(input.timestamps, findings, flags)
  const explicitDeadline = validateExplicitDeadline(input.explicitDeadline, findings)

  const sourceLinks = validateArray(
    input.sourceLinks,
    "$.sourceLinks",
    FORMATION_SOURCE_BOUNDS.sourceLinksMaxEntries,
    findings,
    (entry, path) => validateSourceLink(entry, path, findings),
  )

  const referencedObjects = validateArray(
    input.referencedObjects,
    "$.referencedObjects",
    FORMATION_SOURCE_BOUNDS.referencedObjectsMaxEntries,
    findings,
    (entry, path) => validateObjectRef(entry, path, findings),
  )
  rejectDuplicateRefs(referencedObjects, "$.referencedObjects", findings)

  const versionInfo = validateVersionInfo(input.versionInfo, findings)

  const supersedes = validateArray(
    input.supersedes,
    "$.supersedes",
    FORMATION_SOURCE_BOUNDS.supersessionMaxEntries,
    findings,
    (entry, path) => validateSupersessionClaim(entry, path, findings),
  )
  const supersededBy = validateArray(
    input.supersededBy,
    "$.supersededBy",
    FORMATION_SOURCE_BOUNDS.supersessionMaxEntries,
    findings,
    (entry, path) => validateSupersessionClaim(entry, path, findings),
  )
  rejectDuplicateRefs(supersedes, "$.supersedes", findings)
  rejectDuplicateRefs(supersededBy, "$.supersededBy", findings)
  rejectSupersessionCycles(supersedes, supersededBy, provider, sourceObjectId, findings)

  const unresolvedMarkers = validateArray(
    input.unresolvedMarkers,
    "$.unresolvedMarkers",
    FORMATION_SOURCE_BOUNDS.unresolvedMarkersMaxEntries,
    findings,
    (entry, path) => validateUnresolvedMarker(entry, path, findings),
  )

  const decisionMarkers = validateArray(
    input.decisionMarkers,
    "$.decisionMarkers",
    FORMATION_SOURCE_BOUNDS.decisionMarkersMaxEntries,
    findings,
    (entry, path) => validateDecisionMarker(entry, path, findings),
  )

  const statusMarkers = validateStatusMarkers(input.statusMarkers, findings)

  const authoritySignals = validateArray(
    input.authoritySignals,
    "$.authoritySignals",
    FORMATION_SOURCE_BOUNDS.authoritySignalsMaxEntries,
    findings,
    (entry, path) => validateAuthoritySignal(entry, path, findings),
  )

  const navigationTarget = validateNavigationTarget(input.navigationTarget, sourceRef, sourceLinks, findings)

  if (findings.length > 0) return blocked(findings)

  // All required fields validated above; the non-null assertions here are
  // guarded by the empty findings list.
  const candidate: FormationSourceCandidate = {
    provider: provider as FormationSourceProvider,
    sourceRef: sourceRef as SourceRef,
    sourceObjectId: sourceObjectId as string,
    ...(parentObjectId !== undefined ? { parentObjectId } : {}),
    ...(threadId !== undefined ? { threadId } : {}),
    title: title as string,
    sanitizedSummary: sanitizedSummary as string,
    actorAssertions: actorAssertions as readonly FormationActorAssertion[],
    timestamps: timestamps as FormationSourceTimestamps,
    ...(explicitDeadline !== undefined ? { explicitDeadline } : {}),
    sourceLinks: sourceLinks as readonly FormationSourceLink[],
    referencedObjects: referencedObjects as readonly FormationObjectRef[],
    ...(versionInfo !== undefined ? { versionInfo } : {}),
    supersedes: supersedes as readonly FormationSupersessionClaim[],
    supersededBy: supersededBy as readonly FormationSupersessionClaim[],
    unresolvedMarkers: unresolvedMarkers as readonly FormationUnresolvedMarker[],
    decisionMarkers: decisionMarkers as readonly FormationDecisionMarker[],
    statusMarkers: statusMarkers as readonly FormationSourceStatus[],
    authoritySignals: authoritySignals as readonly FormationAuthoritySignal[],
    navigationTarget: navigationTarget as string,
    extractionConfidence: deriveExtractionConfidence(countInferredEntries({
      explicitDeadline,
      versionInfo,
      supersedes: (supersedes ?? []) as readonly FormationSupersessionClaim[],
      supersededBy: (supersededBy ?? []) as readonly FormationSupersessionClaim[],
      decisionMarkers: (decisionMarkers ?? []) as readonly FormationDecisionMarker[],
      authoritySignals: (authoritySignals ?? []) as readonly FormationAuthoritySignal[],
    })),
    candidateOnly: true,
  }

  return { ok: true, candidateOnly: true, candidate, flags }
}

/**
 * Deterministic aggregation of per-field `inferred` flags into a confidence
 * band — never a free numeric similarity.
 */
export function deriveExtractionConfidence(inferredCount: number): FormationExtractionConfidence {
  if (inferredCount <= 0) return "high"
  if (inferredCount <= EXTRACTION_CONFIDENCE_MEDIUM_MAX_INFERRED) return "medium"
  return "low"
}

// ─── Field validators ───────────────────────────────────────────

function validateSourceRef(
  value: unknown,
  provider: FormationSourceProvider | undefined,
  findings: FormationSourceContractFinding[],
): SourceRef | undefined {
  const path = "$.sourceRef"
  if (value === undefined) {
    findings.push({ path, reason: "missing_required_field" })
    return undefined
  }
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, SOURCE_REF_KEYS, findings)

  const source = value.source
  if (typeof source !== "string") {
    findings.push({ path: `${path}.source`, reason: "missing_required_field" })
  } else if (provider !== undefined && source !== provider) {
    findings.push({ path: `${path}.source`, reason: "provider_mismatch" })
  }

  const externalId = validateIdentifier(value.externalId, `${path}.externalId`, true, findings)
  const container = validateIdentifier(value.container, `${path}.container`, false, findings)

  let url: string | undefined
  if (value.url !== undefined) {
    url = validateHttpsUrl(value.url, `${path}.url`, findings)
  }

  const capturedAt = validateIsoDateTime(value.capturedAt, `${path}.capturedAt`, true, findings)

  if (
    typeof source !== "string" ||
    externalId === undefined ||
    capturedAt === undefined ||
    (provider !== undefined && source !== provider)
  ) {
    return undefined
  }
  return {
    source: source as SourceRef["source"],
    externalId,
    ...(container !== undefined ? { container } : {}),
    ...(url !== undefined ? { url } : {}),
    capturedAt,
  }
}

function validateTimestamps(
  value: unknown,
  findings: FormationSourceContractFinding[],
  flags: FormationSourceValidationFlag[],
): FormationSourceTimestamps | undefined {
  const path = "$.timestamps"
  if (value === undefined) {
    findings.push({ path, reason: "missing_required_field" })
    return undefined
  }
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, TIMESTAMPS_KEYS, findings)

  const occurredAt = validateIsoDateTime(value.occurredAt, `${path}.occurredAt`, true, findings)
  const editedAt = validateIsoDateTime(value.editedAt, `${path}.editedAt`, false, findings)
  const capturedAt = validateIsoDateTime(value.capturedAt, `${path}.capturedAt`, true, findings)

  if (occurredAt === undefined || capturedAt === undefined) return undefined

  // Clock skew is tolerated (never blocking) but flagged.
  if (Date.parse(capturedAt) < Date.parse(occurredAt)) {
    flags.push({ path, flag: "captured_before_occurred" })
  }

  return { occurredAt, ...(editedAt !== undefined ? { editedAt } : {}), capturedAt }
}

function validateExplicitDeadline(
  value: unknown,
  findings: FormationSourceContractFinding[],
): FormationExplicitDeadline | undefined {
  const path = "$.explicitDeadline"
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, EXPLICIT_DEADLINE_KEYS, findings)
  const inferred = validateBoolean(value.inferred, `${path}.inferred`, findings)
  if (inferred === undefined) return undefined
  if (inferred) {
    const text = validateFreeText(value.value, `${path}.value`, {
      required: true,
      maxLength: FORMATION_SOURCE_BOUNDS.explicitDeadlineTextMaxLength,
    }, findings)
    return text === undefined ? undefined : { value: text, inferred }
  }
  const iso = validateIsoDateOrDateTime(value.value, `${path}.value`, findings)
  return iso === undefined ? undefined : { value: iso, inferred }
}

function validateActorAssertion(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): FormationActorAssertion | undefined {
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, ACTOR_ASSERTION_KEYS, findings)
  const name = validateFreeText(value.name, `${path}.name`, {
    required: true,
    maxLength: FORMATION_SOURCE_BOUNDS.actorNameMaxLength,
  }, findings)
  const assertedRelation = validateEnum(
    value.assertedRelation,
    `${path}.assertedRelation`,
    FORMATION_ACTOR_ASSERTED_RELATIONS,
    true,
    findings,
  )
  if (name === undefined || assertedRelation === undefined) return undefined
  return { name, assertedRelation }
}

function validateSourceLink(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): FormationSourceLink | undefined {
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, SOURCE_LINK_KEYS, findings)
  const url = validateHttpsUrl(value.url, `${path}.url`, findings)
  let recognized: FormationObjectRef | undefined
  if (value.recognized !== undefined) {
    recognized = validateObjectRef(value.recognized, `${path}.recognized`, findings)
    if (recognized === undefined) return undefined
  }
  if (url === undefined) return undefined
  return { url, ...(recognized !== undefined ? { recognized } : {}) }
}

function validateObjectRef(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): FormationObjectRef | undefined {
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, OBJECT_REF_KEYS, findings)
  const provider = validateEnum(value.provider, `${path}.provider`, FORMATION_SOURCE_PROVIDERS, true, findings)
  const sourceObjectId = validateIdentifier(value.sourceObjectId, `${path}.sourceObjectId`, true, findings)
  if (provider === undefined || sourceObjectId === undefined) return undefined
  return { provider, sourceObjectId }
}

function validateVersionInfo(
  value: unknown,
  findings: FormationSourceContractFinding[],
): FormationVersionInfo | undefined {
  const path = "$.versionInfo"
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, VERSION_INFO_KEYS, findings)
  const text = validateFreeText(value.value, `${path}.value`, {
    required: true,
    maxLength: FORMATION_SOURCE_BOUNDS.versionInfoMaxLength,
  }, findings)
  const inferred = validateBoolean(value.inferred, `${path}.inferred`, findings)
  if (text === undefined || inferred === undefined) return undefined
  return { value: text, inferred }
}

function validateSupersessionClaim(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): FormationSupersessionClaim | undefined {
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, SUPERSESSION_KEYS, findings)
  const provider = validateEnum(value.provider, `${path}.provider`, FORMATION_SOURCE_PROVIDERS, true, findings)
  const sourceObjectId = validateIdentifier(value.sourceObjectId, `${path}.sourceObjectId`, true, findings)
  const inferred = validateBoolean(value.inferred, `${path}.inferred`, findings)
  if (provider === undefined || sourceObjectId === undefined || inferred === undefined) return undefined
  return { provider, sourceObjectId, inferred }
}

function validateUnresolvedMarker(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): FormationUnresolvedMarker | undefined {
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, UNRESOLVED_MARKER_KEYS, findings)
  const kind = validateEnum(value.kind, `${path}.kind`, FORMATION_UNRESOLVED_MARKER_KINDS, true, findings)
  const summary = validateFreeText(value.summary, `${path}.summary`, {
    required: true,
    maxLength: FORMATION_SOURCE_BOUNDS.markerSummaryMaxLength,
  }, findings)
  if (kind === undefined || summary === undefined) return undefined
  return { kind, summary }
}

function validateDecisionMarker(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): FormationDecisionMarker | undefined {
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, DECISION_MARKER_KEYS, findings)
  const kind = validateEnum(value.kind, `${path}.kind`, FORMATION_DECISION_MARKER_KINDS, true, findings)
  const summary = validateFreeText(value.summary, `${path}.summary`, {
    required: true,
    maxLength: FORMATION_SOURCE_BOUNDS.markerSummaryMaxLength,
  }, findings)
  const inferred = validateBoolean(value.inferred, `${path}.inferred`, findings)
  if (kind === undefined || summary === undefined || inferred === undefined) return undefined
  return { kind, summary, inferred }
}

function validateAuthoritySignal(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): FormationAuthoritySignal | undefined {
  if (!isRecord(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  rejectUnknownKeys(value, path, AUTHORITY_SIGNAL_KEYS, findings)
  const kind = validateEnum(value.kind, `${path}.kind`, FORMATION_AUTHORITY_SIGNAL_KINDS, true, findings)
  const inferred = validateBoolean(value.inferred, `${path}.inferred`, findings)
  if (kind === undefined || inferred === undefined) return undefined
  return { kind, inferred }
}

function validateStatusMarkers(
  value: unknown,
  findings: FormationSourceContractFinding[],
): readonly FormationSourceStatus[] | undefined {
  const path = "$.statusMarkers"
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  if (value.length > FORMATION_SOURCE_STATUSES.length) {
    findings.push({ path, reason: "array_too_large" })
    return undefined
  }
  const seen = new Set<string>()
  const out: FormationSourceStatus[] = []
  value.forEach((entry, index) => {
    const status = validateEnum(entry, `${path}[${index}]`, FORMATION_SOURCE_STATUSES, true, findings)
    if (status === undefined) return
    if (seen.has(status)) {
      findings.push({ path: `${path}[${index}]`, reason: "duplicate_entry" })
      return
    }
    seen.add(status)
    out.push(status)
  })
  return out
}

function validateNavigationTarget(
  value: unknown,
  sourceRef: SourceRef | undefined,
  sourceLinks: readonly (FormationSourceLink | undefined)[] | undefined,
  findings: FormationSourceContractFinding[],
): string | undefined {
  const path = "$.navigationTarget"
  const url = validateHttpsUrl(value, path, findings, { required: true })
  if (url === undefined) return undefined

  // Never synthesized from text: the target must already be present in the
  // normalized input (the source reference URL or a source link).
  const known = new Set<string>()
  if (sourceRef?.url) known.add(sourceRef.url)
  for (const link of sourceLinks ?? []) {
    if (link?.url) known.add(link.url)
  }
  if (!known.has(url)) {
    findings.push({ path, reason: "navigation_target_not_in_source" })
    return undefined
  }
  return url
}

// ─── Cross-field rules ──────────────────────────────────────────

function rejectDuplicateRefs(
  entries: readonly ({ readonly provider: FormationSourceProvider; readonly sourceObjectId: string } | undefined)[] | undefined,
  path: string,
  findings: FormationSourceContractFinding[],
): void {
  if (!entries) return
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    if (!entry) return
    const key = `${entry.provider} ${entry.sourceObjectId}`
    if (seen.has(key)) {
      findings.push({ path: `${path}[${index}]`, reason: "duplicate_entry" })
      return
    }
    seen.add(key)
  })
}

function rejectSupersessionCycles(
  supersedes: readonly (FormationSupersessionClaim | undefined)[] | undefined,
  supersededBy: readonly (FormationSupersessionClaim | undefined)[] | undefined,
  provider: FormationSourceProvider | undefined,
  sourceObjectId: string | undefined,
  findings: FormationSourceContractFinding[],
): void {
  const refKey = (ref: { readonly provider: FormationSourceProvider; readonly sourceObjectId: string }) =>
    `${ref.provider} ${ref.sourceObjectId}`
  const selfKey = provider !== undefined && sourceObjectId !== undefined
    ? `${provider} ${sourceObjectId}`
    : undefined

  const supersedesKeys = new Set<string>()
  ;(supersedes ?? []).forEach((entry, index) => {
    if (!entry) return
    const key = refKey(entry)
    supersedesKeys.add(key)
    if (selfKey !== undefined && key === selfKey) {
      findings.push({ path: `$.supersedes[${index}]`, reason: "supersession_cycle" })
    }
  })
  ;(supersededBy ?? []).forEach((entry, index) => {
    if (!entry) return
    const key = refKey(entry)
    if (selfKey !== undefined && key === selfKey) {
      findings.push({ path: `$.supersededBy[${index}]`, reason: "supersession_cycle" })
    }
    if (supersedesKeys.has(key)) {
      findings.push({ path: `$.supersededBy[${index}]`, reason: "supersession_cycle" })
    }
  })
}

// ─── Primitive validators ───────────────────────────────────────

function validateFreeText(
  value: unknown,
  path: string,
  options: { readonly required: boolean; readonly maxLength: number; readonly summaryBoundary?: boolean },
  findings: FormationSourceContractFinding[],
): string | undefined {
  if (value === undefined) {
    if (options.required) findings.push({ path, reason: "missing_required_field" })
    return undefined
  }
  if (typeof value !== "string") {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  if (value.trim().length === 0) {
    findings.push({ path, reason: "empty_string" })
    return undefined
  }
  if (value.length > options.maxLength) {
    findings.push({ path, reason: "length_exceeded" })
    return undefined
  }
  let blockedText = false
  if (containsSensitiveValue(value)) {
    findings.push({ path, reason: "sensitive_data_detected" })
    blockedText = true
  }
  if (containsPromptInjection(value)) {
    findings.push({ path, reason: "prompt_injection_detected" })
    blockedText = true
  } else if (containsInstructionDirective(value)) {
    findings.push({ path, reason: "source_content_includes_instruction" })
    blockedText = true
  }
  if (options.summaryBoundary && containsForbiddenSummaryText(value)) {
    findings.push({ path, reason: "forbidden_summary_text" })
    blockedText = true
  }
  return blockedText ? undefined : value
}

function validateIdentifier(
  value: unknown,
  path: string,
  required: boolean,
  findings: FormationSourceContractFinding[],
): string | undefined {
  if (value === undefined) {
    if (required) findings.push({ path, reason: "missing_required_field" })
    return undefined
  }
  if (typeof value !== "string") {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  if (value.length === 0) {
    findings.push({ path, reason: "empty_string" })
    return undefined
  }
  if (value.length > FORMATION_SOURCE_BOUNDS.identifierMaxLength) {
    findings.push({ path, reason: "length_exceeded" })
    return undefined
  }
  // Provider object identifiers never contain whitespace or control
  // characters; per-provider shape checks arrive with the extraction slice.
  if (/[\s\p{Cc}]/u.test(value)) {
    findings.push({ path, reason: "identifier_malformed" })
    return undefined
  }
  return value
}

function validateEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  required: boolean,
  findings: FormationSourceContractFinding[],
): T | undefined {
  if (value === undefined) {
    if (required) findings.push({ path, reason: "missing_required_field" })
    return undefined
  }
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    findings.push({ path, reason: "enum_violation" })
    return undefined
  }
  return value as T
}

function validateBoolean(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): boolean | undefined {
  if (typeof value !== "boolean") {
    findings.push({ path, reason: value === undefined ? "missing_required_field" : "invalid_type" })
    return undefined
  }
  return value
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/

function validateIsoDateTime(
  value: unknown,
  path: string,
  required: boolean,
  findings: FormationSourceContractFinding[],
): string | undefined {
  if (value === undefined) {
    if (required) findings.push({ path, reason: "missing_required_field" })
    return undefined
  }
  if (typeof value !== "string" || !ISO_DATE_TIME_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    findings.push({ path, reason: "timestamp_invalid" })
    return undefined
  }
  return value
}

function validateIsoDateOrDateTime(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
): string | undefined {
  if (typeof value === "string" && ISO_DATE_PATTERN.test(value) && Number.isFinite(Date.parse(value))) {
    return value
  }
  return validateIsoDateTime(value, path, true, findings)
}

function validateHttpsUrl(
  value: unknown,
  path: string,
  findings: FormationSourceContractFinding[],
  options?: { readonly required: boolean },
): string | undefined {
  if (value === undefined) {
    if (options?.required) findings.push({ path, reason: "missing_required_field" })
    return undefined
  }
  if (typeof value !== "string") {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  if (value.length > FORMATION_SOURCE_BOUNDS.urlMaxLength) {
    findings.push({ path, reason: "length_exceeded" })
    return undefined
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    findings.push({ path, reason: "url_invalid" })
    return undefined
  }
  if (parsed.protocol !== "https:") {
    findings.push({ path, reason: "url_scheme_forbidden" })
    return undefined
  }
  return value
}

function validateArray<T>(
  value: unknown,
  path: string,
  maxEntries: number,
  findings: FormationSourceContractFinding[],
  validateEntry: (entry: unknown, path: string) => T | undefined,
): readonly (T | undefined)[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    findings.push({ path, reason: "invalid_type" })
    return undefined
  }
  if (value.length > maxEntries) {
    findings.push({ path, reason: "array_too_large" })
    return undefined
  }
  return value.map((entry, index) => validateEntry(entry, `${path}[${index}]`))
}

// ─── Shared helpers ─────────────────────────────────────────────

function rejectUnknownKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: ReadonlySet<string>,
  findings: FormationSourceContractFinding[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      findings.push({ path: `${path}.${key}`, reason: "unknown_field" })
    }
  }
}

function countInferredEntries(fields: {
  readonly explicitDeadline: FormationExplicitDeadline | undefined
  readonly versionInfo: FormationVersionInfo | undefined
  readonly supersedes: readonly FormationSupersessionClaim[]
  readonly supersededBy: readonly FormationSupersessionClaim[]
  readonly decisionMarkers: readonly FormationDecisionMarker[]
  readonly authoritySignals: readonly FormationAuthoritySignal[]
}): number {
  let count = 0
  if (fields.explicitDeadline?.inferred) count += 1
  if (fields.versionInfo?.inferred) count += 1
  for (const entry of [...fields.supersedes, ...fields.supersededBy]) {
    if (entry.inferred) count += 1
  }
  for (const entry of fields.decisionMarkers) {
    if (entry.inferred) count += 1
  }
  for (const entry of fields.authoritySignals) {
    if (entry.inferred) count += 1
  }
  return count
}

function blocked(findings: readonly FormationSourceContractFinding[]): FormationSourceContractResult {
  return { ok: false, candidateOnly: true, reason: findings[0]?.reason ?? "input_not_object", findings }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
