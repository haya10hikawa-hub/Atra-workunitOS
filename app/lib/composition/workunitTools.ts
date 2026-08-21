/**
 * WU-06 final route delegation — the workunit/tools route composition root.
 *
 * This is the one place that selects the concrete LLM provider and Runtime
 * Authorization security adapters the tools-route Application use cases need,
 * and wires them into the narrow capability contracts those use cases declare
 * (`app/lib/application/workunitTools/toolOperationUseCases.ts`).
 *
 * Direction: delivery (app/api) -> this module -> application use cases -> ports
 * / domain. Nothing inward may import this module.
 *
 * SECURITY-CRITICAL MACHINERY IS WRAPPED, NOT REIMPLEMENTED. `authorizeRuntimeCommand`
 * (Issue #145's final Runtime Authorization gate) is called here verbatim, with
 * the same request-scoped kill-switch projection, the same server-authoritative
 * evidence resolver, and the same audit sink the route constructs and threads in.
 * This module changes none of its ordering, RBAC/kill-switch rechecks, CAS claim,
 * or audit semantics — it only relocates the call site out of the route.
 *
 * Lifetime is exactly one request: no module-level mutable state, so two
 * concurrent requests never share an adapter or a runtime config snapshot.
 */

import type { TenantId } from "../tenant/types.ts"
import type { Session } from "../security/session.ts"
import { resolveApprovalStore } from "../security/approvalStoreResolver.ts"
import { resolveRuntimeAuthorizationEvidenceResolver } from "../security/runtimeAuthorizationEvidenceResolver.ts"
import { authorizeRuntimeCommand } from "../security/runtimeAuthorizationGate.ts"
import type { RuntimeAuthorizationAuditSink } from "../phase6/runtimeAuthorization/index.ts"
import { resolveLlmProvider, resolveLlmProviderConfig } from "../llm/providerConfig.ts"
import { processWorkSignal } from "../llm/processWorkSignal.ts"
import {
  projectLlmEnv,
  projectRuntimeAuthorizationEnv,
  type ValidatedRequestRuntimeConfig,
} from "../runtime/requestRuntimeConfig.ts"
import type {
  IngestOrchestrationCapabilities,
  RuntimeAuthorizationCapabilities,
} from "../application/workunitTools/toolOperationUseCases.ts"

/**
 * Select the LLM provider (never chosen by the Application layer) and project it
 * onto the narrow ingest-orchestration capability contract. `providerAvailable`
 * and `allowLegacyFallback` are both derived from the request-scoped LLM runtime
 * config projection — never ambient `process.env`.
 */
export function buildIngestCapabilities(runtime: ValidatedRequestRuntimeConfig): IngestOrchestrationCapabilities {
  const llmEnv = projectLlmEnv(runtime.llm)
  const providerResult = resolveLlmProvider(llmEnv)
  const config = resolveLlmProviderConfig(llmEnv)
  return {
    providerAvailable: providerResult !== null,
    allowLegacyFallback: config.allowLegacyFallback,
    processSignal(signal, tenantId) {
      if (!providerResult) throw new Error("processSignal invoked without an available LLM provider")
      return processWorkSignal(providerResult.provider, signal, tenantId, { createdBy: "ai" })
    },
  }
}

/**
 * Wrap the final Runtime Authorization gate behind the narrow capability the
 * Application layer's preparation use case declares. The ApprovalStore and
 * evidence resolver are resolved here (tenant-scoped, never client-supplied);
 * the audit sink is constructed by the route (it performs the redacted,
 * HTTP-facing audit + durable persistence calls) and threaded straight through.
 */
export function buildRuntimeAuthorizationCapabilities(
  session: Session,
  runtime: ValidatedRequestRuntimeConfig,
  auditSink: RuntimeAuthorizationAuditSink,
): RuntimeAuthorizationCapabilities {
  const approvalStore = resolveApprovalStore(session.tenantId as TenantId)
  const evidenceResolver = resolveRuntimeAuthorizationEvidenceResolver(session.tenantId as TenantId)
  return {
    async authorize(request) {
      const result = await authorizeRuntimeCommand({
        session,
        request,
        approvalStore,
        evidenceResolver,
        // Kill-switch state comes from the request-scoped security config, NOT process.env.
        env: projectRuntimeAuthorizationEnv(runtime.security),
        auditSink,
      })
      if (!result.ok) return { ok: false, state: result.state }
      return {
        ok: true,
        authorizationId: result.receipt.authorization_id,
        actionType: result.receipt.action_type,
        expiresAt: result.receipt.expires_at,
      }
    },
  }
}
