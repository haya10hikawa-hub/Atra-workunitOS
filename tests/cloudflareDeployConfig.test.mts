import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, symlinkSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  validateD1Id,
  validateDeployConfig,
  validateGeneratedConfigLocation,
  validateAllowedOrigins,
  buildConfigWithIds,
  parseConfig,
  loadConfigFile,
  SYNTHETIC_D1_IDS,
  SYNTHETIC_ALLOWED_ORIGIN,
  GENERATED_CONFIG_GITIGNORE_RULE,
  EXPECTED_WORKER_MAIN,
  EXPECTED_ASSETS_DIR,
} from "../scripts/lib/cfDeployConfig.mjs"
import { getDeployStepMetadata } from "../scripts/cloudflare-deploy.mjs"
import { parseArgs as parsePreflightArgs } from "../scripts/cloudflare-deploy-preflight.mjs"
import { ALLOWED_ORIGIN_VECTORS } from "./helpers/allowedOriginVectors.ts"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
type LooseD1 = { binding: string; database_name?: string; database_id?: unknown }
type LooseConfig = {
  main?: string
  assets?: { directory?: string }
  vars?: Record<string, unknown>
  d1_databases: LooseD1[]
  [k: string]: unknown
}

const base = loadConfigFile(resolve(REPO_ROOT, "wrangler.json"))
assert.equal(base.ok, true, "wrangler.json must parse")
// loadConfigFile comes from an untyped .mjs helper; narrow explicitly for TS.
const baseConfig: LooseConfig = ((base as { config?: LooseConfig }).config ?? { d1_databases: [] })

// A minimal, valid deploy config with real-shaped synthetic IDs.
function validDeployConfig() {
  return buildConfigWithIds(baseConfig, SYNTHETIC_D1_IDS)
}

// ─── Target selection ───────────────────────────────────────────

test("OpenNext Worker target is selected in committed base", () => {
  assert.equal(baseConfig.main, EXPECTED_WORKER_MAIN)
  assert.equal(baseConfig.assets?.directory, EXPECTED_ASSETS_DIR)
})

test("Pages-only directives are absent from committed base", () => {
  assert.ok(!("pages_build_output_dir" in baseConfig))
})

test("Pages-only output cannot be reintroduced while OpenNext scripts are active", () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"))
  // OpenNext build script is active …
  assert.match(pkg.scripts["cf:build"], /opennextjs-cloudflare build/)
  // … so a Pages directive in the config must be rejected by validation.
  const withPages = { ...validDeployConfig(), pages_build_output_dir: ".next" }
  const res = validateDeployConfig(withPages, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.equal(res.ok, false)
  assert.ok(res.failures.includes("pages_directive_present:pages_build_output_dir"))
})

