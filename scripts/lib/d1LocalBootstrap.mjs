/**
 * D1 Local Bootstrap — apply manifest lanes to node:sqlite (P0-PERSIST-015)
 *
 * Deterministic, ISOLATED local bootstrap for CI proof. Uses `node:sqlite`, never
 * a developer's real local Wrangler state, never the network, never remote D1.
 * Applies each binding's ordered lane from the canonical manifest.
 */

import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { tmpdir } from "node:os"
import { KNOWN_BINDINGS } from "./d1MigrationManifest.mjs"
import { applyLaneWithLedger } from "./d1MigrationLedger.mjs"

/**
 * Apply a binding's ordered lane to an open DB through the migration ledger.
 * Returns the applied migration names.
 *
 * Goes through the ledger rather than raw-replaying the files, so a `once`
 * migration (0006) is applied exactly once and skipped on re-application. Calling
 * this twice is the idempotence proof.
 */
export function applyLane(db, manifest, binding, repoRoot, options = {}) {
  return applyLaneWithLedger(db, manifest, binding, repoRoot, options).applied
}

/** As `applyLane`, but also reports which `once` migrations were skipped. */
export function applyLaneDetailed(db, manifest, binding, repoRoot, options = {}) {
  return applyLaneWithLedger(db, manifest, binding, repoRoot, options)
}

/**
 * Bootstrap both bindings into fresh in-memory DBs (fully isolated, no disk).
 * Returns open handles `{ CONTROL_DB, TENANT_DB_DEFAULT }` and the applied plans.
 */
export function bootstrapInMemory(repoRoot, manifest) {
  const dbs = {}
  const applied = {}
  for (const binding of KNOWN_BINDINGS) {
    const db = new DatabaseSync(":memory:")
    applied[binding] = applyLane(db, manifest, binding, repoRoot)
    dbs[binding] = db
  }
  return { dbs, applied }
}

/**
 * Bootstrap into an ISOLATED temporary directory (real sqlite files), run `fn`
 * with the open handles, then delete the temp directory. Guarantees the
 * developer's normal local D1 state is never touched and temp state is removed.
 */
export function withTemporaryBootstrap(repoRoot, manifest, fn) {
  const dir = mkdtempSync(resolvePath(tmpdir(), "d1-bootstrap-"))
  const dbs = {}
  try {
    const applied = {}
    for (const binding of KNOWN_BINDINGS) {
      const db = new DatabaseSync(resolvePath(dir, `${binding}.sqlite`))
      applied[binding] = applyLane(db, manifest, binding, repoRoot)
      dbs[binding] = db
    }
    return fn({ dbs, applied, dir })
  } finally {
    for (const db of Object.values(dbs)) { try { db.close() } catch { /* already closed */ } }
    rmSync(dir, { recursive: true, force: true })
  }
}
