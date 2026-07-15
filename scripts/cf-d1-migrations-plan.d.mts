/** Type declarations for cf:d1:migrations:plan (P0-PERSIST-015). */
import type { Binding, PlanStep } from "./lib/d1MigrationManifest.d.mts"
export declare function buildPlanReport(repoRoot?: string):
  | { ok: true; lines: string[]; plans: Record<Binding, PlanStep[]> }
  | { ok: false; error: string; failures?: string[] }
