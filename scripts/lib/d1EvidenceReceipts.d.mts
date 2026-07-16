/**
 * Type declarations for the command-bound evidence receipts (P0-OPS-016 repair).
 * The implementation is `d1EvidenceReceipts.mjs`.
 *
 * Emitters take each command's REAL result objects — there is no status or
 * exit-code parameter anywhere on this surface, and timestamps come from the
 * execution boundary (`beginEvidenceOperation`), never from callers.
 */

import type { D1OperationalEvidenceRecord, EvidenceOperationRecord, EvidenceContract, EvidenceResult } from "./d1OperationalEvidence.d.mts"
import type { DeployConfigAuthority } from "./cfDeployConfigAuthority.d.mts"

export declare const SESSION_MANIFEST_BASENAME: string
export declare const SESSION_PRIVATE_KEY_BASENAME: string
export declare const SESSION_AUTHORITY_BASENAME: string

export interface EvidenceSessionManifest {
  readonly session_version: "1"
  readonly session_id: string
  readonly environment_class: "staging" | "production"
  readonly created_at: string
  readonly public_key: string
  readonly commit_sha: string
  readonly node_version: string
  readonly wrangler_version: string
  readonly migration_manifest_sha256: string
  readonly migration_plan_digest: string
  readonly schema_contract_sha256: string
  readonly expected_schema_version: string
}

export interface LoadedEvidenceSession {
  readonly sessionDir: string
  readonly manifest: EvidenceSessionManifest
  readonly contract: EvidenceContract
}

export interface ExecutionBoundary {
  readonly startedAt: string
}

/** Untrusted, runtime-validated inputs — wide types so tests can drive refusals. */
export interface EmitterInput {
  repoRoot?: string
  authority?: DeployConfigAuthority | null | unknown
  begun?: ExecutionBoundary | null
  clock?: () => Date
}

export declare function deriveMigrationPlanDigest(repoRoot: string): string | null
export declare function deriveRepositoryEvidenceFacts(repoRoot: string): EvidenceResult<{ facts: { manifestSha256: string; schemaContractSha256: string; planDigest: string; expectedSchemaVersion: string } }>

export declare function initializeEvidenceSessionAt(input?: {
  repoRoot?: string
  environmentClass?: string
  derived?: { commitSha?: string; dirtyTree?: boolean; nodeVersion?: string; wranglerVersion?: string }
}): EvidenceResult<{ sessionDir: string; sessionId: string; publicKey: string }>

export declare function loadEvidenceSession(sessionDir: string, options?: { repoRoot?: string }): EvidenceResult<{ session: LoadedEvidenceSession; privateKeyPem: string }>

export declare function deriveAuthorityEvidence(authority: unknown): EvidenceResult<{ authoritySha256: string; physicallyDistinct: true }>

export declare function readSessionReceipts(session: LoadedEvidenceSession): EvidenceResult<{ receipts: EvidenceOperationRecord[] }>

export declare function verifyReceiptRecord(receipt: unknown, context: {
  contract: EvidenceContract
  expectedSequence: number
  expectedPrevious: string | null
  sessionId: string
  publicKey: string
  commitSha: string
  previousCompletedAt: string | null
}): { ok: boolean; blocked: string[] }

export declare function beginEvidenceOperation(clock?: () => Date): ExecutionBoundary

export declare function emitMigrationPlanReceipt(sessionDir: string, input?: EmitterInput & { checkResult?: { ok?: boolean; failures?: string[] } }): EvidenceResult<{ receipt: EvidenceOperationRecord }>
export declare function emitMigrationApplyReceipt(sessionDir: string, input?: EmitterInput & { applyResult?: { completed?: boolean; appliedPlan?: unknown[] } }): EvidenceResult<{ receipt: EvidenceOperationRecord }>
export declare function emitRemoteSchemaVerificationReceipt(sessionDir: string, input?: EmitterInput & { verificationResult?: { ok?: boolean; failures?: string[]; authorityDigest?: string | null } }): EvidenceResult<{ receipt: EvidenceOperationRecord }>
export declare function emitBootstrapApplyReceipt(sessionDir: string, input?: EmitterInput & { bootstrapResult?: { committed?: boolean; canonicalSqlSha256?: string } }): EvidenceResult<{ receipt: EvidenceOperationRecord }>
export declare function emitBootstrapCountsReceipt(sessionDir: string, input?: EmitterInput & { countsResult?: { ok?: boolean; failures?: string[] } }): EvidenceResult<{ receipt: EvidenceOperationRecord }>
export declare function emitWorkerPreflightReceipt(sessionDir: string, input?: EmitterInput & { preflightResult?: { ok?: boolean; failures?: string[]; checkedArtifacts?: boolean } }): EvidenceResult<{ receipt: EvidenceOperationRecord }>
export declare function emitWorkerDeployReceipt(sessionDir: string, input?: EmitterInput & { deployResult?: { deployed?: boolean } }): EvidenceResult<{ receipt: EvidenceOperationRecord }>

export declare function assembleEvidencePackFromSession(sessionDir: string, options?: { repoRoot?: string; previousRecordSha256?: string | null }): EvidenceResult<{ path: string; record: D1OperationalEvidenceRecord }>
