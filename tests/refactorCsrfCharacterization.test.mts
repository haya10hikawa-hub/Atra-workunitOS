/**
 * CSRF origin-allowlist characterization (Issue #176 / finding AUD-002).
 *
 * Pins the CURRENT (defective) behavior: `app/lib/security/csrfProtection.ts`
 * computes ALLOWED_ORIGINS once at module evaluation from `process.env` with a
 * `http://localhost:3000` default. Setting the env var AFTER the module loads
 * has NO effect — which is exactly why a production deployment (whose
 * wrangler.json vars carry no ALLOWED_ORIGINS at module-eval time) would
 * reject every legitimate browser write.
 *
 * The #176 fix (allowlist as a request-scoped runtime-config projection,
 * ADR-0003) must flip the "frozen after load" assertion in the same PR.
 */

import test from "node:test"
import assert from "node:assert/strict"

// Clear the inputs BEFORE the module evaluates, then load it dynamically so
// this file controls module-eval env regardless of runner environment.
delete process.env.ALLOWED_ORIGINS
delete process.env.NEXT_PUBLIC_APP_URL

const { validateCsrfOrigin } = await import("../app/lib/security/csrfProtection.ts")

function postWithOrigin(origin: string): Request {
  return new Request("http://localhost:3000/api/workunit/tools", {
    method: "POST",
    headers: { Origin: origin },
  })
}

test("with no env configured, only the localhost default origin passes", () => {
  assert.equal(validateCsrfOrigin(postWithOrigin("http://localhost:3000")).ok, true)
  const foreign = validateCsrfOrigin(postWithOrigin("https://app.example.com"))
  assert.equal(foreign.ok, false)
})

test("KNOWN DEFECT PIN (#176): allowlist is frozen after module load", () => {
  // Simulates configuration arriving after module evaluation — the situation
  // on the Cloudflare runtime, where wrangler vars are not present when the
  // module-scope constant is computed.
  process.env.ALLOWED_ORIGINS = "https://app.example.com"
  try {
    const result = validateCsrfOrigin(postWithOrigin("https://app.example.com"))
    assert.equal(
      result.ok,
      false,
      "csrfProtection now honors env changes after load — if #176 was fixed, replace this pin with request-scoped config assertions",
    )
  } finally {
    delete process.env.ALLOWED_ORIGINS
  }
})

test("missing Origin and Referer is rejected (fail-closed) — must be preserved by the #176 fix", () => {
  const request = new Request("http://localhost:3000/api/workunit/tools", { method: "POST" })
  assert.equal(validateCsrfOrigin(request).ok, false)
})
