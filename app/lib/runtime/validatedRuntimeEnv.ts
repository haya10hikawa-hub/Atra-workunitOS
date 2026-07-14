/**
 * Validated Cloudflare Runtime Env Snapshot
 *
 * Copies ONLY an allowlisted set of bindings and variables from the raw
 * request-scoped Cloudflare env into a narrow, frozen snapshot. The raw
 * Cloudflare env is never spread wholesale, never returned to callers, and
 * never logged.
 *
 * Validation is fail-closed:
 *   - required D1 bindings must implement the D1-like interface;
 *   - boolean-like vars must be exact "true" / "false" literals;
 *   - string vars are bounded in length;
 *   - PERSISTENCE_MODE, when present, must be exactly "d1" (the only mode a
 *     Cloudflare runtime env may select); an invalid value fails closed rather
 *     than silently granting a different capability;
 *   - unknown / malformed values do not grant capability.
 */

import type { D1DatabaseLike } from "../persistence/d1/types.ts"
import type { AppEnv } from "../../types/cloudflare-env.ts"

// ─── Snapshot shape ──────────────────────────────────────────────

export type ValidatedCloudflareRuntimeEnv = {
  readonly CONTROL_DB: D1DatabaseLike
  readonly TENANT_DB_DEFAULT: D1DatabaseLike
  readonly PERSISTENCE_MODE: "d1"
  readonly EXTERNAL_ACTIONS_ENABLED: "false" | "true"
  readonly ALLOW_LEGACY_INGEST_FALLBACK: "false" | "true"
  readonly LLM_PROVIDER?: string
}

export type RuntimeEnvValidationError =
  | "missing_control_db"
  | "missing_tenant_db"
  | "malformed_persistence_mode"
  | "malformed_var"

export type RuntimeEnvValidationResult =
  | { ok: true; env: ValidatedCloudflareRuntimeEnv }
  | { ok: false; error: RuntimeEnvValidationError }

// ─── Limits ──────────────────────────────────────────────────────

const MAX_VAR_LENGTH = 256

// ─── Helpers ─────────────────────────────────────────────────────

/** A value is D1-like iff it exposes a callable `prepare` method. */
function isD1Like(value: unknown): value is D1DatabaseLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    typeof (value as Record<string, unknown>).prepare === "function"
  )
}

/**
 * Parse a boolean-like var. Only the exact literals "true" / "false" are
 * accepted. `undefined` falls back to the provided default. Any other value
 * (including "1", "yes", "TRUE", numbers, objects) is rejected.
 */
function parseBoolLiteral(
  value: unknown,
  fallback: "false" | "true",
): "false" | "true" | null {
  if (value === undefined) return fallback
  if (value === "true") return "true"
  if (value === "false") return "false"
  return null
}

/** Validate an optional bounded string var. */
function parseBoundedString(value: unknown): { ok: true; value?: string } | { ok: false } {
  if (value === undefined) return { ok: true }
  if (typeof value !== "string") return { ok: false }
  if (value.length > MAX_VAR_LENGTH) return { ok: false }
  return { ok: true, value }
}

// ─── Validator ───────────────────────────────────────────────────

/**
 * Validate and freeze a narrow runtime-env snapshot from the raw Cloudflare
 * env. The snapshot is immutable; mutating the source env after validation
 * cannot change an already-created snapshot.
 */
export function validateCloudflareRuntimeEnv(
  raw: AppEnv,
): RuntimeEnvValidationResult {
  // Required D1 bindings — fail closed when missing/malformed.
  const controlDb = raw.CONTROL_DB
  if (!isD1Like(controlDb)) return { ok: false, error: "missing_control_db" }

  const tenantDb = raw.TENANT_DB_DEFAULT
  if (!isD1Like(tenantDb)) return { ok: false, error: "missing_tenant_db" }

  // PERSISTENCE_MODE: a Cloudflare runtime env may only ever select "d1".
  // Absent → inferred "d1" (valid D1 bindings are present). Any explicit value
  // other than "d1" fails closed (never falls back to in-memory).
  const rawMode = raw.PERSISTENCE_MODE
  if (rawMode !== undefined && rawMode !== "d1") {
    return { ok: false, error: "malformed_persistence_mode" }
  }

  const externalActions = parseBoolLiteral(raw.EXTERNAL_ACTIONS_ENABLED, "false")
  if (externalActions === null) return { ok: false, error: "malformed_var" }

  const legacyIngest = parseBoolLiteral(raw.ALLOW_LEGACY_INGEST_FALLBACK, "false")
  if (legacyIngest === null) return { ok: false, error: "malformed_var" }

  const llmProvider = parseBoundedString(raw.LLM_PROVIDER)
  if (!llmProvider.ok) return { ok: false, error: "malformed_var" }

  const snapshot: ValidatedCloudflareRuntimeEnv = {
    CONTROL_DB: controlDb,
    TENANT_DB_DEFAULT: tenantDb,
    PERSISTENCE_MODE: "d1",
    EXTERNAL_ACTIONS_ENABLED: externalActions,
    ALLOW_LEGACY_INGEST_FALLBACK: legacyIngest,
    ...(llmProvider.value !== undefined ? { LLM_PROVIDER: llmProvider.value } : {}),
  }

  return { ok: true, env: Object.freeze(snapshot) }
}
