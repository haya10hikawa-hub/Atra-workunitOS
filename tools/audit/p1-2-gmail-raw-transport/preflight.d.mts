/** Type surface for the content-free pre-T0 preflight. */

export declare const CHECK_NAMES: readonly string[];

export declare function runPreflight(input: {
  env: Record<string, string | undefined>;
  runRoot: string;
  planPath: string;
  expectedPlanSha256: string;
  io?: {
    writeBytesDurable: (destPath: string, buffer: Buffer) => void;
    readBytesDurable: (destPath: string) => Buffer;
    decodeBase64Url: (value: string) => Buffer;
  };
}): Promise<
  Readonly<{
    overall_pass: boolean;
    checks: Readonly<Record<string, boolean>>;
    failed_checks: readonly string[];
  }>
>;
