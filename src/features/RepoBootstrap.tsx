"use client";

import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { bootstrapAtom } from "@/features/store";

/**
 * Client boundary that opens the IndexedDB repo once and populates the atoms.
 * Rendered high in the tree (layout). Uses Jotai's default global store — fine
 * for a single-account, client-only app on static export (no server runtime to
 * leak state across, §2.2). The `getRepo` promise is memoized, so React's
 * strict-mode double-effect opens the DB only once.
 */
export function RepoBootstrap({ children }: { children: React.ReactNode }) {
  const bootstrap = useSetAtom(bootstrapAtom);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  return <>{children}</>;
}
