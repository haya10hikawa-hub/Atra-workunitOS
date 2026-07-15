/** Type declarations for cf:d1:schema:verify:remote (P0-PERSIST-015, read-only). */
import type { ReadOnlyRunner } from "./lib/d1SchemaContract.d.mts"

export interface RemoteVerifyGateInput { argv?: string[]; repoRoot?: string; configPath?: string }
export declare function evaluateRemoteVerifyGates(input?: RemoteVerifyGateInput): { ok: boolean; blocked: string[] }
export declare function makeWranglerReadOnlyRunner(binding: string, configPath: string, spawn?: unknown): ReadOnlyRunner
