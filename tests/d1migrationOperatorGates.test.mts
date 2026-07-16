/**
 * P0-PERSIST-015 — operator gates (Issue #155).
 *
 * Production migration apply and remote schema verification must be impossible to
 * run accidentally. Production bootstrap must take ONLY operator-provided values
 * (no implicit defaults, no committed identity data), write 0600 untracked SQL,
 * and log nothing. The evidence artifact must disclose nothing sensitive.
 *
 * All values here are SYNTHETIC. Nothing in this file executes remotely.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { writeFileSync, rmSync, existsSync, statSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { evaluateApplyGates, buildApplyCommands, MIGRATE_CONFIRM_PHRASE } from "../scripts/cf-d1-migrations-apply.mjs"
import { evaluateRemoteVerifyGates } from "../scripts/cf-d1-schema-verify-remote.mjs"
import {
  readOperatorInput, buildBootstrapSql, writeBootstrapSql, removeBootstrapSql,
  REQUIRED_ENV, ALLOWED_ROLES, BOOTSTRAP_SQL_BASENAME,
} from "../scripts/cf-d1-bootstrap-prepare.mjs"
import { assertEvidenceSafe, buildEvidence } from "../scripts/cf-d1-evidence.mjs"
import { SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const TEST_CONFIG_PATH = resolve(REPO_ROOT, "wrangler.deploy.gatetest.json")

/** Assert the operator input is REFUSED and return its safe failure codes. */
function expectRefused(env: Record<string, string | undefined>): string[] {
  const result = readOperatorInput(env)
  if (result.ok) throw new Error("expected the operator input to be refused")
  return result.failures
}

/** Write a synthetic, structurally valid generated deploy config (git-ignored). */
function withSyntheticConfig(fn: (path: string) => void, ids = SYNTHETIC_D1_IDS) {
  const base = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  for (const db of base.d1_databases) db.database_id = ids[db.binding as keyof typeof ids] ?? db.database_id
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(base, null, 2), { mode: 0o600 })
  try { fn(TEST_CONFIG_PATH) } finally { rmSync(TEST_CONFIG_PATH, { force: true }) }
}

const FULL_ENV = {
  CF_D1_MIGRATE_EXECUTE: "1",
  CF_D1_MIGRATE_CONFIRM: MIGRATE_CONFIRM_PHRASE,
}

// ─── Production migration apply gates ───────────────────────────

test("apply: with NO gates satisfied it stops before Wrangler", () => {
  const gates = evaluateApplyGates({ env: {}, argv: [], repoRoot: REPO_ROOT, configPath: undefined })
  assert.equal(gates.ok, false)
  for (const reason of ["missing_remote_flag", "missing_execute_flag", "missing_confirmation", "missing_config"]) {
    assert.ok(gates.blocked.includes(reason), `must be blocked by ${reason}`)
  }
})

test("apply: WITHOUT CF_D1_MIGRATE_EXECUTE=1 it is blocked", () => {
  withSyntheticConfig((configPath) => {
    const gates = evaluateApplyGates({ env: { CF_D1_MIGRATE_CONFIRM: MIGRATE_CONFIRM_PHRASE }, argv: ["--remote"], repoRoot: REPO_ROOT, configPath })
    assert.equal(gates.ok, false)
    assert.ok(gates.blocked.includes("missing_execute_flag"))
  })
})

test("apply: WITHOUT the exact confirmation phrase it is blocked", () => {
  withSyntheticConfig((configPath) => {
    for (const confirm of [undefined, "", "yes", "APPLY", MIGRATE_CONFIRM_PHRASE.toLowerCase()]) {
      const gates = evaluateApplyGates({ env: { CF_D1_MIGRATE_EXECUTE: "1", ...(confirm === undefined ? {} : { CF_D1_MIGRATE_CONFIRM: confirm }) }, argv: ["--remote"], repoRoot: REPO_ROOT, configPath })
      assert.equal(gates.ok, false, `confirm=${String(confirm)} must be blocked`)
      assert.ok(gates.blocked.includes("missing_confirmation"))
    }
  })
})

