// WU-VAL-01 — flag-gated Inbox refresh experiment. Permanent charter T1–T40.
//
// Transport and model behaviour runs against the REAL modules with an injected fetch.
// The dashboard orchestration cannot be rendered (this repository has no DOM test
// library and this WorkUnit introduces none), so its guarantees — call ordering, the
// latch, the mounted guards, which branch may assign rows — are pinned by source
// assertions scoped to `handleRefresh` itself.
import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isCodeFilePath, listFiles, scanModuleGraph } from "../scripts/lib/typescriptModuleGraph.mjs"
import {
  DASHBOARD_INBOX_REFRESH_PATH, DASHBOARD_INBOX_SOURCE, requestInboxRefresh, type InboxRefreshTransportResult,
} from "../app/lib/application/dashboard/dashboardInboxRefreshClient.ts"
import {
  KNOWN_PRE_WRITE_FAILURES, REFRESH_PROVENANCE, canSubmitRefresh, classifyProjectionReload,
  classifyRefreshResponse, refreshCopy, type InboxRefreshPresentation, type InboxRefreshState,
} from "../app/lib/application/dashboard/inboxRefreshStateModel.ts"
import { fetchDashboardWorkUnits } from "../app/lib/application/dashboard/dashboardDataClient.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const CONTROL = "app/components/workunit-os/adopted/AdoptedInboxRefreshControl.tsx"
const DASHBOARD = "app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx"
const CLIENT = "app/lib/application/dashboard/dashboardInboxRefreshClient.ts"
const MODEL = "app/lib/application/dashboard/inboxRefreshStateModel.ts"
const OS_DASHBOARD = "app/components/workunit-os/WorkUnitOSDashboard.tsx"
const DENYLIST = "app/lib/application/launcher/forbiddenCommandFilter.ts"
const POST_CALL = `POST ${DASHBOARD_INBOX_REFRESH_PATH}`
const GET_CALL = "GET /api/workunit/inbox?source=all"
const UNKNOWN: InboxRefreshState = "MATERIALIZATION_OUTCOME_UNKNOWN"

/** Copy that may never appear in either indeterminate state (T24, T30). */
const PROHIBITED = ["nothing changed", "no rows were written", "refresh failed", "materialization failed",
  "successfully updated", "rollback", "rolled back", "safe to retry", "live", "synced", "connected",
  "latest", "up to date", "new data", "provider refresh"]
const NEVER_CLAIMED = ["live", "synced", "connected", "latest", "up to date", "new data", "provider refresh"]
const ALL_STATES: InboxRefreshState[] = ["IDLE", "REFRESHING", "SUCCESS", "EMPTY", "MATERIALIZED_RELOAD_FAILED",
  UNKNOWN, "UNAUTHORIZED", "FORBIDDEN", "RATE_LIMITED", "PROVIDER_UNAVAILABLE", "INTERNAL_FAILURE"]

const source = (file: string) => readFile(path.join(rootDir, file), "utf8")
const digest = async (file: string) => createHash("sha256").update(await readFile(path.join(rootDir, file))).digest("hex")
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const raw = (body: string, status: number) => new Response(body, { status })
const okPost = (refreshed: number) => json({ ok: true, requestId: "r-1", refreshed, source: "all" })

/** Exactly the refresh orchestration, so assertions cannot be met by unrelated code. */
async function handleRefreshBody(): Promise<string> {
  const text = await source(DASHBOARD)
  const start = text.indexOf("const handleRefresh = async () => {")
  const end = text.indexOf("const handleCreatePreview", start)
  assert.ok(start > 0 && end > start, "the refresh orchestration must sit above handleCreatePreview")
  return text.slice(start, end)
}

type Call = { url: string; method: string; init?: RequestInit }

function recordingFetch(responses: Array<Response | Error>) {
  const calls: Call[] = []
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: String(init?.method ?? "GET"), init })
    const next = responses.shift()
    if (next instanceof Error) throw next
    if (!next) throw new Error("unexpected extra request")
    return next
  }
  return { calls, impl: impl as unknown as typeof fetch }
}

/**
 * The composed attempt: exactly the sequence `handleRefresh` performs, over the REAL
 * client and REAL model, so "one POST", "at most one GET", "rows preserved" and
 * "no count retained" are all directly measurable.
 */
