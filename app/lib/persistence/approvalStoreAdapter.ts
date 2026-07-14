/**
 * Repository-Backed ApprovalStore Adapter
 *
 * Wraps an ApprovalRecordRepository into the ApprovalStore interface.
 * The adapter captures a TenantDbContext at construction time and
 * delegates all calls to the repository.
 *
 * This bridges the gap between:
 *   - ApprovalStore (no context parameter — used by verifyApproval)
 *   - ApprovalRecordRepository (requires TenantDbContext)
 */

import type { ApprovalStore } from "../security/approvalStore.ts"
import type { ActionApprovalRecord } from "../domain/types.ts"
import type { TenantDbContext } from "./types.ts"
import type { ApprovalRecordRepository } from "./repositories.ts"
import { approvalRecordRowToDomain } from "./mappers.ts"
import { isIsoUtcTimestamp } from "../phase6/shared/isoUtcTimestamp.ts"

/**
 * Create an ApprovalStore backed by an ApprovalRecordRepository.
 *
 * The adapter captures a fixed TenantDbContext — all calls use the
 * same tenant context. For cross-tenant operations, create a new
 * adapter with the appropriate context.
 *
 * SAFETY:
 *   - findApprovalById delegates to repository.findById
 *   - markApprovalUsed delegates to repository.markUsed
 *   - Row types are mapped to domain types via mappers
 *   - Repository failures propagate as null/void (fail-safe)
 */
export function createRepositoryBackedApprovalStore(
  repo: ApprovalRecordRepository,
  ctx: TenantDbContext,
): ApprovalStore {
  return {
    async findApprovalById(approvalId: string): Promise<ActionApprovalRecord | null> {
      try {
        const row = await repo.findById(ctx, approvalId)
        if (!row) return null
        return approvalRecordRowToDomain(row)
      } catch {
        // Fail closed: return null (approval_required)
        return null
      }
    },

    async markApprovalUsed(approvalId: string, usedAt: string): Promise<boolean> {
      try {
        // Phase 5B: the repository markUsed is an atomic compare-and-set. It
        // returns the row only when this call claimed the one-time use, and
        // null otherwise. Surface that as the claim result.
        const claimed = await repo.markUsed(ctx, approvalId, usedAt)
        return claimed !== null
      } catch {
        // Fail closed: treat a repository error as "claim not won".
        return false
      }
    },

    async claimApprovalForRuntime(input): Promise<boolean> {
      try {
        // Issue #145: the repository claimForRuntime is an exact-binding atomic
        // compare-and-set. It returns the row only when this call won the claim
        // with every binding field matching; null otherwise. The tenant is the
        // adapter's fixed ctx.tenantId — the caller-supplied input.tenantId is
        // additionally cross-checked so a mismatched tenant claims nothing.
        // A malformed/non-ISO claimedAt is rejected before touching the repo.
        if (!isIsoUtcTimestamp(input.claimedAt)) return false
        if (input.tenantId !== ctx.tenantId) return false
        const claimed = await repo.claimForRuntime(ctx, {
          id: input.approvalId,
          workUnitId: input.workUnitId,
          actionPreviewId: input.actionPreviewId,
          actionType: input.actionType,
          targetHash: input.targetHash,
          payloadHash: input.payloadHash,
          claimedAt: input.claimedAt,
        })
        return claimed !== null
      } catch {
        // Fail closed: treat a repository error as "claim not won".
        return false
      }
    },
  }
}
