/**
 * P0-PERSIST-015 — freshly bootstrapped local D1 → request-scoped JWT session →
 * tenant repository bundle (Issue #155).
 *
 * Proves the reproducible bootstrap is OPERATIONALLY integrated: a request-scoped
 * JWT session resolves against the freshly migrated + seeded local Control DB and
 * reaches the freshly migrated tenant repository bundle through the production
 * resolver path (mandatory tenant-registry validation from PR #165).
 *
 * Uses REAL SQLite (node:sqlite) over the committed manifest lanes. The JWT secret
 * is a test-only literal generated for this file — no real secret is committed.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { SqliteD1Database } from "./helpers/sqliteD1.ts"
import { signHs256Jwt } from "./helpers/jwt.ts"
import { loadManifest, buildPlan } from "../scripts/lib/d1MigrationManifest.mjs"
import { loadSchemaContract, verifyDatabase } from "../scripts/lib/d1SchemaContract.mjs"
import { LOCAL_FIXTURE, seedLocalControlFixture } from "../scripts/lib/d1BootstrapFixture.mjs"
import { runWithInjectedRuntimeEnv } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { resolveValidatedRequestRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { requireSession } from "../app/lib/security/session.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
// Test-only signing material for this file. NOT a real secret.
const TEST_JWT_SECRET = "p0-persist-015-local-bootstrap-test-secret-32b+"
const ISS = "https://local-bootstrap.test"
const AUD = "workunit-os-local"

/** Bootstrap BOTH lanes into real SQLite via the canonical manifest. */
function bootstrapFreshDatabases() {
  const loaded = loadManifest(REPO_ROOT)
  if (!loaded.ok) throw new Error(`manifest unreadable: ${loaded.error}`)
  const lanePaths = (binding: string) => buildPlan(loaded.manifest, binding).map((s) => s.path)
  const control = new SqliteD1Database({ migrations: lanePaths("CONTROL_DB") })
  const tenant = new SqliteD1Database({ migrations: lanePaths("TENANT_DB_DEFAULT") })
  return { control, tenant }
}

function cloudflareEnv(control: SqliteD1Database, tenant: SqliteD1Database): AppEnv {
  return {
    CONTROL_DB: control, TENANT_DB_DEFAULT: tenant, PERSISTENCE_MODE: "d1",
    EXTERNAL_ACTIONS_ENABLED: "false", ALLOW_LEGACY_INGEST_FALLBACK: "false", ALLOWED_ORIGINS: "https://app.example.test",
    AUTH_ADAPTER: "jwt", JWT_AUTH_SECRET: TEST_JWT_SECRET, JWT_AUTH_ISSUER: ISS, JWT_AUTH_AUDIENCE: AUD,
  } as unknown as AppEnv
}

async function bearerRequest(subject: string): Promise<Request> {
  const token = await signHs256Jwt({ sub: subject, email: LOCAL_FIXTURE.user.email, iss: ISS, aud: AUD }, TEST_JWT_SECRET)
  return new Request("http://localhost/api/workunit/inbox", { headers: { Authorization: `Bearer ${token}` } })
}

