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
  // The stored database_id is validated (Blocker 3) but NEVER used to construct or
  // fetch a binding — the returned db is always the statically bound tenantDb.
  assert.match(src, /D1_DATABASE_ID_PATTERN/)
  assert.doesNotMatch(src, /db:\s*[^,\n}]*database_id/i)
})

test("route repository resolution builds + passes the tenant resolver in production", () => {
  const src = read(ROUTE_REPOS)
  assert.match(src, /new D1TenantDbResolver/)
  assert.match(src, /rt\.source === "cloudflare"/)
  // Cloudflare production goes through the mandatory-resolver production API; local
  // goes through the explicitly named local API.
  assert.match(src, /resolveProductionRepositories/)
  assert.match(src, /resolveLocalRepositories/)
})

test("the production D1 path validates via the resolver (no unchecked TENANT_DB_DEFAULT bundle)", () => {
  const src = read(REPO_RESOLVER)
  // Production resolution flows ONLY through resolveProductionRepositories, whose
  // resolver parameter is required and which consumes the resolver strictly.
  assert.match(src, /resolveProductionRepositories/)
  assert.match(src, /resolveViaTenantResolver\(authority\.resolver,\s*tenantId,\s*\{\s*strict:\s*true,\s*controlDb:\s*p\.CONTROL_DB\s*\}\)/)
  // Strict validation rejects control-DB, mismatched tenant, and non-D1 stores.
  assert.match(src, /store === opts\.controlDb/)
  assert.match(src, /ctx\.tenantId !== tenantId/)
  assert.match(src, /!isD1Like\(store\)/)
})

test("Blocker 1: production resolver parameter is mandatory (structural), never inferred", () => {
  const src = read(REPO_RESOLVER)
  // resolveProductionRepositories takes a REQUIRED resolver (not `resolver?`).
  assert.match(src, /resolveProductionRepositories\([\s\S]*?resolver:\s*TenantDbResolver\b/)
  // The production authority discriminant carries a required resolver.
  assert.match(src, /kind:\s*"cloudflare_production"[\s\S]*?resolver:\s*TenantDbResolver/)
  // Direct binding is only reachable through the explicitly named local API, which
  // demands an explicit allowDirectBinding flag (never inferred from omission).
  assert.match(src, /resolveLocalRepositories/)
  assert.match(src, /allowDirectBinding:\s*true/)
})

test("Blocker 1 GUARD: persistence.mode==='d1' with resolver===undefined can NOT yield a bundle", () => {
  const src = read(REPO_RESOLVER)
  // The dangerous direct-bundle expression must be gone: the persistence d1 branch
  // fails closed when no resolver is supplied and never bundles TENANT_DB_DEFAULT
  // directly on a missing resolver.
  assert.match(src, /if\s*\(!options\.resolver\)\s*return\s*\{\s*ok:\s*false/)
  assert.doesNotMatch(src, /options\.d1Binding\s*\?\?\s*p\.TENANT_DB_DEFAULT/)
  // resolveProductionRepositories (the only production bundle producer) never reads
  // a caller-supplied binding — ctx.db is authoritative.
  const prodStart = src.indexOf("export async function resolveProductionRepositories")
  assert.ok(prodStart >= 0)
  const prodEnd = src.indexOf("export async function resolveLocalRepositories", prodStart)
  const prodBlock = src.slice(prodStart, prodEnd)
  assert.doesNotMatch(prodBlock, /d1Binding/)
})

test("d1Binding cannot override ctx.db in the strict (production) resolver path", () => {
  const src = read(REPO_RESOLVER)
  // The strict block resolves the store from ctx.db only; it must not read d1Binding.
  const strictStart = src.indexOf("if (opts.strict)")
  assert.ok(strictStart >= 0)
  const strictBlock = src.slice(strictStart, src.indexOf("return { ok: true, store, ctx }", strictStart) + 40)
  assert.doesNotMatch(strictBlock, /d1Binding/)
  // The production path passes strict:true with the control DB and no d1Binding.
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
  test(`${route} gates fallback on the central helper, never ambient process.env.NODE_ENV or source alone`, () => {
    const src = read(route)
    // Blocker 2 requirement 6: no route reads process.env.NODE_ENV.
    assert.doesNotMatch(src, /process\.env\.NODE_ENV/)
    // Blocker 2 requirement 5: the fallback decision is NOT made from runtime.source
    // alone — it is delegated to the central authority helper.
    assert.match(src, /canUseLocalPersistenceFallback\(runtime\)/)
    assert.doesNotMatch(src, /runtime\.source\s*===\s*"cloudflare"/)
  })
}

test("Blocker 2: the fallback helper requires local + non-production + dev adapter + dev capability + no CF ctx", () => {
  const src = read("app/lib/runtime/localFallbackAuthority.ts")
  assert.match(src, /runtime\.source !== "local"/)
  assert.match(src, /runtime\.auth\.isProduction !== false/)
  assert.match(src, /runtime\.auth\.adapter !== "dev"/)
  assert.match(src, /runtime\.security\.allowDevSession !== true/)
  assert.match(src, /getRequestRuntimeEnv\(\) !== null/)
  // No new ALLOW_* capability and no NODE_ENV read.
  assert.doesNotMatch(src, /process\.env/)
})

test("the resolver failure reason type carries no tenantId / disclosure field", () => {
  const src = read("app/lib/persistence/repositories.ts")
  const typeStart = src.indexOf("export type TenantDbResolution")
  assert.ok(typeStart >= 0)
  const block = src.slice(typeStart, typeStart + 220)
  // The failure arm is `{ ok: false; reason: ... }` — no tenantId / message field.
  assert.doesNotMatch(block, /tenantId/)
  assert.doesNotMatch(block, /message/)
})
