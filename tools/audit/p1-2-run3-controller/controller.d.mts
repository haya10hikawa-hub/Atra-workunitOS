import type { ControllerStateStore } from './stateStore.d.mts';
import type { AcquireRawFn, DestinationForFn, GmailIdentity, PMAuthorizationRecord, Run3ControllerConfig } from './types.d.mts';

export declare const STATES: Readonly<{
  PRE_T0: 'PRE_T0';
  PM_AUTHORIZED: 'PM_AUTHORIZED';
  METADATA_SELECTION_RESOLVED: 'METADATA_SELECTION_RESOLVED';
  T0_RECORDED: 'T0_RECORDED';
  CANARY_PENDING: 'CANARY_PENDING';
  CANARY_PASSED: 'CANARY_PASSED';
  GMAIL_ACQUIRING: 'GMAIL_ACQUIRING';
  ACQUISITION_COMPLETE: 'ACQUISITION_COMPLETE';
  VALIDATION_PENDING: 'VALIDATION_PENDING';
  VOID: 'VOID';
}>;

export declare class ControllerError extends Error {
  readonly code: string;
  constructor(code: string);
}

export declare class VoidTerminalError extends ControllerError {
  readonly voidReason: string | null;
  constructor(reason: string | null);
}

export type ScoredGmailIdentity = Readonly<{
  message_id: string;
  internalDate: string | number;
  selection_score: string;
}>;

export type ResolvedSelectionRecord = Readonly<{
  ruleId: string;
  eligibleCount: number;
  selected: ReadonlyArray<ScoredGmailIdentity>;
  canary: ScoredGmailIdentity;
  remaining: ReadonlyArray<ScoredGmailIdentity>;
  commitment: string;
}>;

export type CompletedAcquisitionRecord = Readonly<{
  message_id: string;
  byte_length: number;
  provider_sha256: string;
  persisted_sha256: string;
  is_canary: boolean;
  completed_at: number;
}>;

export type ValidationSummary = Readonly<{
  github_reuse_expected: number;
  gmail_acquired: number;
  total_expected: number;
}>;

export type AcquisitionInFlightMarker = Readonly<{
  kind: 'CANARY' | 'GMAIL';
  message_id: string;
  destination: string;
  started_at: number;
}>;

export type ControllerStateSnapshot = Readonly<{
  state: string;
  pmAuthorization: PMAuthorizationRecord | null;
  selection: ResolvedSelectionRecord | null;
  t0: number | null;
  deadline: number | null;
  completed: ReadonlyArray<CompletedAcquisitionRecord>;
  voidReason: string | null;
  validation: ValidationSummary | null;
  acquisitionInFlight: AcquisitionInFlightMarker | null;
}>;

export declare class Run3AcquisitionController {
  constructor(config: Run3ControllerConfig, stateStore: ControllerStateStore, clock: { now: () => number });
  getState(): ControllerStateSnapshot;
  authorizePM(authRecord: PMAuthorizationRecord): void;
  resolveSelection(candidates: ReadonlyArray<GmailIdentity>, window: { windowStartMs: number; windowEndMs: number }): void;
  recordT0(): void;
  runCanary(acquireRaw: AcquireRawFn, destinationFor: DestinationForFn): Promise<void>;
  acquireNext(messageId: string, acquireRaw: AcquireRawFn, destinationFor: DestinationForFn): Promise<void>;
  completeToValidationPending(): void;
}
