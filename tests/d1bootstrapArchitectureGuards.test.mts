/**
 * P0-PERSIST-015 — architecture guards for the D1 bootstrap (Issue #155).
 *
 * These guards encode the failure that shipped: a REQUIRED migration (0006) was
 * parked as `deferred`, the schema contract was edited to exclude the column it
 * adds, and the clean-bootstrap proof only exercised WorkUnit — so a "verified"
 * bootstrap produced a database whose first Action Preview write fails. Each guard
 * below fails if any strand of that failure is reintroduced.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { loadManifest, buildPlan, validateManifest, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationManifest.mjs"
import { loadSchemaContract } from "../scripts/lib/d1SchemaContract.mjs"
import { buildBootstrapSql } from "../scripts/cf-d1-bootstrap-prepare.mjs"
import { hasExplicitTransactionControl } from "../scripts/lib/d1AtomicBatch.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")

/**
 * Source with comments stripped. These guards assert what the code DOES, so they
 * must never be satisfied — or tripped — by prose: the deploy script legitimately
 * *explains* that migrations are a separate command, and the bootstrap generator
 * legitimately *documents* that it never uses INSERT OR IGNORE.
 */
const codeOf = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")

/** The brace-matched body of every `finally` block — there is more than one. */
function finallyBodies(src: string): string[] {
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

const D1_REPO_DIR = "app/lib/persistence/d1"
const BOOTSTRAP_APPLY = "scripts/cf-d1-bootstrap-apply.mjs"
const BOOTSTRAP_PREPARE = "scripts/cf-d1-bootstrap-prepare.mjs"
const DEPLOY = "scripts/cloudflare-deploy.mjs"
const LIFECYCLE_TEST = "tests/d1bootstrapLifecycle.test.mts"
const DOCS = ["docs/operations/CLOUDFLARE_D1_SETUP.md", "docs/operations/CLOUDFLARE_RUNTIME_DEPLOYMENT.md", "README.md"]

function manifest() {
  const r = loadManifest(REPO_ROOT)
  if (!r.ok) throw new Error(`manifest unreadable: ${r.error}`)
  return r.manifest
}
function contract() {
  const r = loadSchemaContract(REPO_ROOT)
  if (!r.ok) throw new Error(`schema contract unreadable: ${r.error}`)
  return r.contract
}

/** Every `INSERT INTO <table> (<cols>)` a D1 repository issues. */
function repositoryInserts(): Array<{ file: string; table: string; columns: string[] }> {
  const found: Array<{ file: string; table: string; columns: string[] }> = []
  for (const file of readdirSync(resolve(REPO_ROOT, D1_REPO_DIR)).filter((f) => f.endsWith(".ts"))) {
    const src = read(`${D1_REPO_DIR}/${file}`)
    for (const m of src.matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
      const columns = m[2].split(",").map((c) => c.trim()).filter((c) => /^[a-z_][a-z0-9_]*$/i.test(c))
      found.push({ file, table: m[1], columns })
    }
  }
  return found
}

/** The contract section declaring `table`, whichever database it belongs to. */
function contractTable(table: string) {
  for (const binding of KNOWN_BINDINGS) {
    const spec = contract().databases[binding]?.tables?.[table]
    if (spec) return { binding, spec }
  }
  return null
}

// ─── GUARD: the schema contract must cover every column the code writes ──

test("GUARD: a repository-required column may NEVER be excluded from the schema contract", () => {
  // THE guard for the original defect. `D1ActionPreviewRepository.create()` always
  // inserts created_by_user_id, but the contract excluded it — so the verifier
  // accepted a database the application cannot use. Any column a repository writes
  // must be a column the contract requires.
  const inserts = repositoryInserts()
  assert.ok(inserts.length >= 8, `expected to find the D1 repository INSERTs, found ${inserts.length}`)

  const problems: string[] = []
  for (const { file, table, columns } of inserts) {
    const found = contractTable(table)
    if (!found) { problems.push(`${file}: table "${table}" is written by a repository but absent from the schema contract`); continue }
    const declared = new Set((found.spec.columns ?? []).map((c: { name: string }) => c.name))
    for (const column of columns) {
      if (!declared.has(column)) problems.push(`${file}: "${table}.${column}" is INSERTed by a repository but not required by the schema contract`)
    }
  }
  assert.deepEqual(problems, [], `every repository-written column must be in the schema contract:\n${problems.join("\n")}`)
})

test("GUARD: schema verification can NEVER pass without action_previews.created_by_user_id", () => {
  const spec = contract().databases.TENANT_DB_DEFAULT.tables.action_previews
  const column = (spec.columns ?? []).find((c: { name: string }) => c.name === "created_by_user_id")
  assert.ok(column, "created_by_user_id must be a REQUIRED column of the action_previews contract")
  // Present-ness is what is required; the column is nullable in the schema, so the
  // contract must not demand NOT NULL (that would make verification impossible).
  assert.notEqual(column.notnull, true)
})

// ─── GUARD: no migration may be hidden from operations ───────────

test("GUARD: `deferred` migrations are not a supported concept, and every committed migration is in a lane", () => {
  const m = manifest()
  assert.equal("deferred" in m, false, "the committed manifest must not resurrect the `deferred` escape hatch")
  assert.deepEqual(validateManifest(m, REPO_ROOT).failures, [])

  // A manifest that parks a required migration outside the lanes must fail.
  const parked = JSON.parse(JSON.stringify(m))
  parked.deferred = [{ binding: "TENANT_DB_DEFAULT", path: "migrations/0006_action_preview_creator.sql", sha256: "0".repeat(64), kind: "schema" }]
  assert.ok(validateManifest(parked, REPO_ROOT).failures.includes("deferred_migrations_not_supported"))

  // Every committed migration file is covered by exactly one lane.
  const laned = new Set(KNOWN_BINDINGS.flatMap((b) => buildPlan(m, b).map((s) => s.name)))
  for (const file of readdirSync(resolve(REPO_ROOT, "migrations")).filter((f) => f.endsWith(".sql"))) {
    assert.ok(laned.has(file), `committed migration ${file} must be in an active lane, never invisible to operations`)
  }
})

test("GUARD: 0006 must be present in the active tenant plan, exactly once, marked once-only", () => {
  const plan = buildPlan(manifest(), "TENANT_DB_DEFAULT")
  const six = plan.filter((s) => s.name.startsWith("0006"))
  assert.equal(six.length, 1, "0006 must be an active plan member exactly once")
  assert.equal(six[0].apply, "once", "an ALTER ADD COLUMN can never be replay_safe")
  assert.ok(six[0].effect, "a once-only migration must declare its effect probe")

  // Dropping it from the lane must fail validation, not pass quietly.
  const without = JSON.parse(JSON.stringify(manifest()))
  without.lanes.TENANT_DB_DEFAULT = without.lanes.TENANT_DB_DEFAULT.filter((e: { path: string }) => !e.path.includes("0006"))
  assert.ok(validateManifest(without, REPO_ROOT).failures.includes("migration_not_in_any_lane:0006_action_preview_creator.sql"))
})

test("GUARD: a once-only migration is never raw-replayed, and the ledger never accepts a digest mismatch", () => {
  const ledger = read("scripts/lib/d1MigrationLedger.mjs")
  // The skip is keyed on the reconciled `satisfied` state, not on a comment.
  assert.match(ledger, /if \(step\.apply === "once" && stateBySeq\.get\(step\.sequence\) === "satisfied"\) \{ skipped\.push\(step\.name\); continue \}/)
  // A digest disagreement is a hard failure state, and an unreconciled lane throws
  // BEFORE anything is applied.
  assert.match(ledger, /state = "digest_mismatch"/)
  assert.match(ledger, /if \(!reconciled\.ok\) \{/)
  assert.match(ledger, /throw err/)
  // The pinned digest is re-verified against the bytes about to run.
  assert.match(ledger, /if \(computeDigest\(resolved\.absPath\) !== step\.sha256\) throw new Error\(`migration_digest_mismatch/)
})

// ─── GUARD: bootstrap apply gates ────────────────────────────────

test("GUARD: bootstrap apply requires BOTH an execution flag and the exact confirmation phrase", () => {
  const src = read(BOOTSTRAP_APPLY)
  assert.match(src, /env\.CF_D1_BOOTSTRAP_EXECUTE !== "1"/)
  assert.match(src, /env\.CF_D1_BOOTSTRAP_CONFIRM !== BOOTSTRAP_CONFIRM_PHRASE/)
  assert.match(src, /BOOTSTRAP_CONFIRM_PHRASE = "APPLY_PRODUCTION_CONTROL_BOOTSTRAP"/)
  assert.match(src, /argv\.includes\("--remote"\)/)
  // The gate actually guards a write path — the whole point of this command — and
  // what it executes is the canonical bytes validation retained.
  assert.match(src, /applyBootstrapFile\(configPath, gates\.canonicalSql\)/)
})

// ─── GUARD: the artifact is bound to operator authority ──────────

test("GUARD: Wrangler may never receive the repository-root artifact path", () => {
  const src = codeOf(BOOTSTRAP_APPLY)
  const start = src.indexOf("function applyBootstrapFile(")
  assert.ok(start >= 0)
  const body = src.slice(start, src.indexOf("\n}", start))
  // Handing Wrangler the mutable repo-root path would reopen the validate→execute
  // window: the reviewed bytes and the executed bytes could differ.
  assert.doesNotMatch(body, /BOOTSTRAP_SQL_PATH/, "applyBootstrapFile must never pass the repository-root artifact to Wrangler")
  assert.match(body, /--file", executionFile/, "Wrangler must receive the temporary execution file")
  // The execution file is a FRESH PRIVATE temporary file built from the canonical
  // bytes — never a copy re-read from the source path after validation.
  assert.match(body, /mkdtempSync\(resolve\(tmpdir\(\)/, "the execution file must live in a fresh random temporary directory")
  assert.match(body, /writeFileSync\(executionFile, canonicalSql, \{ mode: 0o600 \}\)/, "the execution file must be written 0600 from the canonical bytes")
  assert.doesNotMatch(body, /readFileSync/, "the bytes must not be re-read from any path at execution time")
  // main() executes the bytes validation retained.
  assert.match(src, /applyBootstrapFile\(configPath, gates\.canonicalSql\)/)
})

test("GUARD: the artifact content is READ and regenerated from current validated values before execution", () => {
  const src = codeOf(BOOTSTRAP_APPLY)
  // Every other gate describes the file; this one describes the bytes.
  assert.match(src, /export function validateCanonicalArtifact\(/)
  assert.match(src, /const canonical = validateCanonicalArtifact\(\{ values: input\.values, path: sqlPath \}\)/,
    "the gates must validate the artifact bytes against the CURRENT operator values")
  // Reconstruct-and-compare, not a keyword scan.
  assert.match(src, /expected = buildBootstrapSql\(values, header\.generatedAt\)/, "the expected bytes must be regenerated from current values")
  assert.match(src, /if \(actual === expected\) return \{ ok: true, sql: expected \}/, "the WHOLE file must be compared")
  // Size is bounded before parsing; the header only supplies the timestamp.
  assert.match(src, /if \(size > BOOTSTRAP_ARTIFACT_MAX_BYTES\) return \{ ok: false, blocked: \["bootstrap_sql_too_large"\] \}/)
  const sizeIdx = src.indexOf("BOOTSTRAP_ARTIFACT_MAX_BYTES")
  const readIdx = src.indexOf("readFileSync(path, \"utf8\")")
  assert.ok(sizeIdx > 0 && sizeIdx < readIdx, "the size cap must be enforced before the file is read")
  // Every required safe category exists.
  for (const category of ["bootstrap_sql_unreadable", "bootstrap_sql_too_large", "bootstrap_sql_format_invalid", "bootstrap_sql_values_mismatch", "bootstrap_sql_noncanonical"]) {
    assert.ok(src.includes(category), `the safe category ${category} must exist`)
  }
})

test("GUARD: extra SQL can never survive canonical comparison", () => {
  // A full-byte equality is what makes an allow/deny keyword list unnecessary — and
  // impossible to outgrow. Assert the comparison is equality over the whole file,
  // never a prefix/substring/keyword test.
  const src = codeOf(BOOTSTRAP_APPLY)
  const start = src.indexOf("export function validateCanonicalArtifact(")
  const body = src.slice(start, src.indexOf("\n}", start))
  assert.match(body, /actual === expected/, "the comparison must be whole-file equality")
  assert.doesNotMatch(body, /\.includes\(|\.indexOf\(|\bDELETE\b|\bDROP\b|forbidden/i, "canonical validation must not degrade into a keyword scan")
  // Behavioural backstop: appended bytes are refused (proven in the gate suite).
  assert.match(body, /noncanonical = actual\.startsWith\(expected\) \|\| expected\.startsWith\(actual\)/)
})

test("GUARD: operator database metadata must be compared to TENANT_DB_DEFAULT", () => {
  const src = codeOf(BOOTSTRAP_APPLY)
  assert.match(src, /export function evaluateRegistryBinding\(/)
  assert.match(src, /d\.binding === REGISTRY_BINDING/, "the comparison must target the TENANT_DB_DEFAULT binding")
  assert.match(src, /values\.databaseId !== tenant\.database_id/)
  assert.match(src, /values\.databaseName !== tenant\.database_name/)
  assert.match(src, /evaluateRegistryBinding\(input\.values, validatedConfig\)/, "the gates must run the registry binding check")
  for (const category of ["tenant_database_id_mismatch", "tenant_database_name_mismatch", "tenant_binding_missing"]) {
    assert.ok(src.includes(category), `${category} must exist`)
  }
})

test("GUARD: the registry schema version must come from ONE canonical source", () => {
  const prepare = codeOf(BOOTSTRAP_PREPARE)
  // Never an arbitrary operator-supplied digit string.
  assert.match(prepare, /tenantRegistrySchemaVersion\(loaded\.manifest\)/)
  assert.match(prepare, /get\("CF_D1_BOOTSTRAP_SCHEMA_VERSION"\) !== canonicalVersion/, "the supplied version must equal the canonical one exactly")
  assert.doesNotMatch(prepare, /SCHEMA_VERSION_RE/, "a bounded digit-format check is not sufficient for bootstrap correctness")
  // The canonical version is declared once, in the manifest, pinned to its lane.
  const m = manifest()
  assert.ok(m.registry?.TENANT_DB_DEFAULT?.schemaVersion, "the manifest must declare the canonical registry schema version")
  assert.ok(m.registry?.TENANT_DB_DEFAULT?.planDigest, "…pinned to the lane it describes")
  // Changing the active plan without updating it fails.
  const drifted = JSON.parse(JSON.stringify(m))
  drifted.lanes.TENANT_DB_DEFAULT.pop()
  assert.ok(validateManifest(drifted, REPO_ROOT).failures.includes("registry_plan_digest_mismatch:TENANT_DB_DEFAULT"),
    "a migration-plan change must force the canonical schema version to be reconsidered")
})

test("GUARD: the registry/user/membership/identity COUNT queries verify every supplied field", () => {
  const verify = codeOf("scripts/lib/d1BootstrapVerify.mjs")
  const queryFor = (category: string) => {
    const i = verify.indexOf(`category: "${category}"`)
    assert.ok(i > 0, `${category} must exist`)
    return verify.slice(i, verify.indexOf("},", i))
  }
  // Counting by id alone would confirm almost nothing.
  for (const field of ["name =", "slug =", "status = 'active'"]) assert.ok(queryFor("tenant_row").includes(field), `tenant verification must check ${field}`)
  for (const field of ["database_name =", "database_id =", "schema_version =", "status = 'active'", "JOIN tenants"]) {
    assert.ok(queryFor("registry_row").includes(field), `registry verification must check ${field}`)
  }
  assert.ok(queryFor("user_row").includes("email ="), "user verification must check email")
  for (const field of ["role =", "role IN", "status = 'active'", "JOIN tenants", "JOIN users"]) {
    assert.ok(queryFor("membership_row").includes(field), `membership verification must check ${field}`)
  }
  for (const field of ["provider =", "provider_subject =", "email =", "JOIN users"]) {
    assert.ok(queryFor("identity_row").includes(field), `identity verification must check ${field}`)
  }
})

test("GUARD: a post-verification failure is reported as an operator-action state, never a rollback", () => {
  const src = read(BOOTSTRAP_APPLY)
  // The five INSERTs commit before verification runs, so calling this a rollback
  // would be a lie that sends an operator looking for state that is really there.
  assert.match(src, /VERIFICATION_FAILED_AFTER_COMMIT = "bootstrap_verification_failed_after_commit"/)
  assert.match(src, /console\.error\(`cf:d1:bootstrap:apply: FAILED — \$\{VERIFICATION_FAILED_AFTER_COMMIT\}/)
  assert.match(src, /COMMITTED before this read-only verification ran, so the records were NOT rolled back/)
  assert.match(src, /Operator investigation is required/)
  // No automatic destructive compensation.
  assert.doesNotMatch(codeOf(BOOTSTRAP_APPLY), /\bDELETE FROM\b|\bDROP TABLE\b/i, "apply must never issue a compensating DELETE")
})

test("GUARD: the bootstrap can target ONLY the control registry", () => {
  const src = read(BOOTSTRAP_APPLY)
  assert.match(src, /BOOTSTRAP_BINDING = "CONTROL_DB"/)
  assert.match(src, /parseBindingArg\(argv\) !== BOOTSTRAP_BINDING\) blocked\.push\("unsupported_binding"\)/)
})

test("GUARD: the bootstrap SQL must have an atomic boundary and never weaken constraints", () => {
  // Asserted on the ACTUAL GENERATED SQL, not on the generator's prose.
  const sql = buildBootstrapSql({
    tenantId: "t", tenantName: "T", tenantSlug: "t", tenantStatus: "active",
    databaseName: "t-db", databaseId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", schemaVersion: "1",
    userId: "u", userEmail: "u@example.com", membershipId: "m", membershipRole: "owner",
    membershipStatus: "active", identityId: "i", identityProvider: "jwt", identitySubject: "s",
  }, "2026-07-16T00:00:00.000Z")

  // All five records in ONE file — that single --file batch IS the atomic boundary
  // (D1 rejects explicit BEGIN/COMMIT, verified against pinned Wrangler 4.99.0).
  for (const table of ["tenants", "tenant_databases", "users", "tenant_memberships", "auth_identities"]) {
    assert.ok(sql.includes(`INSERT INTO ${table} (`), `the bootstrap must insert ${table} in the same batch`)
  }
  assert.doesNotMatch(sql, /INSERT\s+OR\s+IGNORE/i)
  assert.doesNotMatch(sql, /\bREPLACE\s+INTO\b/i)
  assert.doesNotMatch(sql, /\bON\s+CONFLICT\b/i)
  assert.equal(hasExplicitTransactionControl(sql), false)
  const apply = codeOf(BOOTSTRAP_APPLY)
  assert.equal(apply.split(`"d1", "execute", BOOTSTRAP_BINDING, "--file"`).length - 1, 1, "the bootstrap must be ONE atomic --file invocation")
})

test("GUARD: bootstrap apply can never leave the generated file behind", () => {
  const src = codeOf(BOOTSTRAP_APPLY)
  // BOTH cleanup paths — the temporary execution file and the repository-root
  // preparation artifact — must be unconditional. A conditional call (e.g. only on
  // success) would still contain the identifier while leaking the file after a
  // Wrangler or verification failure, so presence alone is not enough to assert.
  const bodies = finallyBodies(src)
  assert.equal(bodies.length, 2, "apply must clean up the temporary execution file AND the repository-root artifact")
  for (const body of bodies) {
    assert.doesNotMatch(body, /\bif\s*\(/, "no finally cleanup may be conditional")
    assert.doesNotMatch(body, /&&|\?\./, "no finally cleanup may be short-circuited")
  }
  assert.ok(bodies.some((b) => /^\s*rmSync\(dir, \{ recursive: true, force: true \}\)\s*$/m.test(b)), "the temporary execution directory must always be removed")
  assert.ok(bodies.some((b) => /^\s*removeBootstrapSql\(\)\s*$/m.test(b)), "the repository-root artifact must always be removed")
  // A refused apply also removes a stale artifact…
  assert.match(src.slice(src.indexOf("if (!gates.ok)"), src.indexOf("executionAuthorized = true")), /removeBootstrapSql\(\)/)
  // …and preparation failure removes stale output too: both the invalid-input path
  // and the write-failure path.
  const prepare = codeOf(BOOTSTRAP_PREPARE)
  assert.ok(prepare.split("removeBootstrapSql()").length - 1 >= 2, "prepare must remove stale output on its failure paths")
  assert.match(prepare, /if \(!input\.ok\) \{[\s\S]{0,300}?removeBootstrapSql\(\)/, "invalid operator input must remove stale output")
  assert.match(prepare, /catch \{[\s\S]{0,200}?removeBootstrapSql\(\)/, "a write failure must remove stale output")
})

test("GUARD: post-bootstrap verification reads only counts and never row values", () => {
  const verify = read("scripts/lib/d1BootstrapVerify.mjs")
  // Every query is a bare COUNT — there is no shape in which a row value could be
  // returned or printed.
  for (const m of verify.matchAll(/sql: `([^`]*)`/g)) {
    assert.match(m[1], /^SELECT COUNT\(\*\) AS c FROM /, `verification must issue only COUNT reads: ${m[1]}`)
  }
  assert.match(verify, /if \(!isCountOnlyQuery\(q\.sql\)\) \{ failures\.push\(`\$\{q\.category\}:unsafe_query`\); continue \}/)
  // The apply command must not print anything from the verification but categories.
  const apply = read(BOOTSTRAP_APPLY)
  for (const m of apply.matchAll(/console\.(log|error|warn|info)\(([^\n]*)\)/g)) {
    assert.equal(/\bvalues\b/.test(m[2]), false, `no console call may print operator values: ${m[0]}`)
  }
})

// ─── GUARD: docs must not teach an ungated raw Wrangler bootstrap ──

test("GUARD: no document may present a raw ungated Wrangler command as the bootstrap workflow", () => {
  const problems: string[] = []
  for (const doc of DOCS) {
    for (const line of read(doc).split("\n")) {
      const isRawBootstrapExec = /wrangler\s+d1\s+execute/.test(line) && /bootstrap\.control\.sql/.test(line)
      if (isRawBootstrapExec) problems.push(`${doc}: ${line.trim()}`)
    }
    // The repository-controlled command must be the documented path.
    assert.match(read(doc), /cf:d1:bootstrap:apply/, `${doc} must document the repository-controlled bootstrap apply command`)
  }
  assert.deepEqual(problems, [], `the bootstrap must never be documented as a raw wrangler d1 execute:\n${problems.join("\n")}`)
  // The prepare command itself must point at the gated command, not at Wrangler.
  const prepare = read(BOOTSTRAP_PREPARE)
  const printed = [...prepare.matchAll(/console\.log\("([^"]*)"\)/g)].map((m) => m[1]).join("\n")
  assert.doesNotMatch(printed, /wrangler d1 execute/, "prepare must not instruct the operator to run raw Wrangler")
  assert.match(printed, /cf:d1:bootstrap:apply/)
})

// ─── GUARD: the clean-bootstrap proof must exercise the real lifecycle ──

test("GUARD: the clean-bootstrap integration proof must exercise Action Preview and Approval, not only WorkUnit", () => {
  // The original proof only wrote a WorkUnit, which is exactly why the broken
  // action_previews schema shipped as "verified".
  const src = read(LIFECYCLE_TEST)
  assert.match(src, /actionPreviews\.create\(/, "the clean-bootstrap proof must create an Action Preview")
  assert.match(src, /creatorUserId/, "…with the server-set creator")
  assert.match(src, /decideApproval\(/, "…and must exercise the real approval route")
  assert.match(src, /self_approval_forbidden/, "…including self-approval rejection")
  assert.match(src, /approvalRecords\.findByPreviewId\(/, "…and assert the persisted approval")
  // It must use real SQLite, never FakeD1 (which enforces no schema at all).
  assert.match(src, /SqliteD1Database/)
  assert.doesNotMatch(src, /FakeD1Database/, "FakeD1 can never prove schema compatibility")
})

// ─── GUARD: Worker deploy never migrates or bootstraps ───────────

test("GUARD: Worker deploy never applies migrations or bootstrap data, and keeps read-only remote schema verification", () => {
  // Comments stripped: the deploy script legitimately EXPLAINS that migrations are
  // a separate operator-gated command. What matters is what it EXECUTES.
  const src = codeOf(DEPLOY)
  assert.doesNotMatch(src, /migrations:apply|cf-d1-migrations-apply|applyLaneWithLedger/, "deploy must never apply migrations")
  assert.doesNotMatch(src, /bootstrap:apply|cf-d1-bootstrap-apply|bootstrap:prepare|bootstrap\.control\.sql/, "deploy must never write bootstrap data")
  assert.doesNotMatch(src, /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE/, "deploy must never set an execution gate")
  // The read-only remote schema verification stays part of deploy.
  assert.match(src, /cf-d1-schema-verify-remote|schema:verify:remote|verifyRemoteSchema/, "deploy must keep read-only remote schema verification")
})

test("GUARD: EXTERNAL_ACTIONS_ENABLED stays false", () => {
  const wrangler = JSON.parse(read("wrangler.json"))
  assert.equal(wrangler.vars.EXTERNAL_ACTIONS_ENABLED, "false", "external actions must remain disabled")
  assert.equal(wrangler.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})
