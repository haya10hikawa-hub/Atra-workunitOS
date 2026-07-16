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
import { writeFileSync, rmSync, mkdtempSync, symlinkSync, chmodSync, readFileSync, existsSync, statSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  evaluateBootstrapGates, inspectBootstrapArtifact, parseBindingArg, validateCanonicalArtifact,
  evaluateRegistryBinding, BOOTSTRAP_CONFIRM_PHRASE, BOOTSTRAP_BINDING, VERIFICATION_FAILED_AFTER_COMMIT,
} from "../scripts/cf-d1-bootstrap-apply.mjs"
import { BOOTSTRAP_SQL_BASENAME, buildBootstrapSql, BOOTSTRAP_ARTIFACT_MAX_BYTES } from "../scripts/cf-d1-bootstrap-prepare.mjs"
import { SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"
import { loadManifest, tenantRegistrySchemaVersion } from "../scripts/lib/d1MigrationManifest.mjs"
import { createPrivateExecutionConfig, removePrivateExecutionConfig } from "../scripts/lib/cfDeployConfigAuthority.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const APPLY_SRC = resolve(REPO_ROOT, "scripts/cf-d1-bootstrap-apply.mjs")

/**
 * The body of every `finally` block in `src`, brace-matched. Used to assert that
 * EVERY cleanup path is unconditional — searching for the first `} finally {` is
 * not enough once there is more than one.
 */
export function finallyBodies(src: string): string[] {
  const marker = "} finally {"
  const out: string[] = []
  let i = src.indexOf(marker)
  while (i >= 0) {
    let depth = 1
    let j = i + marker.length
    const start = j
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++
      else if (src[j] === "}") depth--
      j++
    }
    out.push(src.slice(start, j - 1))
    i = src.indexOf(marker, j)
  }
  return out
}

/** A fixed instant, so a canonical artifact is byte-reproducible in tests. */
const GENERATED_AT = "2026-07-16T00:00:00.000Z"

/** The ONE canonical registry schema version — never a hand-picked digit string. */
function canonicalSchemaVersion(): string {
  const loaded = loadManifest(REPO_ROOT)
  if (!loaded.ok) throw new Error(`manifest unreadable: ${loaded.error}`)
  const version = tenantRegistrySchemaVersion(loaded.manifest)
  if (version === null) throw new Error("the manifest must declare a canonical registry schema version")
  return version
}

/** The committed config's TENANT_DB_DEFAULT name — the registry must describe THIS. */
function tenantBindingName(): string {
  const base = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  return base.d1_databases.find((d: { binding: string }) => d.binding === "TENANT_DB_DEFAULT").database_name
}

/**
 * A complete, valid operator environment. Test-only synthetic values.
 * The registry metadata deliberately matches the synthetic deploy config's REAL
 * TENANT_DB_DEFAULT binding, and the schema version is the canonical one.
 */
const VALID_ENV: Readonly<Record<string, string>> = Object.freeze({
  CF_D1_BOOTSTRAP_EXECUTE: "1",
  CF_D1_BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_PHRASE,
  CF_D1_BOOTSTRAP_TENANT_ID: "acme",
  CF_D1_BOOTSTRAP_TENANT_NAME: "Acme",
  CF_D1_BOOTSTRAP_TENANT_SLUG: "acme",
  CF_D1_BOOTSTRAP_TENANT_STATUS: "active",
  CF_D1_BOOTSTRAP_DATABASE_NAME: tenantBindingName(),
  CF_D1_BOOTSTRAP_DATABASE_ID: SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT,
  CF_D1_BOOTSTRAP_SCHEMA_VERSION: canonicalSchemaVersion(),
  CF_D1_BOOTSTRAP_USER_ID: "user-1",
  CF_D1_BOOTSTRAP_USER_EMAIL: "ops@example.com",
  CF_D1_BOOTSTRAP_MEMBERSHIP_ID: "mem-1",
  CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE: "owner",
  CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS: "active",
  CF_D1_BOOTSTRAP_IDENTITY_ID: "ident-1",
  CF_D1_BOOTSTRAP_IDENTITY_PROVIDER: "jwt",
  CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: "auth0|abc123",
})

