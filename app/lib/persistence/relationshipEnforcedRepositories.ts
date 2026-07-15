/**
 * Relationship-enforcing persistence boundary (Blocker 2, P0-PERSIST-014)
 *
 * A tenant-scoped child object may reference ONLY parent objects owned by the
 * same `ctx.tenantId`. Because the shared tenant D1 uses a GLOBAL object-ID
 * namespace, a foreign or missing parent id must never establish a cross-tenant
 * relationship. This layer enforces parent ownership at the persistence-SERVICE
 * boundary (the repository bundle every route consumes), for BOTH the D1 and the
 * in-memory implementations — it is NOT solved only in API routes.
 *
 * Parent ownership is checked via the SAME bundle's sibling repositories, whose
 * `findById` is already tenant-scoped: a `findById` for a foreign-tenant or
 * absent parent returns `null` identically. A violation therefore fails closed
 * with ONE opaque typed error — `parent_boundary_violation` — that reveals
 * nothing about whether the parent exists, which tenant owns it, the parent row,
 * its title/payload, raw SQL, or any binding. A foreign parent and a missing
 * parent are INDISTINGUISHABLE to the caller.
 */

import type { TenantDbContext, ActionPreviewRow, ApprovalRecordRow, WorkUnitFeedbackRow } from "./types.ts"
import type {
  ActionPreviewRepository,
  ApprovalRecordRepository,
  WorkUnitRepository,
  WorkUnitFeedbackRepository,
  RuntimeApprovalClaimFields,
} from "./repositories.ts"
import { D1RepositoryError } from "./d1/types.ts"

/** The single opaque failure for any foreign-tenant or missing parent reference. */
function parentBoundaryViolation(): never {
  throw new D1RepositoryError("parent_boundary_violation")
}

/** Assert the referenced WorkUnit exists AND belongs to ctx.tenantId. */
async function assertWorkUnitOwned(
  workUnits: WorkUnitRepository,
  ctx: TenantDbContext,
  workUnitId: string,
): Promise<void> {
  // Tenant-scoped findById: null for BOTH a foreign-tenant parent and a missing
  // parent — the two are indistinguishable, so the failure discloses neither.
  const parent = await workUnits.findById(ctx, workUnitId)
  if (!parent) parentBoundaryViolation()
}

/**
 * Wrap an ActionPreview repository so `create` first verifies the referenced
 * WorkUnit is owned by ctx.tenantId.
 */
export function enforceActionPreviewParent(
  raw: ActionPreviewRepository,
  deps: { workUnits: WorkUnitRepository },
): ActionPreviewRepository {
  return {
    async create(ctx: TenantDbContext, row: ActionPreviewRow): Promise<ActionPreviewRow> {
      await assertWorkUnitOwned(deps.workUnits, ctx, row.workUnitId)
      return raw.create(ctx, row)
    },
    findById: (ctx, id) => raw.findById(ctx, id),
    findByWorkUnitId: (ctx, workUnitId) => raw.findByWorkUnitId(ctx, workUnitId),
  }
}

/**
 * Wrap an Approval repository so `create` verifies, under ctx.tenantId:
 *   - the referenced ActionPreview exists and is owned by the tenant;
 *   - the preview's stored work_unit_id equals the supplied WorkUnit id;
 *   - the referenced WorkUnit exists and is owned by the tenant;
 *   - the preview's stored action type / target hash / payload hash match the
 *     approval input (a substituted preview/WorkUnit relationship fails closed).
 * The final runtime exact-binding claim (`claimForRuntime`) is unchanged.
 */
export function enforceApprovalParents(
  raw: ApprovalRecordRepository,
  deps: { actionPreviews: ActionPreviewRepository; workUnits: WorkUnitRepository },
): ApprovalRecordRepository {
  return {
    async create(ctx: TenantDbContext, row: ApprovalRecordRow): Promise<ApprovalRecordRow> {
      const preview = await deps.actionPreviews.findById(ctx, row.actionPreviewId)
      if (!preview) parentBoundaryViolation()
      if (preview.workUnitId !== row.workUnitId) parentBoundaryViolation()
      await assertWorkUnitOwned(deps.workUnits, ctx, row.workUnitId)
      // A substituted preview↔approval binding (mismatched action/target/payload)
      // fails closed here; the runtime claim still re-checks the stored approval.
      if (preview.actionType !== row.actionType) parentBoundaryViolation()
      if (preview.targetHash !== row.targetHash) parentBoundaryViolation()
      if (preview.payloadHash !== row.payloadHash) parentBoundaryViolation()
      return raw.create(ctx, row)
    },
    findById: (ctx, id) => raw.findById(ctx, id),
    findByPreviewId: (ctx, previewId) => raw.findByPreviewId(ctx, previewId),
    findByWorkUnitId: (ctx, workUnitId) => raw.findByWorkUnitId(ctx, workUnitId),
    updateStatus: (ctx, id, status) => raw.updateStatus(ctx, id, status),
    markUsed: (ctx, id, usedAt) => raw.markUsed(ctx, id, usedAt),
    claimForRuntime: (ctx: TenantDbContext, input: RuntimeApprovalClaimFields) => raw.claimForRuntime(ctx, input),
  }
}

/**
 * Wrap a WorkUnit Feedback repository so `create` first verifies the referenced
 * WorkUnit is owned by ctx.tenantId. Tenant B cannot create feedback referencing
 * tenant A's WorkUnit; a missing parent fails identically.
 */
export function enforceFeedbackParent(
  raw: WorkUnitFeedbackRepository,
  deps: { workUnits: WorkUnitRepository },
): WorkUnitFeedbackRepository {
  return {
    async create(ctx: TenantDbContext, row: WorkUnitFeedbackRow): Promise<WorkUnitFeedbackRow> {
      await assertWorkUnitOwned(deps.workUnits, ctx, row.workUnitId)
      return raw.create(ctx, row)
    },
    findByWorkUnitId: (ctx, workUnitId) => raw.findByWorkUnitId(ctx, workUnitId),
  }
}
