/**
 * Launcher real WorkUnit read model.
 *
 * Owns the Launcher's async read state machine. The canonical Launcher reads
 * real WorkUnits through the EXISTING canonical server path:
 *
 *   GET /api/workunit/inbox
 *     -> fetchDashboardWorkUnits (existing client, reused — not duplicated)
 *     -> InboxWorkUnit[]
 *     -> inboxWorkUnitToSafeCandidate  (safe allowlist projection chokepoint)
 *     -> candidatesToLauncherWorkUnits (existing adapter)
 *     -> LauncherWorkUnit[]
 *
 * No second server route, no duplicated Inbox backend, no fetch/normalization
 * copy: `fetchDashboardWorkUnits` is reused verbatim because it is client-safe,
 * already normalizes into the neutral `InboxWorkUnit` read model, and carries no
 * dashboard-specific UI semantics. Its legacy `dashboard` name is an
 * implementation name and is intentionally NOT renamed here.
 *
 * MOCK BOUNDARY — this module never falls back to mock data. A failed real read
 * resolves to `error`, never to fixtures: a broken production read path must not
 * look healthy. The only mock seam is the EXISTING server-side `?source=mock`
 * query on the same authenticated route, which is still a real authenticated
 * read; no new client-side product flag is introduced.
 *
 * Layer: application. Pure of React/Next by construction — the component owns
 * the React state, this module owns the transitions.
 */

import { fetchDashboardWorkUnits } from "../dashboard/dashboardDataClient.ts"
import type { InboxWorkUnit } from "../workunitInbox/types.ts"
import { candidatesToLauncherWorkUnits } from "./candidateToLauncherWorkUnit.ts"
import { inboxWorkUnitsToSafeCandidates } from "./inboxWorkUnitToCandidate.ts"
import type { LauncherWorkUnit } from "./workUnitSelectionModel.ts"

/** Default read source. `all` is the existing real multi-provider inbox source. */
export const LAUNCHER_INBOX_SOURCE = "all"

export type LauncherReadStatus = "loading" | "loaded" | "empty" | "error"

export type LauncherReadState = {
  readonly status: LauncherReadStatus
  readonly workUnits: readonly LauncherWorkUnit[]
  /** Safe, human-readable message. Never a raw server or provider exception. */
  readonly message: string | null
}

export type LauncherWorkUnitReadResult =
  | { readonly ok: true; readonly workUnits: InboxWorkUnit[] }
  | { readonly ok: false; readonly error: string }

export type LauncherWorkUnitReadClient = (source: string) => Promise<LauncherWorkUnitReadResult>

export const LAUNCHER_LOADING_STATE: LauncherReadState = Object.freeze({
  status: "loading",
  workUnits: Object.freeze([]),
  message: null,
})

const defaultReadClient: LauncherWorkUnitReadClient = (source) => fetchDashboardWorkUnits(source)

export type LoadLauncherWorkUnitsInput = {
  readonly readClient?: LauncherWorkUnitReadClient
  readonly source?: string
}

/**
 * Resolve the Launcher's real read state.
 *
 * Every outcome is terminal and honest:
 *   - transport/auth/permission failure -> `error` with a safe message
 *   - authenticated read with no rows    -> `empty`
 *   - authenticated read with rows       -> `loaded`
 *
 * There is deliberately no mock branch: a failed real fetch must never render
 * fixture WorkUnits.
 */
export async function loadLauncherWorkUnits(
  input: LoadLauncherWorkUnitsInput = {},
): Promise<LauncherReadState> {
  const readClient = input.readClient ?? defaultReadClient
  const source = input.source ?? LAUNCHER_INBOX_SOURCE
  const result = await readClient(source).catch(() => null)

  if (result === null) {
    return { status: "error", workUnits: [], message: mapSafeLauncherReadError("") }
  }
  if (!result.ok) {
    return { status: "error", workUnits: [], message: mapSafeLauncherReadError(result.error) }
  }

  const workUnits = candidatesToLauncherWorkUnits(inboxWorkUnitsToSafeCandidates(result.workUnits))
  if (workUnits.length === 0) {
    return {
      status: "empty",
      workUnits: [],
      message: "No WorkUnits are waiting. Nothing needs your attention right now.",
    }
  }
  return { status: "loaded", workUnits, message: null }
}

/**
 * Map a server error code to a safe user-facing message.
 *
 * The raw server/provider string is classified, never displayed: the Inbox route
 * already returns coded safe errors, and echoing an unrecognized value back into
 * the UI would be an uncontrolled disclosure surface.
 */
export function mapSafeLauncherReadError(serverError: string): string {
  const normalized = (serverError ?? "").toLowerCase()
  if (normalized.includes("unauthorized") || normalized.includes("login") || normalized.includes("401")) {
    return "Sign in to load your WorkUnits."
  }
  if (normalized.includes("forbidden") || normalized.includes("permission") || normalized.includes("403")) {
    return "You do not have permission to view these WorkUnits."
  }
  if (normalized.includes("rate") || normalized.includes("429")) {
    return "Rate limit reached. Please wait before trying again."
  }
  if (normalized.includes("invalid") || normalized.includes("400")) {
    return "The WorkUnit request was invalid."
  }
  if (normalized.includes("integration") || normalized.includes("503")) {
    return "WorkUnits are temporarily unavailable."
  }
  return "WorkUnits could not be loaded."
}
