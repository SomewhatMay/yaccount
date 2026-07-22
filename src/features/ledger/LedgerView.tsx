"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookmarkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import {
  categoriesAtom,
  containersAtom,
  defaultContainerIdAtom,
  dispatchAtom,
  flashedRowAtom,
  readyAtom,
  transactionsAtom,
  type FlashedRow,
} from "@/features/store";
import {
  createTemplate,
  removeTemplate,
  unvoidTransaction,
  voidTransaction,
} from "@/core/commands";
import { isLiveLedgerRow, isTransfer, overallBalance } from "@/core/engine/balances";
import { activeRows, sortForRegister } from "@/core/engine/ledger";
import {
  formatEnteredTime,
  thisMonthIso,
  todayIso,
  yesterdayIso,
} from "@/features/clock";
import { formatCents } from "@/core/money";
import type { Transaction } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import {
  EmptyState,
  Eyebrow,
  Figure,
  FigureSkeleton,
  ListSkeleton,
  Marginalia,
  Money,
} from "@/features/ui";
import { ComposeBar } from "@/features/ledger/ComposeBar";
import { EditTransactionSheet } from "@/features/ledger/EditTransactionSheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDay(iso: string): string {
  if (iso === todayIso()) return "Today";
  if (iso === yesterdayIso()) return "Yesterday";
  return dayFormat.format(new Date(iso + "T00:00:00"));
}

/** Show the clock time only where a burst of entries actually happens — it is
 * what separates three rows logged this afternoon; on older days it is noise. */
function showsTime(iso: string): boolean {
  return iso === todayIso() || iso === yesterdayIso();
}

