/**
 * Type declarations for cf:d1:evidence:verify (P0-OPS-016, offline-only).
 * The implementation is `cf-d1-evidence-verify.mjs`.
 */

export interface EvidenceVerifyResult {
  ok: boolean
  /** Safe categories only — never evidence contents, values, IDs, or names. */
  categories: string[]
}

/**
 * Verify one evidence pack from an explicitly supplied path, entirely offline.
 * `ok: true` means exactly `["evidence_valid"]`. When `sessionDir` is supplied,
 * the pack is additionally anchored to that initialized session's manifest.
 */
export declare function verifyEvidencePackAtPath(path: string, options?: { repoRoot?: string; sessionDir?: string | null }): EvidenceVerifyResult
