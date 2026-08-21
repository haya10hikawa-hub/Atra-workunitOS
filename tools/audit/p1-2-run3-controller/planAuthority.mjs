/**
 * Content-free Run-3 plan-authority verifier.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * PRODUCTION SEALING: `verifySealedPlanAuthority` is the only function any
 * production caller (the Run-3 preflight) may use. Its signature is exactly
 * `{planBuffer, sidecarBuffer}` — there is no `expectedSha256` (or any other
 * caller-supplied "what counts as authoritative" value) anywhere on that
 * path. The pinned commitment (`PLAN_AUTHORITY_SHA256`,
 * `PLAN_AUTHORITY_BYTE_LENGTH`) is a module-level constant, ratified out of
 * band; a caller who controls both a corrupted plan buffer and a "matching"
 * expected hash can no longer make a corrupted plan verify, because there is
 * no parameter through which to supply that expected hash.
 *
 * A plan document's own bytes must match the pinned hash and pinned byte
 * length exactly, AND an independent sidecar file (`RUN3_PREREGISTRATION.sha256`)
 * must itself commit to the same pinned hash. Requiring both closes the
 * "attacker controls the plan and updates a self-consistent sidecar to
 * match" attack: the sidecar's own claimed hash is checked against the fixed
 * pinned constant, not against whatever the (possibly corrupted) plan
 * buffer actually hashes to.
 *
 * CONTENT-FREE BY CONSTRUCTION: no function in this module returns, logs, or
 * throws the plan bytes or any substring of them. The only values that ever
 * cross back to a caller are booleans, hex digests, and byte counts.
 *
 * @module p1-2-run3-controller/planAuthority
 */

import crypto from 'node:crypto';

/**
 * The Run-3 plan-authority commitment, ratified out of band. This is the
 * *only* accepted value; there is no fallback to an older or alternate hash.
 */
export const PLAN_AUTHORITY_SHA256 = '8b8bd19df7369a28ebb410c93dee8ed5cdf0085ce46d8a3f01c395396a837b9c';

/** The exact byte size the ratified plan document must be. */
export const PLAN_AUTHORITY_BYTE_LENGTH = 13067;

const SIDECAR_HASH_RE = /^([A-Fa-f0-9]{64})\b/;

export class PlanAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PlanAuthorityError';
    this.code = code;
  }
}

/**
 * Splits `buffer` at the first occurrence of `boundaryMarker` (a UTF-8
 * string) and returns the canonical prefix — everything strictly before the
 * marker. If the marker never occurs, the whole buffer is the canonical
 * prefix. Retained as a general-purpose utility and for the test-only
 * trailer-stripping verifier below; the production sealed verifier does not
 * use this — a sealed plan document has no appended trailer to strip.
 *
 * @param {Buffer} buffer
 * @param {string} boundaryMarker
 * @returns {{ prefix: Buffer, sha256: string, length: number }}
 */
export function canonicalPrefix(buffer, boundaryMarker) {
  if (!Buffer.isBuffer(buffer)) throw new PlanAuthorityError('plan_authority_buffer_invalid');
  if (typeof boundaryMarker !== 'string' || boundaryMarker.length === 0) {
    throw new PlanAuthorityError('plan_authority_boundary_marker_invalid');
  }
  const markerBytes = Buffer.from(boundaryMarker, 'utf8');
  const idx = buffer.indexOf(markerBytes);
  const prefix = idx === -1 ? buffer : buffer.subarray(0, idx);
  const sha256 = crypto.createHash('sha256').update(prefix).digest('hex');
  return { prefix, sha256, length: prefix.length };
}

/**
 * TEST-ONLY. Verifies a plan document's canonical-prefix hash against a
 * caller-supplied expected commitment. This is deliberately NOT part of the
 * production verification path — a function that accepts an
 * `expectedSha256` from its caller can be handed a corrupted plan and a
 * matching hash together, which is exactly the gap `verifySealedPlanAuthority`
 * closes. Never imported by `preflight.mjs`.
 *
 * @param {{buffer: Buffer, boundaryMarker: string, expectedSha256?: string}} input
 * @returns {Readonly<{
 *   PLAN_AUTHORITY_MATCH: boolean,
 *   EXPECTED_SHA256: string,
 *   ACTUAL_CANONICAL_SHA256: string,
 *   CANONICAL_BYTE_LENGTH: number,
 * }>}
 */
