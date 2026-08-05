/**
 * WU-02S — INV-SAFE-1 structural invariant (T1–T11).
 *
 * > **INV-SAFE-1.** No handler exported as `GET`, `HEAD` or `OPTIONS` from any
 * > module under `app/api/**​/route.{js,jsx,ts,tsx}` may cause **durable
 * > tenant/business-state mutation, provider mutation or external action** — on
 * > any code path, for any query string, under any feature flag.
 *
 * DOCUMENTED EXCLUSIONS (owner decision D4). Both are deliberate and both are
 * drift-tested by T4:
 *
 *   - `checkRateLimit` — EXCLUDED. `app/lib/security/rateLimitGate.ts` mutates a
 *     module-scope in-memory `Map`, per isolate, lost on recycle. It is not
 *     durable, not tenant state, not business state, not a provider mutation
 *     and not an external action. Including it would force this invariant to
 *     ban an availability control from read paths, which is not the property
 *     being protected.
 *   - `writeAuditLog` — EXCLUDED **while it has no durable backend**.
 *     `app/lib/security/auditLog.ts` is a documented no-op that only
 *     `console.log`s under a development flag. T4 makes this exclusion
 *     CONDITIONAL on that file containing no repository call, so if it ever
 *     gains a backend the derivation turns that into a build failure rather
 *     than a silent regression.
 *
 * The overbroad formulation "no mutation of any kind" is PROHIBITED: it is
 * factually false at these bytes and would invite widening the scanner until an
 * availability control is banned from read paths.
 *
 * EVIDENCE LIMITS — stated, not overclaimed:
 *   1. No whole-program transitive proof is claimed. This file resolves direct
 *      and module-local edges only.
 *   2. Cross-module aliasing, dynamically-keyed property access and value-typed
 *      callbacks are NOT statically detected here. Layer L1 (type-level
 *      capability removal) makes them impossible to construct, and the
 *      executable probes in `workunitInboxGetReadOnly.test.mts` catch them at
 *      runtime if L1 is ever weakened.
 *   3. Nothing in this file proves transitive purity.
 *
 * A module-graph reachability layer is deliberately NOT added: every route
 * imports `routeRepositories.ts`, so file-level reachability would flag 100% of
 * handlers and have zero discriminating power.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { listFiles } from "../scripts/lib/typescriptModuleGraph.mjs"
import nextConfig from "../next.config.ts"
// Shared analysis machinery. There is exactly ONE generic route/AST scanner in
// the repository; this suite and securityRefactorCriteriaRatchet both consume
// it, so the two can never silently disagree. Each keeps its own positive
// controls, so a helper defect is detectable from either side.
import {
  HTTP_METHODS,
  SAFE_METHODS,
  closureCallNames,
  extractRouteExports,
  parseSource,
  scanRouteExports,
  type RouteExport,
} from "./helpers/routeSurface.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

/** Names excluded from the durable-write vocabulary by owner decision D4. */
const DOCUMENTED_EXCLUSIONS = ["checkRateLimit", "writeAuditLog"] as const

const EXPECTED_SAFE_HANDLERS = [
  "app/api/audit/recent/route.ts#GET",
  "app/api/integrations/status/route.ts#GET",
  "app/api/workunit/[id]/approval/route.ts#GET",
  "app/api/workunit/[id]/approval/status/route.ts#GET",
  "app/api/workunit/inbox/route.ts#GET",
  "app/api/workunit/tools/route.ts#GET",
]

const EXPECTED_UNSAFE_HANDLERS = [
  "app/api/workunit/[id]/action-preview/route.ts#POST",
  "app/api/workunit/[id]/approval/route.ts#POST",
  "app/api/workunit/[id]/execution/dry-run/route.ts#POST",
  "app/api/workunit/[id]/feedback/route.ts#POST",
  "app/api/workunit/inbox/refresh/route.ts#POST",
  "app/api/workunit/tools/route.ts#POST",
]

