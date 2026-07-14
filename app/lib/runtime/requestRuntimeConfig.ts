/**
 * Request-scoped Validated Runtime Configuration
 *
 * Resolves the raw OpenNext Cloudflare env ONCE per request/route boundary and
 * produces ONE authoritative, frozen, allowlisted runtime configuration split
 * into narrow capability projections (persistence / auth / security / llm).
 *
 * AUTHORITY MODEL
 *   - Cloudflare production (`source: "cloudflare"`): the request-scoped
 *     Cloudflare env is the ONLY source. `process.env` is never consulted.
 *     Dev capabilities are impossible; every `ALLOW_DEV_*` flag rejects "true".
 *     Missing/malformed values fail closed.
 *   - Local Node development (`source: "local"`): an explicit, SEPARATE
 *     `process.env` path (dev adapters allowed only when NODE_ENV !== production).
 *     Persistence D1 bindings may be supplied by a local test injection.
 *
 * Secrets (JWT secret, LLM API key) are copied into the frozen snapshot but must
 * never be logged, serialized, returned to clients, or placed in audit metadata.
 *
 * This module is the ONLY place that reads the raw runtime env for config. Other
 * modules receive the narrow projections explicitly (no repeated raw-env reads,
 * no mutable global request config).
 */

import type { D1DatabaseLike } from "../persistence/d1/types.ts"
import type { AppEnv } from "../../types/cloudflare-env.ts"
import { getRequestRuntimeEnv } from "./cloudflareRuntimeEnv.ts"
import { peekInjectedRuntimeEnv } from "./requestRuntimeEnvInjection.ts"

// ─── Capability projections ─────────────────────────────────────

export type PersistenceRuntimeConfig = {
  readonly mode: "d1" | "in_memory" | "disabled"
  readonly CONTROL_DB?: D1DatabaseLike
  readonly TENANT_DB_DEFAULT?: D1DatabaseLike
}

export type AuthRuntimeConfig = {
  readonly adapter: "none" | "jwt" | "dev"
  readonly isProduction: boolean
  readonly jwt?: {
    readonly secret: string
    readonly issuer?: string
    readonly audience?: string
  }
}

export type SecurityRuntimeConfig = {
  readonly externalActionsEnabled: boolean
  readonly allowLegacyIngestFallback: boolean
  readonly allowDevSession: boolean
  readonly allowDevWorkspaceBootstrap: boolean
  readonly allowControlLessDevSession: boolean
  readonly devSessionRole?: string
}

export type LlmRuntimeConfig = {
  readonly provider?: string
  readonly apiKey?: string
  readonly allowMock: boolean
  readonly allowLegacyFallback: boolean
  readonly isProduction: boolean
}

export type ValidatedRequestRuntimeConfig = {
  readonly source: "cloudflare" | "local"
  readonly persistence: PersistenceRuntimeConfig
  readonly auth: AuthRuntimeConfig
  readonly security: SecurityRuntimeConfig
  readonly llm: LlmRuntimeConfig
}

export type RequestRuntimeConfigError =
  | "missing_control_db"
  | "missing_tenant_db"
  | "malformed_persistence_mode"
  | "malformed_var"
  | "dev_flag_forbidden"
  | "dev_adapter_forbidden"
  | "forbidden_capability"

// ─── Forbidden production capabilities ───────────────────────────
//
// In a genuine Cloudflare production runtime EVERY development/fallback
// capability must be absent or exactly "false". An explicit "true" is rejected
// fail-closed (never silently normalized); a malformed literal also fails closed.
const DEV_FLAG_KEYS: ReadonlySet<string> = new Set([
  "ALLOW_DEV_SESSION",
  "ALLOW_DEV_WORKSPACE_BOOTSTRAP",
  "ALLOW_DEV_CONTROLLESS_SESSION",
])

const FORBIDDEN_PRODUCTION_CAPABILITIES: readonly string[] = [
  "ALLOW_LEGACY_INGEST_FALLBACK",
  "ALLOW_MOCK_LLM",
  "ALLOW_IN_MEMORY_PERSISTENCE",
  "ALLOW_IN_MEMORY_APPROVAL_STORE",
  "ALLOW_DEV_SESSION",
  "ALLOW_DEV_WORKSPACE_BOOTSTRAP",
  "ALLOW_DEV_CONTROLLESS_SESSION",
]

