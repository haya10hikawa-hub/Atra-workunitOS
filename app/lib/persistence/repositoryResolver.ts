/**
 * Repository Bundle Resolver
 *
 * SAFETY:
 *   - In-memory repositories NEVER returned in production.
 *   - D1 repositories require valid Cloudflare bindings or explicit params.
 *   - Disabled mode returns null (no persistence).
 */

import type { TenantId } from "../tenant/types.ts"
import type { TenantDbContext } from "./types.ts"
import type {
  ActionPreviewRepository,
  ApprovalRecordRepository,
  WorkUnitRepository,
  WorkUnitFeedbackRepository,
  IntegrationConnectionRepository,
  AuditLogRepository,
  UsageRepository,
  TenantDbResolver,
} from "./repositories.ts"
import type { D1DatabaseLike } from "./d1/types.ts"
import type { AppEnv } from "../../types/cloudflare-env.ts"
import { D1ActionPreviewRepository } from "./d1/actionPreviewRepository.ts"
import { D1ApprovalRecordRepository } from "./d1/approvalRecordRepository.ts"
import { D1WorkUnitRepository } from "./d1/workUnitRepository.ts"
import { D1WorkUnitFeedbackRepository } from "./d1/workUnitFeedbackRepository.ts"
import { D1IntegrationConnectionRepository } from "./d1/integrationConnectionRepository.ts"
import { D1AuditLogRepository } from "./d1/auditLogRepository.ts"
import { D1UsageRepository } from "./d1/usageRepository.ts"
import {
  createInMemoryApprovalRecordRepository,
  createInMemoryWorkUnitRepository,
  createInMemoryWorkUnitFeedbackRepository,
  createInMemoryIntegrationConnectionRepository,
  createInMemoryAuditLogRepository,
  createInMemoryUsageRepository,
} from "./inMemoryRepositories.ts"
import {
  enforceActionPreviewParent,
  enforceApprovalParents,
  enforceFeedbackParent,
} from "./relationshipEnforcedRepositories.ts"
import { resolvePersistenceConfig } from "./persistenceConfig.ts"
import { validateCloudflareRuntimeEnv } from "../runtime/validatedRuntimeEnv.ts"
import type { PersistenceRuntimeConfig } from "../runtime/requestRuntimeConfig.ts"

// ─── Bundle ──────────────────────────────────────────────────────

export type TenantRepositoryBundle = {
  actionPreviews: ActionPreviewRepository
  approvalRecords: ApprovalRecordRepository
  workUnits: WorkUnitRepository
  workUnitFeedback: WorkUnitFeedbackRepository
  integrationConnections: IntegrationConnectionRepository
  auditLogs: AuditLogRepository
  usage: UsageRepository
  ctx: TenantDbContext
}

// ─── Read-only capability projection (WU-02S, INV-SAFE-1 layer L1) ──
//
// Safe-method handlers (GET/HEAD/OPTIONS) must not merely avoid calling a write
// — the capability must be ABSENT FROM THE TYPE they can hold. These `Pick<>`
// narrowings remove every write member, so a direct write, a renamed helper, an
// alias, a destructured method and a callback-injected writer all fail to
// type-check rather than relying on a name-matching scanner.

export type WorkUnitReadRepository =
  Pick<WorkUnitRepository, "findById" | "listRecent">
export type ActionPreviewReadRepository =
  Pick<ActionPreviewRepository, "findById" | "findByWorkUnitId">
export type ApprovalRecordReadRepository =
  Pick<ApprovalRecordRepository, "findById" | "findByPreviewId" | "findByWorkUnitId">
export type WorkUnitFeedbackReadRepository =
  Pick<WorkUnitFeedbackRepository, "findByWorkUnitId">
export type IntegrationConnectionReadRepository =
  Pick<IntegrationConnectionRepository, "findByProvider" | "listByTenant">
export type AuditLogReadRepository =
  Pick<AuditLogRepository, "listRecent" | "findByWorkUnitId">

