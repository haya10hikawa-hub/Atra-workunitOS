/**
 * REQUEST COMPOSITION ROOT — authenticated session path.
 *
 * This is the one place where the concrete dependencies of the session use case
 * are selected: the runtime configuration snapshot, the auth adapter
 * implementation, and the control-DB repository implementations behind the
 * control-directory port. The application layer receives them already resolved
 * and can no longer reach outward for any of them.
 *
 * Direction: delivery (app/api) → this module → application use case → ports.
 * Nothing inward may import this module; `tests/architectureBoundaries.test.mts`
 * asserts that its only importers are API routes and tests.
 *
 * Lifetime is exactly one request. Nothing is cached across requests, and no
 * module-level mutable state exists here, so two concurrent requests never share
 * an adapter, a bundle or a configuration snapshot.
 */

import {
  resolveSession,
  type DevSessionPolicy,
  type SessionDependencies,
  type SessionResolutionResult,
} from "../application/auth/sessionResolver.ts"
import { resolveControlRepositories } from "../infrastructure/persistence/control/controlRepositoryResolver.ts"
import {
  resolveValidatedRequestRuntimeConfig,
  type ValidatedRequestRuntimeConfig,
} from "../runtime/requestRuntimeConfig.ts"
import { resolveAuthAdapter } from "./authAdapterSelection.ts"
import { toControlDirectoryRead, toDevWorkspaceBootstrap } from "./controlDirectoryAdapter.ts"
import { mayCarryDurableSessionWriteCapability } from "./httpMethodSafety.ts"

export type SessionVerificationResult = SessionResolutionResult

/**
 * Assemble the request-scoped session dependencies from one validated runtime
 * configuration snapshot and the request itself.
 *
 * `controlDirectory` is null when the control DB is not configured. That is the
 * same fail-closed condition the use case saw before through
 * `resolveControlRepositories`, carried across the boundary as an absent
 * capability instead of an error the use case has to interpret.
 *
 * METHOD IS A CAPABILITY DECISION, AND IT IS MADE HERE
 *   `devBootstrap` — the only durable write capability on the session path — is
 *   attached ONLY when the request method is one of the mutation methods. For
 *   `GET`, `HEAD`, `OPTIONS` and for any unrecognized verb the field is absent,
 *   so no safe request holds an object through which a user, tenant, membership
 *   or auth identity could be created.
 *
 *   The decision is made once, here, rather than in each handler: this is the
 *   single entry point every authenticated route already uses, so a route added
 *   tomorrow inherits the rule without its author opting in. `request.method` is
 *   read from the `Request`, which the framework populates from the request
 *   line; no header, query parameter or body field can reach it.
 *
 *   This is NOT a replacement for the dev gates. `allowDevSession`,
 *   `allowDevWorkspaceBootstrap` and the `dev` provider check are all unchanged
 *   and still all required downstream. Method safety is a second, independent
 *   condition layered beneath them.
 */
export function composeSessionDependencies(
  runtime: ValidatedRequestRuntimeConfig,
  request: Request,
): SessionDependencies {
  const control = resolveControlRepositories({ d1Binding: runtime.persistence.CONTROL_DB })
  if (!control.ok) {
    return {
      authAdapter: resolveAuthAdapter(runtime.auth, { allowDevSession: runtime.security.allowDevSession }),
      controlDirectory: null,
      devPolicy: toDevSessionPolicy(runtime),
    }
  }
  const dependencies: SessionDependencies = {
    authAdapter: resolveAuthAdapter(runtime.auth, { allowDevSession: runtime.security.allowDevSession }),
    controlDirectory: toControlDirectoryRead(control.bundle),
    devPolicy: toDevSessionPolicy(runtime),
  }
  // Spread rather than assign-undefined: the safe object must not carry the key
  // at all, so `"devBootstrap" in dependencies` is false and nothing can read a
  // present-but-undefined slot back into existence.
  return mayCarryDurableSessionWriteCapability(request)
    ? { ...dependencies, devBootstrap: toDevWorkspaceBootstrap(control.bundle) }
    : dependencies
}

/**
 * Require an authenticated session. Routes resolve the validated runtime config
 * ONCE and thread it in; when they do not, it is resolved here and a config
 * error fails closed. The auth adapter, JWT config, dev gates and control-DB
 * binding all come from that snapshot — never ambient `process.env`.
 *
 * The defaulted `Request` is a `GET`, so an argument-free call resolves a
 * READ-ONLY session. The default fails toward the narrower capability.
 */
export async function requireSession(
  request: Request = new Request("http://localhost"),
  runtime?: ValidatedRequestRuntimeConfig,
): Promise<SessionVerificationResult> {
  let rt = runtime
  if (!rt) {
    const resolved = resolveValidatedRequestRuntimeConfig()
    if (!resolved.ok) return { ok: false, reason: "unauthorized" }
    rt = resolved.runtime
  }
  // Assembly is inside the guard for the same reason the use case body is: a
  // failure while composing must map to the same fail-closed result the use case
  // would have produced, never to an unhandled route exception.
  let dependencies: SessionDependencies
  try {
    dependencies = composeSessionDependencies(rt, request)
  } catch {
    return { ok: false, reason: "internal_error" }
  }
  return resolveSession(request, dependencies)
}

/**
 * Project the validated security section onto the narrow dev-capability contract
 * the use case declares. Field-by-field, so a future security field is not
 * silently handed to the application layer.
 */
function toDevSessionPolicy(runtime: ValidatedRequestRuntimeConfig): DevSessionPolicy {
  const security = runtime.security
  return {
    allowDevSession: security.allowDevSession,
    allowDevWorkspaceBootstrap: security.allowDevWorkspaceBootstrap,
    allowControlLessDevSession: security.allowControlLessDevSession,
    devSessionRole: security.devSessionRole,
  }
}
