/** Type surface for the content-free pre-T0 preflight. */

export declare const CHECK_NAMES: readonly string[];
export declare const EXPECTED_RUN2_GITHUB_REUSE_COUNT: number;

export declare function runPreflight(input: {
  env: Record<string, string | undefined>;
  runRoot: string;
  planPath: string;
  expectedPlanSha256: string;
  run2ManifestPath: string;
  run2AcquisitionWindowStartIso: string;
  run2AcquisitionWindowEndIso: string;
  run2SelectionResolvedPath: string;
  run2ArtifactRoot: string;
  expectedGithubReuseCount?: number;
}): Promise<
  Readonly<{
    overall_pass: boolean;
    checks: Readonly<Record<string, boolean>>;
    failed_checks: readonly string[];
    diagnostics: Readonly<{ oauth_client_available: boolean; oauth_refresh_state_available: boolean }>;
  }>
>;
