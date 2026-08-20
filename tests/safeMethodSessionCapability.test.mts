/**
 * WU-06 — INV-SAFE-SESSION: safe HTTP methods carry no durable session write
 * capability.
 *
 * WHAT THIS ADDS TO INV-SAFE-1
 *   `safeMethodWriteInvariant.test.mts` proves that no safe HANDLER names a
 *   durable write, and it says so explicitly: it resolves direct and
 *   module-local edges only and claims no transitive purity. That left one
 *   transitive path unproven, and it was live — a safe handler calls
 *   `requireSession`, which composed a control directory carrying `createUser`,
 *   `createTenant`, `createMembership` and `createAuthIdentity`, and the dev
 *   workspace bootstrap called all four on the `GET` path. No route named a
 *   write, and four rows were written anyway.
 *
 *   This suite proves exactly that path and nothing wider:
 *
 *       safe handler -> request session composition -> read-only capability
 *
 *   It does NOT claim whole-program transitive purity, and it does not restate
 *   INV-SAFE-1's route-local guarantee. The two are complementary layers.
 *
 * EVIDENCE SHAPE
 *   Three independent layers, because each covers the others' blind spot:
 *     L1 TYPE     — the safe dependency object cannot NAME a create (S6–S9).
 *     L2 SHAPE    — it does not CARRY one at runtime either, so a dynamically
 *                   keyed access or a structural cast finds nothing (S5, S18).
 *     L3 BEHAVIOR — a real session resolution over a write-spying D1 binding
 *                   performs zero durable statements (S1–S3), while the same
 *                   configuration over a mutation method still bootstraps (S4,
 *                   S16) — so the gate discriminates rather than disabling
 *                   bootstrap globally.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { listFiles } from "../scripts/lib/typescriptModuleGraph.mjs"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import { SAFE_METHODS, UNSAFE_METHODS, HTTP_METHODS } from "./helpers/routeSurface.ts"
import type { D1DatabaseLike, D1PreparedStatementLike } from "../app/lib/persistence/d1/types.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { requireSession, composeSessionDependencies } from "../app/lib/composition/requestSession.ts"
import { resolveValidatedRequestRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import {
  SAFE_HTTP_METHODS,
  UNSAFE_HTTP_METHODS,
  classifyRequestMethod,
  mayCarryDurableSessionWriteCapability,
} from "../app/lib/composition/httpMethodSafety.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

/** The four durable creates the session path is capable of, by contract name. */
const SESSION_WRITE_MEMBERS = ["createUser", "createTenant", "createMembership", "createAuthIdentity"] as const

// ─── Write-spying D1 binding ────────────────────────────────────
//
// Row counting alone would miss a write that was attempted and silently failed.
// This records every STATEMENT the session path prepares, so "zero durable
// writes" is a claim about what was attempted, not only about what landed.

class WriteSpyD1Database implements D1DatabaseLike {
  readonly statements: string[] = []
  // Explicit field + assignment rather than a parameter property: Node's
  // strip-only type mode rejects the latter, the same reason D1RepositoryError
  // spells its `cause` field out.
  private readonly inner: FakeD1Database

  constructor(inner: FakeD1Database) {
    this.inner = inner
  }

  prepare(query: string): D1PreparedStatementLike {
    this.statements.push(query)
    return this.inner.prepare(query)
  }
  /** INSERT / UPDATE / DELETE / REPLACE — anything that can change durable state. */
  durableWrites(): string[] {
    return this.statements.filter((sql) => /^\s*(insert|update|delete|replace)\b/i.test(sql))
  }
}

type DevEnvOverrides = Readonly<Record<string, string | undefined>>

