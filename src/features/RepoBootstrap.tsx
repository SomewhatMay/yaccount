"use client";

import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { bootstrapAtom, syncAtom } from "@/features/store";
import { createLogger } from "@/lib/logger";
import { reportUnhandledError } from "@/lib/unhandled-error";

const SYNC_INTERVAL_MS = 45_000;
const log = createLogger("app");

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

  // The net under everything else: an exception no boundary caught, or a promise
  // nobody awaited. Without this they reach the console and nowhere else, which
  // is why "it just didn't do anything" has been impossible to chase down.
  // Errors already reported at their own seam (a failed dispatch) are marked
  // handled and skipped here — one mistake, one message.
  useEffect(() => {
    const report = (err: unknown, kind: string) => reportUnhandledError(log, err, kind);
    const onError = (e: ErrorEvent) => report(e.error ?? e.message, "uncaught error");
    const onRejection = (e: PromiseRejectionEvent) =>
      report(e.reason, "unhandled promise rejection");

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

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