async function runAttempt(responses: Array<Response | Error>, existingRows: string[] = ["row-a"]) {
  const { calls, impl } = recordingFetch(responses)
  const stage1 = classifyRefreshResponse(await requestInboxRefresh(impl))
  if (!stage1.reload) return { state: stage1.state as InboxRefreshState, rows: existingRows, refreshedCount: undefined, calls }
  let reloaded: string[] | null = null
  try {
    const result = await fetchDashboardWorkUnits(DASHBOARD_INBOX_SOURCE, impl)
    reloaded = result.ok ? result.workUnits.map((unit) => unit.id) : null
  } catch { reloaded = null }
  const stage2 = classifyProjectionReload(reloaded !== null, stage1.refreshed)
  const rows = stage2.applyRows && reloaded !== null ? reloaded : existingRows
  return { state: stage2.state as InboxRefreshState, rows, refreshedCount: stage1.refreshed, calls }
}

/** A presentation as an untrusted caller may build it — including combinations the type forbids. */
const present = (state: InboxRefreshState, refreshed?: number) => ({ state, refreshed }) as unknown as InboxRefreshPresentation

/** The truthful outcome every unrenderable count-bearing presentation must degrade to (T38, T39, T40). */
const honest = refreshCopy(present(UNKNOWN))

const sequence = (calls: Call[]) => calls.map((call) => `${call.method} ${call.url}`)
const safeErrorBody = (status: number, code: string) => json({ ok: false, requestId: "r", error: code }, status)

test("T1 refresh control exists only on the flag-gated legacy surface", async () => {
  const edges = await scanModuleGraph(rootDir, ["app"])
  assert.deepEqual([...new Set(edges.filter((e) => e.resolvedTarget === CONTROL).map((e) => e.file))], [DASHBOARD])
  assert.deepEqual([...new Set(edges.filter((e) => e.resolvedTarget === DASHBOARD).map((e) => e.file))], [OS_DASHBOARD])
  const shell = await source(OS_DASHBOARD)
  assert.match(shell, /process\.env\.NEXT_PUBLIC_WORKUNIT_LEGACY_DASHBOARD === "true"/)
  assert.match(shell, /useLegacyDashboard \? <AdoptedWorkUnitDashboard \/> : <WorkUnitLauncher \/>/)
})

test("T2 default Launcher remains disconnected and unchanged", async () => {
  const roots = ["app/components/workunit-os/launcher", "app/components/atra", "app/lib/application/launcher"]
  const files = (await Promise.all(roots.map((root) => listFiles(path.join(rootDir, root))))).flat().filter(isCodeFilePath)
  assert.ok(files.length > 0, "default-surface roots must exist")
  const mentionsApi: string[] = []
  for (const file of files) {
    const text = await readFile(file, "utf8")
    const relative = path.relative(rootDir, file).split(path.sep).join("/")
    for (const needle of ["AdoptedInboxRefreshControl", "dashboardInboxRefreshClient", "inboxRefreshStateModel", "fetch("]) {
      assert.equal(text.includes(needle), false, `${relative} must not reference ${needle}`)
    }
    if (text.includes("/api/")) mentionsApi.push(relative)
  }
  // The one pre-existing mention is a DENYLIST constant, not a caller. Pinning the exact
  // set means any newly introduced `/api/` reference on the default surface fails.
  assert.deepEqual(mentionsApi, [DENYLIST])
  assert.match(await source(DENYLIST), /const FORBIDDEN_ROUTE = \["\/api\/workunit", "\/tools"\]\.join\(""\)/)
})

test("T3 one explicit user action issues exactly one POST", async () => {
  const { calls } = await runAttempt([okPost(6), json({ workUnits: [] })])
  const posts = calls.filter((call) => call.method === "POST")
  assert.equal(posts.length, 1)
  assert.equal(posts[0].url, DASHBOARD_INBOX_REFRESH_PATH)
})

