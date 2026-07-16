/** Type declarations for cf:d1:evidence (P0-PERSIST-015). */
import type { Binding, MigrationApplyMode } from "./lib/d1MigrationManifest.d.mts"

export interface EvidenceMigration { sequence: number; name: string; kind: string; apply: MigrationApplyMode }
export interface Evidence {
  patchId: string
  issue: string
  commitSha: string
  versions: { node: string; wrangler: string; opennextCloudflare: string }
  manifestDigest: string
  schemaContractDigest: string
  migrations: Record<Binding, EvidenceMigration[]>
  localBootstrap: {
    ok: boolean
    appliedCounts: Record<Binding, number>
    schemaVerified: Record<Binding, boolean>
    fixtureSeeded: boolean
  }
  idempotence: { ok: boolean; method: string }
  tests: { total: number; passed: number }
  timestamp: string
  disclaimer: string
}

export declare const EVIDENCE_DIR: string
export declare const EVIDENCE_PATH: string
export declare function assertEvidenceSafe(evidence: unknown): { ok: boolean; violations: string[] }
export declare function buildEvidence(repoRoot?: string, options?: { commitSha?: string; tests?: { total: number; passed: number }; timestamp?: string }): Evidence
