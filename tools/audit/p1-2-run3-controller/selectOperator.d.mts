import type { enumerateGmailMetadata } from './metadataEnumerator.d.mts';

export declare const STATUS_RESOLVED: 'P1_2_RUN3_METADATA_SELECTION_RESOLVED';
export declare const STATUS_ALREADY_RESOLVED: 'P1_2_RUN3_METADATA_SELECTION_ALREADY_RESOLVED';
export declare const RUN_ID_PATTERN: RegExp;

export declare class SelectOperatorError extends Error {
  readonly code: string;
  constructor(code: string);
}

/** The pinned controller config. `runId` is the only non-constant field. */
export type PinnedRun3Config = Readonly<{
  runId: string;
  planSha256: string;
  expectedGithubReuse: number;
  expectedGmailNew: number;
  expectedTotal: number;
  acquisitionDurationHours: number;
}>;

/** The pinned durable PM-authorization record. `run_id` is the only non-constant field. */
export type PinnedPMAuthorizationRecord = Readonly<{
  run_id: string;
  plan_sha256: string;
  expected_github_reuse: number;
  expected_gmail_new: number;
  expected_total: number;
  acquisition_duration_hours: number;
}>;

/**
 * The complete set of fields `run3-select` is permitted to print on success.
 * Carries no message identity, no internalDate, and no provider response.
 */
export type Run3SelectResult = Readonly<{
  status: string;
  state: string;
  rule_id: string;
  eligible_count: number;
  selected_count: number;
  canary_count: number;
  remaining_count: number;
  selection_commitment: string;
}>;

export declare function validateRunId(runId: unknown): string;
export declare function assertPrivateStateRoot(statePath: string): void;
export declare function buildPinnedConfig(runId: string): PinnedRun3Config;
export declare function buildPinnedAuthorizationRecord(runId: string): PinnedPMAuthorizationRecord;
export declare function classifyPersistedState(
  persisted: unknown,
  expectedAuthRecord: PinnedPMAuthorizationRecord,
): { entry: string; persisted: object | null };
export declare function contentFreeProjection(status: string, snapshot: { state: string; selection: object }): Run3SelectResult;
export declare function toStableErrorCode(error: unknown): string;

export declare function runRun3Select(input: {
  env: Record<string, string | undefined>;
  statePath: string;
  runId: string;
  pmAcknowledged: boolean;
  enumerate?: typeof enumerateGmailMetadata;
  stateStoreFactory?: (filePath: string) => object;
  controllerFactory?: (config: PinnedRun3Config, stateStore: object, clock: { now: () => number }) => object;
  clock?: { now: () => number };
}): Promise<Run3SelectResult>;
