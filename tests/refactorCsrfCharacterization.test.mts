/**
 * CSRF origin-allowlist characterization (Issue #176 / finding AUD-002).
 *
 * Pins the CURRENT (defective) behavior of app/lib/security/csrfProtection.ts:
 * ALLOWED_ORIGINS is computed ONCE at module evaluation from process.env with a
 * `http://localhost:3000` default. A `process.env` change AFTER the module
 * loads has NO effect — which is exactly why a production deployment (whose
 * origins are not present in process.env at module-eval time) would reject
 * every legitimate browser write.
 *
 * Determinism: we drive module-eval env ourselves and load a FRESH module
 * instance via a cache-busted URL, so the result is independent of test-file
 * order and of any prior import of this module in the process. Prior env values
 * are saved and restored.
 *
 * The #176 fix (allowlist as a request-scoped runtime-config projection,
 * ADR-0003) must flip the "frozen after load" pin in the same PR.
 */

import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"

const MODULE_PATH = path.resolve(import.meta.dirname, "..", "app", "lib", "security", "csrfProtection.ts")

type CsrfModule = typeof import("../app/lib/security/csrfProtection.ts")

/** Load a fresh instance of the module with process.env frozen to `env` at load
 *  time. Restores the prior env after evaluation. */
async function loadWithEnv(env: { ALLOWED_ORIGINS?: string; NEXT_PUBLIC_APP_URL?: string }): Promise<CsrfModule> {
  const priorAllowed = process.env.ALLOWED_ORIGINS
  const priorAppUrl = process.env.NEXT_PUBLIC_APP_URL
  try {
    if (env.ALLOWED_ORIGINS === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
    if (env.NEXT_PUBLIC_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL
    const url = `${pathToFileURL(MODULE_PATH).href}?csrf-char=${Math.random().toString(36).slice(2)}`
    return (await import(url)) as CsrfModule
  } finally {
    if (priorAllowed === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = priorAllowed
    if (priorAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = priorAppUrl
  }
}

function postWithOrigin(origin: string): Request {
  return new Request("http://localhost:3000/api/workunit/tools", { method: "POST", headers: { Origin: origin } })
}

test("with no origin env configured, only the localhost default passes", async () => {
  const mod = await loadWithEnv({})
  assert.equal(mod.validateCsrfOrigin(postWithOrigin("http://localhost:3000")).ok, true)
  assert.equal(mod.validateCsrfOrigin(postWithOrigin("https://app.example.com")).ok, false)
})

test("the allowlist reflects the env present AT MODULE LOAD", async () => {
  const mod = await loadWithEnv({ ALLOWED_ORIGINS: "https://app.example.com" })
  assert.equal(mod.validateCsrfOrigin(postWithOrigin("https://app.example.com")).ok, true)
  assert.equal(mod.validateCsrfOrigin(postWithOrigin("http://localhost:3000")).ok, false)
})

test("KNOWN DEFECT PIN (#176): the allowlist is frozen after module load", async () => {
  // Load with the localhost default only.
  const mod = await loadWithEnv({})
  // Configuration arriving AFTER evaluation (the Cloudflare-deploy situation).
  const prior = process.env.ALLOWED_ORIGINS
  process.env.ALLOWED_ORIGINS = "https://app.example.com"
  try {
    const result = mod.validateCsrfOrigin(postWithOrigin("https://app.example.com"))
    assert.equal(
      result.ok,
      false,
      "csrfProtection now honors env set after load — if #176 was fixed, replace this pin with request-scoped config assertions",
    )
  } finally {
    if (prior === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = prior
  }
})

test("missing Origin AND Referer is rejected (fail-closed) — the #176 fix must preserve this", async () => {
  const mod = await loadWithEnv({})
  assert.equal(mod.validateCsrfOrigin(new Request("http://localhost:3000/api/workunit/tools", { method: "POST" })).ok, false)
})
