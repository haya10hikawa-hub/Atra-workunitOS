/**
 * Request-scoped composition root for session authority.
 *
 * The ONLY place that, per request, selects the auth adapter, reads the
 * validated runtime sections, uses CONTROL_DB, and constructs the control
 * session capabilities. It is deterministic from its input and holds no
 * module-global adapters or repositories, and it never reads `process.env`
 * (the validated runtime config owns that seam).
 */

import { resolveAuthAdapter } from "../application/auth/resolveAuthAdapter.ts"
import type { AuthAdapter } from "../application/auth/authAdapter.ts"
import type { SessionSecurityPolicy } from "../application/auth/sessionResolver.ts"
import type {
  DevelopmentWorkspaceBootstrapPort,
  SessionAuthorityPort,
} from "../domain/ports/sessionAuthority.ts"
import { createControlSessionServices } from "../infrastructure/persistence/control/sessionAuthorityAdapter.ts"
import type { SecurityRuntimeConfig, ValidatedRequestRuntimeConfig } from "./requestRuntimeConfig.ts"

export type RequestSessionServices = {
  readonly authAdapter: AuthAdapter
  readonly sessionAuthority: SessionAuthorityPort | null
  readonly developmentWorkspaceBootstrap: DevelopmentWorkspaceBootstrapPort | null
  readonly security: SessionSecurityPolicy
}

/** Build the minimum session capabilities from one validated runtime config. */
export function composeRequestServices(runtime: ValidatedRequestRuntimeConfig): RequestSessionServices {
  const authAdapter = resolveAuthAdapter(runtime.auth, { allowDevSession: runtime.security.allowDevSession })
  const controlServices = createControlSessionServices(runtime.persistence.CONTROL_DB)
  const developmentWorkspaceBootstrap = shouldSupplyDevelopmentWorkspaceBootstrap(runtime.security)
    ? controlServices?.developmentWorkspaceBootstrap ?? null
    : null

  return {
    authAdapter,
    sessionAuthority: controlServices?.sessionAuthority ?? null,
    developmentWorkspaceBootstrap,
    security: toSessionSecurityPolicy(runtime.security),
  }
}

function shouldSupplyDevelopmentWorkspaceBootstrap(security: SecurityRuntimeConfig): boolean {
  return security.allowDevSession && security.allowDevWorkspaceBootstrap
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