test("apply: WITHOUT explicit remote mode it is blocked", () => {
  withSyntheticConfig((configPath) => {
    const gates = evaluateApplyGates({ env: FULL_ENV, argv: [], repoRoot: REPO_ROOT, configPath })
    assert.equal(gates.ok, false)
    assert.ok(gates.blocked.includes("missing_remote_flag"))
  })
})

test("apply: the COMMITTED placeholder config is rejected (placeholder D1 IDs)", () => {
  const gates = evaluateApplyGates({ env: FULL_ENV, argv: ["--remote"], repoRoot: REPO_ROOT, configPath: resolve(REPO_ROOT, "wrangler.json") })
  assert.equal(gates.ok, false)
  assert.ok(gates.blocked.includes("deploy_config_invalid"), "placeholder IDs must be rejected")
})

test("apply: every gate satisfied → allowed (synthetic config; nothing is executed here)", () => {
  withSyntheticConfig((configPath) => {
    const gates = evaluateApplyGates({ env: FULL_ENV, argv: ["--remote"], repoRoot: REPO_ROOT, configPath })
    assert.deepEqual(gates.blocked, [])
    assert.equal(gates.ok, true)
  })
})

test("apply: the built commands follow lane order, use --remote, and never weaken operator visibility", () => {
  withSyntheticConfig((configPath) => {
    const cmds = buildApplyCommands(REPO_ROOT, configPath)
    assert.deepEqual(cmds.map((c: { name: string }) => c.name), [
      "0001_control_db.sql", "0004_control_auth_workspace.sql",
      "0002_tenant_core.sql", "0003_tenant_persistence_foundation.sql",
      "0005_tenant_scoped_indexes.sql", "0006_action_preview_creator.sql",
    ])
    for (const c of cmds) {
      assert.ok(c.args.includes("--remote"), "apply is explicitly remote")
      assert.ok(c.args.includes("--config"))
      assert.equal(c.args.includes("--yes"), false, "must not weaken operator visibility")
      assert.equal(c.args.includes("-y"), false, "must not weaken operator visibility")
    }
    // 0006 is an ACTIVE, operator-visible migration — planned exactly once, and
    // declared `once` so the ledger applies it a single time.
    const sixes = cmds.filter((c: { name: string }) => c.name.includes("0006"))
    assert.equal(sixes.length, 1, "the production plan must include 0006 exactly once")
    assert.equal(sixes[0].apply, "once")
  })
})

// ─── Remote schema verification gates ───────────────────────────

test("remote verify: blocked without an explicit remote flag or a validated config", () => {
  assert.ok(evaluateRemoteVerifyGates({ argv: [], repoRoot: REPO_ROOT, configPath: undefined }).blocked.includes("missing_remote_flag"))
  assert.ok(evaluateRemoteVerifyGates({ argv: ["--remote"], repoRoot: REPO_ROOT, configPath: undefined }).blocked.includes("missing_config"))
  // The committed placeholder config is refused.
  assert.ok(evaluateRemoteVerifyGates({ argv: ["--remote"], repoRoot: REPO_ROOT, configPath: resolve(REPO_ROOT, "wrangler.json") }).blocked.includes("deploy_config_invalid"))
})

test("remote verify: allowed only with a validated generated config + explicit remote", () => {
  withSyntheticConfig((configPath) => {
    assert.equal(evaluateRemoteVerifyGates({ argv: ["--remote"], repoRoot: REPO_ROOT, configPath }).ok, true)
  })
})

// ─── Production bootstrap preparation (synthetic values only) ───

