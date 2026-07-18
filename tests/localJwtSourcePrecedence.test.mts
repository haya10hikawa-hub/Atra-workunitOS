import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import {
  resolveLocalJwtAuthority,
  describeLocalJwtAuthority,
  generateLocalJwt,
  verifyLocalJwt,
  parseDevVars,
  validateLocalJwtEnv,
  PROTECTED_LOCAL_JWT_KEYS,
} from "../scripts/lib/localJwt.mjs"
import { buildLocalJwtBootstrapPlan } from "../scripts/cf-d1-bootstrap-jwt-local.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const GENERATE_SCRIPT = resolve(REPO_ROOT, "scripts/generate-local-jwt.mjs")
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

const DEV_VARS_FIXTURE = [
  "JWT_AUTH_SECRET=dev-vars-canonical-secret-at-least-32-bytes",
  "JWT_AUTH_ISSUER=workunit-os",
  "JWT_AUTH_AUDIENCE=workunit-os-api",
  "CF_D1_BOOTSTRAP_IDENTITY_PROVIDER=jwt",
  "CF_D1_BOOTSTRAP_IDENTITY_SUBJECT=cf-d1-bootstrap:precedence-subject",
  "CF_D1_BOOTSTRAP_IDENTITY_EMAIL=precedence@example.invalid",
  "",
].join("\n")

/** A temp repo root carrying only a `.dev.vars` fixture. */
function withDevVarsRepo(contents: string, run: (repoRoot: string) => void): void {
  const dir = mkdtempSync(resolve(tmpdir(), "local-jwt-precedence-"))
  try {
    writeFileSync(resolve(dir, ".dev.vars"), contents, { mode: 0o600 })
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("`.dev.vars`-only resolves the full protected auth set (no ambient env)", () => {
  withDevVarsRepo(DEV_VARS_FIXTURE, (repoRoot) => {
    const a = resolveLocalJwtAuthority(repoRoot, {})
    assert.equal(a.ok, true)
    if (!a.ok) return
    assert.equal(a.source, "dev_vars")
    for (const key of PROTECTED_LOCAL_JWT_KEYS) assert.equal(typeof a.env[key], "string")
  })
})

test("matching ambient env + `.dev.vars` is NOT a conflict", () => {
  withDevVarsRepo(DEV_VARS_FIXTURE, (repoRoot) => {
    const a = resolveLocalJwtAuthority(repoRoot, {
      JWT_AUTH_SECRET: "dev-vars-canonical-secret-at-least-32-bytes",
      JWT_AUTH_ISSUER: "workunit-os",
    })
    assert.equal(a.ok, true)
  })
})

for (const [label, key, value] of [
  ["secret", "JWT_AUTH_SECRET", "a-different-secret-value-at-least-32-bytes"],
  ["issuer", "JWT_AUTH_ISSUER", "other-issuer"],
  ["audience", "JWT_AUTH_AUDIENCE", "other-audience"],
] as const) {
  test(`conflicting ${label} fails closed with a safe category`, () => {
    withDevVarsRepo(DEV_VARS_FIXTURE, (repoRoot) => {
      const a = resolveLocalJwtAuthority(repoRoot, { [key]: value })
      assert.equal(a.ok, false)
      if (a.ok) return
      assert.equal(a.reason, "local_auth_authority_conflict")
      assert.deepEqual([...a.conflicts], [key])
      // Never leaks the conflicting value.
      assert.equal(JSON.stringify(a).includes(value), false)
    })
  })
}

test("ambient-only protected key is NOT trusted by default; explicit override opts in", () => {
  // `.dev.vars` deliberately omits the identity email.
  const noEmail = DEV_VARS_FIXTURE.split("\n").filter((l) => !l.startsWith("CF_D1_BOOTSTRAP_IDENTITY_EMAIL")).join("\n")
  withDevVarsRepo(noEmail, (repoRoot) => {
    const ambient = { CF_D1_BOOTSTRAP_IDENTITY_EMAIL: "ambient@example.invalid" }
    const canonical = resolveLocalJwtAuthority(repoRoot, ambient)
    assert.equal(canonical.ok, true)
    if (canonical.ok) assert.equal(canonical.env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL, undefined)
    const overridden = resolveLocalJwtAuthority(repoRoot, ambient, { allowEnvOverride: true })
    assert.equal(overridden.ok, true)
    if (overridden.ok) assert.equal(overridden.env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL, "ambient@example.invalid")
  })
})

test("generation and verification use the SAME resolved authority", async () => {
  await new Promise<void>((done) => {
    withDevVarsRepo(DEV_VARS_FIXTURE, async (repoRoot) => {
      const a = resolveLocalJwtAuthority(repoRoot, {})
      assert.equal(a.ok, true)
      if (!a.ok) return done()
      const token = await generateLocalJwt(a.env, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })
      const result = await verifyLocalJwt(token, a.env, { nowSeconds: 1_800_000_100 })
      assert.equal(result.ok, true)
      done()
    })
  })
})

test("bootstrap plan and generation resolve the SAME subject and email", async () => {
  await new Promise<void>((done) => {
    withDevVarsRepo(DEV_VARS_FIXTURE, async (repoRoot) => {
      const a = resolveLocalJwtAuthority(repoRoot, {})
      assert.equal(a.ok, true)
      if (!a.ok) return done()
      // Identity comes from the temp-resolved env; the migration manifest is a
      // real repo file, so the plan is built against the real repo root.
      const plan = buildLocalJwtBootstrapPlan(a.env, REPO_ROOT)
      assert.equal(plan.ok, true)
      assert.ok(plan.values)
      const values = plan.values
      const token = await generateLocalJwt(a.env, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))
      assert.equal(payload.sub, values.identitySubject)
      assert.equal(payload.email, values.userEmail)
      done()
    })
  })
})

