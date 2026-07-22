"use client";

import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { bootstrapAtom, syncAtom } from "@/features/store";

const SYNC_INTERVAL_MS = 45_000;

/**
 * Client boundary that opens the IndexedDB repo once and populates the atoms.
 * Rendered high in the tree (layout). Uses Jotai's default global store — fine
 * for a single-account, client-only app on static export (no server runtime to
 * leak state across, §2.2). The `getRepo` promise is memoized, so React's
 * strict-mode double-effect opens the DB only once.
 *
 * It also drives the background Drive sync cadence (§8.6): the boot kick lives in
 * `bootstrapAtom`; here we add a periodic pull and a sync on tab-focus so changes
 * from another device appear without a manual refresh. `syncAtom` no-ops when
 * signed out and guards against overlapping runs, so these triggers are cheap.
 */
export function RepoBootstrap({ children }: { children: React.ReactNode }) {
  const bootstrap = useSetAtom(bootstrapAtom);
  const sync = useSetAtom(syncAtom);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const tick = () => void sync();
    const interval = setInterval(tick, SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [sync]);

  return <>{children}</>;
}