test("T4 exact body and credentials contract", async () => {
  const { calls } = await runAttempt([okPost(1), json({ workUnits: [] })])
  const [post] = calls
  assert.equal(post.url, "/api/workunit/inbox/refresh")
  assert.deepEqual(post.init?.headers, { "Content-Type": "application/json" })
  const body = JSON.parse(String(post.init?.body))
  assert.deepEqual(Object.keys(body), ["source"])
  assert.equal(body.source, "all")
  assert.equal(DASHBOARD_INBOX_SOURCE, "all")
  assert.equal("credentials" in (post.init ?? {}), false, "no credentials override")
  assert.equal(/credentials|Authorization|tenantId/.test(await source(CLIENT)), false)
})

test("T5 control is disabled while in flight", async () => {
  assert.equal(canSubmitRefresh("REFRESHING"), false)
  for (const state of ALL_STATES.filter((candidate) => candidate !== "REFRESHING")) assert.equal(canSubmitRefresh(state), true, state)
  const control = await source(CONTROL)
  assert.match(control, /disabled=\{!canSubmitRefresh\(state\)\}/)
  assert.match(control, /aria-busy=\{busy\}/)
})

test("T6 a second click cannot create a concurrent request", async () => {
  const body = await handleRefreshBody()
  const latch = body.indexOf("if (inFlightRef.current) return")
  const set = body.indexOf("inFlightRef.current = true")
  assert.ok(latch >= 0 && set > latch, "tested-and-set latch must be present")
  assert.ok(set < body.indexOf("await "), "the latch must be set synchronously, before the first await")
  assert.match(body, /\.finally\(\(\) => \{\s*inFlightRef\.current = false\s*\}\)/, "released only in a finally")
  assert.equal(body.split("inFlightRef.current = false").length - 1, 1, "exactly one release site")

  // Two synchronous invocations while the first POST is still pending.
  const { calls, impl } = recordingFetch([okPost(1), okPost(1)])
  const inFlight = { current: false }
  const attempt = async () => {
    if (inFlight.current) return
    inFlight.current = true
    try { await requestInboxRefresh(impl) } finally { inFlight.current = false }
  }
  await Promise.all([attempt(), attempt()])
  assert.equal(calls.length, 1, "the second synchronous invocation creates no request")
})

test("T7 successful refresh triggers exactly one projection GET", async () => {
  const { calls, state } = await runAttempt([okPost(2), json({ workUnits: [{ id: "x" }, { id: "y" }] })])
  assert.equal(state, "SUCCESS")
  assert.deepEqual(sequence(calls), [POST_CALL, GET_CALL])
  const body = await handleRefreshBody()
  assert.match(body, /const rows = await reloadProjection\(\)/, "a verified success must re-read the projection")
  assert.equal(/fetchIntegrationStatus|fetchRecentAuditLogs/.test(body), false, "no sibling loads are re-issued")
})

test("T8 failed refresh preserves existing rows and issues no GET", async () => {
  for (const row of KNOWN_PRE_WRITE_FAILURES) {
    const { calls, rows, refreshedCount } = await runAttempt([safeErrorBody(row.status, row.code)])
    assert.deepEqual(sequence(calls), [POST_CALL], `${row.status} ${row.code}`)
    assert.deepEqual(rows, ["row-a"])
    assert.equal(refreshedCount, undefined)
  }
  const body = await handleRefreshBody()
  const guard = body.indexOf("if (!stage1.reload) {")
  assert.ok(guard >= 0 && guard < body.indexOf("reloadProjection()"), "the A/C early return precedes any GET")
  assert.ok(guard < body.indexOf("setDashboardState"), "the A/C early return precedes any row assignment")
})

test("T9 safe server errors map to bounded user states", async () => {
  for (const row of KNOWN_PRE_WRITE_FAILURES) {
    const { state } = await runAttempt([safeErrorBody(row.status, row.code)])
    assert.equal(state, row.state, `${row.status} ${row.code}`)
  }
  assert.equal(KNOWN_PRE_WRITE_FAILURES.some((row) => row.code === "tenant_boundary_violation"), false)
})

test("T10 raw server or provider error text is never rendered", async () => {
  const leaked = "totally-internal-detail-A1B2"
  const { state } = await runAttempt([json({ ok: false, requestId: leaked, error: leaked }, 403)])
  assert.equal(state, UNKNOWN)
  for (const candidate of ALL_STATES) assert.equal(refreshCopy(present(candidate, 3)).copy.includes(leaked), false, candidate)
})

