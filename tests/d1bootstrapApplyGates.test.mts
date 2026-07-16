/**
 * P0-PERSIST-015 — cf:d1:bootstrap:apply operator gates (Issue #155).
 *
 * The production Control DB bootstrap must be impossible to run by accident. Before
 * this command existed, `CF_D1_BOOTSTRAP_EXECUTE=1` was documented as a gate but
 * controlled NO write path — the documented workflow ended in a raw
 * `wrangler d1 execute --remote`, which bypassed every check. These tests prove the
 * gate now guards a real write path, and that every refusal happens BEFORE Wrangler.
 *
 * NOTHING here executes Wrangler, touches the network, or performs a bootstrap.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { writeFileSync, rmSync, mkdtempSync, symlinkSync, chmodSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  evaluateBootstrapGates, inspectBootstrapArtifact, parseBindingArg,
  BOOTSTRAP_CONFIRM_PHRASE, BOOTSTRAP_BINDING,
} from "../scripts/cf-d1-bootstrap-apply.mjs"
import { BOOTSTRAP_SQL_BASENAME, buildBootstrapSql } from "../scripts/cf-d1-bootstrap-prepare.mjs"
import { SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const APPLY_SRC = resolve(REPO_ROOT, "scripts/cf-d1-bootstrap-apply.mjs")

/** A complete, valid operator environment. Test-only synthetic values. */
const VALID_ENV = Object.freeze({
  CF_D1_BOOTSTRAP_EXECUTE: "1",
  CF_D1_BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_PHRASE,
  CF_D1_BOOTSTRAP_TENANT_ID: "acme",
  CF_D1_BOOTSTRAP_TENANT_NAME: "Acme",
  CF_D1_BOOTSTRAP_TENANT_SLUG: "acme",
  CF_D1_BOOTSTRAP_TENANT_STATUS: "active",
  CF_D1_BOOTSTRAP_DATABASE_NAME: "acme-db",
  CF_D1_BOOTSTRAP_DATABASE_ID: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  CF_D1_BOOTSTRAP_SCHEMA_VERSION: "1",
  CF_D1_BOOTSTRAP_USER_ID: "user-1",
  CF_D1_BOOTSTRAP_USER_EMAIL: "ops@example.com",
  CF_D1_BOOTSTRAP_MEMBERSHIP_ID: "mem-1",
  CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE: "owner",
  CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS: "active",
  CF_D1_BOOTSTRAP_IDENTITY_ID: "ident-1",
  CF_D1_BOOTSTRAP_IDENTITY_PROVIDER: "jwt",
  CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: "auth0|abc123",
})

/**
 * A synthetic, structurally valid GENERATED deploy config, written to the
 * repository root (the validator requires generated configs to live there).
 * Mirrors the committed wrangler.json and swaps in non-placeholder D1 ids.
 */
const TEST_CONFIG_PATH = resolve(REPO_ROOT, "wrangler.deploy.bootstrapgatetest.json")
function withSyntheticConfig(fn: (configPath: string) => void, ids: Record<string, string> = SYNTHETIC_D1_IDS) {
  const base = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  for (const db of base.d1_databases) db.database_id = ids[db.binding] ?? db.database_id
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(base, null, 2), { mode: 0o600 })
  try { fn(TEST_CONFIG_PATH) } finally { rmSync(TEST_CONFIG_PATH, { force: true }) }
}

/** Write a valid 0600 bootstrap artifact at the approved location, then clean up. */
function withArtifact(fn: (sqlPath: string) => void) {
  const sqlPath = resolve(REPO_ROOT, BOOTSTRAP_SQL_BASENAME)
  try {
    writeFileSync(sqlPath, buildBootstrapSql({
      tenantId: "acme", tenantName: "Acme", tenantSlug: "acme", tenantStatus: "active",
      databaseName: "acme-db", databaseId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", schemaVersion: "1",
      userId: "user-1", userEmail: "ops@example.com", membershipId: "mem-1",
      membershipRole: "owner", membershipStatus: "active", identityId: "ident-1",
      identityProvider: "jwt", identitySubject: "auth0|abc123",
    }), { mode: 0o600 })
    fn(sqlPath)
  } finally {
    rmSync(sqlPath, { force: true })
  }
}

