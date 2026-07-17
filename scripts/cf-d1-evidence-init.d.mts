/**
 * Type declarations for cf:d1:evidence:init (P0-OPS-016, offline-only). The
 * implementation is `cf-d1-evidence-init.mjs`.
 *
 * The CLI has no exported API: it derives repository facts and initializes a session
 * entirely through the library (`initializeEvidenceSession`), which accepts no
 * commit or dirty-tree claim. Git-facts derivation lives in the library, not here.
 */

export {}
