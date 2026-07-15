/**
 * Local Bootstrap Fixture — LOCAL/TEST ONLY (P0-PERSIST-015)
 *
 * Deterministic control-registry seed for local development / CI ONLY. Every
 * value is UNMISTAKABLY local/test-only (the `.invalid` reserved TLD, `local-`
 * prefixes, a synthetic database id). These values MUST NEVER be used in
 * production — production bootstrap requires operator-provided values with no
 * implicit defaults (see cf-d1-bootstrap-prepare.mjs).
 *
 * Contains NO real credential, JWT secret, provider token, or production
 * identity. Seeding is idempotent (INSERT OR IGNORE) and only ever touches the
 * CONTROL DB registry — migrations never seed rows.
 */

// A synthetic, clearly non-production D1 database id (UUID shape; not a real id).
export const LOCAL_FIXTURE = Object.freeze({
  tenant: Object.freeze({ id: "local-dev-tenant", name: "Local Dev Tenant", slug: "local-dev-tenant", status: "active" }),
  tenantDatabase: Object.freeze({
    tenant_id: "local-dev-tenant",
    database_name: "local-dev-tenant-db",
    database_id: "00000000-0000-4000-8000-000000000010",
    schema_version: "1",
    status: "active",
  }),
  user: Object.freeze({ id: "local-dev-user", email: "local-dev-user@local.invalid", display_name: "Local Dev User" }),
  membership: Object.freeze({ id: "local-dev-membership", tenant_id: "local-dev-tenant", user_id: "local-dev-user", role: "owner", status: "active" }),
  authIdentity: Object.freeze({ id: "local-dev-identity", user_id: "local-dev-user", provider: "jwt", provider_subject: "local-dev-subject", email: "local-dev-user@local.invalid" }),
})

const NOW = "2020-01-01T00:00:00.000Z"

/**
 * Assert every fixture value is unmistakably local/test-only. Throws if any value
 * looks production-shaped. Used as a guard before seeding and by tests.
 */
export function assertLocalFixtureOnly(fixture = LOCAL_FIXTURE) {
  const problems = []
  const localId = (v) => typeof v === "string" && v.startsWith("local-")
  const invalidEmail = (v) => typeof v === "string" && (v.endsWith("@local.invalid") || v.endsWith(".invalid"))
  if (!localId(fixture.tenant.id)) problems.push("tenant_id_not_local")
  if (!localId(fixture.user.id)) problems.push("user_id_not_local")
  if (!localId(fixture.membership.id)) problems.push("membership_id_not_local")
  if (!localId(fixture.authIdentity.id)) problems.push("identity_id_not_local")
  if (!invalidEmail(fixture.user.email)) problems.push("email_not_invalid_tld")
  // The fixture database id must be the synthetic reserved value, never a real UUID.
  if (fixture.tenantDatabase.database_id !== LOCAL_FIXTURE.tenantDatabase.database_id) problems.push("database_id_not_synthetic")
  return { ok: problems.length === 0, problems }
}

/**
 * Idempotently seed the LOCAL control-registry fixture into an open CONTROL DB
 * handle (node:sqlite). Seeds tenant → tenant_databases → user → membership →
 * auth_identity. INSERT OR IGNORE makes repeat seeding safe (no partial
 * corruption). Returns the seeded logical ids (no secrets).
 *
 * The caller MUST verify the schema first — this function does not migrate.
 */
export function seedLocalControlFixture(controlDb, fixture = LOCAL_FIXTURE) {
  const guard = assertLocalFixtureOnly(fixture)
  if (!guard.ok) throw new Error(`refusing to seed non-local fixture: ${guard.problems.join(",")}`)

  controlDb.prepare("INSERT OR IGNORE INTO tenants (id,name,slug,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run(fixture.tenant.id, fixture.tenant.name, fixture.tenant.slug, fixture.tenant.status, NOW, NOW)
  controlDb.prepare("INSERT OR IGNORE INTO tenant_databases (tenant_id,database_name,database_id,schema_version,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(fixture.tenantDatabase.tenant_id, fixture.tenantDatabase.database_name, fixture.tenantDatabase.database_id, fixture.tenantDatabase.schema_version, fixture.tenantDatabase.status, NOW, NOW)
  controlDb.prepare("INSERT OR IGNORE INTO users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run(fixture.user.id, fixture.user.email, fixture.user.display_name, NOW, NOW)
  controlDb.prepare("INSERT OR IGNORE INTO tenant_memberships (id,tenant_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(fixture.membership.id, fixture.membership.tenant_id, fixture.membership.user_id, fixture.membership.role, fixture.membership.status, NOW, NOW)
  controlDb.prepare("INSERT OR IGNORE INTO auth_identities (id,user_id,provider,provider_subject,email,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(fixture.authIdentity.id, fixture.authIdentity.user_id, fixture.authIdentity.provider, fixture.authIdentity.provider_subject, fixture.authIdentity.email, NOW, NOW)

  return {
    tenantId: fixture.tenant.id,
    userId: fixture.user.id,
    membershipId: fixture.membership.id,
    identityId: fixture.authIdentity.id,
    provider: fixture.authIdentity.provider,
    providerSubject: fixture.authIdentity.provider_subject,
  }
}
