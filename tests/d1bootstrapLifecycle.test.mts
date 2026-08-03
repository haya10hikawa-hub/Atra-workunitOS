/**
 * P0-PERSIST-015 — complete repository lifecycle on a CLEAN bootstrap (Issue #155).
 *
 * WHAT THIS EXISTS TO CATCH
 * -------------------------
 * The previous manifest applied only 0002/0003/0005 and parked 0006 as `deferred`.
 * That produced an `action_previews` table with no `created_by_user_id` — a column
 * `D1ActionPreviewRepository.create()` ALWAYS inserts. A "clean" bootstrap therefore
 * yielded a database whose very first Action Preview write fails, and the schema
 * contract excluded the column, so the verifier happily accepted it. The old
 * integration proof only exercised WorkUnit, so nothing caught it.
 *
 * This file proves the whole lifecycle on databases bootstrapped from the CANONICAL
 * manifest through the REAL ledger, using REAL SQLite (node:sqlite) — never FakeD1,
 * which does not enforce schema at all and cannot prove schema compatibility.
 *
 * The JWT secret is a test-only literal generated for this file — no real secret.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { SqliteD1Database } from "./helpers/sqliteD1.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import { loadManifest, buildPlan } from "../scripts/lib/d1MigrationManifest.mjs"
import { applyLaneWithLedger } from "../scripts/lib/d1MigrationLedger.mjs"
import { loadSchemaContract, verifyDatabase } from "../scripts/lib/d1SchemaContract.mjs"
import { LOCAL_FIXTURE, seedLocalControlFixture } from "../scripts/lib/d1BootstrapFixture.mjs"
import { runWithInjectedRuntimeEnv } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { resolveValidatedRequestRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { requireSession } from "../app/lib/security/session.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { D1ActionPreviewRepository } from "../app/lib/persistence/d1/actionPreviewRepository.ts"
import { POST as decideApproval } from "../app/api/workunit/[id]/approval/route.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId, UserId } from "../app/lib/tenant/types.ts"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
// Test-only signing material for this file. NOT a real secret.
const TEST_JWT_SECRET = "p0-persist-015-lifecycle-test-secret-32bytes+"
const ISS = "https://local-bootstrap.test"
const AUD = "workunit-os-local"

// A SECOND identity so an approval can come from someone other than the creator.
const APPROVER = Object.freeze({
  userId: "local-dev-approver",
  email: "local-dev-approver@local.invalid",
  subject: "local-dev-approver-subject",
})

const TENANT = LOCAL_FIXTURE.tenant.id as TenantId
const WORK_UNIT_ID = "wu-lifecycle-probe"

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

/**
 * Bootstrap BOTH lanes into EMPTY real-SQLite databases by applying the COMPLETE
 * canonical manifest through the ledger — the same code path production uses.
 */
function bootstrapCleanDatabases() {
  const control = new SqliteD1Database({ migrations: [] })
  const tenant = new SqliteD1Database({ migrations: [] })
  applyLaneWithLedger(control.raw(), manifest(), "CONTROL_DB", REPO_ROOT)
  applyLaneWithLedger(tenant.raw(), manifest(), "TENANT_DB_DEFAULT", REPO_ROOT)
  return { control, tenant }
}

