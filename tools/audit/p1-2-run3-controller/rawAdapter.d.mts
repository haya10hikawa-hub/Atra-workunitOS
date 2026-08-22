import type { acquireGmailRawMessage } from '../p1-2-gmail-raw-transport/gmailRaw.d.mts';

export declare class RawAdapterError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type GmailRawEvidence = Readonly<{
  message_id: string;
  byte_length: number;
  provider_sha256: string;
  persisted_sha256: string;
  byte_equal: boolean;
}>;

export declare function createGmailRawAdapter(config: {
  root: string;
  env: Record<string, string | undefined>;
  acquire?: typeof acquireGmailRawMessage;
}): (identity: { message_id: string }, destination: string) => Promise<GmailRawEvidence>;
