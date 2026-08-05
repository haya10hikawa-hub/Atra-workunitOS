/**
 * HTTP Mutation Guard — header-only request integrity for unsafe methods.
 *
 * AUTHORITY MODEL (WU-02S)
 *   This module owns EXACTLY ONE concern: request integrity, steps 1–6 of the
 *   executable order (method, target Host, Origin, Referer fallback, body-size
 *   precheck, Content-Type). It owns nothing else.
 *
 *   Phase 1 (`checkMutationRequestIntegrity`) is SYNCHRONOUS and takes only a
 *   `Request` plus a plain policy value. It therefore cannot await a body. It
 *   has no session resolver, no tenant resolver, no runtime-config resolver and
 *   no repository in scope, and it never reads `process.env`. A guard that
 *   cannot resolve a session cannot mint one; a guard that cannot reach a
 *   repository cannot write. This is enforced by the type and the import
 *   allowlist, not by discipline.
 *
 *   Trusted origins are NOT resolved here. They arrive as a validated, frozen
 *   projection of the request-scoped runtime configuration
 *   (`SecurityRuntimeConfig.trustedOrigins`), which is the repository's single
 *   declared reader of the raw runtime env. Module-scope and per-call
 *   `process.env` origin authority are both prohibited.
 *
 *   Phase 2 (`readGuardedJsonBody`) is a separate exported function the ROUTE
 *   calls explicitly at step 11 — after authentication, tenant authority, rate
 *   limiting and route RBAC. Phase 1 never invokes it.
 *
 * METHOD DISPATCH (C4)
 *   Two distinct paths produce a 405 and must not be conflated:
 *     - An ACTUAL unsupported HTTP request to a route module that exports only
 *       `POST` is rejected by the framework dispatcher BEFORE the handler runs.
 *       That response is not this repository's `safeError` envelope.
 *     - DIRECT invocation of the POST handler with a non-POST `Request`
 *       (internal calls, unit probes) reaches the guard's method check, which
 *       returns 405 `invalid_request` in the safeError envelope.
 *   The guard's method check is defense in depth for the second path. It is NOT
 *   claimed that every unsupported network request executes the guard.
 *
 * Permitted imports: ./safeErrors.ts, ./requestBody.ts, ./csrfProtection.ts,
 * and type-only from ../runtime/requestRuntimeConfig.ts. Prohibited:
 * next/server, next/headers, any Node built-in, app/lib/persistence/**,
 * app/lib/application/**, ./session.ts, ./rbac.ts, ./tenantAccess.ts, and any
 * `process.env` reference. The runtime surface is Web `Request`, `URL` and
 * `Headers` only — Workers-safe and unit-testable with a plain `new Request()`.
 */

import type { SafeErrorCode } from "./safeErrors.ts"
import type { JsonBodyLimits, JsonObjectReadResult } from "./requestBody.ts"
import { readBoundedJsonObject } from "./requestBody.ts"
import { validateCsrfOrigin } from "./csrfProtection.ts"

// ─── Contract ───────────────────────────────────────────────────

export type MutationGuardFailureCategory =
  | "method_not_allowed"
  | "host_missing"
  | "host_untrusted"
  | "origin_missing"
  | "origin_untrusted"
  | "body_size_precheck"
  | "content_type_invalid"

export type MutationGuardPolicy = {
  readonly method: "POST" | "PUT" | "PATCH" | "DELETE"
  readonly trustedOrigins: readonly string[]
  readonly maxBytes: number
}

export type MutationGuardResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly category: MutationGuardFailureCategory
      readonly error: SafeErrorCode
      readonly status: number
    }

/**
 * `category` exists for tests and server-side reasoning ONLY. It is never
 * serialized: every failure body is exactly `safeError(requestId, code)` →
 * `{ ok: false, requestId, error }`.
 */
const FAILURES: Record<MutationGuardFailureCategory, { error: SafeErrorCode; status: number }> = {
  method_not_allowed: { error: "invalid_request", status: 405 },
  host_missing: { error: "csrf_failed", status: 403 },
  host_untrusted: { error: "csrf_failed", status: 403 },
  origin_missing: { error: "csrf_failed", status: 403 },
  origin_untrusted: { error: "invalid_origin", status: 403 },
  body_size_precheck: { error: "invalid_request", status: 413 },
  content_type_invalid: { error: "invalid_request", status: 400 },
}

function reject(category: MutationGuardFailureCategory): MutationGuardResult {
  const mapped = FAILURES[category]
  return { ok: false, category, error: mapped.error, status: mapped.status }
}

// ─── PHASE 1 — header-only, synchronous ─────────────────────────

/**
 * Steps 1–6. Reads no body, resolves no session, determines no tenant,
 * performs no RBAC, touches no repository. Synchronous by construction.
 */
