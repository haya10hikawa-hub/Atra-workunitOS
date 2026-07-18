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

/**
 * The single allowlisted tenant-data binding name for the Alpha persistence
 * contract. The resolver may return ONLY this binding — never a name constructed
 * from tenant input, and never the control-plane binding.
 * See docs/architecture/PERSISTENCE_CONTRACT.md.
 */
export const TENANT_DATA_BINDING = "TENANT_DB_DEFAULT" as const
export type TenantDataBinding = typeof TENANT_DATA_BINDING

/**
 * Schema versions the running code understands for a TENANT_DB_DEFAULT registry
 * row. `"2"` is the canonical Alpha schema (INCLUDING action_previews
 * .created_by_user_id, per migrations/manifest.json); `"1"` is the legacy Alpha
 * bootstrap default retained for validation compatibility. A registry
 * schema_version outside this set is well-formed but unsupported and fails closed
 * with `tenant_database_schema_unsupported`.
 */
export const SUPPORTED_TENANT_SCHEMA_VERSIONS: readonly string[] = ["1", "2"]

/**
 * Deterministic, client-safe failure reasons. These are enum values only — they
 * never carry the raw tenantId, database id/name, SQL, or binding objects, so a
 * reason can be surfaced (mapped to a safe HTTP error) without disclosure.
 *
 * Contract vocabulary (docs/architecture/PERSISTENCE_CONTRACT.md). Several
 * reasons have wire-stable historical names that predate the contract; the doc
 * records the equivalence:
 *   tenant_database_mapping_missing   ≡ database_not_found
 *   tenant_database_mapping_inactive  ≡ database_inactive
 *   (malformed mapping)               → database_invalid
 */
export type TenantDbResolutionReason =
  // Contract categories.
  | "tenant_context_required"            // no authenticated tenant context supplied
  | "tenant_not_found"                   // tenant absent from CONTROL_DB
  | "tenant_inactive"                    // tenant present but not active
  | "tenant_database_mapping_missing"    // no tenant_databases registry row
  | "tenant_database_mapping_inactive"   // registry row present but not active
  | "tenant_database_schema_unsupported" // registry schema_version not supported
  | "tenant_database_binding_missing"    // expected TENANT_DB_DEFAULT binding absent
  // Wire-stable historical names (retained; see equivalence above).
  | "database_not_found"
  | "database_inactive"
  | "database_invalid"
  | "resolution_failed"

export type TenantDbResolution =
  | {
      ok: true
      ctx: TenantDbContext
      /** Always the allowlisted tenant-data binding — never a control DB. */
      binding: TenantDataBinding
      /** The validated, supported registry schema version. */
      schemaVersion: string
    }
  | { ok: false; reason: TenantDbResolutionReason }

export interface TenantDbResolver {
  /**
   * Resolve the tenant-data D1 database for a given tenant.
   *
   * Contract (P0-PERSIST-014):
   *   - validates an ACTIVE tenant in CONTROL_DB;
   *   - validates the COMPLETE `tenant_databases` registry record: the row's
   *     tenant_id must match the requested tenant, database_name / database_id /
   *     schema_version must be present, bounded, and well-formed, and status must
   *     be exactly "active" (`database_invalid` for a malformed record);
   *   - returns the statically bound TENANT_DB_DEFAULT — NEVER the control DB;
   *   - returns a typed reason on any failure (no throw for expected failures);
   *   - never returns another tenant's context.
   */
  resolveTenantDb(tenantId: TenantId): Promise<TenantDbResolution>
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
