/**
 * P0-FIX-018 — non-bypassable Cloudflare remote execution boundaries (Issue #155).
 *
 * Repairs two confirmed defects: (1) Worker deploy was reachable through the exported
 * `runPipeline(authority, true)` without the CLI `CF_DEPLOY_EXECUTE` gate; (2) remote
 * D1 schema verification was reachable through exported `verifyRemoteSchemasWithAuthority`
 * / `makeWranglerReadOnlyRunner` without the `--remote` gate. Both are now
 * ENTRYPOINT-ONLY: the pipeline and every remote-capable leaf are private, guarded by
 * a module-private authorization latch that only `main()` opens after all gates.
 *
 * Behavioural tests drive the REAL command entrypoints as subprocesses with Cloudflare
 * stubbed ONLY at the process boundary, and exercise the real private leaves by source
 * slice + eval. NOTHING here contacts Cloudflare.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import * as deployModule from "../scripts/cloudflare-deploy.mjs"
import * as schemaModule from "../scripts/cf-d1-schema-verify-remote.mjs"
import { deployAuthorityDigestsMatch, validateDeployStepOrder } from "../scripts/cloudflare-deploy.mjs"
import { withPrivateExecutionConfig } from "../scripts/lib/cfDeployConfigAuthority.mjs"
import { isReadOnlyIntrospectionSql } from "../scripts/lib/d1SchemaContract.mjs"
import { makeDeployRepo, runDeployCommand, writeGeneratedDeployConfig, sliceFunction } from "./cloudflareDeployHarness.mts"
import { makeAuthority, REPO_ROOT } from "./evidenceTestRepo.mts"

const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")
const AUTHORITY = makeAuthority()
const OWN_EXEC = /^wrangler\.deploy\.[a-z]+-exec-[0-9a-f]+\.json$/
const execFilesAtRoot = () => readdirSync(REPO_ROOT).filter((f) => OWN_EXEC.test(f))
/**
 * `node --test` runs test FILES in parallel, and sibling suites transiently create
 * their own scoped configs at the repo root. So we assert that a slice-eval created
 * NO NEW scoped config, relative to a baseline captured just before — never that the
 * shared root is absolutely empty.
 */
const assertNoNewExecConfig = (before: string[]) => {
  const now = execFilesAtRoot()
  assert.deepEqual(now.filter((f) => !before.includes(f)), [], "no NEW scoped execution config was left behind")
}

// ─── 1–5, 12–15. export surfaces cannot reach remote execution ────

