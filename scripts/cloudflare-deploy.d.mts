/**
 * Type declarations for the Cloudflare deploy orchestrator (hardened P0-FIX-018).
 *
 * Remote execution is ENTRYPOINT-ONLY. There is deliberately NO `runPipeline`, no
 * `RunPipelineDeps`, no `DEPLOY_STEPS`, and no remote process-runner seam declared
 * here — the pipeline and every remote-capable leaf are PRIVATE to the module. The
 * only exported surface is PURE, non-authorizing information: ordered step metadata,
 * an order validator, and a digest-equality predicate. None spawns, receives an
 * authority, accepts an execution flag, or can contact Cloudflare.
 */

/** Non-authorizing step metadata: name + whether the step is remote / needs a config. */
export interface DeployStepMetadata {
  name: string
  remote: boolean
  usesConfig: boolean
}

/** The ordered, non-authorizing step metadata (a fresh copy on every call). */
export declare function getDeployStepMetadata(): DeployStepMetadata[]

/**
 * Validate the canonical deploy step order (pure): `prepare` first, `deploy` last,
 * `verify-remote-schema` immediately before `deploy`, and no migration/bootstrap step.
 */
export declare function validateDeployStepOrder(order?: string[]): { ok: boolean; failures: string[] }

/** Pure 64-hex digest equality — the verified schema authority must equal the deploy authority. */
export declare function deployAuthorityDigestsMatch(verifiedDigest: unknown, deployDigest: unknown): boolean