const SYNTHETIC_OPERATOR_ENV = {
  CF_D1_BOOTSTRAP_TENANT_ID: "synthetic-tenant-01",
  CF_D1_BOOTSTRAP_TENANT_NAME: "Synthetic Tenant",
  CF_D1_BOOTSTRAP_TENANT_SLUG: "synthetic-tenant",
  CF_D1_BOOTSTRAP_TENANT_STATUS: "active",
  CF_D1_BOOTSTRAP_DATABASE_NAME: "synthetic-tenant-db",
  CF_D1_BOOTSTRAP_DATABASE_ID: SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT,
  CF_D1_BOOTSTRAP_SCHEMA_VERSION: "1",
  CF_D1_BOOTSTRAP_USER_ID: "synthetic-user-01",
  CF_D1_BOOTSTRAP_USER_EMAIL: "synthetic.operator@synthetic.invalid",
  CF_D1_BOOTSTRAP_MEMBERSHIP_ID: "synthetic-membership-01",
  CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE: "owner",
  CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS: "active",
  CF_D1_BOOTSTRAP_IDENTITY_ID: "synthetic-identity-01",
  CF_D1_BOOTSTRAP_IDENTITY_PROVIDER: "jwt",
  CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: "synthetic-subject-01",
}

test("bootstrap prepare: NO implicit defaults — every operator variable is required", () => {
  const failures = expectRefused({})
  for (const key of REQUIRED_ENV) assert.ok(failures.includes(`missing:${key}`), `${key} must be required`)
  // Omitting ANY single variable fails closed.
  for (const key of REQUIRED_ENV) {
    const partial = { ...SYNTHETIC_OPERATOR_ENV } as Record<string, string>
    delete partial[key]
    assert.equal(readOperatorInput(partial).ok, false, `${key} must not have an implicit default`)
  }
})

test("bootstrap prepare: role must be allowlisted; tenant/membership status must be explicitly active", () => {
  assert.equal(readOperatorInput({ ...SYNTHETIC_OPERATOR_ENV, CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE: "superadmin" }).ok, false)
  for (const role of ALLOWED_ROLES) {
    assert.equal(readOperatorInput({ ...SYNTHETIC_OPERATOR_ENV, CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE: role }).ok, true, `${role} must be allowed`)
  }
  for (const status of ["suspended", "invited", "deleted", "ACTIVE", ""]) {
    assert.equal(readOperatorInput({ ...SYNTHETIC_OPERATOR_ENV, CF_D1_BOOTSTRAP_TENANT_STATUS: status }).ok, false, `tenant status ${status} must be refused`)
    assert.equal(readOperatorInput({ ...SYNTHETIC_OPERATOR_ENV, CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS: status }).ok, false, `membership status ${status} must be refused`)
  }
})

test("bootstrap prepare: the database ID uses the SAME UUID validation as the deploy config", () => {
  // Placeholder / malformed values are `invalid:`; an empty value is `missing:` —
  // both fail closed and both name only the field.
  for (const bad of ["REPLACE_WITH_TENANT_DB_ID", "not-a-uuid", "PLACEHOLDER"]) {
    const failures = expectRefused({ ...SYNTHETIC_OPERATOR_ENV, CF_D1_BOOTSTRAP_DATABASE_ID: bad })
    assert.ok(failures.some((f) => f.startsWith("invalid:CF_D1_BOOTSTRAP_DATABASE_ID")), `${bad} must be refused`)
  }
  const empty = expectRefused({ ...SYNTHETIC_OPERATOR_ENV, CF_D1_BOOTSTRAP_DATABASE_ID: "" })
  assert.ok(empty.some((f) => f.includes("CF_D1_BOOTSTRAP_DATABASE_ID")), "an empty database id must be refused")
  assert.equal(readOperatorInput(SYNTHETIC_OPERATOR_ENV).ok, true)
})

test("bootstrap prepare: failures name only FIELDS and never echo an operator value", () => {
  const failures = expectRefused({ ...SYNTHETIC_OPERATOR_ENV, CF_D1_BOOTSTRAP_USER_EMAIL: "not-an-email", CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE: "root" })
  const serialized = JSON.stringify(failures)
  assert.doesNotMatch(serialized, /not-an-email|root|synthetic-tenant-01|synthetic\.operator/)
  assert.match(serialized, /invalid:CF_D1_BOOTSTRAP_USER_EMAIL/)
})

