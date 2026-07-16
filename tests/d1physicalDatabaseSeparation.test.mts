/**
 * P0-PERSIST-015 — CONTROL_DB and TENANT_DB_DEFAULT must be physically distinct
 * databases (Issue #155).
 *
 * WHAT THIS EXISTS TO CATCH
 * -------------------------
 * The shared deploy-config validator checked each D1 id on its own and never
 * compared them, so ONE physical database could be assigned to BOTH approved
 * bindings and every command accepted it. That breaks the architecture guarantee
 * `CONTROL_DB is never tenant-data storage`: tenant rows would land inside the
 * control registry, and the tenant migration lane would rewrite the control schema.
 *
 * The ledger's `foreign_binding` reconciliation cannot be the first defence — by the
 * time it runs, the CONTROL lane has already written to the database. The rule must
 * therefore stop every command BEFORE the first Wrangler call and before any ledger
 * table is created.
 *
 * NOTHING here invokes Wrangler, the network, or a remote database.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, writeFileSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { buildConfigWithIds, loadConfigFile, validateDeployConfig, SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"
import { evaluateApplyGates } from "../scripts/cf-d1-migrations-apply.mjs"
import { evaluateRemoteVerifyGates } from "../scripts/cf-d1-schema-verify-remote.mjs"
import { evaluateBootstrapGates, evaluateRegistryBinding, BOOTSTRAP_CONFIRM_PHRASE } from "../scripts/cf-d1-bootstrap-apply.mjs"
import { BOOTSTRAP_SQL_BASENAME, buildBootstrapSql } from "../scripts/cf-d1-bootstrap-prepare.mjs"
import { loadManifest, tenantRegistrySchemaVersion } from "../scripts/lib/d1MigrationManifest.mjs"
import { MIGRATION_HISTORY_TABLE } from "../scripts/lib/d1MigrationLedger.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const COLLIDED_CONFIG = resolve(REPO_ROOT, "wrangler.deploy.collisiontest.json")
/** One synthetic UUID, deliberately assigned to BOTH approved bindings. */
const SAME_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3300"
const COLLISION = "d1_database_id_collision:CONTROL_DB:TENANT_DB_DEFAULT"

const baseConfig = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config

