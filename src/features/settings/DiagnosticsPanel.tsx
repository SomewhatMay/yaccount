"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAtomValue } from "jotai";
import { Trash2Icon } from "lucide-react";
import { Repo } from "@/core/repo";
import { DB_NAME, DB_VERSION, STORE } from "@/core/repo/db";
import {
  lastSyncErrorAtom,
  lastSyncedAtAtom,
  syncStatusAtom,
} from "@/features/store";
import { CopyButton, DownloadDiagnosticsButton } from "@/features/ErrorBoundary";
import { createLogger, withoutBrowserFacts, type LogRecord } from "@/lib/logger";
import { BUILD_INFO, buildInfoFacts } from "@/lib/build-info";
import {
  clearDiagnostics,
  collectDiagnostics,
  readDiagnosticsRecords,
} from "@/lib/diagnostics-export";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/features/ui";

const log = createLogger("ui");

const LEVEL_TONE: Record<LogRecord["level"], string> = {
  trace: "text-muted-foreground/70",
  debug: "text-muted-foreground/70",
  info: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-500",
  error: "text-destructive",
};

/**
 * What to send when something goes wrong.
 *
 * yaccount has no server and no crash reporting, so the only way a problem
 * becomes fixable is if the user can hand over a concrete picture of their
 * install. This is that picture: the facts (versions, device, counts, last sync
 * failure) plus the tail of the log, redacted, behind one Copy button.
 */
/** Hydration is a one-way trip, so this store never has to announce a change. */
const subscribeNothing = () => () => {};

export function DiagnosticsPanel() {
  const syncStatus = useAtomValue(syncStatusAtom);
  const lastSyncedAt = useAtomValue(lastSyncedAtAtom);
  const lastSyncError = useAtomValue(lastSyncErrorAtom);

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [opCount, setOpCount] = useState<number | null>(null);
  const [outboxCount, setOutboxCount] = useState<number | null>(null);
  const [transactionCount, setTransactionCount] = useState<number | null>(null);
  const [records, setRecords] = useState<LogRecord[]>([]);
  // `navigator` and the time zone exist on the first client render but NOT in
  // the prerendered HTML, so rendering them straight away disagrees with the
  // markup React is hydrating. Read "has this hydrated yet" as the external
  // fact it is. Unlike a setState in an effect, this neither cascades renders nor
  // trips `react-hooks/set-state-in-effect`.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const repo = await Repo.open();
        const [id, ops, outbox, transactions] = await Promise.all([
          repo.getDeviceId(),
          repo.listOps(),
          repo.getAll(STORE.outbox),
          repo.count(STORE.transactions),
        ]);
        if (cancelled) return;
        setDeviceId(id);
        setOpCount(ops.length);
        setOutboxCount(outbox.length);
        setTransactionCount(transactions);
      } catch (err) {
        // The panel is the place you land WHEN things are broken, so it has to
        // survive the repo being the broken thing.
        log.capture("diagnostics could not read the repo", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the buffer rather than subscribing: logging must never re-render the app.
  // The first read is deferred a tick — reading it during render would disagree
  // with the pre-hydration HTML, and writing state synchronously inside an effect
  // cascades renders.
  useEffect(() => {
    let cancelled = false;
    let reading = false;
    const tick = async () => {
      if (reading) return;
      reading = true;
      const next = await readDiagnosticsRecords();
      reading = false;
      if (!cancelled) setRecords(next);
    };
    const first = setTimeout(() => void tick(), 0);
    const id = setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const facts = useCallback(
    () => ({
      ...buildInfoFacts(BUILD_INFO),
      "user agent": typeof navigator === "undefined" ? null : navigator.userAgent,
      language: typeof navigator === "undefined" ? null : navigator.language,
      "time zone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      database: `${DB_NAME} v${DB_VERSION}`,
      "device id": deviceId,
      transactions: transactionCount,
      "ops in journal": opCount,
      "queued to sync": outboxCount,
      "sync status": syncStatus,
      "last synced": lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
      "last sync error": lastSyncError,
    }),
    [
      deviceId,
      transactionCount,
      opCount,
      outboxCount,
      syncStatus,
      lastSyncedAt,
      lastSyncError,
    ],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg tracking-tight">Diagnostics</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            If something misbehaves, copy this and send it along. Access tokens and email
            addresses are stripped out.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton
            text={() => collectDiagnostics(facts())}
            label="Copy diagnostics"
            className="rounded-full border"
          />
          <DownloadDiagnosticsButton
            text={() => collectDiagnostics(facts())}
            className="rounded-full border"
          />
        </div>
      </div>

      <dl className="bg-card grid gap-x-6 gap-y-2 rounded-2xl border p-5 text-sm sm:grid-cols-2">
        {Object.entries(mounted ? facts() : withoutBrowserFacts(facts())).map(
          ([k, v]) => (
            // `min-w-0` at THIS level too: a grid item defaults to `min-width:auto`,
            // so a nowrap-truncated value (the user-agent string) would set the
            // track to its full width and scroll the whole page sideways.
            <div key={k} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="text-muted-foreground shrink-0">{k}</dt>
              <dd className="tnum min-w-0 truncate text-right font-mono text-xs">
                {k === "commit SHA" && BUILD_INFO.commitUrl ? (
                  <a
                    href={BUILD_INFO.commitUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {BUILD_INFO.shortSha}
                  </a>
                ) : v === null || v === "" ? (
                  "—"
                ) : (
                  String(v)
                )}
              </dd>
            </div>
          ),
        )}
      </dl>

      <div className="bg-card overflow-hidden rounded-2xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Eyebrow as="span">Log</Eyebrow>
            <span className="text-muted-foreground/70 tnum font-mono text-xs">
              {records.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground rounded-full"
              onClick={() => {
                void clearDiagnostics();
                setRecords([]);
              }}
            >
              <Trash2Icon className="size-3.5" />
              Clear
            </Button>
          </div>
        </div>

        {records.length === 0 ? (
          <p className="text-muted-foreground px-5 py-10 text-center text-sm">
            Nothing logged yet. Anything the app notices will show up here.
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-auto">
            {[...records].reverse().map((r, i) => (
              <li key={`${r.at}-${i}`} className="px-5 py-2 font-mono text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground/60 shrink-0">
                    {r.at.slice(11, 19)}
                  </span>
                  <span className={cn("shrink-0 uppercase", LEVEL_TONE[r.level])}>
                    {r.level}
                  </span>
                  <span className="text-muted-foreground/70 shrink-0">[{r.scope}]</span>
                  <span className="min-w-0 break-words">{r.message}</span>
                </div>
                {r.detail && (
                  <pre className="text-muted-foreground/60 mt-1 max-h-24 overflow-auto text-[11px] whitespace-pre-wrap">
                    {r.detail}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
