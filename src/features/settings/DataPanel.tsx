"use client";

import { useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  DownloadIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection, ConfirmDestructive } from "@/features/ui";
import { validateExport } from "@/core/data";
import type { Op } from "@/core/oplog";
import type { RetiredFile } from "@/sync";
import { getAuthProvider } from "@/auth/web";
import { createLogger } from "@/lib/logger";
import {
  backupsAtom,
  clearAllDataAtom,
  dismissOrphanAtom,
  exportDataAtom,
  importDataAtom,
  loadBackupsAtom,
  orphanNoteAtom,
  readBackupAtom,
  restoreBackupAtom,
  type DataFile,
} from "@/features/store";
import { BlockingOperationOverlay } from "@/features/settings/BlockingOperationOverlay";
import {
  createBlockingOperation,
  shouldWarnBeforeUnload,
  type BlockingOperationState,
} from "@/features/settings/blocking-operation";

const log = createLogger("data-tools");

/** Hand a file to the browser. The only user-accessible copy of an account: the
 * Drive files live in the hidden AppData area, which no one can browse. */
function download({ name, text }: DataFile): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const RETIRED_LABEL: Record<string, string> = {
  clear: "Before clearing",
  import: "Before an import",
  restore: "Before a rollback",
};

type Pending =
  | { kind: "clear" }
  | { kind: "import"; ops: Op[]; fileName: string }
  | { kind: "restore"; backup: RetiredFile };

/**
 * Export, import, clear and roll back — the tools for putting a known state on
 * the app, and for getting your data back out of it.
 *
 * Two things shape every control here. First, these act on BOTH stores: clearing
 * only this device would simply be undone by the next sync pulling Drive back
 * down, so the Drive copy is replaced too and the copy says so plainly. Second,
 * nothing is destroyed — the world being replaced is retired to Drive first and
 * stays in the restore list below, so "clear" means the app stops reading your
 * data, not that it is gone (§1.1).
 */
