/**
 * Type declarations for cf:d1:evidence:verify (P0-OPS-016, offline-only).
 * The implementation is `cf-d1-evidence-verify.mjs`.
 */

export interface EvidenceVerifyResult {
  ok: boolean
  /** Safe categories only — never evidence contents, values, IDs, or names. */
  categories: string[]
}

export type VerifyGitRunner = (repoRoot: string, args: string[]) => string | null

/**
 * Verify one evidence pack from an explicitly supplied path. No network or provider
 * access; the only process spawned is read-only `git` for the local-checkout binding
 * (HEAD + clean tree at the recorded commit). `ok: true` means exactly
 * `["evidence_valid"]`. When `sessionDir` is supplied, the pack is additionally
 * anchored to that initialized session's manifest. `runGit` overrides the local git
 * derivation for tests; production uses real read-only git.
 */
export declare function verifyEvidencePackAtPath(path: string, options?: { repoRoot?: string; sessionDir?: string | null; runGit?: VerifyGitRunner }): EvidenceVerifyResult