export function verifyPlanAuthorityForTesting({ buffer, boundaryMarker, expectedSha256 = PLAN_AUTHORITY_SHA256 }) {
  const { sha256, length } = canonicalPrefix(buffer, boundaryMarker);
  return Object.freeze({
    PLAN_AUTHORITY_MATCH: sha256 === expectedSha256,
    EXPECTED_SHA256: expectedSha256,
    ACTUAL_CANONICAL_SHA256: sha256,
    CANONICAL_BYTE_LENGTH: length,
  });
}

/**
 * Parses the pinned hash out of a sidecar buffer. Accepts either a bare
 * 64-hex-char digest or the `sha256sum`-style `HASH  filename` form. Never
 * accepts a caller-supplied "expected" value — the only thing this function
 * does is extract what the sidecar itself claims.
 *
 * @param {Buffer} sidecarBuffer
 * @returns {string} lowercase hex digest
 */
export function parseSidecarHash(sidecarBuffer) {
  if (!Buffer.isBuffer(sidecarBuffer)) throw new PlanAuthorityError('plan_authority_sidecar_missing');
  const text = sidecarBuffer.toString('utf8').trim();
  const match = SIDECAR_HASH_RE.exec(text);
  if (!match) throw new PlanAuthorityError('plan_authority_sidecar_malformed');
  return match[1].toLowerCase();
}

/**
 * Shared sealed-verification core. Not exported directly — reached only
 * through `verifySealedPlanAuthority` (production, pinned constants) or
 * `verifySealedPlanAuthorityForTesting` (test-only, injectable pinned
 * values) below.
 */
function sealedCheck({ planBuffer, sidecarBuffer, pinnedSha256, pinnedByteLength }) {
  if (!Buffer.isBuffer(planBuffer)) throw new PlanAuthorityError('plan_authority_buffer_invalid');
  if (planBuffer.length !== pinnedByteLength) throw new PlanAuthorityError('plan_authority_byte_size_mismatch');

  const actualSha256 = crypto.createHash('sha256').update(planBuffer).digest('hex');
  if (actualSha256 !== pinnedSha256) throw new PlanAuthorityError('plan_authority_hash_mismatch');

  const sidecarHash = parseSidecarHash(sidecarBuffer); // throws sidecar_missing / sidecar_malformed
  if (sidecarHash !== pinnedSha256) throw new PlanAuthorityError('plan_authority_sidecar_hash_mismatch');

  return Object.freeze({
    PLAN_AUTHORITY_MATCH: true,
    PLAN_AUTHORITY_SHA256: pinnedSha256,
    PLAN_AUTHORITY_BYTE_LENGTH: pinnedByteLength,
  });
}

/**
 * PRODUCTION verifier. The only two inputs are the plan document's own bytes
 * and an independent sidecar's bytes — there is no third parameter through
 * which a caller can supply (or override) what counts as the authoritative
 * hash. Throws a stable `PlanAuthorityError` code on any mismatch; returns
 * the frozen content-free result only when every check passes.
 *
 * @param {{planBuffer: Buffer, sidecarBuffer: Buffer}} input
 */
export function verifySealedPlanAuthority({ planBuffer, sidecarBuffer }) {
  return sealedCheck({
    planBuffer,
    sidecarBuffer,
    pinnedSha256: PLAN_AUTHORITY_SHA256,
    pinnedByteLength: PLAN_AUTHORITY_BYTE_LENGTH,
  });
}

/**
 * TEST-ONLY. Identical sealed-verification logic to `verifySealedPlanAuthority`,
 * but with the pinned hash/length passed in by the caller instead of read
 * from the module constants — this exists solely so tests can exercise every
 * branch of the sealed check (byte-size mismatch, hash mismatch, sidecar
 * mismatch, stale authority value, …) without needing a preimage of the real
 * ratified `PLAN_AUTHORITY_SHA256`. Never imported by `preflight.mjs` or any
 * production entrypoint.
 *
 * @param {{planBuffer: Buffer, sidecarBuffer: Buffer, pinnedSha256: string, pinnedByteLength: number}} input
 */
export function verifySealedPlanAuthorityForTesting({ planBuffer, sidecarBuffer, pinnedSha256, pinnedByteLength }) {
  return sealedCheck({ planBuffer, sidecarBuffer, pinnedSha256, pinnedByteLength });
}
