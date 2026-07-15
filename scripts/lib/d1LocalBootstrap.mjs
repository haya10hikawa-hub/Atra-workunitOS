/**
 * D1 Local Bootstrap — apply manifest lanes to node:sqlite (P0-PERSIST-015)
 *
 * Deterministic, ISOLATED local bootstrap for CI proof. Uses `node:sqlite`, never
 * a developer's real local Wrangler state, never the network, never remote D1.
 * Applies each binding's ordered lane from the canonical manifest.
 */

import { DatabaseSync } from "node:sqlite"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { tmpdir } from "node:os"
import { buildPlan, KNOWN_BINDINGS } from "./d1MigrationManifest.mjs"

/** Apply a binding's ordered lane to an open DB. Returns applied migration names. */
export function applyLane(db, manifest, binding, repoRoot) {
  const applied = []
  for (const step of buildPlan(manifest, binding)) {
    db.exec(readFileSync(resolvePath(repoRoot, step.path), "utf8"))
    applied.push(step.name)
  }
  return applied
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