async function withDevEnv(
  overrides: DevEnvOverrides,
  fn: (spy: WriteSpyD1Database, fake: FakeD1Database) => Promise<void>,
): Promise<void> {
  const fake = new FakeD1Database()
  const spy = new WriteSpyD1Database(fake)
  const backup = { ...process.env }
  try {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = "development"
    process.env.AUTH_ADAPTER = "dev"
    process.env.ALLOW_DEV_SESSION = "true"
    process.env.ALLOW_DEV_WORKSPACE_BOOTSTRAP = "true"
    delete process.env.ALLOW_DEV_CONTROLLESS_SESSION
    delete process.env.JWT_AUTH_SECRET
    delete process.env.JWT_AUTH_ISSUER
    delete process.env.JWT_AUTH_AUDIENCE
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    setTestRuntimeEnvForRequest({ CONTROL_DB: spy } as unknown as AppEnv)
    await fn(spy, fake)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
    resetTestRuntimeEnvForRequest()
  }
}

function request(method: string): Request {
  return new Request("http://localhost/api/workunit/inbox", { method })
}

// ─── S1–S3 — the safe methods write nothing ─────────────────────

for (const method of SAFE_HTTP_METHODS) {
  test(`S1-S3 (${method}): every dev bootstrap gate is open, required rows are missing, and nothing is written`, async () => {
    await withDevEnv({}, async (spy, fake) => {
      const result = await requireSession(request(method), undefined)

      // ZERO durable statements — not "no rows landed", no write was attempted.
      assert.deepEqual(spy.durableWrites(), [],
        `${method} attempted a durable write through session resolution`)
      for (const table of ["users", "tenants", "tenant_memberships", "auth_identities"]) {
        assert.deepEqual(fake.debugTable(table), [], `${method} created a ${table} row`)
      }

      // Non-vacuity: the session path really ran. It reached the control
      // directory and issued reads — it did not bail out before touching it.
      assert.ok(spy.statements.length > 0, "the session path must have queried the control directory")
      assert.ok(spy.statements.some((sql) => /^\s*select\b/i.test(sql)), "reads must still happen")

      // ERROR SEMANTICS (pinned, derived from sessionResolver.ts): with no
      // bootstrap the identity lookup returns null and the use case returns its
      // EXISTING unauthorized result. No new error code is introduced.
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.reason, "unauthorized")
    })
  })
}

// ─── S4 / S16 — the mutation path still bootstraps ──────────────

for (const method of UNSAFE_HTTP_METHODS) {
  test(`S4/S16 (${method}): the identical dev configuration still bootstraps on a mutation method`, async () => {
    await withDevEnv({}, async (spy, fake) => {
      const result = await requireSession(request(method), undefined)
      assert.equal(result.ok, true, `${method} must still resolve a bootstrapped dev session`)
      if (result.ok) assert.equal(result.session.tenantId, "dev-tenant")
      // The gate DISCRIMINATES: same flags, same missing rows, same identity.
      assert.ok(spy.durableWrites().length >= 4, `${method} must still perform the bootstrap writes`)
      for (const table of ["users", "tenants", "tenant_memberships", "auth_identities"]) {
        assert.equal(fake.debugTable(table).length, 1, `${method} must still create the ${table} row`)
      }
    })
  })
}

// ─── S5 / S18 — the composed safe object carries no write ───────