/**
 * Read-only projection of `TenantRepositoryBundle`.
 *
 * `usage` is ABSENT ENTIRELY rather than narrowed: `UsageRepository`'s only
 * non-write members (`getDailySummary`, `getCurrentUsage`) have zero
 * application callers, so omitting the field costs nothing and removes
 * `recordEvent` from a safe handler's reach completely. That is stronger than a
 * `Pick<>` and differs deliberately from the six mechanical projections above.
 */
export type TenantReadRepositoryBundle = {
  readonly actionPreviews: ActionPreviewReadRepository
  readonly approvalRecords: ApprovalRecordReadRepository
  readonly workUnits: WorkUnitReadRepository
  readonly workUnitFeedback: WorkUnitFeedbackReadRepository
  readonly integrationConnections: IntegrationConnectionReadRepository
  readonly auditLogs: AuditLogReadRepository
  readonly ctx: TenantDbContext
}

/** Narrow a resolved write-capable bundle to its read-only projection. */
export function toReadOnlyBundle(bundle: TenantRepositoryBundle): TenantReadRepositoryBundle {
  return {
    actionPreviews: bundle.actionPreviews,
    approvalRecords: bundle.approvalRecords,
    workUnits: bundle.workUnits,
    workUnitFeedback: bundle.workUnitFeedback,
    integrationConnections: bundle.integrationConnections,
    auditLogs: bundle.auditLogs,
    ctx: bundle.ctx,
  }
}

export type RepositoryResolutionError =
  | "persistence_disabled"
  | "tenant_resolution_failed"
  | "tenant_forbidden"
  | "d1_not_configured"

export type RepositoryResolutionResult =
  | { ok: true; bundle: TenantRepositoryBundle }
  | { ok: false; error: RepositoryResolutionError }

// ─── Tenant resolver consumption ─────────────────────────────────

function isD1Like(value: unknown): value is D1DatabaseLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    typeof (value as { prepare?: unknown }).prepare === "function"
  )
}

/**
 * Run the tenant DB resolver and validate its context.
 *
 * - `tenant_not_found` / `tenant_inactive` → `tenant_forbidden` (do not disclose
 *   whether another tenant exists; both map to the same safe outcome).
 * - any other reason / thrown error / mismatched context → `tenant_resolution_failed`.
 * - `strict` (production): `ctx.db` is authoritative — it must be a valid D1-like
 *   object and NEVER the control DB, and `options.d1Binding` cannot override it.
 * - non-strict (local/test): a supplied `d1Binding` may stand in for a null `ctx.db`.
 */
async function resolveViaTenantResolver(
  resolver: TenantDbResolver,
  tenantId: TenantId,
  opts: { strict: boolean; controlDb?: D1DatabaseLike; d1Binding?: D1DatabaseLike },
): Promise<{ ok: true; store: D1DatabaseLike; ctx: TenantDbContext } | { ok: false; error: RepositoryResolutionError }> {
  let resolution
  try {
    resolution = await resolver.resolveTenantDb(tenantId)
  } catch {
    return { ok: false, error: "tenant_resolution_failed" }
  }
  if (!resolution.ok) {
    const forbidden = resolution.reason === "tenant_not_found" || resolution.reason === "tenant_inactive"
    return { ok: false, error: forbidden ? "tenant_forbidden" : "tenant_resolution_failed" }
  }
  const ctx = resolution.ctx
  // The resolved context must be for exactly the requested authenticated tenant.
  if (ctx.tenantId !== tenantId) return { ok: false, error: "tenant_resolution_failed" }

  if (opts.strict) {
    const store = ctx.db
    if (!isD1Like(store)) return { ok: false, error: "tenant_resolution_failed" }
    if (opts.controlDb && store === opts.controlDb) return { ok: false, error: "tenant_resolution_failed" }
    return { ok: true, store, ctx }
  }
  const store = (opts.d1Binding ?? ctx.db) as D1DatabaseLike | null
  if (!isD1Like(store)) return { ok: false, error: "tenant_resolution_failed" }
  return { ok: true, store, ctx }
}

// ─── Helpers ────────────────────────────────────────────────────

