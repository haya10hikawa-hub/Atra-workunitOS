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
 *
 * Sensitive-value screening (remediation B2): a provider URL carrying
 * credential-shaped material — in the whole URL string, a decoded query
 * parameter (name or value), or the decoded fragment — is refused with
 * `sensitive_value` BEFORE it is ever returned as safe, so a secret can never
 * survive into a stored source link, `sourceRef.url`, or navigation target. The
 * screen reuses the repository's existing `containsSensitiveValue` authority
 * (never a weaker token-only regex) and performs NO network access and executes
 * no getters — it only parses and decodes strings.
 */

import { containsSensitiveValue } from "../../../security/untrustedTextScan.ts"

export type ProviderUrlRejection =
  | "not_string"
  | "too_long"
  | "unparseable"
  | "scheme_not_https"
  | "userinfo_present"
  | "empty_host"
  | "host_not_allowed"
  | "sensitive_value"

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

  // B2: refuse any URL carrying credential-shaped material before it can be
  // returned as safe. Reuses the repository's `containsSensitiveValue` authority
  // over the whole string AND over decoded query/fragment components, so a
  // percent-encoded secret cannot bypass the screen.
  if (urlContainsSensitiveValue(value, parsed)) return { ok: false, reason: "sensitive_value" }

  return { ok: true, value: { url: value, hostname, pathname: parsed.pathname } }
}

// Credential-shaped parameter NAMES that must never carry a value in a stored
// provider URL. A supplement to `containsSensitiveValue`, not a replacement.
const CREDENTIAL_PARAM_NAMES: ReadonlySet<string> = new Set([
  "token",
  "access_token",
  "accesstoken",
  "id_token",
  "refresh_token",
  "api_key",
  "apikey",
  "x-api-key",
  "authorization",
  "auth",
  "cookie",
  "session",
  "sessionid",
  "secret",
  "client_secret",
  "private_key",
  "password",
  "pwd",
])

// Provider credential VALUE shapes (GitHub / Slack / AWS / bearer / JWT). These
// families are exactly the provider-URL threat and are UNDER-covered by the
// generic `containsSensitiveValue` authority, so they are screened in addition
// to it — never instead of it.
const CREDENTIAL_VALUE_PATTERNS: readonly RegExp[] = [
  /gh[opsur]_[A-Za-z0-9]{10,}/, // GitHub PAT / OAuth / app / server / refresh
  /github_pat_[A-Za-z0-9_]{6,}/, // GitHub fine-grained PAT
  /xox[baprs]-[A-Za-z0-9-]{4,}/, // Slack tokens
  /AKIA[0-9A-Z]{12,}/, // AWS access key id
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, // JWT (header.payload.sig)
  /Bearer\s+\S{8,}/i, // bearer credential
]

function looksLikeCredentialValue(value: string): boolean {
  return CREDENTIAL_VALUE_PATTERNS.some((re) => re.test(value))
}

/**
 * True when a provider URL carries credential-shaped material anywhere that would
 * be stored. Screens, all pure and network-free:
 *   1. the complete original string via `containsSensitiveValue` (repo authority)
 *      AND the provider credential-value shapes;
 *   2. each decoded query parameter (WHATWG `searchParams` percent-decodes) — its
 *      name against `containsSensitiveValue` + the credential-name set, its value
 *      against `containsSensitiveValue` + the credential-value shapes;
 *   3. the fragment — raw, decoded, and, when it parses as `key=value` pairs, its
 *      decoded components — under the same rules.
 * The credential-name/value screens SUPPLEMENT `containsSensitiveValue`; they are
 * never the sole protection.
 */
function urlContainsSensitiveValue(original: string, parsed: URL): boolean {
  if (containsSensitiveValue(original) || looksLikeCredentialValue(original)) return true

  for (const [key, val] of parsed.searchParams) {
    if (paramIsSensitive(key, val)) return true
  }

  if (parsed.hash.length > 1) {
    const rawFragment = parsed.hash.slice(1)
    if (containsSensitiveValue(rawFragment) || looksLikeCredentialValue(rawFragment)) return true
    let decodedFragment: string | null = null
    try {
      decodedFragment = decodeURIComponent(rawFragment)
    } catch {
      decodedFragment = null
    }
    if (decodedFragment !== null && (containsSensitiveValue(decodedFragment) || looksLikeCredentialValue(decodedFragment))) {
      return true
    }
    // A fragment may itself carry `key=value` pairs (e.g. `#token=...`).
    try {
      for (const [key, val] of new URLSearchParams(rawFragment)) {
        if (paramIsSensitive(key, val)) return true
      }
    } catch {
      // A fragment that is not parseable as query pairs is already covered above.
    }
  }

  return false
}

function paramIsSensitive(name: string, value: string): boolean {
  if (CREDENTIAL_PARAM_NAMES.has(name.toLowerCase())) return true
  if (containsSensitiveValue(name) || containsSensitiveValue(value)) return true
  if (looksLikeCredentialValue(value)) return true
  return false
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
