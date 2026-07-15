/**
 * Type declarations for the LOCAL/TEST-only bootstrap fixture (P0-PERSIST-015).
 * The implementation is `d1BootstrapFixture.mjs`.
 */

import type { DatabaseSync } from "node:sqlite"

export interface LocalFixture {
  tenant: { id: string; name: string; slug: string; status: string }
  tenantDatabase: { tenant_id: string; database_name: string; database_id: string; schema_version: string; status: string }
  user: { id: string; email: string; display_name: string }
  membership: { id: string; tenant_id: string; user_id: string; role: string; status: string }
  authIdentity: { id: string; user_id: string; provider: string; provider_subject: string; email: string }
}

export interface SeededLogicalIds {
  tenantId: string
  userId: string
  membershipId: string
  identityId: string
  provider: string
  providerSubject: string
}

export declare const LOCAL_FIXTURE: LocalFixture
export declare function assertLocalFixtureOnly(fixture?: LocalFixture): { ok: boolean; problems: string[] }
export declare function seedLocalControlFixture(controlDb: DatabaseSync, fixture?: LocalFixture): SeededLogicalIds
