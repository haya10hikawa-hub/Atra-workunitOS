/**
 * P6-FIX-005: the single canonical Phase 6 grant-like field denylist
 * (Issue #116). Before this module three validators carried hand-copied local
 * lists that had drifted to different sizes (Persistence Target Decision: 13,
 * Persistence Audit Evidence: 17, Recorder Audit Summary: 20), and the Phase 6
 * artifact validators had no dedicated grant-field classification at all. This
 * module pins the established 20-name union exactly once so every consumer
 * classifies every known grant-like field with the same dedicated, stable,
 * fail-closed issue code.
 *
 * PURE, DETERMINISTIC, LEAF. No imports, no I/O, no clock read, no
 * environment, network, filesystem, or database access, no randomness, and no
 * authorization concept. The predicate never throws for ordinary input, never
 * mutates or echoes its input, and allocates no result object.
 *
 * This denylist is lexical defense-in-depth only: rejecting these exact names
 * does not prove that every possible future or obfuscated grant-like name is
 * detectable, and passing validation is not approval, not authorization, not
 * execution permission, not persistence permission, not graph-write
 * permission, and not production readiness. AI proposes. Rules guard. Humans
 * decide.
 *
 * The Recorder Summary Evidence Ledger Linkage module pins its own separate
 * contract field list (LINKAGE_CANDIDATE_FORBIDDEN_GRANT_FIELDS) and does not
 * consume this module.
 */

/**
 * The canonical 20 grant-like field names. A record carrying any of these as a
 * top-level key must fail validation with the consuming module's dedicated
 * grant-field issue code.
 */
export const PHASE6_FORBIDDEN_GRANT_FIELDS = [
  "approval",
  "approved",
  "authorized",
  "execution_permission",
  "executed",
  "promotion_permission",
  "promoted",
  "persistence_permission",
  "persisted",
  "storage_permission",
  "stored",
  "durable_storage_permission",
  "evidence_ledger_append_permission",
  "graph_write_permission",
  "external_action_permission",
  "formal_workunit_promotion",
  "approvalstore_approval",
  "summary_runtime_permission",
  "audit_emission_permission",
  "starthub_execution_permission",
] as const

export type Phase6ForbiddenGrantField = (typeof PHASE6_FORBIDDEN_GRANT_FIELDS)[number]

/** True when `value` is exactly one of the canonical grant-like field names. */
export function isPhase6ForbiddenGrantField(
  value: unknown,
): value is Phase6ForbiddenGrantField {
  return (
    typeof value === "string" &&
    (PHASE6_FORBIDDEN_GRANT_FIELDS as readonly string[]).includes(value)
  )
}