test("1 + 2 + 3 + 4. the deploy module exports NO runPipeline/RunPipelineDeps and no execution/spawn/runner/deps seam", () => {
  assert.equal((deployModule as Record<string, unknown>).runPipeline, undefined, "runPipeline must not be exported")
  assert.equal((deployModule as Record<string, unknown>).DEPLOY_STEPS, undefined, "DEPLOY_STEPS must not be exported")
  assert.equal((deployModule as Record<string, unknown>).runStep, undefined)
  // The ONLY exports are pure, non-authorizing information.
  assert.deepEqual(Object.keys(deployModule).sort(), ["deployAuthorityDigestsMatch", "getDeployStepMetadata", "validateDeployStepOrder"])
  // The declarations (comments stripped — prose explaining what is GONE must not trip
  // the guard) expose no RunPipelineDeps / execution boolean / provider seam.
  const decl = readFileSync(resolve(REPO_ROOT, "scripts/cloudflare-deploy.d.mts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")
  assert.doesNotMatch(decl, /RunPipelineDeps|runPipeline|DEPLOY_STEPS/)
  assert.doesNotMatch(decl, /execute\b|\bspawn\b|\brunner\b|\bdeps\b|verifyRemoteSchemas/, "no declared export accepts an execution flag or provider seam")
})

test("5. importing the deploy module cannot reach Worker deploy — the exports are pure and spawn nothing", () => {
  // Calling every export with hostile arguments performs no I/O and returns pure data.
  assert.deepEqual(validateDeployStepOrder(["prepare", "preflight", "build", "verify", "verify-remote-schema", "deploy"]), { ok: true, failures: [] })
  assert.equal(deployAuthorityDigestsMatch(true as unknown as string, true as unknown as string), false)
})

test("12 + 13 + 14 + 15. the schema module exports NO remote runner/verifier and its declarations expose none", () => {
  assert.equal((schemaModule as Record<string, unknown>).makeWranglerReadOnlyRunner, undefined)
  assert.equal((schemaModule as Record<string, unknown>).verifyRemoteSchemasWithAuthority, undefined)
  assert.deepEqual(Object.keys(schemaModule).sort(), ["evaluateRemoteVerifyGates"])
  const decl = readFileSync(resolve(REPO_ROOT, "scripts/cf-d1-schema-verify-remote.d.mts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")
  assert.doesNotMatch(decl, /makeWranglerReadOnlyRunner|verifyRemoteSchemasWithAuthority|VerifyWithAuthorityOptions/)
  assert.doesNotMatch(decl, /\bspawn\b|\brunner\b/, "no declared export exposes a remote process runner")
  // Importing + calling the only export (pure gate eval) performs no remote query.
  const gates = (schemaModule as { evaluateRemoteVerifyGates: (i: unknown) => { ok: boolean } }).evaluateRemoteVerifyGates({ argv: [], repoRoot: REPO_ROOT })
  assert.equal(gates.ok, false)
})

test("REPRODUCTION CLOSED. the pre-repair library bypasses (runPipeline / verifyRemoteSchemasWithAuthority) no longer exist", () => {
  // A1: runPipeline(authority, true) reached wrangler deploy with no CF_DEPLOY_EXECUTE.
  assert.equal((deployModule as Record<string, unknown>).runPipeline, undefined)
  // A2: verifyRemoteSchemasWithAuthority / makeWranglerReadOnlyRunner reached Wrangler
  // introspection with no --remote gate.
  assert.equal((schemaModule as Record<string, unknown>).verifyRemoteSchemasWithAuthority, undefined)
  assert.equal((schemaModule as Record<string, unknown>).makeWranglerReadOnlyRunner, undefined)
})

// ─── 6 + 7 + 8. entrypoint gate: no remote without CF_DEPLOY_EXECUTE=1 ──

test("6 + 7. deploy stops before the FIRST remote action without CF_DEPLOY_EXECUTE=1 (absent AND =0)", () => {
  const repo = makeDeployRepo()
  try {
    for (const env of [{}, { CF_DEPLOY_EXECUTE: "0" }]) {
      const r = runDeployCommand(repo, "scripts/cloudflare-deploy.mjs", [], env)
      assert.equal(r.status, 0, `an offline run stops cleanly (env=${JSON.stringify(env)})`)
      assert.deepEqual(r.wranglerCalls, [], "no wrangler remote call may occur")
      assert.match(r.stdout, /stopping before remote schema verification \+ upload/)
      assert.doesNotMatch(r.stdout, /execution latch opened/, "the latch is never opened offline")
      assert.deepEqual(r.scopedConfigsLeft, [])
    }
  } finally { repo.cleanup() }
})

test("8 + 10 + 20. only the entrypoint (CF_DEPLOY_EXECUTE=1) reaches remote; it verifies schema, then deploys, then closes the latch", () => {
  const repo = makeDeployRepo()
  try {
    const r = runDeployCommand(repo, "scripts/cloudflare-deploy.mjs", [], { CF_DEPLOY_EXECUTE: "1" })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /execution latch opened/)
    // Schema introspection happened BEFORE the deploy upload.
    const firstDeploy = r.wranglerCalls.indexOf("deploy")
    const introspections = r.wranglerCalls.filter((c) => c.startsWith("d1-execute")).length
    assert.ok(introspections >= 2, "both bindings are introspected")
    assert.ok(firstDeploy > 0, "wrangler deploy runs")
    assert.ok(r.wranglerCalls.slice(0, firstDeploy).some((c) => c.startsWith("d1-execute")), "schema verified before upload")
    assert.match(r.stdout, /execution latch closed/)
    assert.match(r.stdout, /cf:deploy: complete\./)
    assert.deepEqual(r.scopedConfigsLeft, [], "no scoped execution config survives")
  } finally { repo.cleanup() }
})

test("11. the deploy latch closes after a FAILURE (wrangler deploy fails)", () => {
  const repo = makeDeployRepo()
  try {
    const r = runDeployCommand(repo, "scripts/cloudflare-deploy.mjs", [], { CF_DEPLOY_EXECUTE: "1", WRANGLER_STUB_DEPLOY: "fail" })
    assert.equal(r.status, 1)
    assert.ok(r.wranglerCalls.includes("deploy"), "the deploy was attempted")
    assert.match(r.stdout, /execution latch opened/)
    assert.match(r.stdout, /execution latch closed/, "the latch is closed even when the deploy fails")
  } finally { repo.cleanup() }
})

test("14 + 20b. a schema-verification failure PREVENTS the deploy upload", () => {
  const repo = makeDeployRepo()
  try {
    const r = runDeployCommand(repo, "scripts/cloudflare-deploy.mjs", [], { CF_DEPLOY_EXECUTE: "1", WRANGLER_STUB_SCHEMA: "empty" })
    assert.equal(r.status, 1)
    assert.ok(r.wranglerCalls.some((c) => c.startsWith("d1-execute")), "schema introspection was attempted")
    assert.equal(r.wranglerCalls.includes("deploy"), false, "deploy must NOT run after a failed schema verification")
    assert.match(r.stdout, /execution latch closed/)
  } finally { repo.cleanup() }
})

// ─── 9 + 18. every remote leaf requires the private latch ─────────

/** Build a private leaf from source with controllable dependencies. */
function evalDeployLeaf(signature: string, name: string, deps: Record<string, unknown>) {
  const body = sliceFunction("scripts/cloudflare-deploy.mjs", signature)
  const keys = Object.keys(deps)
  return new Function(...keys, `${body}\nreturn ${name}`)(...keys.map((k) => deps[k]))
}
function evalSchemaLeaf(signature: string, name: string, deps: Record<string, unknown>) {
  const body = sliceFunction("scripts/cf-d1-schema-verify-remote.mjs", signature)
  const keys = Object.keys(deps)
  return new Function(...keys, `${body}\nreturn ${name}`)(...keys.map((k) => deps[k]))
}

test("9. the deploy read-only runner REQUIRES the latch before any scoped config or spawn", () => {
  const calls: string[] = []
  const runner = evalDeployLeaf("function deployReadOnlyRunner(", "deployReadOnlyRunner", {
    requireDeployExecutionAuthorized: () => { throw new Error("deploy_execution_not_authorized") },
    isReadOnlyIntrospectionSql, withPrivateExecutionConfig, spawnSync: () => { calls.push("spawn"); return { status: 0, stdout: "[]" } },
    WRANGLER_BIN: "/nonexistent/wrangler", REPO_ROOT,
  })("CONTROL_DB", AUTHORITY)
  const before9 = execFilesAtRoot()
  assert.throws(() => runner("SELECT name FROM sqlite_master WHERE type = 'table'"), /deploy_execution_not_authorized/)
  assert.deepEqual(calls, [], "a closed latch means Wrangler is never spawned")
  assertNoNewExecConfig(before9)
})

test("18. the schema read-only runner REQUIRES the latch before any scoped config or spawn", () => {
  const calls: string[] = []
  const runner = evalSchemaLeaf("function wranglerReadOnlyRunner(", "wranglerReadOnlyRunner", {
    requireSchemaVerificationAuthorized: () => { throw new Error("schema_verification_not_authorized") },
    isReadOnlyIntrospectionSql, withPrivateExecutionConfig, spawnSync: () => { calls.push("spawn"); return { status: 0, stdout: "[]" } },
    WRANGLER_BIN: "/nonexistent/wrangler", REPO_ROOT,
  })("CONTROL_DB", AUTHORITY)
  const before18 = execFilesAtRoot()
  assert.throws(() => runner("SELECT name FROM sqlite_master WHERE type = 'table'"), /schema_verification_not_authorized/)
  assert.deepEqual(calls, [])
  assertNoNewExecConfig(before18)
})

// ─── 12 + 17. read-only classification before file creation ───────

test("17. the private schema runner rejects non-read-only SQL BEFORE creating any scoped config", () => {
  const calls: string[] = []
  const runner = evalSchemaLeaf("function wranglerReadOnlyRunner(", "wranglerReadOnlyRunner", {
    requireSchemaVerificationAuthorized: () => {}, // latch open
    isReadOnlyIntrospectionSql, withPrivateExecutionConfig, spawnSync: () => { calls.push("spawn"); return { status: 0, stdout: "[]" } },
    WRANGLER_BIN: "/nonexistent/wrangler", REPO_ROOT,
  })("CONTROL_DB", AUTHORITY)
  const before17 = execFilesAtRoot()
  for (const bad of ["DROP TABLE tenants", "INSERT INTO tenants (id) VALUES ('x')", "UPDATE tenants SET status='x'", "DELETE FROM tenants", "PRAGMA foreign_keys = ON"]) {
    assert.throws(() => runner(bad), /non_read_only_query_blocked/, `${bad} must be blocked`)
  }
  assert.deepEqual(calls, [], "a mutation is never spawned")
  assertNoNewExecConfig(before17)
  // A read-only query with the latch open DOES pass classification (and mints+drops a config).
  const readCalls: string[] = []
  const okRunner = evalSchemaLeaf("function wranglerReadOnlyRunner(", "wranglerReadOnlyRunner", {
    requireSchemaVerificationAuthorized: () => {}, isReadOnlyIntrospectionSql, withPrivateExecutionConfig,
    spawnSync: (_bin: string, args: string[]) => { readCalls.push(args.indexOf("--config") >= 0 ? "config" : "none"); return { status: 0, stdout: JSON.stringify([{ results: [] }]) } },
    WRANGLER_BIN: "/nonexistent/wrangler", REPO_ROOT,
  })("CONTROL_DB", AUTHORITY)
  const before17b = execFilesAtRoot()
  assert.doesNotThrow(() => okRunner("SELECT name FROM sqlite_master WHERE type = 'table'"))
  assert.deepEqual(readCalls, ["config"], "a read-only query reaches Wrangler with a scoped config")
  assertNoNewExecConfig(before17b)
})

// ─── 21. authority-digest equality before upload ──────────────────

test("21. deployAuthorityDigestsMatch requires identical 64-hex digests, and a mismatch prevents the deploy upload", () => {
  const digest = "a".repeat(64)
  assert.equal(deployAuthorityDigestsMatch(digest, digest), true)
  assert.equal(deployAuthorityDigestsMatch(digest, "b".repeat(64)), false)
  assert.equal(deployAuthorityDigestsMatch("not-hex", "not-hex"), false, "a non-digest is never a match")
  assert.equal(deployAuthorityDigestsMatch(null, null), false)
  // In the remote region, a verified digest ≠ the deploy authority digest aborts before upload.
  const calls: string[] = []
  const runRemote = evalDeployLeaf("function runRemotePipeline(", "runRemotePipeline", {
    requireDeployExecutionAuthorized: () => {},
    console: { log: () => {}, error: () => {} },
    verifyRemoteSchemasForDeploy: () => ({ ok: true, failures: [], authorityDigest: "b".repeat(64) }),
    deployAuthorityDigestsMatch, withPrivateExecutionConfig,
    spawnSync: (_bin: string, args: string[]) => { calls.push(args[0]); return { status: 0 } },
    WRANGLER_BIN: "/nonexistent/wrangler", REPO_ROOT,
  })
  const code = runRemote({ ...AUTHORITY, sha256: "a".repeat(64) })
  assert.equal(code, 1, "a digest mismatch aborts")
  assert.equal(calls.includes("deploy"), false, "deploy must not run on a digest mismatch")
})

// ─── 16 + 19. schema command --remote gate + latch ────────────────

test("16. the schema command STOPS before scoped config creation without --remote", () => {
  const repo = makeDeployRepo()
  try {
    const cfg = writeGeneratedDeployConfig(repo.repoRoot)
    const r = runDeployCommand(repo, "scripts/cf-d1-schema-verify-remote.mjs", ["--config", cfg], {})
    assert.notEqual(r.status, 0)
    assert.match(r.stdout + r.stderr, /STOPPED — gate\(s\) not satisfied/)
    assert.deepEqual(r.wranglerCalls, [], "no wrangler call without --remote")
    assert.doesNotMatch(r.stdout, /verification latch opened/, "the latch is never opened without --remote")
    assert.deepEqual(r.scopedConfigsLeft, [])
  } finally { repo.cleanup() }
})

test("19. with --remote the schema command opens the latch, verifies, and closes the latch (success AND failure)", () => {
  const repo = makeDeployRepo()
  try {
    const cfg = writeGeneratedDeployConfig(repo.repoRoot)
    const ok = runDeployCommand(repo, "scripts/cf-d1-schema-verify-remote.mjs", ["--config", cfg, "--remote"], {})
    assert.equal(ok.status, 0, ok.stderr)
    assert.ok(ok.wranglerCalls.filter((c) => c.startsWith("d1-execute")).length >= 2)
    assert.match(ok.stdout, /verification latch opened/)
    assert.match(ok.stdout, /verification latch closed/)
    assert.deepEqual(ok.scopedConfigsLeft, [])
    const fail = runDeployCommand(repo, "scripts/cf-d1-schema-verify-remote.mjs", ["--config", cfg, "--remote"], { WRANGLER_STUB_SCHEMA: "empty" })
    assert.equal(fail.status, 1)
    assert.match(fail.stdout, /verification latch closed/, "the latch is closed even when verification fails")
  } finally { repo.cleanup() }
})

// ─── 22 + 23. deploy never invokes migration or bootstrap ─────────

test("22 + 23. Worker deploy never invokes migration apply or bootstrap apply (subprocess + source)", () => {
  const repo = makeDeployRepo()
  try {
    const r = runDeployCommand(repo, "scripts/cloudflare-deploy.mjs", [], { CF_DEPLOY_EXECUTE: "1" })
    // The stub wrangler logs every d1 execute; a migration/bootstrap apply would issue
    // writes (--file) which the deploy pipeline never does.
    assert.equal(r.wranglerCalls.some((c) => c.includes("--file")), false, "deploy issues no write/migration/bootstrap call")
    const src = codeOf("scripts/cloudflare-deploy.mjs")
    assert.doesNotMatch(src, /cf-d1-migrations-apply|cf-d1-bootstrap-apply/)
  } finally { repo.cleanup() }
})

// ─── 33 + 34 + 35 + 36. offline guarantee, flags, #155 open ───────

test("33. these tests use ONLY a stub wrangler binary — nothing contacts Cloudflare", () => {
  const repo = makeDeployRepo()
  try {
    const r = runDeployCommand(repo, "scripts/cloudflare-deploy.mjs", [], { CF_DEPLOY_EXECUTE: "1" })
    // Every wrangler invocation went to the stub, which appends to the log; a real
    // wrangler would need network. The stub answered introspection deterministically.
    assert.ok(r.wranglerCalls.length > 0, "the stub wrangler recorded calls")
    assert.equal(existsSync(resolve(repo.repoRoot, "node_modules/.bin/wrangler")), true, "the stub binary was used")
  } finally { repo.cleanup() }
})

test("34 + 35. EXTERNAL_ACTIONS_ENABLED and ALLOW_LEGACY_INGEST_FALLBACK are false", () => {
  const cfg = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  assert.equal(cfg.vars.EXTERNAL_ACTIONS_ENABLED, "false")
  assert.equal(cfg.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})

test("36. no tracked source or doc auto-closes Issue #155", () => {
  // A grep over the tracked docs + scripts: no auto-closing keyword targets #155.
  const files = [
    "docs/operations/D1_OPERATIONAL_EVIDENCE.md",
    "docs/operations/CLOUDFLARE_RUNTIME_DEPLOYMENT.md",
    "docs/operations/CLOUDFLARE_D1_SETUP.md",
    "scripts/cloudflare-deploy.mjs",
    "scripts/cf-d1-schema-verify-remote.mjs",
  ]
  for (const rel of files) {
    const p = resolve(REPO_ROOT, rel)
    if (!existsSync(p)) continue
    assert.doesNotMatch(readFileSync(p, "utf8"), /\b(fix(e[sd])?|close[sd]?|resolve[sd]?)\s+#155\b/i, `${rel} must not auto-close #155`)
  }
})