export function checkMutationRequestIntegrity(
  request: Request,
  policy: MutationGuardPolicy,
): MutationGuardResult {
  // 1. Method.
  if (request.method !== policy.method) return reject("method_not_allowed")

  // 2. Trusted target Host — derived from the SAME trustedOrigins policy, so
  //    there is one authority and one thing to misconfigure.
  const hostHeader = request.headers.get("Host")
  if (hostHeader === null) return reject("host_missing")
  const host = parseHost(hostHeader)
  if (host === null) return reject("host_missing")
  if (!resolveTrustedTargetHosts(policy.trustedOrigins).has(host)) return reject("host_untrusted")

  // 3–4. Origin, then Referer fallback. Delegated to csrfProtection.ts (the
  //      single Origin/Referer authority) rather than duplicated here.
  const csrf = validateCsrfOrigin(request, policy.trustedOrigins)
  if (!csrf.ok) return reject(csrf.reason === "csrf_failed" ? "origin_missing" : "origin_untrusted")

  // 5. Body-size precheck — HEADER ONLY. When Content-Length is absent
  //    (chunked), the existing streaming cap inside readBoundedJsonObject
  //    remains the enforcement. The guard never parses.
  const declared = parseContentLength(request.headers.get("Content-Length"))
  if (declared !== null && declared > policy.maxBytes) return reject("body_size_precheck")

  // 6. Content-Type and charset.
  if (!isAcceptedJsonContentType(request.headers.get("Content-Type"))) return reject("content_type_invalid")

  return { ok: true }
}

// ─── PHASE 2 — explicitly called by the route at step 11 ────────

/**
 * Thin wrapper over the existing bounded body reader. Adds no parsing of its
 * own and is NEVER auto-invoked by phase 1. The route calls it only after
 * authentication, tenant authority, rate limiting and route RBAC have passed.
 */
export function readGuardedJsonBody(
  request: Request,
  limits: JsonBodyLimits,
): Promise<JsonObjectReadResult> {
  return readBoundedJsonObject(request, limits)
}

// ─── Host policy ────────────────────────────────────────────────

/**
 * Exact `URL`-parsed host set derived from the trusted origins. Comparison is
 * exact string equality — no suffix, prefix, `includes` or `endsWith` matching
 * anywhere. Port is part of the comparison; default ports normalize away
 * identically on both sides because both are parsed with `URL`.
 */
export function resolveTrustedTargetHosts(
  trustedOrigins: readonly string[],
): ReadonlySet<string> {
  const hosts = new Set<string>()
  for (const entry of trustedOrigins) {
    try {
      hosts.add(new URL(entry).host)
    } catch {
      // A malformed entry contributes no trusted host. Trusted-origin
      // validation itself lives in requestRuntimeConfig.ts and fails closed
      // in production before this code is reached.
    }
  }
  return hosts
}

/**
 * Parse a raw `Host` header value to its `URL`-normalized host, or null when
 * it is malformed. Duplicate `Host` headers are joined by `Headers.get` with
 * ", " and cannot parse, so they reject. Userinfo, path and query characters
 * reject. A trailing dot is NOT special-cased: `example.com.` ≠ `example.com`.
 */
function parseHost(value: string): string | null {
  const raw = value.trim()
  if (raw.length === 0 || raw.length > 260) return null
  // Reject anything carrying userinfo, a path, a query or a fragment before
  // handing the value to URL, which would otherwise reinterpret it.
  if (/[@/?#\\ ,]/.test(raw)) return null
  try {
    const url = new URL(`http://${raw}`)
    // URL must have consumed the whole value as an authority.
    if (url.pathname !== "/" || url.search !== "" || url.username !== "" || url.password !== "") return null
    if (url.host !== raw.toLowerCase()) {
      // Allow only the normalizations URL itself performs on a bare authority
      // (case folding and default-port elision), never a rewrite.
      const normalized = new URL(`http://${url.host}`).host
      if (normalized !== url.host) return null
    }
    return url.host
  } catch {
    return null
  }
}

// ─── Content-Type policy ────────────────────────────────────────

/**
 * Exact essence match on `application/json`, with `charset=utf-8` as the only
 * permitted parameter. `text/plain` is rejected specifically because it is a
 * CORS-SIMPLE content type: a cross-origin form or `fetch` can send it with no
 * preflight. Requiring `application/json` forces a preflight for any
 * cross-origin mutation attempt, adding a browser-enforced layer beneath the
 * Origin check. Duplicate headers join with ", " and fail the exact match.
 */
export function isAcceptedJsonContentType(value: string | null): boolean {
  if (value === null) return false
  const parts = value.split(";")
  const essence = parts[0]?.trim().toLowerCase()
  if (essence !== "application/json") return false
  for (const parameter of parts.slice(1)) {
    const segment = parameter.trim()
    if (segment.length === 0) return false
    const separator = segment.indexOf("=")
    if (separator < 0) return false
    const name = segment.slice(0, separator).trim().toLowerCase()
    const raw = segment.slice(separator + 1).trim()
    const unquoted = raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1) : raw
    if (name !== "charset") return false
    if (unquoted.toLowerCase() !== "utf-8") return false
  }
  return true
}

// ─── Body-size precheck ─────────────────────────────────────────

function parseContentLength(value: string | null): number | null {
  if (value === null) return null
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}