export type RequestRuntimeConfigResult =
  | { ok: true; runtime: ValidatedRequestRuntimeConfig }
  | { ok: false; error: RequestRuntimeConfigError }

// ─── Limits ──────────────────────────────────────────────────────

const MAX_VAR_LENGTH = 256
const MAX_SECRET_LENGTH = 8192
const MAX_IDENTIFIER_LENGTH = 1024
const MIN_JWT_SECRET_BYTES = 32

// ─── Primitive validation ────────────────────────────────────────

function isD1Like(value: unknown): value is D1DatabaseLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    typeof (value as Record<string, unknown>).prepare === "function"
  )
}

/** Exact "true"/"false"/absent → boolean; anything else → null (fail closed). */
function parseBoolLiteral(value: unknown): boolean | null {
  if (value === undefined) return false
  if (value === "true") return true
  if (value === "false") return false
  return null
}

function boundedString(value: unknown, max: number): { ok: true; value?: string } | { ok: false } {
  if (value === undefined) return { ok: true }
  if (typeof value !== "string") return { ok: false }
  if (value.length > max) return { ok: false }
  return { ok: true, value }
}

// ─── Cloudflare (authoritative production) projection ───────────

function resolveCloudflareConfig(raw: AppEnv): RequestRuntimeConfigResult {
  // Persistence — D1 required, fail closed when missing/malformed.
  if (!isD1Like(raw.CONTROL_DB)) return { ok: false, error: "missing_control_db" }
  if (!isD1Like(raw.TENANT_DB_DEFAULT)) return { ok: false, error: "missing_tenant_db" }
  const mode = raw.PERSISTENCE_MODE
  if (mode !== undefined && mode !== "d1") return { ok: false, error: "malformed_persistence_mode" }

  // Security vars — exact literals only. The external-actions kill switch is
  // separately gated (it may be "true"); it is NOT a development/fallback capability.
  const externalActions = parseBoolLiteral(raw.EXTERNAL_ACTIONS_ENABLED)
  if (externalActions === null) return { ok: false, error: "malformed_var" }

  // Every production development/fallback capability must be absent or "false".
  for (const key of FORBIDDEN_PRODUCTION_CAPABILITIES) {
    const parsed = parseBoolLiteral(raw[key])
    if (parsed === null) return { ok: false, error: "malformed_var" }
    if (parsed === true) return { ok: false, error: DEV_FLAG_KEYS.has(key) ? "dev_flag_forbidden" : "forbidden_capability" }
  }

  // Auth adapter — dev is forbidden in Cloudflare production.
  const adapterRaw = raw.AUTH_ADAPTER
  let adapter: "none" | "jwt"
  if (adapterRaw === undefined || adapterRaw === "none") adapter = "none"
  else if (adapterRaw === "jwt") adapter = "jwt"
  else if (adapterRaw === "dev") return { ok: false, error: "dev_adapter_forbidden" }
  else return { ok: false, error: "malformed_var" }

  let jwt: AuthRuntimeConfig["jwt"] | undefined
  if (adapter === "jwt") {
    const secret = boundedString(raw.JWT_AUTH_SECRET, MAX_SECRET_LENGTH)
    const issuer = boundedString(raw.JWT_AUTH_ISSUER, MAX_IDENTIFIER_LENGTH)
    const audience = boundedString(raw.JWT_AUTH_AUDIENCE, MAX_IDENTIFIER_LENGTH)
    if (!secret.ok || !issuer.ok || !audience.ok) return { ok: false, error: "malformed_var" }
    // Production JWT requires a >=32-byte secret + issuer + audience. If any is
    // missing/weak, keep adapter "jwt" but leave jwt undefined so verification
    // fails closed (safe unauthorized), rather than silently accepting.
    const secretBytes = secret.value ? new TextEncoder().encode(secret.value).byteLength : 0
    if (secret.value && secretBytes >= MIN_JWT_SECRET_BYTES && issuer.value && audience.value) {
      jwt = Object.freeze({ secret: secret.value, issuer: issuer.value, audience: audience.value })
    }
  }

  // LLM — bounded strings; no mock/real execution in production.
  const provider = boundedString(raw.LLM_PROVIDER, MAX_VAR_LENGTH)
  const apiKey = boundedString(raw.DEEPSEEK_API_KEY, MAX_SECRET_LENGTH)
  if (!provider.ok || !apiKey.ok) return { ok: false, error: "malformed_var" }

  const runtime: ValidatedRequestRuntimeConfig = {
    source: "cloudflare",
    persistence: Object.freeze({
      mode: "d1",
      CONTROL_DB: raw.CONTROL_DB,
      TENANT_DB_DEFAULT: raw.TENANT_DB_DEFAULT,
    }),
    auth: Object.freeze({ adapter, isProduction: true, jwt }),
    // Cloudflare production ALWAYS projects every development/fallback capability
    // as false — any "true" was already rejected above (fail-closed, not normalized).
    security: Object.freeze({
      externalActionsEnabled: externalActions,
      allowLegacyIngestFallback: false,
      allowDevSession: false,
      allowDevWorkspaceBootstrap: false,
      allowControlLessDevSession: false,
    }),
    llm: Object.freeze({
      provider: provider.value,
      apiKey: apiKey.value,
      allowMock: false,
      allowLegacyFallback: false,
      isProduction: true,
    }),
  }
  return { ok: true, runtime: Object.freeze(runtime) }
}

