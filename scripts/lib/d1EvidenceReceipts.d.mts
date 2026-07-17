/**
 * Type declarations for the evidence session + safe receipt helpers (P0-OPS-016
 * second repair). The implementation is `d1EvidenceReceipts.mjs`.
 *
 * There is deliberately NO result-to-signed-receipt export here: receipt creation
 * and signing are command-local. This surface exposes only non-authorizing helpers —
 * session initialization (which derives repository facts internally and accepts no
 * commit/dirty-tree claim), manifest loading (never the private key), authority
 * derivation + binding, unsigned canonical assembly, signed-receipt verification +
 * persistence, and pack assembly from already-verified receipts.
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

export type GitRunner = (repoRoot: string, args: string[]) => string | null

export declare function deriveGitFacts(repoRoot: string, runGit?: GitRunner): EvidenceResult<{ commitSha: string; dirtyTree: false }>
export declare function deriveWranglerVersion(repoRoot: string): string | null
export declare function deriveMigrationPlanDigest(repoRoot: string): string | null
export declare function deriveRepositoryEvidenceFacts(repoRoot: string): EvidenceResult<{ facts: { manifestSha256: string; schemaContractSha256: string; planDigest: string; expectedSchemaVersion: string } }>

/** Production initializer: accepts ONLY repoRoot + environmentClass; derives the rest. */
export declare function initializeEvidenceSession(input?: {
  repoRoot?: string
  environmentClass?: string
}): EvidenceResult<{ sessionDir: string; sessionId: string; publicKey: string }>

export declare function loadEvidenceSessionManifest(sessionDir: string, options?: { repoRoot?: string }): EvidenceResult<{ session: LoadedEvidenceSession }>

export declare function deriveAuthorityEvidence(authority: unknown): EvidenceResult<{ authoritySha256: string; physicallyDistinct: true }>
export declare function bindSessionAuthority(sessionDir: string, authoritySha256: string): EvidenceResult<{ authoritySha256: string }>

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

/**
 * NON-signing command setup: validated session, derived+bound authority digest,
 * verified existing receipts, and the emitting command's producer-source digest.
 */
export declare function openCommandReceiptContext(sessionDir: string, options?: {
  repoRoot?: string
  authority?: DeployConfigAuthority | null | unknown
  producer?: string
}): EvidenceResult<{ session: LoadedEvidenceSession; existingReceipts: EvidenceOperationRecord[]; authoritySha256: string; producerSourceSha256: string }>

/** An UNSIGNED receipt is MUTABLE — the command sets `receipt_signature` before persisting. */
export type UnsignedReceipt = { -readonly [K in keyof EvidenceOperationRecord]: EvidenceOperationRecord[K] }

/** Pure canonical assembly of an UNSIGNED receipt (`receipt_signature: ""`). */
export declare function assembleUnsignedReceipt(session: LoadedEvidenceSession, existingReceipts: EvidenceOperationRecord[], input?: {
  operation?: string
  producer?: string
  authoritySha256?: string
  producerSourceSha256?: string
  startedAt?: string
  completedAt?: string
  status?: string
  proof?: Record<string, string>
  safeCategories?: string[]
}): EvidenceResult<{ receipt: UnsignedReceipt }>

/** Verify an already command-signed receipt and persist it 0600/exclusive. */
export declare function persistSignedReceipt(session: LoadedEvidenceSession, receipt: unknown): EvidenceResult<{ receipt: EvidenceOperationRecord }>

export declare function assembleEvidencePackFromSession(sessionDir: string, options?: { repoRoot?: string; previousRecordSha256?: string | null }): EvidenceResult<{ path: string; record: D1OperationalEvidenceRecord }>
