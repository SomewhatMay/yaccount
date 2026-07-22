/**
 * The desktop-browser OAuth flow (spec §3.3-B): Google Identity Services' JS
 * token client, `ux_mode: 'popup'`. Returns a short-lived access token straight
 * to client JS — no secret, no refresh token (browsers can't hold one safely).
 * The token lifecycle (cache/renew/fallback) lives in the platform-free
 * `TokenManager`; this file is only the thin GIS glue that satisfies its one
 * `RequestToken` seam.
 *
 * Client-only by construction — it touches `window`/`document` and loads a
 * remote script, so it must never be imported from `src/core` (ESLint boundary).
 */
import {
  TokenManager,
  type AuthProvider,
  type PersistedAuth,
  type RequestToken,
  type TokenResponse,
  type TokenStore,
} from "./AuthProvider";

/** The only scope yaccount needs — non-sensitive, basic verification (§3.2). */
export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

/** localStorage key holding the persisted auth state (see `browserTokenStore`). */
const AUTH_STORE_KEY = "yaccount.auth";

/**
 * localStorage-backed auth store so the connection survives refresh AND tab
 * close indefinitely — the durable grant persists; the cached access token
 * covers refreshes within its ~1h life without any network (§3.3-B: no refresh
 * token, so continuity comes from the persisted grant + silent on-demand
 * renewal). We persist ONLY the grant flag + the short-lived, `drive.appdata`-
 * scoped access token — never a refresh token (the §3.3-A "never in localStorage"
 * rule is about refresh tokens; web has none). All access is guarded so it
 * degrades to in-memory-only if storage is unavailable.
 */
function browserTokenStore(): TokenStore {
  return {
    read(): PersistedAuth | null {
      try {
        const raw = window.localStorage.getItem(AUTH_STORE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof (parsed as PersistedAuth).granted === "boolean"
        ) {
          return parsed as PersistedAuth;
        }
        return null;
      } catch {
        return null;
      }
    },
    write(state: PersistedAuth): void {
      try {
        window.localStorage.setItem(AUTH_STORE_KEY, JSON.stringify(state));
      } catch {
        /* storage full/blocked — fall back to in-memory only */
      }
    },
    clear(): void {
      try {
        window.localStorage.removeItem(AUTH_STORE_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let gisPromise: Promise<void> | null = null;

/** Load the GIS script exactly once (promise-memoized, like the repo singleton). */
function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("auth/web: GIS can only load in the browser"));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("auth/web: failed to load GIS script"));
    document.head.appendChild(script);
  });
  return gisPromise;
}

/**
 * Build the `RequestToken` glue over a GIS token client. GIS is callback-based
 * (one `callback` + `error_callback` per client), so each `requestAccessToken`
 * is adapted into a promise. `silent` ⇒ `prompt: ''` (no UI if a grant+session
 * exist); interactive ⇒ `prompt: 'consent'` (the re-consent popup fallback).
 */
function makeGisRequester(clientId: string): RequestToken {
  let client: google.accounts.oauth2.TokenClient | null = null;
  let resolveActive: ((r: TokenResponse) => void) | null = null;
  let rejectActive: ((e: unknown) => void) | null = null;

  return async ({ silent }) => {
    await loadGis();
    if (!client) {
      client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_APPDATA_SCOPE,
        callback: (resp) => {
          const r = resolveActive;
          resolveActive = rejectActive = null;
          r?.({
            access_token: resp.access_token,
            expires_in: resp.expires_in,
            error: resp.error,
          });
        },
        error_callback: (err) => {
          const rej = rejectActive;
          resolveActive = rejectActive = null;
          rej?.(new Error(err.message ?? err.type ?? "auth/web: token request failed"));
        },
      });
    }
    return new Promise<TokenResponse>((resolve, reject) => {
      resolveActive = resolve;
      rejectActive = reject;
      client!.requestAccessToken({ prompt: silent ? "" : "consent" });
    });
  };
}

/** Construct the web `AuthProvider` (§3.4) for a given Web client ID. */
export function createWebAuthProvider(clientId: string): AuthProvider {
  if (!clientId) {
    throw new Error(
      "auth/web: missing Web client ID (set NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID)",
    );
  }
  return new TokenManager(
    makeGisRequester(clientId),
    () => Date.now(),
    60_000,
    browserTokenStore(),
  );
}

let providerSingleton: AuthProvider | null = null;

/**
 * The app-wide auth provider (a stateful, side-effectful handle — a module
 * singleton, like the repo, not an atom). Reads the public Web client ID baked
 * into the static export via `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
 */
export function getAuthProvider(): AuthProvider {
  if (!providerSingleton) {
    providerSingleton = createWebAuthProvider(
      process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    );
  }
  return providerSingleton;
}
