import { describe, it, expect } from "vitest";
import {
  TokenManager,
  type PersistedAuth,
  type RequestToken,
  type TokenResponse,
  type TokenStore,
} from "./AuthProvider";

/**
 * The auth seam is pure logic (§3.4): a `requestToken` glue point + an injected
 * clock. These tests pin the token lifecycle — cache, silent renewal before
 * expiry, interactive fallback (§3.3-B / §10 #25) — with a fake requester, so
 * M9's sync path can rely on `getAccessToken()` without any real OAuth.
 */

/** A controllable clock (ms epoch). */
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** A fake requester recording its calls and returning scripted responses. */
function fakeRequester(
  script: (call: { silent: boolean; n: number }) => TokenResponse | Error,
) {
  const calls: { silent: boolean }[] = [];
  const request: RequestToken = async ({ silent }) => {
    const n = calls.length;
    calls.push({ silent });
    const r = script({ silent, n });
    if (r instanceof Error) throw r;
    return r;
  };
  return { request, calls };
}

const token = (access_token: string, expires_in = 3600): TokenResponse => ({
  access_token,
  expires_in,
});

/** An in-memory TokenStore standing in for localStorage. */
function fakeStore(seed: PersistedAuth | null = null) {
  let value = seed;
  const store: TokenStore = {
    read: () => value,
    write: (v) => {
      value = v;
    },
    clear: () => {
      value = null;
    },
  };
  return { store, peek: () => value };
}