/** Safe handlers that resolve repositories and must use the read-only resolver. */
const REPOSITORY_RESOLVING_SAFE_HANDLERS = [
  "app/api/audit/recent/route.ts#GET",
  "app/api/integrations/status/route.ts#GET",
  "app/api/workunit/[id]/approval/route.ts#GET",
  "app/api/workunit/[id]/approval/status/route.ts#GET",
  "app/api/workunit/inbox/route.ts#GET",
]

// ─── T1 — fail-closed discovery ─────────────────────────────────

test("T1: route discovery is non-vacuous, covers every export form, and throws on exotic forms", async () => {
  const surfaces = await scanRouteSurface()
  assert.ok(surfaces.length > 0, "route discovery must not be empty")
  const safe = surfaces.filter((item) => SAFE_METHODS.has(item.method))
  const unsafe = surfaces.filter((item) => !SAFE_METHODS.has(item.method))
  assert.ok(safe.length > 0, "safe subset must not be empty")
  assert.ok(unsafe.length > 0, "unsafe subset must not be empty")
  assert.deepEqual(safe.map((item) => item.key).sort(), [...EXPECTED_SAFE_HANDLERS].sort())
  assert.deepEqual(unsafe.map((item) => item.key).sort(), [...EXPECTED_UNSAFE_HANDLERS].sort())

  // Every supported export spelling is discovered.
  const virtual = [
    "export function POST() {}",
    "export const PUT = async () => {}",
    "const PATCH = () => {}; export { PATCH }",
    "export { remove as DELETE, read as HEAD } from './handlers'",
    "export async function GET() {}",
    "const OPTIONS = () => {}; export { OPTIONS }",
  ].join("\n")
  assert.deepEqual(extractRouteExports("virtual/route.ts", virtual).map((i) => i.method).sort(), [...HTTP_METHODS].sort())

  // Exotic forms THROW rather than silently yielding nothing.
  assert.throws(() => extractRouteExports("virtual/route.ts", "export * from './handlers'"), /export \* is forbidden/)
  assert.throws(() => extractRouteExports("virtual/route.ts", "export * as ns from './handlers'"), /export \* is forbidden/)
  assert.throws(() => extractRouteExports("virtual/route.ts", "export = { POST: 1 }"), /CommonJS route exports are forbidden/)
  assert.throws(() => extractRouteExports("virtual/route.js", "module.exports = { POST() {} }"), /CommonJS route exports are forbidden/)
  // A parse diagnostic throws rather than returning an empty surface.
  assert.throws(() => extractRouteExports("virtual/route.ts", "export function GET( {"), /Unable to parse/)
})

// ─── T2 — no safe handler names a durable write ─────────────────

test("T2: no safe handler, including its module-local helper closure, names a durable write", async () => {
  const writeNames = await deriveWriteVocabulary()
  const surfaces = await scanRouteSurface()
  const safe = surfaces.filter((item) => SAFE_METHODS.has(item.method))
  assert.ok(safe.length > 0)

  const offenders: string[] = []
  for (const handler of safe) {
    for (const name of closureCallNames(handler)) {
      if (writeNames.has(name)) offenders.push(`${handler.key}:${name}`)
    }
  }
  assert.deepEqual(offenders, [], "a safe handler reaches a durable write")

  // Non-vacuity: a handler calling a MISLEADINGLY READ-NAMED module-local
  // helper that itself calls `upsert` must be flagged.
  const fixture = [
    "export async function GET() { return loadInbox() }",
    "async function loadInbox() { return repo.upsert(ctx, row) }",
  ].join("\n")
  const fixtureSurface = extractRouteExports("virtual/route.ts", fixture)[0]
  const flagged = closureCallNames(fixtureSurface).filter((n) => writeNames.has(n))
  assert.deepEqual(flagged, ["upsert"], "the local-helper closure must catch a renamed writer")
})

// ─── T3 — unresolved edges fail closed ──────────────────────────