test("S5/S18: the safe dependency object has no write member and no bootstrap slot at all", async () => {
  await withDevEnv({}, async () => {
    const resolved = resolveValidatedRequestRuntimeConfig()
    assert.equal(resolved.ok, true, "the dev runtime config must resolve, or this test is vacuous")
    if (!resolved.ok) return

    for (const method of SAFE_HTTP_METHODS) {
      const dependencies = composeSessionDependencies(resolved.runtime, request(method))
      // The KEY is absent, not present-and-undefined: `in` is the strict check,
      // so a future `devBootstrap: undefined` regression is caught too.
      assert.equal("devBootstrap" in dependencies, false,
        `${method} composition must not carry a devBootstrap slot`)
      const directory = dependencies.controlDirectory
      assert.ok(directory, "the control directory must be present, or the shape check is vacuous")
      const members = Object.keys(directory as object)
      // Non-vacuity: the read capability really is there.
      assert.deepEqual(members.sort(),
        ["findAuthIdentity", "findTenantById", "findUserById", "listMembershipsByUser"],
        `${method} control directory must expose exactly the four reads`)
      // And nothing write-shaped is reachable by ANY key, including inherited.
      for (const write of SESSION_WRITE_MEMBERS) {
        assert.equal(write in (directory as object), false,
          `${method} control directory must not carry ${write}`)
      }
      assert.equal("findMembership" in (directory as object), false,
        "findMembership is bootstrap-only and must not appear on the read capability")
    }

    // Discrimination: the mutation path DOES receive the full capability, so the
    // assertions above are not passing because composition returns nothing.
    for (const method of UNSAFE_HTTP_METHODS) {
      const dependencies = composeSessionDependencies(resolved.runtime, request(method))
      assert.equal("devBootstrap" in dependencies, true, `${method} must carry the bootstrap capability`)
      for (const write of SESSION_WRITE_MEMBERS) {
        assert.equal(typeof (dependencies.devBootstrap as unknown as Record<string, unknown>)[write], "function",
          `${method} bootstrap capability must expose ${write}`)
      }
    }
  })
})

// ─── S12 / S13 — unknown and non-canonical methods fail closed ──

test("S12/S13: an unknown, lowercase or synthetic method is never bootstrap-capable", () => {
  for (const method of [...SAFE_HTTP_METHODS, ...UNSAFE_HTTP_METHODS]) {
    assert.notEqual(classifyRequestMethod(method), "unknown", `${method} must be classified`)
  }
  // Case-folded spellings of a MUTATION method must not widen authority, and
  // case-folded spellings of a safe method must not be admitted as safe either.
  for (const method of ["get", "Get", "pOsT", "post", "Delete", "TRACE", "CONNECT", "PROPFIND", "", " GET", "GET "]) {
    assert.equal(classifyRequestMethod(method), "unknown", `${method || "<empty>"} must be unknown`)
    assert.equal(mayCarryDurableSessionWriteCapability({ method } as Request), false,
      `${method || "<empty>"} must not carry write capability`)
  }
  // The predicate grants on an EXACT unsafe match, never on "not safe".
  assert.equal(mayCarryDurableSessionWriteCapability({ method: "POST" } as Request), true)
  assert.equal(mayCarryDurableSessionWriteCapability({ method: "GET" } as Request), false)
})

test("S12: a request carrying an unrecognized method composes no bootstrap capability", async () => {
  await withDevEnv({}, async (spy, fake) => {
    const resolved = resolveValidatedRequestRuntimeConfig()
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    // `PROPFIND` is a real, non-standard-for-this-app verb a Request accepts
    // verbatim. It is neither safe nor unsafe here, and must fail closed.
    const dependencies = composeSessionDependencies(resolved.runtime, request("PROPFIND"))
    assert.equal("devBootstrap" in dependencies, false)
    await requireSession(request("PROPFIND"), resolved.runtime)
    assert.deepEqual(spy.durableWrites(), [], "an unknown method must not bootstrap")
    assert.deepEqual(fake.debugTable("users"), [])
  })
})

// ─── S14 — control-less dev session survives on safe methods ────

test("S14: a control-less dev session is unchanged on safe methods and still writes nothing", async () => {
  for (const method of SAFE_HTTP_METHODS) {
    await withDevEnv({ ALLOW_DEV_CONTROLLESS_SESSION: "true" }, async (spy) => {
      const result = await requireSession(request(method), undefined)
      // Preserved: control-less dev is a different capability from workspace
      // bootstrap and creates no durable state, so this slice does not touch it.
      assert.equal(result.ok, true, `${method} control-less dev session must still resolve`)
      if (result.ok) {
        assert.equal(result.session.tenantId, "dev-tenant")
        assert.equal(result.session.userId, "dev-user")
        assert.equal(result.session.isDevSession, true)
      }
      assert.deepEqual(spy.durableWrites(), [], "control-less dev must remain write-free")
    })
  }
})