export function LedgerView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const transactions = useAtomValue(transactionsAtom);
  const defaultContainerId = useAtomValue(defaultContainerIdAtom);
  const flashed = useAtomValue(flashedRowAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // The headline is Current Overall Balance (§5.7): only containers the user
  // opted in are counted, so money saved toward something never inflates it.
  const balance = useMemo(
    () => overallBalance(transactions, containers),
    [transactions, containers],
  );

  const counted = useMemo(
    () => containers.filter((c) => c.include_in_overall_balance),
    [containers],
  );

  // This-month in/out across the counted containers. Transfers are excluded —
  // moving your own money between containers is neither income nor expense.
  const { monthIn, monthOut } = useMemo(() => {
    const ym = thisMonthIso();
    const ids = new Set(counted.map((c) => c.id));
    let inSum = 0;
    let outSum = 0;
    for (const t of transactions) {
      if (!isLiveLedgerRow(t) || isTransfer(t)) continue;
      if (!ids.has(t.container_id) || t.yearMonth !== ym) continue;
      if (t.amount >= 0) inSum += t.amount;
      else outSum += -t.amount;
    }
    return { monthIn: inSum, monthOut: outSum };
  }, [transactions, counted]);

  const nameOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "Transfer");
  }, [categories]);

  // Show which wallet a row moved through only once there is more than one.
  const containerNameOf = useMemo(() => {
    const m = new Map(containers.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "");
  }, [containers]);
  const showContainer = containers.filter((c) => !c.is_archived).length > 1;
  const uncounted = containers.filter(
    (c) => !c.is_archived && !c.include_in_overall_balance,
  ).length;

  // Deleting appends a reversing row and undoing appends one that reverses THAT,
  // so what is live is a chain walk (§0.3) — `activeRows` owns the rule.
  const groups = useMemo(() => {
    // Newest first, with the entry clock breaking each day's tie — `date` alone
    // can't order a burst of entries logged the same afternoon (§ sortForRegister).
    const rows = sortForRegister(activeRows(transactions));
    const out: { day: string; items: Transaction[] }[] = [];
    for (const t of rows) {
      const last = out[out.length - 1];
      if (last && last.day === t.date) last.items.push(t);
      else out.push({ day: t.date, items: [t] });
    }
    return out;
  }, [transactions]);

  // Save a row as a 1-tap shortcut (§5.8). The template keeps the shape (transfer
  // vs. expense/income) so quick-logging it later reproduces the same kind of row.
  async function saveShortcut(t: Transaction) {
    const transfer = t.to_container_id !== null;
    const id = crypto.randomUUID();
    const input = {
      id,
      template_name: t.vendor_source,
      amount: transfer ? Math.abs(t.amount) : t.amount,
      vendor_source: t.vendor_source,
      container_id: t.container_id,
      category_id: transfer ? null : t.category_id,
      to_container_id: transfer ? t.to_container_id : null,
    };
    await dispatch(createTemplate(input));
    toast.success("Saved as shortcut", {
      description: t.vendor_source,
      action: { label: "Undo", onClick: () => void dispatch(removeTemplate(id)) },
    });
  }

  async function del(t: Transaction) {
    const op = voidTransaction(t);
    await dispatch(op);
    if (editing?.id === t.id) setEditing(null);
    const voidRow = op.type === "transaction.void" ? op.payload.row : null;
    toast.success("Deleted", {
      description: `${t.vendor_source} · ${formatCents(t.amount)}`,
      action: voidRow
        ? {
            label: "Undo",
            onClick: () => {
              // Undo is an op too: a row reversing the reversal, so the ledger
              // records the delete AND the undo rather than erasing either.
              void dispatch(unvoidTransaction(voidRow)).then(() =>
                toast.success("Restored", { description: t.vendor_source }),
              );
            },
          }
        : undefined,
    });
  }

  if (!ready)
    return (
      <div className="space-y-6">
        <FigureSkeleton />
        <div className="bg-card overflow-hidden rounded-2xl border">
          <ListSkeleton />
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <Figure label="Overall balance" cents={balance}>
        <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-foreground/70 font-medium">This month</span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowDownLeftIcon className="text-positive size-4" />
            <Money cents={monthIn} className="text-foreground" />
            in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpRightIcon className="size-4" />
            <Money cents={monthOut} className="text-foreground" />
            out
          </span>
        </div>
        {uncounted > 0 && (
          <Marginalia className="mt-2">
            {uncounted} container{uncounted === 1 ? "" : "s"} not counted
          </Marginalia>
        )}
      </Figure>

      {/* Shortcuts moved into the quick-add sheet (M11): they belong where you
          are about to write, not on the screen you read. */}
      <ComposeBar
        categories={categories}
        containers={containers}
        defaultContainerId={defaultContainerId}
      />

      <div className="bg-card overflow-hidden rounded-2xl border">
        {groups.length === 0 ? (
          <EmptyState title="Nothing logged yet">
            Every entry you add lands here, newest first. Start with what you spent today.
          </EmptyState>
        ) : (
          groups.map((g, gi) => (
            <div key={g.day} className={cn(gi > 0 && "border-t")}>
              <Eyebrow
                as="h2"
                className="bg-surface-sunken border-b px-5 py-2 text-[0.625rem]"
              >
                {formatDay(g.day)}
              </Eyebrow>
              {g.items.map((t) => (
                <LedgerRow
                  key={t.id}
                  tx={t}
                  flashed={flashed?.id === t.id ? flashed : null}
                  time={showsTime(g.day) ? formatEnteredTime(t.entered_at) : null}
                  categoryName={nameOf(t.category_id)}
                  containerName={showContainer ? containerNameOf(t.container_id) : ""}
                  toContainerName={containerNameOf(t.to_container_id)}
                  onEdit={() => setEditing(t)}
                  onDelete={() => del(t)}
                  onSaveShortcut={() => saveShortcut(t)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <EditTransactionSheet
        editing={editing}
        categories={categories}
        containers={containers}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={async (op) => {
          await dispatch(op);
          setEditing(null);
        }}
        onDelete={del}
      />
    </div>
  );
}

function LedgerRow({
  tx,
  flashed,
  time,
  categoryName,
  containerName,
  toContainerName,
  onEdit,
  onDelete,
  onSaveShortcut,
}: {
  tx: Transaction;
  /** Set while this row is the one being pointed at (§12.5). */
  flashed: FlashedRow | null;
  time: string | null;
  categoryName: string;
  containerName: string;
  toContainerName: string;
  onEdit: () => void;
  onDelete: () => void;
  onSaveShortcut: () => void;
}) {
  const transfer = isTransfer(tx);
  const row = useRef<HTMLDivElement>(null);
  const bringIntoView = flashed?.scroll ?? false;

  // Only a row found through the ⌘K palette scrolls: a row you just logged is
  // already at the top of the register, and yanking the page to centre it would
  // be motion in place of an answer. `scroll-behavior` is zeroed globally under
  // `prefers-reduced-motion` (§12.5), so this obeys that with no special case.
  useEffect(() => {
    if (bringIntoView)
      row.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [bringIntoView]);
  // Money in is emerald; a transfer is your own money moving, so it stays quiet.
  const income = !transfer && tx.amount >= 0;
  const sub = [
    transfer
      ? [containerName || "Transfer", toContainerName].filter(Boolean).join(" → ")
      : [categoryName, containerName].filter(Boolean).join(" · "),
    time,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={row}
      className={cn(
        "group flex items-center gap-3 px-5 py-3 transition-colors ease-[var(--ease-register)]",
        // The end of §12.5's one orchestrated moment: the row lands carrying a
        // single iris wash, which then settles. Everywhere else on this row,
        // motion is a colour under the pointer.
        flashed
          ? "bg-primary/15 duration-[var(--dur-2)]"
          : "hover:bg-muted/40 duration-[var(--dur-1)]",
      )}
    >
      {transfer ? (
        <ArrowRightIcon className="text-muted-foreground size-2.5 shrink-0" aria-hidden />
      ) : (
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: tx.category_id
              ? categoryDotColor(tx.category_id)
              : undefined,
          }}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{tx.vendor_source}</div>
        <div className="text-muted-foreground truncate text-xs">{sub}</div>
      </div>
      <Money
        cents={tx.amount}
        absolute={transfer}
        tone={transfer ? "quiet" : income ? "in" : "neutral"}
        className="text-sm tracking-tight"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label="Transaction actions"
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSaveShortcut}>
            <BookmarkIcon className="size-4" />
            Save as shortcut
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