test("T3: an unresolvable module-local callee throws — the closure never silently drops an edge", () => {
  const resolvable = extractRouteExports("virtual/route.ts", [
    "export async function GET() { return helper() }",
    "function helper() { return 1 }",
  ].join("\n"))[0]
  assert.doesNotThrow(() => closureCallNames(resolvable))

  // `mystery` is called but declared nowhere in the module and is not an
  // import — it cannot be resolved, so the closure MUST throw, never `continue`.
  const unresolvable = extractRouteExports("virtual/route.ts", "export async function GET() { return mystery() }")[0]
  assert.throws(() => closureCallNames(unresolvable), /unresolved module-local callee: mystery/)
})

// ─── T4 — derived write vocabulary + documented exclusions ──────

test("T4: the write vocabulary is derived from the repository contract and both D4 exclusions hold", async () => {
  const writeNames = await deriveWriteVocabulary()
  assert.ok(writeNames.size >= 7, `derived write vocabulary is too small: ${writeNames.size}`)
  for (const name of ["create", "upsert", "updateStatus", "markUsed", "claimForRuntime", "append", "recordEvent"]) {
    assert.equal(writeNames.has(name), true, `write vocabulary must contain ${name}`)
  }
  // The two documented exclusions must be ABSENT from the derived vocabulary.
  for (const excluded of DOCUMENTED_EXCLUSIONS) {
    assert.equal(writeNames.has(excluded), false, `${excluded} must remain excluded`)
  }
  // The exclusions must be DOCUMENTED in this file, so no future reader has to
  // guess why an availability control is absent from the inventory.
  const self = await readFile(path.join(rootDir, "tests/safeMethodWriteInvariant.test.mts"), "utf8")
  for (const excluded of DOCUMENTED_EXCLUSIONS) {
    assert.ok(self.includes(`\`${excluded}\` — EXCLUDED`), `${excluded} exclusion must be documented in this file`)
  }
  // The `writeAuditLog` exclusion is CONDITIONAL: it holds only while
  // auditLog.ts has no durable backend. If it ever gains a repository call this
  // assertion fails, making the change a build failure, not a silent drift.
  const auditLog = await readFile(path.join(rootDir, "app/lib/security/auditLog.ts"), "utf8")
  for (const name of writeNames) {
    assert.equal(new RegExp(`\\.\\s*${name}\\s*\\(`).test(auditLog), false,
      `auditLog.ts gained a durable write (${name}) — the writeAuditLog exclusion is no longer valid`)
  }
})

// ─── T5 — the reviewed-exception ledger is now a prohibition ────

test("T5: the reviewed state-changing safe-handler ledger is empty, and a non-empty ledger fails", async () => {
  const contract = JSON.parse(await readFile(path.join(rootDir, "tests/fixtures/architecture/security-surface.v1.json"), "utf8"))
  // Non-vacuity: the fixture really parsed and really describes safe handlers.
  assert.ok(Array.isArray(contract.safeHandlers) && contract.safeHandlers.length > 0)
  assert.ok(Array.isArray(contract.reviewedStateChangingSafeHandlers))
  // PROHIBITION, not an allowance: no safe handler may be excused any more.
  assert.deepEqual(contract.reviewedStateChangingSafeHandlers, [],
    "a reviewed state-changing safe handler was re-admitted; INV-SAFE-1 permits no exceptions")
})

// ─── T6 — type-level containment ────────────────────────────────

test("T6: the read-only bundle exposes no write member and omits usage entirely", async () => {
  const source = await readFile(path.join(rootDir, "app/lib/persistence/repositoryResolver.ts"), "utf8")
  const bundle = /export type TenantReadRepositoryBundle = \{([\s\S]*?)\n\}/.exec(source)
  assert.ok(bundle, "TenantReadRepositoryBundle must exist")
  // `usage` is absent ENTIRELY — stronger than a Pick<>, because
  // UsageRepository's only non-write members have zero application callers.
  assert.equal(/\busage\b/.test(bundle[1]), false, "usage must be absent from the read-only bundle")

  const writeNames = await deriveWriteVocabulary()
  const readTypes = [...source.matchAll(/export type \w*ReadRepository =\s*\n?\s*Pick<[^>]+>/g)].map((m) => m[0])
  assert.ok(readTypes.length >= 6, `expected the six Pick<> read projections, found ${readTypes.length}`)
  for (const declaration of readTypes) {
    for (const name of writeNames) {
      assert.equal(declaration.includes(`"${name}"`), false, `read projection must not expose ${name}: ${declaration}`)
    }
  }
})