const gatesFor = (over: Record<string, unknown> = {}, envOver: Record<string, string | undefined> = {}) => {
  let out!: { ok: boolean; blocked: string[] }
  withSyntheticConfig((configPath) => {
    withArtifact((sqlPath) => {
      out = evaluateBootstrapGates({
        env: { ...VALID_ENV, ...envOver }, argv: ["--remote"], repoRoot: REPO_ROOT, configPath, sqlPath, ...over,
      })
    })
  })
  return out
}

// ─── Baseline ────────────────────────────────────────────────────

test("bootstrap apply: every gate satisfied → allowed (nothing is executed here)", () => {
  assert.deepEqual(gatesFor().blocked, [])
})

// ─── 1, 2, 3. execute flag / confirmation / --remote ─────────────

test("1. bootstrap apply without CF_D1_BOOTSTRAP_EXECUTE=1 stops before Wrangler", () => {
  for (const bad of [undefined, "", "0", "true", "yes"]) {
    assert.ok(gatesFor({}, { CF_D1_BOOTSTRAP_EXECUTE: bad }).blocked.includes("missing_execute_flag"), `EXECUTE=${bad} must be refused`)
  }
})

test("2. bootstrap apply without the exact confirmation phrase stops before Wrangler", () => {
  for (const bad of [undefined, "", "yes", "APPLY", "apply_production_control_bootstrap", `${BOOTSTRAP_CONFIRM_PHRASE} `]) {
    assert.ok(gatesFor({}, { CF_D1_BOOTSTRAP_CONFIRM: bad }).blocked.includes("missing_confirmation"), `CONFIRM=${bad} must be refused`)
  }
})

test("3. bootstrap apply without --remote stops before Wrangler", () => {
  assert.ok(gatesFor({ argv: [] }).blocked.includes("missing_remote_flag"))
  assert.ok(gatesFor({ argv: ["--local"] }).blocked.includes("missing_remote_flag"))
})

// ─── 4. placeholder deploy config ────────────────────────────────

test("4. a placeholder deploy config stops before Wrangler", () => {
  // The COMMITTED wrangler.json ships `REPLACE_WITH_*` placeholders. Bootstrapping
  // against it must be impossible — that is the config an operator would reach for
  // by mistake.
  const committed = resolve(REPO_ROOT, "wrangler.json")
  withArtifact((sqlPath) => {
    const gates = evaluateBootstrapGates({ env: { ...VALID_ENV }, argv: ["--remote"], repoRoot: REPO_ROOT, configPath: committed, sqlPath })
    assert.ok(gates.blocked.includes("deploy_config_invalid"), "the placeholder committed config must be refused")
  })
  // Every placeholder marker shape is refused.
  for (const id of ["REPLACE_WITH_CONTROL_DB_ID", "PLACEHOLDER", "TODO-fill-in", "CHANGEME", "not-a-uuid"]) {
    withSyntheticConfig((configPath) => {
      withArtifact((sqlPath) => {
        const gates = evaluateBootstrapGates({ env: { ...VALID_ENV }, argv: ["--remote"], repoRoot: REPO_ROOT, configPath, sqlPath })
        assert.ok(gates.blocked.includes("deploy_config_invalid"), `database_id ${id} must be refused`)
      })
    }, { CONTROL_DB: id, TENANT_DB_DEFAULT: SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT })
  }
})

test("a missing deploy config stops before Wrangler", () => {
  withArtifact((sqlPath) => {
    const gates = evaluateBootstrapGates({ env: { ...VALID_ENV }, argv: ["--remote"], repoRoot: REPO_ROOT, sqlPath })
    assert.ok(gates.blocked.includes("missing_config"))
  })
})

// ─── 5, 6, 7. the generated artifact ─────────────────────────────

