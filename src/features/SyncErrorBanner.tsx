"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { CloudOffIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncStatusAtom, lastSyncErrorAtom, syncAtom } from "@/features/store";

/**
 * A sync that keeps failing (§12.6, §8.6). The `SyncIndicator` glyph in the
 * header is the quiet, everyday signal; when a whole cycle fails, a small glyph
 * is too weak to notice, so this strip states it plainly on every screen until a
 * cycle succeeds and clears it.
 *
 * It is NOT rose: a failed background sync is not danger — §12.2 reserves rose
 * for a real negative, and the app stays fully usable with every change safe in
 * this device's ledger. So the strip is a recessed, muted status line with the
 * struck-cloud, the reason, and a way to try again — surfacing M9's state, not
 * re-plumbing it.
 */
export function SyncErrorBanner() {
  const status = useAtomValue(syncStatusAtom);
  const detail = useAtomValue(lastSyncErrorAtom);
  const sync = useSetAtom(syncAtom);

  if (status !== "error") return null;

  return (
    <div
      role="status"
      className="bg-surface-sunken mb-5 flex items-start gap-3 rounded-xl border px-4 py-3"
    >
      <CloudOffIcon
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          Your changes are safe on this device, but syncing to Google Drive isn&apos;t
          working right now.
        </p>
        {detail && (
          <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
            {detail}
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 rounded-full"
        onClick={() => void sync()}
      >
        <RefreshCwIcon className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}