test("S14: control-less dev still requires BOTH its gates and a dev identity", async () => {
  // The gates are unchanged by this slice, which is the claim being pinned.
  await withDevEnv({ ALLOW_DEV_CONTROLLESS_SESSION: "true", ALLOW_DEV_SESSION: undefined }, async () => {
    const result = await requireSession(request("GET"), undefined)
    assert.equal(result.ok, false, "allowDevSession is still required")
  })
  await withDevEnv({ ALLOW_DEV_CONTROLLESS_SESSION: undefined }, async () => {
    const result = await requireSession(request("GET"), undefined)
    assert.equal(result.ok, false, "allowControlLessDevSession is still required")
  })
})

// ─── S15 — production cannot bootstrap on ANY method ────────────

test("S15: neither Node nor Cloudflare production can bootstrap, on any method", async () => {
  // Node production: the dev adapter is refused outright.
  for (const method of [...SAFE_HTTP_METHODS, ...UNSAFE_HTTP_METHODS]) {
    await withDevEnv({ NODE_ENV: "production" }, async (spy, fake) => {
      const result = await requireSession(request(method), undefined)
      assert.equal(result.ok, false, `production ${method} must not resolve a dev session`)
      assert.deepEqual(spy.durableWrites(), [], `production ${method} must write nothing`)
      assert.deepEqual(fake.debugTable("users"), [])
    })
  }
  // Cloudflare production: the runtime config REJECTS an explicit dev flag
  // before auth runs, so the projection can never carry a dev capability. This
  // is defense in depth beneath method safety, and it is unchanged.
  const source = await readFile(path.join(rootDir, "app/lib/runtime/requestRuntimeConfig.ts"), "utf8")
  for (const flag of ["ALLOW_DEV_SESSION", "ALLOW_DEV_WORKSPACE_BOOTSTRAP", "ALLOW_DEV_CONTROLLESS_SESSION"]) {
    assert.ok(source.includes(flag), `${flag} must remain a rejected production capability`)
  }
  assert.match(source, /allowDevWorkspaceBootstrap: false/,
    "the Cloudflare projection must still hard-code the bootstrap capability to false")
})

test("S15: no request-controlled input can select the bootstrap capability", async () => {
  await withDevEnv({}, async (spy, fake) => {
    const resolved = resolveValidatedRequestRuntimeConfig()
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    // Header, query and body all claim a mutation method. `Request.method` comes
    // from the request line and none of them can reach it.
    const hostile = new Request("http://localhost/api/workunit/inbox?_method=POST&method=POST", {
      method: "GET",
      headers: {
        "X-HTTP-Method-Override": "POST",
        "X-HTTP-Method": "POST",
        "X-Method-Override": "POST",
      },
    })
    assert.equal(hostile.method, "GET", "the Request must still report GET")
    const dependencies = composeSessionDependencies(resolved.runtime, hostile)
    assert.equal("devBootstrap" in dependencies, false, "an override header must not select bootstrap")
    await requireSession(hostile, resolved.runtime)
    assert.deepEqual(spy.durableWrites(), [], "an override-claiming GET must write nothing")
    assert.deepEqual(fake.debugTable("users"), [])
  })
})

// ─── S6–S9 — type-level capability removal ──────────────────────

