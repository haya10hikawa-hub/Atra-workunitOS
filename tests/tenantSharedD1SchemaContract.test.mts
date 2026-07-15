/**
 * Blocker 4 (P0-PERSIST-014): shared-D1 global object-ID namespace — proven with
 * REAL SQLite constraints (node:sqlite), never FakeD1.
 *
 * Contract for the CURRENT committed schema (Issue #155 owns any future per-tenant
 * schema rebuild + migration execution):
 *   - persisted object IDs are globally unique across ALL tenants in the shared D1;
 *   - tenant isolation is enforced by tenant predicates IN ADDITION to global
 *     uniqueness;
 *   - a cross-tenant global-ID collision fails closed WITHOUT overwriting,
 *     updating, revealing, or deleting the existing tenant's row, and without
 *     disclosing which tenant owns the ID.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { SqliteD1Database, TENANT_DB_MIGRATIONS } from "./helpers/sqliteD1.ts"
import { D1WorkUnitRepository } from "../app/lib/persistence/d1/workUnitRepository.ts"
import { D1WorkUnitFeedbackRepository } from "../app/lib/persistence/d1/workUnitFeedbackRepository.ts"
import { createInMemoryWorkUnitRepository } from "../app/lib/persistence/inMemoryRepositories.ts"
import { D1RepositoryError } from "../app/lib/persistence/d1/types.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import type { TenantDbContext } from "../app/lib/persistence/types.ts"

const A = "tenant-a" as TenantId
const B = "tenant-b" as TenantId
const ctx = (t: TenantId): TenantDbContext => ({ tenantId: t, db: null })
const wuRow = (id: string, tenantId: TenantId, title: string) => ({
  id, tenantId, title, kind: "task", priority: "med", sourceProvider: "mock",
  reason: "r", evidence: "e", nextAction: "n", status: "open",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
})

// ─── 1–6. cross-tenant global-ID collision fails closed ─────────

test("cross-tenant identical ID collision fails closed on the REAL shared-D1 schema", async () => {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS })
  const repo = new D1WorkUnitRepository(db)

  // 1. tenant A inserts ID "same-id".
  await repo.create(ctx(A), wuRow("same-id", A, "A-secret-title"))
  const before = db.rawRow("SELECT * FROM work_units WHERE id = ?", "same-id")

  // 2 + 3. tenant B attempts to insert "same-id" → typed safe repository failure.
  let thrown: unknown
  try {
    await repo.create(ctx(B), wuRow("same-id", B, "B-secret-title"))
    assert.fail("tenant B insert must not succeed")
  } catch (error) {
    thrown = error
  }
  assert.ok(thrown instanceof D1RepositoryError, "must be a typed repository failure")

  // 6. no owner tenant or stored row data appears in the failure.
  const serialized = JSON.stringify({ name: (thrown as Error).name, message: (thrown as Error).message })
  for (const secret of ["tenant-a", "tenant-b", "A-secret-title", "B-secret-title"]) {
    assert.equal(serialized.includes(secret), false, `failure must not disclose ${secret}`)
  }

  // 4. tenant A's row remains byte-equivalent (no overwrite / update / delete).
  const after = db.rawRow("SELECT * FROM work_units WHERE id = ?", "same-id")
  assert.deepEqual(after, before)
  assert.equal(after?.title, "A-secret-title")
  assert.equal(after?.tenant_id, "tenant-a")

  // 5. tenant B cannot read tenant A's row.
  assert.equal(await repo.findById(ctx(B), "same-id"), null)
  assert.equal((await repo.findById(ctx(A), "same-id"))?.title, "A-secret-title")
  db.close()
})

test("cross-tenant collision via upsert fails closed (owner check), A row unchanged", async () => {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS })
  const repo = new D1WorkUnitRepository(db)
  await repo.create(ctx(A), wuRow("dup", A, "A-title"))
  await assert.rejects(
    () => repo.upsert(ctx(B), wuRow("dup", B, "B-title")),
    (e: unknown) => {
      // Typed failure that discloses neither the owning tenant nor row data.
      assert.ok(e instanceof D1RepositoryError)
      const serialized = JSON.stringify({ name: (e as Error).name, message: (e as Error).message })
      for (const secret of ["tenant-a", "tenant-b", "A-title", "B-title"]) {
        assert.equal(serialized.includes(secret), false, `upsert failure must not disclose ${secret}`)
      }
      return true
    },
  )
  assert.equal((await repo.findById(ctx(A), "dup"))?.title, "A-title")
  assert.equal(await repo.findById(ctx(B), "dup"), null)
  db.close()
})

// ─── 7. in-memory divergence is documented, not claimed as parity ─

test("7. the in-memory dev store isolates identical IDs by composite key (DOCUMENTED divergence)", async () => {
  // The in-memory store is a dev-only convenience keyed by (tenantId, id); it does
  // NOT reproduce the shared physical D1's global PRIMARY KEY namespace and is
  // never used in production. This divergence is documented in
  // docs/operations/CLOUDFLARE_D1_SETUP.md — it must not be presented as proof of
  // the global-ID contract (that is what the real-SQLite test above establishes).
  const mem = createInMemoryWorkUnitRepository()
  await mem.create(ctx(A), wuRow("dup", A, "A"))
  await mem.create(ctx(B), wuRow("dup", B, "B")) // no throw in-memory — divergent by design
  assert.equal((await mem.findById(ctx(A), "dup"))?.tenantId, A)
  assert.equal((await mem.findById(ctx(B), "dup"))?.tenantId, B)

  // The REAL schema, by contrast, rejects the second insert.
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS })
  const d1 = new D1WorkUnitRepository(db)
  await d1.create(ctx(A), wuRow("dup", A, "A"))
  await assert.rejects(() => d1.create(ctx(B), wuRow("dup", B, "B")), (e: unknown) => e instanceof D1RepositoryError)
  db.close()
})

// ─── 8. foreign references cannot create a cross-tenant relationship ─

test("8. FK-referencing another tenant's row creates no observable cross-tenant relationship", async () => {
  const db = new SqliteD1Database({ migrations: TENANT_DB_MIGRATIONS, foreignKeys: true })
  const workUnits = new D1WorkUnitRepository(db)
  const feedback = new D1WorkUnitFeedbackRepository(db)

  // Tenant A owns work unit "wu-shared".
  await workUnits.create(ctx(A), wuRow("wu-shared", A, "A-wu"))
  // Both tenants attach feedback referencing that (globally unique) work-unit id.
  await feedback.create(ctx(A), { id: "fb-a", tenantId: A, workUnitId: "wu-shared", feedback: "a", actorUserId: "ua", createdAt: "2026-01-01T00:00:00Z" })
  await feedback.create(ctx(B), { id: "fb-b", tenantId: B, workUnitId: "wu-shared", feedback: "b", actorUserId: "ub", createdAt: "2026-01-01T00:00:00Z" })

  // Each tenant sees ONLY its own feedback for the shared id — no cross-tenant read.
  const aFb = await feedback.findByWorkUnitId(ctx(A), "wu-shared")
  const bFb = await feedback.findByWorkUnitId(ctx(B), "wu-shared")
  assert.deepEqual(aFb.map((f) => f.id), ["fb-a"])
  assert.deepEqual(bFb.map((f) => f.id), ["fb-b"])
  // Tenant B cannot read tenant A's work unit even though B references its id.
  assert.equal(await workUnits.findById(ctx(B), "wu-shared"), null)
  db.close()
})

// ─── Schema-contract guard (detects a future tenant-local-ID claim) ─

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const readFile = (p: string) => readFileSync(resolve(REPO_ROOT, p), "utf8")

test("schema-contract guard: object tables use a GLOBAL id PRIMARY KEY (not tenant-local)", () => {
  const core = readFile("migrations/0002_tenant_core.sql")
  const foundation = readFile("migrations/0003_tenant_persistence_foundation.sql")
  // Global single-column id PRIMARY KEY on the shared object tables.
  assert.match(core, /action_previews[\s\S]*?id\s+TEXT PRIMARY KEY/i)
  assert.match(core, /approval_records[\s\S]*?id\s+TEXT PRIMARY KEY/i)
  assert.match(foundation, /work_units\s*\([\s\S]*?id\s+TEXT PRIMARY KEY/i)
  // These object tables must NOT use a tenant-local composite key like
  // `PRIMARY KEY (tenant_id, id)` — that would be a different (tenant-local) id
  // contract. If a future PR introduces one, it must also update the documented
  // contract + this guard (Issue #155 owns the schema rebuild).
  assert.doesNotMatch(core, /PRIMARY KEY\s*\(\s*tenant_id\s*,\s*id\s*\)/i)
  assert.doesNotMatch(foundation, /PRIMARY KEY\s*\(\s*tenant_id\s*,\s*id\s*\)/i)
})

test("schema-contract guard: docs state the global-ID contract and make no false parity claim", () => {
  const doc = readFile("docs/operations/CLOUDFLARE_D1_SETUP.md").toLowerCase()
  // The honest global-ID contract is documented.
  assert.match(doc, /globally unique/)
  // The FakeD1 limitation is documented (it does not enforce PRIMARY KEY).
  assert.match(doc, /faked1/)
  // No false POSITIVE claim that the parity harness / FakeD1 PROVES that identical
  // IDs can coexist across tenants (the exact statement Blocker 4 requires removed).
  assert.doesNotMatch(doc, /parity harness[\s\S]{0,60}prov(e|es|en)/)
  assert.doesNotMatch(doc, /identical ids[\s\S]{0,40}coexist/)
})
