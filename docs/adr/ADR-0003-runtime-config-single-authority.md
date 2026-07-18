# ADR-0003: requestRuntimeConfig is the only environment authority

- Status: Accepted (ratifies the existing design; extends it to close holes)
- Context: `resolveValidatedRequestRuntimeConfig()` already provides a frozen,
  fail-closed, capability-projected config where Cloudflare production rejects
  every dev capability (PR #164). But several modules still read env outside
  it: the CSRF origin allowlist is a module-scope constant with a localhost
  default and no deployment-config source (finding AUD-002 — a fresh
  production deploy would reject every browser write), and
  `resolveGitHubSource`/`approvalStoreResolver`/`providerConfig` use
  `process.env` default parameters (R-08).
- Decision: Every runtime-path configuration value — including the CSRF origin
  allowlist and provider/store mode selection — must be a projection of the
  request-scoped validated config. `ALLOWED_ORIGINS` becomes a validated,
  bounded config field sourced from the Cloudflare env (and added to deploy
  preflight checks). Module-scope env reads on runtime paths become a
  test-enforced violation.
- Consequences: CSRF behavior becomes deploy-configurable and testable
  per-request; the AUD-002 latent outage is closed structurally, not by adding
  one env var; dev-only default-parameter reads are re-homed or explicitly
  fenced as local-only seams.