/** Seed the local fixture plus the second (approver) identity. */
function seedControl(control: SqliteD1Database) {
  seedLocalControlFixture(control.raw())
  const db = control.raw()
  const now = "2020-01-01T00:00:00.000Z"
  db.prepare("INSERT INTO users (id,email,created_at,updated_at) VALUES (?,?,?,?)").run(APPROVER.userId, APPROVER.email, now, now)
  db.prepare("INSERT INTO tenant_memberships (id,tenant_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("local-dev-approver-membership", TENANT, APPROVER.userId, "owner", "active", now, now)
  db.prepare("INSERT INTO auth_identities (id,user_id,provider,provider_subject,email,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("local-dev-approver-identity", APPROVER.userId, "jwt", APPROVER.subject, APPROVER.email, now, now)
}

function cloudflareEnv(control: SqliteD1Database, tenant: SqliteD1Database): AppEnv {
  return {
    CONTROL_DB: control, TENANT_DB_DEFAULT: tenant, PERSISTENCE_MODE: "d1",
    // WU-02S: a Cloudflare production runtime REQUIRES a validated
    // trusted-origin list; its absence is a fail-closed config error.
    ALLOWED_ORIGINS: "http://localhost:3000",
    EXTERNAL_ACTIONS_ENABLED: "false", ALLOW_LEGACY_INGEST_FALLBACK: "false",
    AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: TEST_JWT_SECRET, JWT_AUTH_ISSUER: ISS, JWT_AUTH_AUDIENCE: AUD,
  } as unknown as AppEnv
}

async function bearer(subject: string, email: string, init?: RequestInit): Promise<Request> {
  const token = await signHs256Jwt({ sub: subject, email, iss: ISS, aud: AUD }, TEST_JWT_SECRET)
  return new Request(`http://localhost:3000/api/workunit/${WORK_UNIT_ID}/approval`, {
    ...init,
    // `host` is explicit: the mutation guard binds the target host and Node's
    // Request does not populate it from the URL.
    headers: { Authorization: `Bearer ${token}`, host: "localhost:3000", "content-type": "application/json", origin: "http://localhost:3000", ...(init?.headers ?? {}) },
  })
}

// ─── 1–9. The full lifecycle on a clean bootstrap ────────────────

test("a clean bootstrap supports the COMPLETE lifecycle: session → repositories → WorkUnit → Action Preview (server-set creator) → four-eyes Approval", async () => {
  const { control, tenant } = bootstrapCleanDatabases()

  // 10 (pre-condition). The bootstrapped schema satisfies the contract, which now
  // REQUIRES action_previews.created_by_user_id.
  assert.deepEqual(verifyDatabase(control.raw(), contract().databases.CONTROL_DB).failures, [])
  assert.deepEqual(verifyDatabase(tenant.raw(), contract().databases.TENANT_DB_DEFAULT).failures, [])
  seedControl(control)

  await runWithInjectedRuntimeEnv(cloudflareEnv(control, tenant), async () => {
    const runtimeResult = resolveValidatedRequestRuntimeConfig()
    assert.equal(runtimeResult.ok, true)
    if (!runtimeResult.ok) return
    const runtime = runtimeResult.runtime

    // 1. The JWT session resolves against the freshly bootstrapped Control DB.
    const creatorReq = await bearer(LOCAL_FIXTURE.authIdentity.provider_subject, LOCAL_FIXTURE.user.email)
    const session = await requireSession(creatorReq, runtime)
    assert.equal(session.ok, true, "a JWT session must resolve on a clean bootstrap")
    if (!session.ok) return
    assert.equal(session.session.tenantId, TENANT)

    // 2. Production repository resolution succeeds (mandatory registry validation).
    const repos = await resolveRouteRepositories(TENANT, runtime)
    assert.equal(repos.ok, true, "the tenant repository bundle must resolve")
    if (!repos.ok) return
    const { ctx, workUnits, actionPreviews, approvalRecords } = repos.bundle

    // 3. WorkUnit create/read.
    const now = new Date().toISOString()
    await workUnits.create(ctx, {
      id: WORK_UNIT_ID, tenantId: TENANT, title: "lifecycle", kind: "review_waiting",
      priority: "high", sourceProvider: "github", reason: "r", evidence: "e", nextAction: "n",
      status: "open", createdAt: now, updatedAt: now,
    })
    assert.equal((await workUnits.findById(ctx, WORK_UNIT_ID))?.id, WORK_UNIT_ID)

    // 4. Action Preview create with a SERVER-SET creator. On the old lane this very
    //    call fails with "table action_previews has no column named created_by_user_id".
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()
    const created = await actionPreviews.create(ctx, {
      id: "ap-lifecycle", tenantId: TENANT, workUnitId: WORK_UNIT_ID, actionType: "internal_task",
      targetPreview: JSON.stringify({ t: 1 }), payloadPreview: JSON.stringify({ p: 2 }),
      requiresApproval: 1, status: "preview", targetHash: "target-hash-abc", payloadHash: "payload-hash-def",
      createdAt: now, expiresAt, creatorUserId: session.session.userId as UserId,
    })
    assert.equal(created.creatorUserId, session.session.userId)

    // 5. Read-back returns the SAME creator (the column round-trips).
    const readBack = await actionPreviews.findById(ctx, "ap-lifecycle")
    assert.equal(readBack?.creatorUserId, session.session.userId, "the stored creator must round-trip exactly")
    // 8 (part). The preview↔WorkUnit relationship and hashes are exact.
    assert.equal(readBack?.workUnitId, WORK_UNIT_ID)
    assert.equal(readBack?.targetHash, "target-hash-abc")
    assert.equal(readBack?.payloadHash, "payload-hash-def")

    // 9. A wrong-tenant lookup of the same preview id returns null.
    assert.equal(await actionPreviews.findById({ ...ctx, tenantId: "other-tenant" as TenantId }, "ap-lifecycle"), null)

    // 7. Self-approval is rejected — the creator cannot approve their own preview.
    const selfRes = await decideApproval(
      await bearer(LOCAL_FIXTURE.authIdentity.provider_subject, LOCAL_FIXTURE.user.email, {
        method: "POST", body: JSON.stringify({ actionPreviewId: "ap-lifecycle", decision: "approve" }),
      }),
      { params: Promise.resolve({ id: WORK_UNIT_ID }) },
    )
    assert.equal(selfRes.status, 403, "self-approval must remain rejected")
    assert.equal((await selfRes.json()).error, "self_approval_forbidden")
    assert.equal(await approvalRecords.findByPreviewId(ctx, "ap-lifecycle"), null, "a rejected self-approval must record no decision")

    // 6. Approval by a DIFFERENT approver succeeds.
    const approveRes = await decideApproval(
      await bearer(APPROVER.subject, APPROVER.email, {
        method: "POST", body: JSON.stringify({ actionPreviewId: "ap-lifecycle", decision: "approve" }),
      }),
      { params: Promise.resolve({ id: WORK_UNIT_ID }) },
    )
    assert.equal(approveRes.status, 201, `a distinct approver must be able to approve (got ${approveRes.status})`)

    // 8. The approval's hashes and relationships are exact.
    const decision = await approvalRecords.findByPreviewId(ctx, "ap-lifecycle")
    assert.ok(decision, "the approval decision must be persisted")
    assert.equal(decision.workUnitId, WORK_UNIT_ID)
    assert.equal(decision.actionPreviewId, "ap-lifecycle")
    assert.equal(decision.targetHash, "target-hash-abc", "the approval must bind the exact target hash")
    assert.equal(decision.payloadHash, "payload-hash-def", "the approval must bind the exact payload hash")
    assert.equal(decision.approvedByUserId, APPROVER.userId)
    assert.notEqual(decision.approvedByUserId, readBack?.creatorUserId, "approver and creator must differ")
  }, { production: true })

  control.close(); tenant.close()
})

// ─── 10. Verification fails BEFORE the repository is used ────────

test("10. a schema missing created_by_user_id FAILS verification (the verifier no longer accepts an unusable database)", () => {
  // The exact schema the old `deferred` lane produced.
  const db = new DatabaseSync(":memory:")
  for (const step of buildPlan(manifest(), "TENANT_DB_DEFAULT")) {
    if (step.name.startsWith("0006")) continue
    db.exec(migrationSql(step.path))
  }
  const result = verifyDatabase(db, contract().databases.TENANT_DB_DEFAULT)
  assert.equal(result.ok, false, "an action_previews without created_by_user_id must not verify")
  assert.ok(
    result.failures.some((f: { category: string; table?: string; name?: string }) =>
      f.category === "missing_column" && f.table === "action_previews" && f.name === "created_by_user_id"),
    `expected a missing_column failure for created_by_user_id, got ${JSON.stringify(result.failures)}`,
  )
  db.close()
})

// ─── Direct regression: the old incomplete lane ──────────────────

test("REGRESSION: on the old 0002/0003/0005-only lane, D1ActionPreviewRepository.create() FAILS — and passes on the complete lane", async () => {
  const row = {
    id: "ap-regression", tenantId: TENANT, workUnitId: WORK_UNIT_ID, actionType: "internal_task",
    targetPreview: "{}", payloadPreview: "{}", requiresApproval: 1, status: "preview",
    targetHash: "t", payloadHash: "p", createdAt: "2026-07-16T00:00:00.000Z",
    expiresAt: "2026-07-16T00:30:00.000Z", creatorUserId: "local-dev-user" as UserId,
  }
  const ctx = { tenantId: TENANT, db: null }

  // The OLD lane: 0006 excluded, exactly as `deferred` produced it.
  const old = new SqliteD1Database({
    migrations: ["migrations/0002_tenant_core.sql", "migrations/0003_tenant_persistence_foundation.sql", "migrations/0005_tenant_scoped_indexes.sql"],
  })
  // The repository's create FAILS. The error surfaces as the opaque typed
  // `write_failed` rather than the raw SQLite message — the write guard must not
  // leak schema details — so the failure is asserted on the typed category, and the
  // underlying CAUSE is confirmed directly against the engine below.
  await assert.rejects(
    () => new D1ActionPreviewRepository(old).create(ctx, { ...row }),
    (err: Error) => err.message === "write_failed",
    "the incomplete lane must reproduce the original Action Preview create failure",
  )
  // The cause, confirmed at the engine: the column the repository always inserts
  // simply does not exist on the old lane.
  const oldCols = old.raw().prepare("SELECT name FROM pragma_table_info('action_previews')").all().map((c) => (c as { name: string }).name)
  assert.equal(oldCols.includes("created_by_user_id"), false, "the old lane's action_previews genuinely lacks the column")
  old.close()

  // The REPAIRED complete lane: the same operation succeeds.
  const complete = new SqliteD1Database({ migrations: [] })
  applyLaneWithLedger(complete.raw(), manifest(), "TENANT_DB_DEFAULT", REPO_ROOT)
  const saved = await new D1ActionPreviewRepository(complete).create(ctx, { ...row })
  assert.equal(saved.creatorUserId, "local-dev-user")
  assert.equal((await new D1ActionPreviewRepository(complete).findById(ctx, "ap-regression"))?.creatorUserId, "local-dev-user")
  complete.close()
})

/** Read a committed migration's SQL (path already validated by the manifest). */
function migrationSql(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf8")
}
