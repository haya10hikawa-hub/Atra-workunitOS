import type { AuthAdapter, AuthAdapterResult, VerifiedAuthIdentity } from "./authAdapter.ts"

type JwtHeader = { alg?: string; typ?: string }
type JwtClaims = {
  sub?: unknown
  email?: unknown
  name?: unknown
  displayName?: unknown
  picture?: unknown
  avatarUrl?: unknown
  iss?: unknown
  aud?: unknown
  exp?: unknown
  nbf?: unknown
}

/**
 * Immutable JWT verification config, injected through the constructor. The
 * adapter NEVER reads `process.env`: secret, issuer, and audience come only from
 * the request-scoped validated runtime config.
 */
export type JwtAuthConfig = {
  readonly secret: string
  readonly issuer?: string
  readonly audience?: string
}

export class JwtAuthAdapter implements AuthAdapter {
  private readonly config: JwtAuthConfig | undefined

  constructor(config?: JwtAuthConfig) {
    this.config = config ? Object.freeze({ ...config }) : undefined
  }

  async verify(request: Request): Promise<AuthAdapterResult> {
    const config = this.config
    // Missing/invalid injected config → fail closed (the resolver only supplies a
    // config when secret >= 32 bytes and issuer/audience are present in prod).
    if (!config || !config.secret) return { ok: false, reason: "adapter_not_configured" }

    const authHeader = request.headers.get("authorization")
    if (!authHeader) return { ok: false, reason: "missing_credentials" }
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (!match) return { ok: false, reason: "invalid_credentials" }
    if (match[1].length > 16_384) return { ok: false, reason: "invalid_credentials" }

    let claims: JwtClaims | null
    try {
      claims = await verifyJwt(match[1], config)
    } catch {
      return { ok: false, reason: "invalid_credentials" }
    }
    if (!claims) return { ok: false, reason: "invalid_credentials" }

    const identity = toVerifiedIdentity(claims)
    return identity ? { ok: true, identity } : { ok: false, reason: "invalid_credentials" }
  }
}

async function verifyJwt(token: string, config: JwtAuthConfig): Promise<JwtClaims | null> {
  const parts = token.split(".")
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const header = parseJson<JwtHeader>(decodeBase64UrlToText(encodedHeader))
  const claims = parseJson<JwtClaims>(decodeBase64UrlToText(encodedPayload))
  if (!header || !claims || header.alg !== "HS256" || (header.typ && header.typ !== "JWT")) return null

  const verified = await crypto.subtle.verify(
    "HMAC",
    await crypto.subtle.importKey("raw", new TextEncoder().encode(config.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]),
    decodeBase64UrlToArrayBuffer(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  )
  if (!verified || !claimsAreValid(claims, config)) return null
  return claims
}

function toVerifiedIdentity(claims: JwtClaims): VerifiedAuthIdentity | null {
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return null
  if (typeof claims.email !== "string" || claims.email.length === 0) return null
  return {
    provider: "jwt",
    providerSubject: claims.sub,
    email: claims.email,
    displayName: typeof claims.displayName === "string" ? claims.displayName : typeof claims.name === "string" ? claims.name : undefined,
    avatarUrl: typeof claims.avatarUrl === "string" ? claims.avatarUrl : typeof claims.picture === "string" ? claims.picture : undefined,
  }
}

function claimsAreValid(claims: JwtClaims, config: JwtAuthConfig): boolean {
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(claims.exp) || now >= (claims.exp as number)) return false
  if (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || now < (claims.nbf as number))) return false
  if (config.issuer && claims.iss !== config.issuer) return false
  const audience = config.audience
  if (audience) {
    if (typeof claims.aud === "string" && claims.aud !== audience) return false
    if (Array.isArray(claims.aud) && !claims.aud.includes(audience)) return false
    if (typeof claims.aud !== "string" && !Array.isArray(claims.aud)) return false
  }
  return true
}

function decodeBase64UrlToText(input: string): string {
  return new TextDecoder().decode(decodeBase64Url(input))
}

function decodeBase64UrlToArrayBuffer(input: string): ArrayBuffer {
  const bytes = decodeBase64Url(input)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function decodeBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}
