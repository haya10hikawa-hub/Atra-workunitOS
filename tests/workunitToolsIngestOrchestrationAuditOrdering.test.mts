/**
 * WU-06 final audit-ordering repair.
 *
 * `runIngestOrchestration` (app/lib/application/workunitTools/toolOperationUseCases.ts)
 * must invoke `capabilities.onProcessingStarted()` after providerAvailable is
 * known true but BEFORE `capabilities.processSignal(...)` is awaited — so the
 * route's "llm_processing_started" audit is emitted even when processSignal
 * throws unexpectedly, matching base (pre-WU-06-final-slice) behavior where the
 * audit call preceded `processWorkSignal` inline in the route.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  runIngestOrchestration,
  type IngestOrchestrationCapabilities,
  type IngestOrchestrationInput,
  type ProcessSignalResult,
} from "../app/lib/application/workunitTools/toolOperationUseCases.ts"

const baseInput: IngestOrchestrationInput = {
  id: "tool-1",
  source: "slack",
  tenantId: "tenant-a",
  eventId: "event-1",
  eventTimestamp: "2026-08-21T00:00:00.000Z",
  metadata: { text: "hello" },
}

function capabilitiesWithLog(
  order: string[],
  over: Partial<IngestOrchestrationCapabilities> & { processSignal: IngestOrchestrationCapabilities["processSignal"] },
): IngestOrchestrationCapabilities {
  return {
    providerAvailable: true,
    allowLegacyFallback: false,
    onProcessingStarted() { order.push("started") },
    ...over,
  }
}

test("no provider + blocked: onProcessingStarted is NOT invoked", async () => {
  const order: string[] = []
  const outcome = await runIngestOrchestration(baseInput, {
    providerAvailable: false,
    allowLegacyFallback: false,
    onProcessingStarted() { order.push("started") },
    processSignal() { throw new Error("must not be called") },
  })
  assert.deepEqual(outcome, { kind: "no_provider_blocked" })
  assert.deepEqual(order, [])
})

test("no provider + legacy fallback: onProcessingStarted is NOT invoked", async () => {
  const order: string[] = []
  const outcome = await runIngestOrchestration(baseInput, {
    providerAvailable: false,
    allowLegacyFallback: true,
    onProcessingStarted() { order.push("started") },
    processSignal() { throw new Error("must not be called") },
  })
  assert.deepEqual(outcome, { kind: "no_provider_fallback" })
  assert.deepEqual(order, [])
})

test("provider + success: onProcessingStarted fires before processSignal", async () => {
  const order: string[] = []
  const result: ProcessSignalResult = {
    ok: true, sanitizedSignal: {}, candidate: {}, draft: {}, evaluation: {}, warnings: [], riskFlags: [],
  }
  const outcome = await runIngestOrchestration(baseInput, capabilitiesWithLog(order, {
    async processSignal() { order.push("process"); return result },
  }))
  assert.equal(outcome.kind, "processed")
  assert.deepEqual(order, ["started", "process"])
})

test("provider + { ok:false }: onProcessingStarted fires before processSignal, failure is mapped after", async () => {
  const order: string[] = []
  const outcome = await runIngestOrchestration(baseInput, capabilitiesWithLog(order, {
    async processSignal() { order.push("process"); return { ok: false, error: "invalid_llm_output" } },
  }))
  assert.deepEqual(outcome, { kind: "llm_error", error: "invalid_llm_output" })
  assert.deepEqual(order, ["started", "process"])
})

test("provider + unexpected throw: onProcessingStarted has already fired, the throw propagates unmapped", async () => {
  const order: string[] = []
  const capabilities = capabilitiesWithLog(order, {
    async processSignal(): Promise<ProcessSignalResult> {
      order.push("process")
      throw new Error("unexpected pipeline failure")
    },
  })

  await assert.rejects(
    () => runIngestOrchestration(baseInput, capabilities),
    (err: unknown) => err instanceof Error && err.message === "unexpected pipeline failure",
  )
  // "started" was recorded before the throwing invocation, and no synthetic
  // "completed"/error-mapping step was inserted — the rejection is the raw
  // processSignal error, not an IngestOutcome.
  assert.deepEqual(order, ["started", "process"])
})

test("onProcessingStarted fires exactly once per orchestration run", async () => {
  const order: string[] = []
  let calls = 0
  const outcome = await runIngestOrchestration(baseInput, {
    providerAvailable: true,
    allowLegacyFallback: false,
    onProcessingStarted() { calls++; order.push("started") },
    async processSignal() {
      order.push("process")
      return { ok: true, sanitizedSignal: {}, candidate: {}, draft: {}, evaluation: {}, warnings: [], riskFlags: [] }
    },
  })
  assert.equal(calls, 1)
  assert.equal(outcome.kind, "processed")
})
