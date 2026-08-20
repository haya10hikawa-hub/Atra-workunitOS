/**
 * The repository's ONE production-owned HTTP method classifier.
 *
 * WHY IT EXISTS
 *   The request composition root selects which capabilities a request-scoped
 *   dependency object carries. "May this request bootstrap a dev workspace?" is
 *   a question about the request METHOD, so the method has to be classified
 *   somewhere that production code owns. Before this module the only safe/unsafe
 *   vocabulary in the repository lived in `tests/helpers/routeSurface.ts`, and a
 *   test helper may not be imported by production.
 *
 * WHY IT IS NOT A ROUTE-LEVEL DECISION
 *   A per-route `requireSafeSession()` / `requireWritableSession()` split would
 *   make correctness depend on every current and future handler author picking
 *   the right entry point. This classifier is consumed by the composition root
 *   instead, so a new `GET` route that goes through the normal entry point is
 *   protected without its author knowing this rule exists.
 *
 * FAIL-CLOSED
 *   Classification is exact-token, case-sensitive, over the two closed sets. An
 *   unrecognized token — an unsupported verb, a lowercase or mixed-case spelling
 *   that a Web `Request` did not normalize, a synthetic method — is `"unknown"`,
 *   which is NOT bootstrap-capable. Widening authority requires an exact match
 *   against `UNSAFE_HTTP_METHODS`, never the absence of a match against the safe
 *   set.
 *
 * This module imports nothing. It is pure, has no mutable state, and its two
 * frozen sets are the single source of the vocabulary — `tests/helpers/routeSurface.ts`
 * keeps its own copy for test-side independence, and a ratchet pins the two equal.
 */

/** The RFC 9110 safe methods this repository serves. */
export const SAFE_HTTP_METHODS = Object.freeze(["GET", "HEAD", "OPTIONS"] as const)

/** The mutation methods this repository serves. */
export const UNSAFE_HTTP_METHODS = Object.freeze(["POST", "PUT", "PATCH", "DELETE"] as const)

export type SafeHttpMethod = typeof SAFE_HTTP_METHODS[number]
export type UnsafeHttpMethod = typeof UNSAFE_HTTP_METHODS[number]

/**
 * `"unknown"` is a THIRD outcome, not a synonym for either side. Collapsing it
 * into `"unsafe"` would hand bootstrap authority to an unrecognized verb;
 * collapsing it into `"safe"` would silently admit one to a read path. Callers
 * that grant a capability must test for the exact classification they need.
 */
export type RequestMethodClass = "safe" | "unsafe" | "unknown"

const SAFE: ReadonlySet<string> = new Set<string>(SAFE_HTTP_METHODS)
const UNSAFE: ReadonlySet<string> = new Set<string>(UNSAFE_HTTP_METHODS)

/**
 * Classify a raw HTTP method token. No normalization is performed: `"get"` is
 * `"unknown"`, not `"safe"`. A Web `Request` already uppercases every method in
 * its own known set, so a non-uppercase token reaching here did not come from
 * normal request construction and must not be interpreted charitably.
 */
export function classifyRequestMethod(method: string): RequestMethodClass {
  if (SAFE.has(method)) return "safe"
  if (UNSAFE.has(method)) return "unsafe"
  return "unknown"
}

/**
 * The single predicate the composition root uses to decide whether a request may
 * receive the durable dev-workspace bootstrap capability.
 *
 * The argument is the `Request` itself rather than a method string, so no caller
 * can pass a method that differs from the one the request actually carries. A
 * header, query parameter or body field cannot reach `Request.method`, and the
 * framework populates it from the request line.
 */
export function mayCarryDurableSessionWriteCapability(request: Request): boolean {
  return classifyRequestMethod(request.method) === "unsafe"
}
