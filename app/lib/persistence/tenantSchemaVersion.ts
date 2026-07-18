/**
 * Canonical tenant-data schema version — Worker/runtime-safe.
 *
 * The single source of truth for `tenant_databases.schema_version` is the
 * canonical migration manifest (`migrations/manifest.json`,
 * `registry.TENANT_DB_DEFAULT.schemaVersion`). That manifest is loaded by a
 * Node-only tool (`scripts/lib/d1MigrationManifest.mjs`, which uses `node:fs`)
 * and must NOT be imported into the Worker bundle.
 *
 * This module exposes the same value as a committed, bundle-safe constant. It is
 * NOT an independent literal to be trusted on faith: a test
 * (`tests/tenantSchemaCompatibility.test.mts`) mechanically asserts that
 * `CANONICAL_TENANT_SCHEMA_VERSION` equals the manifest's canonical version, so
 * the two can never drift.
 *
 * `"2"` is the current canonical Alpha schema (INCLUDING
 * `action_previews.created_by_user_id`, added by migration 0006). Version `"1"`
 * is the pre-0006 schema the application cannot use — it is migration-required
 * and routing-incompatible, NOT a supported runtime version.
 */

/** A bounded numeric version string (defense-in-depth on the constant below). */
const NUMERIC_VERSION_RE = /^[0-9]{1,10}$/

export const CANONICAL_TENANT_SCHEMA_VERSION = "2" as const

/**
 * The canonical tenant schema version the runtime accepts. Fails closed (throws)
 * only if the committed constant is itself malformed — a build-time invariant, not
 * a request-time branch. Never exposes a filesystem path or manifest content.
 */
export function getCanonicalTenantSchemaVersion(): string {
  if (!NUMERIC_VERSION_RE.test(CANONICAL_TENANT_SCHEMA_VERSION)) {
    throw new Error("canonical_tenant_schema_version_malformed")
  }
  return CANONICAL_TENANT_SCHEMA_VERSION
}
