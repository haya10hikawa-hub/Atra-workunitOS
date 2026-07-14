/**
 * Architecture guards for tenant-isolated persistence (P0-PERSIST-014).
 * Source scans (comment-stripped) that fail if a safety property regresses.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([^:])\/\/.*$/gm, "$1")
    .replace(/^\s*\/\/.*$/gm, "")
}
const read = (p: string) => stripComments(readFileSync(resolve(REPO_ROOT, p), "utf8"))

const RESOLVER = "app/lib/persistence/tenantDbResolver.ts"
const REPO_RESOLVER = "app/lib/persistence/repositoryResolver.ts"
const ROUTE_REPOS = "app/lib/persistence/routeRepositories.ts"
const INMEM = "app/lib/persistence/inMemoryRepositories.ts"
const ROUTES = ["app/api/audit/recent/route.ts", "app/api/workunit/inbox/route.ts", "app/api/integrations/status/route.ts"]

test("D1TenantDbResolver returns the tenant DB, never the control DB", () => {
  const src = read(RESOLVER)
  assert.match(src, /db:\s*this\.tenantDb/)
  assert.doesNotMatch(src, /db:\s*this\.controlDb/)
  // A tenant database ID is never treated as a constructible binding.
  assert.doesNotMatch(src, /database_id/)
})

test("route repository resolution builds + passes the tenant resolver in production", () => {
  const src = read(ROUTE_REPOS)
  assert.match(src, /new D1TenantDbResolver/)
  assert.match(src, /rt\.source === "cloudflare"/)
  assert.match(src, /resolver\b/)
})

test("the production D1 path validates via the resolver (no unchecked TENANT_DB_DEFAULT bundle)", () => {
  const src = read(REPO_RESOLVER)
  // Strict resolver consumption in the production persistence branch.
  assert.match(src, /resolveViaTenantResolver\(options\.resolver,\s*tenantId,\s*\{\s*strict:\s*true/)
  // Strict validation rejects control-DB, mismatched tenant, and non-D1 stores.
  assert.match(src, /store === opts\.controlDb/)
  assert.match(src, /ctx\.tenantId !== tenantId/)
  assert.match(src, /!isD1Like\(store\)/)
})

test("d1Binding cannot override ctx.db in the strict (production) resolver path", () => {
  const src = read(REPO_RESOLVER)
  // The strict block resolves the store from ctx.db only; it must not read d1Binding.
  const strictStart = src.indexOf("if (opts.strict)")
  assert.ok(strictStart >= 0)
  const strictBlock = src.slice(strictStart, src.indexOf("return { ok: true, store, ctx }", strictStart) + 40)
  assert.doesNotMatch(strictBlock, /d1Binding/)
  // The production persistence branch passes strict:true without a d1Binding.
  assert.match(src, /\{\s*strict:\s*true,\s*controlDb:\s*p\.CONTROL_DB\s*\}/)
})

test("in-memory writes derive tenant from ctx (never key/store on row.tenantId)", () => {
  const src = read(INMEM)
  // No write keys or summary keys built from the caller-supplied row.tenantId.
  assert.doesNotMatch(src, /keyFor\(row\.tenantId/)
  assert.doesNotMatch(src, /\$\{row\.tenantId\}/)
  assert.doesNotMatch(src, /store\.set\(row\.id,/)
  // Writes derive the stored tenant from ctx.
  assert.match(src, /tenantId:\s*_ctx\.tenantId/)
})

test("tenant updates are tenant-scoped before mutation", () => {
  // In-memory approval updateStatus checks the tenant before mutating.
  assert.match(read(INMEM), /r\.tenantId !== _ctx\.tenantId/)
  // D1 updates include a tenant predicate.
  assert.match(read("app/lib/persistence/d1/workUnitRepository.ts"), /UPDATE work_units[\s\S]*tenant_id = \?/)
  assert.match(read("app/lib/persistence/d1/approvalRecordRepository.ts"), /UPDATE approval_records[\s\S]*tenant_id = \?/)
})

for (const route of ROUTES) {
  test(`${route} uses request-scoped source, never ambient process.env.NODE_ENV, for the fallback`, () => {
    const src = read(route)
    assert.doesNotMatch(src, /process\.env\.NODE_ENV/)
    // Fallback / safe-error decision is gated on the request-scoped source.
    assert.match(src, /runtime\.source === "cloudflare"/)
  })
}

test("the resolver failure reason type carries no tenantId / disclosure field", () => {
  const src = read("app/lib/persistence/repositories.ts")
  const typeStart = src.indexOf("export type TenantDbResolution")
  assert.ok(typeStart >= 0)
  const block = src.slice(typeStart, typeStart + 220)
  // The failure arm is `{ ok: false; reason: ... }` — no tenantId / message field.
  assert.doesNotMatch(block, /tenantId/)
  assert.doesNotMatch(block, /message/)
})
