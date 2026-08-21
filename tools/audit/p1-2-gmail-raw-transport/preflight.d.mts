/** Type surface for the content-free pre-T0 preflight. */

export declare const CHECK_NAMES: readonly string[];

export declare function runPreflight(input: {
  env: Record<string, string | undefined>;
  runRoot: string;
  planPath: string;
  expectedPlanSha256: string;
  run2ManifestPath: string;
  run2AcquisitionWindowStartIso: string;
  run2AcquisitionWindowEndIso: string;
}): Promise<
  Readonly<{
    overall_pass: boolean;
    checks: Readonly<Record<string, boolean>>;
    failed_checks: readonly string[];
  }>
>;
