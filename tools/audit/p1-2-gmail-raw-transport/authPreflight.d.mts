/** Type surface for the content-free Gmail auth/profile health check. */

export declare function checkGmailAuth(input: {
  env: Record<string, string | undefined>;
}): Promise<Readonly<{ available: boolean; reason_code: string | null }>>;

export declare const CREDENTIAL_ENV: string;
