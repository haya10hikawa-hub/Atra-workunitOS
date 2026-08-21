/**
 * Content-free Run-3 plan-authority verifier.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * The Run-3 pre-registration plan document carries a later "authority
 * trailer" (e.g. PM ratification signature, decision-token block) appended
 * after the canonical policy body. A naive whole-file hash of that document
 * changes every time the trailer changes, even though the trailer is not
 * itself part of the policy being attested — and, worse, a whole-file hash
 * cannot distinguish "the policy changed" from "someone appended a new
 * signature block". This module hashes only the canonical prefix — the bytes
 * strictly before the first occurrence of a documented boundary marker — so
 * the attested value is a function of the policy body alone.
 *
 * CONTENT-FREE BY CONSTRUCTION: no function in this module returns, logs, or
 * throws the plan bytes or any substring of them. The only values that ever
 * cross back to a caller are a boolean, two hex digests, and a byte count.
 *
 * @module p1-2-run3-controller/planAuthority
 */

import crypto from 'node:crypto';

/**
 * The Run-3 plan-authority commitment, ratified out of band. This is the
 * *only* accepted value; there is no fallback to an older or alternate hash.
 */
export const PLAN_AUTHORITY_SHA256 = '8b8bd19df7369a28ebb410c93dee8ed5cdf0085ce46d8a3f01c395396a837b9c';

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
 * prefix (there is no trailer to exclude), which is a deliberate, documented
 * behavior rather than a silent no-op: a plan document that never carries the
 * marker has no trailer to strip, so hashing it whole is correct, not a
 * fallback.
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
 * Verifies a plan document's canonical-prefix hash against the expected
 * commitment. Returns only the content-free four-field result the Run-3
 * preflight is authorized to print — never the prefix bytes themselves.
 *
 * @param {{buffer: Buffer, boundaryMarker: string, expectedSha256?: string}} input
 * @returns {Readonly<{
 *   PLAN_AUTHORITY_MATCH: boolean,
 *   EXPECTED_SHA256: string,
 *   ACTUAL_CANONICAL_SHA256: string,
 *   CANONICAL_BYTE_LENGTH: number,
 * }>}
 */
export function verifyPlanAuthority({ buffer, boundaryMarker, expectedSha256 = PLAN_AUTHORITY_SHA256 }) {
  const { sha256, length } = canonicalPrefix(buffer, boundaryMarker);
  return Object.freeze({
    PLAN_AUTHORITY_MATCH: sha256 === expectedSha256,
    EXPECTED_SHA256: expectedSha256,
    ACTUAL_CANONICAL_SHA256: sha256,
    CANONICAL_BYTE_LENGTH: length,
  });
}
