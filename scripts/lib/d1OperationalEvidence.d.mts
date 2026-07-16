/**
 * Type declarations for the D1 operational-evidence contract, recorder, and
 * safety scanner (P0-OPS-016). The implementation is `d1OperationalEvidence.mjs`.
 */

export type EvidenceEnvironmentClass = "staging" | "production"
export type EvidenceOperationStatus = "success" | "failed"

export type EvidenceOperationName =
  | "migration_plan_verified"
  | "migration_apply_completed"
  | "remote_schema_verified"
  | "bootstrap_apply_completed"
  | "bootstrap_counts_verified"
  | "worker_preflight_completed"
  | "worker_deploy_completed"

export interface EvidenceContractLimits {
  readonly max_file_bytes: number
  readonly max_operations: number
  readonly max_safe_categories_per_operation: number
  readonly max_safe_category_length: number
  readonly max_string_length: number
}

export interface EvidenceContract {
  readonly contract: "d1-operational-evidence"
  readonly contract_version: "1"
  readonly environment_classes: readonly EvidenceEnvironmentClass[]
  readonly statuses: readonly EvidenceOperationStatus[]
  readonly operations: readonly EvidenceOperationName[]
  readonly required_successful_sequence: readonly EvidenceOperationName[]
  readonly hard_prerequisites: Readonly<Record<string, readonly EvidenceOperationName[]>>
  readonly producers: readonly string[]
  readonly producers_by_operation: Readonly<Record<string, string>>
  readonly producer_sources: Readonly<Record<string, string>>
  readonly safe_categories_by_operation: Readonly<Record<string, readonly string[]>>
  readonly proof_fields_by_operation: Readonly<Record<string, readonly string[]>>
  readonly proof_category_values: Readonly<Record<string, readonly string[]>>
  readonly fields: Readonly<Record<string, readonly string[]>>
  readonly limits: EvidenceContractLimits
}

/** Every operation entry is a COMMAND-BOUND, session-signed receipt. */
export interface EvidenceOperationRecord {
  readonly sequence: number
  readonly operation: EvidenceOperationName
  readonly status: EvidenceOperationStatus
  readonly started_at: string
  readonly completed_at: string
  readonly authority_sha256: string
  readonly session_id: string
  readonly repository_commit_sha: string
  readonly producer: string
  readonly producer_source_sha256: string
  readonly input_digest: string
  readonly result_digest: string
  readonly proof: Readonly<Record<string, string>>
  readonly safe_categories: readonly string[]
  readonly previous_receipt_sha256: string | null
  readonly receipt_sha256: string
  readonly receipt_signature: string
}

export interface D1OperationalEvidenceRecord {
  readonly evidence_version: "1"
  readonly evidence_id: string
  readonly environment_class: EvidenceEnvironmentClass
  readonly created_at: string
  readonly session: { readonly session_id: string; readonly public_key: string }
  readonly repository: { readonly commit_sha: string; readonly dirty_tree: false }
  readonly toolchain: { readonly node_version: string; readonly wrangler_version: string }
  readonly authority: { readonly sha256: string; readonly control_tenant_physically_distinct: true }
  readonly contracts: {
    readonly migration_manifest_sha256: string
    readonly migration_plan_digest: string
    readonly schema_contract_sha256: string
    readonly expected_schema_version: string
  }
  readonly operations: readonly EvidenceOperationRecord[]
  readonly chain: { readonly previous_record_sha256: string | null; readonly evidence_sha256: string }
}

/** Opaque recorder session (internal fields are implementation detail). */
export interface EvidenceSession {
  readonly finalized: boolean
}

export interface CreateEvidenceSessionInput {
  repoRoot: string
  environmentClass: EvidenceEnvironmentClass
  commitSha: string
  dirtyTree: false
  nodeVersion: string
  wranglerVersion: string
  authoritySha256: string
  controlTenantPhysicallyDistinct: true
  migrationManifestSha256: string
  migrationPlanDigest: string
  schemaContractSha256: string
  expectedSchemaVersion: string
  previousRecordSha256?: string | null
  sessionId: string
  sessionPublicKey: string
  now?: () => Date
}

/**
 * LOW-LEVEL assembler input: a full command-issued receipt. Inputs are UNTRUSTED
 * and validated at runtime (digest recomputed, signature verified against the
 * session public key) — the declared types are deliberately wide so tests can
 * exercise the fail-closed paths.
 */
export interface RecordEvidenceOperationInput {
  operation: EvidenceOperationName | string
  status: EvidenceOperationStatus | string
  startedAt: string
  completedAt: string
  authoritySha256: string
  resultDigest: string
  safeCategories?: string[] | unknown
  producer: string
  producerSourceSha256: string
  inputDigest: string
  proof: Record<string, string> | unknown
  previousReceiptSha256: string | null
  receiptSha256: string
  receiptSignature: string
}

export type EvidenceResult<T> = ({ ok: true } & T) | { ok: false; blocked: string[] }

export declare const EVIDENCE_CONTRACT_RELPATH: string
export declare const EVIDENCE_DIRNAME: string
/** Strict shared formats (session ids, digests, signatures, timestamps, …). */
export declare const EVIDENCE_FORMATS: Readonly<Record<string, RegExp>>

export declare function sha256Hex(value: string | Uint8Array): string
/** Receipt digest: canonical bytes of the receipt minus its digest + signature. */
export declare function computeReceiptDigest(receipt: unknown): string
/** Sign a receipt digest with the session private key (PKCS8 PEM) → 128-hex. */
export declare function signReceiptDigest(privateKeyPem: string, receiptSha256: string): string
/** Verify a receipt signature against the session public key (64-hex raw Ed25519). */
export declare function verifyReceiptSignature(publicKeyHex: string, receiptSha256: string, signatureHex: string): boolean
export declare function deepFreezeEvidence<T>(value: T): Readonly<T>
export declare function isStrictUtcIso(value: unknown): boolean
export declare function loadEvidenceContract(repoRoot: string | undefined): EvidenceResult<{ contract: EvidenceContract }>
export declare function allowedEvidenceKeys(contract: EvidenceContract): Set<string>
export declare function scanSensitiveEvidence(value: unknown, contract: EvidenceContract): string[]
export declare function canonicalSerialize(value: unknown): string
export declare function computeEvidenceDigest(record: unknown): string
export declare function validateEvidenceRecord(record: unknown, contract: EvidenceContract): { ok: boolean; failures: string[] }
export declare function validateOperationOrdering(operations: unknown, contract: EvidenceContract): { ok: boolean; failures: string[] }
/** Inputs are UNTRUSTED and runtime-validated; the declared type is deliberately wide. */
export declare function createEvidenceSession(input?: Partial<Record<keyof CreateEvidenceSessionInput, unknown>>): EvidenceResult<{ session: EvidenceSession }>
export declare function recordEvidenceOperation(session: EvidenceSession, input?: Partial<RecordEvidenceOperationInput>): EvidenceResult<{ sequence: number }>
export declare function finalizeEvidenceSession(session: EvidenceSession): EvidenceResult<{ record: D1OperationalEvidenceRecord }>
export declare function writeEvidencePack(record: D1OperationalEvidenceRecord, options?: { repoRoot?: string }): EvidenceResult<{ path: string }>
