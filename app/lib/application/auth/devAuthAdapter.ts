import type { AuthAdapter, AuthAdapterResult } from "./authAdapter.ts"

/**
 * Development-only auth adapter. It never reads `process.env`: whether it is
 * enabled is decided by the request-scoped runtime config (which only enables it
 * for the local, non-production path — dev is impossible in Cloudflare production).
 */
export class DevAuthAdapter implements AuthAdapter {
  private readonly enabled: boolean

  constructor(options: { enabled: boolean }) {
    this.enabled = options.enabled
  }

  async verify(_request: Request): Promise<AuthAdapterResult> {
    void _request
    if (!this.enabled) return { ok: false, reason: "missing_credentials" }
    return {
      ok: true,
      identity: { provider: "dev", providerSubject: "dev-user", email: "dev@example.local" },
    }
  }
}
