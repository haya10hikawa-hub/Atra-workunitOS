/**
 * Type declarations for the observational evidence adapters (P0-OPS-016).
 * The implementation is `d1EvidenceAdapters.mjs`.
 */

import type { EvidenceOperationName, EvidenceOperationStatus, EvidenceResult } from "./d1OperationalEvidence.d.mts"

/** The ONLY shape an adapter may return — nothing else is ever included. */
export interface SafeOperationEvidence {
  readonly operation: EvidenceOperationName
  readonly status: EvidenceOperationStatus
  readonly authorityDigest: string
  readonly resultDigest: string
  readonly safeCategories: readonly string[]
}

export interface AdapterOptions {
  repoRoot?: string
}

export declare const SAFE_EVIDENCE_KEYS: readonly string[]

export declare function normalizeSafeCategory(value: unknown): string

export declare function buildOperationEvidence(
  operation: EvidenceOperationName,
  input?: { status?: EvidenceOperationStatus; authorityDigest?: string; safeCategories?: string[] },
  options?: AdapterOptions,
): EvidenceResult<{ evidence: SafeOperationEvidence }>

export declare function evidenceFromMigrationPlanCheck(
  input?: { ok?: boolean; authorityDigest?: string; safeCategories?: string[] }, options?: AdapterOptions,
): EvidenceResult<{ evidence: SafeOperationEvidence }>

export declare function evidenceFromMigrationApply(
  input?: { exitCode?: number; authorityDigest?: string; safeCategories?: string[] }, options?: AdapterOptions,
): EvidenceResult<{ evidence: SafeOperationEvidence }>

export declare function evidenceFromRemoteSchemaVerification(
  result?: { ok?: boolean; failures?: string[]; authorityDigest?: string | null }, options?: AdapterOptions,
): EvidenceResult<{ evidence: SafeOperationEvidence }>

export declare function evidenceFromBootstrapApply(
  input?: { exitCode?: number; authorityDigest?: string; safeCategories?: string[] }, options?: AdapterOptions,
): EvidenceResult<{ evidence: SafeOperationEvidence }>

export declare function evidenceFromBootstrapCountsVerification(
  input?: { ok?: boolean; failures?: string[]; authorityDigest?: string }, options?: AdapterOptions,
): EvidenceResult<{ evidence: SafeOperationEvidence }>

export declare function evidenceFromWorkerPreflight(
  input?: { exitCode?: number; authorityDigest?: string; safeCategories?: string[] }, options?: AdapterOptions,
): EvidenceResult<{ evidence: SafeOperationEvidence }>

export declare function evidenceFromWorkerDeploy(
  input?: { exitCode?: number; authorityDigest?: string; safeCategories?: string[] }, options?: AdapterOptions,
): EvidenceResult<{ evidence: SafeOperationEvidence }>
