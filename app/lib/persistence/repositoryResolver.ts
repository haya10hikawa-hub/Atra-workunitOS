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
import { getCloudflareD1Bindings } from "./cloudflareBindings.ts"
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

export type RepositoryResolutionResult =
  | { ok: true; bundle: TenantRepositoryBundle }
  | { ok: false; error: "persistence_disabled" | "tenant_resolution_failed" | "d1_not_configured" }

// ─── Helpers ────────────────────────────────────────────────────

function inMemoryBundle(tenantId: TenantId): TenantRepositoryBundle {
  return {
    actionPreviews: createInMemoryActionPreviewRepo(),
    approvalRecords: createInMemoryApprovalRecordRepository(),
    workUnits: createInMemoryWorkUnitRepository(),
    workUnitFeedback: createInMemoryWorkUnitFeedbackRepository(),
    integrationConnections: createInMemoryIntegrationConnectionRepository(),
    auditLogs: createInMemoryAuditLogRepository(),
    usage: createInMemoryUsageRepository(),
    ctx: { tenantId, db: null },
  }
}

function d1Bundle(tenantId: TenantId, d1Store: D1DatabaseLike, ctx?: TenantDbContext): TenantRepositoryBundle {
  return {
    actionPreviews: new D1ActionPreviewRepository(d1Store),
    approvalRecords: new D1ApprovalRecordRepository(d1Store),
    workUnits: new D1WorkUnitRepository(d1Store),
    workUnitFeedback: new D1WorkUnitFeedbackRepository(d1Store),
    integrationConnections: new D1IntegrationConnectionRepository(d1Store),
    auditLogs: new D1AuditLogRepository(d1Store),
    usage: new D1UsageRepository(d1Store),
    ctx: ctx ?? { tenantId, db: null },
  }
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
      if (options.resolver) {
        try {
          const ctx = await options.resolver.resolveTenantDb(tenantId)
          const d1Store = (options.d1Binding ?? ctx.db) as D1DatabaseLike | null
          if (!d1Store) return { ok: false, error: "d1_not_configured" }
          return { ok: true, bundle: d1Bundle(tenantId, d1Store, ctx) }
        } catch {
          return { ok: false, error: "tenant_resolution_failed" }
        }
      }
      // Preserve current TENANT_DB_DEFAULT behavior — Issue #130 still owns real
      // per-tenant DB resolution — but the binding is genuine and validated.
      return { ok: true, bundle: d1Bundle(tenantId, options.d1Binding ?? p.TENANT_DB_DEFAULT) }
    }
    if (p.mode === "in_memory") return { ok: true, bundle: inMemoryBundle(tenantId) }
    return { ok: false, error: "persistence_disabled" }
  }

  // ── Request-scoped Cloudflare runtime env takes precedence ──
  //
  // When a Cloudflare runtime env is present (production / OpenNext worker), the
  // persistence mode AND the D1 bindings come from the SAME validated snapshot.
  // process.env can never override the active request env, and in-memory
  // repositories are never returned here.
  if (options.runtimeEnv) {
    const validated = validateCloudflareRuntimeEnv(options.runtimeEnv)
    if (!validated.ok) {
      // Runtime env present but missing/malformed binding or var → fail closed.
      return { ok: false, error: "d1_not_configured" }
    }

    // Mode is authoritatively "d1" from the validated snapshot.
    if (options.resolver) {
      try {
        const ctx = await options.resolver.resolveTenantDb(tenantId)
        const d1Store = (options.d1Binding ?? ctx.db) as D1DatabaseLike | null
        if (!d1Store) return { ok: false, error: "d1_not_configured" }
        return { ok: true, bundle: d1Bundle(tenantId, d1Store, ctx) }
      } catch {
        return { ok: false, error: "tenant_resolution_failed" }
      }
    }

    // Preserve current TENANT_DB_DEFAULT behavior — Issue #130 still owns real
    // per-tenant DB resolution — but the binding is now genuine and validated.
    const d1Store = options.d1Binding ?? validated.env.TENANT_DB_DEFAULT
    return { ok: true, bundle: d1Bundle(tenantId, d1Store) }
  }

  // ── No runtime env → local/dev config via process.env ──
  const config = resolvePersistenceConfig(options.env)

  switch (config.mode) {
    case "in_memory": {
      if (config.isProduction) return { ok: false, error: "persistence_disabled" }
      return { ok: true, bundle: inMemoryBundle(tenantId) }
    }

    case "d1": {
      if (options.resolver) {
        try {
          const ctx = await options.resolver.resolveTenantDb(tenantId)
          const d1Store = (options.d1Binding ?? ctx.db) as D1DatabaseLike | null
          if (!d1Store) return { ok: false, error: "d1_not_configured" }
          return { ok: true, bundle: d1Bundle(tenantId, d1Store, ctx) }
        } catch {
          return { ok: false, error: "tenant_resolution_failed" }
        }
      }
      const d1Store = options.d1Binding ?? resolveRuntimeBinding(options)
      if (!d1Store) return { ok: false, error: "d1_not_configured" }
      return { ok: true, bundle: d1Bundle(tenantId, d1Store) }
    }

    case "disabled":
    default:
      return { ok: false, error: "persistence_disabled" }
  }
}

function resolveRuntimeBinding(options: { runtimeEnv?: AppEnv }): D1DatabaseLike | null {
  if (!options.runtimeEnv) return null
  return getCloudflareD1Bindings(options.runtimeEnv).tenantDefaultDb ?? null
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
