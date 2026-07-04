/**
 * P7.1: Canonical Approval Payload — types, validation, and deterministic
 * canonicalization (docs/CANONICAL_APPROVAL_PAYLOAD_SPEC.md).
 *
 * ISOLATED MODULE — NOT WIRED. Nothing in the live approval path
 * (ApprovalStore, actionApproval, approvalPreviewBinding, externalActions)
 * imports this module. Wiring is a separate future gate
 * (docs/TSP_DESIGN_REVIEW_CLOSURE.md §13). Risk Register R4 stays open.
 *
 * Canonicalization algorithm: "JCS-RFC8785-INSPIRED-V1" —
 * deterministic JSON with an explicit, documented field order
 * (canonicalApprovalPayloadFieldOrder), JSON.stringify string escaping,
 * explicit null preservation, rejection of missing/unknown/invalid fields.
 * Insertion order of the input object never affects the output.
 *
 * This module reads no environment, performs no I/O, and holds no secret.
 */

export const CANONICALIZATION_ALGORITHM = "JCS-RFC8785-INSPIRED-V1" as const
export const HASH_ALGORITHM = "HMAC-SHA-256" as const

export type CanonicalApprovalPayload = {
  canonical_payload_version: string
  approval_request_id: string
  tenant_id: string
  actor_id: string
  actor_role: string
  action_preview_id: string
  operation: string
  target_system: string
  target_identifier: string
  target_hash: string
  payload_hash: string
  payload_redaction_state: string
  preview_hash: string
  risk_level: string
  human_review_required: boolean
  source_workunit_candidate_id: string | null
  source_formal_workunit_id: string | null
  source_action_field_id: string | null
  source_decision_record_id: string | null
  created_at: string
  expires_at: string
  nonce: string
  idempotency_key: string
  key_id: string
  key_version: string
  hash_algorithm: string
  canonicalization_algorithm: string
  approval_scope: string
  no_go_flags: readonly string[]
}

/**
 * The documented canonical field order. Canonical output always serializes
 * fields in exactly this order, regardless of input insertion order.
 */
export const canonicalApprovalPayloadFieldOrder = [
  "canonical_payload_version",
  "approval_request_id",
  "tenant_id",
  "actor_id",
  "actor_role",
  "action_preview_id",
  "operation",
  "target_system",
  "target_identifier",
  "target_hash",
  "payload_hash",
  "payload_redaction_state",
  "preview_hash",
  "risk_level",
  "human_review_required",
  "source_workunit_candidate_id",
  "source_formal_workunit_id",
  "source_action_field_id",
  "source_decision_record_id",
  "created_at",
  "expires_at",
  "nonce",
  "idempotency_key",
  "key_id",
  "key_version",
  "hash_algorithm",
  "canonicalization_algorithm",
  "approval_scope",
  "no_go_flags",
] as const

export type CanonicalApprovalPayloadFieldName =
  (typeof canonicalApprovalPayloadFieldOrder)[number]

export type CanonicalApprovalPayloadValidationErrorCode =
  | "missing_required_field"
  | "unknown_field"
  | "invalid_field_type"
  | "invalid_hash_format"
  | "invalid_timestamp"
  | "unsupported_hash_algorithm"
  | "unsupported_canonicalization_algorithm"

/**
 * Structured validation error. The message is `${code}:${field}` only — it never
 * contains field values, payload contents, or secrets.
 */
export class CanonicalApprovalPayloadValidationError extends Error {
  public readonly code: CanonicalApprovalPayloadValidationErrorCode
  public readonly field: string
  constructor(code: CanonicalApprovalPayloadValidationErrorCode, field: string) {
    super(`${code}:${field}`)
    this.name = "CanonicalApprovalPayloadValidationError"
    this.code = code
    this.field = field
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/
// ISO-8601 UTC, e.g. 2026-07-03T12:34:56Z or 2026-07-03T12:34:56.789Z
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

const NULLABLE_STRING_FIELDS: ReadonlySet<string> = new Set([
  "source_workunit_candidate_id",
  "source_formal_workunit_id",
  "source_action_field_id",
  "source_decision_record_id",
])

const HASH_FIELDS: ReadonlySet<string> = new Set([
  "target_hash",
  "payload_hash",
  "preview_hash",
])

const TIMESTAMP_FIELDS: ReadonlySet<string> = new Set(["created_at", "expires_at"])

function fail(
  code: CanonicalApprovalPayloadValidationErrorCode,
  field: string,
): never {
  throw new CanonicalApprovalPayloadValidationError(code, field)
}

/**
 * Validate an unknown value as a CanonicalApprovalPayload.
 *
 * Fail-closed rules:
 * - every field in canonicalApprovalPayloadFieldOrder must be present
 *   (explicit null is allowed only for the four nullable source_* fields;
 *   undefined / missing keys are always rejected);
 * - unknown top-level fields are rejected (mutable display-only fields
 *   therefore cannot ride along);
 * - hash fields must be 64-char lowercase hex;
 * - timestamps must be ISO-8601 UTC (trailing Z);
 * - hash_algorithm must be exactly "HMAC-SHA-256";
 * - canonicalization_algorithm must be exactly "JCS-RFC8785-INSPIRED-V1";
 * - no_go_flags must be an array of strings.
 */
export function validateCanonicalApprovalPayload(
  value: unknown,
): CanonicalApprovalPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_field_type", "(payload)")
  }
  const record = value as Record<string, unknown>