test("RS256 and expired tokens remain rejected", async () => {
  const env = {
    JWT_AUTH_SECRET: "dev-vars-canonical-secret-at-least-32-bytes",
    JWT_AUTH_ISSUER: "workunit-os",
    JWT_AUTH_AUDIENCE: "workunit-os-api",
    CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: "cf-d1-bootstrap:precedence-subject",
    CF_D1_BOOTSTRAP_IDENTITY_EMAIL: "precedence@example.invalid",
  }
  const valid = await generateLocalJwt(env, { nowSeconds: 1_800_000_000, ttlSeconds: 3600 })
  const [, payload, sig] = valid.split(".")
  const rs256 = `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")}.${payload}.${sig}`
  assert.equal((await verifyLocalJwt(rs256, env, { nowSeconds: 1_800_000_100 })).ok, false)
  const expired = await generateLocalJwt(env, { nowSeconds: 1_800_000_000, ttlSeconds: 1 })
  assert.equal((await verifyLocalJwt(expired, env, { nowSeconds: 1_800_000_050 })).ok, false)
})

// ─── dotenv-grammar parity ─────────────────────────────────────────
//
// The CLI must interpret `.dev.vars` with the SAME dotenv grammar the Wrangler
// Worker runtime uses; a supported line must never resolve to a different value
// in the CLI than in Wrangler. These lock the parser semantics from Phase 3.

// The exact lines the previous (custom-parser) README shipped. Under the old
// parser the trailing comment text became the VALUE — and the 32-byte secret
// comment could pass the min-length check while Wrangler saw an empty value,
// recreating the authority split. They must now all resolve empty.
const PREVIOUS_README_LINES = [
  "JWT_AUTH_SECRET=            # >= 32 bytes; local secret only",
  "CF_D1_BOOTSTRAP_IDENTITY_SUBJECT=   # local synthetic subject",
  "CF_D1_BOOTSTRAP_IDENTITY_EMAIL=     # local synthetic email",
].join("\n")

