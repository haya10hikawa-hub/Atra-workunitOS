import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { candidateWorkUnitBridge } from "../app/lib/application/candidate/candidateWorkUnitBridge.ts"
import { candidatesToLauncherWorkUnits } from "../app/lib/application/launcher/candidateToLauncherWorkUnit.ts"
import { transformSignalsToInboxWorkUnits } from "../app/lib/application/workunitInbox/transform.ts"
import type { NormalizedToolSignal } from "../app/lib/application/workunitInbox/types.ts"
import { createExternalSignal } from "../app/lib/domain/types.ts"
import { createMockLlmProvider, STANDARD_MOCK_RESPONSES } from "../app/lib/llm/mockProvider.ts"
import { processWorkSignal } from "../app/lib/llm/processWorkSignal.ts"
import { GET as inboxGet } from "../app/api/workunit/inbox/route.ts"
import { POST as inboxRefreshPost } from "../app/api/workunit/inbox/refresh/route.ts"
import { POST as toolsPost } from "../app/api/workunit/tools/route.ts"
import { resolveRouteRepositories } from "../app/lib/persistence/routeRepositories.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import { seedDevControlWorkspace } from "./helpers/devControlWorkspace.ts"

const contract = JSON.parse(await readFile(new URL("./fixtures/architecture/current-pipeline-behavior.v1.json", import.meta.url), "utf8"))
const tenantId = "tenant-ratchet" as TenantId
const signals: NormalizedToolSignal[] = [
  {
    id: "github-7", tenantId, provider: "github", signalType: "github_issue_blocked",
    title: "Release blocker", summary: "API contract undecided", sourceUrl: "https://github.test/acme/repo/issues/7",
    actor: "Ari", assignee: "Kai", repository: "acme/repo", priorityHint: "high",
    createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T01:00:00.000Z",
  },
  {
    id: "slack-9", tenantId, provider: "slack", signalType: "slack_mention_request",
    title: "Release blocker follow-up", summary: "Please settle the same API contract",
    sourceUrl: "https://slack.test/archives/release/p9", actor: "Mina", priorityHint: "medium",
    createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T01:00:00.000Z",
  },
]

async function withDevRouteRuntime<T>(mockLlm: boolean, run: (db: FakeD1Database) => Promise<T>): Promise<T> {
  const db = new FakeD1Database()
  const backup = { ...process.env }
  try {
    Object.assign(process.env, {
      NODE_ENV: "development", AUTH_ADAPTER: "dev", ALLOW_DEV_SESSION: "true",
      ALLOW_DEV_WORKSPACE_BOOTSTRAP: "true", ALLOW_DEV_CONTROLLESS_SESSION: "false",
      PERSISTENCE_MODE: "d1", DEV_SESSION_ROLE: "owner", ALLOW_MOCK_LLM: mockLlm ? "true" : "false",
      ALLOW_LEGACY_INGEST_FALLBACK: "false", EXTERNAL_ACTIONS_ENABLED: "false",
    })
    delete process.env.DEEPSEEK_API_KEY
    setTestRuntimeEnvForRequest({ CONTROL_DB: db, TENANT_DB_DEFAULT: db } as AppEnv)
    // WU-06: this harness deliberately keeps ALLOW_DEV_CONTROLLESS_SESSION
    // "false", so it exercises the real control-DB session chain. Seeding is how
    // that chain now begins — a safe request no longer creates it.
    await seedDevControlWorkspace(db, "owner")
    return await run(db)
  } finally {
    resetTestRuntimeEnvForRequest()
    for (const key of Object.keys(process.env)) if (!(key in backup)) delete process.env[key]
    Object.assign(process.env, backup)
  }
}

test("legacy mock adapter and inbox paths remain characterized but non-canonical", () => {
  const inbox = transformSignalsToInboxWorkUnits(signals).map((item) => ({
    id: item.id, signalId: item.signalId, tenantId: item.tenantId, sourceProvider: item.sourceProvider,
    kind: item.kind, priority: item.priority, sourceUrl: item.sourceUrl, status: item.status,
  }))
  const bridge = candidateWorkUnitBridge({ signals })
  const candidates = bridge.workUnits.map((item) => ({
    id: item.id, source: item.source, status: item.status, priority: item.priority,
    candidateType: item.candidateType, humanReviewRequired: item.humanReviewRequired,
    candidateOnly: item.candidateOnly, graphNodeIds: item.graph.nodes.map((node) => node.id),
    hasSourceUrl: Object.hasOwn(item, "sourceUrl"), hasMissingFields: Object.hasOwn(item, "missingFields"),
  }))
  const launcher = candidatesToLauncherWorkUnits(bridge.workUnits).map((item) => ({
    id: item.id, source: item.source, status: item.status, priority: item.priority,
    hasGraph: Object.hasOwn(item, "graph"), hasEvidenceSummary: Object.hasOwn(item, "evidenceSummary"),
    hasHumanReviewRequired: Object.hasOwn(item, "humanReviewRequired"),
  }))
  assert.equal(contract.sourceSha, "066a43c3df07f3da10a2fc93ff7d90157c732114")
  assert.equal(contract.sourceShaRole, "refactor_base_only_not_tree_attestation")
  assert.deepEqual({ inbox, bridge: { source: bridge.source, mode: bridge.mode, safety: bridge.safety, candidates }, launcher }, contract.legacyMockAndInbox)
})

