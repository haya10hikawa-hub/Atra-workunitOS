/**
 * Shared CSRF allowed-origin test vectors (WS2-PR1, #176).
 *
 * Used by BOTH the runtime-config validator test (requestRuntimeConfig.test.mts)
 * and the deploy-config validator test (cloudflareDeployConfig.test.mts) so the
 * two independently-implemented validators stay semantically aligned. Not a
 * `*.test.mts`, so the runner never executes it directly.
 */

export const ALLOWED_ORIGIN_VECTORS = {
  valid: [
    { raw: "https://app.example.com", origins: ["https://app.example.com"] },
    { raw: "https://a.example.com, https://b.example.com", origins: ["https://a.example.com", "https://b.example.com"] },
    { raw: "https://a.example.com, https://a.example.com", origins: ["https://a.example.com"] }, // dedup
    { raw: "http://localhost:3000", origins: ["http://localhost:3000"] },
  ],
  // Each rejected by BOTH validators (safe category only, value never echoed).
  malformed: [
    "*",
    "https://a.example.com/*",
    "https://a.example.com/path",
    "https://a.example.com?q=1",
    "https://a.example.com#f",
    "https://user:pass@a.example.com",
    "ftp://a.example.com",
    "not a url",
    ",",
    "https://a.example.com,",
    Array.from({ length: 17 }, (_, i) => `https://h${i}.example.com`).join(","), // > 16
    "https://" + "a".repeat(600) + ".example.com", // > 512 per-origin
  ],
} as const
