import test from "node:test"
import assert from "node:assert/strict"
import { buildIdempotentBootstrapSql, buildLocalJwtBootstrapPlan } from "../scripts/cf-d1-bootstrap-jwt-local.mjs"

const baseEnv = {
  JWT_AUTH_SECRET: "local-jwt-secret-with-at-least-32-bytes",
  JWT_AUTH_ISSUER: "workunit-os",
  JWT_AUTH_AUDIENCE: "workunit-os-api",
  CF_D1_BOOTSTRAP_IDENTITY_PROVIDER: "jwt",
  CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: "jwt-local-subject",
  CF_D1_BOOTSTRAP_IDENTITY_EMAIL: "jwt-local@example.invalid",
}

test("local JWT bootstrap plan binds provider_subject exactly to the JWT sub", () => {
  const plan = buildLocalJwtBootstrapPlan(baseEnv)
  assert.equal(plan.ok, true)
  assert.ok(plan.values)
  const values = plan.values
  assert.equal(values.identityProvider, "jwt")
  assert.equal(values.identitySubject, "jwt-local-subject")
  assert.equal(values.userEmail, "jwt-local@example.invalid")
  assert.equal(values.membershipRole, "owner")
  assert.equal(values.schemaVersion, "2")
})

test("local JWT bootstrap refuses missing bootstrap identity email", () => {
  const plan = buildLocalJwtBootstrapPlan({ ...baseEnv, CF_D1_BOOTSTRAP_IDENTITY_EMAIL: "" })
  assert.equal(plan.ok, false)
  if (!plan.ok) assert.equal(plan.reason, "missing:CF_D1_BOOTSTRAP_IDENTITY_EMAIL")
})

test("local JWT bootstrap SQL is idempotent and seeds all required control rows", () => {
  const plan = buildLocalJwtBootstrapPlan(baseEnv)
  assert.equal(plan.ok, true)
  assert.ok(plan.values)
  const sql = buildIdempotentBootstrapSql(plan.values, "2026-01-01T00:00:00.000Z")
  for (const table of ["tenants", "tenant_databases", "users", "tenant_memberships", "auth_identities"]) {
    assert.match(sql, new RegExp(`INSERT INTO ${table}`))
  }
  assert.match(sql, /ON CONFLICT/)
  assert.match(sql, /provider_subject/)
})
