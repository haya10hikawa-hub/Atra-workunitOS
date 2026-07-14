/**
 * Server-side approval store.
 *
 * The ApprovalStore interface abstracts approval record persistence.
 * It is intentionally not tied to any database — implementations may be
 * in-memory (tests/dev), database-backed (production), or remote.
 *
 * CURRENT: defaultDenyApprovalStore denies all approvals.
 *   This preserves safety until a real persistence layer exists.
 *
 * PRODUCTION: requires a database-backed implementation with:
 *   - atomic status transitions (pending → approved → used)
 *   - tenant-scoped queries
 *   - expiry enforcement
 *   - one-time-use enforcement
 */

import type { ActionApprovalRecord, ApprovalActionType, ApprovalStatus } from "../domain/types.ts"
import type { TenantId } from "../tenant/types.ts"

// ─── Lookup Input ───────────────────────────────────────────────

export type ApprovalLookupInput = {
  tenantId: TenantId
  workUnitId: string
  actionPreviewId: string
  approvalId: string
  actionType: ApprovalActionType
  targetHash: string
  payloadHash: string
  now: string
}

// ─── Runtime Claim Input (Issue #145) ───────────────────────────

/**
 * The exact-binding envelope for the final runtime authorization claim
 * (`claimApprovalForRuntime`). Unlike the legacy unbound `markApprovalUsed(id)`,
 * every binding field must match the stored approval row atomically, so a claim
 * for a substituted target, payload, action type, WorkUnit, ActionPreview,
 * Approval id, or tenant matches zero rows and returns false.
 */
export type RuntimeApprovalClaimInput = {
  readonly tenantId: TenantId
  readonly workUnitId: string
  readonly actionPreviewId: string
  readonly approvalId: string
  readonly actionType: ApprovalActionType
  readonly targetHash: string
  readonly payloadHash: string
  readonly claimedAt: string
}

// ─── Verification Result ────────────────────────────────────────

export type ApprovalVerificationResult =
  | { ok: true; approvalId: string }
  | {
      ok: false
      error:
        | "approval_required"
        | "approval_expired"
        | "approval_used"
        | "approval_payload_mismatch"
        | "approval_target_mismatch"
        | "forbidden"
    }

// ─── Store Interface ────────────────────────────────────────────

export interface ApprovalStore {
  /** Find an approval record by its id. Returns null if not found. */
  findApprovalById(approvalId: string): Promise<ActionApprovalRecord | null>

  /**
   * Atomically claim an approval as used (one-time-use enforcement, Phase 5B).
   *
   * Returns true only when THIS call won the claim (the approval was approved,
   * unused, and unexpired at the moment of the compare-and-set). Returns false
   * when the claim was lost — already used, expired, or a concurrent winner —
   * in which case the caller must fail closed and must NOT proceed.
   *
   * LEGACY / UNBOUND. Retained for backward compatibility with existing
   * consumers; the Issue #145 runtime gate must use `claimApprovalForRuntime`,
   * which binds every action field, and must never use this unbound method.
   */
  markApprovalUsed(approvalId: string, usedAt: string): Promise<boolean>

  /**
   * Exact-binding atomic one-time-use claim for the final runtime authorization
   * gate (Issue #145). Returns true only when THIS call won the claim AND every
   * binding field (tenant, Approval id, WorkUnit, ActionPreview, action type,
   * target hash, payload hash) matched the stored `approved`, unused, unexpired
   * row at the moment of the compare-and-set. Any mismatch, or a lost race,
   * updates zero rows and returns false; the caller must fail closed.
   *
   * Inclusive-fail expiry: a claim exactly at `expiresAt` fails.
   */
  claimApprovalForRuntime(input: RuntimeApprovalClaimInput): Promise<boolean>
}

// ─── Verification ───────────────────────────────────────────────

/**
 * Verify a server-side approval against the store.
 *
 * Checks (in order):
 *   1. Approval exists → else approval_required
 *   2. tenantId matches → else forbidden
 *   3. workUnitId matches → else forbidden
 *   4. actionPreviewId binding matches → else forbidden (Phase 5C)
 *   5. actionType matches → else forbidden
 *   6. targetHash matches → else approval_target_mismatch
 *   7. payloadHash matches → else approval_payload_mismatch
 *   8. Status is "approved" → else approval_required (if pending/rejected)
 *   9. Not expired → else approval_expired
 *  10. Not already used → else approval_used
 *
 * Client-provided `approvedByPm` is NEVER checked here.
 * The client never provides targetHash or payloadHash — they come from
 * the stored ActionPreview (server-side).
 */
