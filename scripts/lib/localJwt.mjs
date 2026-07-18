import { createHmac, createHash, timingSafeEqual } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export const DEFAULT_LOCAL_JWT_TTL_SECONDS = 3600
export const MAX_LOCAL_JWT_TTL_SECONDS = 86_400
export const LOCAL_JWT_REQUIRED_ENV = Object.freeze([
  "JWT_AUTH_SECRET",
  "JWT_AUTH_ISSUER",
  "JWT_AUTH_AUDIENCE",
  "CF_D1_BOOTSTRAP_IDENTITY_SUBJECT",
  "CF_D1_BOOTSTRAP_IDENTITY_EMAIL",
])

export function parseDevVars(text) {
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const [key, ...rest] = line.split("=")
    out[key] = rest.join("=").trim().replace(/^(["'])(.*)\1$/, "$2")
  }
  return out
}

// The auth variables whose ONLY trusted local source is `.dev.vars`. The Wrangler
// Worker runtime reads these from the Cloudflare env binding (`.dev.vars` +
// `wrangler.json`) and NEVER from `process.env`; keeping the CLI bound to the same
// canonical source is what prevents a silent local-auth authority split.
export const PROTECTED_LOCAL_JWT_KEYS = Object.freeze([
  "JWT_AUTH_SECRET",
  "JWT_AUTH_ISSUER",
  "JWT_AUTH_AUDIENCE",
  "CF_D1_BOOTSTRAP_IDENTITY_PROVIDER",
  "CF_D1_BOOTSTRAP_IDENTITY_SUBJECT",
  "CF_D1_BOOTSTRAP_IDENTITY_EMAIL",
])

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0

function readDevVars(repoRoot) {
  try {
    return { present: true, vars: parseDevVars(readFileSync(resolve(repoRoot, ".dev.vars"), "utf8")) }
  } catch {
    return { present: false, vars: {} }
  }
}

/**
 * Resolve the canonical local JWT auth authority.
 *
 * `.dev.vars` is the ONE authoritative source for the protected auth variables so
 * that the local CLI and the Wrangler Worker runtime (which reads those variables
 * only from the Cloudflare env binding and NEVER from `process.env`) can never
 * silently diverge. For each protected key:
 *   - present in `.dev.vars`                     → use the `.dev.vars` value;
 *   - present in `.dev.vars` AND env, equal      → use `.dev.vars` (no conflict);
 *   - present in `.dev.vars` AND env, different  → FAIL CLOSED (authority split);
 *   - present ONLY in `process.env`              → ignored (ambient is not trusted).
 * A deliberate override is possible only through the explicit `allowEnvOverride`
 * opt-in, never the default. Non-protected keys keep the prior `{ ...devVars,
 * ...env }` merge (env wins) so test-only knobs like LOCAL_JWT_TTL_SECONDS still
 * work. Returns safe categories only — never a variable VALUE.
 *
 * @param {string} [repoRoot]
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {{ allowEnvOverride?: boolean }} [options]
 * @returns {{ ok: true, env: Record<string, string | undefined>, source: string, devVarsPresent: boolean, overrides: readonly string[] }
 *   | { ok: false, reason: "local_auth_authority_conflict", conflicts: readonly string[], devVarsPresent: boolean }}
 */
export function resolveLocalJwtAuthority(repoRoot = process.cwd(), processEnv = process.env, { allowEnvOverride = false } = {}) {
  const { present: devVarsPresent, vars: devVars } = readDevVars(repoRoot)
  const env = { ...devVars, ...processEnv }
  const conflicts = []
  const overrides = []
  for (const key of PROTECTED_LOCAL_JWT_KEYS) {
    const inDev = isNonEmptyString(devVars[key])
    const inEnv = isNonEmptyString(processEnv[key])
    if (allowEnvOverride) {
      if (inEnv) {
        env[key] = processEnv[key]
        if (inDev && devVars[key] !== processEnv[key]) overrides.push(key)
      } else if (inDev) {
        env[key] = devVars[key]
      } else {
        delete env[key]
      }
      continue
    }
    if (inDev && inEnv && devVars[key] !== processEnv[key]) conflicts.push(key)
    if (inDev) env[key] = devVars[key]
    else delete env[key]
  }
  if (conflicts.length > 0) {
    return { ok: false, reason: "local_auth_authority_conflict", conflicts: Object.freeze([...conflicts]), devVarsPresent }
  }
  return { ok: true, env, source: allowEnvOverride ? "process_env_override" : "dev_vars", devVarsPresent, overrides: Object.freeze([...overrides]) }
}

/**
 * Safe source/length/fingerprint diagnostics for the protected auth variables.
 * NEVER emits a value — only source category, byte length, and a 12-hex SHA-256
 * fingerprint of the secret (local diagnostics only).
 *
 * @param {string} [repoRoot]
 * @param {Record<string, string | undefined>} [processEnv]
 * @returns {string}
 */
export function describeLocalJwtAuthority(repoRoot = process.cwd(), processEnv = process.env) {
  const { present: devVarsPresent, vars: devVars } = readDevVars(repoRoot)
  const lines = [`dev_vars_present=${devVarsPresent}`]
  for (const key of PROTECTED_LOCAL_JWT_KEYS) {
    const inDev = isNonEmptyString(devVars[key])
    const inEnv = isNonEmptyString(processEnv[key])
    const source = inDev
      ? (inEnv ? (devVars[key] === processEnv[key] ? "dev_vars=env" : "CONFLICT") : "dev_vars")
      : (inEnv ? "process_env_only" : "missing")
    if (key === "JWT_AUTH_SECRET" && inDev) {
      lines.push(`${key}: source=${source} bytes=${Buffer.byteLength(devVars[key], "utf8")} sha256_12=${createHash("sha256").update(devVars[key]).digest("hex").slice(0, 12)}`)
    } else {
      lines.push(`${key}: source=${source}`)
    }
  }
  return lines.join("\n")
}

/**
 * Backward-compatible env loader: returns the resolved canonical env and fails
 * closed (throws a safe, value-free message) on an authority conflict.
 */
export function loadLocalJwtEnv(repoRoot = process.cwd(), processEnv = process.env, opts = {}) {
  const resolved = resolveLocalJwtAuthority(repoRoot, processEnv, opts)
  if (!resolved.ok) throw new Error(`${resolved.reason}:${resolved.conflicts.join(",")}`)
  return resolved.env
}

export function validateLocalJwtEnv(env, opts = {}) {
  const requireSecret = opts.requireSecret !== false
  const failures = []
  for (const key of LOCAL_JWT_REQUIRED_ENV) {
    if (!requireSecret && key === "JWT_AUTH_SECRET") continue
    if (typeof env[key] !== "string" || env[key].trim().length === 0) failures.push(`missing:${key}`)
  }
  if (requireSecret && typeof env.JWT_AUTH_SECRET === "string" && Buffer.byteLength(env.JWT_AUTH_SECRET, "utf8") < 32) failures.push("invalid:JWT_AUTH_SECRET:min_32_bytes")
  if (typeof env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL === "string" && env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL.trim().length === 0) failures.push("invalid:CF_D1_BOOTSTRAP_IDENTITY_EMAIL:empty")
  return failures.length === 0 ? { ok: true } : { ok: false, failures }
}

export async function generateLocalJwt(env, opts = {}) {
  const validation = validateLocalJwtEnv(env)
  if (!validation.ok) throw new Error(validation.failures.join(","))
  const ttlSeconds = resolveTtlSeconds(env, opts.ttlSeconds)
  const nowSeconds = Number.isSafeInteger(opts.nowSeconds) ? opts.nowSeconds : Math.floor(Date.now() / 1000)
  const payload = {
    sub: env.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT,
    email: env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL,
    iss: env.JWT_AUTH_ISSUER,
    aud: env.JWT_AUTH_AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  }
  return signHs256(payload, env.JWT_AUTH_SECRET)
}

export async function verifyLocalJwt(token, env, opts = {}) {
  const nowSeconds = Number.isSafeInteger(opts.nowSeconds) ? opts.nowSeconds : Math.floor(Date.now() / 1000)
  const base = { ok: false, algorithm: "unreadable", subject: "", emailPresent: false, issuerMatch: false, audienceMatch: false, expiration: "unreadable", signatureValid: false }
  const validation = validateLocalJwtEnv(env)
  if (!validation.ok) return { ...base, reason: validation.failures[0] ?? "invalid_env" }
  if (typeof token !== "string" || token.split(".").length !== 3) return { ...base, reason: "token_malformed" }
  const [headerSegment, payloadSegment, signatureSegment] = token.split(".")
  const header = parseSegment(headerSegment)
  const claims = parseSegment(payloadSegment)
  const algorithm = typeof header?.alg === "string" ? header.alg : "unreadable"
  const subject = typeof claims?.sub === "string" ? claims.sub : ""
  const emailPresent = typeof claims?.email === "string" && claims.email.length > 0
  const expiration = Number.isSafeInteger(claims?.exp) ? new Date(claims.exp * 1000).toISOString() : "unreadable"
  const issuerMatch = claims?.iss === env.JWT_AUTH_ISSUER
  const audienceMatch = audienceIncludes(claims?.aud, env.JWT_AUTH_AUDIENCE)
  const resultBase = { ...base, algorithm, subject, emailPresent, issuerMatch, audienceMatch, expiration }
  if (!header || !claims) return { ...resultBase, reason: "token_unreadable" }
  if (header.alg !== "HS256") return { ...resultBase, reason: "algorithm_not_allowed" }
  if (header.typ !== undefined && header.typ !== "JWT") return { ...resultBase, reason: "typ_not_allowed" }
  const signatureValid = signatureMatches(`${headerSegment}.${payloadSegment}`, signatureSegment, env.JWT_AUTH_SECRET)
  const withSignature = { ...resultBase, signatureValid }
  if (!signatureValid) return { ...withSignature, reason: "signature_invalid" }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return { ...withSignature, reason: "subject_missing" }
  if (claims.sub !== env.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT) return { ...withSignature, reason: "subject_mismatch" }
  if (!emailPresent) return { ...withSignature, reason: "email_missing" }
  if (claims.email !== env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL) return { ...withSignature, reason: "email_mismatch" }
  if (!issuerMatch) return { ...withSignature, reason: "issuer_mismatch" }
  if (!audienceMatch) return { ...withSignature, reason: "audience_mismatch" }
  if (!Number.isSafeInteger(claims.exp) || nowSeconds >= claims.exp) return { ...withSignature, reason: "expired" }
  if (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || nowSeconds < claims.nbf)) return { ...withSignature, reason: "nbf_in_future" }
  if (!Number.isSafeInteger(claims.iat)) return { ...withSignature, reason: "iat_missing" }
  if (claims.iat > nowSeconds + 60) return { ...withSignature, reason: "iat_in_future" }
  return { ...withSignature, ok: true }
}

export function formatLocalJwtVerification(result) {
  return [
    `algorithm=${result.algorithm}`,
    // Presence only — the raw subject is never logged.
    `subjectPresent=${typeof result.subject === "string" && result.subject.length > 0}`,
    `emailPresent=${result.emailPresent}`,
    `issuerMatch=${result.issuerMatch}`,
    `audienceMatch=${result.audienceMatch}`,
    `expiration=${result.expiration}`,
    `signatureValid=${result.signatureValid}`,
  ].join("\n")
}

function resolveTtlSeconds(env, override) {
  const raw = override ?? env.LOCAL_JWT_TTL_SECONDS ?? DEFAULT_LOCAL_JWT_TTL_SECONDS
  const ttl = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > MAX_LOCAL_JWT_TTL_SECONDS) throw new Error("invalid:LOCAL_JWT_TTL_SECONDS")
  return ttl
}

function signHs256(payload, secret) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" })
  const body = encodeJson(payload)
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url")
  return `${header}.${body}.${signature}`
}

function signatureMatches(input, signature, secret) {
  try {
    const actual = Buffer.from(signature, "base64url")
    const expected = createHmac("sha256", secret).update(input).digest()
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function parseSegment(segment) {
  try { return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) } catch { return null }
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function audienceIncludes(actual, expected) {
  if (typeof actual === "string") return actual === expected
  return Array.isArray(actual) && actual.includes(expected)
}
