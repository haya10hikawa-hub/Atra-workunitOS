#!/usr/bin/env node
/**
 * cf:d1:evidence (P0-PERSIST-015) — safe operational evidence artifact.
 *
 * Generated AFTER local bootstrap + schema verification. Contains ONLY:
 * patch id, git commit SHA, tool versions, manifest digest, migration filenames +
 * logical versions, schema-contract digest, local bootstrap result, idempotence
 * result, test counts, timestamp.
 *
 * It must NEVER contain database IDs, tenant/user/email/provider-subject values,
 * secrets, SQL contents, filesystem paths outside the repository, or row data —
 * `assertEvidenceSafe()` enforces this and is exercised by the test suite.
 *
 * Suitable for attachment to the FUTURE authorized remote-proof review (Issue #155).
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { loadManifest, manifestDigest, buildAllPlans, KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
import { loadSchemaContract, schemaContractDigest } from "./lib/d1SchemaContract.mjs"
import { runBootstrapLocal } from "./cf-d1-bootstrap-local.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const EVIDENCE_DIR = resolve(REPO_ROOT, ".d1-evidence")
export const EVIDENCE_PATH = resolve(EVIDENCE_DIR, "P0-PERSIST-015-evidence.json")

function pkgVersion(rel) {
  try { return JSON.parse(readFileSync(resolve(REPO_ROOT, rel), "utf8")).version } catch { return "unknown" }
}

function gitSha(repoRoot = REPO_ROOT) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" })
  return r.status === 0 ? r.stdout.trim() : "unknown"
}

/**
 * Safety guard: the evidence must disclose nothing sensitive. Returns
 * `{ ok, violations }` with safe category codes.
 */
export function assertEvidenceSafe(evidence) {
  const violations = []
  const text = JSON.stringify(evidence)
  // A UUID anywhere would be a database id.
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) violations.push("contains_uuid_database_id")
  // Any email-shaped value would be an identity.
  if (/[^\s"@]+@[^\s"@]+\.[^\s"@]+/.test(text)) violations.push("contains_email_identity")
  // Known local fixture identity values must never be exported.
  for (const marker of ["local-dev-tenant", "local-dev-user", "local-dev-subject", "local-dev-identity", "local-dev-membership"]) {
    if (text.includes(marker)) violations.push("contains_identity_value")
  }
  // SQL contents.
  if (/\b(create\s+table|insert\s+into|select\s+.*\bfrom\b)/i.test(text)) violations.push("contains_sql")
  // Absolute filesystem paths (outside-repo disclosure).
  if (/"[^"]*\/(Users|home|var|tmp|private)\//.test(text)) violations.push("contains_absolute_path")
  return { ok: violations.length === 0, violations }
}

/** Run the focused D1 migration/schema suites and return `{ total, passed }`. */
function runFocusedTests(repoRoot = REPO_ROOT) {
  const r = spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--disable-warning=ExperimentalWarning", "--test", "--experimental-strip-types",
      "tests/d1migrationManifest.test.mts", "tests/d1schemaContract.test.mts", "tests/d1migrationBootstrap.test.mts"],
    { cwd: repoRoot, encoding: "utf8" },
  )
  const out = `${r.stdout || ""}`
  const total = Number((out.match(/^# tests (\d+)$/m) || [])[1] ?? 0)
  const passed = Number((out.match(/^# pass (\d+)$/m) || [])[1] ?? 0)
  return { total, passed }
}

/** Build the evidence object (pure aside from bootstrap/version/git reads). */
export function buildEvidence(repoRoot = REPO_ROOT, options = {}) {
  const manifest = loadManifest(repoRoot).manifest
  const contract = loadSchemaContract(repoRoot).contract
  const bootstrap = runBootstrapLocal(repoRoot, { seed: true })
  const plans = buildAllPlans(manifest)

  const migrations = {}
  for (const binding of KNOWN_BINDINGS) {
    // Filenames + logical versions ONLY (no paths, no SQL, no IDs).
    migrations[binding] = plans[binding].map((s) => ({ sequence: s.sequence, name: s.name, kind: s.kind, apply: s.apply }))
  }

  return {
    patchId: "P0-PERSIST-015",
    issue: "155",
    commitSha: options.commitSha ?? gitSha(repoRoot),
    versions: {
      node: process.version,
      wrangler: pkgVersion("node_modules/wrangler/package.json"),
      opennextCloudflare: pkgVersion("node_modules/@opennextjs/cloudflare/package.json"),
    },
    manifestDigest: manifestDigest(manifest),
    schemaContractDigest: schemaContractDigest(contract),
    migrations,
    localBootstrap: {
      ok: bootstrap.ok === true,
      appliedCounts: Object.fromEntries(KNOWN_BINDINGS.map((b) => [b, (bootstrap.applied?.[b] ?? []).length])),
      schemaVerified: Object.fromEntries(KNOWN_BINDINGS.map((b) => [b, bootstrap.verify?.[b]?.ok === true])),
      fixtureSeeded: bootstrap.seedRowCount === 1,
    },
    idempotence: { ok: bootstrap.idempotent === true, method: "schema_signature_equivalence_after_second_lane_application" },
    tests: options.tests ?? runFocusedTests(repoRoot),
    timestamp: options.timestamp ?? new Date().toISOString(),
    disclaimer: "Local reproducibility proof only. FakeD1 and deploy dry-run are NOT production-readiness proof. Issue #155 remains OPEN until authorized remote execution evidence is reviewed.",
  }
}

function main() {
  const evidence = buildEvidence()
  const safety = assertEvidenceSafe(evidence)
  if (!safety.ok) {
    console.error(`cf:d1:evidence: REFUSING to write unsafe evidence — ${safety.violations.join(", ")}`)
    process.exit(1)
  }
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
  console.log(`cf:d1:evidence: wrote .d1-evidence/P0-PERSIST-015-evidence.json (bootstrap ok=${evidence.localBootstrap.ok}, idempotent=${evidence.idempotence.ok}, tests ${evidence.tests.passed}/${evidence.tests.total}).`)
  process.exit(evidence.localBootstrap.ok && evidence.idempotence.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
