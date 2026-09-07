# Phase 2B: First Real LLM Provider Adapter Entry Criteria

**Status:** Planning Only
**Live Provider Integration:** No-Go
**External Execution:** No-Go

This document defines the entry criteria that must be met before the first real LLM provider adapter can be implemented in a future PR.

## 1. Provider Selection

### First Provider Selection Criteria

The first provider should be the one that is:

- easiest to disable-by-default
- easiest to mock in tests
- easiest to budget and rate-limit
- easiest to redact
- easiest to audit
- lowest integration surface (fewest SDK deps)
- best support for deterministic test behavior
- lowest risk of accidental execution

### Provider Selection: Deferred

At this stage, no provider has been selected. The selection decision requires:

- completion of the Phase 2A boundary in main
- confirmed feature flag, kill switch, and tenant allowlist integration
- confirmed budget/audit infrastructure
- confirmed redaction policy implementation

Once these prerequisites are verified in production-like environments, the provider selection will be made as a separate decision document.

## 2. Runtime Environment Requirements

- `NODE_ENV` guarded — provider calls must be impossible in non-production-like environments
- Provider env vars (`API_KEY`, `BASE_URL`, etc.) must be gated by feature flag
- Secrets must use a secure secret manager; no plain-text env vars in production
- No provider SDK loaded until all Phase 2A boundary checks pass
- No network calls to provider APIs until all readiness gates clear

## 3. Secret Management Requirements

- Provider API keys must never appear in source code
- Provider API keys must never appear in commit history
- Provider API keys must be loaded via secret manager or encrypted env at runtime
- Secret rotation must be supported from day one
- No hardcoded fallback keys

## 4. Feature Flag Requirements

- Real LLM provider is **disabled by default**
- Feature flag name: `REAL_LLM_PROVIDER_ENABLED`
- Flag must be tenant-scoped
- Flag must be overrideable per environment
- Flag off = no provider SDK imports, no network calls

## 5. Kill Switch Requirements

- Global kill switch: `REAL_LLM_KILL_SWITCH`
- When closed, all provider calls must be blocked regardless of any other setting
- Kill switch must be checkable before any network call
- Kill switch must not be cacheable for more than 60 seconds

## 6. Tenant Allowlist Requirements

- Provider access is denied by default for all tenants
- Tenant allowlist: `REAL_LLM_TENANT_ALLOWLIST`
- Allowlist must be checkable without provider network access
- Tenants not on the allowlist must receive the same blocked behavior as disabled provider

## 7. Budget and Rate-Limit Requirements

- Budget policy: `REAL_LLM_BUDGET_LIMIT`
- Rate limit: `REAL_LLM_RATE_LIMIT`
- Budget must be enforced per tenant per time window
- Budget exhaustion must block provider calls
- Budget must never be negative
- Rate limits must be in place before any provider call
- Budget and rate-limit state must not rely on provider API responses

## 8. Redaction Requirements

- All Phase 2A forbidden context fields must be stripped before any provider request
- `approvalId`, `hash`, `tenantId`, `userId`, `role`, raw provider payloads must be blocked
- Redaction must be applied before serialization
- Redacted payloads must be logged for audit
- No raw provider payload may reach the provider adapter

## 9. Audit Requirements

- Every provider call attempt must be audited
- Audit must include: tenant, timestamp, request shape (redacted), blocked reason (if blocked), budget consumed (if called)
- Audit must be append-only
- Audit must be queryable for compliance review
- No provider call may occur without an audit record

## 10. Context Allowlist Requirements

- Only allowlisted LLM context fields may be sent to a provider
- Allowlist must be explicit and documented
- Any field not on the allowlist must be rejected before serialization
- Allowlist must be versioned and change-controlled

## 11. Forbidden Context Fields (Permanent)

These fields must never appear in any provider request, regardless of provider or adapter:

- `approvalId`
- `targetHash`
- `payloadHash`
- `tenantId`
- `userId`
- `approvedByUserId`
- `role`
- `tokens`
- `secrets`
- `rawPayload`
- `rawProviderPayload`

## 12. Provider Request Contract

- Requests must be structured with explicit route, node summary, and constraints
- Only `fast_extraction`, `draft_generation`, `critic_verification`, `deep_reasoning` routes allowed
- Constraints must include `externalExecutionBlocked: true`, `approvalRequired: true`, `humanReviewRequired: true`
- No executable code in requests
- No SQL, no mutation instructions, no tool-calling instructions

## 13. Provider Response Contract

- Responses must be treated as candidate suggestions, not executable actions
- No response field may be interpreted as a command
- No response may create a Formal Node, Approval, or Execution
- Responses must be logged in full (redacted) for audit
- Responses must be immutable after logging

## 14. Provider Output Safety Contract

- Provider output must never create a Formal Node
- Provider output must never create an Approval
- Provider output must never create an Execution
- Provider output must never trigger external execution
- Provider output must never bypass human review
- Provider output must never modify database state
- Provider output is advisory only — human must approve before any downstream action

## 15. Human Review Requirement

- Human review is mandatory before any provider-suggested action
- No auto-approve based on provider confidence
- No auto-merge based on provider suggestion
- No cache-based approval
- No vector-based merge finalization
- External execution remains disabled regardless of provider response

## 16. External Execution Disabled

- External execution is permanently disabled in this phase
- No provider response may enable external execution
- No feature flag may override this
- No tenant configuration may override this

## 17. Test Matrix for Future Adapter PR

When a real provider adapter is implemented, tests must prove:

- [ ] Provider is disabled by default (feature flag off)
- [ ] Provider is blocked when kill switch is closed
- [ ] Provider is blocked for non-allowlisted tenants
- [ ] Provider is blocked when budget is exhausted
- [ ] Provider is blocked when rate limit is hit
- [ ] Provider is blocked when redaction is not applied
- [ ] Provider is blocked when audit logging is disabled
- [ ] Provider is blocked when P0 scanner is disabled
- [ ] Provider is blocked for forbidden context fields
- [ ] Provider is blocked for non-allowlisted context keys
- [ ] Provider is blocked for raw provider payloads
- [ ] Provider is blocked when readiness gate returns No-Go
- [ ] Provider is blocked when implementation is missing
- [ ] Provider response cannot create Formal Node
- [ ] Provider response cannot create Approval
- [ ] Provider response cannot create Execution
- [ ] Provider SDK is not imported when feature flag is off
- [ ] No network calls are made when any block condition is active
- [ ] Secret manager is used for API keys
- [ ] Audit records are created for every call attempt
- [ ] Test doubles enable deterministic provider testing

## 18. Rollback Plan

- Provider adapter must be removable by reverting a single PR
- Feature flag must be toggleable without code deployment
- Kill switch must be activatable without code deployment
- No provider-dependent state in database
- All provider output is advisory-only and can be discarded

## 19. Future Adapter PR Go / No-Go Checklist

Before a future adapter PR can be opened:

- [ ] Phase 2A boundary is merged to main
- [ ] Phase 2B entry criteria document is merged and approved
- [ ] Provider selection document is approved
- [ ] Secret management infrastructure is operational
- [ ] Feature flag infrastructure is operational
- [ ] Kill switch infrastructure is operational
- [ ] Tenant allowlist infrastructure is operational
- [ ] Budget/rate-limit infrastructure is operational
- [ ] Redaction infrastructure is operational (Phase 1E + 2A)
- [ ] Audit infrastructure is operational
- [ ] P0 exclusion scanner is operational
- [ ] Test matrix defined
- [ ] Rollback plan documented
- [ ] All safety evaluators return Go

## 20. Live Provider Integration Status

**Live Real LLM Provider Integration: No-Go**

This document does not authorize any live provider integration. All provider calls remain blocked. All provider SDK imports remain prohibited. External execution remains disabled.