export async function verifyApproval(
  store: ApprovalStore,
  input: ApprovalLookupInput,
): Promise<ApprovalVerificationResult> {
  const record = await store.findApprovalById(input.approvalId)
  if (!record) return { ok: false, error: "approval_required" }

  // Cross-tenant guard
  if (record.tenantId !== input.tenantId) return { ok: false, error: "forbidden" }

  // WorkUnit mismatch
  if (record.workUnitId !== input.workUnitId) return { ok: false, error: "forbidden" }

  // Explicit approval → action-preview binding (Phase 5C). The approval must
  // reference exactly the ActionPreview the caller resolved targetHash/payloadHash
  // from. This forbids validating an approval against a preview it is not bound to.
  if (record.actionPreviewId !== input.actionPreviewId) return { ok: false, error: "forbidden" }

  // Action type mismatch
  if (record.actionType !== input.actionType) return { ok: false, error: "forbidden" }

  // Hash mismatches — payload or target was edited after approval
  if (record.targetHash !== input.targetHash) return { ok: false, error: "approval_target_mismatch" }
  if (record.payloadHash !== input.payloadHash) return { ok: false, error: "approval_payload_mismatch" }

  // Status checks
  if (record.status === "rejected") return { ok: false, error: "approval_required" }
  if (record.status === "pending") return { ok: false, error: "approval_required" }
  if (record.status === "expired") return { ok: false, error: "approval_expired" }
  if (record.status === "used") return { ok: false, error: "approval_used" }

  // Expiry check (belt-and-suspenders: also check timestamp). Inclusive-fail
  // (Issue #145 harmonization): exactly at `expiresAt` is already expired, so
  // `verifyApproval` agrees with the D1 claim predicate `expires_at > claimedAt`.
  if (new Date(input.now) >= new Date(record.expiresAt)) return { ok: false, error: "approval_expired" }

  if (record.status !== "approved") return { ok: false, error: "approval_required" }

  return { ok: true, approvalId: record.id }
}

// ─── Default (Deny) Store ───────────────────────────────────────

/**
 * Default approval store: denies everything.
 * Safe by default. Use in production until a real store exists.
 */
export const defaultDenyApprovalStore: ApprovalStore = {
  async findApprovalById() { return null },
  async markApprovalUsed() { return false },
  async claimApprovalForRuntime() { return false },
}

// ─── In-Memory Store (Tests / Dev) ──────────────────────────────

/**
 * In-memory approval store for testing and local development.
 *
 * NOT SAFE FOR PRODUCTION:
 *   - No persistence
 *   - No atomicity
 *   - No tenant isolation enforcement beyond the verification function
 *   - State lost on restart
 */
export function createInMemoryApprovalStore(): ApprovalStore & {
  /** Directly insert a record (test-only). */
  addRecord(record: ActionApprovalRecord): void
  /** Get all records (test-only). */
  getAllRecords(): readonly ActionApprovalRecord[]
} {
  const records = new Map<string, ActionApprovalRecord>()

  return {
    async findApprovalById(approvalId: string) {
      return records.get(approvalId) ?? null
    },

    async markApprovalUsed(approvalId: string, usedAt: string) {
      // Phase 5B: compare-and-set. Only an approved, unused, unexpired record is
      // claimed; replays/expired/used records return false (claim lost).
      const record = records.get(approvalId)
      if (!record) return false
      if (record.status !== "approved") return false
      if (record.usedAt) return false
      if (new Date(usedAt) > new Date(record.expiresAt)) return false
      records.set(approvalId, { ...record, status: "used" as ApprovalStatus, usedAt })
      return true
    },

    async claimApprovalForRuntime(input) {
      // Issue #145: exact-binding compare-and-set. Predicate parity with the D1
      // CLAIM_FOR_RUNTIME_SQL. Any binding-field mismatch, wrong status, prior
      // use, or inclusive-fail expiry (claimedAt >= expiresAt) claims nothing.
      const record = records.get(input.approvalId)
      if (!record) return false
      if (record.tenantId !== input.tenantId) return false
      if (record.workUnitId !== input.workUnitId) return false
      if (record.actionPreviewId !== input.actionPreviewId) return false
      if (record.actionType !== input.actionType) return false
      if (record.targetHash !== input.targetHash) return false
      if (record.payloadHash !== input.payloadHash) return false
      if (record.status !== "approved") return false
      if (record.usedAt) return false
      if (new Date(input.claimedAt) >= new Date(record.expiresAt)) return false
      records.set(input.approvalId, { ...record, status: "used" as ApprovalStatus, usedAt: input.claimedAt })
      return true
    },

    addRecord(record: ActionApprovalRecord) {
      records.set(record.id, record)
    },

    getAllRecords() {
      return Array.from(records.values())
    },
  }
}
