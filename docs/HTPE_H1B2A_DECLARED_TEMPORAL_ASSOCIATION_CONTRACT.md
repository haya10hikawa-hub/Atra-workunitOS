# HTPE H1B2A Declared Reference Temporal Association Contract

**Status:** SHADOW ONLY. CANDIDATE ONLY. **Authority:** NONE. **Production consumer:** NONE.
**Persistence:** NONE — not authorized.

Module `app/lib/phase6/temporalAssociation/` (`types.ts`, `evaluate.ts`); permanent tests
`tests/phase6TemporalAssociation.test.mts`; predecessors
`docs/HTPE_H1B1_REVISION_REFERENCE_CONTRACT.md` and `docs/HTPE_H1A_TEMPORAL_CONTRACT.md`;
upstream vocabulary H0 `docs/PROVENANCE_CLAIM_CONTRACT.md`, unchanged by H1B2A.

## 1. What a declared association means

> A declared association means only that the caller supplied one accepted declared-reference
> descriptor and one accepted temporal observation together through two exact named fields. It
> is not a ClaimBinding and establishes no identity authority.

That is the whole positive semantic. Putting two values in one object is a caller
**declaration**: not evidence that the observation is *about* the referenced subject, and not a
binding basis.

## 2. Five distinct things, never merged

| Level | Owner | Established here |
| --- | --- | --- |
| Caller declaration — two named fields arrived in one input object | the caller | **YES — this and nothing more** |
| Reference acceptance — captured values met H1B1's reference and basis rules | H1B1 | YES, scoped to this call |
| Temporal acceptance — captured values met H1A's instant, interval and ordering rules | H1A | YES, scoped to this call |
| Process-local composition — this module obtained both acceptances in this process | this module | YES |
| Authoritative ClaimBinding — an immutable attachment of one claim revision to one temporal target on a reviewed basis | **nobody — does not exist** | **NO** |

Acceptance is a property of **this call**, never of the reference or the observation: it does not
persist, does not transfer to another call, and confers no status on any value.

## 3. What this contract does NOT establish

Subject identity; logical-claim identity; logical-claim continuity; immutable revision identity;
ClaimBinding; Temporal ClaimBinding; transition; correction; supersession; truth; authority;
conflict; latest or preferred source; persistence eligibility; PR #211 authority — each a
constant `not_established` or `none` literal in every success.

`same_declared_ref` is never emitted and never read as *same subject*, *same claim*, *same
revision* or *verified revision*. Both H1B1 sides are detached copies of the same captured
values, so its three relations are constant **by construction**: they carry no information and
serve only as a self-signature.

## 4. Input, ownership and detached self-pair construction

```
{ declaredReference:   { subjectRef, logicalClaimRef, revisionRef, identityBasis }
  temporalObservation: { validFrom, validTo, observedAt, recordedAt } }
```

