/**
 * Untrusted Text Scanning
 *
 * Shared pure scanners over untrusted free text: sensitive-value detection
 * and prompt-injection screening. Extracted verbatim from
 * `app/lib/llm/sanitize.ts` so candidate-only layers can reuse the same
 * security authority without duplicating the regexes.
 *
 * The pattern collections are module-private on purpose: the public API is
 * the three predicates only, so no consumer can mutate the scanner behavior
 * at runtime.
 *
 * Detection only — a passing scan never makes content trusted.
 */

import { normalizeForSecurityScan } from "./textNormalize.ts"

const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\bgh[pousr]_[A-Za-z0-9]{12,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]{8,}/i,
]

const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore (all )?(previous|prior|above) (instructions|rules|messages)/i,
  /forget (all |everything )?(previous|prior|above)?/i,
  /you are now/i,
  /new instructions/i,
  /system prompt/i,
  /developer message/i,
  /override your (rules|behavior|instructions)/i,
  /disregard (all )?(previous|above) (instructions|rules)/i,
  /act as (if )?you are/i,
  /exfiltrate|data ?leak|reveal (the )?(system|secret|api ?key|token)/i,
]

const INSTRUCTION_DIRECTIVE_PATTERN =
  /you (must|should|need to|have to) (respond|reply|answer|output|return|generate|create|send|post)/i

/**
 * True when the value matches a sensitive-value pattern (tokens, keys,
 * credentials). Matches on the raw value, exactly as the sanitize layer does.
 */
export function containsSensitiveValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
}

/**
 * True when the text matches a prompt-injection pattern. The text is
 * canonicalized first so Unicode homoglyphs and zero-width characters cannot
 * evade the patterns.
 */
export function containsPromptInjection(text: string): boolean {
  const scanText = normalizeForSecurityScan(text)
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(scanText))
}

/**
 * True when the text contains a system-like instruction directive aimed at
 * the model ("you must respond…"). Canonicalized like containsPromptInjection.
 */
export function containsInstructionDirective(text: string): boolean {
  return INSTRUCTION_DIRECTIVE_PATTERN.test(normalizeForSecurityScan(text))
}