function inMemoryBundle(tenantId: TenantId): TenantRepositoryBundle {
  // Parent-ownership is enforced at this bundle boundary using the SAME sibling
  // repositories (tenant-scoped findById), so the in-memory implementation never
  // accepts a relationship the D1 implementation would reject.
  const workUnits = createInMemoryWorkUnitRepository()
  const actionPreviews = enforceActionPreviewParent(createInMemoryActionPreviewRepo(), { workUnits })
  return {
    actionPreviews,
    approvalRecords: enforceApprovalParents(createInMemoryApprovalRecordRepository(), { actionPreviews, workUnits }),
    workUnits,
    workUnitFeedback: enforceFeedbackParent(createInMemoryWorkUnitFeedbackRepository(), { workUnits }),
    integrationConnections: createInMemoryIntegrationConnectionRepository(),
    auditLogs: createInMemoryAuditLogRepository(),
    usage: createInMemoryUsageRepository(),
    ctx: { tenantId, db: null },
  }
}

function d1Bundle(tenantId: TenantId, d1Store: D1DatabaseLike, ctx?: TenantDbContext): TenantRepositoryBundle {
  // Same tenant-local parent enforcement as the in-memory bundle: children may
  // only reference parents owned by ctx.tenantId, checked via the shared store.
  const workUnits = new D1WorkUnitRepository(d1Store)
  const actionPreviews = enforceActionPreviewParent(new D1ActionPreviewRepository(d1Store), { workUnits })
  return {
    actionPreviews,
    approvalRecords: enforceApprovalParents(new D1ApprovalRecordRepository(d1Store), { actionPreviews, workUnits }),
    workUnits,
    workUnitFeedback: enforceFeedbackParent(new D1WorkUnitFeedbackRepository(d1Store), { workUnits }),
    integrationConnections: new D1IntegrationConnectionRepository(d1Store),
    auditLogs: new D1AuditLogRepository(d1Store),
    usage: new D1UsageRepository(d1Store),
    ctx: ctx ?? { tenantId, db: null },
  }
}

// ─── Repository authority (structural production / local separation) ─
//
// Blocker 1 (P0-PERSIST-014): production and local repository resolution are
// separated STRUCTURALLY, not by comment or call convention. A production D1
// bundle is producible ONLY through `resolveProductionRepositories`, whose
// `resolver` parameter is REQUIRED at the type level — a production call cannot
// compile or succeed without one. Direct-binding (no registry validation) lives
// ONLY behind the explicitly named `resolveLocalRepositories` API; authority is
// never inferred from an omitted argument.

export type RepositoryAuthority =
  | {
      readonly kind: "cloudflare_production"
      readonly persistence: PersistenceRuntimeConfig
      readonly resolver: TenantDbResolver
    }
  | {
      readonly kind: "local_development"
      readonly persistence: PersistenceRuntimeConfig
      readonly allowDirectBinding: true
      readonly resolver?: TenantDbResolver
      readonly d1Binding?: D1DatabaseLike
    }

/** Dispatch by explicit authority. The ONLY entry point that both branches share. */
export async function resolveRepositoriesForAuthority(
  tenantId: TenantId,
  authority: RepositoryAuthority,
): Promise<RepositoryResolutionResult> {
  return authority.kind === "cloudflare_production"
    ? resolveProductionRepositories(tenantId, authority)
    : resolveLocalRepositories(tenantId, authority)
}

/**
 * PRODUCTION repository resolution. `resolver` is a REQUIRED parameter, so a
 * production D1 bundle cannot be produced without registry validation. There is
 * no direct-binding path here: `d1Binding` is not accepted, `TENANT_DB_DEFAULT`
 * is never bundled directly, `ctx.db` is authoritative, the control DB is
 * rejected as tenant storage, and a context-tenant mismatch fails closed.
 */
