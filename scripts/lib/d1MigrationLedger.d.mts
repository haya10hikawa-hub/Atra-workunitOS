/**
 * Type declarations for the D1 migration ledger (P0-PERSIST-015).
 * The implementation is `d1MigrationLedger.mjs`.
 */

import type { DatabaseSync } from "node:sqlite"
import type { Binding, Manifest, MigrationApplyMode, MigrationEffect, PlanStep } from "./d1MigrationManifest.d.mts"

/**
 * Deterministic reconciliation state for one planned migration.
 * `pending` → apply; `satisfied` → skip; every other state is an operator action
 * category that fails closed.
 */
export type LedgerState =
  | "pending"
  | "satisfied"
  | "history_without_schema"
  | "schema_without_history"
  | "digest_mismatch"
  | "path_mismatch"
  | "foreign_binding"

export interface HistoryRow {
  binding: string
  sequence: number
  path: string
  sha256: string
  appliedAt: string
}

export interface ReconciledStep {
  binding: Binding
  sequence: number
  name: string
  apply: MigrationApplyMode
  state: LedgerState
}

export interface Reconciliation {
  ok: boolean
  steps: ReconciledStep[]
  failures: string[]
}

export interface AppliedLane {
  applied: string[]
  skipped: string[]
}

export interface ApplyOptions {
  now?: () => string
}

/**
 * The open-database surface the ledger needs. `node:sqlite`'s `DatabaseSync` —
 * matching the sibling local-bootstrap declarations, so a real handle is accepted
 * without a cast. A remote D1 is reconciled through `reconcileFromState` instead,
 * which takes plain rows and a probe rather than a database handle.
 */
export type LedgerDatabase = DatabaseSync

export declare const MIGRATION_HISTORY_TABLE: string
export declare const CREATE_HISTORY_SQL: string
export declare const LEDGER_STATES: readonly LedgerState[]

export declare function ensureHistoryTable(db: LedgerDatabase): void
export declare function readHistory(db: LedgerDatabase, binding: string): { own: HistoryRow[]; foreign: HistoryRow[] }
export declare function probeEffect(db: LedgerDatabase, effect: MigrationEffect | undefined): boolean
export declare function reconcileLane(db: LedgerDatabase, manifest: Manifest, binding: string): Reconciliation
export declare function reconcileFromState(
  manifest: Manifest,
  binding: string,
  history: { own: HistoryRow[]; foreign: HistoryRow[] },
  probe: (effect: MigrationEffect | undefined) => boolean,
): Reconciliation
export declare function buildHistoryInsertSql(step: PlanStep, appliedAt: string): string
export declare function buildAtomicMigrationBatchSql(migrationSql: string, step: PlanStep, appliedAt: string): string
export declare function splitStatements(sql: string): string[]
export declare function applyLaneWithLedger(db: LedgerDatabase, manifest: Manifest, binding: string, repoRoot: string, options?: ApplyOptions): AppliedLane
export declare function applyAllLanesWithLedger(db: LedgerDatabase, manifest: Manifest, binding: string, repoRoot: string, options?: ApplyOptions): AppliedLane
export declare function pendingSteps(reconciled: Reconciliation): Array<{ sequence: number; name: string; apply: MigrationApplyMode }>
export declare function laneStepAbsPath(repoRoot: string, step: PlanStep): string