test("parser: inline comment stripped, quoted # literal, = preserved, empty quotes empty (CRLF)", () => {
  const parsed = parseDevVars(
    [
      "A=value # trailing comment",
      'B="# literal"',
      "C=value=with=equals",
      'D=""',
      'E="" # comment',
      "  F  =  spaced value  ",
      "G='single quoted'",
      "# whole-line comment",
      "",
    ].join("\r\n"),
  )
  assert.equal(parsed.A, "value") // unquoted inline comment removed
  assert.equal(parsed.B, "# literal") // quoted # stays part of the value
  assert.equal(parsed.C, "value=with=equals") // `=` inside the value preserved
  assert.equal(parsed.D, "") // empty quoted placeholder stays empty
  assert.equal(parsed.E, "") // empty quoted + trailing comment stays empty
  assert.equal(parsed.F, "spaced value") // surrounding whitespace trimmed
  assert.equal(parsed.G, "single quoted") // single quotes stripped
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "whole-line comment"), false)
})

test("regression: the previous README lines resolve empty, never the comment text", () => {
  const parsed = parseDevVars(PREVIOUS_README_LINES)
  assert.equal(parsed.JWT_AUTH_SECRET, "")
  assert.equal(parsed.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT, "")
  assert.equal(parsed.CF_D1_BOOTSTRAP_IDENTITY_EMAIL, "")
  // The comment text must never survive as a value (the old min-length bypass).
  const serialized = JSON.stringify(parsed)
  assert.equal(serialized.includes("32 bytes"), false)
  assert.equal(serialized.includes("synthetic"), false)
})

test("regression: a previous-README `.dev.vars` fails closed (empty secret ≠ 32-byte comment)", () => {
  const contents = [
    "JWT_AUTH_ISSUER=workunit-os",
    "JWT_AUTH_AUDIENCE=workunit-os-api",
    "CF_D1_BOOTSTRAP_IDENTITY_PROVIDER=jwt",
    PREVIOUS_README_LINES,
    "",
  ].join("\n")
  withDevVarsRepo(contents, (repoRoot) => {
    const a = resolveLocalJwtAuthority(repoRoot, {})
    assert.equal(a.ok, true)
    if (!a.ok) return
    // Empty protected values are dropped, so the resolved env carries none of them.
    assert.equal(a.env.JWT_AUTH_SECRET, undefined)
    assert.equal(a.env.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT, undefined)
    assert.equal(a.env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL, undefined)
    const v = validateLocalJwtEnv(a.env)
    assert.equal(v.ok, false)
    if (v.ok) return
    for (const key of ["JWT_AUTH_SECRET", "CF_D1_BOOTSTRAP_IDENTITY_SUBJECT", "CF_D1_BOOTSTRAP_IDENTITY_EMAIL"]) {
      assert.ok(v.failures.some((f) => f.includes(key)), key)
    }
  })
})

test("the corrected README `.dev.vars` template parses and fails closed while empty", () => {
  const readme = readFileSync(resolve(REPO_ROOT, "README.md"), "utf8")
  const marker = "# .dev.vars — LOCAL ONLY"
  const start = readme.indexOf(marker)
  assert.ok(start >= 0, "README .dev.vars template block not found")
  const end = readme.indexOf("\n```", start)
  assert.ok(end > start, "README .dev.vars template fence not terminated")
  const template = readme.slice(start, end)
  const parsed = parseDevVars(template)
  // Structural non-secret values are present, clean (comments and quotes removed).
  assert.equal(parsed.JWT_AUTH_ISSUER, "workunit-os")
  assert.equal(parsed.JWT_AUTH_AUDIENCE, "workunit-os-api")
  assert.equal(parsed.CF_D1_BOOTSTRAP_IDENTITY_PROVIDER, "jwt")
  // Required secret/identity placeholders are empty → the template fails closed.
  const v = validateLocalJwtEnv(parsed)
  assert.equal(v.ok, false)
  if (v.ok) return
  for (const key of ["JWT_AUTH_SECRET", "CF_D1_BOOTSTRAP_IDENTITY_SUBJECT", "CF_D1_BOOTSTRAP_IDENTITY_EMAIL"]) {
    assert.ok(v.failures.some((f) => f.includes(key)), key)
  }
})