test("5. a symlinked bootstrap SQL is rejected", () => {
  const outside = mkdtempSync(resolve(tmpdir(), "d1-bootstrap-evil-"))
  const target = resolve(outside, "evil.sql")
  const link = resolve(REPO_ROOT, BOOTSTRAP_SQL_BASENAME)
  try {
    writeFileSync(target, "INSERT INTO tenants (id) VALUES ('evil');\n", { mode: 0o600 })
    rmSync(link, { force: true })
    symlinkSync(target, link)
    const result = inspectBootstrapArtifact(link, REPO_ROOT)
    assert.equal(result.ok, false)
    assert.ok(result.blocked.includes("bootstrap_sql_symlink"), `expected symlink refusal, got ${result.blocked.join(",")}`)
  } finally {
    rmSync(link, { force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test("6. a world-readable (or otherwise too-broad) bootstrap SQL is rejected", () => {
  withArtifact((sqlPath) => {
    for (const mode of [0o644, 0o604, 0o640, 0o660, 0o666, 0o700]) {
      chmodSync(sqlPath, mode)
      const result = inspectBootstrapArtifact(sqlPath, REPO_ROOT)
      assert.ok(result.blocked.includes("bootstrap_sql_permissions_too_broad"), `mode ${mode.toString(8)} must be refused`)
    }
    // 0600 and stricter are acceptable.
    chmodSync(sqlPath, 0o600)
    assert.deepEqual(inspectBootstrapArtifact(sqlPath, REPO_ROOT).blocked, [])
    chmodSync(sqlPath, 0o400)
    assert.deepEqual(inspectBootstrapArtifact(sqlPath, REPO_ROOT).blocked, [])
    chmodSync(sqlPath, 0o600)
  })
})

test("7. a bootstrap SQL at a non-approved location is rejected", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "d1-bootstrap-elsewhere-"))
  try {
    const stray = resolve(dir, BOOTSTRAP_SQL_BASENAME)
    writeFileSync(stray, "-- stray\n", { mode: 0o600 })
    const result = inspectBootstrapArtifact(stray, REPO_ROOT)
    assert.equal(result.ok, false)
    assert.ok(result.blocked.includes("bootstrap_sql_unapproved_location"))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("a missing bootstrap SQL stops before Wrangler", () => {
  const sqlPath = resolve(REPO_ROOT, BOOTSTRAP_SQL_BASENAME)
  rmSync(sqlPath, { force: true })
  assert.ok(inspectBootstrapArtifact(sqlPath, REPO_ROOT).blocked.includes("bootstrap_sql_missing"))
  withSyntheticConfig((configPath) => {
    const gates = evaluateBootstrapGates({ env: { ...VALID_ENV }, argv: ["--remote"], repoRoot: REPO_ROOT, configPath, sqlPath })
    assert.ok(gates.blocked.includes("bootstrap_sql_missing"))
  })
})

// ─── 8. only CONTROL_DB ──────────────────────────────────────────

test("8. the command can target ONLY CONTROL_DB", () => {
  assert.equal(parseBindingArg([]), BOOTSTRAP_BINDING, "the default target is the control registry")
  assert.equal(parseBindingArg(["--binding", "CONTROL_DB"]), "CONTROL_DB")
  for (const other of ["TENANT_DB_DEFAULT", "SOME_OTHER_DB", "control_db"]) {
    assert.ok(gatesFor({ argv: ["--remote", "--binding", other] }).blocked.includes("unsupported_binding"), `${other} must be refused`)
  }
})

// ─── operator input still validated at apply time ────────────────

test("invalid operator input stops before Wrangler (apply re-validates, it does not trust prepare)", () => {
  assert.ok(gatesFor({}, { CF_D1_BOOTSTRAP_TENANT_STATUS: "suspended" }).blocked.includes("operator_input_invalid"))
  assert.ok(gatesFor({}, { CF_D1_BOOTSTRAP_DATABASE_ID: "REPLACE_ME" }).blocked.includes("operator_input_invalid"))
  assert.ok(gatesFor({}, { CF_D1_BOOTSTRAP_USER_EMAIL: undefined }).blocked.includes("operator_input_invalid"))
})

// ─── 9, 11. failures name fields/categories, never values ────────

test("9 + 11. every gate failure is a field/category name — no operator value can reach stdout or stderr", () => {
  const secrets = ["acme", "Acme", "ops@example.com", "auth0|abc123", "user-1", "mem-1", "ident-1", "3f2504e0-4f89-41d3-9a0c-0305e82c3301"]
  // Exercise many failure combinations and assert no reason code carries a value.
  const cases = [
    gatesFor({ argv: [] }),
    gatesFor({}, { CF_D1_BOOTSTRAP_EXECUTE: undefined }),
    gatesFor({}, { CF_D1_BOOTSTRAP_CONFIRM: "nope" }),
    gatesFor({ argv: ["--remote", "--binding", "TENANT_DB_DEFAULT"] }),
    gatesFor({}, { CF_D1_BOOTSTRAP_USER_EMAIL: "not-an-email" }),
    gatesFor({}, { CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: undefined }),
  ]
  for (const result of cases) {
    for (const code of result.blocked) {
      assert.match(code, /^[a-z0-9_]+$/, `reason code "${code}" must be a safe category name`)
      for (const secret of secrets) {
        assert.equal(code.includes(secret), false, `reason code must never echo an operator value (${secret})`)
      }
    }
  }
})

test("the apply command never logs an operator value", () => {
  const src = readFileSync(APPLY_SRC, "utf8")
  // No console call may interpolate the parsed operator values object.
  for (const m of src.matchAll(/console\.(log|error|warn|info)\(([^\n]*)\)/g)) {
    assert.equal(/\bvalues\b/.test(m[2]), false, `console call must not print operator values: ${m[0]}`)
    assert.equal(/process\.env\.CF_D1_BOOTSTRAP_(?!EXECUTE|CONFIRM)/.test(m[2]), false, `console call must not print operator env: ${m[0]}`)
  }
})

// ─── 10. cleanup on success AND failure ──────────────────────────

test("10. the generated SQL is removed on EVERY exit path (finally-equivalent)", () => {
  const src = readFileSync(APPLY_SRC, "utf8")
  // A refused apply must not leave a stale artifact behind.
  const gateBlock = src.slice(src.indexOf("if (!gates.ok)"), src.indexOf("executionAuthorized = true"))
  assert.match(gateBlock, /removeBootstrapSql\(\)/, "a refused apply must remove any stale artifact")
  // Success, Wrangler failure, and verification failure all pass through `finally`,
  // and the cleanup there must be UNCONDITIONAL — a call guarded by "only on
  // success" would still mention removeBootstrapSql while leaking the artifact
  // after a Wrangler failure.
  const finallyIdx = src.indexOf("} finally {")
  assert.ok(finallyIdx > 0, "apply must have a finally-equivalent cleanup path")
  const finallyBody = src.slice(finallyIdx + "} finally {".length, src.indexOf("}", finallyIdx + 12))
  assert.match(finallyBody, /^\s*removeBootstrapSql\(\)\s*$/m, "the finally cleanup must be unconditional")
  assert.doesNotMatch(finallyBody.replace(/\/\/[^\n]*/g, ""), /\bif\s*\(/, "the finally cleanup must not be conditional")
  // Cleanup must never precede the Wrangler invocation that reads the file.
  const applyIdx = src.indexOf("applyBootstrapFile(configPath, BOOTSTRAP_SQL_PATH)")
  assert.ok(applyIdx > 0 && applyIdx < finallyIdx, "the artifact must only be removed after Wrangler has read it")
})

test("Wrangler is unreachable until every gate passes (runtime latch, not source ordering)", () => {
  const src = readFileSync(APPLY_SRC, "utf8")
  for (const helper of ["function applyBootstrapFile(", "function remoteCount("]) {
    const start = src.indexOf(helper)
    assert.ok(start >= 0, `${helper} must exist`)
    assert.match(src.slice(start, start + 400), /requireAuthorizedExecution\(\)/, `${helper} must refuse to run unless gates passed`)
  }
  assert.match(src, /if \(!executionAuthorized\) throw new Error\("gate_bypass_attempt"\)/)
  assert.equal(src.split("executionAuthorized = true").length - 1, 1, "the latch must open in exactly one place")
  assert.ok(src.indexOf("executionAuthorized = true") > src.indexOf("if (!gates.ok)"), "the gate check must precede opening the latch")
})
