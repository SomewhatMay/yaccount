"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { RefreshCwIcon, CloudIcon, CloudOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  syncStatusAtom,
  lastSyncedAtAtom,
  lastSyncErrorAtom,
  syncAtom,
  reconnectAtom,
} from "@/features/store";

export const SYNC_ATTENTION_CLASS =
  "bg-destructive text-white hover:bg-destructive/85 focus-visible:ring-destructive/40 dark:bg-destructive dark:text-background dark:hover:bg-destructive/85";

/**
 * The Drive-sync status affordance (§8.6 "non-intrusive indicator", §12 quiet
 * voice). Signed out → renders nothing (the sign-in control speaks). Otherwise a
 * small, muted icon: a spinning refresh while a cycle runs, a cloud when settled,
 * a struck-through cloud on a Drive/network error (tap to retry). When the token
 * needs an interactive renewal (§3.3-B) it becomes a "Reconnect" pill — the one
 * moment sync needs a user gesture.
 */
function relativeTime(ms: number | null): string {
  if (ms === null) return "";
  const secs = Math.round((Date.now() - ms) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export function SyncIndicator() {
  const status = useAtomValue(syncStatusAtom);
  const lastSyncedAt = useAtomValue(lastSyncedAtAtom);
  const lastError = useAtomValue(lastSyncErrorAtom);
  const sync = useSetAtom(syncAtom);
  const reconnect = useSetAtom(reconnectAtom);

  if (status === "idle") return null; // signed out — nothing to show

  if (status === "disconnected") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={`${SYNC_ATTENTION_CLASS} rounded-full`}
        onClick={() => void reconnect()}
      >
        <CloudOffIcon className="size-4" />
        Reconnect
      </Button>
    );
  }

  const syncing = status === "syncing";
  const error = status === "error";
  const label = syncing
    ? "Syncing with Google Drive…"
    : error
      ? `Couldn't reach Drive — tap to retry${lastError ? ` · ${lastError}` : ""}`
      : `Synced ${relativeTime(lastSyncedAt)}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={error ? "destructive" : "ghost"}
            size="icon"
            className={
              error
                ? `${SYNC_ATTENTION_CLASS} rounded-full`
                : "text-muted-foreground rounded-full"
            }
            onClick={() => void sync()}
            aria-label={label}
          >
            {syncing ? (
              <RefreshCwIcon className="size-4 animate-spin motion-reduce:animate-none" />
            ) : error ? (
              <CloudOffIcon className="size-4" />
            ) : (
              <CloudIcon className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
