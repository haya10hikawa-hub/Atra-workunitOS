export declare const PLAN_AUTHORITY_SHA256: string;

export declare class PlanAuthorityError extends Error {
  readonly code: string;
  constructor(code: string);
}

export declare function canonicalPrefix(
  buffer: Buffer,
  boundaryMarker: string,
): { prefix: Buffer; sha256: string; length: number };

export declare function verifyPlanAuthority(input: {
  buffer: Buffer;
  boundaryMarker: string;
  expectedSha256?: string;
}): Readonly<{
  PLAN_AUTHORITY_MATCH: boolean;
  EXPECTED_SHA256: string;
  ACTUAL_CANONICAL_SHA256: string;
  CANONICAL_BYTE_LENGTH: number;
}>;
