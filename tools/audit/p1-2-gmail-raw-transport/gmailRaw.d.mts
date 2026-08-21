/**
 * Type surface for the Gmail RAW read-only byte-preserving transport.
 *
 * There is no exported function that returns decoded message bytes to a
 * caller. `acquireGmailRawMessage` is the whole capability: fetch, decode,
 * persist, verify, and hand back a seven-field content-free result.
 */

export declare class GmailTransportError extends Error {
  readonly code: string;
  constructor(code: string);
}

export declare function readCredential(env: Record<string, string | undefined> | undefined): string;
export declare function decodeBase64Url(value: string): Buffer;
export declare function sha256Hex(buffer: Buffer): string;
export declare function writeBytesDurable(destPath: string, buffer: Buffer): void;
export declare function readBytesDurable(destPath: string): Buffer;

export declare function verifyByteFidelity(input: { providerBytes: Buffer; destPath: string }): Readonly<{
  providerLength: number;
  persistedLength: number;
  providerSha256: string;
  persistedSha256: string;
  lengthEqual: boolean;
  byteEqual: boolean;
}>;

export declare function acquireGmailRawMessage(input: {
  messageId: string;
  destPath: string;
  root: string;
  env: Record<string, string | undefined>;
}): Promise<
  Readonly<{
    message_id: string;
    byte_length: number;
    provider_sha256: string;
    persisted_sha256: string;
    byte_equal: boolean;
  }>
>;

export declare const API_ORIGIN: string;
export declare const CREDENTIAL_ENV: string;
export declare const ROOT_ENV: string;