describe("TokenManager", () => {
  it("signIn acquires interactively and reports signed in", async () => {
    const clock = fakeClock();
    const { request, calls } = fakeRequester(() => token("t1"));
    const mgr = new TokenManager(request, clock.now);

    expect(mgr.isSignedIn()).toBe(false);
    await mgr.signIn();
    expect(mgr.isSignedIn()).toBe(true);
    expect(calls).toEqual([{ silent: false }]); // sign-in is a user gesture
  });

  it("getAccessToken returns the cached token without a new request while fresh", async () => {
    const clock = fakeClock();
    const { request, calls } = fakeRequester(() => token("t1"));
    const mgr = new TokenManager(request, clock.now);

    await mgr.signIn();
    clock.advance(60_000); // still well within the 3600s lifetime, past skew
    expect(await mgr.getAccessToken()).toBe("t1");
    expect(calls.length).toBe(1); // no renewal — cache hit
  });

  it("silently renews before expiry (within the skew window)", async () => {
    const clock = fakeClock();
    const { request, calls } = fakeRequester(({ n }) => token(`t${n + 1}`));
    const mgr = new TokenManager(request, clock.now, 60_000);

    await mgr.signIn(); // t1, expires in 3600s
    // Advance to inside the 60s skew window (3600 - 30 = 3570s in).
    clock.advance(3_570_000);
    expect(await mgr.getAccessToken()).toBe("t2");
    expect(calls[1]).toEqual({ silent: true }); // renewal is silent
  });

  it("renews after hard expiry", async () => {
    const clock = fakeClock();
    const { request, calls } = fakeRequester(({ n }) => token(`t${n + 1}`));
    const mgr = new TokenManager(request, clock.now);

    await mgr.signIn();
    clock.advance(3_601_000); // past expiry
    expect(mgr.isSignedIn()).toBe(false);
    expect(await mgr.getAccessToken()).toBe("t2");
    expect(calls[1].silent).toBe(true);
  });

  it("falls back to an interactive request when silent renewal fails", async () => {
    const clock = fakeClock();
    const { request, calls } = fakeRequester(({ silent, n }) => {
      if (n === 0) return token("t1"); // initial sign-in
      if (silent) return new Error("silent blocked"); // renewal blocked
      return token("t2"); // interactive re-consent succeeds
    });
    const mgr = new TokenManager(request, clock.now);

    await mgr.signIn();
    clock.advance(3_601_000);
    expect(await mgr.getAccessToken()).toBe("t2");
    expect(calls.map((c) => c.silent)).toEqual([false, true, false]);
  });

  it("treats an error-bearing response as a failure", async () => {
    const clock = fakeClock();
    const { request } = fakeRequester(() => ({
      access_token: "",
      expires_in: 0,
      error: "access_denied",
    }));
    const mgr = new TokenManager(request, clock.now);

    await expect(mgr.signIn()).rejects.toThrow(/access_denied/);
    expect(mgr.isSignedIn()).toBe(false);
  });

  it("getAccessToken with no prior sign-in acquires (silent, then interactive)", async () => {
    const clock = fakeClock();
    const { request, calls } = fakeRequester(({ silent }) =>
      silent ? new Error("no session") : token("t1"),
    );
    const mgr = new TokenManager(request, clock.now);

    expect(await mgr.getAccessToken()).toBe("t1");
    expect(calls.map((c) => c.silent)).toEqual([true, false]);
  });

  it("persists the grant + token to the store on sign-in", async () => {
    const clock = fakeClock();
    const { request } = fakeRequester(() => token("t1", 3600));
    const { store, peek } = fakeStore();
    const mgr = new TokenManager(request, clock.now, 60_000, store);

    await mgr.signIn();
    expect(peek()).toEqual({
      granted: true,
      access_token: "t1",
      expiresAtMs: clock.now() + 3_600_000,
    });
    expect(mgr.isConnected()).toBe(true);
  });

  it("restoreSession revives a fresh-token session with NO network/popup", async () => {
    const clock = fakeClock();
    const { request, calls } = fakeRequester(() => token("should-not-run"));
    const { store } = fakeStore({
      granted: true,
      access_token: "cached",
      expiresAtMs: clock.now() + 3_600_000,
    });
    const mgr = new TokenManager(request, clock.now, 60_000, store);

    expect(await mgr.restoreSession()).toBe(true);
    expect(mgr.isConnected()).toBe(true);
    expect(mgr.isSignedIn()).toBe(true);
    expect(await mgr.getAccessToken()).toBe("cached");
    expect(calls).toEqual([]); // never touched the requester — pure cache restore
  });

  it("stays connected across token expiry (grant persists; token renews on use)", async () => {
    const clock = fakeClock();
    const { request } = fakeRequester(({ n }) => token(`fresh${n}`));
    // Prior load: granted, but the cached token has already expired.
    const { store } = fakeStore({
      granted: true,
      access_token: "old",
      expiresAtMs: clock.now() - 1,
    });
    const mgr = new TokenManager(request, clock.now, 60_000, store);

    expect(await mgr.restoreSession()).toBe(true); // still connected
    expect(mgr.isConnected()).toBe(true);
    expect(mgr.isSignedIn()).toBe(false); // but no valid token yet
    // On demand (a user action) it renews silently.
    expect(await mgr.getAccessToken()).toBe("fresh0");
    expect(mgr.isSignedIn()).toBe(true);
  });

  it("restoreSession returns false when never connected", async () => {
    const clock = fakeClock();
    const { request } = fakeRequester(() => token("t1"));
    const mgr = new TokenManager(request, clock.now, 60_000, fakeStore().store);

    expect(await mgr.restoreSession()).toBe(false);
    expect(mgr.isConnected()).toBe(false);
  });

  it("getAccessTokenSilent returns null instead of an interactive popup", async () => {
    const clock = fakeClock();
    const { request, calls } = fakeRequester(({ silent }) =>
      silent ? new Error("no session") : token("t1"),
    );
    const mgr = new TokenManager(request, clock.now);

    expect(await mgr.getAccessTokenSilent()).toBeNull();
    expect(calls.map((c) => c.silent)).toEqual([true]); // silent only, no fallback
  });

  it("signOut drops the grant and clears the store", async () => {
    const clock = fakeClock();
    const { request } = fakeRequester(() => token("t1"));
    const { store, peek } = fakeStore();
    const mgr = new TokenManager(request, clock.now, 60_000, store);

    await mgr.signIn();
    expect(mgr.isConnected()).toBe(true);
    mgr.signOut();
    expect(mgr.isConnected()).toBe(false);
    expect(mgr.isSignedIn()).toBe(false);
    expect(peek()).toBeNull();
  });
});
