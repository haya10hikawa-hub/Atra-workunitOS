#!/usr/bin/env node
/**
 * cf:d1:migrations:plan (P0-PERSIST-015)
 *
 * Prints the deterministic per-binding migration plan: binding name, migration
 * filenames, logical sequence, kind, and idempotence — SAFE fields only. NEVER
 * prints real database IDs, secrets, or SQL contents. Performs NO SQL execution
 * and NO database/network access.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, validateManifest, buildAllPlans, KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** Build safe, printable plan lines (no IDs, no SQL). */
export function buildPlanReport(repoRoot = REPO_ROOT) {
  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) return { ok: false, error: loaded.error }
  const validation = validateManifest(loaded.manifest, repoRoot)
  if (!validation.ok) return { ok: false, error: "manifest_invalid", failures: validation.failures }
  const plans = buildAllPlans(loaded.manifest)
  const lines = []
  for (const binding of KNOWN_BINDINGS) {
    lines.push(`${binding}:`)
    for (const step of plans[binding]) {
      lines.push(`  [${step.sequence}] ${step.name}  (kind=${step.kind}, idempotent=${step.idempotent})`)
    }
  }
  return { ok: true, lines, plans }
}

function main() {
  const report = buildPlanReport()
  if (!report.ok) {
    console.error(`cf:d1:migrations:plan: FAIL — ${report.error}${report.failures ? " (" + report.failures.join(", ") + ")" : ""}`)
    process.exit(1)
  }
  console.log("cf:d1:migrations:plan (safe — no database IDs, no SQL):")
  for (const line of report.lines) console.log(line)
  process.exit(0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