test("S6-S9: the safe session capability cannot NAME any of the four durable creates", () => {
  const deps = path.join(rootDir, "app/lib/application/auth/sessionResolver.ts")
  for (const write of SESSION_WRITE_MEMBERS) {
    const diagnostics = compileProbe([
      `import type { SessionDependencies } from "${deps}"`,
      "export function probe(dependencies: SessionDependencies) {",
      "  const directory = dependencies.controlDirectory",
      "  if (!directory) return undefined",
      `  return directory.${write}`,
      "}",
    ].join("\n"))
    assert.ok(diagnostics.length > 0, `${write} must NOT type-check on the safe session capability`)
    assert.ok(diagnostics.some((d) => new RegExp(write).test(d)),
      `expected a '${write}' error, got: ${diagnostics.join(" | ")}`)
  }

  // The bootstrap-only read is removed from the safe capability too.
  const membership = compileProbe([
    `import type { SessionDependencies } from "${deps}"`,
    "export function probe(dependencies: SessionDependencies) {",
    "  return dependencies.controlDirectory?.findMembership",
    "}",
  ].join("\n"))
  assert.ok(membership.length > 0, "findMembership must not be reachable on the safe capability")

  // POSITIVE CONTROLS — the harness is not simply erroring on everything, and
  // the legitimate reads the session path performs still compile.
  for (const read of ["findAuthIdentity", "findUserById", "listMembershipsByUser", "findTenantById"]) {
    const ok = compileProbe([
      `import type { SessionDependencies } from "${deps}"`,
      "export function probe(dependencies: SessionDependencies) {",
      `  return dependencies.controlDirectory?.${read}`,
      "}",
    ].join("\n"))
    assert.deepEqual(ok, [], `${read} must type-check on the safe capability: ${ok.join(" | ")}`)
  }

  // And the bootstrap capability legitimately names all four creates, so the
  // removal above is a boundary rather than a global ban.
  const bootstrap = compileProbe([
    `import type { SessionDependencies } from "${deps}"`,
    "export function probe(dependencies: SessionDependencies) {",
    `  return [${SESSION_WRITE_MEMBERS.map((w) => `dependencies.devBootstrap?.${w}`).join(", ")}]`,
    "}",
  ].join("\n"))
  assert.deepEqual(bootstrap, [], `the bootstrap capability must name every create: ${bootstrap.join(" | ")}`)
})

test("S6-S9: the read factory's return type exposes no create either", () => {
  const adapter = path.join(rootDir, "app/lib/composition/controlDirectoryAdapter.ts")
  const bundle = path.join(rootDir, "app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts")
  for (const write of SESSION_WRITE_MEMBERS) {
    const diagnostics = compileProbe([
      `import { toControlDirectoryRead } from "${adapter}"`,
      `import type { ControlRepositoryBundle } from "${bundle}"`,
      "export function probe(b: ControlRepositoryBundle) {",
      `  return toControlDirectoryRead(b).${write}`,
      "}",
    ].join("\n"))
    assert.ok(diagnostics.length > 0, `toControlDirectoryRead(...).${write} must not type-check`)
  }
  const ok = compileProbe([
    `import { toControlDirectoryRead } from "${adapter}"`,
    `import type { ControlRepositoryBundle } from "${bundle}"`,
    "export function probe(b: ControlRepositoryBundle) { return toControlDirectoryRead(b).findUserById }",
  ].join("\n"))
  assert.deepEqual(ok, [], `findUserById must type-check: ${ok.join(" | ")}`)
})

// ─── S10 / S11 / S20 — the boundary cannot be bypassed ──────────

