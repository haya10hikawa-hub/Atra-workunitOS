/**
 * F2A — Provider URL / host policy.
 *
 * Deterministic, pure, and NETWORK-FREE URL screening for the GitHub
 * formation extractor. This module never fetches, resolves, or connects to any
 * URL — it only parses and classifies strings.
 *
 * Policy (plan Section 7):
 *   - `https` scheme only;
 *   - non-empty hostname;
 *   - no embedded username or password (userinfo);
 *   - provider-host trust is by PARSED-HOSTNAME EQUALITY against an explicit
 *     allowlist, never by substring matching — `github.com.evil.example` and
 *     `github.com@evil.example` are not `github.com`;
 *   - hostnames are canonicalized (lowercased, punycode/IDN via the WHATWG URL
 *     parser, trailing dot stripped) on BOTH sides before comparison, so a
 *     Unicode homoglyph host never equals the ASCII provider host.
 *
 * This is a host/shape authority for provider identity only. It does NOT
 * re-implement F1A's content sanitization; F1A re-validates every URL it stores.
 */

export type ProviderUrlRejection =
  | "not_string"
  | "too_long"
  | "unparseable"
  | "scheme_not_https"
  | "userinfo_present"
  | "empty_host"
  | "host_not_allowed"

export type SafeProviderUrl = {
  /** The original, validated URL string. Safe to store; NEVER fetched. */
  readonly url: string
  /** Canonical (lowercased, punycode, no trailing dot) hostname. */
  readonly hostname: string
  /** Parsed path, used for deterministic object-reference recognition. */
  readonly pathname: string
}

export type ProviderUrlResult =
  | { readonly ok: true; readonly value: SafeProviderUrl }
  | { readonly ok: false; readonly reason: ProviderUrlRejection }

// Bound aligned with the F1A URL bound; a second, explicit cap before any parse.
export const PROVIDER_URL_MAX_LENGTH = 2_048

/**
 * Canonicalize a host string to the form the WHATWG URL parser produces:
 * lowercased ASCII with IDN converted to punycode, trailing dot stripped.
 * Returns `null` when the value is not a bare host (embedded userinfo, path,
 * port, query, or fragment, or an unparseable/empty host). Used to normalize
 * both allowlist entries and (defensively) parsed hosts before equality.
 */
export function normalizeHost(host: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(`https://${host}`)
  } catch {
    return null
  }
  if (parsed.username !== "" || parsed.password !== "") return null
  if (parsed.hostname === "") return null
  // Reject anything that is not a bare host: a slash/port/query/fragment means
  // the caller passed more than a hostname.
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" || parsed.port !== "") {
    return null
  }
  return parsed.hostname.replace(/\.$/, "")
}

/**
 * Parse and classify a provider URL. When `allowedHosts` is supplied, the parsed
 * hostname must equal (after canonicalization) one of the allowed hosts;
 * otherwise the host is not checked (used for opaque external source links,
 * which still must be safe `https` URLs but may live on any host).
 *
 * Never performs any network access.
 */
export function parseProviderUrl(
  value: unknown,
  allowedHosts?: readonly string[],
): ProviderUrlResult {
  if (typeof value !== "string") return { ok: false, reason: "not_string" }
  if (value.length > PROVIDER_URL_MAX_LENGTH) return { ok: false, reason: "too_long" }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, reason: "unparseable" }
  }

  if (parsed.protocol !== "https:") return { ok: false, reason: "scheme_not_https" }
  // Reject embedded credentials. `https://github.com@evil.example/...` parses with
  // username "github.com" and host "evil.example" — a host-spoofing form.
  if (parsed.username !== "" || parsed.password !== "") return { ok: false, reason: "userinfo_present" }
  if (parsed.hostname === "") return { ok: false, reason: "empty_host" }

  const hostname = parsed.hostname.replace(/\.$/, "")

  if (allowedHosts !== undefined) {
    const allowed = new Set<string>()
    for (const entry of allowedHosts) {
      const normalized = normalizeHost(entry)
      if (normalized !== null) allowed.add(normalized)
    }
    // Parsed-hostname EQUALITY — never substring matching.
    if (!allowed.has(hostname)) return { ok: false, reason: "host_not_allowed" }
  }

  return { ok: true, value: { url: value, hostname, pathname: parsed.pathname } }
}

export type RecognizedGitHubObject = {
  readonly owner: string
  readonly name: string
  readonly kind: "pull" | "issues"
  readonly number: number
}

// A GitHub pull-request or issue object path: /<owner>/<repo>/(pull|issues)/<n>.
// Owner and repo are restricted to the GitHub-allowed charset (no delimiters, no
// whitespace/control/format characters), so a recognized reference identity is
// deterministic and collision-resistant. The number is a positive integer with
// no leading zero and a bounded digit count.
const GITHUB_OBJECT_PATH = /^\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(pull|issues)\/([1-9]\d{0,17})\/?$/

/**
 * Deterministically recognize a GitHub object path. Returns `null` for any path
 * that is not exactly a pull-request or issue object path. Host trust is the
 * caller's responsibility (via `parseProviderUrl` allowlist); this only parses
 * the path shape.
 */
export function recognizeGitHubObjectPath(pathname: string): RecognizedGitHubObject | null {
  const match = GITHUB_OBJECT_PATH.exec(pathname)
  if (match === null) return null
  const number = Number(match[4])
  if (!Number.isSafeInteger(number) || number <= 0) return null
  return { owner: match[1], name: match[2], kind: match[3] as "pull" | "issues", number }
}
