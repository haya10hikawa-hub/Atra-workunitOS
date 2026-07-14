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
  buildConfigWithIds,
  parseConfig,
  loadConfigFile,
  SYNTHETIC_D1_IDS,
  GENERATED_CONFIG_GITIGNORE_RULE,
  EXPECTED_WORKER_MAIN,
  EXPECTED_ASSETS_DIR,
} from "../scripts/lib/cfDeployConfig.mjs"
import { DEPLOY_STEPS } from "../scripts/cloudflare-deploy.mjs"
import { parseArgs as parsePreflightArgs } from "../scripts/cloudflare-deploy-preflight.mjs"

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
  const names = DEPLOY_STEPS.map((s) => s.name)
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