/** Write a generated deploy config whose two approved bindings share one id. */
function withCollidedConfig(fn: (configPath: string) => void) {
  const cfg = buildConfigWithIds(baseConfig, { CONTROL_DB: SAME_ID, TENANT_DB_DEFAULT: SAME_ID })
  writeFileSync(COLLIDED_CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  try { fn(COLLIDED_CONFIG) } finally { rmSync(COLLIDED_CONFIG, { force: true }) }
}

// ─── The shared invariant ────────────────────────────────────────

test("the SHARED deploy-config validator rejects one physical database serving both bindings", () => {
  const collided = buildConfigWithIds(baseConfig, { CONTROL_DB: SAME_ID, TENANT_DB_DEFAULT: SAME_ID })
  assert.ok(validateDeployConfig(collided, { repoRoot: REPO_ROOT, allowPlaceholderIds: false }).failures.includes(COLLISION))
  // Distinct ids are the normal case.
  const distinct = buildConfigWithIds(baseConfig, SYNTHETIC_D1_IDS)
  assert.deepEqual(validateDeployConfig(distinct, { repoRoot: REPO_ROOT, allowPlaceholderIds: false }).failures, [])
})

// ─── 1–4. migration apply refuses BEFORE Wrangler and before any ledger ──

test("1 + 2 + 3 + 4. migrations:apply refuses a same-id config before Wrangler — no ledger, no Control or Tenant migration", () => {
  withCollidedConfig((configPath) => {
    const gates = evaluateApplyGates({
      env: { CF_D1_MIGRATE_EXECUTE: "1", CF_D1_MIGRATE_CONFIRM: "APPLY_PRODUCTION_D1_MIGRATIONS" },
      argv: ["--remote"], repoRoot: REPO_ROOT, configPath,
    })
    assert.equal(gates.ok, false, "a same-id config must never be applied")
    assert.ok(gates.blocked.includes("deploy_config_invalid"))
  })

  // The gate is evaluated BEFORE the execution latch opens and before any remote
  // read/write — so no `__atra_d1_migrations` table is created, and neither the
  // Control nor the Tenant lane runs. Relying on the ledger's later
  // `foreign_binding` reconciliation would be too late: the Control lane would
  // already have written.
  const src = readFileSync(resolve(REPO_ROOT, "scripts/cf-d1-migrations-apply.mjs"), "utf8")
  // The ledger is initialized by a REMOTE write (`ledger-init`). It — and every
  // other Wrangler-invoking helper — is unreachable until the latch opens, and the
  // latch opens only after the gates pass. Asserted on the runtime latch rather
  // than source order, since an import mentioning CREATE_HISTORY_SQL naturally
  // appears at the top of the file.
  assert.match(src, /execRemoteSqlText\(binding, configPath, CREATE_HISTORY_SQL, "ledger-init"\)/, "the ledger is created by a remote write")
  for (const helper of ["function remoteQuery(", "function execRemoteSqlText("]) {
    const start = src.indexOf(helper)
    assert.ok(start >= 0, `${helper} must exist`)
    assert.match(src.slice(start, start + 400), /requireAuthorizedExecution\(\)/, `${helper} must refuse until the latch opens`)
  }
  assert.match(src, /if \(!executionAuthorized\) throw new Error\("gate_bypass_attempt"\)/)
  assert.equal(src.split("executionAuthorized = true").length - 1, 1, "the latch opens in exactly one place")
  const gateIdx = src.indexOf("if (!gates.ok)")
  const latchIdx = src.indexOf("executionAuthorized = true")
  assert.ok(gateIdx >= 0 && latchIdx > gateIdx, "the gates must be checked before the execution latch opens")
  assert.equal(MIGRATION_HISTORY_TABLE, "__atra_d1_migrations")
})

// ─── 5. remote schema verification refuses before querying ───────

test("5. schema:verify:remote refuses a same-id config before querying either binding", () => {
  withCollidedConfig((configPath) => {
    const gates = evaluateRemoteVerifyGates({ argv: ["--remote"], repoRoot: REPO_ROOT, configPath })
    assert.equal(gates.ok, false, "a same-id config must never be queried")
    assert.ok(gates.blocked.includes("deploy_config_invalid"))
  })
})

// ─── 6. preflight and the deploy path refuse it ──────────────────

test("6. deploy preflight refuses a same-id config, and the deploy pipeline runs preflight before any remote step", () => {
  withCollidedConfig((configPath) => {
    const cfg = loadConfigFile(configPath) as { ok: boolean; config: unknown }
    assert.equal(cfg.ok, true)
    // Preflight validates the supplied generated config through the SAME shared
    // validator, so it inherits the rule.
    const result = validateDeployConfig(cfg.config, { configPath, repoRoot: REPO_ROOT, allowPlaceholderIds: false })
    assert.ok(result.failures.includes(COLLISION), "preflight's validator must refuse a same-id config")
    // …and with placeholders allowed too: the rule is about concrete ids.
    assert.ok(validateDeployConfig(cfg.config, { configPath, repoRoot: REPO_ROOT, allowPlaceholderIds: true }).failures.includes(COLLISION))
  })

  // The deploy pipeline cannot reach a remote step before preflight validates.
  const deploy = readFileSync(resolve(REPO_ROOT, "scripts/cloudflare-deploy.mjs"), "utf8")
  const preflightIdx = deploy.indexOf('name: "verify"')
  const remoteIdx = deploy.indexOf('name: "verify-remote-schema"')
  const deployIdx = deploy.indexOf('name: "deploy"')
  assert.ok(preflightIdx >= 0 && remoteIdx > preflightIdx, "artifact/preflight verification precedes the first remote step")
  assert.ok(deployIdx > remoteIdx, "the upload is last")
})

// ─── Bootstrap: same-id refused, nothing executable returned ─────

test("bootstrap apply refuses a same-id config and returns NO executable SQL or config snapshot", () => {
  const canonicalVersion = (() => {
    const loaded = loadManifest(REPO_ROOT)
    if (!loaded.ok) throw new Error("manifest unreadable")
    return tenantRegistrySchemaVersion(loaded.manifest)!
  })()
  const tenantName = (baseConfig.d1_databases as Array<{ binding: string; database_name: string }>)
    .find((d) => d.binding === "TENANT_DB_DEFAULT")!.database_name
  const values = {
    tenantId: "acme", tenantName: "Acme", tenantSlug: "acme", tenantStatus: "active",
    databaseName: tenantName, databaseId: SAME_ID, schemaVersion: canonicalVersion,
    userId: "user-1", userEmail: "ops@example.com", membershipId: "mem-1",
    membershipRole: "owner", membershipStatus: "active", identityId: "ident-1",
    identityProvider: "jwt", identitySubject: "auth0|abc123",
  }
  const env = {
    CF_D1_BOOTSTRAP_EXECUTE: "1", CF_D1_BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_PHRASE,
    CF_D1_BOOTSTRAP_TENANT_ID: "acme", CF_D1_BOOTSTRAP_TENANT_NAME: "Acme",
    CF_D1_BOOTSTRAP_TENANT_SLUG: "acme", CF_D1_BOOTSTRAP_TENANT_STATUS: "active",
    CF_D1_BOOTSTRAP_DATABASE_NAME: tenantName, CF_D1_BOOTSTRAP_DATABASE_ID: SAME_ID,
    CF_D1_BOOTSTRAP_SCHEMA_VERSION: canonicalVersion,
    CF_D1_BOOTSTRAP_USER_ID: "user-1", CF_D1_BOOTSTRAP_USER_EMAIL: "ops@example.com",
    CF_D1_BOOTSTRAP_MEMBERSHIP_ID: "mem-1", CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE: "owner",
    CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS: "active", CF_D1_BOOTSTRAP_IDENTITY_ID: "ident-1",
    CF_D1_BOOTSTRAP_IDENTITY_PROVIDER: "jwt", CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: "auth0|abc123",
  }
  const sqlPath = resolve(REPO_ROOT, BOOTSTRAP_SQL_BASENAME)
  withCollidedConfig((configPath) => {
    try {
      writeFileSync(sqlPath, buildBootstrapSql(values, "2026-07-16T00:00:00.000Z"), { mode: 0o600 })
      const gates = evaluateBootstrapGates({ env, argv: ["--remote"], repoRoot: REPO_ROOT, configPath, sqlPath })
      assert.equal(gates.ok, false, "a same-id config must never bootstrap")
      assert.ok(gates.blocked.includes("deploy_config_invalid"))
      // 5. Nothing executable is handed back when a physical-separation gate fails.
      assert.equal(gates.canonicalSql, null, "no executable SQL may be returned")
      assert.equal(gates.configSnapshot, null, "no config snapshot may be returned")
    } finally {
      rmSync(sqlPath, { force: true })
    }
  })
})

test("evaluateRegistryBinding rejects identical Control/Tenant ids INDEPENDENTLY of the shared validator", () => {
  // A future caller could hand the bootstrap a config that never went through the
  // shared validator — the registry check must refuse on its own.
  const collided = { d1_databases: [
    { binding: "CONTROL_DB", database_id: SAME_ID, database_name: "ctl-db" },
    { binding: "TENANT_DB_DEFAULT", database_id: SAME_ID, database_name: "tenant-db" },
  ] }
  const result = evaluateRegistryBinding({ databaseId: SAME_ID, databaseName: "tenant-db" }, collided)
  assert.equal(result.ok, false)
  assert.ok(result.blocked.includes("control_tenant_database_collision"))
  assert.equal(JSON.stringify(result.blocked).includes(SAME_ID), false, "no value may be echoed")
})

test("the operator can never store the Control DB id as tenant registry metadata, even when the bindings differ", () => {
  // The realistic slip: pasting the CONTROL id into the tenant registry row. It
  // would point every tenant's data at the control registry itself.
  const config = { d1_databases: [
    { binding: "CONTROL_DB", database_id: SYNTHETIC_D1_IDS.CONTROL_DB, database_name: "ctl-db" },
    { binding: "TENANT_DB_DEFAULT", database_id: SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT, database_name: "tenant-db" },
  ] }
  const result = evaluateRegistryBinding({ databaseId: SYNTHETIC_D1_IDS.CONTROL_DB, databaseName: "tenant-db" }, config)
  assert.equal(result.ok, false)
  assert.ok(result.blocked.includes("control_tenant_database_collision"))
  assert.ok(result.blocked.includes("tenant_database_id_mismatch"))
  // The correct tenant id passes.
  assert.deepEqual(evaluateRegistryBinding({ databaseId: SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT, databaseName: "tenant-db" }, config).blocked, [])
})