/** The canonical values `VALID_ENV` denotes (what `readOperatorInput` would yield). */
const VALID_VALUES = Object.freeze({
  tenantId: "acme", tenantName: "Acme", tenantSlug: "acme", tenantStatus: "active",
  databaseName: VALID_ENV.CF_D1_BOOTSTRAP_DATABASE_NAME, databaseId: VALID_ENV.CF_D1_BOOTSTRAP_DATABASE_ID,
  schemaVersion: VALID_ENV.CF_D1_BOOTSTRAP_SCHEMA_VERSION,
  userId: "user-1", userEmail: "ops@example.com", membershipId: "mem-1",
  membershipRole: "owner", membershipStatus: "active", identityId: "ident-1",
  identityProvider: "jwt", identitySubject: "auth0|abc123",
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

/**
 * Write a 0600 bootstrap artifact at the approved location, then clean up.
 * `sql` defaults to the CANONICAL artifact for VALID_VALUES; tests pass tampered
 * or stale bytes to prove the canonical binding refuses them.
 */
function withArtifact(fn: (sqlPath: string) => void, sql: string = buildBootstrapSql(VALID_VALUES, GENERATED_AT)) {
  const sqlPath = resolve(REPO_ROOT, BOOTSTRAP_SQL_BASENAME)
  try {
    writeFileSync(sqlPath, sql, { mode: 0o600 })
    fn(sqlPath)
  } finally {
    rmSync(sqlPath, { force: true })
  }
}

const gatesFor = (over: Record<string, unknown> = {}, envOver: Record<string, string | undefined> = {}, sql?: string) => {
  let out!: { ok: boolean; blocked: string[]; canonicalSql: string | null }
  withSyntheticConfig((configPath) => {
    withArtifact((sqlPath) => {
      out = evaluateBootstrapGates({
        env: { ...VALID_ENV, ...envOver }, argv: ["--remote"], repoRoot: REPO_ROOT, configPath, sqlPath, ...over,
      })
    }, sql)
  })
  return out
}

// ─── Baseline ────────────────────────────────────────────────────

test("bootstrap apply: every gate satisfied → allowed (nothing is executed here)", () => {
  assert.deepEqual(gatesFor().blocked, [])
})

// ─── Canonical artifact binding (1–10) ───────────────────────────

/** The canonical artifact for the current authority, at the approved path. */
const canonicalArtifact = () => buildBootstrapSql(VALID_VALUES, GENERATED_AT)

/** Evaluate ONLY the canonical-artifact gate against arbitrary bytes. */
function canonicalFor(sql: string, values: Record<string, string> = VALID_VALUES) {
  let out!: { ok: boolean; blocked?: string[]; sql?: string }
  withArtifact((sqlPath) => { out = validateCanonicalArtifact({ values, path: sqlPath }) }, sql)
  return out
}

test("1. the EXACT canonical artifact for the current values passes", () => {
  const result = canonicalFor(canonicalArtifact())
  assert.equal(result.ok, true, `the canonical artifact must be accepted: ${result.blocked?.join(",")}`)
  assert.equal(result.sql, canonicalArtifact(), "validation returns the canonical bytes to execute")
  assert.deepEqual(gatesFor().blocked, [], "and every gate passes end to end")
})

test("the FULL gate evaluation refuses a tampered artifact — the canonical check is wired in, not merely present", () => {
  // Distinct from the direct-call tests above: this proves `evaluateBootstrapGates`
  // actually consults the canonical binding. A gate that exists but is never called
  // would still let `DROP TABLE tenants;` through, which is precisely how the
  // audited head behaved.
  for (const [label, sql] of [
    ["appended DELETE", canonicalArtifact() + "\nDELETE FROM tenants;\n"],
    ["appended sixth INSERT", canonicalArtifact() + "\nINSERT INTO auth_identities (id,user_id,provider,provider_subject,email,created_at,updated_at) VALUES ('x','user-1','jwt','attacker','a@b.c','t','t');\n"],
    ["entirely unrelated SQL", "DROP TABLE tenants;\n"],
    ["stale values", buildBootstrapSql({ ...VALID_VALUES, userEmail: "previous@example.com" }, GENERATED_AT)],
  ] as const) {
    const gates = gatesFor({}, {}, sql)
    assert.equal(gates.ok, false, `${label} must be refused by the full gate evaluation`)
    assert.ok(gates.blocked.some((b) => b.startsWith("bootstrap_sql_")), `${label} must be refused by the canonical binding, got ${gates.blocked.join(",")}`)
    assert.equal(gates.canonicalSql, null, `${label}: no bytes may be handed to Wrangler`)
  }
})

test("2. a STALE artifact generated from different values fails before Wrangler", () => {
  // The operator changed the environment after preparing. The prepared file is a
  // plan, not authority — it cannot survive a change of authority.
  for (const stale of [
    { ...VALID_VALUES, tenantId: "previous-tenant" },
    { ...VALID_VALUES, tenantName: "Previous Name" },
    { ...VALID_VALUES, tenantSlug: "previous-slug" },
    { ...VALID_VALUES, membershipRole: "viewer" },
    { ...VALID_VALUES, userId: "previous-user" },
  ]) {
    const result = canonicalFor(buildBootstrapSql(stale, GENERATED_AT))
    assert.equal(result.ok, false, `a stale artifact (${Object.keys(stale)}) must be refused`)
    assert.deepEqual(result.blocked, ["bootstrap_sql_values_mismatch"])
  }
})

test("3. an artifact with a changed database ID fails before Wrangler", () => {
  const tampered = buildBootstrapSql({ ...VALID_VALUES, databaseId: "3f2504e0-4f89-41d3-9a0c-0305e82c3399" }, GENERATED_AT)
  assert.deepEqual(canonicalFor(tampered).blocked, ["bootstrap_sql_values_mismatch"])
})

test("4. an artifact with a changed user email fails before Wrangler", () => {
  const tampered = buildBootstrapSql({ ...VALID_VALUES, userEmail: "attacker@evil.example" }, GENERATED_AT)
  assert.deepEqual(canonicalFor(tampered).blocked, ["bootstrap_sql_values_mismatch"])
})

test("5. an artifact with a changed provider subject fails before Wrangler", () => {
  const tampered = buildBootstrapSql({ ...VALID_VALUES, identitySubject: "auth0|attacker" }, GENERATED_AT)
  assert.deepEqual(canonicalFor(tampered).blocked, ["bootstrap_sql_values_mismatch"])
})

test("6. an artifact with APPENDED SQL fails before Wrangler", () => {
  // At the audited head every one of these passed all gates.
  for (const appended of [
    "\nDELETE FROM tenants;\n",
    "\nUPDATE tenant_memberships SET role = 'owner';\n",
    "\nINSERT INTO auth_identities (id,user_id,provider,provider_subject,email,created_at,updated_at) VALUES ('x','user-1','jwt','attacker','a@b.c','t','t');\n",
    "\n-- harmless looking comment\nDROP TABLE tenants;\n",
    "\n",
  ]) {
    const result = canonicalFor(canonicalArtifact() + appended)
    assert.equal(result.ok, false, `appended ${JSON.stringify(appended)} must be refused`)
    assert.deepEqual(result.blocked, ["bootstrap_sql_noncanonical"])
  }
})

test("7. an artifact with a REMOVED statement fails before Wrangler", () => {
  const lines = canonicalArtifact().split("\n")
  const withoutMembership = lines.filter((l) => !l.startsWith("INSERT INTO tenant_memberships")).join("\n")
  assert.equal(canonicalFor(withoutMembership).ok, false, "a removed statement must be refused")
  // Truncation at the end reads as non-canonical; a removal in the middle changes
  // the byte stream. Either way it fails closed.
  const truncated = canonicalArtifact().slice(0, 200)
  assert.equal(canonicalFor(truncated).ok, false)
})

test("8. REORDERED statements fail before Wrangler", () => {
  // The same five statement types, in a different order: identity before its user.
  const lines = canonicalArtifact().split("\n")
  const inserts = lines.filter((l) => l.startsWith("INSERT INTO "))
  const header = lines.filter((l) => !l.startsWith("INSERT INTO "))
  const reordered = [...header.slice(0, -1), inserts[4], inserts[0], inserts[1], inserts[2], inserts[3], ""].join("\n")
  const result = canonicalFor(reordered)
  assert.equal(result.ok, false, "reordered statements must be refused")
  assert.deepEqual(result.blocked, ["bootstrap_sql_values_mismatch"])
})

test("9. an OVERSIZED artifact fails before it is parsed", () => {
  const huge = canonicalArtifact() + "\n" + "-- padding".repeat(BOOTSTRAP_ARTIFACT_MAX_BYTES)
  assert.ok(Buffer.byteLength(huge) > BOOTSTRAP_ARTIFACT_MAX_BYTES)
  assert.deepEqual(canonicalFor(huge).blocked, ["bootstrap_sql_too_large"])
})

test("a replaced table name and a malformed/absent header fail before Wrangler", () => {
  // A replaced table name is just a byte difference — no keyword list needed.
  const renamed = canonicalArtifact().replace("INSERT INTO tenant_memberships", "INSERT INTO tenant_admins")
  assert.equal(canonicalFor(renamed).ok, false)
  // Entirely foreign SQL has no canonical header at all.
  assert.deepEqual(canonicalFor("DROP TABLE tenants;\n").blocked, ["bootstrap_sql_format_invalid"])
  for (const bad of [
    "-- atra-bootstrap-artifact v2\n-- generated_at: 2026-07-16T00:00:00.000Z\n",
    "-- atra-bootstrap-artifact v1\n-- generated_at: not-a-timestamp\n",
    "-- atra-bootstrap-artifact v1\n-- generated_at: 2026-07-16T00:00:00Z\n",
    "-- atra-bootstrap-artifact v1\n",
    "",
  ]) {
    assert.deepEqual(canonicalFor(bad).blocked, ["bootstrap_sql_format_invalid"], `header ${JSON.stringify(bad)} must be refused`)
  }
})

test("10. no artifact-mismatch failure contains the differing value, SQL, or file contents", () => {
  const secrets = ["attacker@evil.example", "auth0|attacker", "previous-tenant", "DROP TABLE", "DELETE FROM", "tenant_admins", "ops@example.com", VALID_VALUES.databaseId]
  const results = [
    canonicalFor(buildBootstrapSql({ ...VALID_VALUES, userEmail: "attacker@evil.example" }, GENERATED_AT)),
    canonicalFor(buildBootstrapSql({ ...VALID_VALUES, identitySubject: "auth0|attacker" }, GENERATED_AT)),
    canonicalFor(buildBootstrapSql({ ...VALID_VALUES, tenantId: "previous-tenant" }, GENERATED_AT)),
    canonicalFor(canonicalArtifact() + "\nDROP TABLE tenants;\n"),
    canonicalFor(canonicalArtifact().replace("INSERT INTO tenant_memberships", "INSERT INTO tenant_admins")),
    canonicalFor("DELETE FROM tenants;\n"),
  ]
  for (const result of results) {
    const serialized = JSON.stringify(result.blocked)
    assert.match(serialized, /^\["[a-z0-9_]+"\]$/, `only a safe category may be returned: ${serialized}`)
    for (const secret of secrets) assert.equal(serialized.includes(secret), false, `a failure must never echo ${secret}`)
  }
})

// ─── Registry binding to the deploy config (16–18) ───────────────

test("16. the operator database ID must equal the deploy config's TENANT_DB_DEFAULT id", () => {
  // Both are individually valid, non-placeholder UUIDs — but they differ, so the
  // registry row would point tenant data at a database this deployment does not use.
  const other = "3f2504e0-4f89-41d3-9a0c-0305e82c3399"
  assert.notEqual(other, SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT)
  const gates = gatesFor({}, { CF_D1_BOOTSTRAP_DATABASE_ID: other },
    buildBootstrapSql({ ...VALID_VALUES, databaseId: other }, GENERATED_AT))
  assert.ok(gates.blocked.includes("tenant_database_id_mismatch"), `expected a mismatch, got ${gates.blocked.join(",")}`)
  assert.equal(gates.canonicalSql, null, "nothing may be handed to Wrangler")
})

test("17. the operator database NAME must equal the deploy config's TENANT_DB_DEFAULT name", () => {
  const gates = gatesFor({}, { CF_D1_BOOTSTRAP_DATABASE_NAME: "some-other-db" },
    buildBootstrapSql({ ...VALID_VALUES, databaseName: "some-other-db" }, GENERATED_AT))
  assert.ok(gates.blocked.includes("tenant_database_name_mismatch"))
})

test("18. the Control DB's own ID can NEVER be stored as the tenant registry database ID", () => {
  // The realistic operator slip: pasting the CONTROL_DB id into the tenant registry
  // row would point every tenant's data at the control registry itself.
  const controlId = SYNTHETIC_D1_IDS.CONTROL_DB
  assert.notEqual(controlId, SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT)
  const gates = gatesFor({}, { CF_D1_BOOTSTRAP_DATABASE_ID: controlId },
    buildBootstrapSql({ ...VALID_VALUES, databaseId: controlId }, GENERATED_AT))
  assert.ok(gates.blocked.includes("tenant_database_id_mismatch"), "the Control DB id must never be accepted as tenant metadata")
  assert.equal(gates.ok, false)
})

test("the registry binding comparison is in-memory and never echoes either value", () => {
  const config = { d1_databases: [
    { binding: "CONTROL_DB", database_id: "cccccccc-0000-4000-8000-000000000003", database_name: "real-control" },
    { binding: "TENANT_DB_DEFAULT", database_id: "aaaaaaaa-0000-4000-8000-000000000001", database_name: "real-tenant" },
  ] }
  const result = evaluateRegistryBinding({ databaseId: "bbbbbbbb-0000-4000-8000-000000000002", databaseName: "wrong-name" }, config)
  assert.deepEqual(result.blocked, ["tenant_database_id_mismatch", "tenant_database_name_mismatch"])
  const serialized = JSON.stringify(result.blocked)
  for (const value of ["aaaaaaaa-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002", "cccccccc-0000-4000-8000-000000000003", "real-tenant", "real-control", "wrong-name"]) {
    assert.equal(serialized.includes(value), false, `must never echo ${value}`)
  }
  // A missing OR duplicated approved binding is unresolvable — never guess.
  assert.deepEqual(evaluateRegistryBinding({ databaseId: "x", databaseName: "y" }, { d1_databases: [] }).blocked, ["tenant_binding_missing"])
  assert.deepEqual(evaluateRegistryBinding({ databaseId: "x", databaseName: "y" },
    { d1_databases: [{ binding: "TENANT_DB_DEFAULT", database_id: "x", database_name: "y" }] }).blocked, ["control_binding_missing"])
  for (const dup of [
    [{ binding: "CONTROL_DB", database_id: "c", database_name: "c" }, { binding: "TENANT_DB_DEFAULT", database_id: "x", database_name: "y" }, { binding: "TENANT_DB_DEFAULT", database_id: "x", database_name: "y" }],
    [{ binding: "CONTROL_DB", database_id: "c", database_name: "c" }, { binding: "CONTROL_DB", database_id: "c", database_name: "c" }, { binding: "TENANT_DB_DEFAULT", database_id: "x", database_name: "y" }],
  ]) {
    assert.equal(evaluateRegistryBinding({ databaseId: "x", databaseName: "y" }, { d1_databases: dup }).ok, false, "a duplicated approved binding must fail closed")
  }
})

test("19. an incorrect schema version fails before Wrangler", () => {
  const wrong = String(Number(canonicalSchemaVersion()) + 1)
  const gates = gatesFor({}, { CF_D1_BOOTSTRAP_SCHEMA_VERSION: wrong },
    buildBootstrapSql({ ...VALID_VALUES, schemaVersion: wrong }, GENERATED_AT))
  assert.ok(gates.blocked.includes("operator_input_invalid"), "a non-canonical schema version must be refused")
  assert.equal(gates.canonicalSql, null)
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
    // The committed base is not an approved GENERATED config, so it is refused on
    // location before its placeholder IDs are even reached — either way, refused.
    assert.equal(gates.ok, false, "the placeholder committed config must be refused")
    assert.ok(gates.blocked.some((b) => b.startsWith("deploy_config_")), `expected a deploy-config refusal, got ${gates.blocked.join(",")}`)
    assert.equal(gates.canonicalSql, null)
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

// ─── TOCTOU: what Wrangler actually receives (11–14) ─────────────

/**
 * The apply command's Wrangler invocation, exercised WITHOUT Wrangler: the source
 * is loaded with `spawnSync`, `mkdtempSync`, and the temp root stubbed, so the
 * exact `--file` argument and its bytes can be observed. Nothing is executed.
 */
function driveApplyBootstrapFile(canonicalSql: string, options: { failWrangler?: boolean } = {}) {
  const src = readFileSync(APPLY_SRC, "utf8")
  const start = src.indexOf("function applyBootstrapFile(")
  const end = src.indexOf("\n}", start) + 2
  const body = src.slice(start, end)

  // Everything observable must be captured DURING the stubbed invocation: the
  // temporary directory is gone by the time the call returns (that is the point).
  const observed: { file?: string; bytesAtExec?: string; existedAtExec?: boolean; modeAtExec?: number } = {}
  let tempRoot = ""
  const harness = new Function("deps", `
    const { spawnSync, mkdtempSync, writeFileSync, rmSync, resolve, tmpdir, requireAuthorizedExecution, WRANGLER_BIN, REPO_ROOT, BOOTSTRAP_BINDING } = deps
    ${body}
    return applyBootstrapFile
  `)({
    spawnSync: (_bin: string, args: string[]) => {
      const i = args.indexOf("--file")
      const file = args[i + 1]
      observed.file = file
      observed.existedAtExec = existsSync(file)
      observed.bytesAtExec = readFileSync(file, "utf8")
      observed.modeAtExec = statSync(file).mode & 0o777
      return { status: options.failWrangler ? 1 : 0 }
    },
    mkdtempSync: (p: string) => { tempRoot = mkdtempSync(p); return tempRoot },
    writeFileSync, rmSync, resolve, tmpdir,
    requireAuthorizedExecution: () => {},
    WRANGLER_BIN: "/nonexistent/wrangler", REPO_ROOT, BOOTSTRAP_BINDING,
  })

  let threw: Error | null = null
  try { harness("config.json", canonicalSql) } catch (err) { threw = err as Error }
  return { observed, tempRoot, threw }
}

test("11. Wrangler receives a TEMPORARY canonical file — never the repository-root artifact", () => {
  const canonical = canonicalArtifact()
  withArtifact(() => {
    const { observed } = driveApplyBootstrapFile(canonical)
    const approved = resolve(REPO_ROOT, BOOTSTRAP_SQL_BASENAME)
    assert.ok(observed.file, "Wrangler must receive a --file argument")
    assert.notEqual(observed.file, approved, "Wrangler must NEVER receive the mutable repository-root artifact")
    assert.equal(observed.file!.startsWith(REPO_ROOT + "/"), false, "the execution file must live outside the repository")
    assert.equal(observed.bytesAtExec, canonical, "the executed bytes are the validated canonical bytes")
    // A fresh PRIVATE file, readable only by the operator.
    assert.equal(observed.modeAtExec, 0o600, "the execution file must be 0600")
    const second = driveApplyBootstrapFile(canonical)
    assert.notEqual(second.observed.file, observed.file, "each apply must use a fresh temporary directory")
  })
})

test("12. mutating the repository-root artifact AFTER validation cannot alter the executed bytes", () => {
  const canonical = canonicalArtifact()
  withArtifact((sqlPath) => {
    // Validation happened; now the artifact is rewritten in the window before
    // execution. The apply executes the bytes it retained, not the file.
    writeFileSync(sqlPath, canonical + "\nDROP TABLE tenants;\n", { mode: 0o600 })
    const { observed } = driveApplyBootstrapFile(canonical)
    assert.equal(observed.bytesAtExec, canonical, "the executed bytes must be the retained canonical bytes")
    assert.doesNotMatch(observed.bytesAtExec!, /DROP TABLE/, "a post-validation mutation must not reach Wrangler")
  })
})

test("13. the temporary execution file is removed after success", () => {
  const { observed, tempRoot } = driveApplyBootstrapFile(canonicalArtifact())
  assert.equal(observed.existedAtExec, true, "the file must exist while Wrangler reads it")
  assert.equal(existsSync(tempRoot), false, "the temporary directory must be removed after success")
  assert.equal(existsSync(observed.file!), false)
})

test("14. the temporary execution file is removed after Wrangler FAILURE", () => {
  const { observed, tempRoot, threw } = driveApplyBootstrapFile(canonicalArtifact(), { failWrangler: true })
  assert.equal(threw?.message, "wrangler_apply_failed")
  assert.equal(existsSync(tempRoot), false, "the temporary directory must be removed after a Wrangler failure")
  assert.equal(existsSync(observed.file!), false)
})

// ─── Immutable deploy-config snapshot ────────────────────────────

/**
 * Drive `main()`'s execution section without Wrangler: the source is loaded with
 * `spawnSync` stubbed, so every `--config` argument and the bytes behind it can be
 * observed. Nothing is executed, no network, no bootstrap.
 */
function driveExecution(snapshot: unknown, canonicalSql: string, options: { failWrangler?: boolean; failVerify?: boolean } = {}) {
  const src = readFileSync(APPLY_SRC, "utf8")
  const slice = (name: string) => {
    const start = src.indexOf(`function ${name}(`)
    return src.slice(start, src.indexOf("\n}", start) + 2)
  }
  const observed: Array<{ kind: string; config: string; configBytes: string; mode: number }> = []
  let executionConfig: string | null = null

  // The private execution config now comes from the SHARED authority library —
  // there is no bootstrap-only implementation to extract.
  const harness = new Function("deps", `
    const { spawnSync, mkdtempSync, writeFileSync, rmSync, resolve, tmpdir, randomBytes, readFileSync,
            createPrivateExecutionConfig, requireAuthorizedExecution, WRANGLER_BIN, REPO_ROOT, BOOTSTRAP_BINDING } = deps
    ${slice("applyBootstrapFile")}
    ${slice("remoteCount")}
    return { applyBootstrapFile, remoteCount }
  `)({
    spawnSync: (_bin: string, args: string[]) => {
      const config = args[args.indexOf("--config") + 1]
      observed.push({
        kind: args.includes("--file") ? "apply" : "verify",
        config,
        configBytes: readFileSync(config, "utf8"),
        mode: statSync(config).mode & 0o777,
      })
      if (args.includes("--file") && options.failWrangler) return { status: 1 }
      if (!args.includes("--file") && options.failVerify) return { status: 1 }
      return { status: 0, stdout: JSON.stringify([{ results: [{ c: 1 }] }]) }
    },
    mkdtempSync, writeFileSync, rmSync, resolve, tmpdir, randomBytes, readFileSync,
    createPrivateExecutionConfig,
    requireAuthorizedExecution: () => {},
    WRANGLER_BIN: "/nonexistent/wrangler", REPO_ROOT, BOOTSTRAP_BINDING,
  })

  // Run main()'s ACTUAL finally body, extracted from source — never a
  // reimplementation of it here, which could not detect main() regressing.
  const mainStart = src.indexOf("function main()")
  const finallyIdx = src.indexOf("} finally {", mainStart)
  const cleanupBody = src.slice(finallyIdx + "} finally {".length, src.indexOf("\n  }", finallyIdx))
  const runMainCleanup = new Function(
    "rmSync", "removePrivateExecutionConfig", "executionConfig", "removeBootstrapSql", "exitCode", cleanupBody,
  )

  let threw: Error | null = null
  let exitCode = 0
  try {
    executionConfig = createPrivateExecutionConfig(
      { bytes: JSON.stringify(snapshot, null, 2), snapshot: snapshot as Readonly<Record<string, unknown>> },
      { repoRoot: REPO_ROOT, purpose: "bootstrap-exec" },
    )
    harness.applyBootstrapFile(executionConfig, canonicalSql)
    harness.remoteCount(executionConfig, "SELECT COUNT(*) AS c FROM tenants WHERE id = 'x';")
  } catch (err) {
    threw = err as Error
    exitCode = 1
  } finally {
    runMainCleanup(rmSync, removePrivateExecutionConfig, executionConfig, () => {}, exitCode)
  }
  return { observed, executionConfig, threw }
}

const snapshotOf = (configPath: string) => JSON.parse(readFileSync(configPath, "utf8"))

test("Wrangler receives a PRIVATE temporary config — never the original operator config path", () => {
  withSyntheticConfig((configPath) => {
    const { observed, executionConfig } = driveExecution(snapshotOf(configPath), canonicalArtifact())
    assert.equal(observed.length, 2, "apply + verification")
    for (const call of observed) {
      assert.notEqual(call.config, configPath, "Wrangler must NEVER receive the original mutable config path")
      assert.match(call.config, /wrangler\.deploy\.bootstrap-exec-[0-9a-f]{24}\.json$/, "…it must receive the collision-resistant private execution config")
      assert.equal(call.mode, 0o600, "the execution config must be private")
      // It carries EXACTLY the validated binding ids and names.
      const cfg = JSON.parse(call.configBytes)
      const byBinding = Object.fromEntries(cfg.d1_databases.map((d: { binding: string }) => [d.binding, d]))
      assert.equal(byBinding.CONTROL_DB.database_id, SYNTHETIC_D1_IDS.CONTROL_DB)
      assert.equal(byBinding.TENANT_DB_DEFAULT.database_id, SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT)
      assert.equal(byBinding.TENANT_DB_DEFAULT.database_name, tenantBindingName())
    }
    // Apply and verification use ONE AND THE SAME snapshot — the database written
    // and the database verified can never diverge.
    assert.equal(observed[0].config, observed[1].config, "apply and verification must use the same execution config")
    assert.equal(observed[0].configBytes, observed[1].configBytes)
    // …and it is removed afterwards.
    assert.equal(existsSync(executionConfig!), false)
  })
})

test("mutating, deleting, or replacing the original config after validation cannot redirect execution", () => {
  withSyntheticConfig((configPath) => {
    const snapshot = snapshotOf(configPath) // validated snapshot, retained

    // 1. Mutate the original to point at a DIFFERENT database.
    const hijacked = snapshotOf(configPath)
    for (const db of hijacked.d1_databases) db.database_id = "dddddddd-0000-4000-8000-00000000dead"
    writeFileSync(configPath, JSON.stringify(hijacked, null, 2), { mode: 0o600 })
    let run = driveExecution(snapshot, canonicalArtifact())
    for (const call of run.observed) {
      assert.doesNotMatch(call.configBytes, /dead/, "a post-validation mutation must not reach Wrangler")
      assert.match(call.configBytes, new RegExp(SYNTHETIC_D1_IDS.CONTROL_DB))
    }

    // 2. Replace it with another otherwise-valid config.
    writeFileSync(configPath, JSON.stringify({ ...hijacked, name: "someone-elses-worker" }, null, 2), { mode: 0o600 })
    run = driveExecution(snapshot, canonicalArtifact())
    for (const call of run.observed) assert.doesNotMatch(call.configBytes, /someone-elses-worker/, "a replaced config must not redirect execution")

    // 3. Delete it entirely — execution still works from the snapshot.
    rmSync(configPath, { force: true })
    run = driveExecution(snapshot, canonicalArtifact())
    assert.equal(run.threw, null, "deleting the original config after evaluation must not break execution")
    assert.equal(run.observed.length, 2)
  })
})

test("the private execution config is removed after success, Wrangler failure, and verification failure", () => {
  withSyntheticConfig((configPath) => {
    const snapshot = snapshotOf(configPath)
    for (const [label, options] of [
      ["success", {}],
      ["Wrangler failure", { failWrangler: true }],
      ["verification failure", { failVerify: true }],
    ] as const) {
      const { executionConfig, threw } = driveExecution(snapshot, canonicalArtifact(), options)
      assert.ok(executionConfig, `${label}: an execution config must have been written`)
      assert.equal(existsSync(executionConfig!), false, `${label}: the private execution config must be removed`)
      if (label !== "success") assert.ok(threw, `${label}: must surface the failure`)
    }
    // No execution config is ever left behind at the repository root.
    assert.deepEqual(
      readdirSync(REPO_ROOT).filter((f) => f.startsWith("wrangler.deploy.bootstrap-exec-")), [],
      "no private execution config may survive",
    )
  })
})

test("the execution config is created EXCLUSIVELY — an existing file is never overwritten or followed", () => {
  // The private-config writer now lives in the SHARED authority library, which
  // bootstrap, migration apply, remote verification, and Worker deploy all use.
  const src = readFileSync(resolve(REPO_ROOT, "scripts/lib/cfDeployConfigAuthority.mjs"), "utf8")
  assert.match(src, /flag: "wx"/, "exclusive creation prevents overwriting or following a pre-placed file")
  assert.match(src, /randomBytes\(12\)\.toString\("hex"\)/, "the name must be collision-resistant")
  // The EXACT retained bytes — never a re-serialization of a mutable parsed object.
  assert.match(src, /writeFileSync\(path, authority\.bytes, \{ mode: 0o600, flag: "wx" \}\)/)
  // Bootstrap consumes the shared writer rather than keeping its own.
  const apply = readFileSync(APPLY_SRC, "utf8")
  assert.match(apply, /createPrivateExecutionConfig\(gates\.configAuthority/)
  assert.doesNotMatch(apply, /flag: "wx"/, "bootstrap must not keep a duplicate private-config writer")
})

test("no database ID or config content reaches logs", () => {
  const src = readFileSync(APPLY_SRC, "utf8")
  for (const m of src.matchAll(/console\.(log|error|warn|info)\(([^\n]*)\)/g)) {
    for (const forbidden of [/\bvalues\b/, /configSnapshot/, /snapshot/, /database_id/, /executionConfig/, /canonicalSql/]) {
      assert.doesNotMatch(m[2], forbidden, `console call must not print config/authority content: ${m[0]}`)
    }
  }
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
  const bodies = finallyBodies(src)
  assert.equal(bodies.length, 2, "apply has exactly two finally paths: the temporary execution file, and the repository-root artifact")
  for (const body of bodies) {
    assert.doesNotMatch(body.replace(/\/\/[^\n]*/g, ""), /\bif\s*\(/, "no finally cleanup may be conditional")
  }
  // The temporary execution directory is removed unconditionally…
  assert.ok(bodies.some((b) => /^\s*rmSync\(dir, \{ recursive: true, force: true \}\)\s*$/m.test(b)), "the temporary execution directory must be removed unconditionally")
  // …and so is the repository-root preparation artifact.
  assert.ok(bodies.some((b) => /^\s*removeBootstrapSql\(\)\s*$/m.test(b)), "the repository-root artifact must be removed unconditionally")
  // Cleanup runs only after the apply has been attempted — never before.
  const applyIdx = src.indexOf("applyBootstrapFile(executionConfig, gates.canonicalSql)")
  assert.ok(applyIdx > 0, "apply must execute the retained canonical bytes")
  assert.ok(applyIdx < src.lastIndexOf("removeBootstrapSql()"), "the artifact must only be removed after the apply has been attempted")
})

test("a post-verification failure is reported HONESTLY as an operator-action state, not a rollback", () => {
  const src = readFileSync(APPLY_SRC, "utf8")
  // The five INSERTs are committed by the atomic batch BEFORE the read-only
  // verification runs. Calling that a rollback would send an operator looking for
  // state that is really there.
  assert.equal(VERIFICATION_FAILED_AFTER_COMMIT, "bootstrap_verification_failed_after_commit")
  const applyIdx = src.indexOf("applyBootstrapFile(executionConfig, gates.canonicalSql)")
  const verifyIdx = src.indexOf("verifyBootstrapVia(")
  assert.ok(applyIdx > 0 && verifyIdx > applyIdx, "verification runs AFTER the batch commits — that is why this state exists")

  const branch = src.slice(src.indexOf("if (!verified.ok)"), src.indexOf("} else {", src.indexOf("if (!verified.ok)")))
  assert.match(branch, /VERIFICATION_FAILED_AFTER_COMMIT/, "the failure must name the post-commit category")
  assert.match(branch, /NOT rolled back/, "it must state the records were not rolled back")
  assert.match(branch, /Operator investigation is required/)
  assert.match(branch, /exitCode = 1/, "it must exit non-zero")
  // Only category names are reported — never a row value.
  assert.doesNotMatch(branch, /\bvalues\b/, "the post-commit failure must not print operator values")
  // And no automatic destructive compensation anywhere in the command.
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, ""), /\bDELETE FROM\b|\bDROP TABLE\b/i,
    "apply must never issue a compensating DELETE for a state it does not understand")
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
