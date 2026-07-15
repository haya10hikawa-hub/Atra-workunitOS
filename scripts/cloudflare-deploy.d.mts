/** Type declarations for the Cloudflare deploy orchestrator. */
export interface DeployStep { name: string; cmd: string; args: string[]; remote?: boolean }
export declare const DEPLOY_STEPS: DeployStep[]
