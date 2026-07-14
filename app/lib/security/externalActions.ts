import type { ToolBackendOperation } from "../../types/toolBackend.ts"

const EXTERNAL_OPERATIONS: ReadonlySet<ToolBackendOperation> = new Set([
  "reply",
  "schedule",
  "create_issue",
])

/**
 * Server-side kill switch for all external tool actions.
 *
 * External actions (Slack replies, Gmail replies, GitHub issue creation,
 * Google Calendar event creation) are blocked unless the environment variable
 * EXTERNAL_ACTIONS_ENABLED is explicitly set to "true".
 *
 * The kill switch is checked in both the API route and the backend function
 * so that external execution is never possible through any call path.
 */
/** Minimal shape the kill switch needs — satisfied by both `process.env` and
 * the request-scoped security projection (`projectRuntimeAuthorizationEnv`). */
export type KillSwitchEnv = { readonly EXTERNAL_ACTIONS_ENABLED?: string }

export function areExternalActionsEnabled(
  env: KillSwitchEnv | NodeJS.ProcessEnv = process.env,
): boolean {
  return env.EXTERNAL_ACTIONS_ENABLED === "true"
}

/**
 * Returns true when the given operation triggers an external tool action
 * (Slack posting/replying, Gmail sending/replying, GitHub issue creation,
 * Google Calendar event creation).
 */
export function isExternalOperation(operation: ToolBackendOperation): boolean {
  return EXTERNAL_OPERATIONS.has(operation)
}
