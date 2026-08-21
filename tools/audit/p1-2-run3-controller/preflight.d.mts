export declare const CHECK_NAMES: ReadonlyArray<string>;

export type Run3PreflightCheckName =
  | 'runner_installed'
  | 'oauth_client_available'
  | 'oauth_refresh_state_available'
  | 'gmail_auth_available'
  | 'raw_transport_available'
  | 'controller_available'
  | 'metadata_enumerator_available'
  | 'private_state_root_valid'
  | 'plan_authority_valid'
  | 'run2_github_reuse_count_exact'
  | 'run2_github_artifact_hashes_valid'
  | 'run2_github_selection_provenance_valid'
  | 'run2_github_selection_set_equal';

export declare function runRun3Preflight(input: {
  env: Record<string, string | undefined>;
  statePath: string;
  planBuffer: Buffer;
  sidecarBuffer: Buffer;
  run2ManifestPath: string;
  run2ArtifactRoot: string;
  run2SelectionResolvedPath: string;
  expectedGithubReuseCount?: number;
  /** Internal test seam only — never supplied by a production caller. */
  planAuthorityVerifier?: (input: { planBuffer: Buffer; sidecarBuffer: Buffer }) => Readonly<{
    PLAN_AUTHORITY_MATCH: boolean;
  }>;
}): Promise<
  Readonly<{
    overall_pass: boolean;
    checks: Readonly<Record<Run3PreflightCheckName, boolean>>;
    failed_checks: ReadonlyArray<Run3PreflightCheckName>;
  }>
>;