export async function resolveProductionRepositories(
  tenantId: TenantId,
  authority: { persistence: PersistenceRuntimeConfig; resolver: TenantDbResolver },
): Promise<RepositoryResolutionResult> {
  const p = authority.persistence
  // Production persistence is always D1; anything else fails closed.
  if (p.mode !== "d1") return { ok: false, error: "persistence_disabled" }
  if (!p.CONTROL_DB || !p.TENANT_DB_DEFAULT) return { ok: false, error: "d1_not_configured" }
  // MANDATORY registry validation via the resolver (strict). ctx.db is
  // authoritative and can never be overridden by a caller-supplied binding.
  const r = await resolveViaTenantResolver(authority.resolver, tenantId, { strict: true, controlDb: p.CONTROL_DB })
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, bundle: d1Bundle(tenantId, r.store, r.ctx) }
}

/**
 * LOCAL / TEST repository resolution — the ONLY explicitly named API that permits
 * a direct binding (no registry validation). `allowDirectBinding: true` must be
 * passed by the caller so local authority is a deliberate, named choice and is
 * never inferred from an omitted resolver.
 */
export async function resolveLocalRepositories(
  tenantId: TenantId,
  authority: {
    persistence: PersistenceRuntimeConfig
    allowDirectBinding: true
    resolver?: TenantDbResolver
    d1Binding?: D1DatabaseLike
  },
): Promise<RepositoryResolutionResult> {
  const p = authority.persistence
  if (p.mode === "in_memory") return { ok: true, bundle: inMemoryBundle(tenantId) }
  if (p.mode !== "d1") return { ok: false, error: "persistence_disabled" }
  // A local resolver, when supplied, still validates the registry (non-strict:
  // a supplied d1Binding may stand in for a null ctx.db).
  if (authority.resolver) {
    const r = await resolveViaTenantResolver(authority.resolver, tenantId, { strict: false, d1Binding: authority.d1Binding })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, bundle: d1Bundle(tenantId, r.store, r.ctx) }
  }
  // Explicit local direct binding.
  const store = authority.d1Binding ?? p.TENANT_DB_DEFAULT
  if (!store) return { ok: false, error: "d1_not_configured" }
  return { ok: true, bundle: d1Bundle(tenantId, store) }
}

// ─── Resolver ────────────────────────────────────────────────────

export async function resolveRepositories(
  tenantId: TenantId,
  options: {
    resolver?: TenantDbResolver
    d1Binding?: D1DatabaseLike
    env?: Parameters<typeof resolvePersistenceConfig>[0]
    runtimeEnv?: AppEnv
    persistence?: PersistenceRuntimeConfig
  } = {},
): Promise<RepositoryResolutionResult> {
  // ── Request-scoped validated persistence projection takes precedence ──
  //
  // The persistence mode AND D1 bindings come from ONE validated request-scoped
  // config. process.env can never override it, and in-memory repositories are
  // never returned in the production (d1) path.
  if (options.persistence) {
    const p = options.persistence
    if (p.mode === "d1") {
      if (!p.CONTROL_DB || !p.TENANT_DB_DEFAULT) return { ok: false, error: "d1_not_configured" }
      // Blocker 1: a production-capable D1 bundle REQUIRES a resolver (mandatory
      // registry validation). resolveRepositories never infers local authority
      // from an omitted resolver and never returns a direct TENANT_DB_DEFAULT
      // bundle here — local/test direct binding must go through the explicitly
      // named resolveLocalRepositories() API.
      if (!options.resolver) return { ok: false, error: "d1_not_configured" }
      return resolveProductionRepositories(tenantId, { persistence: p, resolver: options.resolver })
    }
    if (p.mode === "in_memory") return { ok: true, bundle: inMemoryBundle(tenantId) }
    return { ok: false, error: "persistence_disabled" }
  }

  // ── Cloudflare runtime env is PRODUCTION-CAPABLE → resolver MANDATORY ──
  //
  // Blocker 1: a validated Cloudflare D1 runtime env can never be converted
  // directly into a repository bundle. Registry validation is mandatory, so this
  // path routes through resolveProductionRepositories with a REQUIRED resolver.
  // No resolver → fail closed (no direct TENANT_DB_DEFAULT bundle, no d1Binding
  // override); ctx.db stays authoritative and the control DB is rejected.
  if (options.runtimeEnv) {
    const validated = validateCloudflareRuntimeEnv(options.runtimeEnv)
    if (!validated.ok) {
      // Runtime env present but missing/malformed binding or var → fail closed.
      return { ok: false, error: "d1_not_configured" }
    }
    if (!options.resolver) return { ok: false, error: "d1_not_configured" }
    return resolveProductionRepositories(tenantId, {
      persistence: { mode: "d1", CONTROL_DB: validated.env.CONTROL_DB, TENANT_DB_DEFAULT: validated.env.TENANT_DB_DEFAULT },
      resolver: options.resolver,
    })
  }

  // ── No runtime env → LOCAL/TEST config via process.env (never production) ──
  //
  // This branch derives its authority from process.env (the local development
  // seam). It is LOCAL/TEST ONLY.
  const config = resolvePersistenceConfig(options.env)

  // Round 3 (P0): a PRODUCTION config must NEVER produce a repository bundle
  // through this legacy seam. This fail-closed check runs BEFORE any mode
  // handling, so Node production can never reach resolveLocalRepositories, consume
  // options.d1Binding, or infer authority from an omitted/supplied resolver. Node
  // production D1 must use resolveProductionRepositories() with a tenant resolver
  // (registry validation mandatory). A supplied resolver here is NOT sufficient to
  // promote the legacy env seam to production authority.
  if (config.isProduction) {
    return { ok: false, error: config.mode === "d1" ? "d1_not_configured" : "persistence_disabled" }
  }

  switch (config.mode) {
    case "in_memory":
      return { ok: true, bundle: inMemoryBundle(tenantId) }

    case "d1":
      // Local/test D1 ONLY (non-production): a direct binding is permitted through
      // the explicit local API; a supplied resolver still validates the registry.
      return resolveLocalRepositories(tenantId, {
        persistence: { mode: "d1" },
        allowDirectBinding: true,
        resolver: options.resolver,
        d1Binding: options.d1Binding,
      })

    case "disabled":
    default:
      return { ok: false, error: "persistence_disabled" }
  }
}

