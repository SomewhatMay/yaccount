"use client";

import { useMemo, useState } from "react";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { recordSnapshot, removeSnapshot, updateSnapshot } from "@/core/commands";
import { formatCents, parseDollars } from "@/core/money";
import type { Container, ContainerSnapshot } from "@/core/model";
import type { Op } from "@/core/oplog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetFooter } from "@/components/ui/sheet";
import { ResponsiveSheet } from "@/features/ui";
import { InlineError } from "@/features/ui/InlineError";
import { todayIso } from "@/features/clock";
import { Eyebrow } from "@/features/ui";

/**
 * What an investment container is really worth, over time (§5.6). Market growth
 * is never a transaction — it lives only in these reports. Every report is kept
 * and listed here, and a mistaken one can be corrected or removed: both are ops,
 * so the journal still holds the full history even though the list shows only
 * the current truth.
 */
export function LogBalanceSheet({
  container,
  snapshots,
  onOpenChange,
  onDispatch,
}: {
  container: Container | null;
  snapshots: ContainerSnapshot[];
  onOpenChange: (open: boolean) => void;
  onDispatch: (op: Op) => Promise<void>;
}) {
  return (
    <ResponsiveSheet
      open={container !== null}
      onOpenChange={onOpenChange}
      title="Reported balances"
      description={`What ${container?.name ?? "this container"} is actually worth. Growth isn't a transaction — log a value whenever you check.`}
    >
      {container && (
        <BalanceHistory
          key={container.id}
          container={container}
          snapshots={snapshots}
          onDispatch={onDispatch}
        />
      )}
    </ResponsiveSheet>
  );
}

function BalanceHistory({
  container,
  snapshots,
  onDispatch,
}: {
  container: Container;
  snapshots: ContainerSnapshot[];
  onDispatch: (op: Op) => Promise<void>;
}) {
  const history = useMemo(
    () =>
      snapshots
        .filter((s) => s.container_id === container.id)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [snapshots, container.id],
  );

  const [editing, setEditing] = useState<ContainerSnapshot | null>(null);
  const [removing, setRemoving] = useState<ContainerSnapshot | null>(null);
  const [date, setDate] = useState(todayIso());
  const [amountStr, setAmountStr] = useState("");
  const [error, setError] = useState("");

  // One report per day (§5.6): saving onto an occupied day replaces it, so say so
  // before the user commits rather than surprising them after.
  const clash = history.find((s) => s.date === date && s.id !== editing?.id);

  function startEdit(s: ContainerSnapshot) {
    setEditing(s);
    setDate(s.date);
    setAmountStr((s.reported_balance / 100).toFixed(2));
  }

  function cancelEdit() {
    setEditing(null);
    setDate(todayIso());
    setAmountStr("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let reported: number;
    try {
      reported = parseDollars(amountStr);
    } catch {
      return setError("Enter a valid amount.");
    }

    if (editing) {
      await onDispatch(updateSnapshot({ ...editing, date, reported_balance: reported }));
    } else {
      await onDispatch(
        recordSnapshot({ container_id: container.id, date, reported_balance: reported }),
      );
    }
    cancelEdit();
  }

  async function remove(s: ContainerSnapshot) {
    setRemoving(null);
    if (editing?.id === s.id) cancelEdit();
    await onDispatch(removeSnapshot(s.id));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form onSubmit={save} className="grid gap-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor="snapshot-date">As of</Label>
          <Input
            id="snapshot-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {clash && (
            <p className="text-muted-foreground text-xs">
              This day already reports {formatCents(clash.reported_balance)} — saving
              replaces it.
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="snapshot-amount">Reported value</Label>
          <Input
            id="snapshot-amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="tnum font-mono"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "snapshot-error" : undefined}
          />
          {error && <InlineError id="snapshot-error">{error}</InlineError>}
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit">{editing ? "Save changes" : "Save report"}</Button>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={cancelEdit}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Eyebrow as="h3" className="mb-2 px-1">
          History
        </Eyebrow>
        <div className="bg-card overflow-hidden rounded-2xl border">
          {history.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              No reports yet. Log the first one above.
            </p>
          ) : (
            history.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  "group hover:bg-muted/40 flex items-center gap-3 px-4 py-2.5 transition-colors",
                  i > 0 && "border-t",
                  editing?.id === s.id && "bg-primary/[0.06]",
                )}
              >
                <span className="flex-1 text-sm">{s.date}</span>
                <span className="tnum font-mono text-sm">
                  {formatCents(s.reported_balance)}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground size-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      aria-label={`Actions for the ${s.date} report`}
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startEdit(s)}>
                      <PencilIcon className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setRemoving(s)}
                    >
                      <Trash2Icon className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </div>

      <SheetFooter className="mt-auto" />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing
                ? `${removing.date} · ${formatCents(removing.reported_balance)} leaves the list.`
                : ""}{" "}
              No money moves — a reported value is just what you observed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove(removing)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