test("an inline-comment `.dev.vars` value equals the clean ambient value (no false conflict)", () => {
  const contents = [
    "JWT_AUTH_SECRET=dev-vars-canonical-secret-at-least-32-bytes # local only",
    "JWT_AUTH_ISSUER=workunit-os # issuer comment",
    "JWT_AUTH_AUDIENCE=workunit-os-api",
    "CF_D1_BOOTSTRAP_IDENTITY_PROVIDER=jwt",
    "CF_D1_BOOTSTRAP_IDENTITY_SUBJECT=cf-d1-bootstrap:precedence-subject",
    "CF_D1_BOOTSTRAP_IDENTITY_EMAIL=precedence@example.invalid",
    "",
  ].join("\n")
  withDevVarsRepo(contents, (repoRoot) => {
    // Ambient carries the CLEAN values Wrangler would compute after comment strip;
    // parity means the CLI parser reaches the same values → no authority conflict.
    const a = resolveLocalJwtAuthority(repoRoot, {
      JWT_AUTH_SECRET: "dev-vars-canonical-secret-at-least-32-bytes",
      JWT_AUTH_ISSUER: "workunit-os",
    })
    assert.equal(a.ok, true)
    if (!a.ok) return
    assert.equal(a.env.JWT_AUTH_SECRET, "dev-vars-canonical-secret-at-least-32-bytes")
    assert.equal(a.env.JWT_AUTH_ISSUER, "workunit-os")
  })
})

test("safe authority diagnostics never leak a value", () => {
  withDevVarsRepo(DEV_VARS_FIXTURE, (repoRoot) => {
    const out = describeLocalJwtAuthority(repoRoot, {})
    assert.match(out, /JWT_AUTH_SECRET: source=dev_vars bytes=\d+ sha256_12=[0-9a-f]{12}/)
    assert.equal(out.includes("dev-vars-canonical-secret-at-least-32-bytes"), false)
    assert.equal(out.includes("precedence@example.invalid"), false)
    assert.equal(out.includes("cf-d1-bootstrap:precedence-subject"), false)
  })
})

// ─── Subprocess: real generate script stdout/stderr contract ────────
//
// Runs against the repo-root `.dev.vars` when present (local dev). In an
// environment without `.dev.vars` (CI), the same script must fail closed with a
// safe message and emit no token — both branches are asserted.

test("generate script emits exactly one compact JWT + trailing newline, or fails closed", () => {
  const hasDevVars = existsSync(resolve(REPO_ROOT, ".dev.vars"))
  const r = spawnSync(process.execPath, [GENERATE_SCRIPT], { encoding: "utf8", env: { ...process.env } })
  if (hasDevVars && r.status === 0) {
    assert.match(r.stdout, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\n$/)
    assert.equal(r.stdout.split("\n").filter(Boolean).length, 1)
    assert.ok(COMPACT_JWT.test(r.stdout.trim()))
  } else {
    // Fail-closed path: no token on stdout, safe category on stderr.
    assert.notEqual(r.status, 0)
    assert.equal(COMPACT_JWT.test(r.stdout.trim()), false)
    assert.match(r.stderr, /auth:jwt:local: FAIL —/)
  }
})

test("generate script surfaces an authority conflict without leaking the value", (t) => {
  if (!existsSync(resolve(REPO_ROOT, ".dev.vars"))) {
    t.skip("no repo-root .dev.vars to conflict against")
    return
  }
  const secret = readFileSync(resolve(REPO_ROOT, ".dev.vars"), "utf8").split(/\r?\n/)
    .some((l) => l.startsWith("JWT_AUTH_SECRET="))
  if (!secret) {
    t.skip("repo .dev.vars has no JWT_AUTH_SECRET")
    return
  }
  const conflictValue = "deliberately-different-secret-value-at-least-32-bytes"
  const r = spawnSync(process.execPath, [GENERATE_SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, JWT_AUTH_SECRET: conflictValue },
  })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /local_auth_authority_conflict:JWT_AUTH_SECRET/)
  assert.equal(r.stdout.includes("."), false)
  assert.equal((r.stdout + r.stderr).includes(conflictValue), false)
})
