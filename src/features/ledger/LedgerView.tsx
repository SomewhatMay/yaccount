"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import {
  categoriesAtom,
  containersAtom,
  defaultContainerIdAtom,
  dispatchAtom,
  readyAtom,
  transactionsAtom,
} from "@/features/store";
import { unvoidTransaction, voidTransaction } from "@/core/commands";
import { isLiveLedgerRow, isTransfer, overallBalance } from "@/core/engine/balances";
import { activeRows } from "@/core/engine/ledger";
import { formatCents } from "@/core/money";
import type { Transaction } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import { ComposeBar } from "@/features/ledger/ComposeBar";
import { EditTransactionSheet } from "@/features/ledger/EditTransactionSheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const thisMonth = (): string => new Date().toISOString().slice(0, 7);

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDay(iso: string): string {
  const t = new Date();
  const todayIso = t.toISOString().slice(0, 10);
  const y = new Date(t.getTime() - 86400000).toISOString().slice(0, 10);
  if (iso === todayIso) return "Today";
  if (iso === y) return "Yesterday";
  return dayFormat.format(new Date(iso + "T00:00:00"));
}

export function LedgerView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const transactions = useAtomValue(transactionsAtom);
  const defaultContainerId = useAtomValue(defaultContainerIdAtom);
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
    const ym = thisMonth();
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
    const rows = activeRows(transactions).sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1,
    );
    const out: { day: string; items: Transaction[] }[] = [];
    for (const t of rows) {
      const last = out[out.length - 1];
      if (last && last.day === t.date) last.items.push(t);
      else out.push({ day: t.date, items: [t] });
    }
    return out;
  }, [transactions]);

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

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="pt-3 pb-1">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
          Overall balance
        </p>
        <p
          className={cn(
            "font-display tnum mt-1 text-5xl leading-none sm:text-6xl",
            balance < 0 && "text-destructive",
          )}
        >
          {formatCents(balance)}
        </p>
        <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-foreground/70 font-medium">This month</span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowDownLeftIcon className="text-positive size-4" />
            <span className="tnum text-foreground font-mono">{formatCents(monthIn)}</span>
            in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpRightIcon className="size-4" />
            <span className="tnum text-foreground font-mono">
              {formatCents(monthOut)}
            </span>
            out
          </span>
          {uncounted > 0 && (
            <span className="text-muted-foreground/80">
              {uncounted} container{uncounted === 1 ? "" : "s"} not counted
            </span>
          )}
        </div>
      </section>

      <ComposeBar
        categories={categories}
        containers={containers}
        defaultContainerId={defaultContainerId}
        onSubmit={async (op) => {
          await dispatch(op);
        }}
      />

      <div className="bg-card overflow-hidden rounded-2xl border">
        {groups.length === 0 ? (
          <div className="text-muted-foreground px-5 py-14 text-center text-sm">
            Nothing logged yet. Add your first entry above.
          </div>
        ) : (
          groups.map((g, gi) => (
            <div key={g.day} className={cn(gi > 0 && "border-t")}>
              <div className="text-muted-foreground bg-muted/30 px-5 py-1.5 text-xs font-medium">
                {formatDay(g.day)}
              </div>
              {g.items.map((t) => (
                <LedgerRow
                  key={t.id}
                  tx={t}
                  categoryName={nameOf(t.category_id)}
                  containerName={showContainer ? containerNameOf(t.container_id) : ""}
                  toContainerName={containerNameOf(t.to_container_id)}
                  onEdit={() => setEditing(t)}
                  onDelete={() => del(t)}
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
  categoryName,
  containerName,
  toContainerName,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  categoryName: string;
  containerName: string;
  toContainerName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const transfer = isTransfer(tx);
  // Money in is emerald; a transfer is your own money moving, so it stays quiet.
  const income = !transfer && tx.amount >= 0;
  const sub = transfer
    ? [containerName || "Transfer", toContainerName].filter(Boolean).join(" → ")
    : [categoryName, containerName].filter(Boolean).join(" · ");

  return (
    <div className="group hover:bg-muted/40 flex items-center gap-3 px-5 py-3 transition-colors">
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
      <div
        className={cn(
          "tnum font-mono text-sm tracking-tight",
          income && "text-positive",
          transfer && "text-muted-foreground",
        )}
      >
        {transfer ? formatCents(Math.abs(tx.amount)) : formatCents(tx.amount)}
      </div>
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
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
