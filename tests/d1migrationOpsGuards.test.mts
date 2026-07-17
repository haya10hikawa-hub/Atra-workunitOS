/**
 * P0-PERSIST-015 — architecture guards for D1 migration operations (Issue #155).
 *
 * Source + contract scans (comment-stripped) that fail if a safety boundary of the
 * reproducible, operator-gated migration workflow regresses.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, validateManifest, scanMigrationSqlSafety } from "../scripts/lib/d1MigrationManifest.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/([^:])\/\/.*$/gm, "$1").replace(/^\s*\/\/.*$/gm, "")
}
const read = (p: string) => stripComments(readFileSync(resolve(REPO_ROOT, p), "utf8"))
const readRaw = (p: string) => readFileSync(resolve(REPO_ROOT, p), "utf8")
const scriptFiles = () => [
  ...readdirSync(resolve(REPO_ROOT, "scripts")).filter((f) => f.endsWith(".mjs")).map((f) => `scripts/${f}`),
  ...readdirSync(resolve(REPO_ROOT, "scripts/lib")).filter((f) => f.endsWith(".mjs")).map((f) => `scripts/lib/${f}`),
]

const APPLY = "scripts/cf-d1-migrations-apply.mjs"
const VERIFY_REMOTE = "scripts/cf-d1-schema-verify-remote.mjs"
const BOOTSTRAP_LOCAL = "scripts/cf-d1-bootstrap-local.mjs"
const BOOTSTRAP_PREPARE = "scripts/cf-d1-bootstrap-prepare.mjs"
const DEPLOY = "scripts/cloudflare-deploy.mjs"

// ─── 1 + 2. the manifest is the single source of truth ──────────

test("GUARD: no script hardcodes a migration path — every path comes from the manifest", () => {
  for (const file of scriptFiles()) {
    if (file.endsWith("d1MigrationManifest.mjs")) continue // the library defines the migrations/ prefix
    assert.doesNotMatch(read(file), /migrations\/0\d{3}_/, `${file} must not hardcode a migration path`)
  }
})

test("GUARD: no migration is executed outside the manifest", () => {
  // Every script that applies/reads migration SQL derives the list from the manifest.
  for (const file of [APPLY, BOOTSTRAP_LOCAL, "scripts/lib/d1LocalBootstrap.mjs", "scripts/cf-d1-schema-verify-local.mjs"]) {
    assert.match(read(file), /d1MigrationManifest\.mjs|buildPlan|loadManifest/, `${file} must derive migrations from the manifest`)
  }
  // The apply command builds its command list strictly from buildPlan().
  assert.match(read(APPLY), /for \(const step of buildPlan\(manifest, binding\)\)/)
})

test("GUARD: the committed manifest still validates (an existing migration digest change fails)", () => {
  const loaded = loadManifest(REPO_ROOT)
  assert.equal(loaded.ok, true)
  assert.deepEqual(validateManifest(loaded.manifest, REPO_ROOT).failures, [])
  assert.deepEqual(scanMigrationSqlSafety(REPO_ROOT, loaded.manifest).failures, [])
})

// ─── 4 + 5. production apply gates ──────────────────────────────

test("GUARD: production apply requires BOTH an execution flag and the exact confirmation phrase", () => {
  const src = read(APPLY)
  assert.match(src, /env\.CF_D1_MIGRATE_EXECUTE !== "1"/)
  assert.match(src, /env\.CF_D1_MIGRATE_CONFIRM !== MIGRATE_CONFIRM_PHRASE/)
  assert.match(src, /MIGRATE_CONFIRM_PHRASE = "APPLY_PRODUCTION_D1_MIGRATIONS"/)
  assert.match(src, /argv\.includes\("--remote"\)/)

  // Wrangler is only reached after ALL gates pass. This is enforced by a runtime
  // latch rather than by source ordering, so that moving a call site cannot
  // silently reach production: every Wrangler-invoking helper must first call
  // requireAuthorizedExecution(), and the latch may only open after the gates.
  for (const helper of ["function remoteQuery(", "function execRemoteSqlText("]) {
    const start = src.indexOf(helper)
    assert.ok(start >= 0, `${helper} must exist`)
    const body = src.slice(start, start + 400)
    assert.match(body, /requireAuthorizedExecution\(\)/, `${helper} must refuse to run unless gates passed`)
  }
  assert.match(src, /if \(!executionAuthorized\) throw new Error\("gate_bypass_attempt"\)/)
  // The latch opens exactly once, and only after the gate check.
  assert.equal(src.split("executionAuthorized = true").length - 1, 1, "the latch must open in exactly one place")
  const gateIdx = src.indexOf("if (!gates.ok)")
  const latchIdx = src.indexOf("executionAuthorized = true")
  assert.ok(gateIdx >= 0 && latchIdx > gateIdx, "the gate check must precede opening the execution latch")
})

test("GUARD: production apply cannot use the committed placeholder config", () => {
  // Placeholder IDs are never allowed for apply / remote verification. Both now
  // load config through the SHARED authority library, which runs the shared
  // validator internally — so the rule is inherited from one place rather than
  // re-implemented per command.
  for (const file of [APPLY, VERIFY_REMOTE]) {
    assert.match(read(file), /allowPlaceholderIds:\s*false/, `${file} must reject placeholder IDs`)
    assert.match(read(file), /loadValidatedDeployConfigAuthority\(/, `${file} must load config through the shared authority`)
  }
  assert.match(read("scripts/lib/cfDeployConfigAuthority.mjs"), /validateDeployConfig\(/, "the shared authority runs the shared validator")
})

test("GUARD: production apply never weakens operator visibility with --yes", () => {
  const src = read(APPLY)
  assert.doesNotMatch(src, /"--yes"|"-y"/)
})

// ─── 6. production bootstrap uses no committed identity data ────

test("GUARD: production bootstrap uses no committed default identity data and no implicit defaults", () => {
  const src = read(BOOTSTRAP_PREPARE)
  assert.doesNotMatch(src, /d1BootstrapFixture|LOCAL_FIXTURE|local-dev-/)
  // Every operator field is required; the status/role are explicit allowlists.
  assert.match(src, /for \(const key of REQUIRED_ENV\)/)
  assert.match(src, /!== "active"/)
  assert.match(src, /ALLOWED_ROLES\.includes/)
  assert.match(src, /validateD1Id/)
})

// ─── 7 + 8. Worker deploy separation + ordering ─────────────────

test("GUARD: Worker deploy never automatically applies migrations", () => {
  const src = read(DEPLOY)
  // Deploy must never apply migrations: it never imports the migration-apply command,
  // never sets its execution gate, and never issues a write (`--file`) D1 call. Its
  // OWN read-only `d1 execute --command <SELECT>` schema introspection is allowed —
  // and is guarded read-only before reaching Wrangler.
  assert.doesNotMatch(src, /cf-d1-migrations-apply|CF_D1_MIGRATE_EXECUTE/i, "deploy must never apply migrations")
  assert.doesNotMatch(src, /"--file"/, "deploy must never issue a write/migration D1 call")
  assert.match(src, /if \(!isReadOnlyIntrospectionSql\(sql\)\) throw new Error\("non_read_only_query_blocked"\)/,
    "deploy's own introspection is guarded read-only before Wrangler")
})

test("GUARD: Worker deploy cannot run before remote schema verification", () => {
  const src = read(DEPLOY).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")
  // In the private remote region, schema verification runs and its digest is matched
  // BEFORE the `wrangler deploy` upload.
  const verifyIdx = src.indexOf("verifyRemoteSchemasForDeploy(authority)")
  const digestIdx = src.indexOf("deployAuthorityDigestsMatch(result.authorityDigest, authority.sha256)")
  const deployIdx = src.indexOf('spawnSync(WRANGLER_BIN, ["deploy"')
  assert.ok(verifyIdx >= 0, "remote schema verification must run in the deploy pipeline")
  assert.ok(digestIdx > verifyIdx, "the verified authority digest is matched after verification")
  assert.ok(deployIdx > digestIdx, "the upload runs only after verification + digest match")
})

// ─── 9 + 11. remote verification is read-only, metadata-only ────

test("GUARD: remote schema verification never mutates and never runs migrations", () => {
  const src = read(VERIFY_REMOTE)
  assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE TABLE)\b/i)
  assert.doesNotMatch(src, /--file|buildApplyCommands|applyLane/, "must never execute migration files")
  // Every query is guarded read-only BEFORE reaching Wrangler.
  assert.match(src, /if \(!isReadOnlyIntrospectionSql\(sql\)\) throw new Error\("non_read_only_query_blocked"\)/)
})

test("GUARD: schema verification reads only metadata, never application row data", () => {
  const src = read("scripts/lib/d1SchemaContract.mjs")
  // Only sqlite_master + read-only PRAGMA introspection.
  assert.match(src, /FROM sqlite_master/)
  assert.match(src, /PRAGMA table_info/)
  assert.match(src, /PRAGMA foreign_key_list/)
  // No SELECT against an application table and no mutation.
  assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\s+(INTO|TABLE|FROM)\b/i)
  assert.doesNotMatch(src, /SELECT \* FROM (?!sqlite_master)/i)
})

// ─── 10. local bootstrap can never select remote mode ───────────

test("GUARD: local bootstrap can never select remote mode or reach the network", () => {
  for (const file of [BOOTSTRAP_LOCAL, "scripts/lib/d1LocalBootstrap.mjs", "scripts/cf-d1-schema-verify-local.mjs"]) {
    const src = read(file)
    assert.doesNotMatch(src, /"--remote"|'--remote'/, `${file} must not select remote mode`)
    assert.doesNotMatch(src, /wrangler|spawnSync|fetch\(/i, `${file} must not invoke Wrangler or the network`)
  }
  // It isolates temp state instead of a developer's local D1 state.
  assert.match(read("scripts/lib/d1LocalBootstrap.mjs"), /mkdtempSync/)
  assert.match(read("scripts/lib/d1LocalBootstrap.mjs"), /rmSync\(dir, \{ recursive: true, force: true \}\)/)
})

// ─── 12. generated artifacts can never be committed ─────────────

test("GUARD: generated config / bootstrap SQL / evidence can never be committed", () => {
  const gitignore = readRaw(".gitignore")
  assert.match(gitignore, /^\/wrangler\.deploy\*\.json$/m)
  assert.match(gitignore, /^\/bootstrap\.control\*\.sql$/m)
  assert.match(gitignore, /^\/\.d1-evidence\/$/m)
  // Nothing of the sort is tracked.
  const tracked = spawnSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" }).stdout.split("\n")
  for (const f of tracked) {
    assert.doesNotMatch(f, /^wrangler\.deploy.*\.json$/, "a generated deploy config must never be committed")
    assert.doesNotMatch(f, /^bootstrap\.control.*\.sql$/, "generated bootstrap SQL must never be committed")
    assert.doesNotMatch(f, /^\.d1-evidence\//, "evidence artifacts must never be committed")
  }
})

// ─── 13. output never logs database IDs or seed values ──────────

test("GUARD: the inspection commands never log database IDs or seed values", () => {
  for (const file of ["scripts/cf-d1-migrations-check.mjs", "scripts/cf-d1-migrations-plan.mjs", BOOTSTRAP_LOCAL, "scripts/cf-d1-schema-verify-local.mjs", VERIFY_REMOTE]) {
    const src = read(file)
    assert.doesNotMatch(src, /console\.(log|error)\([^)]*database_id/i, `${file} must not log a database id`)
    assert.doesNotMatch(src, /console\.(log|error)\([^)]*databaseId/i, `${file} must not log a database id`)
    assert.doesNotMatch(src, /console\.(log|error)\([^)]*\.sha256/i, `${file} must not log raw digests as values`)
  }
  // The production bootstrap logs NO operator value at all.
  const prep = read(BOOTSTRAP_PREPARE)
  const logged = prep.match(/console\.(log|error)\([^\n]*/g) ?? []
  for (const line of logged) {
    assert.doesNotMatch(line, /input\.values|values\.|tenantId|userEmail|databaseId|identitySubject/, `must not log an operator value: ${line}`)
  }
})

