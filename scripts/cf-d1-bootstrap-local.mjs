#!/usr/bin/env node
/**
 * cf:d1:bootstrap:local (P0-PERSIST-015)
 *
 * Full LOCAL reproducibility proof, fully ISOLATED and offline:
 *   1. validate the manifest (check);
 *   2. bootstrap BOTH lanes into fresh temporary local SQLite DBs (node:sqlite);
 *   3. verify both schemas against the committed contract;
 *   4. prove idempotence — re-apply each lane and confirm the schema signature is
 *      unchanged;
 *   5. ONLY after schema verification, idempotently seed the LOCAL/TEST-only
 *      control-registry fixture (repeated seeding must not corrupt);
 *   6. delete the temporary state.
 *
 * NO remote access, NO network, NO real database IDs, NO secrets. Cannot reuse a
 * developer's normal local D1 state (a private OS temp dir is used).
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
import { loadSchemaContract, verifyDatabase, schemaSignature } from "./lib/d1SchemaContract.mjs"
import { withTemporaryBootstrap, applyLane } from "./lib/d1LocalBootstrap.mjs"
import { seedLocalControlFixture } from "./lib/d1BootstrapFixture.mjs"
import { runCheck } from "./cf-d1-migrations-check.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export function runBootstrapLocal(repoRoot = REPO_ROOT, options = {}) {
  const { seed = true } = options
  const check = runCheck(repoRoot)
  if (!check.ok) return { ok: false, stage: "check", failures: check.failures }
  const manifest = loadManifest(repoRoot).manifest
  const contract = loadSchemaContract(repoRoot).contract

  return withTemporaryBootstrap(repoRoot, manifest, ({ dbs, applied }) => {
    // Schema verification (post-migration).
    const verify = {}
    let verifyOk = true
    for (const binding of KNOWN_BINDINGS) {
      verify[binding] = verifyDatabase(dbs[binding], contract.databases[binding])
      if (!verify[binding].ok) verifyOk = false
    }

    // Idempotence: capture signature, RE-APPLY each lane, re-capture, compare.
    const sigBefore = {}
    for (const binding of KNOWN_BINDINGS) sigBefore[binding] = schemaSignature(dbs[binding])
    for (const binding of KNOWN_BINDINGS) applyLane(dbs[binding], manifest, binding, repoRoot)
    const sigAfter = {}
    for (const binding of KNOWN_BINDINGS) sigAfter[binding] = schemaSignature(dbs[binding])
    const idempotent = KNOWN_BINDINGS.every((b) => sigBefore[b] === sigAfter[b])

    // Fixture seeding ONLY after schema verification; idempotent (seed twice).
    let seeded = null
    if (seed && verifyOk) {
      seeded = seedLocalControlFixture(dbs.CONTROL_DB)
      seedLocalControlFixture(dbs.CONTROL_DB) // repeat must not corrupt
    }
    const seedRowCount = seed && verifyOk
      ? dbs.CONTROL_DB.prepare("SELECT COUNT(*) AS c FROM tenants").get().c
      : null

    return {
      ok: verifyOk && idempotent && (!seed || seedRowCount === 1),
      applied,
      verify,
      idempotent,
      seedRowCount,
      seededLogicalIds: seeded ? { tenantId: seeded.tenantId, userId: seeded.userId } : null,
    }
  })
}

function main() {
  const result = runBootstrapLocal()
  if (result.stage === "check") {
    console.error(`cf:d1:bootstrap:local: FAIL at check — ${result.failures.join(", ")}`)
    process.exit(1)
  }
  for (const binding of KNOWN_BINDINGS) {
    console.log(`cf:d1:bootstrap:local: ${binding} applied [${result.applied[binding].join(", ")}] → schema ${result.verify[binding].ok ? "OK" : "FAIL"}`)
  }
  console.log(`cf:d1:bootstrap:local: idempotent=${result.idempotent}; fixture rows (tenants)=${result.seedRowCount}`)
  if (result.ok) { console.log("cf:d1:bootstrap:local: OK (fresh bootstrap + idempotent re-apply + local fixture)."); process.exit(0) }
  console.error("cf:d1:bootstrap:local: FAIL")
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
