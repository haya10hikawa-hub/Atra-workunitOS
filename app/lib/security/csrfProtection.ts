/**
 * CSRF / Origin Protection (pure, injected).
 *
 * Validates the Origin/Referer of a state-changing POST request against a
 * NORMALIZED allowlist supplied by the caller. This module reads NO environment
 * variable and holds NO module-scope configuration: the allowlist is the
 * request-scoped `security.allowedOrigins` projection from
 * `resolveValidatedRequestRuntimeConfig`. The same imported function validates
 * different requests against different injected allowlists.
 *
 * Matching is EXACT against `new URL(header).origin` — no suffix, substring, or
 * wildcard matching, and ports are significant. An empty allowlist fails closed.
 */

export type CsrfCheckResult = { readonly ok: true } | { readonly ok: false; readonly reason: "csrf_failed" | "invalid_origin" }

/**
 * @param request         the incoming request
 * @param allowedOrigins  normalized `URL.origin` values (from the request-scoped
 *                        validated runtime config); an empty list fails closed.
 */
export function validateCsrfOrigin(request: Request, allowedOrigins: readonly string[]): CsrfCheckResult {
  const origin = request.headers.get("Origin")
  const referer = request.headers.get("Referer")

  // Both Origin and Referer missing → cannot verify same-origin → blocked.
  if (!origin && !referer) return { ok: false, reason: "csrf_failed" }

  const headerValue = origin ?? referer!

  let candidate: string
  try {
    candidate = new URL(headerValue).origin
  } catch {
    return { ok: false, reason: "invalid_origin" }
  }
  // Opaque / null origin never matches.
  if (candidate === "null" || candidate === "") return { ok: false, reason: "invalid_origin" }

  // Empty allowlist fails closed; exact origin match only (a Referer path is
  // discarded by `URL.origin`, so an allowed origin with a path still matches).
  if (allowedOrigins.includes(candidate)) return { ok: true }
  return { ok: false, reason: "invalid_origin" }
}
