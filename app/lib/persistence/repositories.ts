/**
 * Repository Interfaces
 *
 * Defines the data access layer contracts for WorkUnit OS.
 * All repositories operate within a TenantDbContext (tenant isolation).
 * Control DB operations use ControlDbContext.
 *
 * NO IMPLEMENTATION — interfaces only.
 * Real implementations will use D1 bindings.
 */

import type {
  TenantDbContext,
  ControlDbContext,
  TenantDatabaseRef,
  InboxWorkUnitRow,
  SourceCandidateRow,
  ExternalSignalRow,
  ActionPreviewRow,
  ApprovalRecordRow,
  ExecutionResultRow,
  AuditLogRow,
  LlmProcessingRunRow,
  IntegrationMetadataRow,
  UserRow,
  WorkUnitFeedbackRow,
  IntegrationConnectionRow,
  UsageEventRow,
  UsageDailySummaryRow,
  TenantRow,
  MembershipRow,
} from "./types.ts"
import type { TenantId, UserId } from "../tenant/types.ts"

// ─── Tenant DB Resolver ─────────────────────────────────────────

export type TenantDbResolutionError = {
  kind: "tenant_not_found" | "tenant_inactive" | "database_not_found" | "resolution_failed"
  tenantId: TenantId
  message: string
}

export interface TenantDbResolver {
  /**
   * Resolve the D1 database for a given tenant.
   * Must never return another tenant's database.
   * Returns an error if the tenant is inactive, suspended, or has no database.
   */
  resolveTenantDb(tenantId: TenantId): Promise<TenantDbContext>
}

// ─── WorkUnit Repository ────────────────────────────────────────

export interface WorkUnitRepository {
  create(ctx: TenantDbContext, row: InboxWorkUnitRow): Promise<InboxWorkUnitRow>
  upsert(ctx: TenantDbContext, row: InboxWorkUnitRow): Promise<InboxWorkUnitRow>
  findById(ctx: TenantDbContext, id: string): Promise<InboxWorkUnitRow | null>
  updateStatus(ctx: TenantDbContext, id: string, status: InboxWorkUnitRow["status"]): Promise<InboxWorkUnitRow | null>
  listRecent(ctx: TenantDbContext, limit?: number): Promise<InboxWorkUnitRow[]>
}

// ─── Source Candidate Repository ────────────────────────────────

export interface SourceCandidateRepository {
  create(ctx: TenantDbContext, row: SourceCandidateRow): Promise<SourceCandidateRow>
  findById(ctx: TenantDbContext, id: string): Promise<SourceCandidateRow | null>
  findBySignalIds(ctx: TenantDbContext, signalIds: string[]): Promise<SourceCandidateRow[]>
}

// ─── External Signal Repository ─────────────────────────────────

export interface ExternalSignalRepository {
  create(ctx: TenantDbContext, row: ExternalSignalRow): Promise<ExternalSignalRow>
  findById(ctx: TenantDbContext, id: string): Promise<ExternalSignalRow | null>
}

// ─── Action Preview Repository ──────────────────────────────────

export interface ActionPreviewRepository {
  create(ctx: TenantDbContext, row: ActionPreviewRow): Promise<ActionPreviewRow>
  findById(ctx: TenantDbContext, id: string): Promise<ActionPreviewRow | null>
  findByWorkUnitId(ctx: TenantDbContext, workUnitId: string): Promise<ActionPreviewRow[]>
}

// ─── Approval Record Repository ─────────────────────────────────

export interface ApprovalRecordRepository {
  create(ctx: TenantDbContext, row: ApprovalRecordRow): Promise<ApprovalRecordRow>
  findById(ctx: TenantDbContext, id: string): Promise<ApprovalRecordRow | null>
  findByPreviewId(ctx: TenantDbContext, previewId: string): Promise<ApprovalRecordRow | null>
  findByWorkUnitId(ctx: TenantDbContext, workUnitId: string): Promise<ApprovalRecordRow[]>
  updateStatus(ctx: TenantDbContext, id: string, status: ApprovalRecordRow["status"]): Promise<ApprovalRecordRow | null>
  /**
   * Phase 5B atomic compare-and-set one-time-use claim. Returns the updated row
   * only when this call claimed the approval (approved + unused + unexpired +
   * tenant match); returns null when the claim was lost (already used, expired,
   * wrong status, or wrong tenant).
   */
  markUsed(ctx: TenantDbContext, id: string, usedAt: string): Promise<ApprovalRecordRow | null>