// ─── In-Memory ActionPreview (legacy helper) ────────────────────

let inMemoryActionPreviewRepo: ActionPreviewRepository | null = null

function createInMemoryActionPreviewRepo(): ActionPreviewRepository {
  if (!inMemoryActionPreviewRepo) {
    const store = new Map<string, Record<string, unknown>>()
    const keyFor = (tenantId: string, id: string) => `${tenantId}:${id}`
    inMemoryActionPreviewRepo = {
      async create(_ctx, row) {
        const tenantId = _ctx.tenantId
        store.set(keyFor(tenantId, row.id), { ...row, id: row.id, tenantId })
        return { ...row, tenantId }
      },
      async findById(_ctx, id) {
        // Tenant scoping (red-team A-3 / out-of-band parity): the store is keyed by
        // (tenantId, id), so a cross-tenant id can never resolve another tenant's row.
        const row = store.get(keyFor(_ctx.tenantId, id)); if (!row) return null
        return { id: row.id, tenantId: row.tenantId, workUnitId: row.workUnitId, actionType: row.actionType, targetPreview: row.targetPreview ?? "{}", payloadPreview: row.payloadPreview ?? "{}", requiresApproval: row.requiresApproval ?? 1, status: row.status ?? "preview", targetHash: row.targetHash ?? "", payloadHash: row.payloadHash ?? "", createdAt: row.createdAt ?? "", expiresAt: row.expiresAt, creatorUserId: row.creatorUserId } as Awaited<ReturnType<ActionPreviewRepository["findById"]>>
      },
      async findByWorkUnitId(_ctx, wuId) {
        const results: unknown[] = []
        // Tenant scoping (red-team A-3 / out-of-band parity): only this tenant's previews.
        store.forEach((v) => {
          if (v.tenantId === _ctx.tenantId && v.workUnitId === wuId) results.push(v)
        })
        return results as Awaited<ReturnType<ActionPreviewRepository["findByWorkUnitId"]>>
      },
    }
  }
  return inMemoryActionPreviewRepo
}

export function resetInMemoryReposForTests(): void {
  inMemoryActionPreviewRepo = null
}
