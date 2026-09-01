"use client";

import { useEffect, useState } from "react";
import { atom, useAtom, useSetAtom } from "jotai";
import { toast } from "sonner";
import { LogInIcon, LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { getAuthProvider } from "@/auth/web";
import { syncNowAtom, syncStatusAtom } from "@/features/store";
import { SYNC_ATTENTION_CLASS } from "@/features/SyncIndicator";
import { RowActions } from "@/features/ui";

const connectedAtom = atom<boolean | null>(null);

/**
 * The sign-in control (§3.3-B, §12 "Quiet Register" — a calm header affordance,
 * iris spark used sparingly). Signing in acquires a real `drive.appdata` token
 * via the GIS popup and records a durable grant; on success we call
 * `getAccessToken()` to prove the M8 exit criterion (a valid token is
 * obtainable). The connection persists across reloads/tab-closes (the grant is
 * stored); the token itself is renewed silently on demand during use. No data
 * syncs yet — Drive sync is M9. The auth provider is a module singleton.
 */
export function AuthButton({ signedOutOnly = false }: { signedOutOnly?: boolean }) {
  // `null` = not yet known (pre-restore). We render a neutral placeholder in
  // that state rather than defaulting to "Sign in", which would flash a wrong
  // signed-out control for a frame on every load before the grant is read.
  const [connected, setConnected] = useAtom(connectedAtom);
  const [busy, setBusy] = useState(false);
  const sync = useSetAtom(syncNowAtom);
  const setSyncStatus = useSetAtom(syncStatusAtom);

  // Restore the durable connection on mount — no popup, no network. The token is
  // renewed silently later, on demand, while the user's Google session is alive.
  useEffect(() => {
    let cancelled = false;
    void getAuthProvider()
      .restoreSession()
      .then((ok) => {
        if (!cancelled) setConnected(ok);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn() {
    setBusy(true);
    try {
      const auth = getAuthProvider();
      await auth.signIn();
      // Prove the seam end-to-end: a valid token is retrievable (M8 exit).
      await auth.getAccessToken();
      setConnected(auth.isConnected());
      toast.success("Connected to Google", {
        description: "Your data now syncs to your Drive across devices.",
      });
      void sync(); // pull anything already on Drive + push this device's ops (§8.4)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      toast.error("Couldn't sign in", { description: message });
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    getAuthProvider().signOut();
    setConnected(false);
    setSyncStatus("idle"); // stop showing the sync affordance — nothing to sync now
    toast("Disconnected from Google", {
      description: "Your data stays on this device until you reconnect.",
    });
  }

  // Unknown state (pre-restore): a same-size, invisible placeholder so the
  // header doesn't shift and no misleading control flashes.
  if (connected === null) {
    return signedOutOnly ? null : <div className="h-8 w-[92px]" aria-hidden />;
  }

  if (!connected) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={`${SYNC_ATTENTION_CLASS} rounded-full`}
        disabled={busy}
        onClick={signIn}
      >
        <LogInIcon className="size-4" />
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    );
  }

  if (signedOutOnly) return null;

  return (
    <RowActions label="Google account actions" className="text-positive opacity-100">
      <DropdownMenuItem onClick={signOut}>
        <LogOutIcon className="size-4" />
        Sign out
      </DropdownMenuItem>
    </RowActions>
  );
}
