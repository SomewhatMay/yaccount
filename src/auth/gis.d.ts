/**
 * Minimal ambient typings for the Google Identity Services token-client API
 * (§3.3-B), covering only the surface `web.ts` uses. GIS ships no bundled types
 * and we avoid an extra dependency, so this hand-written subset stands in.
 * Reference: https://developers.google.com/identity/oauth2/web/reference/js-reference
 */
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
    error?: string;
    error_description?: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message?: string }) => void;
    prompt?: "" | "none" | "consent" | "select_account";
  }

  interface OverridableTokenClientConfig {
    prompt?: "" | "none" | "consent" | "select_account";
  }

  interface TokenClient {
    requestAccessToken(overrideConfig?: OverridableTokenClientConfig): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function revoke(accessToken: string, done?: () => void): void;
}

interface Window {
  google?: typeof google;
}
