/**
 * Type declarations for cf:d1:evidence:init (P0-OPS-016 repair, offline-only).
 * The implementation is `cf-d1-evidence-init.mjs`.
 */

export type GitFactsResult =
  | { ok: true; commitSha: string; dirtyTree: false }
  | { ok: false; blocked: string[] }

/**
 * Derive HEAD + worktree cleanliness via read-only `git` — never accepted from a
 * caller. Fails closed when HEAD is unresolvable or the tree is dirty.
 */
export declare function deriveGitFacts(runGit?: (args: string[]) => string | null): GitFactsResult

/** The pinned Wrangler version from the installed package — derived, not claimed. */
export declare function deriveWranglerVersion(repoRoot?: string): string | null
