/**
 * Type declarations for the isolated local D1 bootstrap (P0-PERSIST-015).
 * The implementation is `d1LocalBootstrap.mjs`.
 */

import type { DatabaseSync } from "node:sqlite"
import type { Binding } from "./d1MigrationManifest.d.mts"
import type { AppliedLane, ApplyOptions } from "./d1MigrationLedger.d.mts"

export interface BootstrapHandles {
  dbs: Record<Binding, DatabaseSync>
  applied: Record<Binding, string[]>
}
export interface TemporaryBootstrap extends BootstrapHandles { dir: string }

export declare function applyLane(db: DatabaseSync, manifest: unknown, binding: string, repoRoot: string, options?: ApplyOptions): string[]
export declare function applyLaneDetailed(db: DatabaseSync, manifest: unknown, binding: string, repoRoot: string, options?: ApplyOptions): AppliedLane
export declare function bootstrapInMemory(repoRoot: string, manifest: unknown): BootstrapHandles
export declare function withTemporaryBootstrap<T>(repoRoot: string, manifest: unknown, fn: (ctx: TemporaryBootstrap) => T): T
