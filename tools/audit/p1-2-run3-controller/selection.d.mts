export declare const RULE_ID: string;
export declare const SAMPLE_SIZE: number;

export declare class SelectionError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type GmailMetadataCandidate = Readonly<{
  message_id: string;
  internalDate: string | number;
}>;

export type ScoredGmailIdentity = Readonly<{
  message_id: string;
  internalDate: string | number;
  selection_score: string;
}>;

export type GmailSelectionResolution = Readonly<{
  ruleId: string;
  eligibleCount: number;
  selected: ReadonlyArray<ScoredGmailIdentity>;
  canary: ScoredGmailIdentity;
  remaining: ReadonlyArray<ScoredGmailIdentity>;
}>;

export declare function resolveGmailSelection(
  candidates: ReadonlyArray<GmailMetadataCandidate>,
  window: { windowStartMs: number; windowEndMs: number },
): GmailSelectionResolution;

export declare function selectionCommitment(
  resolution: Pick<GmailSelectionResolution, 'ruleId' | 'selected'>,
): string;
