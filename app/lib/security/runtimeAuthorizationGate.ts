/**
 * P6-FIX-012: the server-side final Runtime Authorization gate (Issue #145).
 *
 * This is the ONLY place that turns a verified Approval Chain Linkage and a
 * runtime-eligible Human Decision into an `authorized_not_executed` receipt, and
 * it does so ONLY after an exact-binding atomic ApprovalStore claim wins. It:
 *
 *   - derives the executor identity from the CURRENT authenticated session
 *     (`createCanonicalSessionIdentity`, `actor_kind: "executor"`) — never from
 *     the client;
 *   - loads ALL Phase 6 evidence from the server-authoritative resolver — never
 *     from the client body;
 *   - runs the pure eligibility evaluator (which re-runs `verifyApprovalLinkage`
 *     internally, evaluates the Human Decision runtime matrix, and enforces
 *     executor-vs-approver separation);
 *   - performs an early RBAC/kill-switch fast-fail and then a FINAL RBAC +
 *     kill-switch recheck immediately before the claim;
 *   - performs the exact-binding atomic claim (`claimApprovalForRuntime`), never
 *     the legacy unbound single-id claim method;
 *   - constructs the opaque receipt ONLY after the claim succeeds.
 *
 * It never calls a provider, never creates an ExecutionResult, never returns an
 * externalRef, and never promotes a WorkUnit. It may import approved server
 * security + persistence abstractions but no provider client and no external
 * write.
 */

import type { Session } from "./session.ts"
import type { ApprovalStore } from "./approvalStore.ts"
import type { ApprovalActionType } from "../domain/types.ts"
import type { TenantId } from "../tenant/types.ts"
import { hasPermission } from "./rbac.ts"
import { areExternalActionsEnabled } from "./externalActions.ts"
import { createCanonicalSessionIdentity } from "../phase6/canonicalIdentity/index.ts"
import {
  evaluateRuntimeAuthorizationEligibility,
  constructRuntimeAuthorizationReceipt,
  type RuntimeAuthorizationResult,
  type RuntimeAuthorizationEligibilityState,
} from "../phase6/runtimeAuthorization/index.ts"
import type { RuntimeAuthorizationEvidenceResolver } from "./runtimeAuthorizationEvidenceResolver.ts"

const EXECUTE_PERMISSION = "workunit.execute_external_action" as const

export type AuthorizeRuntimeCommandInput = {
  readonly session: Session
  readonly request: {
    readonly tenantId: string
    readonly workUnitId: string
    readonly actionPreviewId: string
    readonly approvalId: string
    readonly actionType: string
  }
  readonly evaluatedAt: string
  readonly approvalStore: ApprovalStore
  readonly evidenceResolver: RuntimeAuthorizationEvidenceResolver
  readonly env?: NodeJS.ProcessEnv
}

function fail(
  state: Exclude<RuntimeAuthorizationEligibilityState, "eligible">,
  issueCode: string,
): RuntimeAuthorizationResult {
  return Object.freeze({ ok: false, state, issue_code: issueCode })
}

