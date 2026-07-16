#!/usr/bin/env node
/**
 * cf:d1:schema:verify:local (P0-PERSIST-015)
 *
 * Bootstraps BOTH lanes into fresh, ISOLATED temporary local SQLite databases
 * (node:sqlite), then verifies each schema against the committed
 * migrations/schema-contract.json. Reads only schema metadata (never row data),
 * performs NO remote access, and deletes the temporary state afterwards.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
import { loadSchemaContract, verifyDatabase } from "./lib/d1SchemaContract.mjs"
import { withTemporaryBootstrap } from "./lib/d1LocalBootstrap.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export function runVerifyLocal(repoRoot = REPO_ROOT) {
  const manifest = loadManifest(repoRoot)
  if (!manifest.ok) return { ok: false, error: manifest.error }
  const contract = loadSchemaContract(repoRoot)
  if (!contract.ok) return { ok: false, error: contract.error }
  return withTemporaryBootstrap(repoRoot, manifest.manifest, ({ dbs }) => {
    const results = {}
    let ok = true
    for (const binding of KNOWN_BINDINGS) {
      const r = verifyDatabase(dbs[binding], contract.contract.databases[binding])
      results[binding] = r
      if (!r.ok) ok = false
    }
    return { ok, results }
  })
}

function main() {
  const result = runVerifyLocal()
  if (result.error) { console.error(`cf:d1:schema:verify:local: FAIL — ${result.error}`); process.exit(1) }
  for (const binding of KNOWN_BINDINGS) {
    const r = result.results[binding]
    if (r.ok) console.log(`cf:d1:schema:verify:local: ${binding} OK`)
    else console.error(`cf:d1:schema:verify:local: ${binding} FAIL — ${r.failures.map((f) => `${f.category}:${f.table || ""}${f.name ? ":" + f.name : ""}`).join(", ")}`)
  }
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
