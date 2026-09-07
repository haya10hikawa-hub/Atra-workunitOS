import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveGitHubSourceMode,
  resolveGitHubClient,
  resolveGitHubToken,
} from "../app/lib/workunitInbox/sources/github/resolveGitHubSource.ts"
import { fakeGitHubClient } from "../app/lib/workunitInbox/sources/github/fakeGitHubClient.ts"
import { realGitHubClient } from "../app/lib/workunitInbox/sources/github/realGitHubClient.ts"
import { githubEventsToNormalizedToolSignals } from "../app/lib/workunitInbox/sources/github/toNormalizedToolSignal.ts"
import { transformSignalsToInboxWorkUnits } from "../app/lib/workunitInbox/transform.ts"

const mutableProcessEnv = process.env as Record<string, string | undefined>

// ─── Mode Resolution ────────────────────────────────────────────

test("resolveGitHubSourceMode defaults to fake", () => {
  assert.equal(resolveGitHubSourceMode({}), "fake")
})

test("resolveGitHubSourceMode returns fake for fake", () => {
  assert.equal(resolveGitHubSourceMode({ GITHUB_SOURCE_MODE: "fake" }), "fake")
})

test("resolveGitHubSourceMode keeps real mode disabled", () => {
  assert.equal(resolveGitHubSourceMode({ GITHUB_SOURCE_MODE: "real" }), "real_disabled")
})

test("resolveGitHubSourceMode returns real_disabled", () => {
  assert.equal(resolveGitHubSourceMode({ GITHUB_SOURCE_MODE: "real_disabled" }), "real_disabled")
})

test("resolveGitHubSourceMode returns fake for unknown value", () => {
  assert.equal(resolveGitHubSourceMode({ GITHUB_SOURCE_MODE: "garbage" }), "fake")
})

// ─── Token Resolution ───────────────────────────────────────────

test("resolveGitHubToken returns token from env", () => {
  assert.equal(resolveGitHubToken({ GITHUB_ACCESS_TOKEN: "test-token" }), "test-token")
})

test("resolveGitHubToken returns undefined when missing", () => {
  assert.equal(resolveGitHubToken({}), undefined)
})

// ─── Client Resolution ──────────────────────────────────────────

test("resolveGitHubClient returns fake when mode is fake", () => {
  const { client } = resolveGitHubClient("fake")
  assert.equal(client, fakeGitHubClient)
})

test("resolveGitHubClient keeps real mode disabled even with token", () => {
  const { client, token } = resolveGitHubClient("real", "test-token")
  assert.equal(client, fakeGitHubClient)
  assert.equal(token, undefined)
})

test("resolveGitHubClient falls back to fake when real but no token", () => {
  const { client } = resolveGitHubClient("real")
  assert.equal(client, fakeGitHubClient)
})

test("resolveGitHubClient returns fake for real_disabled", () => {
  const { client } = resolveGitHubClient("real_disabled")
  assert.equal(client, fakeGitHubClient)
})

test("real mode in production without token falls back to fake", () => {
  const nodeEnv = process.env.NODE_ENV
  try {
    mutableProcessEnv.NODE_ENV = "production"
    const { client } = resolveGitHubClient("real")
    assert.equal(client, fakeGitHubClient)
  } finally {
    if (nodeEnv === undefined) delete mutableProcessEnv.NODE_ENV
    else mutableProcessEnv.NODE_ENV = nodeEnv
  }
})

// ─── Fake Client ────────────────────────────────────────────────

test("fake client returns 3 events", async () => {
  const events = await fakeGitHubClient.fetchNormalizedEvents({ tenantId: "test" })
  assert.equal(events.length, 3)
})

test("fake client events map to NormalizedToolSignal and transform", async () => {
  const events = await fakeGitHubClient.fetchNormalizedEvents({ tenantId: "test" })
  const signals = githubEventsToNormalizedToolSignals(events)
  const workUnits = transformSignalsToInboxWorkUnits(signals)

  assert.equal(workUnits.length, 3)
  assert.equal(workUnits[0].sourceProvider, "github")
})

// ─── Real Client (skeleton) ─────────────────────────────────────

test("real client returns empty without token", async () => {
  const events = await realGitHubClient.fetchNormalizedEvents({ tenantId: "test" })
  assert.equal(events.length, 0)
})
