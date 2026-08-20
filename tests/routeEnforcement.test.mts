import test from "node:test"
import assert from "node:assert/strict"
import { createDevSessionWithRole } from "../app/lib/security/session.ts"
import { requireSession } from "../app/lib/composition/requestSession.ts"
import { hasPermission } from "../app/lib/security/rbac.ts"
import type { WorkUnitPermission } from "../app/lib/security/policy.ts"
import type { ToolBackendOperation } from "../app/types/toolBackend.ts"
import { setTestRuntimeEnvForRequest, resetTestRuntimeEnvForRequest } from "../app/lib/runtime/requestRuntimeEnvInjection.ts"
import type { AppEnv } from "../app/types/cloudflare-env.ts"
import { FakeD1Database } from "./helpers/fakeD1.ts"

// ─── Operation → Permission Mapping ─────────────────────────────

// Mirrors route.ts OPERATION_PERMISSION. route.ts is the canonical source.
const OP_PERM: Record<ToolBackendOperation, WorkUnitPermission> = {
  ingest:       "workunit.create",
  draft:        "workunit.create",
  create_task:  "workunit.create",
  reply:        "workunit.execute_external_action",
  schedule:     "workunit.execute_external_action",
  create_issue: "workunit.execute_external_action",
}

// Helper to temporarily set an env var for a test
async function withEnv(key: string, value: string | undefined, fn: () => void | Promise<void>) {
  const prev = process.env[key]
  try {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
    await fn()
  } finally {
    if (prev === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = prev
    }
  }
}

// ─── Session Enforcement ────────────────────────────────────────

test("requireSession returns unauthorized in production (no real auth)", async () => {
  await withEnv("NODE_ENV", "production", async () => {
    await withEnv("AUTH_ADAPTER", "none", async () => {
      await withEnv("ALLOW_DEV_SESSION", undefined, async () => {
        const result = await requireSession()
        assert.equal(result.ok, false)
        if (!result.ok) assert.equal(result.reason, "unauthorized")
      })
    })
  })
})

test("requireSession returns unauthorized in dev without ALLOW_DEV_SESSION", async () => {
  await withEnv("NODE_ENV", "development", async () => {
    await withEnv("AUTH_ADAPTER", "dev", async () => {
      await withEnv("ALLOW_DEV_SESSION", undefined, async () => {
        const result = await requireSession()
        assert.equal(result.ok, false)
        if (!result.ok) assert.equal(result.reason, "unauthorized")
      })
    })
  })
})

test("requireSession returns session in dev with explicit adapter and bootstrap", async () => {
  const db = new FakeD1Database()
  setTestRuntimeEnvForRequest({ CONTROL_DB: db } as AppEnv)
  try {
    await withEnv("NODE_ENV", "development", async () => {
      await withEnv("AUTH_ADAPTER", "dev", async () => {
        await withEnv("ALLOW_DEV_SESSION", "true", async () => {
          await withEnv("ALLOW_DEV_WORKSPACE_BOOTSTRAP", "true", async () => {
            // WU-06: an argument-free `requireSession()` defaults to a GET, and
            // a safe method no longer carries the bootstrap capability. This
            // test is about the dev GATES, so it passes the mutation method the
            // bootstrap path actually serves.
            const result = await requireSession(new Request("http://localhost", { method: "POST" }))
            assert.equal(result.ok, true)
            if (result.ok) {
              assert.equal(result.session.role, "owner")
              assert.equal(result.session.tenantId, "dev-tenant")
              assert.equal(result.session.email, "dev@example.local")
              assert.equal(result.session.isDevSession, true)
            }
          })
        })
      })
    })
  } finally {
    resetTestRuntimeEnvForRequest()
  }
})

test("createDevSessionWithRole creates session with specific role", () => {
  const session = createDevSessionWithRole("viewer")
  assert.equal(session.role, "viewer")
  assert.equal(session.tenantId, "dev-tenant")
})

// ─── Operation → Permission Mapping ─────────────────────────────

test("ingest requires workunit.create", () => {
  assert.equal(OP_PERM.ingest, "workunit.create")
})

test("draft requires workunit.create", () => {
  assert.equal(OP_PERM.draft, "workunit.create")
})

test("create_task requires workunit.create", () => {
  assert.equal(OP_PERM.create_task, "workunit.create")
})

test("reply requires workunit.execute_external_action", () => {
  assert.equal(OP_PERM.reply, "workunit.execute_external_action")
})

test("schedule requires workunit.execute_external_action", () => {
  assert.equal(OP_PERM.schedule, "workunit.execute_external_action")
})

test("create_issue requires workunit.execute_external_action", () => {
  assert.equal(OP_PERM.create_issue, "workunit.execute_external_action")
})

test("all 6 operations have a permission mapping", () => {
  const ops: ToolBackendOperation[] = ["ingest", "draft", "create_task", "reply", "schedule", "create_issue"]
  for (const op of ops) {
    assert.ok(OP_PERM[op], `Missing permission mapping for ${op}`)
  }
})

// ─── RBAC Enforcement ───────────────────────────────────────────

test("owner has all required permissions", () => {
  const session = createDevSessionWithRole("owner")
  for (const perm of Object.values(OP_PERM)) {
    assert.equal(hasPermission(session, perm), true, `owner missing ${perm}`)
  }
})

test("editor can create workunits but cannot execute external actions", () => {
  const session = createDevSessionWithRole("editor")
  assert.equal(hasPermission(session, "workunit.create"), true)
  assert.equal(hasPermission(session, "workunit.execute_external_action"), false)
})

test("viewer cannot create or execute", () => {
  const session = createDevSessionWithRole("viewer")
  assert.equal(hasPermission(session, "workunit.create"), false)
  assert.equal(hasPermission(session, "workunit.execute_external_action"), false)
  assert.equal(hasPermission(session, "workunit.read"), true)
})

test("manager can create but cannot execute external actions", () => {
  const session = createDevSessionWithRole("manager")
  assert.equal(hasPermission(session, "workunit.create"), true)
  assert.equal(hasPermission(session, "workunit.execute_external_action"), false)
})

// ─── External operations require execute permission ─────────────

test("external operations all require execute_external_action", () => {
  const externalOps: ToolBackendOperation[] = ["reply", "schedule", "create_issue"]
  for (const op of externalOps) {
    assert.equal(OP_PERM[op], "workunit.execute_external_action")
  }
})

// ─── Non-external operations require only create ────────────────

test("non-external operations require workunit.create", () => {
  const safeOps: ToolBackendOperation[] = ["ingest", "draft", "create_task"]
  for (const op of safeOps) {
    assert.equal(OP_PERM[op], "workunit.create")
  }
})