export function DataPanel() {
  const orphan = useAtomValue(orphanNoteAtom);
  const backups = useAtomValue(backupsAtom);

  const exportData = useSetAtom(exportDataAtom);
  const importData = useSetAtom(importDataAtom);
  const clearAll = useSetAtom(clearAllDataAtom);
  const restoreBackup = useSetAtom(restoreBackupAtom);
  const loadBackups = useSetAtom(loadBackupsAtom);
  const readBackup = useSetAtom(readBackupAtom);
  const dismissOrphan = useSetAtom(dismissOrphanAtom);

  const fileInput = useRef<HTMLInputElement>(null);
  const [connected, setConnected] = useState(false);
  const [working, setWorking] = useState(false);
  const [blocking, setBlocking] = useState<BlockingOperationState>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [replacementError, setReplacementError] = useState<{
    summary: string;
    job: Pending;
  } | null>(null);
  const blockingOperation = useRef<ReturnType<typeof createBlockingOperation> | null>(
    null,
  );
  if (blockingOperation.current === null) {
    blockingOperation.current = createBlockingOperation(setBlocking);
  }
  const busy = working || blocking !== null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadBackups();
      } catch (err) {
        log.capture("could not list the restore points", err);
      }
      if (!cancelled) setConnected(getAuthProvider().isConnected());
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBackups]);

  useEffect(() => {
    if (!shouldWarnBeforeUnload(blocking)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [blocking]);

  async function run(what: string, task: () => Promise<void>): Promise<void> {
    setWorking(true);
    try {
      await task();
    } catch (err) {
      const summary = log.capture(`${what} failed`, err);
      toast.error(`Couldn't ${what}.`, { description: summary });
    } finally {
      setWorking(false);
    }
  }

  async function onPickFile(file: File): Promise<void> {
    setProblems(null);
    const text = await file.text();
    const result = await validateExport(text);
    if (!result.ok) {
      setProblems(result.errors);
      toast.error("That file can't be imported.", {
        description: "Nothing was changed.",
      });
      return;
    }
    setPending({ kind: "import", ops: result.ops, fileName: file.name });
  }

  function beginReplacement(job: Pending): void {
    setReplacementError(null);
    const what =
      job.kind === "clear"
        ? "clear your data"
        : job.kind === "import"
          ? "import that file"
          : "roll back";
    const running = blockingOperation.current!.start(job.kind, async () => {
      let success: { message: string; description: string };
      if (job.kind === "clear") {
        await clearAll();
        success = {
          message: "Everything cleared",
          description: connected
            ? "Your previous data is saved on Drive as a restore point."
            : "This device only — you're not connected to Google.",
        };
      } else if (job.kind === "import") {
        await importData(job.ops);
        success = {
          message: "Import complete",
          description: `${job.ops.length} changes restored.`,
        };
      } else {
        await restoreBackup(job.backup.name);
        success = {
          message: "Rolled back",
          description: when(job.backup.at),
        };
      }
      await loadBackups();
      toast.success(success.message, { description: success.description });
    });

    // `start` publishes busy synchronously. Only then close the confirmation.
    setPending(null);
    void running.then((result) => {
      if (!result.ok && result.reason === "failed") {
        const summary = log.capture(`${what} failed`, result.error);
        setReplacementError({ summary, job });
      }
    });
  }

  function confirmPending(): void {
    if (pending) beginReplacement(pending);
  }

  const driveLine = connected
    ? "Your Google Drive copy is replaced too, so your other devices empty themselves the next time they sync."
    : "You're not connected to Google, so this only changes this device. If you connect later, whatever is on Drive will merge back in.";

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg tracking-tight">Your data</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Take a copy with you, put a known state on the app, or start over. Clearing and
          importing replace your Google Drive copy as well.
        </p>
      </div>

      {orphan ? (
        <div className="bg-muted/40 space-y-3 rounded-2xl border p-5">
          <div className="flex items-start gap-3">
            <TriangleAlertIcon
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                This account was reset on another device.
              </p>
              <p className="text-muted-foreground text-sm">
                On {when(orphan.at)} someone cleared or replaced this account elsewhere,
                so this device caught up. The {orphan.opCount} changes that were here were
                set aside on Drive, not deleted — you can take a copy or put them back.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={busy || !connected}
              onClick={() =>
                void run("download that data", async () =>
                  download(await readBackup(orphan.path)),
                )
              }
            >
              <DownloadIcon className="size-3.5" /> Download it
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground rounded-full"
              onClick={() => void run("dismiss the notice", dismissOrphan)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <div className="bg-card divide-y rounded-2xl border">
        <DataRow
          title="Export everything"
          hint="A single file holding every change ever made here. Keep it somewhere safe — it's the only copy you can open yourself."
          action={
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() =>
                void run("export your data", async () => {
                  download(await exportData());
                  toast.success("Export downloaded");
                })
              }
            >
              <DownloadIcon className="size-3.5" /> Export
            </Button>
          }
        />

        <DataRow
          title="Import a file"
          hint={`Replaces everything with the contents of an export. The file is checked in full first — if anything is wrong, nothing changes. ${driveLine}`}
          action={
            <>
              {/* `hidden`, not `sr-only`: a clipped file input is still a
                  control in the accessibility tree, so screen-reader users met
                  an unlabelled second "Choose File" next to the real one. The
                  button below is the labelled control; this is its plumbing. */}
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // let the same file be picked twice
                  if (file) void run("read that file", () => onPickFile(file));
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <UploadIcon className="size-3.5" /> Choose file
              </Button>
            </>
          }
        />

        <DataRow
          title="Clear everything"
          hint={`Stands the app down to an empty ledger. Your current data is retired to Drive as a restore point first, so you can roll it back. ${driveLine}`}
          action={
            <Button
              size="sm"
              variant="destructive"
              className="rounded-full"
              disabled={busy}
              onClick={() => setPending({ kind: "clear" })}
            >
              <Trash2Icon className="size-3.5" /> Clear everything
            </Button>
          }
        />
      </div>

      {problems ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 space-y-2 rounded-2xl border p-5"
        >
          <p className="text-sm font-medium">That file wasn&apos;t imported.</p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            {problems.slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {problems.length > 8 ? (
            <p className="text-muted-foreground text-xs">
              …and {problems.length - 8} more.
            </p>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground rounded-full"
            onClick={() => setProblems(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {replacementError ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 space-y-3 rounded-2xl border p-5"
        >
          <div className="space-y-1">
            <p className="text-sm font-medium">The replacement didn&apos;t finish.</p>
            <p className="text-muted-foreground text-sm">
              {replacementError.summary} Check your connection, keep yaccount open, then
              try again.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="rounded-full"
              disabled={busy}
              onClick={() => beginReplacement(replacementError.job)}
            >
              Try again
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground rounded-full"
              disabled={busy}
              onClick={() => setReplacementError(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <CollapsibleSection title="Restore points" count={backups?.length ?? 0}>
        <div className="bg-card divide-y rounded-2xl border">
          {(backups ?? []).map((backup) => (
            <div
              key={backup.name}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {backup.origin === "orphan"
                    ? "Set aside from this device"
                    : (RETIRED_LABEL[backup.kind ?? ""] ?? "Earlier state")}
                </p>
                <p className="text-muted-foreground tnum font-mono text-xs">
                  {when(backup.at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground rounded-full"
                  aria-label={`Download the state from ${when(backup.at)}`}
                  disabled={busy}
                  onClick={() =>
                    void run("download that state", async () =>
                      download(await readBackup(backup.name)),
                    )
                  }
                >
                  <DownloadIcon className="size-3.5" /> Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  aria-label={`Roll back to the state from ${when(backup.at)}`}
                  disabled={busy}
                  onClick={() => setPending({ kind: "restore", backup })}
                >
                  <RotateCcwIcon className="size-3.5" /> Roll back
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {connected && backups !== null && backups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No restore points yet. One is saved automatically each time you clear, import or
          roll back.
        </p>
      ) : null}

      <ConfirmDestructive
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === "import"
            ? "Replace everything with this file?"
            : pending?.kind === "restore"
              ? "Roll back to this state?"
              : "Clear everything?"
        }
        phrase={
          pending?.kind === "import"
            ? "replace"
            : pending?.kind === "restore"
              ? "roll back"
              : "erase"
        }
        confirmLabel={
          pending?.kind === "import"
            ? "Replace everything"
            : pending?.kind === "restore"
              ? "Roll back"
              : "Clear everything"
        }
        onConfirm={confirmPending}
      >
        {pending?.kind === "import" ? (
          <>
            <p>
              Everything in yaccount is replaced by the {pending.ops.length} changes in{" "}
              <span className="font-mono">{pending.fileName}</span>.
            </p>
            <p>{driveLine}</p>
            <p>
              Your current data is retired to Drive as a restore point first, so this can
              be rolled back.
            </p>
          </>
        ) : pending?.kind === "restore" ? (
          <>
            <p>
              Everything in yaccount goes back to how it was on {when(pending.backup.at)}.
            </p>
            <p>{driveLine}</p>
            <p>
              Where you are now is retired to Drive as a restore point first, so you can
              come back to it.
            </p>
          </>
        ) : (
          <>
            <p>yaccount starts over with an empty ledger and one wallet.</p>
            <p>{driveLine}</p>
            <p>
              Nothing is destroyed: your current data is retired to Drive as a restore
              point first, and stays in the list on this screen.
            </p>
          </>
        )}
      </ConfirmDestructive>
      {blocking ? <BlockingOperationOverlay operation={blocking} /> : null}
    </section>
  );
}

/** One tool: what it does on the left, the control on the right. */
function DataRow({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 p-5">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">{hint}</p>
      </div>
      <div className="flex shrink-0 gap-2">{action}</div>
    </div>
  );
}