test("T6: a write member on the read-only bundle does not type-check", async () => {
  // The negative fixture is compiled in-process. If `upsert` ever becomes
  // reachable on the read type, this stops erroring and the assertion fails —
  // i.e. the test fails when the expected type error DISAPPEARS.
  const fixture = [
    `import type { TenantReadRepositoryBundle } from "${path.join(rootDir, "app/lib/persistence/repositoryResolver.ts").replace(/\.ts$/, ".ts")}"`,
    "export function probe(bundle: TenantReadRepositoryBundle) {",
    "  return bundle.workUnits.upsert",
    "}",
  ].join("\n")
  const diagnostics = compileProbe(fixture)
  assert.ok(diagnostics.length > 0, "bundle.workUnits.upsert must NOT type-check on the read-only bundle")
  assert.ok(diagnostics.some((d) => /upsert/.test(d)), `expected an 'upsert' error, got: ${diagnostics.join(" | ")}`)

  // Positive control: a genuinely available read member DOES type-check, so the
  // probe harness is not simply erroring on everything.
  const ok = compileProbe([
    `import type { TenantReadRepositoryBundle } from "${path.join(rootDir, "app/lib/persistence/repositoryResolver.ts")}"`,
    "export function probe(bundle: TenantReadRepositoryBundle) {",
    "  return bundle.workUnits.findById",
    "}",
  ].join("\n"))
  assert.deepEqual(ok, [], `findById must type-check on the read-only bundle: ${ok.join(" | ")}`)
})

// ─── T7 — safe handlers use the read-only resolver ──────────────

test("T7: no safe handler names the write resolver, and every repository-resolving one names the read resolver", async () => {
  const surfaces = await scanRouteSurface()
  const safe = surfaces.filter((item) => SAFE_METHODS.has(item.method))
  assert.ok(safe.length > 0)

  for (const handler of safe) {
    const names = closureCallNames(handler)
    assert.equal(names.includes("resolveRouteRepositories"), false,
      `${handler.key} must not acquire a write-capable bundle`)
    if (REPOSITORY_RESOLVING_SAFE_HANDLERS.includes(handler.key)) {
      assert.equal(names.includes("resolveRouteReadRepositories"), true,
        `${handler.key} must resolve repositories through the read-only resolver`)
    }
  }
  // The unsafe handlers still use the write resolver — proving the assertion
  // above discriminates rather than passing because nothing resolves anything.
  const unsafeNames = surfaces.filter((i) => !SAFE_METHODS.has(i.method)).flatMap((i) => closureCallNames(i))
  assert.ok(unsafeNames.includes("resolveRouteRepositories"), "mutation routes must still use the write resolver")

  // Non-vacuity: a synthetic safe handler calling the write resolver is caught.
  // The fixture imports it, so the fail-closed unresolved-callee rule (T3) does
  // not fire and the assertion genuinely exercises name collection.
  const fixture = extractRouteExports("virtual/route.ts", [
    'import { resolveRouteRepositories } from "./repos.ts"',
    "export async function GET() { return resolveRouteRepositories(t) }",
  ].join("\n"))[0]
  assert.equal(closureCallNames(fixture).includes("resolveRouteRepositories"), true)
})

// ─── T8–T10 — isolation (import-edge based, per DEV-D) ──────────

