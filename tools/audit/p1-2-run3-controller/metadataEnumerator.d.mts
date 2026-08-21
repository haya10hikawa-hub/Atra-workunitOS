export declare class MetadataEnumeratorError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type GmailMetadataCandidate = Readonly<{ message_id: string; internalDate: string }>;

export declare function enumerateGmailMetadata(input: {
  env: Record<string, string | undefined>;
  query?: string;
  pageSize?: number;
  windowStartMs?: number;
  windowEndMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<
  Readonly<{
    candidates: ReadonlyArray<GmailMetadataCandidate>;
    eligible: ReadonlyArray<GmailMetadataCandidate>;
    pageCount: number;
  }>
>;
