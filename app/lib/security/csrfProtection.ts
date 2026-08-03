/**
 * Phase 5A: CSRF / Origin Protection
 *
 * Validates Origin and Referer headers for state-changing requests. Rejects
 * cross-site, opaque and malformed origins.
 *
 * TRUSTED-ORIGIN AUTHORITY (WU-02S)
 *   The trusted origin set is a REQUIRED PARAMETER. This module reads no
 *   environment of any kind — not at module scope, not per call. The only
 *   approved authority flow is:
 *
 *     Cloudflare request env (AppEnv.ALLOWED_ORIGINS)
 *       → resolveValidatedRequestRuntimeConfig()
 *       → validated, frozen SecurityRuntimeConfig.trustedOrigins
 *       → MutationGuardPolicy.trustedOrigins
 *       → checkMutationRequestIntegrity / validateCsrfOrigin
 *
 *   The allowlist that previously lived at module scope here was computed from
 *   the ambient environment at MODULE LOAD. Under Cloudflare Workers that is
 *   not the request environment, so it collapsed to `["http://localhost:3000"]`
 *   in production — an allowlist that cannot be configured in production is not
 *   a guard. It also made this module a second, non-authoritative reader of the
 *   raw runtime env, which `app/lib/runtime/requestRuntimeConfig.ts` declares
 *   itself the only one of.
 *
 *   `process.env` origin authority — module-scope or per-call — is prohibited
 *   here and in `httpMutationGuard.ts`, and both prohibitions are asserted.
 *   Wildcard, suffix and prefix matching are prohibited; comparison is exact
 *   string equality on `URL`-parsed origins.
 */

export type CsrfCheckResult = { readonly ok: true } | { readonly ok: false; readonly reason: "csrf_failed" | "invalid_origin" }

export function validateCsrfOrigin(
  request: Request,
  trustedOrigins: readonly string[],
): CsrfCheckResult {
  const origin = request.headers.get("Origin")
  const referer = request.headers.get("Referer")

  // Origin AND Referer both absent → reject, regardless of any credential. A
  // valid `Authorization: Bearer` token does NOT substitute for a conforming
  // Origin: a non-browser client must send one. This preserves the existing
  // cross-site protection rather than weakening it.
  if (!origin && !referer) {
    return { ok: false, reason: "csrf_failed" }
  }

  // Origin present → Origin ONLY. There is no Referer fallback when Origin is
  // present, even when Origin is untrusted and Referer would be trusted.
  const candidate = origin ?? referer!

  // `Origin: null` is the opaque origin (sandboxed iframe, some redirects). It
  // is rejected explicitly, as policy, rather than by accident of a parse
  // failure. Duplicate Origin headers join with ", " and also fail below.
  if (origin !== null && origin.trim().toLowerCase() === "null") {
    return { ok: false, reason: "invalid_origin" }
  }

  const observed = normalizeOrigin(candidate)
  if (observed === null) return { ok: false, reason: "invalid_origin" }

  for (const allowed of trustedOrigins) {
    const normalized = normalizeOrigin(allowed)
    if (normalized !== null && normalized === observed) return { ok: true }
  }

  return { ok: false, reason: "invalid_origin" }
}

/**
 * Exact `URL`-parsed origin, or null when unparseable. Scheme, host and port
 * are all compared; default ports normalize identically on both sides. The
 * userinfo form `https://example.com@evil.com` parses with host `evil.com`, so
 * it can never match a trusted `https://example.com`.
 */
function normalizeOrigin(value: string): string | null {
  try {
    const parsed = new URL(value).origin
    // An opaque origin serializes as the literal "null" and must never match.
    return parsed === "null" ? null : parsed
  } catch {
    return null
  }
}