  for (const key of Object.keys(record)) {
    if (!(canonicalApprovalPayloadFieldOrder as readonly string[]).includes(key)) {
      fail("unknown_field", key)
    }
  }

  // Read every field exactly once into an own-property snapshot. All validation
  // and every downstream read (canonicalization, gate checks, provider lookup)
  // operate on this snapshot, so a getter-bearing input object cannot return one
  // value to the MAC and a different value to the expiry / no_go_flags gates
  // (TOCTOU). no_go_flags is copied into a fresh array so it cannot mutate later.
  const snapshot: Record<string, unknown> = {}
  for (const field of canonicalApprovalPayloadFieldOrder) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      fail("missing_required_field", field)
    }
    const raw = record[field]
    if (raw === undefined) fail("missing_required_field", field)
    snapshot[field] = field === "no_go_flags" && Array.isArray(raw) ? [...raw] : raw
  }

  for (const field of canonicalApprovalPayloadFieldOrder) {
    const raw = snapshot[field]

    if (field === "human_review_required") {
      if (typeof raw !== "boolean") fail("invalid_field_type", field)
      continue
    }
    if (field === "no_go_flags") {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
        fail("invalid_field_type", field)
      }
      continue
    }
    if (NULLABLE_STRING_FIELDS.has(field)) {
      if (raw !== null && typeof raw !== "string") fail("invalid_field_type", field)
      continue
    }
    if (typeof raw !== "string" || raw.length === 0) {
      fail("invalid_field_type", field)
    }
    const text = raw as string
    if (HASH_FIELDS.has(field) && !SHA256_HEX.test(text)) {
      fail("invalid_hash_format", field)
    }
    if (TIMESTAMP_FIELDS.has(field) && !ISO_8601_UTC.test(text)) {
      fail("invalid_timestamp", field)
    }
  }

  if (snapshot.hash_algorithm !== HASH_ALGORITHM) {
    fail("unsupported_hash_algorithm", "hash_algorithm")
  }
  if (snapshot.canonicalization_algorithm !== CANONICALIZATION_ALGORITHM) {
    fail("unsupported_canonicalization_algorithm", "canonicalization_algorithm")
  }

  if (Array.isArray(snapshot.no_go_flags)) {
    Object.freeze(snapshot.no_go_flags)
  }
  return Object.freeze(snapshot) as CanonicalApprovalPayload
}

/**
 * Deterministically canonicalize a payload to the exact string the keyed MAC
 * is computed over. Validates first (fail closed), then serializes fields in
 * canonicalApprovalPayloadFieldOrder with JSON.stringify escaping; null is
 * preserved as JSON null; booleans and string arrays serialize stably.
 */
export function canonicalizeApprovalPayload(value: unknown): string {
  const payload = validateCanonicalApprovalPayload(value)
  const parts: string[] = []
  for (const field of canonicalApprovalPayloadFieldOrder) {
    const raw = payload[field as keyof CanonicalApprovalPayload]
    let encoded: string
    if (raw === null) {
      encoded = "null"
    } else if (typeof raw === "boolean") {
      encoded = raw ? "true" : "false"
    } else if (Array.isArray(raw)) {
      encoded = `[${raw.map((item) => JSON.stringify(item)).join(",")}]`
    } else {
      encoded = JSON.stringify(raw)
    }
    parts.push(`${JSON.stringify(field)}:${encoded}`)
  }
  return `{${parts.join(",")}}`
}
