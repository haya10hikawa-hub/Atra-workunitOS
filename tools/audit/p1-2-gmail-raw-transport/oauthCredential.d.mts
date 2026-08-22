/**
 * Type surface for the P1-2 Gmail RAW OAuth credential provider.
 *
 * OAuth-only: this module never reads `ATRA_P1_2_GMAIL_TOKEN` or
 * `GMAIL_ACCESS_TOKEN`. No exported function returns a client secret,
 * refresh token, or access token to anything other than its direct caller —
 * none of these are ever serialized into a printable result.
 */

export declare class GmailOAuthError extends Error {
  readonly code: string;
  constructor(code: string);
}

export declare const OAUTH_SCOPE: string;
export declare const OAUTH_CREDENTIALS_PATH_ENV: string;
export declare const OAUTH_TOKEN_PATH_ENV: string;

export interface GmailOAuthTokenState {
  refresh_token: string;
  access_token: string | null;
  expiry_date: number;
  scope: string;
}

export declare function resolveOAuthPaths(env: Record<string, string | undefined> | undefined): Readonly<{
  credentialsPath: string;
  tokenPath: string;
}>;

export declare function isOAuthClientConfigured(env: Record<string, string | undefined> | undefined): boolean;

export declare function loadClientCredentials(
  env: Record<string, string | undefined> | undefined,
): Readonly<{ clientId: string; clientSecret: string }>;

export declare function readTokenState(env: Record<string, string | undefined> | undefined): Record<string, unknown> | null;

export declare function hasRefreshState(tokenState: unknown): boolean;

export declare function persistTokenState(env: Record<string, string | undefined> | undefined, tokenState: GmailOAuthTokenState): void;

export interface OAuthClientLike {
  setCredentials(credentials: { refresh_token: string }): void;
  refreshAccessToken(): Promise<{ credentials: Record<string, unknown> }>;
}

export interface OAuthRefreshDeps {
  createClient?: (input: { clientId: string; clientSecret: string; redirectUri?: string }) => OAuthClientLike;
}

export declare function refreshAccessToken(
  env: Record<string, string | undefined> | undefined,
  deps?: OAuthRefreshDeps,
): Promise<string>;

export declare function resolveOAuthAccessToken(
  env: Record<string, string | undefined> | undefined,
  deps?: OAuthRefreshDeps,
): Promise<string>;

export interface CodeVerifierResult {
  codeVerifier: string;
  codeChallenge: string;
}

export interface ConsentClientLike {
  generateAuthUrl(opts: {
    access_type: string;
    scope: string[];
    prompt: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
  }): string;
  getToken(opts: { code: string; codeVerifier?: string | null }): Promise<{ tokens: Record<string, unknown> }>;
  generateCodeVerifierAsync(): Promise<CodeVerifierResult>;
}

export interface FirstRunConsentDeps {
  createClient?: (input: { clientId: string; clientSecret: string; redirectUri?: string }) => ConsentClientLike;
  openBrowser?: (url: string) => boolean;
  exchangeCode?: (input: { client: ConsentClientLike; code: string; codeVerifier: string | null }) => Promise<Record<string, unknown>>;
  generateState?: () => string;
  generateCodeVerifier?: () => Promise<CodeVerifierResult>;
}

export declare function runFirstRunConsent(
  env: Record<string, string | undefined> | undefined,
  deps?: FirstRunConsentDeps,
): Promise<
  | Readonly<{ status: 'READY' }>
  | Readonly<{ status: 'HUMAN_GOOGLE_OAUTH_CONSENT_REQUIRED'; auth_url: string | null }>
>;