test("T11 mock provenance is visible before and after refresh", async () => {
  assert.match(REFRESH_PROVENANCE, /mock/)
  const control = await source(CONTROL)
  assert.match(control, /<p className=\{styles\.refreshProvenance\}>\{REFRESH_PROVENANCE\}<\/p>/)
  assert.equal(/\?[^}]*REFRESH_PROVENANCE/.test(control), false, "provenance is rendered unconditionally")
  for (const candidate of ALL_STATES) {
    const copy = refreshCopy(present(candidate, 4)).copy.toLowerCase()
    for (const phrase of NEVER_CLAIMED) assert.equal(copy.includes(phrase), false, `${candidate} / ${phrase}`)
  }
})

test("T12 unmount cannot update stale state", async () => {
  const body = await handleRefreshBody()
  assert.equal(body.split("if (!mountedRef.current) return").length - 1, 2, "guarded after POST and after GET")
  const dashboard = await source(DASHBOARD)
  assert.match(dashboard, /mountedRef\.current = true\n\s*let active = true/, "re-armed at the top of the mount effect")
  assert.match(dashboard, /active = false\n\s*mountedRef\.current = false/)
})

test("T13 no automatic call at initial render", async () => {
  const dashboard = await source(DASHBOARD)
  const effect = dashboard.slice(dashboard.indexOf("Promise.all(["), dashboard.indexOf("]).then("))
  assert.deepEqual(effect.match(/fetch[A-Za-z]+\(/g), ["fetchDashboardWorkUnits(", "fetchIntegrationStatus(", "fetchRecentAuditLogs("])
  assert.equal(/requestInboxRefresh|handleRefresh/.test(effect), false)
  assert.deepEqual(dashboard.match(/handleRefresh/g), ["handleRefresh", "handleRefresh"], "declaration plus the onRefresh binding only")
  assert.match(dashboard, /onRefresh=\{handleRefresh\}/)
})

test("T14 no action-preview, approval, execution or provider-write request is added", async () => {
  for (const file of [CLIENT, MODEL, CONTROL]) {
    const text = await source(file)
    for (const needle of ["action-preview", "approval", "execute", "dry-run", "tools"]) {
      assert.equal(text.includes(needle), false, `${file} must not reference ${needle}`)
    }
  }
  assert.deepEqual((await source(CLIENT)).match(/"\/api\/[^"]*"/g), ['"/api/workunit/inbox/refresh"'])
})

test("T15 existing route-order and safe-method ratchets are unchanged", async () => {
  const pinned: Array<[string, string]> = [
    ["app/api/workunit/inbox/refresh/route.ts", "8c2e6f889cfebd0520bd952911e8c7c298fd874ba76dfec6698639966112c565"],
    ["tests/fixtures/architecture/legacy-surface.v1.json", "7158911bc30198007ea7550e7bc29dcab809102051277d5df112edcdf05e25f1"],
    ["tests/architectureBoundaries.test.mts", "7cb2ea23850527a47abad27df52227a2bfe2c58561c5192570e43993e3ce6cdf"],
    ["tests/safeMethodWriteInvariant.test.mts", "415e578f5b8ab8699f159006b18ea3ca4de31bba25fdfdda9c84e426d8ac6f46"],
    ["tests/workunitInboxRefreshRoute.test.mts", "b9393c98bff032b3eb65569bfde522465a037d99b74f2bcfb5c38aadbe26a4d1"],
    ["tests/workunitInboxGetReadOnly.test.mts", "a9dee6bd5ed12a1cca94020e7cbe1f10e55d884687050db4a80b08ebeb6e2ac0"],
    ["tests/httpMutationGuard.test.mts", "47870810f7c34c3bf624ceaf75a5b46134bac16507390180857b772662d0dfc2"],
    ["tests/architectureLegacySurface.test.mts", "dfec40d5f9e2242b1632ba119b7e3f6e9e053bc0baa65a1e96fe75e5dba11388"],
  ]
  for (const [file, expected] of pinned) assert.equal(await digest(file), expected, `${file} must be byte-identical to e29f08cc`)
  const legacy = ["app/lib/workunitInbox", "app/lib/actionField", "app/components/workunitInbox", "app/components/legacy/workunitInbox"]
  const edges = await scanModuleGraph(rootDir, ["app/components/workunit-os/adopted", "app/lib/application/dashboard"])
  assert.deepEqual(edges.filter((edge) => legacy.some((root) => edge.resolvedTarget.startsWith(`${root}/`)))
    .map((edge) => `${edge.file} -> ${edge.resolvedTarget}`), [])
})

test("T16 the acceptance gates this WorkUnit is judged by exist as scripts", async () => {
  const { scripts } = JSON.parse(await source("package.json"))
  for (const name of ["test", "test:canonical-pipeline-ratchets", "alpha:safety-gate", "lint", "build", "cf:build",
    "cf:deploy:preflight", "cf:deploy:dry-run", "electron:build:check"]) assert.equal(typeof scripts[name], "string", name)
})

test("T17 POST success then GET {ok:false} yields MATERIALIZED_RELOAD_FAILED", async () => {
  const { state, rows, refreshedCount } = await runAttempt([okPost(6), safeErrorBody(403, "forbidden")])
  assert.equal(state, "MATERIALIZED_RELOAD_FAILED")
  assert.deepEqual(rows, ["row-a"])
  assert.equal(refreshedCount, 6)
})

test("T18 POST success then a rejected or unreadable GET yields MATERIALIZED_RELOAD_FAILED", async () => {
  for (const failure of [new Error("network down"), raw("<html>gateway</html>", 200)]) {
    const { state, refreshedCount } = await runAttempt([okPost(6), failure])
    assert.equal(state, "MATERIALIZED_RELOAD_FAILED")
    assert.equal(refreshedCount, 6)
  }
})

test("T19 partial success preserves the pre-existing rows by reference", async () => {
  const existing = ["row-a", "row-b"]
  const { rows } = await runAttempt([okPost(6), safeErrorBody(403, "forbidden")], existing)
  assert.equal(rows, existing, "the row array reference is untouched")
  const body = await handleRefreshBody()
  assert.ok(body.indexOf("setDashboardState") > body.indexOf("if (stage2.applyRows && rows !== null) {"),
    "rows are assigned only inside the applyRows branch")
  assert.equal(body.split("setDashboardState").length - 1, 1, "exactly one row assignment site")
})

test("T20 partial success retains and displays the valid count", () => {
  const { copy } = refreshCopy(present("MATERIALIZED_RELOAD_FAILED", 6))
  assert.match(copy, /\b6\b/)
  assert.match(copy, /Materialized/)
  assert.match(copy, /could not be re-read/)
})

test("T21 no raw GET error, code, body or message reaches visible copy", async () => {
  const marker = "GET-LEAK-Z9Y8"
  const { state } = await runAttempt([okPost(3), json({ ok: false, requestId: marker, error: marker }, 500)])
  assert.equal(state, "MATERIALIZED_RELOAD_FAILED")
  assert.equal(refreshCopy(present(state, 3)).copy.includes(marker), false)
  const body = await handleRefreshBody()
  assert.match(body, /rows !== null/, "the reload collapses to a boolean before the model")
  assert.equal(/result\.error|reloadResult\.error/.test(body), false)
})

test("T22 POST success plus GET failure is 1 POST, 1 GET and 0 retries", async () => {
  const { calls } = await runAttempt([okPost(6), safeErrorBody(403, "forbidden")])
  assert.deepEqual(sequence(calls), [POST_CALL, GET_CALL])
  const body = await handleRefreshBody()
  assert.equal(body.split("requestInboxRefresh(").length - 1, 1, "exactly one POST call site")
  assert.equal(body.split("reloadProjection()").length - 1, 1, "exactly one GET call site")
  assert.equal(/\b(for|while|retry|setTimeout)\b/.test(body), false, "no retry construct")
})

test("T23 SUCCESS and EMPTY are only ever produced by stage 2", async () => {
  const transports: InboxRefreshTransportResult[] = [
    { kind: "indeterminate" }, { kind: "verified_success", refreshed: 0 }, { kind: "verified_success", refreshed: 9 },
    ...KNOWN_PRE_WRITE_FAILURES.map((row) => ({ kind: "safe_error", status: row.status, code: row.code }) as const),
    { kind: "safe_error", status: 500, code: "internal_error" }, { kind: "safe_error", status: 418, code: "forbidden" },
  ]
  for (const transport of transports) {
    const outcome = classifyRefreshResponse(transport)
    if (outcome.reload) continue
    assert.notEqual(outcome.state, "SUCCESS")
    assert.notEqual(outcome.state, "EMPTY")
  }
  assert.equal(classifyProjectionReload(true, 1).state, "SUCCESS")
  assert.equal(classifyProjectionReload(true, 0).state, "EMPTY")
  const body = await handleRefreshBody()
  assert.equal(/"(SUCCESS|EMPTY)"/.test(body), false, "never assigned as a literal")
  assert.match(body, /setRefreshPresentation\(stage2\)/)
})

test("T24 partial-success copy contains no prohibited phrase", () => {
  const copy = refreshCopy(present("MATERIALIZED_RELOAD_FAILED", 6)).copy.toLowerCase()
  for (const phrase of PROHIBITED) assert.equal(copy.includes(phrase), false, phrase)
})

test("T25 a POST fetch rejection yields MATERIALIZATION_OUTCOME_UNKNOWN", async () => {
  const { state, calls, rows, refreshedCount } = await runAttempt([new TypeError("Failed to fetch")])
  assert.equal(state, UNKNOWN)
  assert.deepEqual(sequence(calls), [POST_CALL], "no projection GET")
  assert.deepEqual(rows, ["row-a"])
  assert.equal(refreshedCount, undefined)
})

test("T26 a malformed 200 body yields MATERIALIZATION_OUTCOME_UNKNOWN", async () => {
  const bodies = [raw("not json at all", 200), raw("", 200), json([1, 2, 3]), json(null),
    json({ ok: true, requestId: "r", refreshed: 3 }), json({ ok: true, requestId: "r", refreshed: 3, source: "all", extra: 1 }),
    json({ ok: false, requestId: "r", refreshed: 3, source: "all" })]
  for (const [index, body] of bodies.entries()) {
    const { state, calls } = await runAttempt([body])
    assert.equal(state, UNKNOWN, `malformed 200 body #${index}`)
    assert.equal(calls.length, 1)
  }
})

test("T27 an invalid refreshed count yields MATERIALIZATION_OUTCOME_UNKNOWN", async () => {
  for (const refreshed of [undefined, -1, 1.5, Infinity, NaN, "6", null, Number.MAX_SAFE_INTEGER + 2]) {
    const { state } = await runAttempt([json({ ok: true, requestId: "r", source: "all", refreshed })])
    assert.equal(state, UNKNOWN, String(refreshed))
  }
})

test("T28 an unrecognized 5xx or unreadable error yields MATERIALIZATION_OUTCOME_UNKNOWN", async () => {
  const responses = [raw("<html><body>Internal Server Error</body></html>", 500), json({}, 500),
    safeErrorBody(500, "internal_error"), raw("bad gateway", 502), safeErrorBody(504, "conflict"), safeErrorBody(403, "tenant_boundary_violation")]
  for (const response of responses) {
    const { state, calls } = await runAttempt([response])
    assert.equal(state, UNKNOWN, `${response.status}`)
    assert.equal(calls.length, 1)
  }
})

test("T29 known pre-write failures keep their bounded states", async () => {
  const pinned = [[401, "unauthorized", "UNAUTHORIZED"], [403, "forbidden", "FORBIDDEN"], [429, "rate_limited", "RATE_LIMITED"], [503, "integration_missing", "PROVIDER_UNAVAILABLE"]] as const
  for (const [status, code, expected] of pinned) {
    const { state } = await runAttempt([safeErrorBody(status, code)])
    assert.equal(state, expected)
    assert.notEqual(state, UNKNOWN)
  }
})

test("T30 the unknown state preserves rows, shows no count, and issues nothing further", async () => {
  const marker = "POST-LEAK-Q7"
  const existing = ["row-a", "row-b"]
  const { state, rows, refreshedCount, calls } = await runAttempt([json({ ok: false, requestId: marker, error: marker }, 599)], existing)
  assert.equal(state, UNKNOWN)
  assert.equal(rows, existing, "row array reference unchanged")
  assert.equal(refreshedCount, undefined)
  assert.deepEqual(sequence(calls), [POST_CALL], "zero GETs, zero retries")
  assert.equal((await handleRefreshBody()).split("requestInboxRefresh(").length - 1, 1, "no retry from the unknown state")
  const { copy } = refreshCopy(present(UNKNOWN, 6))
  assert.equal(/\d/.test(copy), false, "structurally count-free")
  assert.equal(copy.includes(marker), false)
  for (const phrase of PROHIBITED) assert.equal(copy.toLowerCase().includes(phrase), false, phrase)
  assert.match(copy, /could not be confirmed/)
  assert.match(copy, /may have been materialized/)
})

test("T31 only a verified POST success reaches stage 2", async () => {
  const transports: InboxRefreshTransportResult[] = [{ kind: "indeterminate" },
    { kind: "safe_error", status: 500, code: "internal_error" },
    { kind: "safe_error", status: 503, code: "integration_missing" }, { kind: "verified_success", refreshed: 0 }]
  assert.deepEqual(transports.filter((transport) => classifyRefreshResponse(transport).reload),
    [{ kind: "verified_success", refreshed: 0 }])
  const body = await handleRefreshBody()
  const guard = body.indexOf("if (!stage1.reload) {")
  const get = body.indexOf("reloadProjection()")
  assert.equal(body.split("reloadProjection()").length - 1, 1, "exactly one projection GET call site")
  assert.ok(guard >= 0 && guard < get && get < body.indexOf("classifyProjectionReload("),
    "the GET and stage 2 both sit after the early return")
})

test("T32 unknown-state recovery names a page reload before another mutation", () => {
  const { copy, tone } = refreshCopy(present(UNKNOWN))
  assert.match(copy, /Reload the page/)
  assert.match(copy, /before trying again/)
  assert.equal(/\btry again\b/i.test(copy), false, "never an unqualified instruction to press Refresh again")
  assert.equal(tone, "indeterminate")
  const distinct = ["SUCCESS", "INTERNAL_FAILURE", "MATERIALIZED_RELOAD_FAILED"] as const
  for (const other of distinct) assert.notEqual(tone, refreshCopy(present(other, 1)).tone, other)
})

test("T33 the production client exposes no caller-selectable source", async () => {
  const client = await source(CLIENT)
  assert.match(client, /export async function requestInboxRefresh\(\s*fetchImpl: typeof fetch = fetch,\s*\): Promise<InboxRefreshTransportResult>/)
  assert.equal(/options|source\?:/.test(client), false, "no caller-supplied source parameter survives")
  assert.match(client, /body: JSON\.stringify\(\{ source: DASHBOARD_INBOX_SOURCE \}\)/)
  assert.match(await source(DASHBOARD), /requestInboxRefresh\(\)/, "the dashboard calls it with no source argument")
  const { calls, impl } = recordingFetch([okPost(1)])
  await requestInboxRefresh(impl)
  assert.equal(String(calls[0].init?.body), '{"source":"all"}')
})

test("T34 a 200 response echoing the fixed source can become a verified success", async () => {
  const { impl } = recordingFetch([okPost(7)])
  assert.deepEqual(await requestInboxRefresh(impl), { kind: "verified_success", refreshed: 7 })
  const { state, refreshedCount, calls } = await runAttempt([okPost(7), json({ workUnits: [{ id: "a" }] })])
  assert.deepEqual({ state, refreshedCount, seq: sequence(calls) }, { state: "SUCCESS", refreshedCount: 7, seq: [POST_CALL, GET_CALL] })
})

/** The honest outcome for every unbound source: unknown, zero GETs, rows kept, no count. */
const unbound = { state: UNKNOWN, seq: [POST_CALL], rows: ["row-a"], refreshedCount: undefined }
const attemptWithSource = async (value: unknown) => {
  const { state, calls, rows, refreshedCount } = await runAttempt([json({ ok: true, requestId: "r", refreshed: 7, source: value })])
  return { state, seq: sequence(calls), rows, refreshedCount }
}

test("T35 a success response with a missing or non-string source is indeterminate", async () => {
  const { state: missing } = await runAttempt([json({ ok: true, requestId: "r", refreshed: 7 })])
  assert.equal(missing, UNKNOWN, "an absent source proves nothing")
  for (const value of [12345, null, true, ["all"], { source: "all" }]) {
    assert.deepEqual(await attemptWithSource(value), unbound, JSON.stringify(value))
  }
})

test("T36 every mismatched response source is indeterminate and issues no projection GET", async () => {
  for (const value of ["github", "slack", "calendar", "mock", "ALL", "all ", "", "TOTALLY-BOGUS"]) {
    assert.deepEqual(await attemptWithSource(value), unbound, value)
  }
  assert.match(await source(CLIENT), /if \(body\.source !== DASHBOARD_INBOX_SOURCE\) return INDETERMINATE/)
})

test("T37 one presentation state structurally carries the verified count", async () => {
  const model = await source(MODEL)
  for (const shape of [/\| \{ state: CountBearingRefreshState; refreshed: number \}/, /\| \{ state: Exclude<InboxRefreshState, CountBearingRefreshState> \}/,
    /\| \{ state: "SUCCESS"; refreshed: number; applyRows: true \}/, /\| \{ state: "MATERIALIZED_RELOAD_FAILED"; refreshed: number; applyRows: false \}/]) assert.match(model, shape)
  assert.equal((classifyProjectionReload(false, 6) as { refreshed: number }).refreshed, 6, "stage 2 carries its own count")
  assert.equal((classifyProjectionReload(true, 4) as { refreshed: number }).refreshed, 4)
  assert.equal("refreshed" in classifyProjectionReload(true, 0), false, "EMPTY is count-free")
  const dashboard = await source(DASHBOARD)
  assert.deepEqual(dashboard.match(/useState<InboxRefresh\w*>/g), ["useState<InboxRefreshPresentation>"], "exactly one refresh state")
  for (const banned of ["refreshedCount", "setRefreshState", "InboxRefreshState"]) {
    assert.equal(dashboard.includes(banned), false, `${banned} must not survive as a separately mutable value`)
  }
})

test("T38 SUCCESS without a verified positive count fails closed to the unknown outcome", async () => {
  assert.equal(/\d|Materialized/.test(honest.copy), false, "the fail-closed copy states no count and claims nothing")
  for (const invalid of [undefined, 0, -1, 1.5, NaN, Infinity, "7", null, Number.MAX_SAFE_INTEGER + 2]) {
    assert.deepEqual(refreshCopy(present("SUCCESS", invalid as number)), honest, String(invalid))
  }
  assert.match(refreshCopy(present("SUCCESS", 1)).copy, /Materialized 1 mock WorkUnit rows/)
  assert.equal((await source(MODEL)).includes("?? 0"), false, "no count default may return")
})

test("T39 MATERIALIZED_RELOAD_FAILED without a verified count fails closed to the unknown outcome", () => {
  for (const invalid of [undefined, -1, 2.5, NaN, Infinity, "0", null, Number.MAX_SAFE_INTEGER + 2]) {
    assert.deepEqual(refreshCopy(present("MATERIALIZED_RELOAD_FAILED", invalid as number)), honest, String(invalid))
  }
  // A VERIFIED zero is a different thing entirely, and stays truthfully renderable.
  assert.match(refreshCopy(present("MATERIALIZED_RELOAD_FAILED", 0)).copy, /Materialized 0 mock WorkUnit rows, but/)
})

test("T40 the unknown outcome stays count-free and the control has no optional count prop", async () => {
  for (const extraneous of [0, 6, 99, -1, NaN]) assert.deepEqual(refreshCopy(present(UNKNOWN, extraneous)), honest, String(extraneous))
  for (const countFree of ALL_STATES.filter((state) => state !== "SUCCESS" && state !== "MATERIALIZED_RELOAD_FAILED")) {
    assert.deepEqual(refreshCopy(present(countFree, 42)), refreshCopy(present(countFree)), countFree)
  }
  const control = await source(CONTROL)
  assert.equal(/refreshed\?: number/.test(control), false, "no independently optional count prop")
  assert.match(control, /presentation: InboxRefreshPresentation/)
  assert.match(control, /refreshCopy\(presentation\)/)
  for (const file of [CONTROL, DASHBOARD]) assert.equal((await source(file)).includes("refreshed={"), false, file)
})
