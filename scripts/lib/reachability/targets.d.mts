import type { Inventory } from "./inventory.d.mts"

export type ResolutionStatus =
  | "resolved_file"
  | "resolved_directory"
  | "resolved_basename"
  | "ambiguous_basename"
  | "build_output"
  | "glob_pattern"
  | "unresolved"
  | "external"

export type ResolvedReferenceTarget = { normalizedTarget: string | undefined; resolution: ResolutionStatus }

export const RESOLUTION_STATUSES: ResolutionStatus[]

export function normalizeReferenceValue(rawValue: string): string | undefined
export function resolveReferenceTarget(
  inventory: Inventory,
  rawValue: string,
  options?: { executableOperand?: boolean; expandGlobs?: boolean },
): ResolvedReferenceTarget[]
