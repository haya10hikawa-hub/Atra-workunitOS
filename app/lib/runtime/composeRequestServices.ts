/**
 * Request-scoped composition root for session authority.
 *
 * The ONLY place that, per request, selects the auth adapter, reads the
 * validated runtime sections, uses CONTROL_DB, and constructs the control
 * session-authority adapter. It is deterministic from its input and holds no
 * module-global adapters or repositories, and it never reads `process.env`
 * (the validated runtime config owns that seam).
 */

import { resolveAuthAdapter } from "../application/auth/resolveAuthAdapter.ts"
import type { AuthAdapter } from "../application/auth/authAdapter.ts"
import type { SessionSecurityPolicy } from "../application/auth/sessionResolver.ts"
import type { SessionAuthorityPort } from "../domain/ports/sessionAuthority.ts"
import { createControlSessionAuthority } from "../infrastructure/persistence/control/sessionAuthorityAdapter.ts"
import type { SecurityRuntimeConfig, ValidatedRequestRuntimeConfig } from "./requestRuntimeConfig.ts"

export type RequestSessionServices = {
  readonly authAdapter: AuthAdapter
  readonly sessionAuthority: SessionAuthorityPort | null
  readonly security: SessionSecurityPolicy
}

/** Build the session dependencies from one validated runtime config. */
export function composeRequestServices(runtime: ValidatedRequestRuntimeConfig): RequestSessionServices {
  const authAdapter = resolveAuthAdapter(runtime.auth, { allowDevSession: runtime.security.allowDevSession })
  const sessionAuthority = createControlSessionAuthority(runtime.persistence.CONTROL_DB)
  return { authAdapter, sessionAuthority, security: toSessionSecurityPolicy(runtime.security) }
}

/** Project the runtime security config into the application session policy. */
function toSessionSecurityPolicy(security: SecurityRuntimeConfig): SessionSecurityPolicy {
  return {
    allowDevSession: security.allowDevSession,
    allowControlLessDevSession: security.allowControlLessDevSession,
    allowDevWorkspaceBootstrap: security.allowDevWorkspaceBootstrap,
    devSessionRole: security.devSessionRole,
  }
}
