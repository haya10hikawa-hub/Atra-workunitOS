# HTPE H1B1 Declared Revision Reference Relation Contract

**Status:** SHADOW ONLY. CANDIDATE ONLY. **Authority:** NONE. **Production consumer:** NONE.
**Persistence:** NONE — not authorized.

Module: `app/lib/phase6/revisionReference/` (`types.ts`, `evaluate.ts`).
Permanent tests: `tests/phase6RevisionReference.test.mts`.
Upstream contract: H0 `docs/PROVENANCE_CLAIM_CONTRACT.md`.

## 1. What this contract establishes

> `same_declared_ref` means only that the two validated opaque strings are byte-for-byte
> identical. It does not establish that they identify the same real-world entity, claim or
> immutable revision.

That sentence is the whole of it. The module decides three questions and no others:

- are the two declared **subject** references byte-for-byte identical?
- are the two declared **logical-claim** references byte-for-byte identical?
- are the two declared **revision** references byte-for-byte identical?

## 2. What this contract does NOT establish

Nothing in an H1B1 result may be read as evidence of any of the following. Each is reported
as a constant literal that no input can change.

- `identityAuthority` is always `none`; `basisVerifiedHere` is always `false`;
  `referenceEqualityOnly` is always `true`.
- `immutableRevisionIdentity`, `logicalClaimContinuity`, `claimBinding`, `transitionEvidence`,
  `supersessionOrder` and `correctionRelation` are always `not_established`.

Also **not** established, and not representable in the output vocabulary at all: that a
reference denotes a real object; subject identity; truth of either represented proposition;
authority; conflict; and any latest or preferred source. This slice supersedes the wording of
the H1B architecture decision report where that report describes the slice as *immutable
revision identity*, `same_revision` or `distinct_revision`.

## 3. Input contract

```
evaluateDeclaredRevisionReferenceRelation(input: unknown)

{ left: Descriptor, right: Descriptor }
Descriptor = {
  subjectRef: string
  logicalClaimRef: string
  revisionRef: string
  identityBasis: "declared_opaque_ref"
}
```

Exact own-key allowlists at both levels; unknown own keys — string or symbol — are rejected
**by name**, before any value of theirs is read. Every allowed property is read exactly once,
in fixed key order. Inherited fields do not satisfy a requirement. No temporal field, no
provider, no actor, no payload, no identifier minted by this module.

Each reference must be a **primitive** string of one to one hundred twenty-eight ASCII
base64url-compatible characters (`A–Z`, `a–z`, `0–9`, `_`, `-`). References are **case
sensitive** and are accepted **exactly as supplied**: never trimmed, never normalized, never
decoded, and never interpreted as a timestamp, URL, provider id, digest or content.

Only **corresponding** fields are compared. `left.subjectRef === right.logicalClaimRef` has no
effect on any output.

## 4. Identity basis

`declared_opaque_ref` is the only accepted value, and accepting it asserts nothing: the
declaration is never verified here, which is why every success reports
`basisVerifiedHere: false`.

Declaring any of these fails closed with `forbidden_identity_basis`:
`source_object_id`, `provider_object_id`, `provider_revision_id`, `provider_name`, `title`,
`summary`, `url`, `actor`, `display_name`, `latest_timestamp`, `observed_at`, `recorded_at`,
`array_position`, `semantic_similarity`, `llm_inference`.

Any other value — including a non-string and a boxed `String` — fails closed with
`unsupported_identity_basis`. There is no fallback.

## 5. Output contract

Relation vocabulary: `same_declared_ref` | `different_declared_ref`. The forms `same_subject`,
`same_claim`, `same_revision`, `identical_revision`, `verified_identity`, `canonical_identity`
and `authoritative_identity` are absent by construction.

A success carries the constants of §2, the three relations, a deterministic `reasonCodes` list
(subject, logical claim, revision, then the seven constant non-authority codes in fixed order)
and a `narrative` of closed constant sentences with **no interpolation**. It carries no
reference value, no declared basis, no timestamp, no provider or actor datum, no claim content,
no URL, no numeric value, no digest, no confidence, no ranking, no authority grant and no
execution or approval datum. Results and their arrays are frozen.

## 6. Failure model

Closed and value-free: `invalid_input`, `input_unreadable`, `unknown_field`, `missing_field`,
`invalid_reference`, `forbidden_identity_basis`, `unsupported_identity_basis`,
`attestation_rejected`. A failure is exactly `{ ok: false, failureCode }` — no key name, no
value, no exception text. No caller exception escapes; Proxy traps and accessors that throw
fail closed.

## 7. Attestation

`snapshotValidatedDeclaredRevisionReferenceRelation(result, input)` returns a detached frozen
snapshot only for the exact success object this module produced **and** the exact top-level
input object it was produced from, matched through a module-private `WeakMap`. Spread clones,
JSON clones, `structuredClone`, `Object.create` wrappers, Proxy and revoked-Proxy wrappers,
forged look-alikes, failure results, cloned or structurally equal inputs, cross-input replays
and results from another genuine call are all rejected with `attestation_rejected`. Snapshots
never alias and are unaffected by later mutation of the public result or the input.

A snapshot proves only that this module produced that relation for that exact input object. It
proves **no identity authority**.

## 8. Dependency and consumer boundary

`evaluate.ts` imports only `./types.ts`; `types.ts` imports nothing. Forbidden: the H1A
temporal contract, `canonicalIdentity` (which owns authenticated human actor identity and is
neither imported, wrapped, renamed nor generalized here), `identityIndependence`, formation,
provider modules, persistence, database, runtime authorization, approval, ranking, LLM or model
code, network clients, and crypto or digest helpers. No clock, no randomness, no filesystem, no
network, no environment-variable access, no persistence.

**Production consumer: NONE.** Pinned repository-wide over tracked source files against static
import, export-from, dynamic `import()`, `require()` and bare paths, together with an exact
module-surface assertion that also catches a same-directory sibling.

## 9. Out of scope

Temporal ClaimBinding, typed transition evidence, supersession evidence, correction chains,
replay, projection, provider ordering policy, conflict integration, identity minting, digest
schemes, canonicalization versioning and deletion representation are **all deferred**. H1B1
exposes nothing to F6B and authorizes no later slice.