// ─── Local (explicit process.env) projection ────────────────────

function resolveLocalConfig(
  processEnv: Record<string, string | undefined>,
  injectedD1?: AppEnv,
): RequestRuntimeConfigResult {
  const isProduction = processEnv.NODE_ENV === "production"

  // Persistence: D1 bindings come from a local test/wrangler injection when
  // present (the CONTROL_DB binding is exposed for auth regardless of the tenant
  // persistence mode); the mode itself comes from process.env.
  const controlDb = isD1Like(injectedD1?.CONTROL_DB) ? injectedD1?.CONTROL_DB : undefined
  const tenantDb = isD1Like(injectedD1?.TENANT_DB_DEFAULT) ? injectedD1?.TENANT_DB_DEFAULT : undefined
  let mode: PersistenceRuntimeConfig["mode"]
  if (processEnv.PERSISTENCE_MODE === "d1") mode = "d1"
  else if (!isProduction && processEnv.ALLOW_IN_MEMORY_PERSISTENCE === "true") mode = "in_memory"
  else mode = "disabled"
  const persistence: PersistenceRuntimeConfig = Object.freeze({ mode, CONTROL_DB: controlDb, TENANT_DB_DEFAULT: tenantDb })

  // Auth adapter from process.env; dev only when non-production.
  const adapterRaw = processEnv.AUTH_ADAPTER ?? "none"
  let adapter: "none" | "jwt" | "dev" = "none"
  if (adapterRaw === "jwt") adapter = "jwt"
  else if (adapterRaw === "dev" && !isProduction) adapter = "dev"

  let jwt: AuthRuntimeConfig["jwt"] | undefined
  if (adapter === "jwt") {
    const secret = processEnv.JWT_AUTH_SECRET
    if (secret) {
      const enough = !isProduction || new TextEncoder().encode(secret).byteLength >= MIN_JWT_SECRET_BYTES
      const hasIssAud = !isProduction || (!!processEnv.JWT_AUTH_ISSUER && !!processEnv.JWT_AUTH_AUDIENCE)
      if (enough && hasIssAud) {
        jwt = Object.freeze({
          secret,
          issuer: processEnv.JWT_AUTH_ISSUER,
          audience: processEnv.JWT_AUTH_AUDIENCE,
        })
      }
    }
  }

  const runtime: ValidatedRequestRuntimeConfig = {
    source: "local",
    persistence,
    auth: Object.freeze({ adapter, isProduction, jwt }),
    security: Object.freeze({
      externalActionsEnabled: processEnv.EXTERNAL_ACTIONS_ENABLED === "true",
      allowLegacyIngestFallback: processEnv.ALLOW_LEGACY_INGEST_FALLBACK === "true",
      allowDevSession: !isProduction && processEnv.ALLOW_DEV_SESSION === "true",
      allowDevWorkspaceBootstrap: !isProduction && processEnv.ALLOW_DEV_WORKSPACE_BOOTSTRAP === "true",
      allowControlLessDevSession: !isProduction && processEnv.ALLOW_DEV_CONTROLLESS_SESSION === "true",
      devSessionRole: processEnv.DEV_SESSION_ROLE,
    }),
    llm: Object.freeze({
      provider: processEnv.LLM_PROVIDER,
      apiKey: processEnv.DEEPSEEK_API_KEY,
      allowMock: !isProduction && processEnv.ALLOW_MOCK_LLM === "true",
      allowLegacyFallback: processEnv.ALLOW_LEGACY_INGEST_FALLBACK === "true",
      isProduction,
    }),
  }
  return { ok: true, runtime: Object.freeze(runtime) }
}