test("T8: no production module under app/ imports the SourceRecordV1 domain module", async () => {
  const { edges, files } = await collectImportEdges()
  assert.ok(files > 0 && edges.length > 0, "the import scan must not be vacuous")
  // Non-vacuity control: the symbol really exists in the tree, so "no consumer"
  // is a real finding rather than an artefact of a missing module.
  const domainFiles = (await listFiles(path.join(rootDir, "app/lib/domain"))).filter((f: string) => /\.[cm]?[jt]sx?$/.test(f))
  const sourceRecordDeclared = (await Promise.all(domainFiles.map((f: string) => readFile(f, "utf8"))))
    .some((src) => /\bSourceRecordV1\b/.test(src))
  assert.equal(sourceRecordDeclared, true, "SourceRecordV1 must exist for this scan to be meaningful")

  // EDGE-based, per DEV-D: comment-only mentions of SourceRecordV1 already
  // exist at the baseline (app/lib/ports/toolSignal/types.ts and
  // app/lib/ports/README.md), so a literal text scan would be red at base.
  const offenders = edges
    .filter((edge) => !edge.from.startsWith("app/lib/domain/source/"))
    .filter((edge) => /(^|\/)lib\/domain\/source(\/|$)/.test(edge.specifier) || /domain\/source/.test(edge.specifier))
  assert.deepEqual(offenders.map((e) => `${e.from} -> ${e.specifier}`), [])
})

test("T9: no module under app/ imports a PR #211 formation module", async () => {
  const { edges } = await collectImportEdges()
  assert.ok(edges.length > 0, "the import scan must not be vacuous")
  const offenders = edges.filter((edge) => /formation|f6a/i.test(edge.specifier))
  assert.deepEqual(offenders.map((e) => `${e.from} -> ${e.specifier}`), [])
})

test("T10: no new WU-02S module imports UI components or Electron", async () => {
  const { edges } = await collectImportEdges()
  assert.ok(edges.length > 0, "the import scan must not be vacuous")
  const wu02sModules = [
    "app/lib/security/httpMutationGuard.ts",
    "app/lib/application/workunitInbox/inboxService.ts",
    "app/api/workunit/inbox/refresh/route.ts",
  ]
  const seen = new Set(edges.map((e) => e.from))
  for (const wu02sModule of wu02sModules) assert.equal(seen.has(wu02sModule), true, `${wu02sModule} must be covered by the scan`)
  const offenders = edges
    .filter((edge) => wu02sModules.includes(edge.from))
    .filter((edge) => /(^|\/)components(\/|$)|(^|\/)electron(\/|$)/.test(edge.specifier))
  assert.deepEqual(offenders.map((e) => `${e.from} -> ${e.specifier}`), [])
})

// ─── T11 — providers remain fake on every branch ────────────────

test("T11: resolveGitHubClient returns the fake client on EVERY mode branch, including 'real' with a token", async () => {
  const { resolveGitHubClient, resolveGitHubSourceMode } = await import("../app/lib/infrastructure/external/github/resolveGitHubSource.ts")
  const { fakeGitHubClient } = await import("../app/lib/infrastructure/external/github/fakeGitHubClient.ts")

  // DEV-F: the environment maps "real" to "real_disabled", so the `"real"`
  // branch is UNREACHABLE from the env alone. It must be entered by passing the
  // mode EXPLICITLY, otherwise the assertion is vacuous for the branch it most
  // needs to cover.
  assert.equal(resolveGitHubSourceMode({ GITHUB_SOURCE_MODE: "real" }), "real_disabled",
    "the env resolver must still downgrade 'real'")

  for (const [mode, token] of [
    ["real", "ghp_explicit_token_for_branch_coverage"],
    ["real", undefined],
    ["real_disabled", undefined],
    ["fake", undefined],
  ] as const) {
    const resolved = resolveGitHubClient(mode, token)
    // Assert the fake IDENTITY, not merely "no network".
    assert.equal(resolved.client, fakeGitHubClient, `mode=${mode} token=${String(token)} must resolve the fake client`)
    assert.equal(resolved.token, undefined, `mode=${mode} must never carry a token forward`)
  }
  // Default branch (no arguments).
  assert.equal(resolveGitHubClient().client, fakeGitHubClient)

  // Slack and Calendar resolve to their fake fetchers.
  const slack = await import("../app/lib/infrastructure/external/slack/fakeSlackSource.ts")
  const calendar = await import("../app/lib/infrastructure/external/calendar/fakeCalendarSource.ts")
  assert.equal(typeof slack.fetchFakeSlackNormalizedEvents, "function")
  assert.equal(typeof calendar.fetchFakeCalendarNormalizedEvents, "function")
  const inboxService = await readFile(path.join(rootDir, "app/lib/application/workunitInbox/inboxService.ts"), "utf8")
  assert.ok(inboxService.includes("fetchFakeSlackNormalizedEvents"))
  assert.ok(inboxService.includes("fetchFakeCalendarNormalizedEvents"))
})