test("worker entrypoint pointing elsewhere fails", () => {
  const bad = { ...validDeployConfig(), main: "dist/nope.js" }
  const res = validateDeployConfig(bad, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.equal(res.ok, false)
  assert.ok(res.failures.includes("worker_main_mismatch"))
})

// ─── D1 bindings + IDs ──────────────────────────────────────────

test("required bindings present in base", () => {
  const names = (baseConfig.d1_databases ?? []).map((d: { binding: string }) => d.binding)
  assert.ok(names.includes("CONTROL_DB"))
  assert.ok(names.includes("TENANT_DB_DEFAULT"))
})

test("placeholder D1 IDs fail with a placeholder reason", () => {
  for (const id of ["REPLACE_WITH_CONTROL_DB_ID", "PLACEHOLDER", "TODO", "CHANGEME"]) {
    const r = validateD1Id(id)
    assert.equal(r.ok, false, `${id} must be rejected`)
    // The marker check must own this rejection (not merely the UUID format check).
    assert.equal(r.ok === false && r.reason, "placeholder", `${id} must be rejected as a placeholder`)
  }
})

test("empty and malformed D1 IDs fail", () => {
  assert.equal(validateD1Id("").ok, false)
  assert.equal(validateD1Id(undefined).ok, false)
  assert.equal(validateD1Id("not-a-uuid").ok, false)
  assert.equal(validateD1Id("00000000-0000-4000-8000").ok, false)
  assert.equal(validateD1Id("z0000000-0000-4000-8000-000000000001").ok, false)
})

test("valid synthetic D1 IDs pass", () => {
  assert.equal(validateD1Id(SYNTHETIC_D1_IDS.CONTROL_DB).ok, true)
  assert.equal(validateD1Id(SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT).ok, true)
})

test("committed base with placeholder IDs fails full deploy validation", () => {
  const res = validateDeployConfig(baseConfig, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.equal(res.ok, false)
  assert.ok(res.failures.some((f) => (f ?? "").startsWith("d1_id_placeholder:")))
})

test("committed base passes structure check when placeholders are allowed", () => {
  const res = validateDeployConfig(baseConfig, { allowPlaceholderIds: true, repoRoot: REPO_ROOT })
  assert.deepEqual(res.failures, [])
  assert.equal(res.ok, true)
})

test("duplicate bindings fail", () => {
  const dup = validDeployConfig()
  dup.d1_databases.push({ binding: "CONTROL_DB", database_name: "x", database_id: SYNTHETIC_D1_IDS.CONTROL_DB })
  const res = validateDeployConfig(dup, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.equal(res.ok, false)
  assert.ok(res.failures.includes("d1_binding_duplicate:CONTROL_DB"))
})

test("missing CONTROL_DB fails", () => {
  const cfg = validDeployConfig()
  cfg.d1_databases = cfg.d1_databases.filter((d: { binding: string }) => d.binding !== "CONTROL_DB")
  const res = validateDeployConfig(cfg, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.ok(res.failures.includes("d1_binding_missing:CONTROL_DB"))
})

test("missing TENANT_DB_DEFAULT fails", () => {
  const cfg = validDeployConfig()
  cfg.d1_databases = cfg.d1_databases.filter((d: { binding: string }) => d.binding !== "TENANT_DB_DEFAULT")
  const res = validateDeployConfig(cfg, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.ok(res.failures.includes("d1_binding_missing:TENANT_DB_DEFAULT"))
})

// ─── Safe-default vars ──────────────────────────────────────────

test("EXTERNAL_ACTIONS_ENABLED default true fails", () => {
  const cfg = validDeployConfig()
  cfg.vars.EXTERNAL_ACTIONS_ENABLED = "true"
  const res = validateDeployConfig(cfg, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.equal(res.ok, false)
  assert.ok(res.failures.includes("external_actions_not_false"))
})

test("EXTERNAL_ACTIONS_ENABLED false passes", () => {
  const res = validateDeployConfig(validDeployConfig(), { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.equal(res.ok, true)
})

test("valid synthetic deploy config passes fully", () => {
  const res = validateDeployConfig(validDeployConfig(), { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.deepEqual(res.failures, [])
})

// ─── Ignored-location + safety ──────────────────────────────────

test("config with real IDs outside approved ignored basename fails", () => {
  const res = validateDeployConfig(validDeployConfig(), { repoRoot: REPO_ROOT, configPath: resolve(REPO_ROOT, "wrangler.json") })
  assert.equal(res.ok, false)
  assert.ok(res.failures.includes("generated_config_not_ignored"))
})

test("generated config path is ignored by Git", () => {
  const gitignore = readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8")
  assert.match(gitignore, /wrangler\.deploy\*?\.json/)
})

test("preflight/validation never echoes an ID value in failures", () => {
  // Malformed, secret-looking value → must produce a failure that does NOT
  // contain the value itself.
  const secretish = "sk-live-supersecrettoken-doNOTecho"
  const cfg = buildConfigWithIds(baseConfig, { CONTROL_DB: secretish, TENANT_DB_DEFAULT: SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT })
  const res = validateDeployConfig(cfg, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.ok(res.failures.some((f) => (f ?? "").startsWith("d1_id_malformed:CONTROL_DB")))
  for (const f of res.failures as string[]) {
    assert.ok(!f.includes(secretish), "failure category must not contain an ID value")
  }
})

test("malformed config fails closed (unparseable)", () => {
  assert.equal(parseConfig("{ not json").ok, false)
  assert.equal(parseConfig("[]").ok, false)
  assert.equal(parseConfig("42").ok, false)
})

// ─── Artifact checks (isolated temp roots, not the real repo) ──

test("missing worker/asset artifacts fail when checkArtifacts is on", () => {
  const res = validateDeployConfig(validDeployConfig(), {
    checkArtifacts: true,
    repoRoot: resolve(REPO_ROOT, "tests/__nonexistent_root__"),
    configPath: "wrangler.deploy.json",
  })
  assert.ok(res.failures.includes("worker_artifact_missing"))
  assert.ok(res.failures.includes("assets_artifact_missing"))
})

// ─── Deploy orchestration cannot bypass prepare/preflight ──────

test("deploy pipeline runs prepare and preflight before deploy", () => {
  const names = getDeployStepMetadata().map((s) => s.name)
  assert.ok(names.includes("prepare"))
  assert.ok(names.includes("preflight"))
  assert.ok(names.includes("deploy"))
  assert.ok(names.indexOf("prepare") < names.indexOf("preflight"))
  assert.ok(names.indexOf("preflight") < names.indexOf("deploy"))
  assert.ok(names.indexOf("build") < names.indexOf("deploy"))
})

test("dry-run script uses --dry-run and never a bare deploy", () => {
  const src = readFileSync(resolve(REPO_ROOT, "scripts/cloudflare-deploy-dry-run.mjs"), "utf8")
  assert.match(src, /"--dry-run"/)
})

test("committed wrangler.json contains no production D1 IDs", () => {
  for (const db of baseConfig.d1_databases ?? []) {
    assert.equal(validateD1Id(db.database_id).ok, false, `${db.binding} must stay a placeholder in committed config`)
  }
})

test("route repository helper derives persistence only from the validated runtime config", () => {
  const src = readFileSync(resolve(REPO_ROOT, "app/lib/persistence/routeRepositories.ts"), "utf8")
  // Persistence must come from the request-scoped validated runtime config …
  assert.match(src, /resolveValidatedRequestRuntimeConfig|rt\.persistence/)
  // … never from client-controlled request input (body/headers/query).
  assert.doesNotMatch(src, /\.headers\b/)
  assert.doesNotMatch(src, /\.json\(\)/)
  assert.doesNotMatch(src, /searchParams/)
  assert.doesNotMatch(src, /req(uest)?\.(body|nextUrl)/)
})

test("no CI or test path runs a real (non-dry-run) wrangler deploy", () => {
  const ci = readFileSync(resolve(REPO_ROOT, ".github/workflows/ci.yml"), "utf8")
  // CI never invokes a bare `wrangler deploy`.
  assert.doesNotMatch(ci, /wrangler deploy(?!.*--dry-run)/)
  assert.doesNotMatch(ci, /cf:deploy\b(?!:)/) // cf:deploy but not cf:deploy:*
  // The real upload is gated behind an explicit execute flag in the orchestrator.
  const orch = readFileSync(resolve(REPO_ROOT, "scripts/cloudflare-deploy.mjs"), "utf8")
  assert.match(orch, /CF_DEPLOY_EXECUTE/)
})

// ─── Strict generated-config location (Blocker 2) ───────────────

test("/tmp/wrangler.deploy.json fails (outside repo root)", () => {
  const r = validateGeneratedConfigLocation("/tmp/wrangler.deploy.json", REPO_ROOT)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.failure, "generated_config_outside_repo_root")
})

test("subdir/wrangler.deploy.json fails (subdirectory not approved)", () => {
  const r = validateGeneratedConfigLocation(resolve(REPO_ROOT, "subdir/wrangler.deploy.json"), REPO_ROOT)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.failure, "generated_config_in_subdirectory")
})

test("../wrangler.deploy.json fails (parent escape)", () => {
  const r = validateGeneratedConfigLocation(resolve(REPO_ROOT, "../wrangler.deploy.json"), REPO_ROOT)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.failure, "generated_config_outside_repo_root")
})

test("repository-root wrangler.deploy.json passes", () => {
  assert.equal(validateGeneratedConfigLocation(resolve(REPO_ROOT, "wrangler.deploy.json"), REPO_ROOT).ok, true)
})

test("repository-root wrangler.deploy.synthetic.json passes (synthetic dry-run)", () => {
  assert.equal(validateGeneratedConfigLocation(resolve(REPO_ROOT, "wrangler.deploy.synthetic.json"), REPO_ROOT).ok, true)
})

test("a symlink escaping the repository fails", () => {
  // Create <root>/<tmp-symlink> → outside dir, then place a deploy config "inside"
  // the symlinked dir. realpath must reject the escape. Skipped if symlinks unsupported.
  const outside = mkdtempSync(resolve(tmpdir(), "cf-escape-"))
  const linkName = `deploy-escape-${process.pid}`
  const linkPath = resolve(REPO_ROOT, linkName)
  try {
    symlinkSync(outside, linkPath, "dir")
  } catch {
    return // platform without symlink support
  }
  try {
    const r = validateGeneratedConfigLocation(resolve(linkPath, "wrangler.deploy.json"), REPO_ROOT)
    assert.equal(r.ok, false)
    assert.equal(r.ok === false && r.failure, "generated_config_symlink_escape")
  } finally {
    rmSync(linkPath, { force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test("a config with real IDs at a subdirectory path fails full validation", () => {
  const res = validateDeployConfig(validDeployConfig(), {
    repoRoot: REPO_ROOT,
    configPath: resolve(REPO_ROOT, "subdir/wrangler.deploy.json"),
  })
  assert.equal(res.ok, false)
  assert.ok(res.failures.includes("generated_config_in_subdirectory"))
})

test("a repository-root FILE symlink to an outside file fails", () => {
  // wrangler.deploy.json -> /tmp/outside.json : valid parent + basename, but the
  // file is a symlink that escapes the repo → must be rejected.
  const outside = mkdtempSync(resolve(tmpdir(), "cf-file-escape-"))
  writeFileSync(resolve(outside, "outside.json"), "{}")
  const linkPath = resolve(REPO_ROOT, `wrangler.deploy.symlinktest-${process.pid}.json`)
  try {
    symlinkSync(resolve(outside, "outside.json"), linkPath)
  } catch {
    return // platform without symlink support
  }
  try {
    const r = validateGeneratedConfigLocation(linkPath, REPO_ROOT)
    assert.equal(r.ok, false)
    assert.equal(r.ok === false && r.failure, "generated_config_symlink_escape")
  } finally {
    rmSync(linkPath, { force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test("a repository-root REGULAR file passes", () => {
  const filePath = resolve(REPO_ROOT, `wrangler.deploy.regulartest-${process.pid}.json`)
  writeFileSync(filePath, "{}")
  try {
    assert.equal(validateGeneratedConfigLocation(filePath, REPO_ROOT).ok, true)
  } finally {
    rmSync(filePath, { force: true })
  }
})

test("a non-existing approved prepare path passes (prepare stage)", () => {
  // The generated config does not exist yet during prepare — must be allowed.
  assert.equal(validateGeneratedConfigLocation(resolve(REPO_ROOT, `wrangler.deploy.notyet-${process.pid}.json`), REPO_ROOT).ok, true)
})

// ─── Production auth provisioning documentation ─────────────────

test("deployment docs document JWT secret provisioning via wrangler secret", () => {
  const doc = readFileSync(resolve(REPO_ROOT, "docs/operations/CLOUDFLARE_RUNTIME_DEPLOYMENT.md"), "utf8")
  // AUTH_ADAPTER=jwt is a non-secret Worker var; the secret is provisioned out of band.
  assert.match(doc, /AUTH_ADAPTER=jwt/)
  assert.match(doc, /wrangler secret put JWT_AUTH_SECRET/)
  // Deploying only the base config leaves auth fail-closed; D1 records are prerequisite.
  assert.match(doc, /fail-closed|fail closed/)
  assert.match(doc, /auth_identities|membership/)
})

test("the exact .gitignore rule for generated deploy configs is present", () => {
  const gitignore = readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8")
  const rules = gitignore.split("\n").map((l) => l.trim())
  assert.ok(rules.includes(GENERATED_CONFIG_GITIGNORE_RULE), `.gitignore must contain ${GENERATED_CONFIG_GITIGNORE_RULE}`)
})

// ─── Exact D1 binding allowlist ─────────────────────────────────

test("an unknown D1 binding in the deploy config fails", () => {
  const cfg = validDeployConfig()
  cfg.d1_databases.push({ binding: "SHADOW_DB", database_name: "shadow", database_id: SYNTHETIC_D1_IDS.CONTROL_DB })
  const res = validateDeployConfig(cfg, { repoRoot: REPO_ROOT, configPath: "wrangler.deploy.json" })
  assert.equal(res.ok, false)
  assert.ok(res.failures.includes("d1_binding_unknown:SHADOW_DB"))
})

test("ASSETS remains an assets binding, not a D1 binding", () => {
  assert.equal(baseConfig.assets?.directory, EXPECTED_ASSETS_DIR)
  const d1Names = (baseConfig.d1_databases ?? []).map((d: { binding: string }) => d.binding)
  assert.ok(!d1Names.includes("ASSETS"))
})

// ─── Preflight argument parsing ─────────────────────────────────

test("preflight rejects unknown arguments", () => {
  assert.equal(parsePreflightArgs(["--bogus"]).ok, false)
  assert.equal(parsePreflightArgs(["--config", "x", "extra"]).ok, false)
})

test("preflight rejects --config without a value", () => {
  assert.equal(parsePreflightArgs(["--config"]).ok, false)
  assert.equal(parsePreflightArgs(["--config", "--check-artifacts"]).ok, false)
})

test("preflight accepts valid argument combinations", () => {
  assert.equal(parsePreflightArgs([]).ok, true)
  assert.equal(parsePreflightArgs(["--check-artifacts"]).ok, true)
  const p = parsePreflightArgs(["--config", "wrangler.deploy.json", "--check-artifacts"])
  assert.equal(p.ok, true)
  assert.equal(p.ok && (p.args as { config?: string | null } | undefined)?.config, "wrangler.deploy.json")
})

// ─── Physical D1 separation (shared invariant) ──────────────────

/**
 * `CONTROL_DB is never tenant-data storage` is an ARCHITECTURE guarantee. The
 * control registry holds tenants/users/identities and decides which database a
 * tenant's data lives in — so assigning ONE physical database to both approved
 * bindings would put tenant rows inside the control registry and let a tenant
 * migration lane rewrite the control schema. Validating each id on its own cannot
 * see that, which is why the rule lives in the SHARED validator every command uses.
 *
 * Synthetic UUIDs only.
 */
const SAME_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3300"
const OTHER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
const validate = (config: unknown) => validateDeployConfig(config, { repoRoot: REPO_ROOT, allowPlaceholderIds: false })
/** Rebuild the committed base with explicit ids and (optionally) names. */
function configWith({ controlId = SYNTHETIC_D1_IDS.CONTROL_DB, tenantId = SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT, controlName, tenantName }:
  { controlId?: string; tenantId?: string; controlName?: string; tenantName?: string }): LooseConfig {
  const cfg = buildConfigWithIds(baseConfig, { CONTROL_DB: controlId, TENANT_DB_DEFAULT: tenantId }, { allowedOrigins: "https://app.example.test" }) as LooseConfig
  for (const db of cfg.d1_databases) {
    if (db.binding === "CONTROL_DB" && controlName !== undefined) db.database_name = controlName
    if (db.binding === "TENANT_DB_DEFAULT" && tenantName !== undefined) db.database_name = tenantName
  }
  return cfg
}

test("1. distinct valid Control and Tenant D1 IDs pass", () => {
  assert.deepEqual(validate(configWith({ controlId: SAME_ID, tenantId: OTHER_ID })).failures, [])
})

test("2 + 3. identical valid IDs fail — even when the database names differ", () => {
  assert.ok(validate(configWith({ controlId: SAME_ID, tenantId: SAME_ID })).failures
    .includes("d1_database_id_collision:CONTROL_DB:TENANT_DB_DEFAULT"))
  // Distinct names cannot rescue one physical database serving both bindings.
  assert.ok(validate(configWith({ controlId: SAME_ID, tenantId: SAME_ID, controlName: "ctl-db", tenantName: "tenant-db" })).failures
    .includes("d1_database_id_collision:CONTROL_DB:TENANT_DB_DEFAULT"))
})

test("4 + 5. a missing Control or Tenant binding fails", () => {
  for (const missing of ["CONTROL_DB", "TENANT_DB_DEFAULT"]) {
    const cfg = validDeployConfig() as LooseConfig
    cfg.d1_databases = cfg.d1_databases.filter((d) => d.binding !== missing)
    assert.ok(validate(cfg).failures.includes(`d1_binding_missing:${missing}`), `${missing} must be required`)
  }
})

test("6 + 7. a duplicated Control or Tenant binding fails", () => {
  for (const dup of ["CONTROL_DB", "TENANT_DB_DEFAULT"]) {
    const cfg = validDeployConfig() as LooseConfig
    const entry = cfg.d1_databases.find((d) => d.binding === dup)!
    cfg.d1_databases = [...cfg.d1_databases, { ...entry }]
    assert.ok(validate(cfg).failures.includes(`d1_binding_duplicate:${dup}`), `a duplicated ${dup} must fail closed`)
  }
})

test("8 + 9 + 10. a malformed, empty, or placeholder database name fails", () => {
  for (const [name, reason] of [
    ["", "empty"],
    ["bad name!@#", "malformed"],
    ["Upper-Case", "malformed"],
    ["x".repeat(80), "malformed"],
    ["REPLACE_WITH_NAME", "placeholder"],
    ["todo-fill-me", "placeholder"],
  ] as const) {
    assert.ok(validate(configWith({ controlName: name })).failures.includes(`d1_name_${reason}:CONTROL_DB`), `name ${JSON.stringify(name)} must fail as ${reason}`)
  }
  // A missing name is `empty`, never silently accepted.
  const cfg = validDeployConfig() as LooseConfig
  delete cfg.d1_databases.find((d) => d.binding === "TENANT_DB_DEFAULT")!.database_name
  assert.ok(validate(cfg).failures.includes("d1_name_empty:TENANT_DB_DEFAULT"))
  // The committed names are real and pass.
  assert.deepEqual(validate(validDeployConfig()).failures, [])
})

test("11. ambiguous duplicate database names fail", () => {
  // Wrangler resolves a binding by id, so an alias would not by itself misroute —
  // but two bindings sharing one name make every operator-facing artifact (plan
  // output, wrangler prompts, the bootstrap registry row that must match
  // TENANT_DB_DEFAULT) ambiguous about which database is meant. Fail closed.
  assert.ok(validate(configWith({ controlName: "same-db", tenantName: "same-db" })).failures
    .includes("d1_database_name_collision:CONTROL_DB:TENANT_DB_DEFAULT"))
  assert.deepEqual(validate(configWith({ controlName: "ctl-db", tenantName: "tenant-db" })).failures, [])
})

test("12. no D1 separation failure contains an ID or a database name value", () => {
  const results = [
    validate(configWith({ controlId: SAME_ID, tenantId: SAME_ID })),
    validate(configWith({ controlName: "same-db", tenantName: "same-db" })),
    validate(configWith({ controlName: "REPLACE_WITH_NAME" })),
    validate(configWith({ controlName: "bad name!@#" })),
  ]
  for (const result of results) {
    const serialized = JSON.stringify(result.failures)
    for (const value of [SAME_ID, OTHER_ID, "same-db", "REPLACE_WITH_NAME", "bad name!@#", "workunit-tenant", "workunit-control-db"]) {
      assert.equal(serialized.includes(value), false, `a failure must never echo ${value}`)
    }
    for (const f of result.failures as string[]) assert.match(f, /^[a-z0-9_]+(:[A-Z_]+)*$/, `reason ${f} must be a safe category`)
  }
})

test("the ID-collision rule applies regardless of allowPlaceholderIds, and never fires on the committed placeholder base", () => {
  // The rule is about CONCRETE ids, so it must not depend on the placeholder flag…
  const collided = configWith({ controlId: SAME_ID, tenantId: SAME_ID })
  for (const allowPlaceholderIds of [true, false]) {
    assert.ok(validateDeployConfig(collided, { repoRoot: REPO_ROOT, allowPlaceholderIds }).failures
      .includes("d1_database_id_collision:CONTROL_DB:TENANT_DB_DEFAULT"), `must fire with allowPlaceholderIds=${allowPlaceholderIds}`)
  }
  // …and the committed base (two DIFFERENT placeholder ids) must stay valid for the
  // preflight self-check, which is what publishes a safe config.
  assert.deepEqual(validateDeployConfig(baseConfig, { repoRoot: REPO_ROOT, allowPlaceholderIds: true }).failures, [])
})

// ─── CSRF allowed-origins deploy contract (Issue #176) ──────────
// Shared vectors keep the deploy + runtime validators aligned.

test("validateAllowedOrigins accepts the shared valid vectors, normalized + deduplicated", () => {
  for (const v of ALLOWED_ORIGIN_VECTORS.valid) {
    const res = validateAllowedOrigins(v.raw)
    assert.ok(res.ok, "valid vector must pass")
    if (res.ok) assert.deepEqual(res.origins, [...v.origins])
  }
})

test("validateAllowedOrigins rejects the shared malformed vectors (safe category only)", () => {
  for (const raw of ALLOWED_ORIGIN_VECTORS.malformed) {
    const res = validateAllowedOrigins(raw)
    assert.equal(res.ok, false)
    if (!res.ok) {
      assert.ok(res.reason === "malformed" || res.reason === "missing")
      // No output echoes the configured origin value.
      assert.ok(!String(res.reason).includes("example.com"))
    }
  }
})

test("full validation rejects a missing / placeholder / malformed deploy origin", () => {
  const missing = buildConfigWithIds(baseConfig, SYNTHETIC_D1_IDS) as LooseConfig & { vars: Record<string, unknown> }
  delete missing.vars.ALLOWED_ORIGINS
  assert.ok(validateDeployConfig(missing, { repoRoot: REPO_ROOT }).failures.includes("allowed_origins_missing"))

  const placeholder = buildConfigWithIds(baseConfig, SYNTHETIC_D1_IDS) as LooseConfig & { vars: Record<string, unknown> }
  placeholder.vars.ALLOWED_ORIGINS = "REPLACE_WITH_ALLOWED_ORIGINS"
  assert.ok(validateDeployConfig(placeholder, { repoRoot: REPO_ROOT }).failures.includes("allowed_origins_placeholder"))

  const malformed = buildConfigWithIds(baseConfig, SYNTHETIC_D1_IDS) as LooseConfig & { vars: Record<string, unknown> }
  malformed.vars.ALLOWED_ORIGINS = "*"
  assert.ok(validateDeployConfig(malformed, { repoRoot: REPO_ROOT }).failures.includes("allowed_origins_malformed"))
})

test("committed base placeholder origin is accepted only under the base-structure check", () => {
  assert.ok(validateDeployConfig(baseConfig, { repoRoot: REPO_ROOT, allowPlaceholderIds: true }).failures.every((f) => !String(f).startsWith("allowed_origins_")))
  assert.ok(validateDeployConfig(baseConfig, { repoRoot: REPO_ROOT, allowPlaceholderIds: false }).failures.includes("allowed_origins_placeholder"))
})

test("synthetic config carries ONLY the approved synthetic origin", () => {
  const synthetic = buildConfigWithIds(baseConfig, SYNTHETIC_D1_IDS) as LooseConfig & { vars: Record<string, unknown> }
  assert.equal(synthetic.vars.ALLOWED_ORIGINS, SYNTHETIC_ALLOWED_ORIGIN)
  assert.deepEqual(validateDeployConfig(synthetic, { repoRoot: REPO_ROOT, configPath: `${REPO_ROOT}/wrangler.deploy.synthetic.json` }).failures, [])
})

test("a real-id config gets NO synthetic origin auto-injected (must be explicit or fail)", () => {
  const realIds = { CONTROL_DB: "11111111-1111-4111-8111-111111111111", TENANT_DB_DEFAULT: "22222222-2222-4222-8222-222222222222" }
  const cfg = buildConfigWithIds(baseConfig, realIds) as LooseConfig & { vars: Record<string, unknown> }
  // No auto-inject: the base placeholder remains → full validation fails closed.
  assert.notEqual(cfg.vars.ALLOWED_ORIGINS, SYNTHETIC_ALLOWED_ORIGIN)
  assert.ok(validateDeployConfig(cfg, { repoRoot: REPO_ROOT, configPath: `${REPO_ROOT}/wrangler.deploy.json` }).failures.includes("allowed_origins_placeholder"))
})
