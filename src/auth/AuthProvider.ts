/**
 * The single authentication seam (spec §3.4). Everything downstream — most
 * importantly M9's `createDriveStore({ accessToken: getAccessToken })` — depends
 * only on this interface, never on which platform flow produced the token. The
 * web flow (§3.3-B) lives in `web.ts`; the native flow (§3.3-A) arrives in M10
 * as `native.ts`. Both hand back an `AuthProvider`.
 *
 * This file is deliberately platform-free and unit-testable in Node: the token
 * lifecycle (cache → silent re-auth → interactive fallback) is pure logic driven
 * by an injected `requestToken` function + clock, so M9 can test its sync path
 * against a fake provider without any real OAuth.
 */

/** What a token request resolves to — mirrors the GIS token-client response
 * shape (§3.3-B), trimmed to what we use. `error` set ⇒ the request failed. */
export interface TokenResponse {
  access_token: string;
  /** Lifetime in seconds from issuance (GIS returns ~3600). */
  expires_in: number;
  error?: string;
}

/**
 * Acquire a token. `silent` = attempt without UI (`prompt: ''`, §3.3-B); the
 * caller falls back to an interactive request if the silent one fails. This is
 * the ONE glue point the web/native modules implement; everything else is pure.
 */
export type RequestToken = (opts: { silent: boolean }) => Promise<TokenResponse>;

/** The unified interface handed to drivestore (§3.4). */
export interface AuthProvider {
  /** Sign in interactively (a user gesture — the consent popup, §3.3-B). */
  signIn(): Promise<void>;
  /**
   * Restore the connection on app load. The **grant** (that the user connected
   * their Google account) is persisted durably, so this survives refresh AND
   * tab close indefinitely — the user stays "connected" until they sign out or
   * Google revokes access. The short-lived access token itself is fetched
   * silently on demand (see `getAccessToken`), riding the user's activity so no
   * popup is needed while their Google session is alive. Resolves `true` if the
   * account is still connected.
   */
  restoreSession(): Promise<boolean>;
  /** Disconnect: drop the token AND the persisted grant. */
  signOut(): void;
  /** True while a non-expired access token is held (an implementation detail —
   * for UI "are we connected?", use `isConnected`). */
  isSignedIn(): boolean;
  /** True while the account is connected (a durable grant exists). This is the
   * user-facing signed-in state; it outlives any single access token. */
  isConnected(): boolean;
  /**
   * The M9-critical call: return a valid `drive.appdata`-scoped access token,
   * silently renewing before expiry and falling back to an interactive
   * re-consent popup if the silent renewal is blocked (all browsers, §10 #25).
   * Rejects if no token can be obtained. Called during user activity, so the
   * silent renewal has the interaction context it needs to stay invisible.
   */
  getAccessToken(): Promise<string>;
  /**
   * Like `getAccessToken` but **never** shows an interactive popup — attempts a
   * silent renewal only and resolves `null` if that isn't possible. For
   * background/on-load callers with no user gesture (§3.3-B: a popup would be
   * blocked). M9 uses this for background sync ticks.
   */
  getAccessTokenSilent(): Promise<string | null>;
}

/**
 * The persisted auth state. `granted` is the durable fact that the user
 * connected their Google account (survives token expiry, refresh, and tab
 * close); `access_token`/`expiresAtMs` cache the current short-lived token so a
 * refresh within its lifetime needs no network at all.
 */
export interface PersistedAuth {
  granted: boolean;
  access_token?: string;
  expiresAtMs?: number;
}

/**
 * Where auth state is persisted so the connection survives reloads (§3.3-B —
 * there is no refresh token on web). The web impl (web.ts) backs this with
 * `localStorage`; tests use an in-memory fake, keeping the manager pure. Only
 * the durable grant flag + the short-lived, `drive.appdata`-scoped access token
 * are stored — never a refresh token (the native prohibition, §3.3-A, doesn't
 * apply: web has none).
 */
export interface TokenStore {
  read(): PersistedAuth | null;
  write(state: PersistedAuth): void;
  clear(): void;
}

/**
 * Platform-agnostic token lifecycle. Separates the durable **grant** (are we
 * connected?) from the short-lived **access token** (what we send to Drive).
 * The grant is persisted so the user stays connected across reloads/tab-closes
 * indefinitely; the token is fetched silently on demand during user activity
 * (`getAccessToken`), so the GIS popup — which needs a user gesture (§3.3-B) —
 * stays invisible while the Google session is alive. The clock is injectable so
 * expiry/renewal is unit-testable.
 */
export class TokenManager implements AuthProvider {
  private token: string | null = null;
  private expiresAtMs = 0;
  private granted = false;

  constructor(
    private readonly requestToken: RequestToken,
    private readonly now: () => number = () => Date.now(),
    /** Renew this long before the real expiry so a token never goes stale
     * mid-request (§3.3-B silent re-auth "before expiry"). */
    private readonly skewMs = 60_000,
    private readonly store: TokenStore | null = null,
  ) {
    this.hydrateFromStore();
  }

  private hydrateFromStore(): void {
    const state = this.store?.read();
    if (!state) return;
    this.granted = state.granted;
    this.token = state.access_token ?? null;
    this.expiresAtMs = state.expiresAtMs ?? 0;
  }

  private persist(): void {
    this.store?.write({
      granted: this.granted,
      access_token: this.token ?? undefined,
      expiresAtMs: this.token ? this.expiresAtMs : undefined,
    });
  }

  isSignedIn(): boolean {
    return this.token !== null && this.now() < this.expiresAtMs;
  }

  isConnected(): boolean {
    return this.granted;
  }

  /** A token good for at least `skewMs` more — safe to hand out as-is. */
  private hasFreshToken(): boolean {
    return this.token !== null && this.now() < this.expiresAtMs - this.skewMs;
  }

  async signIn(): Promise<void> {
    await this.acquire(false);
  }

  async restoreSession(): Promise<boolean> {
    // Re-read the store (it may not have been ready when the singleton was first
    // constructed). The connection is the durable grant — no network/popup here;
    // the token is renewed later, on demand, during user activity.
    this.hydrateFromStore();
    return this.granted;
  }

  signOut(): void {
    this.token = null;
    this.expiresAtMs = 0;
    this.granted = false;
    this.store?.clear();
  }

  async getAccessToken(): Promise<string> {
    if (this.hasFreshToken()) return this.token as string;
    // §3.3-B: silent re-auth first; on failure fall back to an interactive
    // re-consent popup — scoped for ALL browsers, not just Safari (§10 #25).
    try {
      return await this.acquire(true);
    } catch {
      return await this.acquire(false);
    }
  }

  async getAccessTokenSilent(): Promise<string | null> {
    if (this.hasFreshToken()) return this.token as string;
    try {
      return await this.acquire(true);
    } catch {
      return null; // no interactive fallback — caller has no user gesture
    }
  }

  private async acquire(silent: boolean): Promise<string> {
    const res = await this.requestToken({ silent });
    if (res.error || !res.access_token) {
      throw new Error(res.error ?? "auth: no access token returned");
    }
    this.token = res.access_token;
    this.expiresAtMs = this.now() + res.expires_in * 1000;
    this.granted = true; // a successful token proves an active grant
    this.persist();
    return this.token;
  }
}
