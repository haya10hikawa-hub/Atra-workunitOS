import type { DoneConditionDraft, DoneConditionStatus, DecompositionInput } from "./types.ts"
import { containsForbiddenContextText, isForbiddenContextKey } from "../safety/p0Policy.ts"

export function buildDoneConditionDraft(input: DecompositionInput): DoneConditionDraft {
  const outcome = normalize(input.outcome) || inferOutcome(input.text)
  const verifier = normalize(input.verifier) || inferVerifier(input.text)
  const acceptanceCriteria = normalizeCriteria(input.acceptanceCriteria) ?? inferCriteria(input.text)
  const draft: DoneConditionDraft = {
    outcome,
    verifier,
    acceptanceCriteria,
    sourceRef: input.sourceRef,
    humanInputRef: input.humanInputRef,
    missingFields: [],
    status: "partial",
    invalidReasons: [],
    riskFlags: input.riskFlags ?? [],
    candidateOnly: true,
  }
  const status = evaluateDoneConditionDraft(draft, input.context)
  return { ...draft, missingFields: status.missingFields, invalidReasons: status.invalidReasons, status: status.status }
}

export function evaluateDoneConditionDraft(
  input: DoneConditionDraft,
  context?: Record<string, unknown>,
): DoneConditionStatus {
  // Completion presence is decided on NORMALIZED values so a malformed runtime
  // draft cannot satisfy a requirement with blank content. A field is present
  // only when it carries a nonblank string (outcome, verifier), at least one
  // nonblank observable criterion, or a canonical evidence anchor (a sourceRef
  // with nonblank source + externalId, or a nonblank humanInputRef). Whitespace,
  // empty arrays/strings, and empty/blank runtime objects are all "missing".
  // Values are never rewritten here — this is presence checking only.
  const missingFields = [
    isNonBlankString(input.outcome) ? null : "outcome",
    isNonBlankString(input.verifier) ? null : "verifier",
    hasUsableAcceptanceCriterion(input.acceptanceCriteria) ? null : "acceptanceCriteria",
    hasSourceRefAnchor(input.sourceRef) || isNonBlankString(input.humanInputRef)
      ? null
      : "sourceRefOrHumanInputRef",
  ].filter((field): field is string => Boolean(field))

  const invalidReasons = [
    isNonBlankString(input.verifier) && isAiVerifier(input.verifier) ? "ai_verifier_forbidden" : null,
    containsForbiddenContextField(context) ? "forbidden_context_field_present" : null,
    containsExternalExecutionPayload(context) ? "external_execution_payload_present" : null,
  ].filter((reason): reason is string => Boolean(reason))

  const status: DoneConditionStatus["status"] = invalidReasons.length > 0
    ? "invalid"
    : missingFields.length === 0
      ? "complete"
      : "partial"

  return {
    status,
    validForFormalCandidate: status === "complete",
    missingFields,
    invalidReasons,
  }
}

export function containsForbiddenContextField(value: unknown): boolean {
  return findForbiddenContextKeys(value).length > 0
}

export function findForbiddenContextKeys(value: unknown): string[] {
  const found = new Set<string>()
  scan(value, found)
  return [...found].sort()
}

export function containsExternalExecutionPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const keys = findForbiddenContextKeys(value)
  return keys.includes("externalExecutionPayload") || keys.includes("sendableBody") || keys.includes("approvedOutboundBody") || keys.includes("dbUpdatePayload")
}

export function isAiVerifier(verifier: string): boolean {
  return /^(ai|llm|model|system|assistant)$/i.test(verifier.trim())
}

// ── Canonical presence predicates ───────────────────────────────────────────
// Shared by the single completion authority above. Each accepts `unknown` so a
// runtime-malformed draft (non-string field, non-array criteria, empty/blank
// object anchor) is classified deterministically as "missing" instead of
// throwing or being accepted. None of these mutate, filter, or rewrite input.

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

// Present when at least one observable, nonblank criterion exists. The input
// array is inspected with `.some` only — never mutated, filtered, or replaced.
function hasUsableAcceptanceCriterion(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => isNonBlankString(item))
}

// A source-reference anchor requires, at minimum, a nonblank `source` and a
// nonblank `externalId`. No URL parsing/allowlisting is performed here: URL
// safety stays in the formation layer's separate SourceRef handling, and the
// decomposition gate must not depend on the later formation layer.
function hasSourceRefAnchor(ref: unknown): boolean {
  if (ref === null || typeof ref !== "object") return false
  const candidate = ref as { readonly source?: unknown; readonly externalId?: unknown }
  return isNonBlankString(candidate.source) && isNonBlankString(candidate.externalId)
}

function scan(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    if (containsForbiddenContextText(value)) found.add("$value")
    return
  }
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const item of value) scan(item, found)
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenContextKey(key)) {
      found.add(key)
    }
    scan(nested, found)
  }
}

function normalize(value: string | undefined): string {
  return value?.trim() ?? ""
}

function normalizeCriteria(value: readonly string[] | undefined): readonly string[] | null {
  if (!value) return null
  return value.map((item) => item.trim()).filter(Boolean)
}

function inferOutcome(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ""
  if (/ありがとう|了解|thanks/i.test(trimmed)) return ""
  if (/log|ログ|PDF|URL/i.test(trimmed) && !/分析|作る|メモ|返信|回答/.test(trimmed)) return ""
  if (/メモ|一覧|返信案|正式回答|調査|修正要否/.test(trimmed)) return trimmed
  return ""
}

function inferVerifier(text: string): string {
  if (/PM|pm|顧客|法務/.test(text)) return "human_owner"
  return ""
}

function inferCriteria(text: string): readonly string[] {
  if (/メモ|一覧|返信案|正式回答|調査|修正要否/.test(text)) return ["Human reviewer can verify the outcome."]
  return []
}
