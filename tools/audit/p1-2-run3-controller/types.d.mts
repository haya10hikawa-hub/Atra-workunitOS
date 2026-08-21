/**
 * Shared type surface for the Run-3 acquisition controller package. These
 * types describe the narrow capability boundary the controller depends on —
 * never OAuth, never fetch(), never a Google SDK type.
 */

export type GmailIdentity = Readonly<{
  message_id: string;
  internalDate: string | number;
  selection_score?: string;
}>;

export type AcquireRawResult = Readonly<{
  message_id: string;
  byte_length: number;
  provider_sha256: string;
  persisted_sha256: string;
  byte_equal: boolean;
}>;

/**
 * The controller depends on this capability, never on OAuth/fetch/Google SDK
 * directly. Implementations may bind to the real Gmail RAW transport during
 * final integration; this WorkUnit only exercises synthetic adapters.
 */
export type AcquireRawFn = (identity: GmailIdentity, destination: string) => Promise<AcquireRawResult>;

export type DestinationForFn = (identity: GmailIdentity) => string;

export type PMAuthorizationRecord = Readonly<{
  run_id: string;
  plan_sha256: string;
  expected_github_reuse: number;
  expected_gmail_new: number;
  expected_total: number;
  acquisition_duration_hours: number;
}>;

export type Run3ControllerConfig = Readonly<{
  runId: string;
  planSha256: string;
  expectedGithubReuse: number;
  expectedGmailNew: number;
  expectedTotal: number;
  acquisitionDurationHours: number;
}>;