test("a freshly bootstrapped local Control DB + fixture resolves a JWT session and reaches the tenant repository bundle", async () => {
  const { control, tenant } = bootstrapFreshDatabases()
  const loadedContract = loadSchemaContract(REPO_ROOT)
  if (!loadedContract.ok) throw new Error(`schema contract unreadable: ${loadedContract.error}`)
  const contract = loadedContract.contract
  // Schema verification FIRST — seeding only happens on a verified schema.
  assert.deepEqual(verifyDatabase(control.raw(), contract.databases.CONTROL_DB).failures, [])
  assert.deepEqual(verifyDatabase(tenant.raw(), contract.databases.TENANT_DB_DEFAULT).failures, [])
  seedLocalControlFixture(control.raw())

  await runWithInjectedRuntimeEnv(cloudflareEnv(control, tenant), async () => {
    const runtimeResult = resolveValidatedRequestRuntimeConfig()
    assert.equal(runtimeResult.ok, true)
    if (!runtimeResult.ok) return
    const runtime = runtimeResult.runtime
    assert.equal(runtime.source, "cloudflare")

    // 1. The JWT session resolves against the freshly bootstrapped Control DB.
    const session = await requireSession(await bearerRequest(LOCAL_FIXTURE.authIdentity.provider_subject), runtime)
    assert.equal(session.ok, true, "JWT session must resolve against the bootstrapped control registry")
    if (!session.ok) return
    assert.equal(session.session.tenantId, LOCAL_FIXTURE.tenant.id)
    assert.equal(session.session.role, "owner")

    // 2. The production resolver path (mandatory registry validation) reaches the
    //    freshly migrated tenant repository bundle.
    const repos = await resolveRouteRepositories(session.session.tenantId as TenantId, runtime)
    assert.equal(repos.ok, true, "the tenant repository bundle must resolve via the registry resolver")
    if (!repos.ok) return
    assert.equal(repos.bundle.ctx.tenantId, LOCAL_FIXTURE.tenant.id)

    // 3. The bundle actually works against the freshly migrated tenant schema.
    const now = new Date().toISOString()
    await repos.bundle.workUnits.upsert(repos.bundle.ctx, {
      id: "wu-bootstrap-probe", tenantId: LOCAL_FIXTURE.tenant.id as TenantId, title: "probe", kind: "task",
      priority: "medium", sourceProvider: "mock", reason: "r", evidence: "e", nextAction: "n",
      status: "open", createdAt: now, updatedAt: now,
    })
    const found = await repos.bundle.workUnits.findById(repos.bundle.ctx, "wu-bootstrap-probe")
    assert.equal(found?.tenantId, LOCAL_FIXTURE.tenant.id)
    // Row-level isolation still holds on the freshly migrated schema.
    assert.equal(await repos.bundle.workUnits.findById({ tenantId: "other-tenant" as TenantId, db: null }, "wu-bootstrap-probe"), null)
  }, { production: true })

  control.close(); tenant.close()
})

test("an unknown JWT subject cannot resolve a session against the bootstrapped Control DB", async () => {
  const { control, tenant } = bootstrapFreshDatabases()
  seedLocalControlFixture(control.raw())
  await runWithInjectedRuntimeEnv(cloudflareEnv(control, tenant), async () => {
    const runtime = resolveValidatedRequestRuntimeConfig()
    if (!runtime.ok) throw new Error("runtime")
    const session = await requireSession(await bearerRequest("not-a-seeded-subject"), runtime.runtime)
    assert.equal(session.ok, false, "an unseeded identity must fail closed")
  }, { production: true })
  control.close(); tenant.close()
})

test("without the seeded tenant_databases registry row, the tenant bundle fails closed (registry is mandatory)", async () => {
  const { control, tenant } = bootstrapFreshDatabases()
  // Seed the identity/membership but DELETE the registry row → the production
  // resolver must refuse to hand out a tenant repository bundle.
  seedLocalControlFixture(control.raw())
  control.raw().exec("DELETE FROM tenant_databases")
  await runWithInjectedRuntimeEnv(cloudflareEnv(control, tenant), async () => {
    const runtime = resolveValidatedRequestRuntimeConfig()
    if (!runtime.ok) throw new Error("runtime")
    const session = await requireSession(await bearerRequest(LOCAL_FIXTURE.authIdentity.provider_subject), runtime.runtime)
    assert.equal(session.ok, true)
    if (!session.ok) return
    const repos = await resolveRouteRepositories(session.session.tenantId as TenantId, runtime.runtime)
    assert.equal(repos.ok, false, "a missing registry record must fail closed")
    if (!repos.ok) assert.equal(repos.status, 503)
  }, { production: true })
  control.close(); tenant.close()
})