H1B2A owns **only the hostile transport boundary**: exact own-key allowlists at the top level and
in both nested objects; inherited fields rejected; symbol own keys rejected; unknown own keys
rejected **by name before any value behind them is read**; required own fields present; each
accepted caller property read **exactly once** in a fixed order; caller exceptions and Proxy trap
failures contained. It owns **no semantic validation**: reference syntax and the declared basis
stay H1B1's; canonical instants, null semantics, `validFrom <= validTo` and `recordedAt >=
observedAt` stay H1A's. No instant pattern, interval rule or reference rule exists here, and no
clock is read.

A caller-owned object is **never** passed to a predecessor, and never passed twice. After the
one-read capture the module builds **two distinct plain frozen records per predecessor** and
passes only those: distinct by object identity; no getter; no Proxy; no caller prototype; no
alias to the caller's object; exactly the predecessor-required own keys; values copied exactly —
nothing trimmed, normalized, coerced or defaulted; frozen before any predecessor sees them.
Passing one caller object as both sides would read every property twice and let a hostile
accessor diverge between the sides; here divergence is impossible.

## 5. Temporal boundary status

The only input-varying output is `temporalBoundaryStatus`: `fully_bounded` when H1A returned
`same_interval` for the detached pair, `boundary_unknown` when H1A returned `unresolved`.

**`null` means unknown.** Never open, current, ongoing, still valid, unbounded, infinity or
beginning/end of time; nothing may resolve it. Captured nullness is inspected for exactly one
purpose — stating which verdict H1A must have returned — and the status is derived from H1A's
verdict, not from a boundary test of this module's. No boundary value reaches the output.

## 6. Output contract

A frozen success carries `declaredAssociation: "caller_declared_named_field_co_submission"`,
`associationAuthority: "declaration_only"`, `processLocalComposition: "established"`,
`referenceContractCheck` and `temporalContractCheck: "accepted_for_this_call"`,
`temporalBoundaryStatus`, `identityAuthority: "none"`, `basisVerifiedHere: false`, constant
`not_established` for `immutableRevisionIdentity`, `logicalClaimContinuity`, `claimBinding`,
`temporalClaimBinding`, `transitionEvidence`, `correctionRelation` and `supersessionOrder`, plus
deterministic `reasonCodes` and a constant `narrative`. No output carries a reference value, the
declared basis, a timestamp or boundary, a provider or actor datum, claim content, a URL, a
number or bigint, a digest, count, index, score, confidence or rank, a truth or conflict verdict,
a latest or preferred result, approval or execution data, or any predecessor result or snapshot.
Narratives are closed constant sentences with no interpolation.

## 7. Failure model and evaluation precedence

Closed, value-free vocabulary: `invalid_input`, `input_unreadable`, `unknown_field`,
`missing_field`, `reference_contract_rejected`, `temporal_contract_rejected`,
`predecessor_attestation_rejected`, `predecessor_signature_mismatch`, `attestation_rejected`.
A predecessor's own failure code is **never** forwarded: every H1B1 rejection collapses to
`reference_contract_rejected`, every H1A rejection to `temporal_contract_rejected`. No caller key
name, caller value or caller exception text is ever echoed. When an input is invalid at more than
one step the **earlier** step decides; the complete cross-invalid matrix is pinned by permanent
test.

| | Step | | Step |
| --- | --- | --- | --- |
| 1 | top-level readability and own-key validation | 8 | H1B1 exact-pair attestation |
| 2 | top-level required-field capture | 9 | H1B1 self-signature |
| 3 | `declaredReference` readability and own-key validation | 10 | H1A evaluation |
| 4 | `declaredReference` required-field capture | 11 | H1A exact-pair attestation |
| 5 | `temporalObservation` readability and own-key validation | 12 | H1A self-signature |
| 6 | `temporalObservation` required-field capture | 13 | success construction and attestation registration |
| 7 | H1B1 evaluation | | |

## 8. Attestation

`snapshotValidatedDeclaredReferenceTemporalAssociation(result, input)` returns a detached inert
snapshot only for the exact success object this module produced, presented with the exact
top-level input it came from, bound through a module-private `WeakMap`. Spread clone, JSON clone,
`structuredClone`, `Object.create` wrapper, ordinary Proxy, revoked Proxy, forged look-alike,
failure result, cloned input, structurally equal input, another genuine input, another genuine
result, cross-input replay and cross-call replay are all rejected with one value-free code.
Snapshots are frozen, never alias, and are unaffected by later mutation of the caller's input or
public output. A snapshot proves only: **this module produced this declared-association result
for this exact input object in this process after its predecessor checks succeeded.** It proves
no ClaimBinding and no identity authority.

## 9. Dependency and consumer boundary

`types.ts` imports exactly `../revisionReference/types.ts` and `../temporalContract/types.ts`
(type-only); `evaluate.ts` imports exactly `./types.ts`, `../revisionReference/evaluate.ts` and
`../temporalContract/evaluate.ts`. No predecessor symbol is re-exported. Forbidden:
`canonicalIdentity`, `identityIndependence`, formation, provider modules, persistence, database,
authorization or approval, ranking, LLM or model code, network, filesystem, crypto or digest
helpers, environment configuration, PR #211 modules. No clock, randomness, I/O or persistence.

**Production consumer: NONE** — the only consumer is this module's own permanent test. Pinned
repository-wide by a resolved consumer graph over every tracked executable source file, covering
static import, `import type`, export-from, dynamic `import()` and `require()`; non-literal
(computed or concatenated) specifiers fail closed with zero exceptions; prose mentions and
comments are not imports.

## 10. Predecessor consumer transition

H1A and H1B1 previously had **no internal source consumer**. This slice transitions each to
**exactly one reviewed internal module consumer**: `app/lib/phase6/temporalAssociation/types.ts`
and `app/lib/phase6/temporalAssociation/evaluate.ts`. No route, UI, provider, formation,
persistence, ranking, candidate-pipeline or external integration consumer is authorized, for
either predecessor or for H1B2A. Predecessor authority is **unchanged**: H1B2A consumes but does
not reinterpret, adds no rule, removes none, rewrites no predecessor semantics. Their
**production pipeline consumer remains NONE** and their **persistence remains NONE**. Their
guards are narrowed and strengthened — from "zero occurrences anywhere" to "zero occurrences
outside exactly these named files, whose import sets are pinned exactly" — never deleted.

## 11. Out of scope

Temporal ClaimBinding and every binding kind; binding-target selection; immutable revision
identity; logical-claim continuity; `claimId`; canonical serialization and digest schemes;
`subjectRef` via `canonicalObjectKey`; predicate vocabulary; `absent-open` semantics; typed
transition events; supersession evidence and provider ordering policy; correction chains; replay;
point-in-time projection; conflict integration; a standalone temporal-observation validator;
persistence; any production consumer; and **H1B3, H2, F6B and F7** — all deferred.

**PR #211 is unmerged non-authority and is not authorized by this contract.** It is not a
dependency of H1B2A, was not modified by it, and nothing here consumes or enables it.

## 12. Review requirements

This contract carries no authority until a separate-session security and repository architecture
review of the exact head, followed by human ratification. Next owner:
`HTPE_H1B2A_SEPARATE_SESSION_SECURITY_AND_REPOSITORY_ARCHITECTURE_REVIEWER`. The implementer
session is permanently disqualified from independently reviewing this head and from merging it.