/** Never let a malformed session throw during the RBAC check. */
function hasExecutePermission(session: Session): boolean {
  try {
    return hasPermission(session, EXECUTE_PERMISSION)
  } catch {
    return false
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * The final runtime authorization gate. Returns a frozen discriminated result
 * with a stable internal issue code. On success the receipt is
 * `authorized_not_executed`; no provider is called and no state beyond the
 * one-time-use Approval claim is mutated.
 */
export async function authorizeRuntimeCommand(
  input: AuthorizeRuntimeCommandInput,
): Promise<RuntimeAuthorizationResult> {
  try {
    const { session, request, evaluatedAt, approvalStore, evidenceResolver } = input
    const env = input.env ?? process.env

    // 1. Inert request identifiers must be present and well-formed.
    if (
      !isNonEmptyString(request.tenantId) ||
      !isNonEmptyString(request.workUnitId) ||
      !isNonEmptyString(request.actionPreviewId) ||
      !isNonEmptyString(request.approvalId) ||
      !isNonEmptyString(request.actionType) ||
      !isNonEmptyString(evaluatedAt)
    ) {
      return fail("invalid", "invalid_runtime_authorization_input")
    }

    // 2. Early RBAC + kill-switch fast-fail (defense in depth; rechecked below).
    if (!hasExecutePermission(session)) {
      return fail("forbidden", "runtime_authorization_rbac_denied")
    }
    if (!areExternalActionsEnabled(env)) {
      return fail("blocked", "runtime_authorization_kill_switch_off")
    }

    // 3. Executor identity from the CURRENT authenticated session only. Dev,
    //    anonymous, expired, service-account, delegated, cross-tenant, and
    //    malformed sessions all fail closed inside the constructor.
    const executorResult = createCanonicalSessionIdentity(session, {
      actor_kind: "executor",
      expected_tenant_id: request.tenantId,
      observed_at: evaluatedAt,
    })
    if (!executorResult.ok) {
      return fail("forbidden", "runtime_authorization_executor_invalid")
    }
    const executor = executorResult.identity

    // 4. Server-authoritative evidence — never from the client. Missing evidence
    //    (default-deny resolver) fails closed as not_ready.
    const bundle = await evidenceResolver.resolveEvidenceBundle({
      tenantId: request.tenantId,
      workUnitId: request.workUnitId,
      actionPreviewId: request.actionPreviewId,
      approvalId: request.approvalId,
      evaluatedAt,
    })
    if (bundle === null) {
      return fail("not_ready", "runtime_authorization_state_missing")
    }

    // 5. The server-resolved envelope must name the same inert identifiers the
    //    caller named (tenant-scoped, bound tuple). Hashes are server-owned.
    const envelope = bundle.intendedAction
    if (
      envelope.tenantId !== request.tenantId ||
      envelope.workUnitId !== request.workUnitId ||
      envelope.actionPreviewId !== request.actionPreviewId ||
      envelope.approvalId !== request.approvalId ||
      envelope.actionType !== request.actionType
    ) {
      return fail("stale", "runtime_authorization_state_missing")
    }

    // 6. Pure eligibility (re-runs verifyApprovalLinkage + HD matrix + executor
    //    separation + bounded expiry). No claim, no side effect.
    const eligibility = evaluateRuntimeAuthorizationEligibility({
      linkage: bundle.linkage,
      linkage_context: bundle.linkageContext,
      executor_identity: executor,
      intended_action: {
        tenant_id: envelope.tenantId,
        workunit_id: envelope.workUnitId,
        action_preview_id: envelope.actionPreviewId,
        approval_id: envelope.approvalId,
        action_type: envelope.actionType,
        target_hash: envelope.targetHash,
        payload_hash: envelope.payloadHash,
      },
      session_expires_at: session.expiresAt,
      issued_at: evaluatedAt,
    })
    if (!eligibility.ok) {
      return fail(eligibility.state, eligibility.issue_codes[0] ?? "runtime_authorization_state_missing")
    }

    // 7. FINAL RBAC + kill-switch recheck, immediately before the claim. Never
    //    reuse the earlier `true`; re-evaluate from source.
    if (!hasExecutePermission(session)) {
      return fail("forbidden", "runtime_authorization_rbac_denied")
    }
    if (!areExternalActionsEnabled(env)) {
      return fail("blocked", "runtime_authorization_kill_switch_off")
    }

    // 8. Exact-binding atomic one-time-use claim. Never the legacy unbound
    //    single-id claim method. A lost claim yields no receipt.
    const claimed = await approvalStore.claimApprovalForRuntime({
      tenantId: envelope.tenantId as TenantId,
      workUnitId: envelope.workUnitId,
      actionPreviewId: envelope.actionPreviewId,
      approvalId: envelope.approvalId,
      actionType: envelope.actionType as ApprovalActionType,
      targetHash: envelope.targetHash,
      payloadHash: envelope.payloadHash,
      claimedAt: evaluatedAt,
    })
    if (!claimed) {
      return fail("used", "runtime_authorization_linkage_used")
    }

    // 9. Receipt construction — ONLY after the claim succeeds.
    const receipt = constructRuntimeAuthorizationReceipt(eligibility.evidence)
    return Object.freeze({ ok: true, state: "authorized_not_executed", receipt })
  } catch {
    return fail("invalid", "runtime_authorization_validation_exception")
  }
}
