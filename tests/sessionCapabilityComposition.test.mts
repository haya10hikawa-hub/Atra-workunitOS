import test from "node:test"
import assert from "node:assert/strict"
import { composeRequestServices } from "../app/lib/runtime/composeRequestServices.ts"
import type { ValidatedRequestRuntimeConfig } from "../app/lib/runtime/requestRuntimeConfig.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"

function runtime(
  controlDb: FakeD1Database | undefined,
  options: { allowDevSession?: boolean; allowDevWorkspaceBootstrap?: boolean } = {},
): ValidatedRequestRuntimeConfig {
  return {
    source: "local",
    persistence: controlDb ? { mode: "d1", CONTROL_DB: controlDb } : { mode: "disabled" },
    auth: { adapter: "dev", isProduction: false },
    security: {
      externalActionsEnabled: false,
      allowLegacyIngestFallback: false,
      allowDevSession: options.allowDevSession ?? true,
      allowDevWorkspaceBootstrap: options.allowDevWorkspaceBootstrap ?? false,
      allowControlLessDevSession: false,
    },
    llm: { allowMock: false, allowLegacyFallback: false, isProduction: false },
  }
}

test("ordinary session composition supplies read authority without bootstrap mutation capability", () => {
  const services = composeRequestServices(runtime(new FakeD1Database()))

  assert.notEqual(services.sessionAuthority, null)
  assert.equal(services.developmentWorkspaceBootstrap, null)
  if (services.sessionAuthority) {
    assert.equal("bootstrapDevelopmentWorkspace" in services.sessionAuthority, false)
  }
})

test("development bootstrap capability is supplied only when both explicit dev gates are enabled", () => {
  const db = new FakeD1Database()

  const bootstrapEnabled = composeRequestServices(runtime(db, {
    allowDevSession: true,
    allowDevWorkspaceBootstrap: true,
  }))
  assert.notEqual(bootstrapEnabled.sessionAuthority, null)
  assert.notEqual(bootstrapEnabled.developmentWorkspaceBootstrap, null)

  const devSessionDisabled = composeRequestServices(runtime(db, {
    allowDevSession: false,
    allowDevWorkspaceBootstrap: true,
  }))
  assert.equal(devSessionDisabled.developmentWorkspaceBootstrap, null)
})

test("missing control DB supplies neither session-read nor bootstrap authority", () => {
  const services = composeRequestServices(runtime(undefined, {
    allowDevSession: true,
    allowDevWorkspaceBootstrap: true,
  }))

  assert.equal(services.sessionAuthority, null)
  assert.equal(services.developmentWorkspaceBootstrap, null)
})