// ─── Machinery ──────────────────────────────────────────────────

/** Route discovery, delegated to the single shared scanner. */
async function scanRouteSurface(): Promise<RouteExport[]> {
  return scanRouteExports(rootDir, nextConfig.pageExtensions ?? undefined)
}

/**
 * Derive the durable-write vocabulary from the repository CONTRACT rather than
 * hand-listing it, so a newly added repository write method cannot escape
 * coverage. A method is a write when its name is not a read-shaped accessor.
 */
async function deriveWriteVocabulary(): Promise<Set<string>> {
  const source = await readFile(path.join(rootDir, "app/lib/persistence/repositories.ts"), "utf8")
  const parsed = parseSource("repositories.ts", source)
  const names = new Set<string>()
  let interfaces = 0
  for (const statement of parsed.statements) {
    if (!ts.isInterfaceDeclaration(statement)) continue
    if (!/Repository$/.test(statement.name.text)) continue
    if (/^TenantDbResolver$|Registry/.test(statement.name.text)) continue
    interfaces += 1
    for (const member of statement.members) {
      if (!ts.isMethodSignature(member) || !member.name || !ts.isIdentifier(member.name)) continue
      const name = member.name.text
      if (/^(find|list|get|resolve|count|has|is)/.test(name)) continue
      names.add(name)
    }
  }
  assert.ok(interfaces >= 7, `repository contract scan found only ${interfaces} repositories`)
  assert.ok(names.size > 0, "derived write vocabulary must not be empty")
  // The documented D4 exclusions are not repository methods, so they can never
  // appear here; assert it rather than assume it.
  for (const excluded of DOCUMENTED_EXCLUSIONS) names.delete(excluded)
  return names
}

async function collectImportEdges(): Promise<{ edges: Array<{ from: string; specifier: string }>; files: number }> {
  const files = (await listFiles(path.join(rootDir, "app"))).filter((f: string) => /\.[cm]?[jt]sx?$/.test(f))
  const edges: Array<{ from: string; specifier: string }> = []
  for (const file of files) {
    const relative = path.relative(rootDir, file).split(path.sep).join("/")
    const parsed = parseSource(relative, await readFile(file, "utf8"))
    for (const statement of parsed.statements) {
      if (ts.isImportDeclaration(statement) || (ts.isExportDeclaration(statement) && statement.moduleSpecifier)) {
        const specifier = (statement as ts.ImportDeclaration | ts.ExportDeclaration).moduleSpecifier
        if (!specifier) continue
        // Fail closed on a non-literal specifier rather than skipping it.
        if (!ts.isStringLiteral(specifier)) throw new Error(`non-literal module specifier in ${relative}`)
        edges.push({ from: relative, specifier: specifier.text })
      }
    }
  }
  return { edges, files: files.length }
}

/** Compile a single in-memory probe against the real project types. */
function compileProbe(source: string): string[] {
  const probePath = path.join(rootDir, "__wu02s_probe__.ts")
  const host = ts.createCompilerHost({ strict: true })
  const originalGetSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === probePath
      ? ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreate)
  const originalFileExists = host.fileExists.bind(host)
  host.fileExists = (fileName) => fileName === probePath || originalFileExists(fileName)
  const program = ts.createProgram([probePath], {
    strict: true, noEmit: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, skipLibCheck: true,
  }, host)
  return ts.getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === probePath)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))
}
