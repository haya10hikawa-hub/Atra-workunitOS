/** Type declarations for cf:d1:schema:verify:local (P0-PERSIST-015). */
import type { Binding } from "./lib/d1MigrationManifest.d.mts"
import type { VerifyResult } from "./lib/d1SchemaContract.d.mts"
export declare function runVerifyLocal(repoRoot?: string): { ok: boolean; error?: string; results: Record<Binding, VerifyResult> }