test("S10/S20: exactly one module composes session dependencies, and every route reaches it through that one entry", async () => {
  const appFiles = await collectAppFiles()
  const resolverCallers: string[] = []
  const adapterImporters: string[] = []
  const classifierImporters: string[] = []
  for (const [relative, source] of appFiles) {
    // IMPORT-based, not call-based. A module that merely aliases the use case
    // (`export const shadow = resolveSession`) never writes `resolveSession(`,
    // so a call-site regex would let a second composition path in through a
    // re-export. Naming the symbol at all is the thing being bounded.
    if (relative !== "app/lib/application/auth/sessionResolver.ts" && /\bresolveSession\b/.test(source)) {
      resolverCallers.push(relative)
    }
    if (relative !== "app/lib/composition/controlDirectoryAdapter.ts" && /toDevWorkspaceBootstrap|toControlDirectoryRead/.test(source)) {
      adapterImporters.push(relative)
    }
    if (relative !== "app/lib/composition/httpMethodSafety.ts" && /mayCarryDurableSessionWriteCapability|classifyRequestMethod/.test(source)) {
      classifierImporters.push(relative)
    }
  }
  // The PR #238 invariant — one composition owner — is preserved, and it is now
  // also the single owner of the capability decision.
  assert.deepEqual(resolverCallers, ["app/lib/composition/requestSession.ts"],
    "only the request composition root may invoke the session use case")
  assert.deepEqual(adapterImporters, ["app/lib/composition/requestSession.ts"],
    "only the request composition root may build a session capability")
  assert.deepEqual(classifierImporters, ["app/lib/composition/requestSession.ts"],
    "the method classifier must have exactly one production consumer")

  // FAIL-CLOSED DISCOVERY: every route module that authenticates does so through
  // `requireSession`. A new safe route added tomorrow is protected because it
  // uses this entry point, not because its author remembered a rule.
  const routes = appFiles.filter(([relative]) => /^app\/api\/.*\/route\.tsx?$/.test(relative))
  assert.ok(routes.length > 0, "route discovery must not be vacuous")
  const authenticating = routes.filter(([, source]) => /requireSession\s*\(/.test(source))
  assert.equal(authenticating.length, routes.length,
    "every API route module must authenticate through the composition root entry point")
  for (const [relative, source] of authenticating) {
    assert.match(source, /requireSession\s*\(\s*request\s*,/,
      `${relative} must pass the REQUEST to requireSession, or the method is not observable`)
  }
})

test("S11: the composition root selects the capability from request.method, not from a caller-supplied token", async () => {
  const source = await readFile(path.join(rootDir, "app/lib/composition/requestSession.ts"), "utf8")
  // `composeSessionDependencies` takes the Request itself. A `method: string`
  // parameter would let a caller pass a method the request does not carry.
  assert.match(source, /export function composeSessionDependencies\(\s*runtime: ValidatedRequestRuntimeConfig,\s*request: Request,\s*\)/,
    "composition must receive the Request, never a caller-chosen method token")
  assert.equal(/composeSessionDependencies\([^)]*method\s*:/.test(source), false,
    "composition must not accept a method token")
  // And the capability is attached in exactly one place, guarded by the classifier.
  const attachments = source.match(/devBootstrap:/g) ?? []
  assert.equal(attachments.length, 1, "the bootstrap capability must be attached at exactly one site")
  assert.match(source, /mayCarryDurableSessionWriteCapability\(request\)[\s\S]{0,120}devBootstrap:/,
    "the single attachment site must be guarded by the method classifier")
})

// ─── Vocabulary — one production-owned list ─────────────────────

test("the production method classifier and the test-side scanner cannot disagree", () => {
  // The test helper keeps its own literal on purpose (it imports no production
  // module), so the two lists are pinned equal rather than merged. Production
  // owns the classifier; this assertion owns the agreement.
  assert.deepEqual([...SAFE_HTTP_METHODS].sort(), [...SAFE_METHODS].sort())
  assert.deepEqual([...UNSAFE_HTTP_METHODS].sort(), [...UNSAFE_METHODS].sort())
  // Together they partition the served surface: no method is in both, none is
  // missing, so "not safe" and "unsafe" are only interchangeable for known verbs.
  assert.deepEqual([...SAFE_HTTP_METHODS, ...UNSAFE_HTTP_METHODS].sort(), [...HTTP_METHODS].sort())
  assert.equal(new Set([...SAFE_HTTP_METHODS, ...UNSAFE_HTTP_METHODS]).size, HTTP_METHODS.length)
})

// ─── Machinery ──────────────────────────────────────────────────

async function collectAppFiles(): Promise<Array<[string, string]>> {
  const files = (await listFiles(path.join(rootDir, "app"))).filter((file: string) => /\.[cm]?[jt]sx?$/.test(file))
  assert.ok(files.length > 0, "the app scan must not be vacuous")
  return Promise.all(files.map(async (file: string): Promise<[string, string]> =>
    [path.relative(rootDir, file).split(path.sep).join("/"), await readFile(file, "utf8")]))
}

/** Compile a single in-memory probe against the real project types. */
function compileProbe(source: string): string[] {
  const probePath = path.join(rootDir, "__wu06_session_probe__.ts")
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
