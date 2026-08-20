import test from "node:test"
import assert from "node:assert/strict"
import { normalizeRoleInput, RoleNormalizationError } from "../app/lib/domain/auth/roles.ts"

test("valid role owner returns owner", () => { assert.equal(normalizeRoleInput("owner"), "owner") })
test("valid role manager returns manager", () => { assert.equal(normalizeRoleInput("manager"), "manager") })
test("valid role editor returns editor", () => { assert.equal(normalizeRoleInput("editor"), "editor") })
test("valid role viewer returns viewer", () => { assert.equal(normalizeRoleInput("viewer"), "viewer") })
test("admin maps to manager", () => { assert.equal(normalizeRoleInput("admin"), "manager") })
test("pm maps to editor", () => { assert.equal(normalizeRoleInput("pm"), "editor") })
test("member maps to editor", () => { assert.equal(normalizeRoleInput("member"), "editor") })

test("undefined role throws RoleNormalizationError", () => {
  assert.throws(() => normalizeRoleInput(undefined), RoleNormalizationError)
})

test("null role throws RoleNormalizationError", () => {
  assert.throws(() => normalizeRoleInput(null as unknown as Parameters<typeof normalizeRoleInput>[0]), RoleNormalizationError)
})

test("empty string role throws RoleNormalizationError", () => {
  assert.throws(() => normalizeRoleInput("" as unknown as Parameters<typeof normalizeRoleInput>[0]), RoleNormalizationError)
})

test("unknown role throws RoleNormalizationError", () => {
  assert.throws(() => normalizeRoleInput("superadmin" as unknown as Parameters<typeof normalizeRoleInput>[0]), RoleNormalizationError)
})

test("undefined role does not become owner", () => {
  try { normalizeRoleInput(undefined); assert.fail("should throw") } catch (e) {
    assert.ok(e instanceof RoleNormalizationError)
    assert.equal((e as RoleNormalizationError).input, undefined)
  }
})