test("GUARD: the plan command prints only safe fields (binding, filename, sequence, kind, idempotence)", () => {
  const src = read("scripts/cf-d1-migrations-plan.mjs")
  assert.match(src, /step\.sequence/)
  assert.match(src, /step\.name/)
  assert.doesNotMatch(src, /database_id|databaseId|CONTROL_DB_ID|process\.env/)
})

// ─── 14. Issue #155 completion honesty ──────────────────────────

test("GUARD: docs never claim Issue #155 is complete from FakeD1 or a deploy dry-run alone", () => {
  for (const doc of ["docs/operations/CLOUDFLARE_D1_SETUP.md", "docs/operations/CLOUDFLARE_RUNTIME_DEPLOYMENT.md"]) {
    const text = readRaw(doc).toLowerCase()
    // Must state #155 stays open pending authorized remote evidence.
    assert.match(text, /issue #155 remains open|#155 remains open/, `${doc} must state #155 remains open`)
    // Must state FakeD1 / dry-run are not production-readiness proof.
    assert.match(text, /not (a )?production-readiness proof|are \*\*not\*\* production-readiness proof/, `${doc} must disclaim FakeD1/dry-run proof`)
    assert.doesNotMatch(text, /closes #155|issue #155 (is )?(now )?(complete|closed|resolved)/, `${doc} must not claim #155 complete`)
  }
})

test("GUARD: the evidence artifact carries an explicit non-proof disclaimer", () => {
  const src = read("scripts/cf-d1-evidence.mjs")
  assert.match(src, /Issue #155 remains OPEN until authorized remote execution evidence is reviewed/)
  assert.match(src, /assertEvidenceSafe/)
})
