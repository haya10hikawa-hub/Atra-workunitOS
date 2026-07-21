export const P0_FORBIDDEN_CONTEXT_KEYS = [
  "approvalId",
  "hash",
  "targetHash",
  "payloadHash",
  "tenantId",
  "userId",
  "actorUserId",
  "role",
  "token",
  "tokens",
  "secret",
  "apiKey",
  "api_key",
  "rawPayload",
  "rawBody",
  "body",
  "html",
  "message",
  "text",
  "fileContent",
  "pageBody",
  "providerTarget",
  "externalConfig",
  "command",
  "externalExecutionPayload",
  "sendableBody",
  "approvedOutboundBody",
  "dbUpdatePayload",
] as const

export const P0_FORBIDDEN_ACTIONS = [
  "ai_approval",
  "ai_execution",
  "ai_formalization",
  "ai_merge_finalization",
  "ai_split_finalization",
  "cache_based_approval",
  "vector_merge_finalization",
  "tool_pin_execution",
] as const

const FORBIDDEN_KEY_SET = new Set(P0_FORBIDDEN_CONTEXT_KEYS.map(normalizeSafetyKey))
const FORBIDDEN_TEXT_PATTERN =
  /\b(approvalId|targetHash|payloadHash|tenantId|userId|actorUserId|apiKey|rawPayload|rawBody|sendableBody|approvedOutboundBody|dbUpdatePayload)\b|raw\s+(slack|gmail|notion|drive|calendar)\s+body/i

export function normalizeSafetyKey(key: string): string {
  return key.replace(/[_\-\s]/g, "").toLowerCase()
}

export function isForbiddenContextKey(key: string): boolean {
  const normalized = normalizeSafetyKey(key)
  return FORBIDDEN_KEY_SET.has(normalized) || normalized.endsWith("hash")
}

export function containsForbiddenContextText(value: string): boolean {
  return FORBIDDEN_TEXT_PATTERN.test(value)
}

// Summary-boundary text screen. Moved verbatim from
// decompositionOrchestrator.ts so every candidate-only layer screens
// human-facing summaries against the same authority.
const FORBIDDEN_SUMMARY_TEXT_PATTERN =
  /\b(hash|role|approvalId|targetHash|payloadHash|tenantId|userId|actorUserId|rawPayload|rawBody|providerPayload|sendableBody|approvedOutboundPayload|approvedOutboundBody|dbUpdatePayload)\b|raw\s+(provider|slack|gmail|notion|drive|calendar)\s+(payload|body)|provider\s*(raw\s*)?(payload|body)|provider-ready\s+payload|sendable\s+(provider\s+)?(payload|body)|approved\s+outbound\s+(payload|body)/i

export function containsForbiddenSummaryText(value: string): boolean {
  return FORBIDDEN_SUMMARY_TEXT_PATTERN.test(value)
}
