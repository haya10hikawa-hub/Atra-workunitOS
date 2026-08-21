export declare const PLAN_AUTHORITY_SHA256: string;
export declare const PLAN_AUTHORITY_BYTE_LENGTH: number;

export declare class PlanAuthorityError extends Error {
  readonly code: string;
  constructor(code: string);
}

export declare function canonicalPrefix(
  buffer: Buffer,
  boundaryMarker: string,
): { prefix: Buffer; sha256: string; length: number };

/** TEST-ONLY. Never used by production preflight — see `verifySealedPlanAuthority`. */
export declare function verifyPlanAuthorityForTesting(input: {
  buffer: Buffer;
  boundaryMarker: string;
  expectedSha256?: string;
}): Readonly<{
  PLAN_AUTHORITY_MATCH: boolean;
  EXPECTED_SHA256: string;
  ACTUAL_CANONICAL_SHA256: string;
  CANONICAL_BYTE_LENGTH: number;
}>;

export declare function parseSidecarHash(sidecarBuffer: Buffer): string;

export declare function verifySealedPlanAuthority(input: {
  planBuffer: Buffer;
  sidecarBuffer: Buffer;
}): Readonly<{
  PLAN_AUTHORITY_MATCH: true;
  PLAN_AUTHORITY_SHA256: string;
  PLAN_AUTHORITY_BYTE_LENGTH: number;
}>;

/** TEST-ONLY. Never used by production preflight or any production entrypoint. */
export declare function verifySealedPlanAuthorityForTesting(input: {
  planBuffer: Buffer;
  sidecarBuffer: Buffer;
  pinnedSha256: string;
  pinnedByteLength: number;
}): Readonly<{
  PLAN_AUTHORITY_MATCH: true;
  PLAN_AUTHORITY_SHA256: string;
  PLAN_AUTHORITY_BYTE_LENGTH: number;
}>;
