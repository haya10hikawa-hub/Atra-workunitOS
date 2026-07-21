/**
 * Signal Sanitization Layer
 *
 * Prepares untrusted external input for LLM processing.
 * Sanitization reduces risk but does NOT make content trusted.
 */

import type { ExternalSignal } from "../domain/types.ts"
import type { SanitizedSignal, RiskFlag } from "./types.ts"
import { normalizeForSecurityScan } from "../security/textNormalize.ts"
import {
  containsInstructionDirective,
  containsPromptInjection,
  containsSensitiveValue,
} from "../security/untrustedTextScan.ts"

const MAX_CONTENT_LENGTH = 4_000
const FORBIDDEN_METADATA_KEYS = new Set([
  "approvalid", "targethash", "payloadhash", "tenantid", "userid", "actoruserid", "role",
  "rawcontent", "rawpayload", "rawbody", "providerpayload", "sendablebody",
  "approvedoutboundpayload", "approvedoutboundbody", "body", "html", "text", "filecontent",
  "pagebody", "message", "authorization", "cookie", "password", "secret", "token", "apikey",
])
const ALLOWED_TEXT_METADATA_KEYS = new Set([
  "title", "actor", "actors", "timestamp", "subject", "summary", "description", "notes",
  "repository", "status", "eventtype", "intent", "nextaction", "reason", "evidence",
])

/**
 * Sanitize an ExternalSignal for LLM processing.
 *
 * This function:
 *   1. Extracts safe metadata fields (title, actor, timestamp, labels)
 *   2. Builds a text representation of the signal
 *   3. Scans for prompt injection patterns
 *   4. Truncates if content exceeds max length
 *   5. Returns a SanitizedSignal with risk flags
 *
 * WARNING: Sanitization does not make content trusted.
 * LLM output based on sanitized content must still be validated.
 */
export function sanitizeForLlm(signal: ExternalSignal): SanitizedSignal {
  const metadata = extractMetadata(signal)
  const textContent = buildTextContent(signal, metadata)
  const riskFlags = detectRiskFlags(textContent, signal)
  if (metadataContainsSensitiveData(signal.metadata) && !riskFlags.includes("sensitive_data_detected")) {
    riskFlags.push("sensitive_data_detected")
  }

  const truncated = textContent.length > MAX_CONTENT_LENGTH
  const sanitizedContent = truncated ? textContent.slice(0, MAX_CONTENT_LENGTH) : textContent

  if (truncated && !riskFlags.includes("input_too_long")) {
    riskFlags.push("input_too_long")
  }

  return {
    id: signal.id,
    tenantId: signal.tenantId,
    sourceType: signal.sourceType,
    originalLength: textContent.length,
    truncatedLength: sanitizedContent.length,
    wasTruncated: truncated,
    sanitizedContent,
    riskFlags,
    metadata,
  }
}

function extractMetadata(signal: ExternalSignal): SanitizedSignal["metadata"] {
  const meta = signal.metadata ?? {}
  return {
    title: safeMetadataText(meta.title),
    actor: safeMetadataText(meta.actor) ?? safeMetadataText(meta.actors),
    timestamp: typeof meta.timestamp === "string" ? meta.timestamp : signal.receivedAt,
    labels: Array.isArray(meta.labels) ? meta.labels.filter((l): l is string => typeof l === "string") : undefined,
  }
}

function buildTextContent(signal: ExternalSignal, metadata: SanitizedSignal["metadata"]): string {
  const parts: string[] = []

  if (metadata.title) parts.push(`Title: ${metadata.title}`)
  if (metadata.actor) parts.push(`From: ${metadata.actor}`)
  parts.push(`Source: ${signal.sourceType}`)

  // Build safe content from metadata — never include rawContentRef body text
  const remaining = Object.entries(signal.metadata ?? {})
    .filter(([key, value]) => isAllowedMetadataKey(key) && typeof value === "string" && value.length > 0 && !containsSensitiveData(value))
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")

  if (remaining) parts.push(remaining)
  return parts.join("\n")
}

function isForbiddenMetadataKey(key: string): boolean {
  // Canonicalize first so Unicode homoglyphs (e.g. Cyrillic `ѕеcret`) and
  // zero-width separators cannot smuggle a forbidden key past the filter.
  const canonical = normalizeForSecurityScan(key).toLowerCase().replace(/[^a-z0-9]/g, "")
  return FORBIDDEN_METADATA_KEYS.has(canonical)
}

function isAllowedMetadataKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return !isForbiddenMetadataKey(key) && ALLOWED_TEXT_METADATA_KEYS.has(normalized)
}

function safeMetadataText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && !containsSensitiveData(value) ? value : undefined
}

function metadataContainsSensitiveData(metadata: Record<string, unknown> | undefined): boolean {
  return Object.values(metadata ?? {}).some((value) => typeof value === "string" && containsSensitiveData(value))
}

function containsSensitiveData(value: string): boolean {
  return containsSensitiveValue(value)
}

function detectRiskFlags(text: string, _signal: ExternalSignal): RiskFlag[] {
  void _signal;
  const flags: RiskFlag[] = []

  // The shared scanners canonicalize before matching: homoglyphs and
  // zero-width characters otherwise let `іgnore previous instructions` slip
  // past every regex.
  if (containsPromptInjection(text)) {
    flags.push("prompt_injection_detected")
  } else if (containsInstructionDirective(text)) {
    // Source content contains system-like instructions
    flags.push("source_content_includes_instruction")
  }

  return flags
}
