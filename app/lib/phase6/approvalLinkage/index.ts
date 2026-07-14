/**
 * P6-FIX-011: public surface for the Phase 6 Approval Chain Linkage module
 * (Issue #144, docs/APPROVAL_CHAIN_LINKAGE_CONTRACT.md).
 *
 * Re-exports the inert types + pinned hash constants (./types.ts), the single
 * canonical issue-code list plus validation plumbing and the structural
 * validator (./validation.ts), the canonical hash-domain builders
 * (./canonical.ts), the pure constructor (./constructors.ts), the pure verifier
 * (./verifier.ts), and the redacted audit projection (./audit.ts).
 *
 * `./sourceEvaluation.ts` is deliberately NOT re-exported — it is module-private
 * shared evaluation used only by the constructor and verifier.
 *
 * Dependency direction: artifacts / reviewEvidence / canonicalIdentity →
 * identityIndependence / security-hash-leaf → approvalLinkage. This module
 * imports NO API route, ApprovalStore, resolver, adapter, persistence
 * repository, D1 binding, runtime audit logger, external action executor,
 * provider client, OAuth/token, Electron, or UI code, and it does NOT import
 * the P7.1 approvalMac MAC module.
 *
 * An ApprovalLinkageRecord is immutable non-authorizing historical evidence.
 * Constructing or verifying a linkage is not approval, not ApprovalStore
 * approval, not runtime authorization, and not execution permission. Runtime
 * wiring and the atomic immediately-before-use claim belong to Issue #145.
 * AI proposes. Rules guard. Humans decide.
 */

export * from "./types.ts"
export * from "./validation.ts"
export * from "./canonical.ts"
export * from "./constructors.ts"
export * from "./verifier.ts"
export * from "./audit.ts"
