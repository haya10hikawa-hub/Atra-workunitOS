/** Type declarations for cf:d1:bootstrap:local (P0-PERSIST-015). */
import type { Binding } from "./lib/d1MigrationManifest.d.mts"
import type { VerifyResult } from "./lib/d1SchemaContract.d.mts"

export interface BootstrapLocalResult {
  ok: boolean
  stage?: "check"
  failures?: string[]
  applied: Record<Binding, string[]>
  verify: Record<Binding, VerifyResult>
  idempotent: boolean
  seedRowCount: number | null
  seededLogicalIds: { tenantId: string; userId: string } | null
}

export declare function runBootstrapLocal(repoRoot?: string, options?: { seed?: boolean }): BootstrapLocalResult