  /**
   * Issue #145 exact-binding atomic one-time-use claim for the final runtime
   * authorization gate. Returns the updated row only when this call claimed the
   * approval AND every binding field (tenant, id, WorkUnit, ActionPreview,
   * action type, target hash, payload hash) matched the stored approved, unused,
   * unexpired row (`expires_at > claimedAt`). Returns null on any mismatch or a
   * lost race.
   */
  claimForRuntime(ctx: TenantDbContext, input: RuntimeApprovalClaimFields): Promise<ApprovalRecordRow | null>
}

/**
 * The exact-binding fields the runtime claim predicate must match. Mirrors the
 * security-layer `RuntimeApprovalClaimInput` without importing the security
 * module into the persistence contract.
 */
export type RuntimeApprovalClaimFields = {
  readonly id: string
  readonly workUnitId: string
  readonly actionPreviewId: string
  readonly actionType: string
  readonly targetHash: string
  readonly payloadHash: string
  readonly claimedAt: string
}

// ─── Execution Result Repository ────────────────────────────────

export interface ExecutionResultRepository {
  create(ctx: TenantDbContext, row: ExecutionResultRow): Promise<ExecutionResultRow>
  findById(ctx: TenantDbContext, id: string): Promise<ExecutionResultRow | null>
  findByWorkUnitId(ctx: TenantDbContext, workUnitId: string): Promise<ExecutionResultRow[]>
}

// ─── Audit Log Repository ───────────────────────────────────────

export interface AuditLogRepository {
  append(ctx: TenantDbContext, row: AuditLogRow): Promise<AuditLogRow>
  listRecent(ctx: TenantDbContext, limit?: number): Promise<AuditLogRow[]>
  findByWorkUnitId(ctx: TenantDbContext, workUnitId: string): Promise<AuditLogRow[]>
}

// ─── LLM Processing Run Repository ──────────────────────────────

export interface LlmProcessingRunRepository {
  create(ctx: TenantDbContext, row: LlmProcessingRunRow): Promise<LlmProcessingRunRow>
  updateStatus(ctx: TenantDbContext, id: string, status: LlmProcessingRunRow["status"], errorCode?: string): Promise<LlmProcessingRunRow | null>
}

// ─── Integration Metadata Repository ────────────────────────────

export interface IntegrationMetadataRepository {
  upsert(ctx: TenantDbContext, row: IntegrationMetadataRow): Promise<IntegrationMetadataRow>
  findByProvider(ctx: TenantDbContext, provider: string): Promise<IntegrationMetadataRow | null>
  updateStatus(ctx: TenantDbContext, provider: string, status: IntegrationMetadataRow["status"]): Promise<IntegrationMetadataRow | null>
}

// ─── Phase 2: New repositories ──────────────────────────────────

export interface WorkUnitFeedbackRepository {
  create(ctx: TenantDbContext, row: WorkUnitFeedbackRow): Promise<WorkUnitFeedbackRow>
  findByWorkUnitId(ctx: TenantDbContext, workUnitId: string): Promise<WorkUnitFeedbackRow[]>
}

export interface IntegrationConnectionRepository {
  upsert(ctx: TenantDbContext, row: IntegrationConnectionRow): Promise<IntegrationConnectionRow>
  findByProvider(ctx: TenantDbContext, provider: string): Promise<IntegrationConnectionRow | null>
  listByTenant(ctx: TenantDbContext): Promise<IntegrationConnectionRow[]>
  updateStatus(ctx: TenantDbContext, provider: string, status: string, error?: { code?: string; message?: string }): Promise<IntegrationConnectionRow | null>
}

export interface UsageRepository {
  recordEvent(ctx: TenantDbContext, row: UsageEventRow): Promise<UsageEventRow>
  getDailySummary(ctx: TenantDbContext, tenantId: string, date: string): Promise<UsageDailySummaryRow[]>
  getCurrentUsage(ctx: TenantDbContext, tenantId: string, eventType: string): Promise<number>
}

export interface TenantRegistryRepository {
  findTenantById(db: ControlDbContext, tenantId: TenantId): Promise<TenantRow | null>
  findTenantBySlug(db: ControlDbContext, slug: string): Promise<TenantRow | null>
  getTenantDatabaseRef(db: ControlDbContext, tenantId: TenantId): Promise<TenantDatabaseRef | null>
  listMemberships(db: ControlDbContext, userId: UserId): Promise<MembershipRow[]>
  getUserById(db: ControlDbContext, userId: UserId): Promise<UserRow | null>
}
