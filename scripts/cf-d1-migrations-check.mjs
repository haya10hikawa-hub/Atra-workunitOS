#!/usr/bin/env node
/**
 * cf:d1:migrations:check (P0-PERSIST-015)
 *
 * Validates the migration manifest, migration paths, pinned SHA-256 digests,
 * target lanes, and SQL-safety rules. Performs NO database access, NO network,
 * NO SQL execution. Emits only safe category-level codes (never database IDs,
 * secrets, seed values, or SQL contents).
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, validateManifest, scanMigrationSqlSafety } from "./lib/d1MigrationManifest.mjs"
import { loadSchemaContract } from "./lib/d1SchemaContract.mjs"
import { loadValidatedDeployConfigAuthority } from "./lib/cfDeployConfigAuthority.mjs"
import { beginEvidenceOperation, emitMigrationPlanReceipt } from "./lib/d1EvidenceReceipts.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export function runCheck(repoRoot = REPO_ROOT) {
  const failures = []
  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) return { ok: false, failures: [loaded.error] }
  const structural = validateManifest(loaded.manifest, repoRoot)
  failures.push(...structural.failures)
  const sql = scanMigrationSqlSafety(repoRoot, loaded.manifest)
  failures.push(...sql.failures)
  const contract = loadSchemaContract(repoRoot)
  if (!contract.ok) failures.push(contract.error)
  return { ok: failures.length === 0, failures }
}

function parseConfigArg(argv) {
  const index = argv.indexOf("--config")
  return index >= 0 && argv[index + 1] ? resolve(argv[index + 1]) : undefined
}

function main() {
  // Evidence session (optional): the operator exports CF_D1_EVIDENCE_SESSION_DIR
  // and supplies --config so the plan receipt is bound to the SAME validated
  // deploy-config authority the later remote commands will use. The receipt is
  // emitted from THIS command's real result path, after the check completed.
  const evidenceSessionDir = process.env.CF_D1_EVIDENCE_SESSION_DIR
  const evidenceBegun = evidenceSessionDir ? beginEvidenceOperation() : null

  const result = runCheck()

  if (evidenceSessionDir) {
    const configPath = parseConfigArg(process.argv.slice(2))
    const authority = loadValidatedDeployConfigAuthority({ configPath, repoRoot: REPO_ROOT, allowPlaceholderIds: false })
    const receipt = emitMigrationPlanReceipt(evidenceSessionDir, {
      repoRoot: REPO_ROOT, authority: authority.ok ? authority.authority : null,
      begun: evidenceBegun, checkResult: result,
    })
    if (receipt.ok) console.log("evidence: receipt recorded (migration_plan_verified)")
    else console.error(`evidence: receipt FAILED — ${receipt.blocked.join(", ")}`)
  }

  if (result.ok) {
    console.log("cf:d1:migrations:check: OK (manifest valid, digests pinned, lanes safe, SQL is pure DDL).")
    process.exit(0)
  }
  console.error(`cf:d1:migrations:check: FAIL — ${result.failures.join(", ")}`)
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