// ─── Public resolver ─────────────────────────────────────────────

/**
 * Pure projection of a raw env into a validated config. No ambient reads: the
 * caller supplies both the raw env and the authority mode. Used by tests and by
 * any explicit factory; production goes through
 * `resolveValidatedRequestRuntimeConfig()`.
 */
export function resolveRuntimeConfigFromRawEnv(
  rawEnv: AppEnv,
  mode: "cloudflare" | "local",
  processEnv: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): RequestRuntimeConfigResult {
  return mode === "local" ? resolveLocalConfig(processEnv, rawEnv) : resolveCloudflareConfig(rawEnv)
}

/**
 * Resolve the authoritative request-scoped runtime configuration.
 *
 * Reads the raw runtime env exactly once. AUTHORITY ORDER:
 *   1. explicit `rawEnv` override (test-specific / explicit factory only);
 *   2. GENUINE OpenNext Cloudflare request context — always wins in production;
 *   3. test injection — ONLY when no genuine Cloudflare context exists;
 *   4. local Node development (`process.env`).
 *
 * A genuine Cloudflare context can therefore NEVER be shadowed by test injection,
 * and production code never activates the injector (it is only ever entered by a
 * test's `runWithInjectedRuntimeEnv`).
 */
export function resolveValidatedRequestRuntimeConfig(
  options: {
    rawEnv?: AppEnv
    production?: boolean
    processEnv?: Record<string, string | undefined>
  } = {},
): RequestRuntimeConfigResult {
  const processEnv = options.processEnv ?? (process.env as Record<string, string | undefined>)

  // 1. Explicit override (test-specific / explicit factory only).
  if (options.rawEnv !== undefined) {
    return resolveRuntimeConfigFromRawEnv(options.rawEnv, options.production === false ? "local" : "cloudflare", processEnv)
  }

  // 2. GENUINE Cloudflare request context (production) — outranks test injection.
  const cloudflareEnv = getRequestRuntimeEnv()
  if (cloudflareEnv) return resolveCloudflareConfig(cloudflareEnv)

  // 3. Test injection — ONLY when no genuine Cloudflare context exists.
  const injected = peekInjectedRuntimeEnv()
  if (injected) {
    return resolveRuntimeConfigFromRawEnv(injected.env, injected.production ? "cloudflare" : "local", processEnv)
  }

  // 4. Local Node development — explicit process.env path, no injected D1.
  return resolveLocalConfig(processEnv)
}

// ─── Projections for downstream consumers ───────────────────────

/**
 * Project only the kill-switch–relevant security state for the Runtime
 * Authorization Gate / external-action checks. Never carries secrets.
 */
export function projectRuntimeAuthorizationEnv(
  security: SecurityRuntimeConfig,
): { readonly EXTERNAL_ACTIONS_ENABLED: "true" | "false" } {
  return Object.freeze({
    EXTERNAL_ACTIONS_ENABLED: security.externalActionsEnabled ? "true" : "false",
  })
}

/**
 * Project the request-scoped LLM config into the env-shaped object consumed by
 * the existing LLM provider resolver (`resolveLlmProvider` /
 * `resolveLlmProviderConfig`). Carries the API key only for provider wiring — it
 * must never be logged, serialized, or returned to a client.
 */
export function projectLlmEnv(
  llm: LlmRuntimeConfig,
): {
  NODE_ENV: string
  ALLOW_MOCK_LLM: string
  ALLOW_LEGACY_INGEST_FALLBACK: string
  LLM_PROVIDER?: string
  DEEPSEEK_API_KEY?: string
} {
  return {
    NODE_ENV: llm.isProduction ? "production" : "development",
    ALLOW_MOCK_LLM: llm.allowMock ? "true" : "false",
    ALLOW_LEGACY_INGEST_FALLBACK: llm.allowLegacyFallback ? "true" : "false",
    LLM_PROVIDER: llm.provider,
    DEEPSEEK_API_KEY: llm.apiKey,
  }
}