test("bootstrap prepare: generated SQL uses plain INSERTs so duplicates fail closed, and is written 0600", () => {
  const input = readOperatorInput(SYNTHETIC_OPERATOR_ENV)
  assert.equal(input.ok, true)
  if (!input.ok) return
  const sql = buildBootstrapSql(input.values, "2020-01-01T00:00:00.000Z")
  // Plain INSERT (never INSERT OR IGNORE / REPLACE) → a duplicate identity fails.
  assert.doesNotMatch(sql, /INSERT OR IGNORE|INSERT OR REPLACE|REPLACE INTO/i)
  assert.equal((sql.match(/^INSERT INTO /gm) || []).length, 5)
  // Parent-first ordering (tenant → registry → user → membership → identity).
  const order = ["INSERT INTO tenants", "INSERT INTO tenant_databases", "INSERT INTO users", "INSERT INTO tenant_memberships", "INSERT INTO auth_identities"]
  let last = -1
  for (const stmt of order) { const i = sql.indexOf(stmt); assert.ok(i > last, `${stmt} out of order`); last = i }

  const path = resolve(REPO_ROOT, `${BOOTSTRAP_SQL_BASENAME}`)
  try {
    writeBootstrapSql(sql, path)
    assert.equal(statSync(path).mode & 0o777, 0o600, "generated bootstrap SQL must be 0600")
  } finally {
    removeBootstrapSql(path)
    assert.equal(existsSync(path), false, "generated SQL must be removed")
  }
})

test("bootstrap prepare: the generated SQL is git-ignored and never committed", () => {
  const gitignore = readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8")
  assert.match(gitignore, /^\/bootstrap\.control\*\.sql$/m)
  assert.match(gitignore, /^\/\.d1-evidence\/$/m)
})

test("bootstrap prepare: uses NO committed default identity data (never imports the local fixture)", () => {
  const src = readFileSync(resolve(REPO_ROOT, "scripts/cf-d1-bootstrap-prepare.mjs"), "utf8")
  assert.doesNotMatch(src, /d1BootstrapFixture|LOCAL_FIXTURE/, "production bootstrap must not use committed fixture identities")
  assert.doesNotMatch(src, /local-dev-/, "no committed default identity values")
  // Applying requires a SEPARATE explicit execution flag.
  assert.match(src, /CF_D1_BOOTSTRAP_EXECUTE/)
})

// ─── Evidence artifact safety ───────────────────────────────────

test("evidence: the generated artifact is safe and carries the required fields", () => {
  const evidence = buildEvidence(REPO_ROOT, { tests: { total: 0, passed: 0 }, timestamp: "2020-01-01T00:00:00.000Z" })
  assert.deepEqual(assertEvidenceSafe(evidence).violations, [])
  assert.equal(evidence.patchId, "P0-PERSIST-015")
  assert.match(evidence.manifestDigest, /^[0-9a-f]{64}$/)
  assert.match(evidence.schemaContractDigest, /^[0-9a-f]{64}$/)
  assert.equal(evidence.localBootstrap.ok, true)
  assert.equal(evidence.idempotence.ok, true)
  assert.ok(evidence.versions.node && evidence.versions.wrangler && evidence.versions.opennextCloudflare)
  assert.deepEqual(evidence.migrations.CONTROL_DB.map((m: { name: string }) => m.name), ["0001_control_db.sql", "0004_control_auth_workspace.sql"])
  assert.ok(evidence.timestamp)
})

test("evidence: a database ID, identity, SQL, or absolute path is REFUSED", () => {
  const okBase = { patchId: "P0-PERSIST-015", note: "safe" }
  assert.ok(assertEvidenceSafe({ ...okBase, dbId: "00000000-0000-4000-8000-000000000002" }).violations.includes("contains_uuid_database_id"))
  assert.ok(assertEvidenceSafe({ ...okBase, who: "operator@example.com" }).violations.includes("contains_email_identity"))
  assert.ok(assertEvidenceSafe({ ...okBase, t: "local-dev-tenant" }).violations.includes("contains_identity_value"))
  assert.ok(assertEvidenceSafe({ ...okBase, sql: "CREATE TABLE tenants (id TEXT)" }).violations.includes("contains_sql"))
  assert.ok(assertEvidenceSafe({ ...okBase, p: "/Users/someone/secret/path" }).violations.includes("contains_absolute_path"))
  assert.equal(assertEvidenceSafe(okBase).ok, true)
})
