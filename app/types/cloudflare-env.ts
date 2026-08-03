/**
 * Cloudflare Environment Types
 *
 * Defines type-safe access to Cloudflare runtime bindings.
 * Uses the project's existing D1DatabaseLike abstraction rather
 * than importing Cloudflare runtime types directly.
 */

import type { D1DatabaseLike } from "../lib/persistence/d1/types"

// ─── Application Bindings ──────────────────────────────────────

/**
 * Cloudflare Workers (OpenNext) request-scoped runtime environment.
 *
 * D1 bindings come from `wrangler.json` "d1_databases"; the string variables
 * come from `wrangler.json` "vars" (or `wrangler secret` for secrets). This raw
 * env is validated + projected once per request by
 * `app/lib/runtime/requestRuntimeConfig.ts` — consumers receive narrow, frozen
 * capability projections, never this raw shape.
 */
export interface CloudflareEnv {
  CONTROL_DB?: D1DatabaseLike
  TENANT_DB_DEFAULT?: D1DatabaseLike

  // Environment variables (from wrangler.json "vars"; secrets via `wrangler secret`)
  PERSISTENCE_MODE?: string
  LLM_PROVIDER?: string
  DEEPSEEK_API_KEY?: string
  EXTERNAL_ACTIONS_ENABLED?: string
  ALLOW_LEGACY_INGEST_FALLBACK?: string

  /**
   * Comma-separated absolute origins (e.g. "https://app.example.com").
   * Request-scoped; the ONLY CSRF/mutation-guard trusted-origin authority.
   */
  ALLOWED_ORIGINS?: string

  // Auth configuration (request-scoped; never read from ambient process.env in prod)
  AUTH_ADAPTER?: string
  JWT_AUTH_SECRET?: string
  JWT_AUTH_ISSUER?: string
  JWT_AUTH_AUDIENCE?: string
}

/**
 * Application environment that may include Cloudflare bindings.
 * Accepts both Cloudflare runtime env and plain objects (for testing).
 */
export type AppEnv = CloudflareEnv & Record<string, unknown>
