/**
 * WU-07A — canonical Launcher real WorkUnit READ path.
 *
 * Proves the Launcher reads real WorkUnits through the existing canonical
 * server/application path while every execution / approval boundary stays shut:
 *
 *   A. entry/default          — Launcher stays the default rendered surface
 *   B. real read              — Launcher invokes the canonical read client
 *   C. projection             — server rows pass the safe candidate projection
 *   D. states                 — loading / empty / safe error / loaded
 *   E. failure behavior       — a failed read never renders mock data
 *   F. authority              — no preview / approval / dry-run / tools / execute
 *   G. adopted regression     — the adopted client keeps its own contract
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  LAUNCHER_INBOX_SOURCE,
  LAUNCHER_LOADING_STATE,
  loadLauncherWorkUnits,
  mapSafeLauncherReadError,
  type LauncherWorkUnitReadClient,
} from "../app/lib/application/launcher/launcherWorkUnitReadModel.ts"
import { inboxWorkUnitToSafeCandidate } from "../app/lib/application/launcher/inboxWorkUnitToCandidate.ts"
import { FORBIDDEN_CANDIDATE_FIELDS } from "../app/lib/application/candidate/safeWorkUnitCandidate.ts"
import { MOCK_SIGNALS } from "../app/lib/application/workunitInbox/mockSignals.ts"
import type { InboxWorkUnit } from "../app/lib/application/workunitInbox/types.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const launcherComponent = "app/components/workunit-os/launcher/WorkUnitLauncher.tsx"
const readModel = "app/lib/application/launcher/launcherWorkUnitReadModel.ts"
const candidateAdapter = "app/lib/application/launcher/inboxWorkUnitToCandidate.ts"
const entryComponent = "app/components/workunit-os/WorkUnitOSDashboard.tsx"

async function source(file: string): Promise<string> {
  return readFile(path.join(rootDir, file), "utf8")
}

function row(over: Partial<InboxWorkUnit> = {}): InboxWorkUnit {
  return {
    id: "wu-1",
    signalId: "sig-1",
    tenantId: "tenant-secret",
    title: "PR #12 needs review",
    kind: "review_waiting",
    priority: "high",
    sourceProvider: "github",
    reason: "A teammate requested your review",
    evidence: "3 files changed",
    nextAction: "Review the diff and sign off",
    sourceUrl: "https://github.com/acme/repo/pull/12",
    actor: "octocat",
    assignee: "pm",
    repository: "acme/repo",
    dueAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-08-23T00:00:00.000Z",
    status: "open",
    ...over,
  }
}

function okClient(workUnits: InboxWorkUnit[]): LauncherWorkUnitReadClient {
  return async () => ({ ok: true, workUnits })
}

function deepKeys(value: unknown): string[] {
  const found: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node && typeof node === "object") {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        found.push(key)
        walk((node as Record<string, unknown>)[key])
      }
    }
  }
  walk(value)
  return found
}

function serialize(value: unknown): string {
  return JSON.stringify(value)
}

// ─── A. Entry / default ─────────────────────────────────────────

test("A: default entry still renders the Launcher and keeps the legacy flag", async () => {
  const entry = await source(entryComponent)
  assert.equal(entry.includes("useLegacyDashboard ? <AdoptedWorkUnitDashboard /> : <WorkUnitLauncher />"), true)
  assert.equal(entry.includes("NEXT_PUBLIC_WORKUNIT_LEGACY_DASHBOARD"), true)
  // The flag default is unchanged: only the literal "true" opts into Adopted.
  assert.equal(entry.includes('=== "true"'), true)
})

// ─── B. Real read ───────────────────────────────────────────────

test("B: the Launcher invokes the canonical real read model, not the mock bridge", async () => {
  const launcher = await source(launcherComponent)
  assert.equal(launcher.includes("loadLauncherWorkUnits"), true)
  assert.equal(launcher.includes("candidateWorkUnitBridge"), false)
  assert.equal(launcher.includes("MOCK_SIGNALS"), false)
  assert.equal(launcher.includes("mockSignals"), false)
  assert.equal(launcher.includes("fallbackLauncherWorkUnits"), false)
})

test("B: the read model reuses the existing inbox client and adds no second route", async () => {
  const model = await source(readModel)
  assert.equal(model.includes("fetchDashboardWorkUnits"), true)
  assert.equal(model.includes("dashboardDataClient"), true)
  // No second route and no duplicated transport: the read model delegates the
  // network call instead of issuing its own, so the route URL is declared once,
  // in the reused client.
  assert.equal(model.includes("fetch("), false)
  assert.equal(model.includes("MOCK_SIGNALS"), false)
  assert.equal(LAUNCHER_INBOX_SOURCE, "all")
})

test("B: the read client is called with the real inbox source", async () => {
  const seen: string[] = []
  const client: LauncherWorkUnitReadClient = async (src) => {
    seen.push(src)
    return { ok: true, workUnits: [row()] }
  }
  await loadLauncherWorkUnits({ readClient: client })
  assert.deepEqual(seen, ["all"])
})

// ─── C. Safe projection ─────────────────────────────────────────

test("C: a server row reaches the Launcher only through the safe projection", async () => {
  const candidate = inboxWorkUnitToSafeCandidate(row())
  assert.equal(candidate.candidateOnly, true)
  assert.equal(candidate.humanReviewRequired, true)
  assert.equal(candidate.candidateType, "work_unit_candidate")
  const model = await source(candidateAdapter)
  assert.equal(model.includes("projectSafeWorkUnitCandidate"), true)
  // The server row must be read field-by-field, never spread into the projection.
  assert.equal(/\.\.\.\s*workUnit\b/.test(model), false)
})

test("C: forbidden and server-owned fields never reach Launcher state", async () => {
  const poisoned = {
    ...row(),
    approvalId: "approval-should-not-leak",
    targetHash: "hash-should-not-leak",
    payloadHash: "payload-hash-should-not-leak",
    rawPayload: { body: "raw-should-not-leak" },
    providerPayload: { body: "provider-should-not-leak" },
    token: "token-should-not-leak",
    secret: "secret-should-not-leak",
    authorization: "Bearer should-not-leak",
    cookie: "session=should-not-leak",
    actorUserId: "user-should-not-leak",
    role: "admin-should-not-leak",
  } as unknown as InboxWorkUnit

  const state = await loadLauncherWorkUnits({ readClient: okClient([poisoned]) })
  assert.equal(state.status, "loaded")

  const keys = deepKeys(state.workUnits)
  for (const forbidden of FORBIDDEN_CANDIDATE_FIELDS) {
    assert.equal(keys.includes(forbidden), false, `forbidden key leaked: ${forbidden}`)
  }
  const wire = serialize(state.workUnits)
  assert.equal(wire.includes("should-not-leak"), false, "a forbidden value leaked into Launcher state")
  // Server-owned, non-forbidden fields are also excluded: the projection is not widened.
  for (const excluded of ["tenantId", "signalId", "sourceUrl", "dueAt", "createdAt", "signalId"]) {
    assert.equal(keys.includes(excluded), false, `server-owned key leaked: ${excluded}`)
  }
  assert.equal(wire.includes("tenant-secret"), false)
})

test("C: the projected Launcher WorkUnit matches the exact safe-projection contract", async () => {
  // Pinned end to end. `mapInboxWorkUnitToLauncherWorkUnit` maps the same row
  // WITHOUT the candidate projection and produces a different contract
  // (status READY, roi 92, sourceDetail "GitHub signal"), so swapping the read
  // model onto that unprojected mapper cannot pass this assertion.
  const state = await loadLauncherWorkUnits({ readClient: okClient([row()]) })
  assert.equal(state.status, "loaded")
  assert.deepEqual(state.workUnits[0], {
    id: "wu-1",
    title: "PR #12 needs review",
    source: "GitHub",
    status: "NEEDS REVIEW",
    roi: 9.4,
    summary: "A teammate requested your review",
    objective: "Review this review waiting and decide the next PM-owned step.",
    kind: "review waiting",
    priority: "high",
    ownerLabel: "pm",
    sourceIcon: {
      id: "github",
      label: "GitHub",
      assetPath: "/workunit-source-icons/github.svg",
      fallbackBadge: "GH",
      sourceType: "local_asset",
    },
    statusTone: "green",
    sourceDetail: "GitHub · review waiting",
    urgency: "High impact",
    nextStep: "Review the diff and sign off",
  })
})

test("C: the read model routes through the projection, never the unprojected row mapper", async () => {
  const model = await source(readModel)
  assert.equal(model.includes("inboxWorkUnitsToSafeCandidates"), true)
  assert.equal(model.includes("candidatesToLauncherWorkUnits"), true)
  // `mapInboxWorkUnitToLauncherWorkUnit` and `fallbackLauncherWorkUnits` are
  // unprojected/fixture primitives. Neither may appear on the real read path.
  assert.equal(model.includes("mapInboxWorkUnitToLauncherWorkUnit"), false)
  assert.equal(model.includes("fallbackLauncherWorkUnits"), false)
})

test("C: sourceUrl stays dropped — StartHub source jump is a separate slice", () => {
  const candidate = inboxWorkUnitToSafeCandidate(row())
  assert.equal(Object.keys(candidate).includes("sourceUrl"), false)
  assert.equal(serialize(candidate).includes("github.com/acme/repo/pull/12"), false)
})

test("C: input ordering and WorkUnit identity are preserved", async () => {
  const rows = [row({ id: "wu-a" }), row({ id: "wu-b" }), row({ id: "wu-c" })]
  const state = await loadLauncherWorkUnits({ readClient: okClient(rows) })
  assert.deepEqual(state.workUnits.map((unit) => unit.id), ["wu-a", "wu-b", "wu-c"])
})

// ─── D. States ──────────────────────────────────────────────────

test("D: the initial state is loading with no WorkUnits", () => {
  assert.equal(LAUNCHER_LOADING_STATE.status, "loading")
  assert.deepEqual([...LAUNCHER_LOADING_STATE.workUnits], [])
  assert.equal(LAUNCHER_LOADING_STATE.message, null)
})

test("D: an authenticated read with no rows resolves to empty", async () => {
  const state = await loadLauncherWorkUnits({ readClient: okClient([]) })
  assert.equal(state.status, "empty")
  assert.deepEqual([...state.workUnits], [])
  assert.equal(typeof state.message, "string")
})

test("D: a read with rows resolves to loaded", async () => {
  const state = await loadLauncherWorkUnits({ readClient: okClient([row()]) })
  assert.equal(state.status, "loaded")
  assert.equal(state.workUnits.length, 1)
  assert.equal(state.workUnits[0]!.title, "PR #12 needs review")
  assert.equal(state.message, null)
})

test("D: an error state carries a safe message, never the raw server error", async () => {
  const cases: Array<[string, string]> = [
    ["unauthorized", "Sign in to load your WorkUnits."],
    ["forbidden", "You do not have permission to view these WorkUnits."],
    ["rate_limited", "Rate limit reached. Please wait before trying again."],
    ["invalid_request", "The WorkUnit request was invalid."],
    ["integration_missing", "WorkUnits are temporarily unavailable."],
  ]
  for (const [serverError, expected] of cases) {
    const state = await loadLauncherWorkUnits({ readClient: async () => ({ ok: false, error: serverError }) })
    assert.equal(state.status, "error")
    assert.equal(state.message, expected)
  }
})

test("D: an unrecognized server error is not echoed back into the UI", async () => {
  const raw = "TypeError: Cannot read properties of undefined at /srv/app/d1/adapter.js:88"
  const state = await loadLauncherWorkUnits({ readClient: async () => ({ ok: false, error: raw }) })
  assert.equal(state.status, "error")
  assert.equal(state.message, "WorkUnits could not be loaded.")
  assert.equal(state.message!.includes("TypeError"), false)
  assert.equal(state.message!.includes("/srv/app"), false)
  assert.equal(mapSafeLauncherReadError(raw), "WorkUnits could not be loaded.")
})

test("D: a rejected read client resolves to a safe error rather than throwing", async () => {
  const state = await loadLauncherWorkUnits({
    readClient: async () => {
      throw new Error("network down at 10.0.0.4")
    },
  })
  assert.equal(state.status, "error")
  assert.equal(state.message!.includes("10.0.0.4"), false)
})

test("D: the Launcher renders every non-loaded state and announces it safely", async () => {
  const launcher = await source(launcherComponent)
  assert.equal(launcher.includes("LauncherReadStatus"), true)
  assert.equal(launcher.includes('aria-live="polite"'), true)
  assert.equal(launcher.includes('role="status"'), true)
  assert.equal(launcher.includes('state.status === "loaded"'), true)
  assert.equal(launcher.includes('state.status === "loading"'), true)
  assert.equal(launcher.includes("state.message"), true)
})

// ─── E. Failure behavior ────────────────────────────────────────

test("E: a failed real read does NOT fall back to mock WorkUnits", async () => {
  const state = await loadLauncherWorkUnits({ readClient: async () => ({ ok: false, error: "unauthorized" }) })
  assert.equal(state.status, "error")
  assert.deepEqual([...state.workUnits], [], "a failed read must render zero WorkUnits")
  const wire = serialize(state)
  for (const signal of MOCK_SIGNALS) {
    assert.equal(wire.includes(signal.title), false, `mock signal leaked on failure: ${signal.title}`)
  }
})

test("E: an empty real read does NOT fall back to mock WorkUnits", async () => {
  const state = await loadLauncherWorkUnits({ readClient: okClient([]) })
  assert.equal(state.status, "empty")
  assert.deepEqual([...state.workUnits], [])
  const wire = serialize(state)
  for (const signal of MOCK_SIGNALS) {
    assert.equal(wire.includes(signal.title), false)
  }
})

test("E: the read model contains no mock or fixture branch at all", async () => {
  const model = await source(readModel)
  for (const term of ["MOCK_SIGNALS", "mockSignals", "candidateWorkUnitBridge", "fallbackLauncherWorkUnits"]) {
    assert.equal(model.includes(term), false, `read model must not reference ${term}`)
  }
})

// ─── F. Authority — no mutation capability is added ─────────────

const launcherReadPathFiles = [launcherComponent, readModel, candidateAdapter]

test("F: the Launcher read path gains no preview, approval, dry-run, tools or execution capability", async () => {
  const combined = (await Promise.all(launcherReadPathFiles.map(source))).join("\n")
  const forbidden = [
    "/api/workunit" + "/tools",
    "action-preview",
    "actionPreview",
    "createDashboardActionPreviews",
    "approveDashboardActionPreviews",
    "dashboardPreviewClient",
    "dashboardExecutionDryRunClient",
    "dry-run",
    "dryRun",
    "approvalId",
    "externalExecute",
    'method: "POST"',
    'method: "PUT"',
    'method: "PATCH"',
    'method: "DELETE"',
  ]
  for (const term of forbidden) assert.equal(combined.includes(term), false, term)
})

test("F: the Launcher component performs no direct fetch and imports no server-only module", async () => {
  const launcher = await source(launcherComponent)
  assert.equal(launcher.includes("fetch("), false)
  for (const term of ["lib/persistence", "lib/security/session", "infrastructure/external", "app/api/"]) {
    assert.equal(launcher.includes(term), false, term)
  }
})

test("F: the candidate adapter stays pure — no fetch, env, provider or route access", async () => {
  const adapter = await source(candidateAdapter)
  assert.equal(adapter.includes("fetch("), false)
  assert.equal(adapter.includes("process.env"), false)
  assert.equal(adapter.includes("/api/"), false)
})

// ─── G. Adopted regression ──────────────────────────────────────

test("G: the adopted dashboard keeps its own real read and mutation wiring", async () => {
  const adopted = await source("app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx")
  assert.equal(adopted.includes("fetchDashboardWorkUnits"), true)
  assert.equal(adopted.includes("createDashboardActionPreviews"), true)
  assert.equal(adopted.includes("approveDashboardActionPreviews"), true)
})

test("G: the shared inbox read client is unchanged and still shared", async () => {
  const client = await source("app/lib/application/dashboard/dashboardDataClient.ts")
  assert.equal(client.includes("export async function fetchDashboardWorkUnits"), true)
  assert.equal(client.includes("/api/workunit/inbox"), true)
  assert.equal(client.includes("fetchIntegrationStatus"), true)
  assert.equal(client.includes("fetchRecentAuditLogs"), true)
})