test("legacy five-signal bridge remains compatible outside the canonical Launcher path", () => {
  const bridge = candidateWorkUnitBridge()
  assert.deepEqual({
    bridge: {
      source: bridge.source, mode: bridge.mode, safety: bridge.safety,
      candidateIds: bridge.workUnits.map((item) => item.id),
    },
    launcher: candidatesToLauncherWorkUnits(bridge.workUnits),
  }, contract.legacyMockToLauncher)
})

test("default page to launcher composition source matches the reviewed snapshot", async () => {
  assert.equal(contract.launcherCompositionAuthority, "canonical_c0_candidate_projection")
  const files = [
    "../app/page.tsx",
    "../app/components/workunit-os/WorkUnitOSDashboard.tsx",
    "../app/components/workunit-os/launcher/WorkUnitLauncher.tsx",
  ]
  const hashes = Object.fromEntries(await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(file, import.meta.url))
    return [file.slice(3), createHash("sha256").update(source).digest("hex")]
  })))
  assert.deepEqual(hashes, contract.launcherCompositionSourceHashes)
})

test("actual Inbox GET is projection-only and POST refresh owns persistence, per the exact contract", async () => {
  await withDevRouteRuntime(false, async () => {
    // ── GET: byte-identical response, ZERO durable writes ──
    const response = await inboxGet(new Request("http://localhost:3000/api/workunit/inbox?source=mock"))
    const body = await response.json()
    const repos = await resolveRouteRepositories("dev-tenant" as TenantId)
    assert.equal(repos.ok, true)
    if (!repos.ok) return

    const readRows = (await repos.bundle.workUnits.listRecent(repos.bundle.ctx, 20))
    const getUsage = await repos.bundle.usage.getCurrentUsage(repos.bundle.ctx, "dev-tenant", "inbox_fetch")
    const getAudit = (await repos.bundle.auditLogs.listRecent(repos.bundle.ctx, 20))
      .filter((row) => row.eventKind === "workunit.inbox.fetch")
    assert.deepEqual({
      status: response.status,
      body,
      getPersistence: { rows: readRows, usageCount: getUsage, auditCount: getAudit.length },
    }, {
      status: contract.inboxRoute.status,
      body: contract.inboxRoute.body,
      getPersistence: contract.inboxRoute.getPersistence,
    })

    // ── POST refresh: the persistence expectations formerly pinned on the GET ──
    const refresh = await inboxRefreshPost(new Request("http://localhost:3000/api/workunit/inbox/refresh", {
      method: "POST",
      headers: { Host: "localhost:3000", "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ source: "mock" }),
    }))
    assert.equal(refresh.status, 200)

    const rows = (await repos.bundle.workUnits.listRecent(repos.bundle.ctx, 20))
      .map((row) => ({ id: row.id, tenantId: row.tenantId, sourceSignalId: row.sourceSignalId, status: row.status }))
      .sort((a, b) => a.id.localeCompare(b.id))
    const usageCount = await repos.bundle.usage.getCurrentUsage(repos.bundle.ctx, "dev-tenant", "inbox_fetch")
    const audit = (await repos.bundle.auditLogs.listRecent(repos.bundle.ctx, 20))
      .find((row) => row.eventKind === "workunit.inbox.fetch")
    assert.ok(audit)
    assert.deepEqual({
      rows, usageCount,
      audit: { eventKind: audit.eventKind, reason: audit.reason, metadata: JSON.parse(audit.metadata ?? "{}") },
    }, contract.inboxRoute.refreshPersistence)
  })
})

test("tools LLM path matches the exact current-behavior contract", async () => {
  const signal = createExternalSignal({
    id: "llm-11", tenantId, sourceType: "slack",
    sourceRef: { source: "slack", externalId: "msg-11", container: "release", url: "https://slack.test/archives/release/p11", capturedAt: "2026-01-04T00:00:00.000Z" },
    metadata: { title: "Prepare security review", actor: "Mina" },
  })
  const provider = createMockLlmProvider(STANDARD_MOCK_RESPONSES)
  const result = await processWorkSignal(provider, signal, tenantId)
  if (!result.ok) return assert.fail(`LLM characterization failed at ${result.stage}: ${result.error}`)
  const actual = {
    providerCalls: provider.getCallCount(),
    candidate: { sourceSignalIds: result.candidate.sourceSignalIds, sourceType: result.candidate.sourceType, trustLevel: result.candidate.trustLevel, hasSourceRef: Object.hasOwn(result.candidate, "sourceRef") },
    draft: { sourceCandidateIds: result.draft.sourceCandidateIds, status: result.draft.status, trustLevel: result.draft.trustLevel, missingFields: result.draft.missingFields },
    evaluation: { isComplete: result.evaluation.isComplete, isExecutable: result.evaluation.isExecutable, missingFields: result.evaluation.missingFields },
    hasReviewedWorkUnit: Object.hasOwn(result, "reviewedWorkUnit"), hasExecution: Object.hasOwn(result, "execution"),
  }
  assert.deepEqual(actual, contract.llm)
})

test("actual Tools POST dev-auth mock-provider response mapping matches the exact contract", async () => {
  await withDevRouteRuntime(true, async () => {
    const response = await toolsPost(new Request("http://localhost:3000/api/workunit/tools", {
      method: "POST",
      headers: { Host: "localhost:3000", "content-type": "application/json", origin: "http://localhost:3000", "x-request-id": "ratchet-tools-ingest" },
      body: JSON.stringify({
        id: "tools-ingest-1", source: "slack", operation: "ingest",
        event: { id: "event-llm-11", source: "slack", timestamp: "2026-01-04T00:00:00.000Z", text: "Prepare security review" },
      }),
    }))
    assert.deepEqual({ status: response.status, body: await response.json() }, contract.toolsRouteMockLlm)
  })
})
