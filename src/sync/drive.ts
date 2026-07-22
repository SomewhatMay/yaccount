/**
 * The real Drive backend for the Checkpointer: drivestore over the user's own
 * Google Drive `appDataFolder` (§4/§8.4). This is the ONE file that imports
 * `drivestore` — everything else in `src/sync` is pure and testable against a
 * fake `DriveFS`. Client-only by construction (the token seam touches `window`).
 *
 * The access token comes from the M8 auth seam. Background sync ticks pre-gate on
 * `getAccessTokenSilent()` (no popup), so by the time drivestore calls this
 * callback a fresh token is already cached; `getAccessToken()` returns it without
 * UI. An interactive re-consent only ever fires from the user-gesture reconnect
 * path (§3.3-B), never from a background request.
 */
import { createDriveStore, DriveError } from "drivestore";
import { getAuthProvider } from "@/auth/web";
import type { DriveFS } from "./checkpointer";

/**
 * A human-readable summary of a sync failure. drivestore's `DriveError` shape
 * (`.status`/`.body`, §4) is known ONLY here — the seam's whole point — so a
 * 403/401/CORS is legible in the UI without any layer above importing drivestore.
 */
export function describeSyncError(err: unknown): string {
  if (err instanceof DriveError) {
    const detail = (err.body || err.message || "").slice(0, 300);
    return `Drive ${err.status}${detail ? `: ${detail}` : ""}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

let fsSingleton: DriveFS | null = null;

/** The app-wide Drive filesystem (a stateful handle — a module singleton, like
 * the repo and auth provider). `rootName` scopes all files under a `yaccount/`
 * folder inside the hidden AppData area. */
export function getDriveFS(): DriveFS {
  if (!fsSingleton) {
    // DriveStore is a structural superset of DriveFS, so it satisfies it directly.
    fsSingleton = createDriveStore({
      accessToken: () => getAuthProvider().getAccessToken(),
      rootName: "yaccount",
      // Bind `fetch` to the global: the browser's `fetch` throws "Illegal
      // invocation" if called with a `this` other than `window`, which happens
      // when the store holds the reference and calls it as a method. A bound
      // wrapper guarantees the right receiver regardless of how it's invoked.
      fetch: globalThis.fetch.bind(globalThis),
    });
  }
  return fsSingleton;
}
